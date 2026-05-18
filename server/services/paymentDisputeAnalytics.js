// ═══════════════════════════════════════════════════════════════
// server/services/paymentDisputeAnalytics.js — Payment Dispute Analytics V2 (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Admin-only analytics for payment disputes.
// No PII leakage: aggregate by IDs/category/governorate/method/status only.
// No raw disputeReason in dashboard rows by default.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const cache = new Map();

function isEnabled() {
  return !!(config.PAYMENT_DISPUTE_ANALYTICS && config.PAYMENT_DISPUTE_ANALYTICS.enabled);
}

function cacheTtlMs() {
  return config.PAYMENT_DISPUTE_ANALYTICS?.cacheTtlMs || (5 * 60 * 1000);
}

function cacheKey(prefix, options = {}) {
  return `${prefix}:${options.from || 'all'}:${options.to || 'all'}:${options.groupBy || 'all'}`;
}

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
  cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs() });
}

export function clearPaymentDisputeAnalyticsCache() {
  cache.clear();
}

function nowIso() {
  return new Date().toISOString();
}

function inRange(iso, from, to) {
  if (!iso) return true;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function amountBucket(amount) {
  const n = Number(amount) || 0;
  if (n < 500) return '<500';
  if (n < 1000) return '500-999';
  if (n < 2500) return '1000-2499';
  if (n < 5000) return '2500-4999';
  return '5000+';
}

function inc(obj, key, amount = 1) {
  const k = key || 'unknown';
  obj[k] = (obj[k] || 0) + amount;
}

function safeRate(num, den) {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 100);
}

