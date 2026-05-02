// ═══════════════════════════════════════════════════════════════
// server/services/directOfferCounters.js — Rolling Counter File (Phase 45)
// ═══════════════════════════════════════════════════════════════
// Pre-aggregated direct offer counters in single file.
// Updated incrementally on every direct_offer:* event.
// Single-writer pattern via withLock('direct-offer-counters').
// Replaces O(n) listAllOffers with O(1) counter file reads.
//
// ⚠️ Throughput note (Phase 45):
//   At >10 events/sec, the single-writer lock becomes a bottleneck.
//   Phase 45 expected scale: 1-10 events/sec — acceptable.
//   Phase 46+ may introduce event batching or sharded counter files.
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import config from '../../config.js';
import { atomicWrite, readJSON, getCollectionPath, listJSON } from './database.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const COUNTER_LOCK_KEY = 'direct-offer-counters';

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
 * @param {object} counters
 */
function cleanupOldBuckets(counters) {
  const retentionHours = (config.COUNTERS && config.COUNTERS.hourlyBucketsRetentionHours) || 48;
  const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
  for (const key of Object.keys(counters.hourlyBuckets)) {
    const ts = new Date(key + ':00:00Z').getTime();
    if (ts < cutoff) {
      delete counters.hourlyBuckets[key];
    }
  }
}

/**
 * Apply event to counters. Single-writer via withLock.
 * Fire-and-forget safe — caller catches errors.
 *
 * @param {string} eventType — 'created' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'viewed'
 * @param {object} data — { employerId, workerId, declinedReason?, responseMs?, viewMs?, createdAt? }
 */
export async function applyEvent(eventType, data) {
  if (!config.COUNTERS || !config.COUNTERS.enabled) return;
  if (!eventType || !data) return;

  return withLock(COUNTER_LOCK_KEY, async () => {
    const counters = await readCounters();
    const now = new Date();
    const nowIso = now.toISOString();

    const employerId = data.employerId || null;
    const workerId = data.workerId || null;
    const responseMs = typeof data.responseMs === 'number' && data.responseMs > 0 ? data.responseMs : 0;

    // Initialize per-entity buckets
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
    function ensureBucket(hourKey) {
      if (!counters.hourlyBuckets[hourKey]) {
        counters.hourlyBuckets[hourKey] = {
          created: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0,
        };
      }
      return counters.hourlyBuckets[hourKey];
    }

    const hourKey = getHourKey(now);
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
        }
        if (workerId) {
          const w = ensureWorker(workerId);
          w.total++;
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
        }
        if (workerId) {
          const w = ensureWorker(workerId);
          w.accepted++;
          if (responseMs > 0) {
            w.totalResponseMs += responseMs;
            w.responseCount++;
          }
        }
        if (responseMs > 0) {
          counters.platform.totalResponseMs += responseMs;
          counters.platform.responseCount++;
          // Aging — decision time tracking
          counters.aging.totalTimeToDecisionMs += responseMs;
          counters.aging.decisionCount++;
          counters.aging.decisionTimes.push(responseMs);
          const maxLen = (config.COUNTERS && config.COUNTERS.maxDecisionTimesArrayLength) || 1000;
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
        }
        if (workerId) {
          const w = ensureWorker(workerId);
          w.declined++;
          if (responseMs > 0) {
            w.totalResponseMs += responseMs;
            w.responseCount++;
          }
        }
        if (responseMs > 0) {
          counters.platform.totalResponseMs += responseMs;
          counters.platform.responseCount++;
          counters.aging.totalTimeToDecisionMs += responseMs;
          counters.aging.decisionCount++;
          counters.aging.decisionTimes.push(responseMs);
          const maxLen = (config.COUNTERS && config.COUNTERS.maxDecisionTimesArrayLength) || 1000;
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
        }
        if (workerId) {
          const w = ensureWorker(workerId);
          w.expired++;
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
        }
        if (workerId) {
          const w = ensureWorker(workerId);
          w.withdrawn++;
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

    counters.lastUpdatedAt = nowIso;
    cleanupOldBuckets(counters);

    await atomicWrite(getCounterFilePath(), counters);
  });
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
 * Get top employers by acceptance rate.
 * Date-range filtering NOT supported in Phase 45 (would require per-employer hourly buckets).
 *
 * @param {{ limit?: number, minOffers?: number }} options
 * @returns {Promise<Array<{ employerId, name, total, accepted, acceptRate }>>}
 */
export async function getTopEmployers(options = {}) {
  const { limit = 10, minOffers = 3 } = options;
  const counters = await readCounters();

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
 * Get top workers by acceptance rate.
 * @param {{ limit?: number, minOffers?: number }} options
 * @returns {Promise<Array<{ workerId, name, total, accepted, acceptRate, avgResponseSec }>>}
 */
export async function getTopWorkers(options = {}) {
  const { limit = 10, minOffers = 3 } = options;
  const counters = await readCounters();

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

    logger.warn('directOfferCounters: starting rebuild — events emitted during rebuild may be lost (will be reflected on next rebuild)');

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
        };
      }
      if (workerId && !counters.byWorker[workerId]) {
        counters.byWorker[workerId] = {
          total: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0,
          totalResponseMs: 0, responseCount: 0,
        };
      }

      counters.platform.total++;

      // Mark lastOfferAt as max createdAt
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
  });
}

// Test helpers
export const _testHelpers = {
  emptyCounters,
  getHourKey,
  getCounterFilePath,
  cleanupOldBuckets,
  COUNTER_LOCK_KEY,
};
