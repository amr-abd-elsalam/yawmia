// ═══════════════════════════════════════════════════════════════
// server/services/cache.js — In-Memory Read Cache (TTL-based)
// ═══════════════════════════════════════════════════════════════
// Map-based cache with per-entry TTL, invalidation, prefix invalidation.
// Config-driven via config.CACHE — disabled mode = all ops are no-ops.
// Used by database.js to reduce filesystem I/O on hot paths.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/** @type {Map<string, { value: *, expiresAt: number }>} */
const store = new Map();

/** @type {{ hits: number, misses: number }} */
const counters = { hits: 0, misses: 0 };

/**
 * Check if cache is enabled via config
 * @returns {boolean}
 */
function isEnabled() {
  return !!(config.CACHE && config.CACHE.enabled);
}

/**
 * Get a cached value by key.
 * Returns undefined on miss or if cache is disabled.
 * @param {string} key
 * @returns {*} cached value or undefined
 */
export function get(key) {
  if (!isEnabled()) {
    counters.misses++;
    return undefined;
  }

  const entry = store.get(key);
  if (!entry) {
    counters.misses++;
    return undefined;
  }

  // Check TTL expiry
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    counters.misses++;
    return undefined;
  }

  counters.hits++;
  return entry.value;
}

/**
 * Store a value in cache with TTL.
 * No-op if cache is disabled.
 * @param {string} key
 * @param {*} value — the value to cache (should be JSON-serializable)
 * @param {number} [ttlMs] — TTL in milliseconds (defaults to config.CACHE.defaultTtlMs)
 */
export function set(key, value, ttlMs) {
  if (!isEnabled()) return;

  const ttl = ttlMs || config.CACHE.defaultTtlMs;
  const expiresAt = Date.now() + ttl;

  // Soft limit enforcement — evict oldest if over maxEntries
  if (store.size >= config.CACHE.maxEntries) {
    // Delete first entry (oldest insertion order in Map)
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) {
      store.delete(firstKey);
    }
  }

  store.set(key, { value, expiresAt });
}

/**
 * Invalidate (remove) a specific cache key.
 * No-op if cache is disabled.
 * @param {string} key
 */
export function invalidate(key) {
  if (!isEnabled()) return;
  store.delete(key);
}

/**
 * Invalidate all cache keys starting with the given prefix.
 * No-op if cache is disabled.
 * @param {string} prefix
 */
export function invalidatePrefix(prefix) {
  if (!isEnabled()) return;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Get cache statistics.
 * @returns {{ hits: number, misses: number, size: number, hitRate: string }}
 */
export function stats() {
  const total = counters.hits + counters.misses;
  const hitRate = total > 0
    ? Math.round((counters.hits / total) * 100) + '%'
    : '0%';

  return {
    hits: counters.hits,
    misses: counters.misses,
    size: store.size,
    hitRate,
  };
}

/**
 * Clear all cache entries and reset counters.
 * Used for testing.
 */
export function clear() {
  store.clear();
  counters.hits = 0;
  counters.misses = 0;
}

/**
 * Remove expired entries from cache.
 * Called by cleanup timer.
 */
function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(key);
    }
  }
}

// ── Cleanup Timer (unref'd — doesn't prevent process exit) ───
const cleanupIntervalMs = (config.CACHE && config.CACHE.cleanupIntervalMs) || 300000;
const cleanupTimer = setInterval(cleanupExpired, cleanupIntervalMs);
if (cleanupTimer.unref) cleanupTimer.unref();
