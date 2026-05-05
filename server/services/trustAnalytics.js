// ═══════════════════════════════════════════════════════════════
// server/services/trustAnalytics.js — Marketplace Trust Analytics (Phase 49)
// ═══════════════════════════════════════════════════════════════
// Admin-only aggregation service.
// Sources:
//   - abuseFlagReview states (Phase 45 + 47)
//   - directOfferCounters snapshots (Phase 46) for offer-volume context
//
// Cache:
//   - module-local Map cache (same pattern as directOfferAnalytics.js)
//   - 5-min TTL by default
//   - invalidated by abuse_flag:state_changed via cacheDebouncer.debouncedClear
//
// Privacy:
//   - admin-only endpoints consume this service
//   - no phone/name leakage; per-admin productivity returns adminId only
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';
import { debouncedClear } from './cacheDebouncer.js';

// ── Module-local cache ───────────────────────────────────────
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
  const ttl = (config.TRUST_ANALYTICS && config.TRUST_ANALYTICS.cacheTtlMs) || 300000;
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

export function clearTrustAnalyticsCache() {
  cache.clear();
}

// ── Helpers ─────────────────────────────────────────────────

function inDateRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] || 0;
}

function avg(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function toEgyptDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const egyptMs = d.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(egyptDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLastReview(state) {
  if (!state || !Array.isArray(state.reviews) || state.reviews.length === 0) return null;
  return state.reviews[state.reviews.length - 1];
}

function getResolutionMs(state) {
  if (!state || !state.firstSeenAt) return 0;
  const last = getLastReview(state);
  if (!last || !last.createdAt) return 0;
  const ms = new Date(last.createdAt).getTime() - new Date(state.firstSeenAt).getTime();
  return ms > 0 ? ms : 0;
}

async function loadStates() {
  try {
    const { listAllReviewStates } = await import('./abuseFlagReview.js');
    const states = await listAllReviewStates();
    return Array.isArray(states) ? states : [];
  } catch (err) {
    logger.warn('trustAnalytics: failed to load review states', { error: err.message });
    return [];
  }
}

function filterStates(states, options = {}) {
  const { from, to, flagType } = options;
  return states.filter(s => {
    if (!s || !s.fingerprint) return false;
    if (flagType && s.flagType !== flagType) return false;
    const basis = s.firstSeenAt || (getLastReview(s) && getLastReview(s).createdAt);
    return inDateRange(basis, from, to);
  });
}

// ═══════════════════════════════════════════════════════════════
// 1. Average Resolution Time
// ═══════════════════════════════════════════════════════════════

/**
 * Average/p50/p95 resolution time from firstSeenAt → latest review.
 * Resolved states are currentStatus !== active.
 *
 * @param {{ from?: string, to?: string, flagType?: string }} options
 */
export async function getAvgResolutionTime(options = {}) {
  if (!config.TRUST_ANALYTICS || !config.TRUST_ANALYTICS.enabled) {
    return emptyResolution();
  }

  const cacheKey = `resolution:${options.from || 'all'}:${options.to || 'all'}:${options.flagType || 'all'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const states = filterStates(await loadStates(), options);
  const resolved = states.filter(s => s.currentStatus && s.currentStatus !== 'active');

  const times = [];
  const byFlagType = {};

  for (const state of resolved) {
    const ms = getResolutionMs(state);
    if (ms <= 0) continue;

    times.push(ms);

    const type = state.flagType || 'unknown';
    if (!byFlagType[type]) byFlagType[type] = { count: 0, totalMs: 0, avgMs: 0 };
    byFlagType[type].count++;
    byFlagType[type].totalMs += ms;
  }

  for (const type of Object.keys(byFlagType)) {
    byFlagType[type].avgMs = Math.round(byFlagType[type].totalMs / byFlagType[type].count);
  }

  const result = {
    count: times.length,
    avgMs: avg(times),
    p50Ms: percentile(times, 0.5),
    p95Ms: percentile(times, 0.95),
    byFlagType,
  };

  cacheSet(cacheKey, result);
  return result;
}

function emptyResolution() {
  return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, byFlagType: {} };
}

// ═══════════════════════════════════════════════════════════════
// 2. Warning Conversion Rate
// ═══════════════════════════════════════════════════════════════

/**
 * Tracks warning → actioned conversion within configured 30-day window.
 *
 * @param {{ from?: string, to?: string }} options
 */
export async function getWarningConversionRate(options = {}) {
  if (!config.TRUST_ANALYTICS || !config.TRUST_ANALYTICS.enabled) {
    return emptyWarningConversion();
  }

  const cacheKey = `warningConversion:${options.from || 'all'}:${options.to || 'all'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const states = filterStates(await loadStates(), options);
  const windowDays = config.TRUST_ANALYTICS.warningConversionWindowDays || 30;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  let totalWarnings = 0;
  let convertedToBan = 0;
  let sufficient = 0;
  let pendingWindow = 0;

  for (const state of states) {
    const reviews = Array.isArray(state.reviews) ? state.reviews : [];
    const warnings = reviews.filter(r => r.decision === 'warning' && inDateRange(r.createdAt, options.from, options.to));

    for (const warning of warnings) {
      totalWarnings++;
      const warningMs = new Date(warning.createdAt).getTime();

      const actioned = reviews.find(r =>
        r.decision === 'actioned' &&
        new Date(r.createdAt).getTime() > warningMs &&
        new Date(r.createdAt).getTime() <= warningMs + windowMs
      );

      if (actioned) {
        convertedToBan++;
      } else if (Date.now() < warningMs + windowMs) {
        pendingWindow++;
      } else {
        sufficient++;
      }
    }
  }

  const decided = convertedToBan + sufficient;
  const conversionRate = decided > 0 ? Math.round((convertedToBan / decided) * 100) : 0;

  const result = {
    totalWarnings,
    convertedToBan,
    sufficient,
    pendingWindow,
    conversionRate,
    windowDays,
  };

  cacheSet(cacheKey, result);
  return result;
}

function emptyWarningConversion() {
  return {
    totalWarnings: 0,
    convertedToBan: 0,
    sufficient: 0,
    pendingWindow: 0,
    conversionRate: 0,
    windowDays: config.TRUST_ANALYTICS?.warningConversionWindowDays || 30,
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. Per-Admin Productivity
// ═══════════════════════════════════════════════════════════════

/**
 * Groups abuse flag reviews by adminId.
 *
 * @param {{ from?: string, to?: string }} options
 */
export async function getPerAdminProductivity(options = {}) {
  if (!config.TRUST_ANALYTICS || !config.TRUST_ANALYTICS.enabled) return [];

  const cacheKey = `perAdmin:${options.from || 'all'}:${options.to || 'all'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const states = await loadStates();
  const map = new Map();

  for (const state of states) {
    const reviews = Array.isArray(state.reviews) ? state.reviews : [];
    for (const review of reviews) {
      if (!inDateRange(review.createdAt, options.from, options.to)) continue;

      const adminId = review.adminId || 'unknown';
      if (!map.has(adminId)) {
        map.set(adminId, {
          adminId,
          totalReviews: 0,
          byDecision: { dismissed: 0, snoozed: 0, warning: 0, actioned: 0 },
          totalTimeToDecisionMs: 0,
          decisionCount: 0,
          avgTimeToDecisionMs: 0,
        });
      }

      const row = map.get(adminId);
      row.totalReviews++;
      if (row.byDecision[review.decision] !== undefined) {
        row.byDecision[review.decision]++;
      }

      if (state.firstSeenAt && review.createdAt) {
        const ms = new Date(review.createdAt).getTime() - new Date(state.firstSeenAt).getTime();
        if (ms > 0) {
          row.totalTimeToDecisionMs += ms;
          row.decisionCount++;
        }
      }
    }
  }

  const rows = Array.from(map.values()).map(row => ({
    ...row,
    avgTimeToDecisionMs: row.decisionCount > 0
      ? Math.round(row.totalTimeToDecisionMs / row.decisionCount)
      : 0,
  })).sort((a, b) => b.totalReviews - a.totalReviews);

  cacheSet(cacheKey, rows);
  return rows;
}

// ═══════════════════════════════════════════════════════════════
// 4. Abuse Trend
// ═══════════════════════════════════════════════════════════════

/**
 * Daily abuse trend based on abuseFlagReview states.
 * Note: Phase 46 directOfferCounters.hourlyBuckets track direct-offer lifecycle,
 * not abuse flag type/severity. Therefore abuse trend uses review states as source
 * of truth, and optionally attaches directOfferVolume from counters when available.
 *
 * @param {{ from?: string, to?: string }} options
 */
export async function getAbuseTrend(options = {}) {
  if (!config.TRUST_ANALYTICS || !config.TRUST_ANALYTICS.enabled) return [];

  const cacheKey = `abuseTrend:${options.from || 'all'}:${options.to || 'all'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const states = filterStates(await loadStates(), options);
  const byDate = new Map();

  for (const state of states) {
    const date = toEgyptDate(state.firstSeenAt);
    if (!date) continue;

    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        totalDetected: 0,
        byFlagType: {},
        status: { active: 0, snoozed: 0, dismissed: 0, actioned: 0 },
        directOfferVolume: 0,
      });
    }

    const row = byDate.get(date);
    row.totalDetected++;

    const type = state.flagType || 'unknown';
    row.byFlagType[type] = (row.byFlagType[type] || 0) + 1;

    const status = state.currentStatus || 'active';
    if (row.status[status] !== undefined) row.status[status]++;
  }

  // Optional context from Phase 46 counters: direct offer creation volume per day.
  try {
    const counters = await import('./directOfferCounters.js');
    const c = await counters.readCounters();
    for (const [hourKey, bucket] of Object.entries(c.hourlyBuckets || {})) {
      const iso = hourKey + ':00:00.000Z';
      if (!inDateRange(iso, options.from, options.to)) continue;
      const date = toEgyptDate(iso);
      if (!byDate.has(date)) {
        byDate.set(date, {
          date,
          totalDetected: 0,
          byFlagType: {},
          status: { active: 0, snoozed: 0, dismissed: 0, actioned: 0 },
          directOfferVolume: 0,
        });
      }
      byDate.get(date).directOfferVolume += bucket.created || 0;
    }
  } catch (_) {
    // Direct-offer volume is optional context only.
  }

  const result = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  cacheSet(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// 5. Resolution Time Histogram
// ═══════════════════════════════════════════════════════════════

/**
 * Resolution time histogram using configurable buckets.
 *
 * @param {{ from?: string, to?: string, flagType?: string }} options
 */
export async function getResolutionTimeHistogram(options = {}) {
  if (!config.TRUST_ANALYTICS || !config.TRUST_ANALYTICS.enabled) return [];

  const cacheKey = `histogram:${options.from || 'all'}:${options.to || 'all'}:${options.flagType || 'all'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const states = filterStates(await loadStates(), options)
    .filter(s => s.currentStatus && s.currentStatus !== 'active');

  const buckets = (config.TRUST_ANALYTICS.resolutionHistogramBuckets || []).map(b => ({
    bucket: b.label,
    maxMs: b.maxMs,
    count: 0,
    percentage: 0,
  }));

  const times = states.map(getResolutionMs).filter(ms => ms > 0);

  for (const ms of times) {
    const bucket = buckets.find(b => ms <= b.maxMs);
    if (bucket) bucket.count++;
  }

  for (const bucket of buckets) {
    bucket.percentage = times.length > 0 ? Math.round((bucket.count / times.length) * 100) : 0;
  }

  const result = buckets.map(({ bucket, count, percentage }) => ({ bucket, count, percentage }));
  cacheSet(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Dashboard Aggregator
// ═══════════════════════════════════════════════════════════════

export async function getTrustDashboard(options = {}) {
  const [avgResolution, warningConversion, perAdmin, abuseTrend, histogram] = await Promise.all([
    getAvgResolutionTime(options),
    getWarningConversionRate(options),
    getPerAdminProductivity(options),
    getAbuseTrend(options),
    getResolutionTimeHistogram(options),
  ]);

  return { avgResolution, warningConversion, perAdmin, abuseTrend, histogram };
}

// ═══════════════════════════════════════════════════════════════
// Cache Invalidation Listener
// ═══════════════════════════════════════════════════════════════

eventBus.on('abuse_flag:state_changed', () => {
  debouncedClear('trustAnalytics:all', () => {
    clearTrustAnalyticsCache();
  });
});

// Test helpers
export const _testHelpers = {
  cache,
  clearTrustAnalyticsCache,
  inDateRange,
  toEgyptDate,
  getResolutionMs,
};
