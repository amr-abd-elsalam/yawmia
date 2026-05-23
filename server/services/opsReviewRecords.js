// ═══════════════════════════════════════════════════════════════
// server/services/opsReviewRecords.js — Operational Review Records (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Persistent review records for operational governance.
// Types:
//   weekly_ops_review, dlq_review, restore_drill_review,
//   marketplace_review, trust_calibration_review,
//   predictive_precision_review, payment_dispute_review,
//   slo_breach_review
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';

const DEFAULT_TYPES = [
  'weekly_ops_review',
  'dlq_review',
  'restore_drill_review',
  'marketplace_review',
  'trust_calibration_review',
  'predictive_precision_review',
  'payment_dispute_review',
  'slo_breach_review',
];

function isEnabled() {
  return !!(config.OPS_REVIEW_RECORDS && config.OPS_REVIEW_RECORDS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'orv_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

function reviewPath(id) {
  return getRecordPath('ops_reviews', id);
}

function allowedTypes() {
  return new Set(config.OPS_REVIEW_RECORDS?.reviewTypes || DEFAULT_TYPES);
}

function sanitizeText(value, max = 2000) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().slice(0, max) || null;
}

function sanitizeList(items, maxItems = 50) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, maxItems).map(item => {
    if (typeof item === 'string') return { text: sanitizeText(item, 1000) };
    if (item && typeof item === 'object') {
      return {
        title: sanitizeText(item.title || item.text || item.label || '', 300),
        note: sanitizeText(item.note || item.reason || item.description || '', 1000),
        owner: sanitizeText(item.owner || '', 120),
        dueDate: sanitizeText(item.dueDate || '', 40),
        status: sanitizeText(item.status || 'open', 40) || 'open',
      };
    }
    return { text: String(item).slice(0, 1000) };
  });
}

function sanitizeRefs(refs) {
  if (!refs || typeof refs !== 'object') return {};
  const allowed = [
    'queueJobId',
    'incidentId',
    'drillId',
    'rollupId',
    'signalId',
    'reportId',
    'exportId',
    'schedulerName',
  ];

  const out = {};
  for (const key of allowed) {
    if (refs[key]) out[key] = String(refs[key]).slice(0, 120);
  }
  return out;
}

/**
 * Create review record.
 */
export async function createReviewRecord(params = {}) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'OPS_REVIEW_RECORDS_DISABLED' };

  if (!allowedTypes().has(params.type)) {
    return { ok: false, code: 'INVALID_REVIEW_TYPE', error: 'invalid review type' };
  }

  const now = nowIso();
  const id = params.id || generateId();

  const record = {
    id,
    type: params.type,
    status: params.status === 'completed' ? 'completed' : 'draft',
    title: sanitizeText(params.title || params.type, 300) || params.type,
    summary: sanitizeText(params.summary || '', 3000),
    findings: sanitizeList(params.findings || [], 100),
    actions: sanitizeList(params.actions || [], 100),
    refs: sanitizeRefs(params.refs || {}),
    createdBy: params.createdBy || 'admin_token',
    completedBy: params.status === 'completed' ? (params.completedBy || params.createdBy || 'admin_token') : null,
    completedAt: params.status === 'completed' ? now : null,
    createdAt: now,
    updatedAt: now,
  };

  await atomicWrite(reviewPath(id), record);

  eventBus.emit('ops_review:created', {
    reviewId: id,
    type: record.type,
    status: record.status,
    createdBy: record.createdBy,
    timestamp: now,
  });

  if (record.status === 'completed') {
    eventBus.emit('ops_review:completed', {
      reviewId: id,
      type: record.type,
      completedBy: record.completedBy,
      timestamp: now,
    });
  }

  return { ok: true, review: record };
}

/**
 * Complete draft review.
 */
export async function completeReviewRecord(reviewId, params = {}) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'OPS_REVIEW_RECORDS_DISABLED' };

  return withLock(`ops-review:${reviewId}`, async () => {
    const record = await getReviewRecord(reviewId);
    if (!record) return { ok: false, code: 'REVIEW_NOT_FOUND', error: 'review not found' };

    if (record.status === 'completed') {
      return { ok: true, review: record, alreadyCompleted: true };
    }

    const now = nowIso();

    record.status = 'completed';
    record.summary = sanitizeText(params.summary || record.summary || '', 3000);
    if (params.findings) record.findings = sanitizeList(params.findings, 100);
    if (params.actions) record.actions = sanitizeList(params.actions, 100);
    if (params.refs) record.refs = { ...record.refs, ...sanitizeRefs(params.refs) };
    record.completedBy = params.completedBy || 'admin_token';
    record.completedAt = now;
    record.updatedAt = now;

    await atomicWrite(reviewPath(reviewId), record);

    eventBus.emit('ops_review:completed', {
      reviewId,
      type: record.type,
      completedBy: record.completedBy,
      timestamp: now,
    });

    return { ok: true, review: record };
  });
}

