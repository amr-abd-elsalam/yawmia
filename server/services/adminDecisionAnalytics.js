// ═══════════════════════════════════════════════════════════════
// server/services/adminDecisionAnalytics.js — Admin Decision Quality (Phase 51)
// ═══════════════════════════════════════════════════════════════
// Admin-only analytics layer.
// Measures:
//   - warning effectiveness
//   - admin calibration
//   - decision quality
//   - backlog priority
//
// Sources:
//   - abuseFlagReview review states
//   - predictiveAbuse persisted signals
//   - admin_warning notifications
//
// Privacy:
//   - admin-only endpoints consume this service
//   - IDs only, no phone/name leakage
//
// No auto-ban. No external dependencies.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

/** @type {Map<string, { value: *, expiresAt: number }>} */
const cache = new Map();

function cacheKey(prefix, options = {}) {
  return `${prefix}:${options.from || 'all'}:${options.to || 'all'}:${options.adminId || 'all'}`;
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
  const ttl = config.TRUST_ANALYTICS?.cacheTtlMs || 300000;
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

export function clearAdminDecisionAnalyticsCache() {
  cache.clear();
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function inDateRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function hoursBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3600000) * 10) / 10;
}

function avg(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function severityWeight(severity) {
  return {
    low: 0.25,
    medium: 0.5,
    high: 0.8,
    critical: 1,
  }[severity] || 0.4;
}

function decisionRiskWeight(decision) {
  return {
    dismissed: 0.2,
    snoozed: 0.4,
    warning: 0.6,
    actioned: 1,
  }[decision] || 0.3;
}

function getLatestReview(state) {
  if (!state || !Array.isArray(state.reviews) || state.reviews.length === 0) return null;
  return state.reviews[state.reviews.length - 1];
}

async function loadReviewStates() {
  try {
    const { listAllReviewStates } = await import('./abuseFlagReview.js');
    const states = await listAllReviewStates();
    return Array.isArray(states) ? states : [];
  } catch (err) {
    logger.warn('adminDecisionAnalytics: loadReviewStates failed', { error: err.message });
    return [];
  }
}

async function loadPredictiveSignals() {
  try {
    const { listPredictiveSignals } = await import('./predictiveAbuse.js');
    const result = await listPredictiveSignals({ limit: 10000, offset: 0 });
    return result.signals || [];
  } catch (err) {
    logger.warn('adminDecisionAnalytics: loadPredictiveSignals failed', { error: err.message });
    return [];
  }
}

function filterReviewsByRange(states, options = {}) {
  const rows = [];
  for (const state of states) {
    const reviews = Array.isArray(state.reviews) ? state.reviews : [];
    for (const review of reviews) {
      if (!inDateRange(review.createdAt, options.from, options.to)) continue;
      if (options.adminId && review.adminId !== options.adminId) continue;
      rows.push({ state, review });
    }
  }
  return rows;
}

function getTargetUserIdFromState(state) {
  if (!state) return null;
  if (state.flagType === 'worker_offer_bombing') return state.workerId || null;
  return state.employerId || state.workerId || null;
}

function getTargetUserIdFromSignal(signal) {
  if (!signal) return null;
  return signal.entityId || signal.relatedUserId || null;
}

// ─────────────────────────────────────────────────────────────
// Warning Effectiveness
// ─────────────────────────────────────────────────────────────

/**
 * Calculate warning effectiveness.
 *
 * Definitions:
 *   - totalWarnings: review decisions with decision='warning'
 *   - convertedToAction: later actioned review within configured window
 *   - repeatedFlagAfterWarning: occurrenceCount increased or later review exists after warning
 *   - cleanAfterWarning: no later action/repeat inside window
 *
 * @param {{ from?: string, to?: string, adminId?: string }} options
 */
export async function getWarningEffectiveness(options = {}) {
  const key = cacheKey('warningEffectiveness', options);
  const cached = cacheGet(key);
  if (cached) return cached;

  const states = await loadReviewStates();
  const windowDays = config.TRUST_ANALYTICS?.warningConversionWindowDays || 30;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  let totalWarnings = 0;
  let convertedToAction = 0;
  let repeatedFlagAfterWarning = 0;
  let cleanAfterWarning = 0;
  let pendingWindow = 0;

  const byAdmin = {};

  for (const state of states) {
    const reviews = Array.isArray(state.reviews) ? state.reviews : [];
    const warnings = reviews.filter(r =>
      r.decision === 'warning' &&
      inDateRange(r.createdAt, options.from, options.to) &&
      (!options.adminId || r.adminId === options.adminId)
    );

    for (const warning of warnings) {
      totalWarnings++;

      if (!byAdmin[warning.adminId]) {
        byAdmin[warning.adminId] = {
          adminId: warning.adminId,
          totalWarnings: 0,
          convertedToAction: 0,
          repeatedFlagAfterWarning: 0,
          cleanAfterWarning: 0,
          pendingWindow: 0,
          effectivenessRate: 0,
        };
      }

      const row = byAdmin[warning.adminId];
      row.totalWarnings++;

      const warningMs = new Date(warning.createdAt).getTime();
      const windowEndMs = warningMs + windowMs;

      const laterReviews = reviews.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return t > warningMs && t <= windowEndMs;
      });

      const laterAction = laterReviews.find(r => r.decision === 'actioned');

      const laterRepeat = laterReviews.length > 0 ||
        ((state.occurrenceCount || 1) > 1 && Date.now() <= windowEndMs);

      if (laterAction) {
        convertedToAction++;
        row.convertedToAction++;
      } else if (Date.now() < windowEndMs) {
        pendingWindow++;
        row.pendingWindow++;
      } else if (laterRepeat) {
        repeatedFlagAfterWarning++;
        row.repeatedFlagAfterWarning++;
      } else {
        cleanAfterWarning++;
        row.cleanAfterWarning++;
      }
    }
  }

  for (const row of Object.values(byAdmin)) {
    const decided = row.cleanAfterWarning + row.repeatedFlagAfterWarning + row.convertedToAction;
    row.effectivenessRate = decided > 0
      ? Math.round((row.cleanAfterWarning / decided) * 100)
      : 0;
  }

  const decided = cleanAfterWarning + repeatedFlagAfterWarning + convertedToAction;
  const effectivenessRate = decided > 0
    ? Math.round((cleanAfterWarning / decided) * 100)
    : 0;

  const conversionRate = decided > 0
    ? Math.round((convertedToAction / decided) * 100)
    : 0;

  const result = {
    totalWarnings,
    cleanAfterWarning,
    repeatedFlagAfterWarning,
    convertedToAction,
    pendingWindow,
    effectivenessRate,
    conversionRate,
    windowDays,
    byAdmin: Object.values(byAdmin).sort((a, b) => b.totalWarnings - a.totalWarnings),
  };

  cacheSet(key, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// Admin Calibration
// ─────────────────────────────────────────────────────────────

/**
 * Admin calibration metrics:
 *   - decisions by admin
 *   - high-risk predictive signals dismissed
 *   - low-risk predictive signals escalated/actioned
 *   - average time to decision
 *
 * @param {{ from?: string, to?: string, adminId?: string }} options
 */
export async function getAdminCalibration(options = {}) {
  const key = cacheKey('adminCalibration', options);
  const cached = cacheGet(key);
  if (cached) return cached;

  const states = await loadReviewStates();
  const signals = await loadPredictiveSignals();
  const reviewRows = filterReviewsByRange(states, options);

  const byAdmin = {};

  function ensure(adminId) {
    const id = adminId || 'unknown';
    if (!byAdmin[id]) {
      byAdmin[id] = {
        adminId: id,
        totalDecisions: 0,
        byDecision: { dismissed: 0, snoozed: 0, warning: 0, actioned: 0, escalated: 0 },
        avgTimeToDecisionHours: 0,
        totalDecisionHours: 0,
        decisionTimeCount: 0,
        highRiskDismissed: 0,
        lowRiskActioned: 0,
        calibrationScore: 0,
      };
    }
    return byAdmin[id];
  }

  for (const { state, review } of reviewRows) {
    const row = ensure(review.adminId);
    row.totalDecisions++;
    if (row.byDecision[review.decision] !== undefined) row.byDecision[review.decision]++;

    if (state.firstSeenAt && review.createdAt) {
      const h = hoursBetween(state.firstSeenAt, review.createdAt);
      if (h > 0) {
        row.totalDecisionHours += h;
        row.decisionTimeCount++;
      }
    }
  }

  // Predictive signal reviews: dismissed/escalated.
  for (const sig of signals) {
    if (!sig.reviewedBy || !sig.reviewedAt) continue;
    if (!inDateRange(sig.reviewedAt, options.from, options.to)) continue;
    if (options.adminId && sig.reviewedBy !== options.adminId) continue;

    const row = ensure(sig.reviewedBy);
    row.totalDecisions++;
    if (sig.reviewDecision === 'dismissed') row.byDecision.dismissed++;
    if (sig.reviewDecision === 'escalated') row.byDecision.escalated++;

    if ((sig.severity === 'high' || sig.severity === 'critical') && sig.reviewDecision === 'dismissed') {
      row.highRiskDismissed++;
    }

    if ((sig.severity === 'low' || sig.riskScore < 0.5) && sig.reviewDecision === 'escalated') {
      row.lowRiskActioned++;
    }

    if (sig.createdAt && sig.reviewedAt) {
      const h = hoursBetween(sig.createdAt, sig.reviewedAt);
      if (h > 0) {
        row.totalDecisionHours += h;
        row.decisionTimeCount++;
      }
    }
  }

  for (const row of Object.values(byAdmin)) {
    row.avgTimeToDecisionHours = row.decisionTimeCount > 0
      ? Math.round((row.totalDecisionHours / row.decisionTimeCount) * 10) / 10
      : 0;

    // Calibration score: starts at 100, penalize questionable decisions.
    const questionable = row.highRiskDismissed + row.lowRiskActioned;
    const ratio = row.totalDecisions > 0 ? questionable / row.totalDecisions : 0;
    row.calibrationScore = Math.max(0, Math.round((1 - ratio) * 100));

    delete row.totalDecisionHours;
    delete row.decisionTimeCount;
  }

  const admins = Object.values(byAdmin)
    .sort((a, b) => b.totalDecisions - a.totalDecisions);

  const result = {
    admins,
    totalAdmins: admins.length,
    totalDecisions: admins.reduce((sum, a) => sum + a.totalDecisions, 0),
    avgCalibrationScore: admins.length > 0 ? avg(admins.map(a => a.calibrationScore)) : 0,
  };

  cacheSet(key, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// Backlog Priority
// ─────────────────────────────────────────────────────────────

function priorityAgeWeight(createdAt) {
  if (!createdAt) return 0;
  const ageHours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3600000);
  // slowly increases up to 1 over 72 hours
  return Math.min(1, ageHours / 72);
}

function repeatWeight(count) {
  return Math.min(1, Math.max(0, (count || 1) / 5));
}

function calculatePriorityScore({ riskScore = 0.5, severity = 'medium', createdAt, repeatCount = 1 }) {
  const score =
    clamp01(riskScore) * 0.5 +
    severityWeight(severity) * 0.25 +
    priorityAgeWeight(createdAt) * 0.15 +
    repeatWeight(repeatCount) * 0.10;

  return Math.round(score * 100) / 100;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Backlog priority queue combining:
 *   riskScore × severityWeight × ageWeight × repeatWeight
 *
 * @param {{ limit?: number, includeAbuseFlags?: boolean, includePredictiveSignals?: boolean }} options
 */
export async function getBacklogPriority(options = {}) {
  const key = cacheKey('backlogPriority', options);
  const cached = cacheGet(key);
  if (cached) return cached;

  const includeAbuseFlags = options.includeAbuseFlags !== false;
  const includePredictiveSignals = options.includePredictiveSignals !== false;
  const items = [];

  if (includePredictiveSignals) {
    const signals = await loadPredictiveSignals();
    for (const sig of signals) {
      if (sig.status !== 'active') continue;

      const priorityScore = calculatePriorityScore({
        riskScore: sig.riskScore || 0.5,
        severity: sig.severity || 'medium',
        createdAt: sig.createdAt,
        repeatCount: 1,
      });

      items.push({
        type: 'predictive_signal',
        id: sig.id,
        riskType: sig.riskType,
        entityType: sig.entityType,
        entityId: sig.entityId,
        relatedUserId: sig.relatedUserId || null,
        priorityScore,
        riskScore: sig.riskScore || 0,
        severity: sig.severity || 'medium',
        ageHours: Math.round(((Date.now() - new Date(sig.createdAt).getTime()) / 3600000) * 10) / 10,
        explanations: sig.explanations || [],
        createdAt: sig.createdAt,
        updatedAt: sig.updatedAt,
      });
    }
  }

  if (includeAbuseFlags) {
    const states = await loadReviewStates();
    for (const state of states) {
      if (!state || state.currentStatus !== 'active') continue;

      const repeat = state.occurrenceCount || 1;
      const priorityScore = calculatePriorityScore({
        riskScore: repeat >= 5 ? 0.85 : repeat >= 3 ? 0.65 : 0.5,
        severity: repeat >= 5 ? 'high' : 'medium',
        createdAt: state.firstSeenAt,
        repeatCount: repeat,
      });

      items.push({
        type: 'abuse_flag',
        id: state.fingerprint,
        riskType: state.flagType,
        entityType: state.employerId ? 'employer' : 'worker',
        entityId: state.employerId || state.workerId || null,
        relatedUserId: state.employerId ? state.workerId || null : null,
        priorityScore,
        riskScore: repeat >= 5 ? 0.85 : repeat >= 3 ? 0.65 : 0.5,
        severity: repeat >= 5 ? 'high' : 'medium',
        ageHours: Math.round(((Date.now() - new Date(state.firstSeenAt).getTime()) / 3600000) * 10) / 10,
        explanations: [
          `active abuse flag: ${state.flagType}`,
          `occurrenceCount=${repeat}`,
          `reviews=${Array.isArray(state.reviews) ? state.reviews.length : 0}`,
        ],
        createdAt: state.firstSeenAt,
        updatedAt: getLatestReview(state)?.createdAt || state.firstSeenAt,
      });
    }
  }

  items.sort((a, b) =>
    b.priorityScore - a.priorityScore ||
    severityWeight(b.severity) - severityWeight(a.severity) ||
    new Date(a.createdAt) - new Date(b.createdAt)
  );

  const limit = Math.min(200, Math.max(1, parseInt(options.limit) || 50));

  const result = {
    items: items.slice(0, limit),
    total: items.length,
    limit,
    generatedAt: new Date().toISOString(),
  };

  cacheSet(key, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// Decision Quality Aggregator
// ─────────────────────────────────────────────────────────────

/**
 * Unified decision quality dashboard.
 *
 * @param {{ from?: string, to?: string, adminId?: string }} options
 */
export async function getDecisionQuality(options = {}) {
  const key = cacheKey('decisionQuality', options);
  const cached = cacheGet(key);
  if (cached) return cached;

  const [warningEffectiveness, calibration, backlog] = await Promise.all([
    getWarningEffectiveness(options),
    getAdminCalibration(options),
    getBacklogPriority({ limit: 25 }),
  ]);

  const result = {
    warningEffectiveness,
    calibration,
    backlogSummary: {
      total: backlog.total,
      highPriority: backlog.items.filter(i => i.priorityScore >= 0.75).length,
      topItems: backlog.items.slice(0, 5),
    },
    generatedAt: new Date().toISOString(),
  };

  cacheSet(key, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// EventBus invalidation
// ─────────────────────────────────────────────────────────────

const INVALIDATION_EVENTS = [
  'abuse_flag:state_changed',
  'predictive_abuse:signal_created',
  'predictive_abuse:signal_updated',
  'predictive_abuse:signal_escalated',
  'notification:created',
];

for (const eventName of INVALIDATION_EVENTS) {
  eventBus.on(eventName, () => {
    clearAdminDecisionAnalyticsCache();
  });
}

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

export const _testHelpers = {
  inDateRange,
  hoursBetween,
  avg,
  severityWeight,
  decisionRiskWeight,
  getLatestReview,
  getTargetUserIdFromState,
  getTargetUserIdFromSignal,
  priorityAgeWeight,
  repeatWeight,
  calculatePriorityScore,
  clearAdminDecisionAnalyticsCache,
  cache,
};
