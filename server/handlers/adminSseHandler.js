// ═══════════════════════════════════════════════════════════════
// server/handlers/adminSseHandler.js — Admin SSE Channel (Phase 48)
// ═══════════════════════════════════════════════════════════════
// Self-authenticated SSE for admin events.
// Token via X-Admin-Token header OR ?token= / ?_token= query param.
// Subscribed events:
//   - abuse_flag:snooze_expiring (Phase 47)
//   - abuse_flag:snooze_expired (Phase 47)
//   - abuse_flag:detected_high_severity (Phase 48 NEW)
//   - direct_offer:abuse_threshold_crossed (Phase 48 NEW — reserved for Phase 49+)
//   - counters:auto_rebuild_triggered (Phase 48 NEW)
// In-memory connection map per admin, lazy event listener registration.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from '../services/eventBus.js';
import { formatSSE } from '../services/sseManager.js';
import { logger } from '../services/logger.js';

/** @type {Map<string, Set<{ res: any, connectedAt: number }>>} */
const adminConnections = new Map();

const SUBSCRIBED_EVENTS = [
  'abuse_flag:snooze_expiring',
  'abuse_flag:snooze_expired',
  'abuse_flag:detected_high_severity',
  'direct_offer:abuse_threshold_crossed',
  'counters:auto_rebuild_triggered',
  'csv_export:progress', // Phase 49 — streaming CSV export progress
];

let listenersRegistered = false;

/**
 * Lazy register EventBus listeners on first admin connection.
 * Idempotent — guarded by listenersRegistered flag.
 */
function registerEventListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  for (const eventName of SUBSCRIBED_EVENTS) {
    eventBus.on(eventName, (data) => broadcastToAdmins(eventName, data));
  }
  logger.info('Admin SSE: event listeners registered', { count: SUBSCRIBED_EVENTS.length });
}

/**
 * Broadcast an event to all connected admins.
 * Fire-and-forget per connection — write errors silently ignored.
 *
 * @param {string} eventType
 * @param {*} data
 */
function broadcastToAdmins(eventType, data) {
  const eventId = `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const msg = formatSSE(eventType, data, eventId);
  for (const [, conns] of adminConnections) {
    for (const entry of conns) {
      try {
        if (!entry.res.writableEnded && !entry.res.destroyed) {
          entry.res.write(msg);
        }
      } catch (_) { /* ignore write errors */ }
    }
  }
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/admin/events
 * Self-authenticated SSE endpoint for admin events.
 * Auth: X-Admin-Token header OR ?token= / ?_token= query param.
 */
export async function handleAdminEventStream(req, res) {
  // ── Auth ──
  let adminToken = req.headers['x-admin-token'];
  if (!adminToken && req.query) {
    adminToken = req.query.token || req.query._token;
  }

  const isValidAdmin =
    (adminToken && adminToken === process.env.ADMIN_TOKEN) ||
    (req.user && req.user.role === 'admin');

  if (!isValidAdmin) {
    return sendJSON(res, 401, { error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' });
  }

  const adminId = (req.user && req.user.id) || 'admin_token';

  // ── Lazy register listeners on first connection ──
  registerEventListeners();

  // ── Write SSE headers ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (req.socket) req.socket.setTimeout(0);

  // ── Suggest retry interval ──
  const retryMs = (config.SSE && config.SSE.reconnectMs) || 5000;
  res.write(`retry: ${retryMs}\n\n`);

  // ── Send init event ──
  res.write(formatSSE(
    'init',
    { adminId, subscribedEvents: SUBSCRIBED_EVENTS },
    'adm-init-' + Date.now()
  ));

  // ── Register connection ──
  if (!adminConnections.has(adminId)) {
    adminConnections.set(adminId, new Set());
  }
  const entry = { res, connectedAt: Date.now() };
  adminConnections.get(adminId).add(entry);

  // Phase 49 — Per-connection heartbeat.
  // Keeps admin SSE alive behind load balancers with ~60s idle timeout.
  const heartbeatTimer = setInterval(() => {
    try {
      if (!entry.res.writableEnded && !entry.res.destroyed) {
        entry.res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeatTimer);
      }
    } catch (_) {
      clearInterval(heartbeatTimer);
    }
  }, 30000);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  // ── Cleanup on close ──
  res.on('close', () => {
    clearInterval(heartbeatTimer);
    const conns = adminConnections.get(adminId);
    if (conns) {
      conns.delete(entry);
      if (conns.size === 0) adminConnections.delete(adminId);
    }
  });
}

/**
 * Get aggregate admin connection stats.
 * @returns {{ admins: number, totalConnections: number }}
 */
export function getAdminConnectionStats() {
  let total = 0;
  for (const [, conns] of adminConnections) total += conns.size;
  return { admins: adminConnections.size, totalConnections: total };
}

// Test helpers
export const _testHelpers = {
  adminConnections,
  SUBSCRIBED_EVENTS,
  broadcastToAdmins,
  resetState: () => {
    adminConnections.clear();
    listenersRegistered = false;
  },
};
