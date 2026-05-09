// ═══════════════════════════════════════════════════════════════
// server/services/trustScoreV2.js — Role-Specific Trust Score V2 (Phase 51)
// ═══════════════════════════════════════════════════════════════
// Additive trust layer — does NOT replace trust.js v1.
// Provides:
//   - WorkerTrust
//   - EmployerTrust
//   - deterministic weighted scoring
//   - rating confidence weighting
//   - public-safe output by default
//   - admin-rich output via options.admin=true
//
// No auto-ban. No PII in public response.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

// ── Module-local cache ────────────────────────────────────────
/** @type {Map<string, { value: object, expiresAt: number }>} */
const cache = new Map();

function cacheKey(userId, options = {}) {
  return `trust-v2:${userId}:${options.admin ? 'admin' : 'public'}`;
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
  const ttl = config.TRUST_SCORE_V2?.cacheTtlMs || (5 * 60 * 1000);
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

/**
 * Clear Trust Score V2 cache.
 * If userId is provided, clears both public/admin entries for that user.
 * Otherwise clears all cache.
 */
export function clearTrustScoreV2Cache(userId) {
  if (!userId) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(`trust-v2:${userId}:`)) {
      cache.delete(key);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n) {
  return Math.round(clamp01(n) * 100) / 100;
}

function score100(score) {
  return Math.round(clamp01(score) * 100);
}

function gradeFromScore(score) {
  if (score >= 0.85) return 'excellent';
  if (score >= 0.70) return 'good';
  if (score >= 0.50) return 'fair';
  return 'risky';
}

/**
 * Rating confidence weighting.
 * Low rating count should not over-inflate trust.
 *
 * If no ratings: neutral 0.5.
 * If low ratings: blend rating score with neutral baseline.
 *
 * @param {number} avg 0..5
 * @param {number} count
 * @param {number} minCount
 * @returns {number} 0..1
 */
export function calculateRatingConfidence(avg, count, minCount) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (safeCount === 0) return 0.5;

  const ratingNorm = clamp01((Number(avg) || 0) / 5);
  const confidence = clamp01(safeCount / Math.max(1, minCount || 5));

  // Blend toward neutral while count is low.
  return round2((ratingNorm * confidence) + (0.5 * (1 - confidence)));
}

export function calculateAccountAgeScore(accountAgeDays, capDays = 365) {
  return round2(Math.min(Math.max(0, accountAgeDays || 0), capDays) / capDays);
}

export function calculateVerificationScore(status) {
  if (status === 'verified') return 1;
  if (status === 'pending') return 0.6;
  return 0.3;
}

export function calculateAbusePenalty({ confirmedReports = 0, activeFlags = 0, warnings = 0, predictiveSignals = 0 } = {}) {
  const penalty =
    Math.min(confirmedReports, 5) * 0.12 +
    Math.min(activeFlags, 5) * 0.10 +
    Math.min(warnings, 5) * 0.06 +
    Math.min(predictiveSignals, 5) * 0.08;

  return round2(1 - Math.min(0.8, penalty));
}

function weightedScore(components, weights) {
  let totalWeight = 0;
  let total = 0;

  for (const [key, weight] of Object.entries(weights || {})) {
    const w = Number(weight) || 0;
    if (w <= 0) continue;
    totalWeight += w;
    total += clamp01(components[key] ?? 0.5) * w;
  }

  if (totalWeight <= 0) return 0.5;
  return round2(total / totalWeight);
}

function publicComponents(components) {
  if (!config.TRUST_SCORE_V2?.publicExposeComponents) return undefined;
  return { ...components };
}

