// ═══════════════════════════════════════════════════════════════
// server/services/marketplaceIntelligenceRollups.js — Marketplace Intelligence Rollups (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Unified daily product/marketplace intelligence rollup.
// Storage:
//   data/metrics/product-intelligence/mpi_YYYY-MM-DD.json
//
// Inputs:
//   - search analytics
//   - activation funnel
//   - notification conversion metrics
//   - workroom adoption metrics
//   - payment dispute analytics
//   - direct offer funnel
//   - predictive precision
//   - trust calibration summary
//   - matching quality config/stats
//
// Admin-only consumers.
// No PII.
// Heavy-ish aggregation should be queueable.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const cache = new Map();

function isEnabled() {
  return !!(config.PRODUCT_INTELLIGENCE && config.PRODUCT_INTELLIGENCE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function dayKey(iso = nowIso()) {
  return String(iso).slice(0, 10);
}

function monthKeyFromDay(day) {
  return String(day || dayKey()).slice(0, 7);
}

function rollupId(day) {
  return `mpi_${day}`;
}

function rollupPath(day) {
  return getRecordPath('product_intelligence', rollupId(day));
}

function cacheTtlMs() {
  return config.PRODUCT_INTELLIGENCE?.cacheTtlMs || (5 * 60 * 1000);
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

export function clearMarketplaceIntelligenceCache() {
  cache.clear();
}

function safeTotals(obj) {
  return obj && typeof obj === 'object' ? obj : {};
}

function computeHealthSignals(snapshot) {
  const warnings = [];

  const searchTotals = snapshot.search?.totals || {};
  const searches = searchTotals.searches || 0;
  const zeroResults = searchTotals.zeroResults || 0;
  const zeroRate = searches > 0 ? Math.round((zeroResults / searches) * 100) : 0;

  if (searches >= 10 && zeroRate >= 50) {
    warnings.push({
      source: 'search',
      level: 'warning',
      message: `Zero-result search rate is ${zeroRate}%`,
      metric: 'zeroResultRate',
      value: zeroRate,
    });
  }

  const notificationTotals = snapshot.notificationConversions?.totals || {};
  if ((notificationTotals.clicks || 0) === 0 && searches > 0) {
    warnings.push({
      source: 'notifications',
      level: 'info',
      message: 'No notification action clicks recorded yet',
      metric: 'notificationClicks',
      value: 0,
    });
  }

  const disputes = snapshot.paymentDisputes?.totals || {};
  if ((disputes.disputes || 0) >= (config.PAYMENT_DISPUTE_ANALYTICS?.minSamplesForTrend || 5) && (disputes.disputeRate || 0) >= 20) {
    warnings.push({
      source: 'payments',
      level: 'warning',
      message: `Payment dispute rate is ${disputes.disputeRate}%`,
      metric: 'paymentDisputeRate',
      value: disputes.disputeRate,
    });
  }

  const workroomTotals = snapshot.workroomAdoption?.totals || {};
  if ((workroomTotals.opened || 0) > 0 && (workroomTotals.messageSent || 0) === 0) {
    warnings.push({
      source: 'workrooms',
      level: 'info',
      message: 'Workrooms are opened but messages are not being sent yet',
      metric: 'workroomMessageSent',
      value: 0,
    });
  }

  return {
    zeroResultRate: zeroRate,
    warningCount: warnings.length,
    warnings,
  };
}

async function collectSnapshot(options = {}) {
  const month = options.month || monthKeyFromDay(options.day || dayKey());

  const [
    search,
    zeroResults,
    activation,
    notificationConversions,
    workroomAdoption,
    paymentDisputes,
    directOfferFunnel,
    predictivePrecision,
    matchingQuality,
    trustCalibration,
  ] = await Promise.all([
    import('./searchAnalytics.js')
      .then(m => m.getSearchAnalytics({ month, limit: 20 }))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./searchAnalytics.js')
      .then(m => m.getZeroResultQueries({ month, limit: 20 }))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./activationFunnelMetrics.js')
      .then(m => m.getActivationFunnel({ month }))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./notificationConversionMetrics.js')
      .then(m => m.getNotificationConversionMetrics({ month }))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./workroomAdoptionMetrics.js')
      .then(m => m.getWorkroomAdoptionMetrics({ month }))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./paymentDisputeAnalytics.js')
      .then(m => m.getPaymentDisputeAnalytics(options))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./directOfferAnalytics.js')
      .then(m => m.getPlatformOfferFunnel(options))
      .catch(err => ({ sent: 0, accepted: 0, declined: 0, expired: 0, acceptRate: 0, error: err.message })),

    import('./predictiveSignalRetention.js')
      .then(m => m.getPredictivePrecisionStats(options))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./matchingIntelligence.js')
      .then(m => m.getMatchingIntelligenceStats(options))
      .catch(err => ({ enabled: false, error: err.message })),

    import('./trustCalibration.js')
      .then(m => m.getCalibrationDashboard ? m.getCalibrationDashboard({}) : null)
      .catch(err => ({ enabled: false, error: err.message })),
  ]);

  const snapshot = {
    search,
    zeroResults,
    activation,
    notificationConversions,
    workroomAdoption,
    paymentDisputes,
    directOfferFunnel,
    predictivePrecision,
    matchingQuality,
    trustCalibration: trustCalibration || { enabled: false },
  };

  return {
    ...snapshot,
    health: computeHealthSignals(snapshot),
  };
}

/**
 * Capture and persist a daily marketplace intelligence rollup.
 *
 * @param {{ day?: string, from?: string, to?: string, reason?: string }} options
 */
export async function captureMarketplaceIntelligenceRollup(options = {}) {
  if (!isEnabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  const started = Date.now();
  const day = options.day || dayKey();
  const generatedAt = nowIso();

  const snapshot = await collectSnapshot({
    ...options,
    day,
    month: monthKeyFromDay(day),
  });

  const rollup = {
    id: rollupId(day),
    kind: 'marketplace_intelligence',
    version: 1,
    day,
    generatedAt,
    reason: options.reason || null,
    search: snapshot.search,
    zeroResults: snapshot.zeroResults,
    activation: snapshot.activation,
    notificationConversions: snapshot.notificationConversions,
    workroomAdoption: snapshot.workroomAdoption,
    paymentDisputes: snapshot.paymentDisputes,
    directOfferFunnel: snapshot.directOfferFunnel,
    predictivePrecision: snapshot.predictivePrecision,
    matchingQuality: snapshot.matchingQuality,
    trustCalibration: snapshot.trustCalibration,
    health: snapshot.health,
    durationMs: Date.now() - started,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };

  await atomicWrite(rollupPath(day), rollup);

  clearMarketplaceIntelligenceCache();

  eventBus.emit('marketplace_intelligence:rollup_captured', {
    rollupId: rollup.id,
    day,
    warningCount: rollup.health?.warningCount || 0,
    durationMs: rollup.durationMs,
    timestamp: generatedAt,
  });

  return rollup;
}

/**
 * List persisted rollups newest-first.
 */
export async function listMarketplaceIntelligenceRollups(options = {}) {
  if (!isEnabled()) {
    return { rollups: [], total: 0, limit: 20, offset: 0 };
  }

  const dir = getCollectionPath('product_intelligence');
  let rows = await listJSON(dir);

  rows = rows.filter(r => r && r.id && r.id.startsWith('mpi_'));

  if (options.from) rows = rows.filter(r => r.day >= String(options.from).slice(0, 10));
  if (options.to) rows = rows.filter(r => r.day <= String(options.to).slice(0, 10));

  rows.sort((a, b) => String(b.day).localeCompare(String(a.day)));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    rollups: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Get dashboard from latest persisted rollup, or capture-on-read if missing.
 */
export async function getMarketplaceIntelligenceDashboard(options = {}) {
  if (!isEnabled()) {
    return { enabled: false };
  }

  const key = `dashboard:${options.day || 'latest'}:${options.from || 'all'}:${options.to || 'all'}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let latest = null;

  if (options.day) {
    latest = await readJSON(rollupPath(options.day)).catch(() => null);
  } else {
    const rows = await listMarketplaceIntelligenceRollups({ limit: 1 });
    latest = rows.rollups && rows.rollups[0] ? rows.rollups[0] : null;
  }

  // If no rollup exists yet, capture lightweight current-day rollup synchronously.
  // This is acceptable for admin dashboard and small datasets; heavy scheduled usage
  // should use queue jobs.
  if (!latest) {
    latest = await captureMarketplaceIntelligenceRollup({
      day: options.day || dayKey(),
      from: options.from,
      to: options.to,
      reason: 'dashboard_on_demand',
    });
  }

  const dashboard = {
    enabled: true,
    generatedAt: nowIso(),
    latestRollup: latest,
    summary: {
      searches: latest.search?.totals?.searches || 0,
      zeroResults: latest.search?.totals?.zeroResults || 0,
      zeroResultRate: latest.health?.zeroResultRate || 0,
      profileTaskClicks: latest.activation?.totals?.profileTaskClicked || 0,
      notificationClicks: latest.notificationConversions?.totals?.clicks || 0,
      workroomMessages: latest.workroomAdoption?.totals?.messageSent || 0,
      paymentDisputes: latest.paymentDisputes?.totals?.disputes || 0,
      directOfferAcceptRate: latest.directOfferFunnel?.acceptRate || 0,
      predictivePrecisionRate: latest.predictivePrecision?.precisionRate || 0,
      warningCount: latest.health?.warningCount || 0,
    },
    warnings: latest.health?.warnings || [],
  };

  cacheSet(key, dashboard);
  return dashboard;
}

/**
 * Cleanup old rollups beyond retentionDays.
 */
export async function cleanupOldMarketplaceIntelligenceRollups() {
  if (!isEnabled()) return 0;

  const retentionDays = config.PRODUCT_INTELLIGENCE?.retentionDays || 180;
  const cutoff = dayKey(new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString());

  const dir = getCollectionPath('product_intelligence');
  const rows = await listJSON(dir);

  let cleaned = 0;
  for (const row of rows) {
    if (!row || !row.id || !row.id.startsWith('mpi_')) continue;
    if (row.day && row.day < cutoff) {
      await deleteJSON(rollupPath(row.day)).catch(() => {});
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info('marketplaceIntelligence: cleaned old rollups', { cleaned });
  }

  return cleaned;
}

const INVALIDATION_EVENTS = [
  'search:performed',
  'search:result_clicked_recorded',
  'search:conversion_recorded',
  'profile_task:clicked_recorded',
  'notification:action_click_recorded',
  'notification:conversion_recorded',
  'workroom_adoption:rollup_completed',
  'payment:disputed',
  'direct_offer:accepted',
  'direct_offer:declined',
  'predictive_signal:false_positive',
  'predictive_signal:confirmed',
];

for (const evt of INVALIDATION_EVENTS) {
  eventBus.on(evt, () => {
    clearMarketplaceIntelligenceCache();
  });
}

export const _testHelpers = {
  isEnabled,
  dayKey,
  rollupId,
  rollupPath,
  computeHealthSignals,
  clearMarketplaceIntelligenceCache,
};
