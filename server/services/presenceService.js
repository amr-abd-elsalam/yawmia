// ═══════════════════════════════════════════════════════════════
// server/services/presenceService.js — In-Memory Worker Presence
// ═══════════════════════════════════════════════════════════════
// Map-based presence tracking — NOT persisted (server restart = all offline).
// Workers reconnect within 30s heartbeat. Cleanup timer removes stale entries.
// Multi-tab/multi-device merged via sessionId set.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

/**
 * @typedef {object} PresenceRecord
 * @property {string} userId
 * @property {number} lastHeartbeat — Unix ms
 * @property {{ lat: number, lng: number }|null} currentLocation
 * @property {boolean} acceptingJobs
 * @property {Set<string>} sessionIds — multi-tab tracking
 * @property {number} onlineSince — Unix ms when first went online
 */

/** @type {Map<string, PresenceRecord>} userId → PresenceRecord */
const presenceMap = new Map();

/** @type {Map<string, number>} userId → lastHeartbeat (for rate limiting) */
const lastHeartbeatMs = new Map();

/**
 * Compute status from lastHeartbeat (no in-place mutation).
 * @param {number} lastHeartbeat
 * @returns {'online'|'away'|'offline'}
 */
function computeStatus(lastHeartbeat) {
  if (!config.PRESENCE) return 'offline';
  const now = Date.now();
  const elapsed = now - lastHeartbeat;
  if (elapsed < config.PRESENCE.awayAfterMs) return 'online';
  if (elapsed < config.PRESENCE.offlineAfterMs) return 'away';
  return 'offline';
}

/**
 * Record a heartbeat from a worker.
 * Throttled: rejects if last heartbeat was within rateLimitMs.
 * Multi-tab: merges sessionId into existing set.
 *
 * @param {string} userId
 * @param {{ lat?: number, lng?: number, acceptingJobs?: boolean, sessionId?: string }} payload
 * @returns {{ ok: boolean, status?: string, throttled?: boolean }}
 */
export function recordHeartbeat(userId, payload = {}) {
  if (!config.PRESENCE || !config.PRESENCE.enabled) {
    return { ok: false, throttled: false };
  }
  if (!userId) return { ok: false, throttled: false };

  const now = Date.now();

  // Rate limit check
  const lastTs = lastHeartbeatMs.get(userId);
  if (lastTs && (now - lastTs) < config.PRESENCE.rateLimitMs) {
    const existing = presenceMap.get(userId);
    return {
      ok: true,
      throttled: true,
      status: existing ? computeStatus(existing.lastHeartbeat) : 'online',
    };
  }

  let record = presenceMap.get(userId);

  if (!record) {
    // Soft limit: evict oldest if at capacity (FIFO via insertion order)
    if (presenceMap.size >= config.PRESENCE.maxOnlineWorkers) {
      const firstKey = presenceMap.keys().next().value;
      if (firstKey !== undefined) {
        presenceMap.delete(firstKey);
        lastHeartbeatMs.delete(firstKey);
      }
    }

    record = {
      userId,
      lastHeartbeat: now,
      currentLocation: null,
      acceptingJobs: true,
      sessionIds: new Set(),
      onlineSince: now,
    };
    presenceMap.set(userId, record);
  }

  // Update fields
  record.lastHeartbeat = now;
  if (typeof payload.lat === 'number' && typeof payload.lng === 'number') {
    record.currentLocation = { lat: payload.lat, lng: payload.lng };
  }
  if (typeof payload.acceptingJobs === 'boolean') {
    record.acceptingJobs = payload.acceptingJobs;
  }
  if (payload.sessionId && typeof payload.sessionId === 'string') {
    record.sessionIds.add(payload.sessionId);
  }

  lastHeartbeatMs.set(userId, now);

  return { ok: true, throttled: false, status: computeStatus(now) };
}

/**
 * Get presence record for a user.
 * @param {string} userId
 * @returns {(PresenceRecord & { status: string })|null}
 */
export function getPresence(userId) {
  const record = presenceMap.get(userId);
  if (!record) return null;
  return {
    userId: record.userId,
    lastHeartbeat: record.lastHeartbeat,
    currentLocation: record.currentLocation,
    acceptingJobs: record.acceptingJobs,
    sessionIds: Array.from(record.sessionIds),
    onlineSince: record.onlineSince,
    status: computeStatus(record.lastHeartbeat),
  };
}

/**
 * Get all online workers, optionally filtered.
 * Loads user records on-demand (for category/governorate filtering).
 *
 * @param {{ acceptingJobs?: boolean, includeAway?: boolean, governorate?: string, categories?: string[], lat?: number, lng?: number, radiusKm?: number }} filters
 * @returns {Promise<Array<PresenceRecord & { status: string, user: object }>>}
 */
