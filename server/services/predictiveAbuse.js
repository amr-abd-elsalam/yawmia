// ═══════════════════════════════════════════════════════════════
// server/services/predictiveAbuse.js — Predictive Abuse Intelligence (Phase 51)
// ═══════════════════════════════════════════════════════════════
// Explainable predictive abuse signals without ML dependencies.
// Uses deterministic rolling baselines + z-score + rule blending.
// No auto-ban. Admin review only.
//
// Signal persistence:
//   data/predictive_signals/sig_xxx.json
//
// EventBus:
//   predictive_abuse:signal_created
//   predictive_abuse:signal_updated
//   predictive_abuse:signal_escalated
//   predictive_abuse:scan_completed
//   predictive_abuse:scan_failed
//   predictive_signal:false_positive
//   predictive_signal:confirmed
//   predictive_signal:archived
//   predictive_signal:retention_completed
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
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

const SIGNAL_PREFIX = 'sig_';

/** @type {Map<string, { value: *, expiresAt: number }>} */
const cache = new Map();

let lastScanAt = null;
let lastScanDurationMs = 0;
let lastScanSignalCount = 0;
let lastScanError = null;

// ─────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────

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
  const ttl = config.PREDICTIVE_ABUSE?.cacheTtlMs || (5 * 60 * 1000);
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

function clearCache() {
  cache.clear();
}

// ─────────────────────────────────────────────────────────────
// Pure math helpers
// ─────────────────────────────────────────────────────────────

/**
 * Calculate z-score for a current rate against baseline binomial variance.
 * Safe for small/edge values.
 *
 * @param {number} currentRate 0..1
 * @param {number} baselineRate 0..1
 * @param {number} sampleSize current sample size
 * @returns {number}
 */
export function calculateZScore(currentRate, baselineRate, sampleSize) {
  const n = Math.max(1, Number(sampleSize) || 1);
  const p = Math.max(0.01, Math.min(0.99, Number(baselineRate) || 0.01));
  const variance = (p * (1 - p)) / n;
  const sd = Math.sqrt(Math.max(variance, 0.0001));
  const z = (Number(currentRate || 0) - p) / sd;
  return Math.round(z * 100) / 100;
}

/**
 * Normalize risk score to 0..1 from z-score + rate delta + volume factor.
 *
 * @param {{ zScore?: number, delta?: number, volumeFactor?: number, base?: number }} input
 * @returns {number}
 */
export function normalizeRiskScore(input = {}) {
  const z = Math.max(0, Number(input.zScore) || 0);
  const delta = Math.max(0, Number(input.delta) || 0);
  const volume = Math.max(0, Math.min(1, Number(input.volumeFactor) || 0));
  const base = Math.max(0, Math.min(1, Number(input.base) || 0));

  // z contributes up to 0.45, delta up to 0.35, volume/base up to 0.20.
  const zPart = Math.min(z / 4, 1) * 0.45;
  const deltaPart = Math.min(delta, 1) * 0.35;
  const volumePart = Math.max(volume, base) * 0.20;

  const score = Math.max(0, Math.min(1, zPart + deltaPart + volumePart));
  return Math.round(score * 100) / 100;
}

/**
 * Classify severity from risk score + z-score.
 *
 * @param {number} riskScore
 * @param {number} [zScore]
 * @returns {'low'|'medium'|'high'|'critical'}
 */
export function classifySeverity(riskScore, zScore = 0) {
  const thresholds = config.PREDICTIVE_ABUSE?.thresholds || {};
  const medium = thresholds.riskMedium ?? 0.5;
  const high = thresholds.riskHigh ?? 0.75;
  const critical = thresholds.riskCritical ?? 0.9;
  const zCritical = thresholds.zScoreCritical ?? 3.0;

  if (riskScore >= critical || zScore >= zCritical + 1) return 'critical';
  if (riskScore >= high || zScore >= zCritical) return 'high';
  if (riskScore >= medium) return 'medium';
  return 'low';
}

function safeRate(num, den) {
  if (!den || den <= 0) return 0;
  return Math.max(0, Math.min(1, num / den));
}

function hoursAgo(hours, nowMs) {
  return nowMs - hours * 60 * 60 * 1000;
}

function daysAgo(days, nowMs) {
  return nowMs - days * 24 * 60 * 60 * 1000;
}

function offerTimeMs(offer) {
  return new Date(offer.createdAt || offer.notifiedAt || 0).getTime();
}

function decisionTimeMs(offer) {
  return new Date(offer.acceptedAt || offer.declinedAt || offer.expiredAt || offer.withdrawnAt || offer.updatedAt || offer.createdAt || 0).getTime();
}

function isNegativeOffer(offer) {
  return offer && (offer.status === 'declined' || offer.status === 'expired');
}

function isDecidedOffer(offer) {
  return offer && (offer.status === 'accepted' || offer.status === 'declined' || offer.status === 'expired');
}

