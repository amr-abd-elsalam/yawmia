// ═══════════════════════════════════════════════════════════════
// server/services/directOfferCounters.js — Rolling Counter File (Phase 45 + Phase 46)
// ═══════════════════════════════════════════════════════════════
// Pre-aggregated direct offer counters in single file.
// Updated incrementally on every direct_offer:* event.
// Single-writer pattern via withLock('direct-offer-counters').
// Replaces O(n) listAllOffers with O(1) counter file reads.
//
// Phase 46 enhancements:
//   - Event batching (applyEventBatched + flushBatch + forceFlush)
//   - Per-entity hourlyBuckets (lazy migration)
//   - Replay queue during rebuild
//   - getFileSize for monitoring
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import config from '../../config.js';
import { atomicWrite, readJSON, getCollectionPath, listJSON } from './database.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const COUNTER_LOCK_KEY = 'direct-offer-counters';

// ── Phase 46 — Event Batching State ─────────────────────────
let eventQueue = [];
let flushTimer = null;
let isFlushing = false;

// ── Phase 46 — Replay Queue State ───────────────────────────
let _rebuildInProgress = false;
const _replayQueue = [];

/**
 * Get the absolute path to the counter file.
 * @returns {string}
 */
function getCounterFilePath() {
  const relPath = (config.COUNTERS && config.COUNTERS.filePath) || 'metrics/direct-offer-counters.json';
  return join(BASE_PATH, relPath);
}

/**
 * Build empty counter structure.
 * @returns {object}
 */
function emptyCounters() {
  return {
    version: 1,
    lastUpdatedAt: null,
    lastRebuildAt: null,
    platform: {
      total: 0,
      pending: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      withdrawn: 0,
      totalResponseMs: 0,
      responseCount: 0,
      declineReasons: {},
    },
    aging: {
      totalTimeToFirstViewMs: 0,
      viewCount: 0,
      totalTimeToDecisionMs: 0,
      decisionCount: 0,
      decisionTimes: [],
    },
    byEmployer: {},
    byWorker: {},
    hourlyBuckets: {},
  };
}

/**
 * Get hourly bucket key (YYYY-MM-DDTHH) in UTC.
 * @param {string|Date} ts
 * @returns {string}
 */
function getHourKey(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toISOString().slice(0, 13);
}

/**
 * Read counter file. Returns empty structure on missing/corrupt.
 * @returns {Promise<object>}
 */
export async function readCounters() {
  try {
    const data = await readJSON(getCounterFilePath());
    if (!data || typeof data !== 'object') return emptyCounters();
    // Ensure all required fields exist (forward-compatible)
    const empty = emptyCounters();
    return {
      ...empty,
      ...data,
      platform: { ...empty.platform, ...(data.platform || {}) },
      aging: { ...empty.aging, ...(data.aging || {}) },
      byEmployer: data.byEmployer || {},
      byWorker: data.byWorker || {},
      hourlyBuckets: data.hourlyBuckets || {},
    };
  } catch (err) {
    logger.warn('directOfferCounters: readCounters failed, returning empty', { error: err.message });
    return emptyCounters();
  }
}

/**
 * Cleanup old hourly buckets (older than retention).
 * Phase 46: extends to per-entity buckets (byEmployer/byWorker).
 * @param {object} counters
 */
function cleanupOldBuckets(counters) {
  const retentionHours = (config.COUNTERS && config.COUNTERS.hourlyBucketsRetentionHours) || 48;
  const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;

  // Platform-level buckets
  for (const key of Object.keys(counters.hourlyBuckets || {})) {
    const ts = new Date(key + ':00:00Z').getTime();
    if (ts < cutoff) {
      delete counters.hourlyBuckets[key];
    }
  }

  // Phase 46: Per-entity buckets (byEmployer)
  for (const empId in counters.byEmployer || {}) {
    const e = counters.byEmployer[empId];
    if (!e || !e.hourlyBuckets) continue;
    for (const key of Object.keys(e.hourlyBuckets)) {
      const ts = new Date(key + ':00:00Z').getTime();
      if (ts < cutoff) delete e.hourlyBuckets[key];
    }
  }

  // Phase 46: Per-entity buckets (byWorker)
  for (const wid in counters.byWorker || {}) {
    const w = counters.byWorker[wid];
    if (!w || !w.hourlyBuckets) continue;
    for (const key of Object.keys(w.hourlyBuckets)) {
      const ts = new Date(key + ':00:00Z').getTime();
      if (ts < cutoff) delete w.hourlyBuckets[key];
    }
  }
}

/**
 * Phase 46: Pure helper — apply event to counters object in-place.
 * Extracted from Phase 45 applyEvent body.
 * No I/O, no withLock, no atomicWrite (caller handles those).
 *
 * @param {object} counters — full counter object (mutated)
 * @param {string} eventType
 * @param {object} data
 * @param {Date} now
 */
