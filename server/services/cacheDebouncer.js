// ═══════════════════════════════════════════════════════════════
// server/services/cacheDebouncer.js — Cache Invalidation Debouncer (Phase 45)
// ═══════════════════════════════════════════════════════════════
// Wraps cache clear functions with per-key debounce + min interval guard.
// Prevents thundering herd during event bursts.
//
// Behavior:
//   debouncedClear(key, fn):
//     - First call schedules fn() to run after DEBOUNCE_MS
//     - Subsequent calls within DEBOUNCE_MS window are coalesced
//     - After execution, MIN_INTERVAL_MS guards against rapid re-execution
//
// Per-key isolation: different keys debounced independently.
// flushPending(): execute all pending immediately (for shutdown).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

/**
 * @typedef {object} PendingEntry
 * @property {NodeJS.Timeout|null} timeoutId
 * @property {number} lastClearedAt — Unix ms (0 = never cleared)
 * @property {Function|null} clearFn
 */

/** @type {Map<string, PendingEntry>} */
const pendingClears = new Map();

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STALE_ENTRY_AGE_MS = 60 * 60 * 1000;  // 1 hour

/**
 * Get debounce/min-interval from config (with fallback).
 */
function getTimings() {
  return {
    debounceMs: (config.ANALYTICS && config.ANALYTICS.debounceMs) || 10000,
    minIntervalMs: (config.ANALYTICS && config.ANALYTICS.minIntervalMs) || 5000,
  };
}

/**
 * Schedule a debounced cache clear.
 *
 * @param {string} cacheKey — unique identifier (e.g., 'emp:usr_123', 'platform')
 * @param {Function} clearFn — zero-arg function executing the cache clear
 */
export function debouncedClear(cacheKey, clearFn) {
  if (!cacheKey || typeof clearFn !== 'function') return;

  const { debounceMs, minIntervalMs } = getTimings();
  const now = Date.now();
  const existing = pendingClears.get(cacheKey);

  // If already scheduled, do nothing (coalesce)
  if (existing && existing.timeoutId) {
    // Update clearFn (latest wins — typically same function but safe)
    existing.clearFn = clearFn;
    return;
  }

  // Calculate delay: respect min interval since last clear
  const lastClearedAt = existing ? existing.lastClearedAt : 0;
  const sinceLastClear = lastClearedAt > 0 ? now - lastClearedAt : Infinity;
  const delay = sinceLastClear < minIntervalMs ? (minIntervalMs - sinceLastClear) : debounceMs;

  const timeoutId = setTimeout(() => {
    const fn = pendingClears.get(cacheKey)?.clearFn;
    if (!fn) {
      const entry = pendingClears.get(cacheKey);
      if (entry) entry.timeoutId = null;
      return;
    }

    // Phase 46 fix: wrap in Promise.resolve().then().catch().finally()
    // to handle both sync and async errors uniformly. Preserves
    // fire-and-forget contract — caller never awaits this.
    Promise.resolve()
      .then(() => fn())
      .catch(err => {
        logger.warn('cacheDebouncer: clearFn failed (Phase 46 async-safe)', {
          cacheKey,
          error: err && err.message ? err.message : String(err),
        });
      })
      .finally(() => {
        const entry = pendingClears.get(cacheKey);
        if (entry) {
          entry.timeoutId = null;
          entry.lastClearedAt = Date.now();
          // Keep clearFn for potential subsequent scheduling
        }
      });
  }, delay);

  if (timeoutId.unref) timeoutId.unref();

  pendingClears.set(cacheKey, {
    timeoutId,
    lastClearedAt: lastClearedAt,
    clearFn,
  });
}

/**
 * Force immediate execution of all pending clears.
 * Used during graceful shutdown.
 */
export function flushPending() {
  const keys = Array.from(pendingClears.keys());
  for (const key of keys) {
    const entry = pendingClears.get(key);
    if (entry && entry.timeoutId) {
      clearTimeout(entry.timeoutId);
      try {
        if (entry.clearFn) entry.clearFn();
      } catch (err) {
        logger.warn('cacheDebouncer: flushPending clear failed', { cacheKey: key, error: err.message });
      }
      entry.timeoutId = null;
      entry.lastClearedAt = Date.now();
    }
  }
}

/**
 * Cleanup stale entries (no pending timeout + lastClearedAt > 1h ago).
 * Called by hourly timer.
 */
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of pendingClears) {
    if (!entry.timeoutId && entry.lastClearedAt > 0 && (now - entry.lastClearedAt) > STALE_ENTRY_AGE_MS) {
      pendingClears.delete(key);
    }
  }
}

// Hourly cleanup timer (unref'd — doesn't prevent process exit)
const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
if (cleanupTimer.unref) cleanupTimer.unref();

// Test helpers
export const _testHelpers = {
  pendingClears,
  cleanup,
  STALE_ENTRY_AGE_MS,
};