function safeOutput(result, options = {}) {
  const out = {
    userId: result.userId,
    role: result.role,
    score: result.score,
    score100: result.score100,
    grade: result.grade,
    components: options.admin ? result.components : publicComponents(result.components),
    explanations: result.explanations,
    computedAt: result.computedAt,
  };

  if (options.admin) {
    out.rawMetrics = result.rawMetrics || {};
    out.adminExplanations = result.adminExplanations || [];
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// Pure score calculators
// ─────────────────────────────────────────────────────────────

/**
 * Calculate WorkerTrust from normalized inputs.
 *
 * @param {object} input
 * @returns {object}
 */
export function calculateWorkerTrustScore(input = {}) {
  const weights = config.TRUST_SCORE_V2?.weights?.worker || {};
  const minRatingCount = config.TRUST_SCORE_V2?.minRatingConfidenceCount || 5;

  const ratingConfidence = calculateRatingConfidence(
    input.ratingAvg || 0,
    input.ratingCount || 0,
    minRatingCount
  );

  const attendanceReliability = input.totalAttendanceRecords > 0
    ? round2((input.attendedDays || 0) / input.totalAttendanceRecords)
    : 0.5;

  const completionReliability = input.totalAcceptedJobs > 0
    ? round2((input.completedJobs || 0) / input.totalAcceptedJobs)
    : 0.5;

  const abusePenalty = calculateAbusePenalty({
    confirmedReports: input.confirmedReports || 0,
    activeFlags: input.activeFlags || 0,
    warnings: input.warnings || 0,
    predictiveSignals: input.predictiveSignals || 0,
  });

  const verification = calculateVerificationScore(input.verificationStatus);
  const accountAge = calculateAccountAgeScore(input.accountAgeDays || 0, config.TRUST.accountAgeCap || 365);
  const profileCompleteness = round2((input.profileCompletenessScore || 0) / 100);

  const components = {
    ratingConfidence,
    attendanceReliability,
    completionReliability,
    abusePenalty,
    verification,
    accountAge,
    profileCompleteness,
  };

  const score = weightedScore(components, weights);

  const explanations = [];
  if (attendanceReliability >= 0.8) explanations.push('نسبة حضور قوية');
  else if (attendanceReliability < 0.5) explanations.push('نسبة الحضور تحتاج متابعة');

  if (completionReliability >= 0.8) explanations.push('معدل إكمال جيد للفرص المقبولة');
  else if (completionReliability < 0.5) explanations.push('معدل الإكمال منخفض مقارنة بالفرص المقبولة');

  if ((input.ratingCount || 0) >= minRatingCount) explanations.push('عدد تقييمات كافي لثقة أعلى');
  else explanations.push('عدد التقييمات ما زال محدوداً');

  if (abusePenalty >= 0.9) explanations.push('لا توجد مؤشرات إساءة مؤثرة');
  else explanations.push('توجد تحذيرات أو إشارات تحتاج مراجعة');

  if (verification === 1) explanations.push('الهوية محققة');

  return {
    score,
    score100: score100(score),
    grade: gradeFromScore(score),
    components,
    explanations,
  };
}

/**
 * Calculate EmployerTrust from normalized inputs.
 *
 * @param {object} input
 * @returns {object}
 */
export function calculateEmployerTrustScore(input = {}) {
  const weights = config.TRUST_SCORE_V2?.weights?.employer || {};
  const minRatingCount = config.TRUST_SCORE_V2?.minRatingConfidenceCount || 5;

  const ratingConfidence = calculateRatingConfidence(
    input.ratingAvg || 0,
    input.ratingCount || 0,
    minRatingCount
  );

  const paymentReliability = input.totalPayments > 0
    ? round2(((input.completedPayments || 0) + (input.employerConfirmedPayments || 0)) / input.totalPayments)
    : 0.5;

  const disputeRate = input.totalPayments > 0
    ? round2(1 - ((input.disputedPayments || 0) / input.totalPayments))
    : 0.5;

  const cancellationRate = input.totalJobs > 0
    ? round2(1 - ((input.cancelledJobs || 0) / input.totalJobs))
    : 0.5;

  const offerBehavior = input.totalDirectOffers > 0
    ? round2(
        ((input.directOfferAcceptRate || 0) / 100) * 0.65 +
        (1 - ((input.directOfferNegativeRate || 0) / 100)) * 0.35
      )
    : 0.5;

  const abusePenalty = calculateAbusePenalty({
    confirmedReports: input.confirmedReports || 0,
    activeFlags: input.activeFlags || 0,
    warnings: input.warnings || 0,
    predictiveSignals: input.predictiveSignals || 0,
  });

  const verification = calculateVerificationScore(input.verificationStatus);
  const accountAge = calculateAccountAgeScore(input.accountAgeDays || 0, config.TRUST.accountAgeCap || 365);

  const components = {
    ratingConfidence,
    paymentReliability,
    disputeRate,
    cancellationRate,
    offerBehavior,
    abusePenalty,
    verification,
    accountAge,
  };

  const score = weightedScore(components, weights);

  const explanations = [];
  if (paymentReliability >= 0.8) explanations.push('سلوك الدفع موثوق');
  else if (paymentReliability < 0.5) explanations.push('سلوك الدفع يحتاج متابعة');

  if (disputeRate >= 0.85) explanations.push('معدل النزاعات منخفض');
  else explanations.push('معدل النزاعات يؤثر على الثقة');

  if (cancellationRate >= 0.8) explanations.push('معدل إلغاء الفرص منخفض');
  else explanations.push('إلغاء الفرص المتكرر يقلل الثقة');

  if (offerBehavior >= 0.7) explanations.push('سلوك العروض المباشرة جيد');
  else explanations.push('سلوك العروض المباشرة يحتاج مراجعة');

  if (abusePenalty >= 0.9) explanations.push('لا توجد مؤشرات إساءة مؤثرة');
  else explanations.push('توجد تحذيرات أو إشارات تحتاج مراجعة');

  if (verification === 1) explanations.push('الهوية محققة');

  return {
    score,
    score100: score100(score),
    grade: gradeFromScore(score),
    components,
    explanations,
  };
}

// ─────────────────────────────────────────────────────────────
// Data gathering helpers
// ─────────────────────────────────────────────────────────────

async function countWarnings(userId) {
  try {
    const { listByUser } = await import('./notifications.js');
    const result = await listByUser(userId, { limit: 200, offset: 0 });
    const items = result?.items || [];
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return items.filter(n =>
      n.type === 'admin_warning' &&
      n.createdAt &&
      new Date(n.createdAt).getTime() >= monthAgo
    ).length;
  } catch (_) {
    return 0;
  }
}

async function getAbuseStateCounts(userId) {
  let activeFlags = 0;

  try {
    const { listAllReviewStates } = await import('./abuseFlagReview.js');
    const states = await listAllReviewStates();
    activeFlags = states.filter(s =>
      s &&
      s.currentStatus !== 'dismissed' &&
      s.currentStatus !== 'actioned' &&
      (s.employerId === userId || s.workerId === userId)
    ).length;
  } catch (_) {
    activeFlags = 0;
  }

  let predictiveSignals = 0;
  try {
    const { listPredictiveSignals } = await import('./predictiveAbuse.js');
    const result = await listPredictiveSignals({ status: 'active', entityId: userId, limit: 100, offset: 0 });
    predictiveSignals = result.total || 0;
  } catch (_) {
    predictiveSignals = 0;
  }

  return { activeFlags, predictiveSignals };
}

async function getReportCounts(userId) {
  try {
    const { listByTarget } = await import('./reports.js');
    const reports = await listByTarget(userId);
    return {
      totalReports: reports.length,
      confirmedReports: reports.filter(r => r.status === 'action_taken').length,
    };
  } catch (_) {
    return { totalReports: 0, confirmedReports: 0 };
  }
}

function getAccountAgeDays(user) {
  if (!user || !user.createdAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000));
}

function buildAdminExplanations(input) {
  const out = [];
  for (const [key, value] of Object.entries(input || {})) {
    out.push(`${key}=${value}`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// WorkerTrust data path
// ─────────────────────────────────────────────────────────────

export async function getWorkerTrustScore(userId, options = {}) {
  const { findById } = await import('./users.js');
  const user = await findById(userId);

  if (!user || user.role !== 'worker') return null;

  let totalAcceptedJobs = 0;
  let completedJobs = 0;

  try {
    const { listByWorker } = await import('./applications.js');
    const { findById: findJob } = await import('./jobs.js');

    const apps = await listByWorker(userId);
    const acceptedApps = apps.filter(a => a.status === 'accepted' || a.status === 'worker_confirmed');
    totalAcceptedJobs = acceptedApps.length;

    for (const app of acceptedApps) {
      const job = await findJob(app.jobId);
      if (job && job.status === 'completed') completedJobs++;
    }
  } catch (err) {
    logger.warn('trustScoreV2: worker applications aggregation failed', { userId, error: err.message });
  }

  let totalAttendanceRecords = 0;
  let attendedDays = 0;
  let noShows = 0;

  try {
    const { listByWorker: listAttendanceByWorker } = await import('./attendance.js');
    const records = await listAttendanceByWorker(userId);
    totalAttendanceRecords = records.length;
    attendedDays = records.filter(r =>
      r.status === 'checked_in' ||
      r.status === 'checked_out' ||
      r.status === 'confirmed' ||
      r.employerConfirmed
    ).length;
    noShows = records.filter(r => r.status === 'no_show').length;
  } catch (_) {
    // Attendance data is optional enrichment.
  }

  const reports = await getReportCounts(userId);
  const warnings = await countWarnings(userId);
  const abuse = await getAbuseStateCounts(userId);

  let profileCompletenessScore = 0;
  try {
    const { calculateCompleteness } = await import('./profileCompleteness.js');
    const completeness = calculateCompleteness(user);
    profileCompletenessScore = completeness.score || 0;
  } catch (_) {
    profileCompletenessScore = 0;
  }

  const input = {
    ratingAvg: user.rating?.avg || 0,
    ratingCount: user.rating?.count || 0,
    totalAcceptedJobs,
    completedJobs,
    totalAttendanceRecords,
    attendedDays,
    noShows,
    confirmedReports: reports.confirmedReports,
    totalReports: reports.totalReports,
    warnings,
    activeFlags: abuse.activeFlags,
    predictiveSignals: abuse.predictiveSignals,
    verificationStatus: user.verificationStatus || 'unverified',
    accountAgeDays: getAccountAgeDays(user),
    profileCompletenessScore,
  };

  const calc = calculateWorkerTrustScore(input);
  const result = {
    userId,
    role: 'worker',
    ...calc,
    rawMetrics: input,
    adminExplanations: buildAdminExplanations(input),
    computedAt: new Date().toISOString(),
  };

  return safeOutput(result, options);
}

// ─────────────────────────────────────────────────────────────
// EmployerTrust data path
// ─────────────────────────────────────────────────────────────

export async function getEmployerTrustScore(userId, options = {}) {
  const { findById } = await import('./users.js');
  const user = await findById(userId);

  if (!user || user.role !== 'employer') return null;

  let totalJobs = 0;
  let completedJobs = 0;
  let cancelledJobs = 0;

  try {
    const { getFromSetIndex, readJSON, getRecordPath } = await import('./database.js');
    const jobIds = await getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, userId);
    totalJobs = jobIds.length;

    for (const jobId of jobIds) {
      const job = await readJSON(getRecordPath('jobs', jobId));
      if (!job) continue;
      if (job.status === 'completed') completedJobs++;
      if (job.status === 'cancelled') cancelledJobs++;
    }
  } catch (err) {
    logger.warn('trustScoreV2: employer jobs aggregation failed', { userId, error: err.message });
  }

  let totalPayments = 0;
  let completedPayments = 0;
  let employerConfirmedPayments = 0;
  let disputedPayments = 0;

  try {
    const { listAll: listAllPayments } = await import('./payments.js');
    const payments = await listAllPayments();
    const mine = payments.filter(p => p.employerId === userId);

    totalPayments = mine.length;
    completedPayments = mine.filter(p => p.status === 'completed').length;
    employerConfirmedPayments = mine.filter(p => p.status === 'employer_confirmed').length;
    disputedPayments = mine.filter(p => p.status === 'disputed').length;
  } catch (_) {
    // Optional enrichment.
  }

  let totalDirectOffers = 0;
  let directOfferAcceptRate = 0;
  let directOfferNegativeRate = 0;

  try {
    const { getEmployerOfferStats } = await import('./directOffer.js');
    const stats = await getEmployerOfferStats(userId);
    totalDirectOffers = stats.total || 0;
    directOfferAcceptRate = stats.acceptRate || 0;
    const negative = (stats.declined || 0) + (stats.expired || 0);
    directOfferNegativeRate = stats.total > 0 ? Math.round((negative / stats.total) * 100) : 0;
  } catch (_) {
    // Optional enrichment.
  }

  const reports = await getReportCounts(userId);
  const warnings = await countWarnings(userId);
  const abuse = await getAbuseStateCounts(userId);

  const input = {
    ratingAvg: user.rating?.avg || 0,
    ratingCount: user.rating?.count || 0,
    totalJobs,
    completedJobs,
    cancelledJobs,
    totalPayments,
    completedPayments,
    employerConfirmedPayments,
    disputedPayments,
    totalDirectOffers,
    directOfferAcceptRate,
    directOfferNegativeRate,
    confirmedReports: reports.confirmedReports,
    totalReports: reports.totalReports,
    warnings,
    activeFlags: abuse.activeFlags,
    predictiveSignals: abuse.predictiveSignals,
    verificationStatus: user.verificationStatus || 'unverified',
    accountAgeDays: getAccountAgeDays(user),
  };

  const calc = calculateEmployerTrustScore(input);
  const result = {
    userId,
    role: 'employer',
    ...calc,
    rawMetrics: input,
    adminExplanations: buildAdminExplanations(input),
    computedAt: new Date().toISOString(),
  };

  return safeOutput(result, options);
}

// ─────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────

/**
 * Role-aware Trust Score V2.
 *
 * @param {string} userId
 * @param {{ admin?: boolean, force?: boolean }} options
 */
export async function getTrustScoreV2(userId, options = {}) {
  if (!config.TRUST_SCORE_V2 || !config.TRUST_SCORE_V2.enabled) return null;
  if (!userId) return null;

  const key = cacheKey(userId, options);
  if (!options.force) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const { findById } = await import('./users.js');
  const user = await findById(userId);
  if (!user) return null;

  let result = null;
  if (user.role === 'worker') {
    result = await getWorkerTrustScore(userId, options);
  } else if (user.role === 'employer') {
    result = await getEmployerTrustScore(userId, options);
  } else {
    // Admin/system users are not marketplace participants.
    result = {
      userId,
      role: user.role,
      score: 0.5,
      score100: 50,
      grade: 'fair',
      components: options.admin ? {} : (config.TRUST_SCORE_V2.publicExposeComponents ? {} : undefined),
      explanations: ['هذا النوع من الحسابات لا يملك مؤشر ثقة سوقي مخصص'],
      computedAt: new Date().toISOString(),
    };
  }

  if (result) cacheSet(key, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// EventBus cache invalidation
// ─────────────────────────────────────────────────────────────

function invalidateFromEvent(data) {
  try {
    if (!data) {
      clearTrustScoreV2Cache();
      return;
    }

    const ids = new Set();

    if (data.userId) ids.add(data.userId);
    if (data.workerId) ids.add(data.workerId);
    if (data.employerId) ids.add(data.employerId);
    if (data.toUserId) ids.add(data.toUserId);
    if (data.fromUserId) ids.add(data.fromUserId);
    if (data.targetId) ids.add(data.targetId);
    if (data.entityId) ids.add(data.entityId);
    if (data.relatedUserId) ids.add(data.relatedUserId);

    if (ids.size === 0) {
      clearTrustScoreV2Cache();
      return;
    }

    for (const id of ids) clearTrustScoreV2Cache(id);
  } catch (_) {
    clearTrustScoreV2Cache();
  }
}

const INVALIDATION_EVENTS = [
  'rating:submitted',
  'attendance:noshow',
  'attendance:confirmed',
  'payment:disputed',
  'payment:completed',
  'abuse_flag:state_changed',
  'verification:reviewed',
  'report:reviewed',
  'predictive_abuse:signal_created',
  'predictive_abuse:signal_updated',
  'predictive_abuse:signal_escalated',
];

for (const evt of INVALIDATION_EVENTS) {
  eventBus.on(evt, invalidateFromEvent);
}

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

export const _testHelpers = {
  clamp01,
  round2,
  score100,
  gradeFromScore,
  calculateRatingConfidence,
  calculateAccountAgeScore,
  calculateVerificationScore,
  calculateAbusePenalty,
  weightedScore,
  publicComponents,
  safeOutput,
  cache,
};
