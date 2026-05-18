// ═══════════════════════════════════════════════════════════════
// server/services/searchAnalytics.js — Search Analytics (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Privacy-safe aggregate search analytics.
// Storage:
//   data/metrics/search-analytics/{YYYY-MM}.json
//
// Defaults:
//   - raw queries are NOT stored
//   - queryHash is SHA-256(query normalized/lowercased)
//   - aggregate by scope + queryHash
//
// Events consumed:
//   - search:performed
//   - search:zero_results
//   - search:result_clicked
//   - search:conversion
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  deleteJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { normalizeArabic } from './arabicNormalizer.js';
import { logger } from './logger.js';

function isEnabled() {
  return !!(config.SEARCH_ANALYTICS && config.SEARCH_ANALYTICS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function monthKey(iso = nowIso()) {
  return String(iso).slice(0, 7);
}

function dayKey(iso = nowIso()) {
  return String(iso).slice(0, 10);
}

function analyticsPath(month) {
  return getRecordPath('search_analytics', month);
}

function normalizeQueryForHash(query) {
  if (!query || typeof query !== 'string') return '';
  return normalizeArabic(query.toLowerCase()).replace(/\s+/g, ' ').trim();
}

/**
 * Hash search query for privacy.
 *
 * @param {*} query
 * @returns {string}
 */
export function hashSearchQuery(query) {
  const normalized = normalizeQueryForHash(String(query || ''));
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function sanitizeScope(scope) {
  if (!scope || typeof scope !== 'string') return 'unknown';
  const clean = scope.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return clean || 'unknown';
}

function sanitizeFilters(filters) {
  if (!filters || typeof filters !== 'object') return {};
  const allowed = ['category', 'categories', 'governorate', 'urgency', 'minWage', 'maxWage', 'status'];
  const out = {};
  for (const key of allowed) {
    if (filters[key] === undefined) continue;
    const value = filters[key];
    if (value === null) out[key] = null;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else out[key] = String(value).slice(0, 200);
  }
  return out;
}

function emptyMonth(month) {
  const now = nowIso();
  return {
    id: month,
    month,
    version: 1,
    totals: {
      searches: 0,
      zeroResults: 0,
      clicks: 0,
      conversions: 0,
    },
    byScope: {},
    queries: {},
    byDay: {},
    createdAt: now,
    updatedAt: now,
  };
}

function ensureScope(monthData, scope) {
  if (!monthData.byScope) monthData.byScope = {};
  if (!monthData.byScope[scope]) {
    monthData.byScope[scope] = {
      searches: 0,
      zeroResults: 0,
      clicks: 0,
      conversions: 0,
    };
  }
  return monthData.byScope[scope];
}

function ensureDay(monthData, day) {
  if (!monthData.byDay) monthData.byDay = {};
  if (!monthData.byDay[day]) {
    monthData.byDay[day] = {
      date: day,
      searches: 0,
      zeroResults: 0,
      clicks: 0,
      conversions: 0,
      byScope: {},
    };
  }
  return monthData.byDay[day];
}

function ensureQuery(monthData, scope, queryHash) {
  if (!monthData.queries) monthData.queries = {};
  const key = `${scope}:${queryHash}`;
  if (!monthData.queries[key]) {
    monthData.queries[key] = {
      key,
      scope,
      queryHash,
      sampleQuery: null,
      count: 0,
      zeroResults: 0,
      clickedResults: 0,
      applicationsAfterSearch: 0,
      lastResultCount: 0,
      filters: {},
      firstSeenAt: nowIso(),
      lastSeenAt: nowIso(),
    };
  }
  return monthData.queries[key];
}

function maybeStoreSampleQuery(record, query) {
  if (config.SEARCH_ANALYTICS?.hashQueries !== false) return;
  if (!query || typeof query !== 'string') return;
  record.sampleQuery = query.slice(0, 200);
}

async function mutateMonth(timestamp, mutator) {
  if (!isEnabled()) return { ok: false, disabled: true };

  const month = monthKey(timestamp);
  return withLock(`search-analytics:${month}`, async () => {
    const filePath = analyticsPath(month);
    const data = (await readJSON(filePath)) || emptyMonth(month);

    await mutator(data);

    data.updatedAt = nowIso();
    await atomicWrite(filePath, data);
    return { ok: true, month, data };
  });
}

/**
 * Record search performed.
 *
 * @param {{ scope: string, query?: string, queryHash?: string, resultCount?: number, filters?: object, timestamp?: string }} params
 */
export async function recordSearchPerformed(params = {}) {
  if (!isEnabled()) return { recorded: false, disabled: true };

  const timestamp = params.timestamp || nowIso();
  const scope = sanitizeScope(params.scope);
  const queryHash = params.queryHash || hashSearchQuery(params.query || '');
  const resultCount = Math.max(0, Number(params.resultCount) || 0);
  const filters = sanitizeFilters(params.filters || {});
  const zero = resultCount === 0;

  await mutateMonth(timestamp, async (data) => {
    data.totals.searches++;
    if (zero) data.totals.zeroResults++;

    const scopeRow = ensureScope(data, scope);
    scopeRow.searches++;
    if (zero) scopeRow.zeroResults++;

    const day = ensureDay(data, dayKey(timestamp));
    day.searches++;
    if (zero) day.zeroResults++;
    if (!day.byScope[scope]) day.byScope[scope] = { searches: 0, zeroResults: 0, clicks: 0, conversions: 0 };
    day.byScope[scope].searches++;
    if (zero) day.byScope[scope].zeroResults++;

    const q = ensureQuery(data, scope, queryHash);
    q.count++;
    if (zero) q.zeroResults++;
    q.lastResultCount = resultCount;
    q.filters = filters;
    q.lastSeenAt = timestamp;
    maybeStoreSampleQuery(q, params.query);
  });

  return { recorded: true, scope, queryHash, zeroResults: zero };
}

/**
 * Explicit zero-result recorder.
 * Safe to call after recordSearchPerformed; avoids double-counting by only
 * incrementing if the query record was not already marked zero for same timestamp
 * is intentionally not attempted in file aggregates. Callers should normally
 * emit search:performed once; zero-results event is for realtime notifications.
 */
export async function recordZeroResultSearch(params = {}) {
  if (!isEnabled() || config.SEARCH_ANALYTICS?.trackZeroResults === false) {
    return { recorded: false };
  }

  // Do not double-record totals here. recordSearchPerformed handles zero count.
  return { recorded: true, queryHash: params.queryHash || hashSearchQuery(params.query || '') };
}

/**
 * Record result click.
 *
 * @param {{ scope: string, query?: string, queryHash?: string, resultId?: string, resultType?: string, timestamp?: string }} params
 */
export async function recordSearchClick(params = {}) {
  if (!isEnabled() || config.SEARCH_ANALYTICS?.trackClicks === false) {
    return { recorded: false };
  }

  const timestamp = params.timestamp || nowIso();
  const scope = sanitizeScope(params.scope);
  const queryHash = params.queryHash || hashSearchQuery(params.query || '');

  await mutateMonth(timestamp, async (data) => {
    data.totals.clicks++;

    const scopeRow = ensureScope(data, scope);
    scopeRow.clicks++;

    const day = ensureDay(data, dayKey(timestamp));
    day.clicks++;
    if (!day.byScope[scope]) day.byScope[scope] = { searches: 0, zeroResults: 0, clicks: 0, conversions: 0 };
    day.byScope[scope].clicks++;

    const q = ensureQuery(data, scope, queryHash);
    q.clickedResults++;
    q.lastSeenAt = timestamp;
    maybeStoreSampleQuery(q, params.query);
  });

  eventBus.emit('search:result_clicked_recorded', {
    scope,
    queryHash,
    resultType: params.resultType || null,
    timestamp,
  });

  return { recorded: true, scope, queryHash };
}

/**
 * Record search conversion, e.g. application after search.
 *
 * @param {{ scope: string, query?: string, queryHash?: string, conversionType?: string, timestamp?: string }} params
 */
export async function recordSearchConversion(params = {}) {
  if (!isEnabled() || config.SEARCH_ANALYTICS?.trackApplicationsAfterSearch === false) {
    return { recorded: false };
  }

  const timestamp = params.timestamp || nowIso();
  const scope = sanitizeScope(params.scope);
  const queryHash = params.queryHash || hashSearchQuery(params.query || '');

  await mutateMonth(timestamp, async (data) => {
    data.totals.conversions++;

    const scopeRow = ensureScope(data, scope);
    scopeRow.conversions++;

    const day = ensureDay(data, dayKey(timestamp));
    day.conversions++;
    if (!day.byScope[scope]) day.byScope[scope] = { searches: 0, zeroResults: 0, clicks: 0, conversions: 0 };
    day.byScope[scope].conversions++;

    const q = ensureQuery(data, scope, queryHash);
    q.applicationsAfterSearch++;
    q.lastSeenAt = timestamp;
    maybeStoreSampleQuery(q, params.query);
  });

  eventBus.emit('search:conversion_recorded', {
    scope,
    queryHash,
    conversionType: params.conversionType || 'unknown',
    timestamp,
  });

  return { recorded: true, scope, queryHash };
}

/**
 * Get aggregate search analytics.
 *
 * @param {{ month?: string, scope?: string, limit?: number }} options
 */
export async function getSearchAnalytics(options = {}) {
  if (!isEnabled()) {
    return { enabled: false, totals: {}, topQueries: [] };
  }

  const month = options.month || monthKey();
  const data = (await readJSON(analyticsPath(month))) || emptyMonth(month);

  let queries = Object.values(data.queries || {});
  if (options.scope) queries = queries.filter(q => q.scope === options.scope);

  queries.sort((a, b) => b.count - a.count || b.zeroResults - a.zeroResults);

  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));

  return {
    enabled: true,
    month,
    totals: data.totals || {},
    byScope: data.byScope || {},
    byDay: Object.values(data.byDay || {}).sort((a, b) => a.date.localeCompare(b.date)),
    topQueries: queries.slice(0, limit),
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Get zero-result queries ranked by frequency.
 *
 * @param {{ month?: string, scope?: string, limit?: number }} options
 */
export async function getZeroResultQueries(options = {}) {
  if (!isEnabled()) {
    return { enabled: false, queries: [], total: 0 };
  }

  const month = options.month || monthKey();
  const data = (await readJSON(analyticsPath(month))) || emptyMonth(month);

  let queries = Object.values(data.queries || {}).filter(q => (q.zeroResults || 0) > 0);
  if (options.scope) queries = queries.filter(q => q.scope === options.scope);

  queries.sort((a, b) => b.zeroResults - a.zeroResults || b.count - a.count);

  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));

  return {
    enabled: true,
    month,
    queries: queries.slice(0, limit),
    total: queries.length,
  };
}

/**
 * Roll up search analytics.
 * Current implementation returns the persisted monthly aggregate.
 * Kept as separate API so scheduler/queue can call it idempotently.
 */
export async function rollupSearchAnalytics(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const month = options.month || monthKey();
  const analytics = await getSearchAnalytics({ month, limit: 100 });

  eventBus.emit('search_analytics:rollup_completed', {
    month,
    searches: analytics.totals?.searches || 0,
    zeroResults: analytics.totals?.zeroResults || 0,
    timestamp: nowIso(),
  });

  return {
    ok: true,
    month,
    totals: analytics.totals,
    topQueries: analytics.topQueries,
    generatedAt: nowIso(),
  };
}

export async function cleanupOldSearchAnalytics() {
  if (!isEnabled()) return 0;

  const retentionDays = config.SEARCH_ANALYTICS?.retentionDays || 90;
  const cutoffMonth = monthKey(new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString());

  const dir = getCollectionPath('search_analytics');
  const rows = await listJSON(dir);

  let cleaned = 0;
  for (const row of rows) {
    if (!row || !row.id) continue;
    if (row.month && row.month < cutoffMonth) {
      await deleteJSON(analyticsPath(row.id)).catch(() => {});
      cleaned++;
    }
  }

  return cleaned;
}

// EventBus listeners — fire-and-forget.
// Guard globally because tests may import with cache busting.
const LISTENER_FLAG = '__yawmiaSearchAnalyticsListenersRegistered';

if (isEnabled() && !globalThis[LISTENER_FLAG]) {
  globalThis[LISTENER_FLAG] = true;

  eventBus.on('search:performed', (data) => {
    recordSearchPerformed(data).catch(err => {
      logger.warn('searchAnalytics: recordSearchPerformed failed', { error: err.message });
    });
  });

  eventBus.on('search:zero_results', (data) => {
    recordZeroResultSearch(data).catch(() => {});
  });

  eventBus.on('search:result_clicked', (data) => {
    recordSearchClick(data).catch(err => {
      logger.warn('searchAnalytics: recordSearchClick failed', { error: err.message });
    });
  });

  eventBus.on('search:conversion', (data) => {
    recordSearchConversion(data).catch(err => {
      logger.warn('searchAnalytics: recordSearchConversion failed', { error: err.message });
    });
  });
}

export const _testHelpers = {
  isEnabled,
  monthKey,
  dayKey,
  analyticsPath,
  normalizeQueryForHash,
  sanitizeFilters,
  emptyMonth,
};