function applyEventToCounters(counters, eventType, data, now) {
  const nowIso = now.toISOString();
  const employerId = data.employerId || null;
  const workerId = data.workerId || null;
  const responseMs = typeof data.responseMs === 'number' && data.responseMs > 0 ? data.responseMs : 0;
  const hourKey = getHourKey(now);
  const maxLen = (config.COUNTERS && config.COUNTERS.maxDecisionTimesArrayLength) || 1000;

  // Initialize per-entity buckets (closures over counters)
  function ensureEmployer(id) {
    if (!counters.byEmployer[id]) {
      counters.byEmployer[id] = {
        total: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0,
        totalResponseMs: 0, responseCount: 0, lastOfferAt: null,
      };
    }
    return counters.byEmployer[id];
  }
  function ensureWorker(id) {
    if (!counters.byWorker[id]) {
      counters.byWorker[id] = {
        total: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0,
        totalResponseMs: 0, responseCount: 0,
      };
    }
    return counters.byWorker[id];
  }
  function ensureBucket(hKey) {
    if (!counters.hourlyBuckets[hKey]) {
      counters.hourlyBuckets[hKey] = {
        created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0,
      };
    }
    return counters.hourlyBuckets[hKey];
  }

  // Phase 46: Per-entity bucket helpers (lazy initialization)
  function ensureEmployerBucket(empId, hKey) {
    const e = counters.byEmployer[empId];
    if (!e) return null;
    if (!e.hourlyBuckets) e.hourlyBuckets = {};
    if (!e.hourlyBuckets[hKey]) {
      e.hourlyBuckets[hKey] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
    }
    return e.hourlyBuckets[hKey];
  }
  function ensureWorkerBucket(wid, hKey) {
    const w = counters.byWorker[wid];
    if (!w) return null;
    if (!w.hourlyBuckets) w.hourlyBuckets = {};
    if (!w.hourlyBuckets[hKey]) {
      w.hourlyBuckets[hKey] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
    }
    return w.hourlyBuckets[hKey];
  }

  const bucket = ensureBucket(hourKey);

  switch (eventType) {
    case 'created': {
      counters.platform.total++;
      counters.platform.pending++;
      bucket.created++;
      if (employerId) {
        const e = ensureEmployer(employerId);
        e.total++;
        e.lastOfferAt = nowIso;
        const eb = ensureEmployerBucket(employerId, hourKey);
        if (eb) eb.created++;
      }
      if (workerId) {
        const w = ensureWorker(workerId);
        w.total++;
        const wb = ensureWorkerBucket(workerId, hourKey);
        if (wb) wb.created++;
      }
      break;
    }

    case 'accepted': {
      counters.platform.accepted++;
      counters.platform.pending = Math.max(0, counters.platform.pending - 1);
      bucket.accepted++;
      if (employerId) {
        const e = ensureEmployer(employerId);
        e.accepted++;
        if (responseMs > 0) {
          e.totalResponseMs += responseMs;
          e.responseCount++;
        }
        const eb = ensureEmployerBucket(employerId, hourKey);
        if (eb) eb.accepted++;
      }
      if (workerId) {
        const w = ensureWorker(workerId);
        w.accepted++;
        if (responseMs > 0) {
          w.totalResponseMs += responseMs;
          w.responseCount++;
        }
        const wb = ensureWorkerBucket(workerId, hourKey);
        if (wb) wb.accepted++;
      }
      if (responseMs > 0) {
        counters.platform.totalResponseMs += responseMs;
        counters.platform.responseCount++;
        counters.aging.totalTimeToDecisionMs += responseMs;
        counters.aging.decisionCount++;
        counters.aging.decisionTimes.push(responseMs);
        while (counters.aging.decisionTimes.length > maxLen) {
          counters.aging.decisionTimes.shift();
        }
      }
      break;
    }

    case 'declined': {
      counters.platform.declined++;
      counters.platform.pending = Math.max(0, counters.platform.pending - 1);
      bucket.declined++;
      if (data.declinedReason) {
        counters.platform.declineReasons[data.declinedReason] =
          (counters.platform.declineReasons[data.declinedReason] || 0) + 1;
      }
      if (employerId) {
        const e = ensureEmployer(employerId);
        e.declined++;
        if (responseMs > 0) {
          e.totalResponseMs += responseMs;
          e.responseCount++;
        }
        const eb = ensureEmployerBucket(employerId, hourKey);
        if (eb) eb.declined++;
      }
      if (workerId) {
        const w = ensureWorker(workerId);
        w.declined++;
        if (responseMs > 0) {
          w.totalResponseMs += responseMs;
          w.responseCount++;
        }
        const wb = ensureWorkerBucket(workerId, hourKey);
        if (wb) wb.declined++;
      }
      if (responseMs > 0) {
        counters.platform.totalResponseMs += responseMs;
        counters.platform.responseCount++;
        counters.aging.totalTimeToDecisionMs += responseMs;
        counters.aging.decisionCount++;
        counters.aging.decisionTimes.push(responseMs);
        while (counters.aging.decisionTimes.length > maxLen) {
          counters.aging.decisionTimes.shift();
        }
      }
      break;
    }

    case 'expired': {
      counters.platform.expired++;
      counters.platform.pending = Math.max(0, counters.platform.pending - 1);
      bucket.expired++;
      if (employerId) {
        const e = ensureEmployer(employerId);
        e.expired++;
        const eb = ensureEmployerBucket(employerId, hourKey);
        if (eb) eb.expired++;
      }
      if (workerId) {
        const w = ensureWorker(workerId);
        w.expired++;
        const wb = ensureWorkerBucket(workerId, hourKey);
        if (wb) wb.expired++;
      }
      break;
    }

    case 'withdrawn': {
      counters.platform.withdrawn++;
      counters.platform.pending = Math.max(0, counters.platform.pending - 1);
      bucket.withdrawn++;
      if (employerId) {
        const e = ensureEmployer(employerId);
        e.withdrawn++;
        const eb = ensureEmployerBucket(employerId, hourKey);
        if (eb) eb.withdrawn++;
      }
      if (workerId) {
        const w = ensureWorker(workerId);
        w.withdrawn++;
        const wb = ensureWorkerBucket(workerId, hourKey);
        if (wb) wb.withdrawn++;
      }
      break;
    }

    case 'viewed': {
      const viewMs = typeof data.viewMs === 'number' && data.viewMs > 0 ? data.viewMs : 0;
      if (viewMs > 0) {
        counters.aging.totalTimeToFirstViewMs += viewMs;
        counters.aging.viewCount++;
      }
      break;
    }

    default:
      return; // unknown event — no-op
  }
}