export async function getOnlineWorkers(filters = {}) {
  if (!config.PRESENCE || !config.PRESENCE.enabled) return [];

  const includeAway = filters.includeAway !== false; // default true
  const candidates = [];

  for (const [userId, record] of presenceMap) {
    const status = computeStatus(record.lastHeartbeat);
    if (status === 'offline') continue;
    if (!includeAway && status !== 'online') continue;
    if (filters.acceptingJobs === true && !record.acceptingJobs) continue;
    candidates.push({ record, status });
  }

  if (candidates.length === 0) return [];

  // Load user records (for category/governorate enrichment + filtering)
  let findUser;
  try {
    const usersMod = await import('./users.js');
    findUser = usersMod.findById;
  } catch (_) {
    return [];
  }

  const results = [];
  for (const { record, status } of candidates) {
    let user;
    try {
      user = await findUser(record.userId);
    } catch (_) {
      user = null;
    }
    if (!user) continue;
    if (user.status !== 'active') continue;
    if (user.role !== 'worker') continue;

    // Governorate filter
    if (filters.governorate && user.governorate !== filters.governorate) continue;

    // Categories filter (worker must have at least one matching category)
    if (filters.categories && Array.isArray(filters.categories) && filters.categories.length > 0) {
      const userCats = user.categories || [];
      const hasMatch = filters.categories.some(c => userCats.includes(c));
      if (!hasMatch) continue;
    }

    // Proximity filter
    if (typeof filters.lat === 'number' && typeof filters.lng === 'number' && typeof filters.radiusKm === 'number') {
      const coords = record.currentLocation ||
        (typeof user.lat === 'number' && typeof user.lng === 'number' ? { lat: user.lat, lng: user.lng } : null);
      if (!coords) continue;
      try {
        const { haversineDistance, resolveCoordinates } = await import('./geo.js');
        const wCoords = coords.lat != null ? coords : resolveCoordinates({ governorate: user.governorate });
        if (!wCoords) continue;
        const dist = haversineDistance(filters.lat, filters.lng, wCoords.lat, wCoords.lng);
        if (dist > filters.radiusKm) continue;
      } catch (_) {
        continue;
      }
    }

    results.push({
      userId: record.userId,
      lastHeartbeat: record.lastHeartbeat,
      currentLocation: record.currentLocation,
      acceptingJobs: record.acceptingJobs,
      onlineSince: record.onlineSince,
      status,
      user,
    });
  }

  return results;
}

/**
 * Count online workers matching filters (faster than getOnlineWorkers).
 * @param {object} filters — same as getOnlineWorkers
 * @returns {Promise<number>}
 */
export async function countOnlineByFilters(filters = {}) {
  const list = await getOnlineWorkers(filters);
  return list.length;
}

/**
 * Remove stale presence entries (lastHeartbeat older than offlineAfterMs).
 * Called by cleanup timer.
 * @returns {number} count removed
 */
export function cleanupStale() {
  if (!config.PRESENCE || !config.PRESENCE.enabled) return 0;
  const now = Date.now();
  const threshold = config.PRESENCE.offlineAfterMs;
  let removed = 0;

  for (const [userId, record] of presenceMap) {
    if (now - record.lastHeartbeat > threshold) {
      presenceMap.delete(userId);
      lastHeartbeatMs.delete(userId);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info('Presence cleanup', { removed, remaining: presenceMap.size });
  }

  return removed;
}

/**
 * Get aggregate presence stats.
 * @returns {{ online: number, away: number, offline: number, total: number }}
 */
export function getStats() {
  let online = 0;
  let away = 0;
  for (const [, record] of presenceMap) {
    const status = computeStatus(record.lastHeartbeat);
    if (status === 'online') online++;
    else if (status === 'away') away++;
  }
  return {
    online,
    away,
    offline: 0, // offline entries are removed; count is implicit
    total: presenceMap.size,
  };
}

/**
 * Clear all presence data (for testing).
 */
export function clearPresence() {
  presenceMap.clear();
  lastHeartbeatMs.clear();
}

/**
 * Manually set presence for a user (testing helper).
 * @param {string} userId
 * @param {Partial<PresenceRecord>} fields
 */
export function _setPresence(userId, fields) {
  const now = Date.now();
  const record = {
    userId,
    lastHeartbeat: fields.lastHeartbeat || now,
    currentLocation: fields.currentLocation || null,
    acceptingJobs: fields.acceptingJobs !== false,
    sessionIds: fields.sessionIds instanceof Set ? fields.sessionIds : new Set(),
    onlineSince: fields.onlineSince || now,
  };
  presenceMap.set(userId, record);
  lastHeartbeatMs.set(userId, record.lastHeartbeat);
}

// ── Cleanup Timer (unref'd — doesn't prevent process exit) ───
if (config.PRESENCE && config.PRESENCE.enabled) {
  const cleanupTimer = setInterval(cleanupStale, config.PRESENCE.cleanupIntervalMs);
  if (cleanupTimer.unref) cleanupTimer.unref();
}