function durationMs(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

async function loadPaymentsAndJobs(options = {}) {
  const { listAll: listPayments } = await import('./payments.js');
  const { findById: findJob } = await import('./jobs.js');

  const payments = await listPayments();
  const rows = [];

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    if (!payment || !payment.id) continue;
    if (!inRange(payment.disputedAt || payment.createdAt, options.from, options.to)) continue;

    let job = null;
    try {
      job = payment.jobId ? await findJob(payment.jobId) : null;
    } catch (_) {
      job = null;
    }

    rows.push({ payment, job });

    if ((i + 1) % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return rows;
}

function emptyAnalytics() {
  return {
    enabled: true,
    generatedAt: nowIso(),
    totals: {
      payments: 0,
      disputes: 0,
      disputeRate: 0,
      openDisputes: 0,
      resolvedDisputes: 0,
      disputedAmount: 0,
      disputedPlatformFeeExposure: 0,
      avgResolutionMs: 0,
      avgResolutionHours: 0,
    },
    byStatus: {},
    byCategory: {},
    byGovernorate: {},
    byMethod: {},
    byAmountBucket: {},
    byEmployer: {},
    byWorker: {},
    topRiskCategories: [],
    topRiskGovernorates: [],
  };
}

/**
 * Main admin analytics.
 */
export async function getPaymentDisputeAnalytics(options = {}) {
  if (!isEnabled()) return { enabled: false };

  const key = cacheKey('payment-disputes', options);
  const cached = cacheGet(key);
  if (cached) return cached;

  const rows = await loadPaymentsAndJobs(options);
  const result = emptyAnalytics();

  let resolutionTotal = 0;
  let resolutionCount = 0;

  const categoryTotals = {};
  const govTotals = {};

  for (const { payment, job } of rows) {
    result.totals.payments++;

    const category = job?.category || 'unknown';
    const governorate = job?.governorate || 'unknown';

    inc(categoryTotals, category);
    inc(govTotals, governorate);

    if (payment.status !== 'disputed' && !payment.disputedAt) continue;

    result.totals.disputes++;
    result.totals.disputedAmount += payment.amount || 0;
    result.totals.disputedPlatformFeeExposure += payment.platformFee || 0;

    inc(result.byStatus, payment.status || 'unknown');
    inc(result.byCategory, category);
    inc(result.byGovernorate, governorate);
    inc(result.byMethod, payment.method || 'unknown');
    inc(result.byAmountBucket, amountBucket(payment.amount || 0));
    inc(result.byEmployer, payment.employerId || 'unknown');

    if (payment.disputedBy) inc(result.byWorker, payment.disputedBy);

    if (payment.status === 'disputed') {
      result.totals.openDisputes++;
    } else if (payment.disputedAt && payment.completedAt) {
      result.totals.resolvedDisputes++;
      const ms = durationMs(payment.disputedAt, payment.completedAt);
      if (ms > 0) {
        resolutionTotal += ms;
        resolutionCount++;
      }
    }
  }

  result.totals.disputeRate = safeRate(result.totals.disputes, result.totals.payments);
  result.totals.avgResolutionMs = resolutionCount > 0 ? Math.round(resolutionTotal / resolutionCount) : 0;
  result.totals.avgResolutionHours = result.totals.avgResolutionMs > 0
    ? Math.round((result.totals.avgResolutionMs / 3600000) * 10) / 10
    : 0;

  result.topRiskCategories = Object.entries(result.byCategory)
    .map(([category, disputes]) => ({
      category,
      disputes,
      totalPayments: categoryTotals[category] || disputes,
      disputeRate: safeRate(disputes, categoryTotals[category] || disputes),
    }))
    .sort((a, b) => b.disputeRate - a.disputeRate || b.disputes - a.disputes)
    .slice(0, 10);

  result.topRiskGovernorates = Object.entries(result.byGovernorate)
    .map(([governorate, disputes]) => ({
      governorate,
      disputes,
      totalPayments: govTotals[governorate] || disputes,
      disputeRate: safeRate(disputes, govTotals[governorate] || disputes),
    }))
    .sort((a, b) => b.disputeRate - a.disputeRate || b.disputes - a.disputes)
    .slice(0, 10);

  cacheSet(key, result);
  return result;
}

/**
 * Daily trend.
 */
export async function getPaymentDisputeTrend(options = {}) {
  if (!isEnabled()) return { enabled: false, trend: [] };

  const key = cacheKey('payment-dispute-trend', options);
  const cached = cacheGet(key);
  if (cached) return cached;

  const rows = await loadPaymentsAndJobs(options);
  const byDay = {};

  for (const { payment } of rows) {
    if (!payment.disputedAt) continue;
    const day = payment.disputedAt.slice(0, 10);
    if (!byDay[day]) {
      byDay[day] = {
        date: day,
        disputes: 0,
        disputedAmount: 0,
        disputedPlatformFeeExposure: 0,
      };
    }
    byDay[day].disputes++;
    byDay[day].disputedAmount += payment.amount || 0;
    byDay[day].disputedPlatformFeeExposure += payment.platformFee || 0;
  }

  const result = {
    enabled: true,
    trend: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
    generatedAt: nowIso(),
  };

  cacheSet(key, result);
  return result;
}

/**
 * Breakdown by requested dimension.
 */
export async function getPaymentDisputeBreakdown(options = {}) {
  if (!isEnabled()) return { enabled: false, breakdown: [] };

  const groupBy = options.groupBy || 'category';
  const analytics = await getPaymentDisputeAnalytics(options);

  const map = {
    category: analytics.byCategory,
    governorate: analytics.byGovernorate,
    method: analytics.byMethod,
    status: analytics.byStatus,
    amountBucket: analytics.byAmountBucket,
    employer: analytics.byEmployer,
    worker: analytics.byWorker,
  };

  const source = map[groupBy] || analytics.byCategory;

  const breakdown = Object.entries(source || {})
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  return {
    enabled: true,
    groupBy,
    breakdown,
    total: breakdown.length,
    generatedAt: nowIso(),
  };
}

/**
 * Rollup wrapper for queue/scheduler.
 */
export async function rollupPaymentDisputeAnalytics(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const analytics = await getPaymentDisputeAnalytics(options);
  const trend = await getPaymentDisputeTrend(options);

  eventBus.emit('payment_dispute_analytics:rollup_completed', {
    disputes: analytics.totals?.disputes || 0,
    disputeRate: analytics.totals?.disputeRate || 0,
    timestamp: nowIso(),
  });

  return {
    ok: true,
    analytics,
    trend: trend.trend || [],
    generatedAt: nowIso(),
  };
}

const LISTENER_FLAG = '__yawmiaPaymentDisputeAnalyticsListenersRegistered';

if (isEnabled() && !globalThis[LISTENER_FLAG]) {
  globalThis[LISTENER_FLAG] = true;

  const clear = () => clearPaymentDisputeAnalyticsCache();

  eventBus.on('payment:created', clear);
  eventBus.on('payment:confirmed', clear);
  eventBus.on('payment:completed', clear);
  eventBus.on('payment:disputed', clear);
}

export const _testHelpers = {
  isEnabled,
  amountBucket,
  safeRate,
  durationMs,
  emptyAnalytics,
  clearPaymentDisputeAnalyticsCache,
};