/**
 * Phase 46: Internal — flush queued events as single batch write.
 * Uses withLock(COUNTER_LOCK_KEY) to serialize with rebuild + other flushes.
 * @internal
 */
async function flushBatch() {
  if (isFlushing) return;
  if (eventQueue.length === 0) return;

  // Clear scheduled timer
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Snapshot + clear queue atomically (synchronous splice)
  const batch = eventQueue.splice(0, eventQueue.length);
  if (batch.length === 0) return;

  isFlushing = true;
  try {
    await withLock(COUNTER_LOCK_KEY, async () => {
      const counters = await readCounters();
      const now = new Date();

      for (const event of batch) {
        try {
          applyEventToCounters(counters, event.type, event.data, now);
        } catch (err) {
          logger.warn('Phase 46: batch event apply failed', {
            eventType: event.type,
            error: err.message,
          });
        }
      }

      counters.lastUpdatedAt = now.toISOString();
      cleanupOldBuckets(counters);

      await atomicWrite(getCounterFilePath(), counters);
    });

    if (batch.length > 1) {
      logger.info('Phase 46: batch flush complete', { batchSize: batch.length });
    }
  } catch (err) {
    // Re-queue events on failure (preserve them for next attempt)
    logger.warn('Phase 46: batch flush failed — re-queueing events', {
      batchSize: batch.length,
      error: err.message,
    });
    eventQueue.unshift(...batch);
    throw err;
  } finally {
    isFlushing = false;
  }
}

/**
 * Phase 46: Batched event apply.
 * Use this from EventBus listeners for high throughput.
 * Synchronous push — flush happens via timer or threshold trigger.
 *
 * Routes to replay queue if rebuild is in progress.
 *
 * @param {string} eventType
 * @param {object} data
 */
export function applyEventBatched(eventType, data) {
  if (!config.COUNTERS || !config.COUNTERS.enabled) return;
  if (!eventType || !data) return;

  // Phase 46: route to replay queue during rebuild
  if (_rebuildInProgress) {
    const maxQueue = (config.COUNTERS && config.COUNTERS.replayQueueMax) || 1000;
    if (_replayQueue.length < maxQueue) {
      _replayQueue.push({ type: eventType, data, timestamp: Date.now() });
    } else {
      logger.warn('Phase 46: replay queue full — dropping event', { eventType });
    }
    return;
  }

  eventQueue.push({ type: eventType, data, timestamp: Date.now() });

  // Flush immediately if queue full
  const maxSize = (config.COUNTERS && config.COUNTERS.batchMaxSize) || 100;
  if (eventQueue.length >= maxSize) {
    flushBatch().catch(err => logger.warn('Phase 46: batch flush (max-size trigger) failed', { error: err.message }));
    return;
  }

  // Schedule flush if not already scheduled
  if (!flushTimer) {
    const interval = (config.COUNTERS && config.COUNTERS.batchFlushIntervalMs) || 1000;
    flushTimer = setTimeout(() => {
      flushBatch().catch(err => logger.warn('Phase 46: batch flush (timer) failed', { error: err.message }));
    }, interval);
    if (flushTimer.unref) flushTimer.unref();
  }
}

/**
 * Phase 46: Force flush all pending events (used by graceful shutdown + tests).
 * Waits for any in-flight flush to complete BEFORE flushing the remaining queue.
 * Loops until both eventQueue is empty AND no flush is in-flight.
 * @returns {Promise<void>}
 */
