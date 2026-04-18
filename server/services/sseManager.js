// ═══════════════════════════════════════════════════════════════
// server/services/sseManager.js — SSE Connection Manager
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

/**
 * In-memory SSE connection registry
 * Map<userId, Set<{ res, connectedAt, lastEventId }>>
 */
const connections = new Map();

/**
 * Format data as SSE message
 * @param {string} event — event name
 * @param {*} data — JSON-serializable data
 * @param {string} [id] — optional event ID
 * @returns {string}
 */
export function formatSSE(event, data, id) {
  let msg = '';
  if (id) msg += `id: ${id}\n`;
  msg += `event: ${event}\n`;
  msg += `data: ${JSON.stringify(data)}\n\n`;
  return msg;
}

/**
 * Register an SSE connection for a user
 * Enforces maxConnectionsPerUser — evicts oldest on overflow
 * @param {string} userId
 * @param {import('node:http').ServerResponse} res
 * @param {string} [lastEventId]
 */
export function addConnection(userId, res, lastEventId) {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }

  const userConns = connections.get(userId);
  const entry = { res, connectedAt: Date.now(), lastEventId: lastEventId || null };

  // Enforce max connections per user — evict oldest
  const maxConns = config.SSE.maxConnectionsPerUser;
  if (userConns.size >= maxConns) {
    // Find oldest
    let oldest = null;
    for (const conn of userConns) {
      if (!oldest || conn.connectedAt < oldest.connectedAt) {
        oldest = conn;
      }
    }
    if (oldest) {
      try { oldest.res.end(); } catch (_) { /* ignore */ }
      userConns.delete(oldest);
    }
  }

  userConns.add(entry);

  // Auto-cleanup on client disconnect
  res.on('close', () => {
    userConns.delete(entry);
    if (userConns.size === 0) {
      connections.delete(userId);
    }
  });
}

/**
 * Send SSE event to all connections of a specific user
 * @param {string} userId
 * @param {string} eventType
 * @param {*} data
 * @param {string} [eventId]
 */
export function sendToUser(userId, eventType, data, eventId) {
  const userConns = connections.get(userId);
  if (!userConns || userConns.size === 0) return;

  const msg = formatSSE(eventType, data, eventId);

  for (const conn of userConns) {
    try {
      if (!conn.res.writableEnded && !conn.res.destroyed) {
        conn.res.write(msg);
      }
    } catch (_) {
      // Ignore write errors on dead connections
    }
  }
}

/**
 * Broadcast SSE event to ALL connected users
 * @param {string} eventType
 * @param {*} data
 * @param {string} [eventId]
 */
export function broadcast(eventType, data, eventId) {
  const msg = formatSSE(eventType, data, eventId);

  for (const [, userConns] of connections) {
    for (const conn of userConns) {
      try {
        if (!conn.res.writableEnded && !conn.res.destroyed) {
          conn.res.write(msg);
        }
      } catch (_) {
        // Ignore write errors
      }
    }
  }
}

/**
 * Send heartbeat comment to all connections (keeps connections alive)
 */
export function sendHeartbeat() {
  const comment = `: heartbeat\n\n`;

  for (const [, userConns] of connections) {
    for (const conn of userConns) {
      try {
        if (!conn.res.writableEnded && !conn.res.destroyed) {
          conn.res.write(comment);
        }
      } catch (_) {
        // Ignore write errors
      }
    }
  }
}

/**
 * Get connection stats
 * @returns {{ totalUsers: number, totalConnections: number }}
 */
export function getStats() {
  let totalConnections = 0;
  for (const [, userConns] of connections) {
    totalConnections += userConns.size;
  }
  return { totalUsers: connections.size, totalConnections };
}

/**
 * Disconnect all connections for a user (e.g., on ban)
 * @param {string} userId
 */
export function disconnectUser(userId) {
  const userConns = connections.get(userId);
  if (!userConns) return;

  for (const conn of userConns) {
    try { conn.res.end(); } catch (_) { /* ignore */ }
  }

  connections.delete(userId);
}

/**
 * Remove dead connections (writableEnded or destroyed)
 */
export function cleanupDeadConnections() {
  for (const [userId, userConns] of connections) {
    for (const conn of userConns) {
      if (conn.res.writableEnded || conn.res.destroyed) {
        userConns.delete(conn);
      }
    }
    if (userConns.size === 0) {
      connections.delete(userId);
    }
  }
}

// ── Timers (unref'd — don't prevent process exit) ────────────

let heartbeatTimer = null;
let cleanupTimer = null;

if (config.SSE.enabled) {
  heartbeatTimer = setInterval(() => {
    sendHeartbeat();
  }, config.SSE.heartbeatIntervalMs);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  cleanupTimer = setInterval(() => {
    cleanupDeadConnections();
  }, config.SSE.cleanupIntervalMs);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

// ── Export connections Map for testing ────────────────────────

export const _connections = connections;
