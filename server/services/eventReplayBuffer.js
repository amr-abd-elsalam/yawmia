// ═══════════════════════════════════════════════════════════════
// server/services/eventReplayBuffer.js — SSE Event Replay Buffer
// ═══════════════════════════════════════════════════════════════
// In-memory ring buffer per user. Stores last N events with TTL.
// On reconnect with last-event-id, replays missed events.
// Memory estimate: 100 events × ~500 bytes × N users ≈ 50KB per user.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/** @type {Map<string, Array<{ id: string, event: string, data: *, timestamp: number }>>} */
const buffers = new Map();

/**
 * Check if replay buffer is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return !!(config.SSE_REPLAY && config.SSE_REPLAY.enabled);
}

/**
 * Add an event to the user's replay buffer.
 * Evicts oldest if over maxEventsPerUser.
 * No-op if disabled or eventId is falsy.
 *
 * @param {string} userId
 * @param {string} eventId — unique event identifier (e.g. ntf_xxx)
 * @param {string} eventType — SSE event name (e.g. 'notification')
 * @param {*} data — JSON-serializable payload
 */
export function addEvent(userId, eventId, eventType, data) {
  if (!isEnabled()) return;
  if (!userId || !eventId) return;

  if (!buffers.has(userId)) {
    buffers.set(userId, []);
  }

  const buffer = buffers.get(userId);
  const maxEvents = config.SSE_REPLAY.maxEventsPerUser;

  buffer.push({
    id: eventId,
    event: eventType,
    data,
    timestamp: Date.now(),
  });

  // Evict oldest if over limit
  while (buffer.length > maxEvents) {
    buffer.shift();
  }
}

/**
 * Get events after the given lastEventId for a user.
 * Returns empty array if:
 *   - disabled
 *   - lastEventId is null/undefined (fresh connection — no replay)
 *   - lastEventId not found in buffer (too old or unknown)
 *   - no buffered events
 *
 * @param {string} userId
 * @param {string|null} lastEventId
 * @returns {Array<{ id: string, event: string, data: * }>}
 */
export function getEventsSince(userId, lastEventId) {
  if (!isEnabled()) return [];
  if (!userId || !lastEventId) return [];

  const buffer = buffers.get(userId);
  if (!buffer || buffer.length === 0) return [];

  // Find the index of lastEventId
  const idx = buffer.findIndex(e => e.id === lastEventId);
  if (idx === -1) return []; // ID not found — too old or unknown

  // Return events AFTER the found index
  return buffer.slice(idx + 1).map(e => ({
    id: e.id,
    event: e.event,
    data: e.data,
  }));
}

/**
 * Remove events older than maxEventAgeMs.
 * Remove users with empty buffers.
 */
export function cleanup() {
  if (!isEnabled()) return;

  const maxAge = config.SSE_REPLAY.maxEventAgeMs;
  const cutoff = Date.now() - maxAge;

  for (const [userId, buffer] of buffers) {
    // Remove old events from the beginning (they're in chronological order)
    while (buffer.length > 0 && buffer[0].timestamp < cutoff) {
      buffer.shift();
    }
    // Remove user entry if buffer is empty
    if (buffer.length === 0) {
      buffers.delete(userId);
    }
  }
}

/**
 * Get buffer statistics.
 * @returns {{ totalUsers: number, totalEvents: number }}
 */
export function getStats() {
  let totalEvents = 0;
  for (const [, buffer] of buffers) {
    totalEvents += buffer.length;
  }
  return { totalUsers: buffers.size, totalEvents };
}

/**
 * Clear all buffers (for testing).
 */
export function clear() {
  buffers.clear();
}

// ── Cleanup Timer (unref'd — doesn't prevent process exit) ───
const cleanupIntervalMs = (config.SSE_REPLAY && config.SSE_REPLAY.cleanupIntervalMs) || 600000;
if (isEnabled()) {
  const cleanupTimer = setInterval(cleanup, cleanupIntervalMs);
  if (cleanupTimer.unref) cleanupTimer.unref();
}