export async function forceFlush() {
  // Wait up to ~5 seconds total for in-flight flushes + drain queue.
  // Each iteration: wait for current flush, then flush any newly-queued events.
  const maxIterations = 50;
  for (let i = 0; i < maxIterations; i++) {
    // Wait for any in-flight flush to complete
    while (isFlushing) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // If queue empty, we're done
    if (eventQueue.length === 0) return;

    try {
      await flushBatch();
    } catch (err) {
      logger.warn('Phase 46: forceFlush failed', { error: err.message });
      return;
    }
  }
}

/**
 * Phase 46: Get counter file size in bytes.
 * Returns 0 on error (file missing or inaccessible).
 *
 * @returns {Promise<number>}
 */
export async function getFileSize() {
  try {
    const stats = await stat(getCounterFilePath());
    return stats.size;
  } catch (_) {
    return 0;
  }
}

/**
 * Apply event to counters. Phase 45 backward-compat — single-event sync apply.
 * Phase 46: now delegates to batch path internally.
 * Tests + edge cases can call this for synchronous "fire + flush" semantics.
 *
 * Fire-and-forget safe — caller catches errors.
 *
 * @param {string} eventType
 * @param {object} data
 */
export async function applyEvent(eventType, data) {
  if (!config.COUNTERS || !config.COUNTERS.enabled) return;
  if (!eventType || !data) return;

  // Phase 46: delegate to batch + force flush for synchronous verification
  applyEventBatched(eventType, data);
  await flushBatch();
}

/**
 * Compute platform funnel from counters.
 * @param {{ from?: string, to?: string }} options — date range filter (uses hourlyBuckets)
 * @returns {Promise<object>}
 */
export async function getPlatformFunnel(options = {}) {
  const counters = await readCounters();
  const { from, to } = options;

  // No date filter → return platform totals directly
  if (!from && !to) {
    const p = counters.platform;
    const decided = p.accepted + p.declined + p.expired;
    return {
      sent: p.total,
      pending: p.pending,
      accepted: p.accepted,
      declined: p.declined,
      expired: p.expired,
      withdrawn: p.withdrawn,
      acceptRate: decided > 0 ? Math.round((p.accepted / decided) * 100) : 0,
      declineRate: decided > 0 ? Math.round((p.declined / decided) * 100) : 0,
      expireRate: decided > 0 ? Math.round((p.expired / decided) * 100) : 0,
    };
  }

  // Date range filter → aggregate hourlyBuckets
  let created = 0, accepted = 0, declined = 0, expired = 0, withdrawn = 0;
  for (const [hourKey, bucket] of Object.entries(counters.hourlyBuckets)) {
    const bucketIso = hourKey + ':00:00.000Z';
    if (from && bucketIso < from) continue;
    if (to && bucketIso > to) continue;
    created += bucket.created || 0;
    accepted += bucket.accepted || 0;
    declined += bucket.declined || 0;
    expired += bucket.expired || 0;
    withdrawn += bucket.withdrawn || 0;
  }
  const decided = accepted + declined + expired;
  return {
    sent: created,
    pending: 0, // pending is point-in-time, not date-rangeable from buckets
    accepted,
    declined,
    expired,
    withdrawn,
    acceptRate: decided > 0 ? Math.round((accepted / decided) * 100) : 0,
    declineRate: decided > 0 ? Math.round((declined / decided) * 100) : 0,
    expireRate: decided > 0 ? Math.round((expired / decided) * 100) : 0,
  };
}

/**
 * Phase 46: Compute top employers from lifetime totals (Phase 45 path).
 * Internal helper — extracted from Phase 45 getTopEmployers body.
 */
async function computeTopEmployersFromLifetime(counters, { limit = 10, minOffers = 3 }) {
  const { findById } = await import('./users.js');
  const rows = [];

  for (const [empId, stats] of Object.entries(counters.byEmployer)) {
    if (stats.total < minOffers) continue;
    const decided = stats.accepted + stats.declined + stats.expired;
    const rate = decided > 0 ? stats.accepted / decided : 0;

    let name = empId;
    try {
      const u = await findById(empId);
      if (u && u.name) name = u.name;
      else if (u && u.phone) name = u.phone;
    } catch (_) { /* fallback */ }

    rows.push({
      employerId: empId,
      name,
      total: stats.total,
      accepted: stats.accepted,
      acceptRate: Math.round(rate * 100),
    });
  }

  rows.sort((a, b) => b.acceptRate - a.acceptRate || b.total - a.total);
  return rows.slice(0, limit);
}

/**
 * Phase 46: Compute top workers from lifetime totals (Phase 45 path).
 * Internal helper — extracted from Phase 45 getTopWorkers body.
 */