export async function getReviewRecord(reviewId) {
  if (!reviewId || typeof reviewId !== 'string') return null;
  return await readJSON(reviewPath(reviewId));
}

export async function listReviewRecords(options = {}) {
  if (!isEnabled()) return { reviews: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('ops_reviews');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('orv_'));

  if (options.type) rows = rows.filter(r => r.type === options.type);
  if (options.status) rows = rows.filter(r => r.status === options.status);
  if (options.createdBy) rows = rows.filter(r => r.createdBy === options.createdBy);

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    reviews: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function getLatestReviewByType(type) {
  if (!allowedTypes().has(type)) return null;

  const result = await listReviewRecords({ type, status: 'completed', limit: 1, offset: 0 });
  return result.reviews && result.reviews[0] ? result.reviews[0] : null;
}

export async function getReviewFreshness(type, maxAgeDays) {
  const latest = await getLatestReviewByType(type);
  const thresholdDays = Number(maxAgeDays || config.OPS_REVIEW_RECORDS?.weeklyReviewMaxAgeDays || 7);

  if (!latest) {
    return {
      type,
      latest: null,
      ageDays: null,
      fresh: false,
      thresholdDays,
      status: 'missing',
    };
  }

  const basis = latest.completedAt || latest.createdAt;
  const ageDays = Math.round(((Date.now() - new Date(basis).getTime()) / 86400000) * 10) / 10;
  const fresh = ageDays <= thresholdDays;

  return {
    type,
    latest,
    ageDays,
    fresh,
    thresholdDays,
    status: fresh ? 'fresh' : 'stale',
  };
}

/**
 * Phase 59: lightweight governance pressure stats for operational reviews.
 */
export async function getOpsReviewPressureStats() {
  if (!isEnabled()) {
    return {
      enabled: false,
      total: 0,
      draft: 0,
      completed: 0,
      stale: 0,
      latestWeeklyReviewAt: null,
      weeklyFresh: false,
      staleReviewTypes: [],
    };
  }

  const result = {
    enabled: true,
    total: 0,
    draft: 0,
    completed: 0,
    stale: 0,
    latestWeeklyReviewAt: null,
    weeklyFresh: false,
    staleReviewTypes: [],
    generatedAt: nowIso(),
  };

  try {
    const rows = await listReviewRecords({ limit: 100000, offset: 0 });
    const reviews = rows.reviews || [];

    for (const review of reviews) {
      if (!review || !review.id) continue;

      result.total++;

      if (review.status === 'completed') result.completed++;
      else result.draft++;
    }

    const weekly = await getReviewFreshness(
      'weekly_ops_review',
      config.OPS_REVIEW_RECORDS?.weeklyReviewMaxAgeDays || 7
    ).catch(() => null);

    if (weekly) {
      result.latestWeeklyReviewAt = weekly.latest
        ? (weekly.latest.completedAt || weekly.latest.createdAt || null)
        : null;
      result.weeklyFresh = !!weekly.fresh;
      if (!weekly.fresh) {
        result.stale++;
        result.staleReviewTypes.push('weekly_ops_review');
      }
    }

    // Check each configured review type for a stale/missing completed review.
    const maxAgeDays = config.OPS_REVIEW_RECORDS?.weeklyReviewMaxAgeDays || 7;
    for (const type of allowedTypes()) {
      if (type === 'weekly_ops_review') continue;
      const freshness = await getReviewFreshness(type, maxAgeDays).catch(() => null);
      if (freshness && freshness.status !== 'fresh') {
        result.stale++;
        result.staleReviewTypes.push(type);
      }
    }

    return result;
  } catch (err) {
    return {
      ...result,
      error: err.message,
      status: 'unknown',
    };
  }
}

export const _testHelpers = {
  DEFAULT_TYPES,
  generateId,
  reviewPath,
  allowedTypes,
  sanitizeList,
  sanitizeRefs,
};