function dateWindowKey(toMs, shortHours) {
  const d = new Date(toMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:last${shortHours}h`;
}

function buildFingerprint({ riskType, entityType, entityId, relatedUserId, windowKey }) {
  const raw = `${riskType}:${entityType}:${entityId || ''}:${relatedUserId || ''}:${windowKey || ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function buildSignal(fields) {
  const nowIso = new Date().toISOString();
  return {
    riskType: fields.riskType,
    entityType: fields.entityType,
    entityId: fields.entityId,
    relatedUserId: fields.relatedUserId || null,
    riskScore: fields.riskScore,
    severity: fields.severity,
    window: fields.window,
    metrics: fields.metrics || {},
    explanations: fields.explanations || [],
    fingerprint: fields.fingerprint,
    status: 'active',
    reviewedAt: null,
    reviewedBy: null,
    reviewDecision: null,
    reviewNote: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

// ─────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────

async function listAllOffers() {
  try {
    const dir = getCollectionPath('direct_offers');
    const all = await listJSON(dir);
    return all.filter(o => o && o.id && o.id.startsWith('dof_'));
  } catch (err) {
    logger.warn('predictiveAbuse: listAllOffers failed', { error: err.message });
    return [];
  }
}

async function listAllSignalsRaw() {
  try {
    const dir = getCollectionPath('predictive_signals');
    const all = await listJSON(dir);
    return all.filter(s => s && s.id && s.id.startsWith(SIGNAL_PREFIX));
  } catch (err) {
    logger.warn('predictiveAbuse: listAllSignalsRaw failed', { error: err.message });
    return [];
  }
}

async function loadReviewStates() {
  try {
    const mod = await import('./abuseFlagReview.js');
    const states = await mod.listAllReviewStates();
    return Array.isArray(states) ? states : [];
  } catch (_) {
    return [];
  }
}

async function loadWarningsByUser(userId) {
  if (!userId) return 0;
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

function getActiveReviewStateCount(states, userId) {
  if (!userId) return 0;
  return states.filter(s =>
    s &&
    s.currentStatus !== 'dismissed' &&
    s.currentStatus !== 'actioned' &&
    (s.employerId === userId || s.workerId === userId)
  ).length;
}

// ─────────────────────────────────────────────────────────────
// Detection helpers
// ─────────────────────────────────────────────────────────────

/**
 * Detect employer decline/expire spike vs rolling baseline.
 *
 * @param {object[]} offers
 * @param {object} opts
 * @returns {Array<object>}
 */
export function detectEmployerDeclineSpike(offers, opts = {}) {
  const cfg = opts.config || config.PREDICTIVE_ABUSE || {};
  const nowMs = opts.nowMs || Date.now();
  const shortHours = cfg.windows?.shortHours || 24;
  const baselineDays = cfg.windows?.baselineDays || 14;
  const minSamples = cfg.minSamples?.employerOffers || 10;
  const zWarn = cfg.thresholds?.zScoreWarning || 2.0;
  const windowFromMs = hoursAgo(shortHours, nowMs);
  const baselineFromMs = daysAgo(baselineDays, nowMs);
  const windowKey = dateWindowKey(nowMs, shortHours);

  const byEmployer = new Map();

  for (const offer of offers) {
    if (!offer || !offer.employerId || !offer.createdAt) continue;
    const t = offerTimeMs(offer);
    if (t < baselineFromMs || t > nowMs) continue;

    if (!byEmployer.has(offer.employerId)) {
      byEmployer.set(offer.employerId, {
        currentTotal: 0,
        currentNegative: 0,
        baselineTotal: 0,
        baselineNegative: 0,
      });
    }

    const row = byEmployer.get(offer.employerId);
    const negative = isNegativeOffer(offer);

    if (t >= windowFromMs) {
      row.currentTotal++;
      if (negative) row.currentNegative++;
    } else {
      row.baselineTotal++;
      if (negative) row.baselineNegative++;
    }
  }

  const signals = [];
  for (const [employerId, m] of byEmployer) {
    if (m.currentTotal < minSamples) continue;

    const currentRate = safeRate(m.currentNegative, m.currentTotal);
    const baselineRate = m.baselineTotal > 0
      ? safeRate(m.baselineNegative, m.baselineTotal)
      : 0.25;

    const zScore = calculateZScore(currentRate, baselineRate, m.currentTotal);
    if (zScore < zWarn) continue;

    const delta = Math.max(0, currentRate - baselineRate);
    const volumeFactor = Math.min(1, m.currentTotal / (minSamples * 3));
    const riskScore = normalizeRiskScore({ zScore, delta, volumeFactor });
    const severity = classifySeverity(riskScore, zScore);

    signals.push(buildSignal({
      riskType: 'employer_decline_spike',
      entityType: 'employer',
      entityId: employerId,
      riskScore,
      severity,
      window: {
        from: new Date(windowFromMs).toISOString(),
        to: new Date(nowMs).toISOString(),
      },
      metrics: {
        currentRate: Math.round(currentRate * 100) / 100,
        baselineRate: Math.round(baselineRate * 100) / 100,
        zScore,
        sampleSize: m.currentTotal,
        currentNegative: m.currentNegative,
        baselineSampleSize: m.baselineTotal,
      },
      explanations: [
        `decline/expire rate ${Math.round(currentRate * 100)}% over ${shortHours}h vs baseline ${Math.round(baselineRate * 100)}%`,
        `zScore=${zScore}`,
        `sampleSize=${m.currentTotal}`,
      ],
      fingerprint: buildFingerprint({
        riskType: 'employer_decline_spike',
        entityType: 'employer',
        entityId: employerId,
        windowKey,
      }),
    }));
  }

  return signals;
}

/**
 * Detect worker offer bombing risk: high volume + unique employers + baseline anomaly.
 *
 * @param {object[]} offers
 * @param {object} opts
 * @returns {Array<object>}
 */
export function detectWorkerOfferBombingRisk(offers, opts = {}) {
  const cfg = opts.config || config.PREDICTIVE_ABUSE || {};
  const nowMs = opts.nowMs || Date.now();
  const bombingMinutes = cfg.windows?.bombingMinutes || 60;
  const baselineDays = cfg.windows?.baselineDays || 14;
  const minSamples = cfg.minSamples?.workerReceivedOffers || 10;
  const zWarn = cfg.thresholds?.zScoreWarning || 2.0;
  const windowFromMs = nowMs - bombingMinutes * 60 * 1000;
  const baselineFromMs = daysAgo(baselineDays, nowMs);
  const windowKey = `${new Date(nowMs).toISOString().slice(0, 13)}:last${bombingMinutes}m`;

  const byWorker = new Map();

  for (const offer of offers) {
    if (!offer || !offer.workerId || !offer.createdAt) continue;
    const t = offerTimeMs(offer);
    if (t < baselineFromMs || t > nowMs) continue;

    if (!byWorker.has(offer.workerId)) {
      byWorker.set(offer.workerId, {
        currentTotal: 0,
        currentEmployers: new Set(),
        baselineTotal: 0,
        baselineHours: Math.max(1, baselineDays * 24),
      });
    }

    const row = byWorker.get(offer.workerId);

    if (t >= windowFromMs) {
      row.currentTotal++;
      if (offer.employerId) row.currentEmployers.add(offer.employerId);
    } else {
      row.baselineTotal++;
    }
  }

  const signals = [];

  for (const [workerId, m] of byWorker) {
    if (m.currentTotal < minSamples) continue;

    const baselinePerWindow = Math.max(
      0.1,
      (m.baselineTotal / m.baselineHours) * (bombingMinutes / 60)
    );

    const currentRate = m.currentTotal;
    const baselineRate = baselinePerWindow;
    const zScore = Math.round(((currentRate - baselineRate) / Math.sqrt(Math.max(baselineRate, 1))) * 100) / 100;

    const uniqueEmployers = m.currentEmployers.size;
    const uniqueFactor = Math.min(1, uniqueEmployers / Math.max(3, minSamples / 2));
    const volumeFactor = Math.min(1, m.currentTotal / (minSamples * 3));
    const delta = Math.min(1, Math.max(0, (m.currentTotal - baselinePerWindow) / Math.max(minSamples, 1)));

    const riskScore = normalizeRiskScore({
      zScore,
      delta,
      volumeFactor: Math.max(uniqueFactor, volumeFactor),
    });

    if (zScore < zWarn && riskScore < (cfg.thresholds?.riskMedium || 0.5)) continue;

    const severity = classifySeverity(riskScore, zScore);

    signals.push(buildSignal({
      riskType: 'worker_offer_bombing_probability',
      entityType: 'worker',
      entityId: workerId,
      riskScore,
      severity,
      window: {
        from: new Date(windowFromMs).toISOString(),
        to: new Date(nowMs).toISOString(),
      },
      metrics: {
        receivedOffers: m.currentTotal,
        uniqueEmployers,
        baselineExpectedOffers: Math.round(baselinePerWindow * 100) / 100,
        zScore,
        sampleSize: m.currentTotal,
      },
      explanations: [
        `worker received ${m.currentTotal} offers in ${bombingMinutes} minutes`,
        `${uniqueEmployers} unique employers`,
        `baselineExpected=${Math.round(baselinePerWindow * 100) / 100}`,
        `zScore=${zScore}`,
      ],
      fingerprint: buildFingerprint({
        riskType: 'worker_offer_bombing_probability',
        entityType: 'worker',
        entityId: workerId,
        windowKey,
      }),
    }));
  }

  return signals;
}

/**
 * Detect same-worker harassment likelihood.
 *
 * @param {object[]} offers
 * @param {object} opts
 * @returns {Array<object>}
 */
export function detectSameWorkerHarassmentRisk(offers, opts = {}) {
  const cfg = opts.config || config.PREDICTIVE_ABUSE || {};
  const nowMs = opts.nowMs || Date.now();
  const shortHours = cfg.windows?.shortHours || 24;
  const minSamples = cfg.minSamples?.sameWorkerPairOffers || 4;
  const windowFromMs = hoursAgo(shortHours, nowMs);
  const windowKey = dateWindowKey(nowMs, shortHours);

  const pairs = new Map();

  for (const offer of offers) {
    if (!offer || !offer.employerId || !offer.workerId || !offer.createdAt) continue;
    const t = offerTimeMs(offer);
    if (t < windowFromMs || t > nowMs) continue;

    const key = `${offer.employerId}:${offer.workerId}`;
    if (!pairs.has(key)) {
      pairs.set(key, {
        employerId: offer.employerId,
        workerId: offer.workerId,
        total: 0,
        declined: 0,
        expired: 0,
        viewed: 0,
      });
    }

    const row = pairs.get(key);
    row.total++;
    if (offer.status === 'declined') row.declined++;
    if (offer.status === 'expired') row.expired++;
    if (offer.viewedAt) row.viewed++;
  }

  const signals = [];
  for (const p of pairs.values()) {
    if (p.total < minSamples) continue;

    const negative = p.declined + p.expired;
    const negativeRate = safeRate(negative, p.total);
    const viewedRate = safeRate(p.viewed, p.total);

    // repeated offers + repeated negative response = likely unwanted pressure.
    const base = Math.min(1, p.total / (minSamples * 2));
    const delta = Math.max(0, negativeRate - 0.5);
    const zScore = calculateZScore(negativeRate, 0.5, p.total);
    const riskScore = normalizeRiskScore({
      zScore,
      delta,
      volumeFactor: Math.max(base, viewedRate * 0.5),
    });

    if (riskScore < (cfg.thresholds?.riskMedium || 0.5)) continue;

    const severity = classifySeverity(riskScore, zScore);

    signals.push(buildSignal({
      riskType: 'same_worker_harassment_likelihood',
      entityType: 'employer',
      entityId: p.employerId,
      relatedUserId: p.workerId,
      riskScore,
      severity,
      window: {
        from: new Date(windowFromMs).toISOString(),
        to: new Date(nowMs).toISOString(),
      },
      metrics: {
        pairOfferCount: p.total,
        declinedOrExpired: negative,
        negativeRate: Math.round(negativeRate * 100) / 100,
        viewedRate: Math.round(viewedRate * 100) / 100,
        zScore,
        sampleSize: p.total,
      },
      explanations: [
        `employer sent ${p.total} offers to same worker over ${shortHours}h`,
        `${negative} declined/expired`,
        `negativeRate=${Math.round(negativeRate * 100)}%`,
      ],
      fingerprint: buildFingerprint({
        riskType: 'same_worker_harassment_likelihood',
        entityType: 'employer',
        entityId: p.employerId,
        relatedUserId: p.workerId,
        windowKey,
      }),
    }));
  }

  return signals;
}

async function detectEmployerToxicOfferBehavior(offers, reviewStates, nowMs) {
  const cfg = config.PREDICTIVE_ABUSE || {};
  const shortHours = cfg.windows?.shortHours || 24;
  const baselineDays = cfg.windows?.baselineDays || 14;
  const fromMs = daysAgo(baselineDays, nowMs);
  const windowKey = dateWindowKey(nowMs, shortHours);

  const byEmployer = new Map();

  for (const offer of offers) {
    if (!offer || !offer.employerId || !offer.createdAt) continue;
    const t = offerTimeMs(offer);
    if (t < fromMs || t > nowMs) continue;

    if (!byEmployer.has(offer.employerId)) {
      byEmployer.set(offer.employerId, {
        total: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        withdrawn: 0,
      });
    }

    const row = byEmployer.get(offer.employerId);
    row.total++;
    if (offer.status === 'accepted') row.accepted++;
    else if (offer.status === 'declined') row.declined++;
    else if (offer.status === 'expired') row.expired++;
    else if (offer.status === 'withdrawn') row.withdrawn++;
  }

  const signals = [];

  for (const [employerId, m] of byEmployer) {
    if (m.total < (cfg.minSamples?.employerOffers || 10)) continue;

    const negative = m.declined + m.expired;
    const negativeRate = safeRate(negative, m.total);
    const acceptRate = safeRate(m.accepted, m.accepted + m.declined + m.expired);
    const warnings = await loadWarningsByUser(employerId);
    const activeFlags = getActiveReviewStateCount(reviewStates, employerId);

    const behaviorPenalty = Math.min(1,
      negativeRate * 0.45 +
      (1 - acceptRate) * 0.25 +
      Math.min(warnings / 3, 1) * 0.15 +
      Math.min(activeFlags / 3, 1) * 0.15
    );

    const riskScore = Math.round(behaviorPenalty * 100) / 100;
    if (riskScore < (cfg.thresholds?.riskMedium || 0.5)) continue;

    const severity = classifySeverity(riskScore, calculateZScore(negativeRate, 0.4, m.total));

    signals.push(buildSignal({
      riskType: 'employer_toxic_offer_behavior',
      entityType: 'employer',
      entityId: employerId,
      riskScore,
      severity,
      window: {
        from: new Date(fromMs).toISOString(),
        to: new Date(nowMs).toISOString(),
      },
      metrics: {
        totalOffers: m.total,
        accepted: m.accepted,
        declined: m.declined,
        expired: m.expired,
        negativeRate: Math.round(negativeRate * 100) / 100,
        acceptRate: Math.round(acceptRate * 100) / 100,
        warnings,
        activeFlags,
      },
      explanations: [
        `negative offer rate ${Math.round(negativeRate * 100)}% over ${baselineDays}d`,
        `acceptRate=${Math.round(acceptRate * 100)}%`,
        `warnings=${warnings}`,
        `activeFlags=${activeFlags}`,
      ],
      fingerprint: buildFingerprint({
        riskType: 'employer_toxic_offer_behavior',
        entityType: 'employer',
        entityId: employerId,
        windowKey,
      }),
    }));
  }

  return signals;
}

async function detectWorkerReliabilityAnomaly(offers, nowMs) {
  const cfg = config.PREDICTIVE_ABUSE || {};
  const shortHours = cfg.windows?.shortHours || 24;
  const fromMs = daysAgo(cfg.windows?.baselineDays || 14, nowMs);
  const windowKey = dateWindowKey(nowMs, shortHours);

  const byWorker = new Map();

  for (const offer of offers) {
    if (!offer || !offer.workerId || !offer.createdAt) continue;
    const t = offerTimeMs(offer);
    if (t < fromMs || t > nowMs) continue;

    if (!byWorker.has(offer.workerId)) {
      byWorker.set(offer.workerId, {
        total: 0,
        viewed: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
      });
    }

    const row = byWorker.get(offer.workerId);
    row.total++;
    if (offer.viewedAt) row.viewed++;
    if (offer.status === 'accepted') row.accepted++;
    else if (offer.status === 'declined') row.declined++;
    else if (offer.status === 'expired') row.expired++;
  }

  const signals = [];

  for (const [workerId, m] of byWorker) {
    if (m.total < (cfg.minSamples?.workerReceivedOffers || 10)) continue;

    const responseNegative = m.declined + m.expired;
    const noResponseRate = safeRate(m.expired, m.total);
    const negativeAfterViewRate = m.viewed > 0 ? safeRate(m.declined + m.expired, m.viewed) : 0;
    const acceptRate = safeRate(m.accepted, m.accepted + m.declined + m.expired);

    // This does not blame the worker alone; it marks an anomaly for admin review.
    const riskScore = Math.round(Math.min(1,
      noResponseRate * 0.35 +
      negativeAfterViewRate * 0.35 +
      (1 - acceptRate) * 0.20 +
      Math.min(m.total / 50, 1) * 0.10
    ) * 100) / 100;

    if (riskScore < (cfg.thresholds?.riskMedium || 0.5)) continue;

    const zScore = calculateZScore(responseNegative / Math.max(1, m.total), 0.45, m.total);
    const severity = classifySeverity(riskScore, zScore);

    signals.push(buildSignal({
      riskType: 'worker_reliability_anomaly',
      entityType: 'worker',
      entityId: workerId,
      riskScore,
      severity,
      window: {
        from: new Date(fromMs).toISOString(),
        to: new Date(nowMs).toISOString(),
      },
      metrics: {
        totalReceived: m.total,
        viewed: m.viewed,
        accepted: m.accepted,
        declined: m.declined,
        expired: m.expired,
        noResponseRate: Math.round(noResponseRate * 100) / 100,
        negativeAfterViewRate: Math.round(negativeAfterViewRate * 100) / 100,
        acceptRate: Math.round(acceptRate * 100) / 100,
        zScore,
      },
      explanations: [
        `worker received ${m.total} offers over baseline window`,
        `expired/no-response rate ${Math.round(noResponseRate * 100)}%`,
        `negative-after-view rate ${Math.round(negativeAfterViewRate * 100)}%`,
        `acceptRate=${Math.round(acceptRate * 100)}%`,
      ],
      fingerprint: buildFingerprint({
        riskType: 'worker_reliability_anomaly',
        entityType: 'worker',
        entityId: workerId,
        windowKey,
      }),
    }));
  }

  return signals;
}

// ─────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────

function generateSignalId() {
  return SIGNAL_PREFIX + crypto.randomBytes(6).toString('hex');
}

async function persistSignals(signals) {
  if (!config.PREDICTIVE_ABUSE?.persistSignals) {
    return { created: 0, updated: 0, signals };
  }

  const existingSignals = await listAllSignalsRaw();
  const byFingerprint = new Map();

  for (const sig of existingSignals) {
    if (sig.fingerprint && sig.status === 'active') {
      byFingerprint.set(sig.fingerprint, sig);
    }
  }

  let created = 0;
  let updated = 0;
  const persisted = [];

  for (const signal of signals) {
    if (!signal.fingerprint) continue;

    await withLock(`predictive-signal:${signal.fingerprint}`, async () => {
      const existing = byFingerprint.get(signal.fingerprint);

      if (existing) {
        const previousSeverity = existing.severity;
        const next = {
          ...existing,
          riskScore: signal.riskScore,
          severity: signal.severity,
          window: signal.window,
          metrics: signal.metrics,
          explanations: signal.explanations,
          updatedAt: new Date().toISOString(),
        };

        await atomicWrite(getRecordPath('predictive_signals', existing.id), next);
        updated++;
        persisted.push(next);

        eventBus.emit('predictive_abuse:signal_updated', {
          signalId: next.id,
          riskType: next.riskType,
          entityType: next.entityType,
          entityId: next.entityId,
          severity: next.severity,
          riskScore: next.riskScore,
          timestamp: new Date().toISOString(),
        });

        const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
        if ((severityOrder[next.severity] || 0) > (severityOrder[previousSeverity] || 0)) {
          eventBus.emit('predictive_abuse:signal_escalated', {
            signalId: next.id,
            riskType: next.riskType,
            entityType: next.entityType,
            entityId: next.entityId,
            previousSeverity,
            severity: next.severity,
            riskScore: next.riskScore,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        const id = generateSignalId();
        const next = { id, ...signal };

        await atomicWrite(getRecordPath('predictive_signals', id), next);
        created++;
        persisted.push(next);
        byFingerprint.set(signal.fingerprint, next);

        eventBus.emit('predictive_abuse:signal_created', {
          signalId: id,
          riskType: next.riskType,
          entityType: next.entityType,
          entityId: next.entityId,
          relatedUserId: next.relatedUserId || null,
          severity: next.severity,
          riskScore: next.riskScore,
          explanations: next.explanations,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  return { created, updated, signals: persisted };
}

// ─────────────────────────────────────────────────────────────
// Public service API
// ─────────────────────────────────────────────────────────────

/**
 * Run predictive abuse scan.
 *
 * @param {{ force?: boolean, persist?: boolean }} options
 */
export async function runPredictiveScan(options = {}) {
  if (!config.PREDICTIVE_ABUSE || !config.PREDICTIVE_ABUSE.enabled) {
    return { enabled: false, signals: [], signalCount: 0 };
  }

  const cacheKey = 'predictive-scan:last';
  if (!options.force) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  const started = Date.now();

  return withLock('predictive-abuse-scan-global', async () => {
    try {
      const nowMs = Date.now();
      const offers = await listAllOffers();
      const reviewStates = await loadReviewStates();

      let signals = [
        ...detectEmployerDeclineSpike(offers, { nowMs }),
        ...detectWorkerOfferBombingRisk(offers, { nowMs }),
        ...detectSameWorkerHarassmentRisk(offers, { nowMs }),
        ...(await detectEmployerToxicOfferBehavior(offers, reviewStates, nowMs)),
        ...(await detectWorkerReliabilityAnomaly(offers, nowMs)),
      ];

      // Keep only meaningful risk signals.
      signals = signals.filter(s =>
        s &&
        s.riskScore >= (config.PREDICTIVE_ABUSE.thresholds?.riskMedium || 0.5) &&
        Array.isArray(s.explanations) &&
        s.explanations.length > 0
      );

      // Sort risk-first, then newest.
      signals.sort((a, b) => b.riskScore - a.riskScore || (severityRank(b.severity) - severityRank(a.severity)));

      const max = config.PREDICTIVE_ABUSE.maxSignalsPerScan || 100;
      signals = signals.slice(0, max);

      let persistResult = { created: 0, updated: 0, signals };
      if (options.persist !== false) {
        persistResult = await persistSignals(signals);
      }

      const durationMs = Date.now() - started;

      const result = {
        enabled: true,
        generatedAt: new Date().toISOString(),
        durationMs,
        scannedOffers: offers.length,
        signalCount: persistResult.signals.length,
        created: persistResult.created,
        updated: persistResult.updated,
        signals: persistResult.signals,
        noAutoBan: true,
      };

      lastScanAt = result.generatedAt;
      lastScanDurationMs = durationMs;
      lastScanSignalCount = result.signalCount;
      lastScanError = null;

      eventBus.emit('predictive_abuse:scan_completed', {
        signalCount: result.signalCount,
        created: result.created,
        updated: result.updated,
        scannedOffers: offers.length,
        durationMs,
        timestamp: result.generatedAt,
      });

      cacheSet(cacheKey, result);
      clearCache(); // dashboard/list caches should refresh after a scan
      return result;
    } catch (err) {
      const durationMs = Date.now() - started;
      lastScanAt = new Date().toISOString();
      lastScanDurationMs = durationMs;
      lastScanError = err.message;

      eventBus.emit('predictive_abuse:scan_failed', {
        error: err.message,
        durationMs,
        timestamp: lastScanAt,
      });

      logger.warn('predictiveAbuse: scan failed', { error: err.message });
      return {
        enabled: true,
        generatedAt: lastScanAt,
        durationMs,
        signalCount: 0,
        signals: [],
        error: err.message,
        noAutoBan: true,
      };
    }
  });
}

function severityRank(severity) {
  return ({ low: 1, medium: 2, high: 3, critical: 4 })[severity] || 0;
}

/**
 * List persisted predictive signals.
 *
 * @param {{ status?: string, severity?: string, riskType?: string, entityId?: string, limit?: number, offset?: number }} options
 */
export async function listPredictiveSignals(options = {}) {
  if (!config.PREDICTIVE_ABUSE || !config.PREDICTIVE_ABUSE.enabled) {
    return { signals: [], total: 0, limit: 20, offset: 0 };
  }

  const cacheKey = `signals:${JSON.stringify(options)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let signals = await listAllSignalsRaw();

  if (options.status) signals = signals.filter(s => s.status === options.status);
  if (options.severity) signals = signals.filter(s => s.severity === options.severity);
  if (options.riskType) signals = signals.filter(s => s.riskType === options.riskType);
  if (options.entityId) signals = signals.filter(s => s.entityId === options.entityId || s.relatedUserId === options.entityId);

  signals.sort((a, b) =>
    (severityRank(b.severity) - severityRank(a.severity)) ||
    ((b.riskScore || 0) - (a.riskScore || 0)) ||
    (new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
  );

  const total = signals.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  const result = {
    signals: signals.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };

  cacheSet(cacheKey, result);
  return result;
}

/**
 * Get predictive dashboard aggregate.
 */
export async function getPredictiveDashboard(options = {}) {
  if (!config.PREDICTIVE_ABUSE || !config.PREDICTIVE_ABUSE.enabled) {
    return { enabled: false, metrics: {}, signals: [] };
  }

  const cacheKey = `dashboard:${JSON.stringify(options)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const list = await listPredictiveSignals({
    status: options.status || 'active',
    limit: options.limit || 20,
    offset: 0,
  });

  const allActive = await listAllSignalsRaw();
  const active = allActive.filter(s => s.status === 'active');

  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  const byRiskType = {};

  for (const s of active) {
    if (bySeverity[s.severity] !== undefined) bySeverity[s.severity]++;
    byRiskType[s.riskType] = (byRiskType[s.riskType] || 0) + 1;
  }

  const avgRiskScore = active.length > 0
    ? Math.round((active.reduce((sum, s) => sum + (s.riskScore || 0), 0) / active.length) * 100) / 100
    : 0;

  const result = {
    enabled: true,
    generatedAt: new Date().toISOString(),
    metrics: {
      activeSignals: active.length,
      highOrCritical: active.filter(s => s.severity === 'high' || s.severity === 'critical').length,
      avgRiskScore,
      bySeverity,
      byRiskType,
      lastScanAt,
      lastScanDurationMs,
      lastScanSignalCount,
      lastScanError,
    },
    signals: list.signals,
    total: list.total,
  };

  cacheSet(cacheKey, result);
  return result;
}

/**
 * Dismiss a predictive signal.
 */
export async function dismissSignal(signalId, adminId, note) {
  return reviewSignal(signalId, adminId, 'dismissed', note);
}

/**
 * Escalate a predictive signal for admin action.
 */
export async function escalateSignal(signalId, adminId, note) {
  return reviewSignal(signalId, adminId, 'escalated', note);
}

/**
 * Phase 53: Mark predictive signal as false positive.
 * This is a quality label, not a user penalty.
 *
 * Allowed source statuses:
 *   - active
 *   - escalated
 *   - dismissed
 *
 * @param {string} signalId
 * @param {string} adminId
 * @param {string} note
 */
export async function markSignalFalsePositive(signalId, adminId, note) {
  return markSignalOutcome(signalId, adminId, 'false_positive', note);
}

/**
 * Phase 53: Mark predictive signal as confirmed.
 * This records that the signal was useful/true-positive.
 * No auto-ban is performed.
 *
 * Allowed source statuses:
 *   - active
 *   - escalated
 *
 * @param {string} signalId
 * @param {string} adminId
 * @param {string} note
 */
export async function markSignalConfirmed(signalId, adminId, note) {
  return markSignalOutcome(signalId, adminId, 'confirmed', note);
}

async function markSignalOutcome(signalId, adminId, outcome, note) {
  if (!signalId || typeof signalId !== 'string') {
    throw new Error('signalId is required');
  }

  const allowedOutcomes = ['false_positive', 'confirmed'];
  if (!allowedOutcomes.includes(outcome)) {
    throw new Error('invalid predictive signal outcome');
  }

  return withLock(`predictive-signal-review:${signalId}`, async () => {
    const path = getRecordPath('predictive_signals', signalId);
    const signal = await readJSON(path);

    if (!signal) {
      return { ok: false, error: 'الإشارة غير موجودة', code: 'SIGNAL_NOT_FOUND' };
    }

    const allowedSourceStatuses = outcome === 'false_positive'
      ? ['active', 'escalated', 'dismissed']
      : ['active', 'escalated'];

    if (!allowedSourceStatuses.includes(signal.status)) {
      return { ok: false, error: 'لا يمكن تحديث هذه الإشارة بهذه الحالة', code: 'SIGNAL_STATUS_NOT_ALLOWED' };
    }

    const previousStatus = signal.status;
    const now = new Date().toISOString();

    signal.status = outcome;
    signal.reviewedAt = signal.reviewedAt || now;
    signal.reviewedBy = adminId || signal.reviewedBy || 'admin_token';
    signal.reviewDecision = outcome;
    signal.reviewNote = note || signal.reviewNote || null;
    signal.outcomeAt = now;
    signal.outcomeBy = adminId || 'admin_token';
    signal.outcomeNote = note || null;
    signal.previousStatus = previousStatus;
    signal.updatedAt = now;

    await atomicWrite(path, signal);

    clearCache();

    eventBus.emit(
      outcome === 'false_positive' ? 'predictive_signal:false_positive' : 'predictive_signal:confirmed',
      {
        signalId: signal.id,
        riskType: signal.riskType,
        entityType: signal.entityType,
        entityId: signal.entityId,
        relatedUserId: signal.relatedUserId || null,
        previousStatus,
        severity: signal.severity,
        riskScore: signal.riskScore,
        reviewedBy: signal.reviewedBy,
        timestamp: now,
      }
    );

    return { ok: true, signal };
  });
}

async function reviewSignal(signalId, adminId, decision, note) {
  if (!signalId || typeof signalId !== 'string') {
    throw new Error('signalId is required');
  }

  return withLock(`predictive-signal-review:${signalId}`, async () => {
    const path = getRecordPath('predictive_signals', signalId);
    const signal = await readJSON(path);

    if (!signal) {
      return { ok: false, error: 'الإشارة غير موجودة', code: 'SIGNAL_NOT_FOUND' };
    }

    if (signal.status !== 'active') {
      return { ok: false, error: 'تمت مراجعة الإشارة بالفعل', code: 'SIGNAL_ALREADY_REVIEWED' };
    }

    signal.status = decision;
    signal.reviewedAt = new Date().toISOString();
    signal.reviewedBy = adminId || 'admin_token';
    signal.reviewDecision = decision;
    signal.reviewNote = note || null;
    signal.updatedAt = signal.reviewedAt;

    await atomicWrite(path, signal);

    clearCache();

    if (decision === 'escalated') {
      eventBus.emit('predictive_abuse:signal_escalated', {
        signalId: signal.id,
        riskType: signal.riskType,
        entityType: signal.entityType,
        entityId: signal.entityId,
        relatedUserId: signal.relatedUserId || null,
        severity: signal.severity,
        riskScore: signal.riskScore,
        reviewedBy: signal.reviewedBy,
        timestamp: signal.reviewedAt,
      });
    }

    return { ok: true, signal };
  });
}

/**
 * Get lightweight stats for health/admin.
 */
export async function getPredictiveStats() {
  const all = await listAllSignalsRaw();
  const active = all.filter(s => s.status === 'active');
  return {
    enabled: !!(config.PREDICTIVE_ABUSE && config.PREDICTIVE_ABUSE.enabled),
    totalSignals: all.length,
    activeSignals: active.length,
    highOrCritical: active.filter(s => s.severity === 'high' || s.severity === 'critical').length,
    lastScanAt,
    lastScanDurationMs,
    lastScanSignalCount,
    lastScanError,
  };
}

export function clearPredictiveAbuseCache() {
  clearCache();
}

// ─────────────────────────────────────────────────────────────
// EventBus cache invalidation
// ─────────────────────────────────────────────────────────────

const INVALIDATION_EVENTS = [
  'direct_offer:created',
  'direct_offer:accepted',
  'direct_offer:declined',
  'direct_offer:expired',
  'direct_offer:withdrawn',
  'abuse_flag:state_changed',
  'attendance:noshow',
  'predictive_signal:false_positive',
  'predictive_signal:confirmed',
  'predictive_signal:archived',
  'predictive_signal:retention_completed',
];

for (const evt of INVALIDATION_EVENTS) {
  eventBus.on(evt, () => {
    clearCache();
  });
}

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

export const _testHelpers = {
  calculateZScore,
  normalizeRiskScore,
  classifySeverity,
  detectEmployerDeclineSpike,
  detectWorkerOfferBombingRisk,
  detectSameWorkerHarassmentRisk,
  buildFingerprint,
  buildSignal,
  safeRate,
  clearCache,
};