async function computeTopWorkersFromLifetime(counters, { limit = 10, minOffers = 3 }) {
  const { findById } = await import('./users.js');
  const rows = [];

  for (const [wid, stats] of Object.entries(counters.byWorker)) {
    if (stats.total < minOffers) continue;
    const decided = stats.accepted + stats.declined + stats.expired;
    const rate = decided > 0 ? stats.accepted / decided : 0;
    const avgResponseSec = stats.responseCount > 0
      ? Math.round((stats.totalResponseMs / stats.responseCount) / 1000)
      : 0;

    let name = wid;
    try {
      const u = await findById(wid);
      if (u && u.name) name = u.name;
      else if (u && u.phone) name = u.phone;
    } catch (_) { /* fallback */ }

    rows.push({
      workerId: wid,
      name,
      total: stats.total,
      accepted: stats.accepted,
      acceptRate: Math.round(rate * 100),
      avgResponseSec,
    });
  }

  rows.sort((a, b) => b.acceptRate - a.acceptRate || a.avgResponseSec - b.avgResponseSec);
  return rows.slice(0, limit);
}

/**
 * Get top employers by acceptance rate.
 * Phase 46: supports optional date-range filter via per-entity hourlyBuckets.
 *
 * @param {{ limit?: number, minOffers?: number, from?: string, to?: string }} options
 * @returns {Promise<Array<{ employerId, name, total, accepted, acceptRate }>>}
 */
export async function getTopEmployers(options = {}) {
  const { from, to, limit = 10, minOffers = 3 } = options;
  const counters = await readCounters();

  if (!from && !to) {
    return computeTopEmployersFromLifetime(counters, { limit, minOffers });
  }

  // Phase 46: date-range path — aggregate from per-entity hourlyBuckets
  const { findById } = await import('./users.js');
  const rows = [];

  for (const [empId, stats] of Object.entries(counters.byEmployer || {})) {
    if (!stats.hourlyBuckets) continue;

    let total = 0, accepted = 0, declined = 0, expired = 0;
    for (const [hourKey, bucket] of Object.entries(stats.hourlyBuckets)) {
      const bucketIso = hourKey + ':00:00.000Z';
      if (from && bucketIso < from) continue;
      if (to && bucketIso > to) continue;
      total += bucket.created || 0;
      accepted += bucket.accepted || 0;
      declined += bucket.declined || 0;
      expired += bucket.expired || 0;
    }

    if (total < minOffers) continue;

    const decided = accepted + declined + expired;
    const rate = decided > 0 ? accepted / decided : 0;

    let name = empId;
    try {
      const u = await findById(empId);
      if (u && u.name) name = u.name;
      else if (u && u.phone) name = u.phone;
    } catch (_) { /* fallback */ }

    rows.push({
      employerId: empId,
      name,
      total,
      accepted,
      acceptRate: Math.round(rate * 100),
    });
  }

  rows.sort((a, b) => b.acceptRate - a.acceptRate || b.total - a.total);
  return rows.slice(0, limit);
}

/**
 * Get top workers by acceptance rate.
 * Phase 46: supports optional date-range filter via per-entity hourlyBuckets.
 *
 * @param {{ limit?: number, minOffers?: number, from?: string, to?: string }} options
 * @returns {Promise<Array<{ workerId, name, total, accepted, acceptRate, avgResponseSec }>>}
 */
export async function getTopWorkers(options = {}) {
  const { from, to, limit = 10, minOffers = 3 } = options;
  const counters = await readCounters();

  if (!from && !to) {
    return computeTopWorkersFromLifetime(counters, { limit, minOffers });
  }

  // Phase 46: date-range path — aggregate from per-entity hourlyBuckets
  // Note: avgResponseSec is approximated from lifetime stats since per-bucket
  // response times are not tracked. Acceptable: response time is slow-moving metric.
  const { findById } = await import('./users.js');
  const rows = [];

  for (const [wid, stats] of Object.entries(counters.byWorker || {})) {
    if (!stats.hourlyBuckets) continue;

    let total = 0, accepted = 0, declined = 0, expired = 0;
    for (const [hourKey, bucket] of Object.entries(stats.hourlyBuckets)) {
      const bucketIso = hourKey + ':00:00.000Z';
      if (from && bucketIso < from) continue;
      if (to && bucketIso > to) continue;
      total += bucket.created || 0;
      accepted += bucket.accepted || 0;
      declined += bucket.declined || 0;
      expired += bucket.expired || 0;
    }

    if (total < minOffers) continue;

    const decided = accepted + declined + expired;
    const rate = decided > 0 ? accepted / decided : 0;
    const avgResponseSec = stats.responseCount > 0
      ? Math.round((stats.totalResponseMs / stats.responseCount) / 1000)
      : 0;

    let name = wid;
    try {
      const u = await findById(wid);
      if (u && u.name) name = u.name;
      else if (u && u.phone) name = u.phone;
    } catch (_) { /* fallback */ }

    rows.push({
      workerId: wid,
      name,
      total,
      accepted,
      acceptRate: Math.round(rate * 100),
      avgResponseSec,
    });
  }

  rows.sort((a, b) => b.acceptRate - a.acceptRate || a.avgResponseSec - b.avgResponseSec);
  return rows.slice(0, limit);
}

