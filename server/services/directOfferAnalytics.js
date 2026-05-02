// ═══════════════════════════════════════════════════════════════
// server/services/directOfferAnalytics.js — Platform-Wide Direct Offer Analytics (Phase 44)
// ═══════════════════════════════════════════════════════════════
// On-the-fly aggregation across all employers + workers.
// Module-local cache (5-min TTL) — separate from analytics.js cache.
// All functions return all-zero objects on empty data (no errors).
// Admin-only consumption — bypasses redaction.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { getCollectionPath, listJSON } from './database.js';
import { logger } from './logger.js';
import * as directOfferCounters from './directOfferCounters.js';

// ── Module-local cache ────────────────────────────────────────
/** @type {Map<string, { value: *, expiresAt: number }>} */
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  const ttl = (config.ANALYTICS && config.ANALYTICS.cacheTtlMs) || 300000;
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

/**
 * Clear cache (called by EventBus on direct_offer:* events).
 * Phase 44 — cache coherence after offer state transitions.
 */
export function clearCache() {
  cache.clear();
}

// ── Helpers ──────────────────────────────────────────────────

function inDateRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

/**
 * Read all direct offers (raw, bypassing redaction).
 * Shard-aware via listJSON.
 * @returns {Promise<object[]>}
 */
async function listAllOffers() {
  try {
    const dir = getCollectionPath('direct_offers');
    const all = await listJSON(dir);
    return all.filter(o => o && o.id && o.id.startsWith('dof_'));
  } catch (err) {
    logger.warn('directOfferAnalytics: listAllOffers failed', { error: err.message });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Platform Funnel
// ═══════════════════════════════════════════════════════════════

/**
 * Compute platform-wide offer funnel.
 *
 * @param {{ from?: string, to?: string }} options
 * @returns {Promise<{
 *   sent: number,
 *   pending: number,
 *   accepted: number,
 *   declined: number,
 *   expired: number,
 *   withdrawn: number,
 *   acceptRate: number,
 *   declineRate: number,
 *   expireRate: number
 * }>}
 */
export async function getPlatformOfferFunnel(options = {}) {
  const { from, to } = options;
  const cacheKey = `funnel:${from || 'all'}:${to || 'all'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Phase 45: read from rolling counter file (O(1) instead of O(n))
  let result;
  try {
    result = await directOfferCounters.getPlatformFunnel({ from, to });
  } catch (err) {
    logger.warn('getPlatformOfferFunnel: counter read failed, falling back to full scan', { error: err.message });
    // Fallback to Phase 44 full scan
    const offers = await listAllOffers();
    const filtered = offers.filter(o => inDateRange(o.createdAt, from, to));
    let sent = filtered.length;
    let accepted = 0, declined = 0, expired = 0, withdrawn = 0, pending = 0;
    for (const o of filtered) {
      if (o.status === 'accepted') accepted++;
      else if (o.status === 'declined') declined++;
      else if (o.status === 'expired') expired++;
      else if (o.status === 'withdrawn') withdrawn++;
      else if (o.status === 'pending') pending++;
    }
    const decided = accepted + declined + expired;
    result = {
      sent,
      pending,
      accepted,
      declined,
      expired,
      withdrawn,
      acceptRate: decided > 0 ? Math.round((accepted / decided) * 100) : 0,
      declineRate: decided > 0 ? Math.round((declined / decided) * 100) : 0,
      expireRate: decided > 0 ? Math.round((expired / decided) * 100) : 0,
    };
  }

  cacheSet(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Top Employers by Acceptance
// ═══════════════════════════════════════════════════════════════

/**
 * Compute top employers ranked by acceptance rate.
 * Sorted: acceptRate DESC, then total DESC (volume tiebreaker).
 * Filters out employers with < minOffers (statistical noise prevention).
 *
 * @param {{ from?: string, to?: string, limit?: number, minOffers?: number }} options
 * @returns {Promise<Array<{ employerId, name, total, accepted, acceptRate }>>}
 */
export async function getTopEmployersByAcceptance(options = {}) {
  const { from, to, limit = 10, minOffers = 3 } = options;
  const cacheKey = `topEmp:${from || 'all'}:${to || 'all'}:${limit}:${minOffers}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Phase 45: counter file does not support per-employer date range.
  // If from/to NOT provided → use counter file (fast path).
  // If from/to provided → fall back to listAllOffers (rare admin case).
  if (!from && !to) {
    try {
      const result = await directOfferCounters.getTopEmployers({ limit, minOffers });
      cacheSet(cacheKey, result);
      return result;
    } catch (err) {
      logger.warn('getTopEmployersByAcceptance: counter read failed, falling back', { error: err.message });
      // Fall through to full scan
    }
  }

  // Fallback (date-range filter or counter failure)
  const offers = await listAllOffers();
  const filtered = offers.filter(o => inDateRange(o.createdAt, from, to));

  const byEmployer = new Map();
  for (const o of filtered) {
    if (!byEmployer.has(o.employerId)) {
      byEmployer.set(o.employerId, { total: 0, accepted: 0, declined: 0, expired: 0 });
    }
    const e = byEmployer.get(o.employerId);
    e.total++;
    if (o.status === 'accepted') e.accepted++;
    else if (o.status === 'declined') e.declined++;
    else if (o.status === 'expired') e.expired++;
  }

  const { findById } = await import('./users.js');
  const rows = [];

  for (const [empId, stats] of byEmployer) {
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
  const result = rows.slice(0, limit);
  cacheSet(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Top Workers by Acceptance
// ═══════════════════════════════════════════════════════════════

/**
 * Compute top workers ranked by acceptance rate (with avgResponseSec).
 * Sorted: acceptRate DESC, then avgResponseSec ASC (faster = better tiebreaker).
 *
 * @param {{ from?: string, to?: string, limit?: number, minOffers?: number }} options
 * @returns {Promise<Array<{ workerId, name, total, accepted, acceptRate, avgResponseSec }>>}
 */
export async function getTopWorkersByAcceptance(options = {}) {
  const { from, to, limit = 10, minOffers = 3 } = options;
  const cacheKey = `topWrk:${from || 'all'}:${to || 'all'}:${limit}:${minOffers}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Phase 45: counter file does not support per-worker date range.
  // If from/to NOT provided → use counter file (fast path).
  if (!from && !to) {
    try {
      const result = await directOfferCounters.getTopWorkers({ limit, minOffers });
      cacheSet(cacheKey, result);
      return result;
    } catch (err) {
      logger.warn('getTopWorkersByAcceptance: counter read failed, falling back', { error: err.message });
      // Fall through to full scan
    }
  }

  const offers = await listAllOffers();
  const filtered = offers.filter(o => inDateRange(o.createdAt, from, to));

  // Group by workerId
  const byWorker = new Map();
  for (const o of filtered) {
    if (!byWorker.has(o.workerId)) {
      byWorker.set(o.workerId, {
        total: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        totalResponseMs: 0,
        responseCount: 0,
      });
    }
    const w = byWorker.get(o.workerId);
    w.total++;

    if (o.status === 'accepted') {
      w.accepted++;
      if (o.acceptedAt && o.createdAt) {
        const responseMs = new Date(o.acceptedAt).getTime() - new Date(o.createdAt).getTime();
        if (responseMs > 0) {
          w.totalResponseMs += responseMs;
          w.responseCount++;
        }
      }
    } else if (o.status === 'declined') {
      w.declined++;
      if (o.declinedAt && o.createdAt) {
        const responseMs = new Date(o.declinedAt).getTime() - new Date(o.createdAt).getTime();
        if (responseMs > 0) {
          w.totalResponseMs += responseMs;
          w.responseCount++;
        }
      }
    } else if (o.status === 'expired') {
      w.expired++;
    }
  }

  // Enrich with user names
  const { findById } = await import('./users.js');
  const rows = [];

  for (const [wid, stats] of byWorker) {
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
    } catch (_) { /* fallback to wid */ }

    rows.push({
      workerId: wid,
      name,
      total: stats.total,
      accepted: stats.accepted,
      acceptRate: Math.round(rate * 100),
      avgResponseSec,
    });
  }

  // Sort: acceptRate DESC, then avgResponseSec ASC (faster response tiebreaker)
  rows.sort((a, b) => b.acceptRate - a.acceptRate || a.avgResponseSec - b.avgResponseSec);

  const result = rows.slice(0, limit);
  cacheSet(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Decline Reasons Breakdown
// ═══════════════════════════════════════════════════════════════

/**
 * Aggregate platform-wide decline reasons.
 * 'unspecified' fallback for null/missing reasons.
 *
 * @param {{ from?: string, to?: string }} options
 * @returns {Promise<{
 *   total: number,
 *   breakdown: Array<{ reason: string, count: number, percentage: number }>
 * }>}
 */
export async function getDeclineReasonsBreakdown(options = {}) {
  const { from, to } = options;
  const cacheKey = `declineReasons:${from || 'all'}:${to || 'all'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const offers = await listAllOffers();
  const declined = offers.filter(o =>
    o.status === 'declined' &&
    inDateRange(o.declinedAt || o.createdAt, from, to)
  );

  const reasons = {};
  let total = 0;
  for (const o of declined) {
    const r = o.declinedReason || 'unspecified';
    reasons[r] = (reasons[r] || 0) + 1;
    total++;
  }

  const breakdown = Object.entries(reasons)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const result = { total, breakdown };
  cacheSet(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Stats Snapshot for Monitor (no caching — always fresh)
// ═══════════════════════════════════════════════════════════════

/**
 * Lightweight snapshot for monitor.captureSnapshot.
 * Returns last-hour metrics only. Always fresh — no caching.
 *
 * Why no caching?
 *   - Monitor runs hourly. Cache TTL would be useless.
 *   - Volume is bounded (last hour) so computation is cheap.
 *
 * @returns {Promise<{
 *   activePending: number,
 *   recentAccepted: number,
 *   recentDeclined: number,
 *   recentExpired: number,
 *   acceptRate: number,
 *   avgResponseSec: number
 * }>}
 */
export async function getOfferStatsSnapshot() {
  // Phase 45: read from counter file directly (last hour from hourlyBuckets)
  try {
    const counters = await directOfferCounters.readCounters();
    const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    let recentAccepted = 0, recentDeclined = 0, recentExpired = 0;
    for (const [hourKey, bucket] of Object.entries(counters.hourlyBuckets || {})) {
      const bucketIso = hourKey + ':00:00.000Z';
      if (bucketIso >= hourAgoIso) {
        recentAccepted += bucket.accepted || 0;
        recentDeclined += bucket.declined || 0;
        recentExpired += bucket.expired || 0;
      }
    }

    const activePending = counters.platform.pending || 0;
    const decided = recentAccepted + recentDeclined + recentExpired;

    // Aging-based avgResponseSec from platform aggregate (best-effort approximation)
    const avgResponseSec = counters.platform.responseCount > 0
      ? Math.round((counters.platform.totalResponseMs / counters.platform.responseCount) / 1000)
      : 0;

    return {
      activePending,
      recentAccepted,
      recentDeclined,
      recentExpired,
      acceptRate: decided > 0 ? Math.round((recentAccepted / decided) * 100) : 0,
      avgResponseSec,
    };
  } catch (err) {
    logger.warn('getOfferStatsSnapshot: counter read failed, falling back', { error: err.message });
  }

  // Fallback (Phase 44 full scan)
  const offers = await listAllOffers();
  const hourAgo = Date.now() - 60 * 60 * 1000;
  let activePending = 0;
  let recentAccepted = 0, recentDeclined = 0, recentExpired = 0;
  let recentTotalResponseMs = 0, recentResponseCount = 0;
  for (const o of offers) {
    if (o.status === 'pending') activePending++;
    const updatedMs = new Date(o.updatedAt || o.createdAt).getTime();
    if (updatedMs >= hourAgo) {
      if (o.status === 'accepted') {
        recentAccepted++;
        if (o.acceptedAt && o.createdAt) {
          const ms = new Date(o.acceptedAt).getTime() - new Date(o.createdAt).getTime();
          if (ms > 0) {
            recentTotalResponseMs += ms;
            recentResponseCount++;
          }
        }
      } else if (o.status === 'declined') {
        recentDeclined++;
        if (o.declinedAt && o.createdAt) {
          const ms = new Date(o.declinedAt).getTime() - new Date(o.createdAt).getTime();
          if (ms > 0) {
            recentTotalResponseMs += ms;
            recentResponseCount++;
          }
        }
      } else if (o.status === 'expired') {
        recentExpired++;
      }
    }
  }
  const decided = recentAccepted + recentDeclined + recentExpired;
  return {
    activePending,
    recentAccepted,
    recentDeclined,
    recentExpired,
    acceptRate: decided > 0 ? Math.round((recentAccepted / decided) * 100) : 0,
    avgResponseSec: recentResponseCount > 0
      ? Math.round((recentTotalResponseMs / recentResponseCount) / 1000)
      : 0,
  };
}

// ── Test helpers (exported for unit tests) ───────────────────
export const _testHelpers = { listAllOffers, inDateRange };