/**
 * Compute aging stats (avg + p50 + p95).
 * @returns {Promise<{ avgTimeToFirstViewSec, avgTimeToDecisionSec, p50DecisionSec, p95DecisionSec }>}
 */
export async function getAgingStats() {
  const counters = await readCounters();
  const a = counters.aging;

  const avgTimeToFirstViewSec = a.viewCount > 0
    ? Math.round((a.totalTimeToFirstViewMs / a.viewCount) / 1000)
    : 0;
  const avgTimeToDecisionSec = a.decisionCount > 0
    ? Math.round((a.totalTimeToDecisionMs / a.decisionCount) / 1000)
    : 0;

  let p50DecisionSec = 0;
  let p95DecisionSec = 0;
  if (a.decisionTimes && a.decisionTimes.length > 0) {
    const sorted = a.decisionTimes.slice().sort((x, y) => x - y);
    const p50Idx = Math.floor(sorted.length * 0.5);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    p50DecisionSec = Math.round(sorted[p50Idx] / 1000);
    p95DecisionSec = Math.round(sorted[p95Idx] / 1000);
  }

  return {
    avgTimeToFirstViewSec,
    avgTimeToDecisionSec,
    p50DecisionSec,
    p95DecisionSec,
  };
}

/**
 * Disaster recovery — full scan + rebuild from raw offers.
 * Locked via withLock.
 *
 * Phase 46: integrates replay queue — events fired during rebuild are queued
 * and replayed after rebuild completes. Zero event loss guarantee (capped by
 * config.COUNTERS.replayQueueMax = 1000 events).
 *
 * Skips if last rebuild was within minRebuildIntervalMs (prevents thrashing).
 *
 * @returns {Promise<{ offerCount, employerCount, workerCount, durationMs, skipped? }>}
 */
export async function rebuildCounters() {
  if (!config.COUNTERS || !config.COUNTERS.enabled) {
    return { offerCount: 0, employerCount: 0, workerCount: 0, durationMs: 0, skipped: true };
  }

  return withLock(COUNTER_LOCK_KEY, async () => {
    const startTs = Date.now();

    // Pre-check: skip if last rebuild was very recent
    try {
      const existing = await readCounters();
      if (existing.lastRebuildAt) {
        const sinceLast = Date.now() - new Date(existing.lastRebuildAt).getTime();
        const minInterval = (config.COUNTERS && config.COUNTERS.minRebuildIntervalMs) || (23 * 60 * 60 * 1000);
        if (sinceLast < minInterval) {
          logger.info('directOfferCounters: rebuild skipped — last rebuild too recent', {
            sinceLastMs: sinceLast,
          });
          return {
            offerCount: existing.platform.total,
            employerCount: Object.keys(existing.byEmployer).length,
            workerCount: Object.keys(existing.byWorker).length,
            durationMs: 0,
            skipped: true,
          };
        }
      }
    } catch (_) { /* proceed with rebuild */ }

    // Phase 46: enable replay queue
    _rebuildInProgress = true;
    _replayQueue.length = 0;

    logger.warn('directOfferCounters: starting rebuild — Phase 46 replay queue active');

    try {
      // Full scan of raw offers
      let offers;
      try {
        const dir = getCollectionPath('direct_offers');
        offers = await listJSON(dir);
      } catch (err) {
        logger.error('directOfferCounters: rebuild failed to read offers', { error: err.message });
        throw err;
      }

      offers = offers.filter(o => o && o.id && o.id.startsWith('dof_'));

      const counters = emptyCounters();
      const retentionHours = (config.COUNTERS && config.COUNTERS.hourlyBucketsRetentionHours) || 48;
      const cutoffMs = Date.now() - retentionHours * 60 * 60 * 1000;
      const maxLen = (config.COUNTERS && config.COUNTERS.maxDecisionTimesArrayLength) || 1000;

      for (const o of offers) {
        const employerId = o.employerId;
        const workerId = o.workerId;

        // Initialize per-entity buckets
        if (employerId && !counters.byEmployer[employerId]) {
          counters.byEmployer[employerId] = {
            total: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0,
            totalResponseMs: 0, responseCount: 0, lastOfferAt: null,
            hourlyBuckets: {},  // Phase 46
          };
        }
        if (workerId && !counters.byWorker[workerId]) {
          counters.byWorker[workerId] = {
            total: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0,
            totalResponseMs: 0, responseCount: 0,
            hourlyBuckets: {},  // Phase 46
          };
        }

        counters.platform.total++;

        if (employerId) {
          if (!counters.byEmployer[employerId].lastOfferAt ||
              o.createdAt > counters.byEmployer[employerId].lastOfferAt) {
            counters.byEmployer[employerId].lastOfferAt = o.createdAt;
          }
          counters.byEmployer[employerId].total++;
        }
        if (workerId) {
          counters.byWorker[workerId].total++;
        }

        // Hourly bucket — only within retention window
        const createdMs = new Date(o.createdAt).getTime();
        if (createdMs >= cutoffMs) {
          const hourKey = getHourKey(o.createdAt);
          if (!counters.hourlyBuckets[hourKey]) {
            counters.hourlyBuckets[hourKey] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
          }
          counters.hourlyBuckets[hourKey].created++;

          // Phase 46: per-entity buckets
          if (employerId) {
            const e = counters.byEmployer[employerId];
            if (!e.hourlyBuckets[hourKey]) {
              e.hourlyBuckets[hourKey] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
            }
            e.hourlyBuckets[hourKey].created++;
          }
          if (workerId) {
            const w = counters.byWorker[workerId];
            if (!w.hourlyBuckets[hourKey]) {
              w.hourlyBuckets[hourKey] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
            }
            w.hourlyBuckets[hourKey].created++;
          }
        }

        // Status-based aggregation
        switch (o.status) {
          case 'pending':
            counters.platform.pending++;
            break;
          case 'accepted': {
            counters.platform.accepted++;
            if (employerId) counters.byEmployer[employerId].accepted++;
            if (workerId) counters.byWorker[workerId].accepted++;
            if (createdMs >= cutoffMs) {
              const k = getHourKey(o.acceptedAt || o.createdAt);
              if (!counters.hourlyBuckets[k]) counters.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
              counters.hourlyBuckets[k].accepted++;

              // Phase 46: per-entity
              if (employerId) {
                const e = counters.byEmployer[employerId];
                if (!e.hourlyBuckets[k]) e.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                e.hourlyBuckets[k].accepted++;
              }
              if (workerId) {
                const w = counters.byWorker[workerId];
                if (!w.hourlyBuckets[k]) w.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                w.hourlyBuckets[k].accepted++;
              }
            }
            if (o.acceptedAt && o.createdAt) {
              const responseMs = new Date(o.acceptedAt).getTime() - new Date(o.createdAt).getTime();
              if (responseMs > 0) {
                counters.platform.totalResponseMs += responseMs;
                counters.platform.responseCount++;
                if (employerId) {
                  counters.byEmployer[employerId].totalResponseMs += responseMs;
                  counters.byEmployer[employerId].responseCount++;
                }
                if (workerId) {
                  counters.byWorker[workerId].totalResponseMs += responseMs;
                  counters.byWorker[workerId].responseCount++;
                }
                counters.aging.totalTimeToDecisionMs += responseMs;
                counters.aging.decisionCount++;
                counters.aging.decisionTimes.push(responseMs);
              }
            }
            break;
          }
          case 'declined': {
            counters.platform.declined++;
            if (employerId) counters.byEmployer[employerId].declined++;
            if (workerId) counters.byWorker[workerId].declined++;
            if (o.declinedReason) {
              counters.platform.declineReasons[o.declinedReason] =
                (counters.platform.declineReasons[o.declinedReason] || 0) + 1;
            }
            if (createdMs >= cutoffMs) {
              const k = getHourKey(o.declinedAt || o.createdAt);
              if (!counters.hourlyBuckets[k]) counters.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
              counters.hourlyBuckets[k].declined++;

              // Phase 46: per-entity
              if (employerId) {
                const e = counters.byEmployer[employerId];
                if (!e.hourlyBuckets[k]) e.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                e.hourlyBuckets[k].declined++;
              }
              if (workerId) {
                const w = counters.byWorker[workerId];
                if (!w.hourlyBuckets[k]) w.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                w.hourlyBuckets[k].declined++;
              }
            }
            if (o.declinedAt && o.createdAt) {
              const responseMs = new Date(o.declinedAt).getTime() - new Date(o.createdAt).getTime();
              if (responseMs > 0) {
                counters.platform.totalResponseMs += responseMs;
                counters.platform.responseCount++;
                if (employerId) {
                  counters.byEmployer[employerId].totalResponseMs += responseMs;
                  counters.byEmployer[employerId].responseCount++;
                }
                if (workerId) {
                  counters.byWorker[workerId].totalResponseMs += responseMs;
                  counters.byWorker[workerId].responseCount++;
                }
                counters.aging.totalTimeToDecisionMs += responseMs;
                counters.aging.decisionCount++;
                counters.aging.decisionTimes.push(responseMs);
              }
            }
            break;
          }
          case 'expired': {
            counters.platform.expired++;
            if (employerId) counters.byEmployer[employerId].expired++;
            if (workerId) counters.byWorker[workerId].expired++;
            if (createdMs >= cutoffMs) {
              const k = getHourKey(o.expiredAt || o.createdAt);
              if (!counters.hourlyBuckets[k]) counters.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
              counters.hourlyBuckets[k].expired++;

              // Phase 46: per-entity
              if (employerId) {
                const e = counters.byEmployer[employerId];
                if (!e.hourlyBuckets[k]) e.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                e.hourlyBuckets[k].expired++;
              }
              if (workerId) {
                const w = counters.byWorker[workerId];
                if (!w.hourlyBuckets[k]) w.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                w.hourlyBuckets[k].expired++;
              }
            }
            break;
          }
          case 'withdrawn': {
            counters.platform.withdrawn++;
            if (employerId) counters.byEmployer[employerId].withdrawn++;
            if (workerId) counters.byWorker[workerId].withdrawn++;
            if (createdMs >= cutoffMs) {
              const k = getHourKey(o.withdrawnAt || o.createdAt);
              if (!counters.hourlyBuckets[k]) counters.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
              counters.hourlyBuckets[k].withdrawn++;

              // Phase 46: per-entity
              if (employerId) {
                const e = counters.byEmployer[employerId];
                if (!e.hourlyBuckets[k]) e.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                e.hourlyBuckets[k].withdrawn++;
              }
              if (workerId) {
                const w = counters.byWorker[workerId];
                if (!w.hourlyBuckets[k]) w.hourlyBuckets[k] = { created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 };
                w.hourlyBuckets[k].withdrawn++;
              }
            }
            break;
          }
        }

        // Aging — viewedAt
        if (o.viewedAt && o.createdAt) {
          const viewMs = new Date(o.viewedAt).getTime() - new Date(o.createdAt).getTime();
          if (viewMs > 0) {
            counters.aging.totalTimeToFirstViewMs += viewMs;
            counters.aging.viewCount++;
          }
        }
      }

      // Trim decisionTimes to maxLen (keep most recent)
      if (counters.aging.decisionTimes.length > maxLen) {
        counters.aging.decisionTimes = counters.aging.decisionTimes.slice(-maxLen);
      }

      counters.lastUpdatedAt = new Date().toISOString();
      counters.lastRebuildAt = counters.lastUpdatedAt;

      await atomicWrite(getCounterFilePath(), counters);

      const durationMs = Date.now() - startTs;
      const result = {
        offerCount: counters.platform.total,
        employerCount: Object.keys(counters.byEmployer).length,
        workerCount: Object.keys(counters.byWorker).length,
        durationMs,
      };

      logger.info('directOfferCounters: rebuild complete', result);
      return result;
    } finally {
      // Phase 46: clear flag + replay queued events
      _rebuildInProgress = false;

      if (_replayQueue.length > 0) {
        const queuedCount = _replayQueue.length;
        logger.info(`Phase 46: replaying ${queuedCount} events post-rebuild`);
        const queued = _replayQueue.splice(0, _replayQueue.length);

        // Re-route through batch path (will fall through normal path since flag is now false)
        for (const event of queued) {
          try {
            applyEventBatched(event.type, event.data);
          } catch (err) {
            logger.warn('Phase 46: replay event failed', { eventType: event.type, error: err.message });
          }
        }

        // Trigger immediate flush of replayed events
        try {
          await flushBatch();
        } catch (err) {
          logger.warn('Phase 46: replay flush failed', { error: err.message });
        }
      }
    }
  });
}

/**
 * Phase 48: Check counter file size and trigger auto-rebuild if critical.
 * Called by monitor.captureSnapshot.
 * Fire-and-forget — won't block monitor.
 * Reuses Phase 46 _rebuildInProgress flag (single source of truth — prevents double-trigger).
 *
 * @param {object} snapshot — monitor snapshot with counterFileSizeMB
 */
export async function maybeTriggerAutoRebuild(snapshot) {
  if (!config.COUNTERS || !config.COUNTERS.enabled) return;
  if (_rebuildInProgress) return; // Already running — Phase 46 flag

  const sizeMB = (snapshot && typeof snapshot.counterFileSizeMB === 'number')
    ? snapshot.counterFileSizeMB
    : 0;
  const thresholds = config.MONITORING && config.MONITORING.thresholds && config.MONITORING.thresholds.counterFileSizeMB;
  const criticalThreshold = (thresholds && thresholds.critical) || 70;

  if (sizeMB >= criticalThreshold) {
    logger.warn('Counter file exceeded critical size — triggering auto-rebuild', {
      sizeMB,
      threshold: criticalThreshold,
    });

    eventBus.emit('counters:auto_rebuild_triggered', {
      sizeMB,
      threshold: criticalThreshold,
      triggeredAt: new Date().toISOString(),
    });

    // Fire-and-forget rebuild (won't block monitor)
    rebuildCounters().catch(err => {
      logger.error('Auto-rebuild failed', { error: err.message });
    });
  }
}

// Test helpers (Phase 45 + Phase 46)
export const _testHelpers = {
  emptyCounters,
  getHourKey,
  getCounterFilePath,
  cleanupOldBuckets,
  applyEventToCounters,
  computeTopEmployersFromLifetime,
  computeTopWorkersFromLifetime,
  COUNTER_LOCK_KEY,
  // Phase 46 — internal state for testing
  getEventQueueSize: () => eventQueue.length,
  getReplayQueueSize: () => _replayQueue.length,
  isRebuildInProgress: () => _rebuildInProgress,
  isFlushingNow: () => isFlushing,
  clearEventQueue: () => { eventQueue.length = 0; },
  clearReplayQueue: () => { _replayQueue.length = 0; },
  clearFlushTimer: () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  },
};
