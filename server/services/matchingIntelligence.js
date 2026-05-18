// ═══════════════════════════════════════════════════════════════
// server/services/matchingIntelligence.js — Explainable Matching Intelligence (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Human-readable, privacy-safe matching explanations for marketplace discovery.
// Signals:
//   - category
//   - distance
//   - availability/presence
//   - active availability ad
//   - Trust Score V2 / fallback trust
//   - rating
//   - direct offer response history
//   - fairness caps
//
// Safety:
//   - no punitive automation
//   - no auto-ban
//   - no negative labels
//   - no phone/full-name leakage
//   - explanations are positive/neutral only
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { readJSON, getRecordPath, getFromSetIndex } from './database.js';

function isEnabled() {
  return !!(config.MATCHING_INTELLIGENCE && config.MATCHING_INTELLIGENCE.enabled);
}

function cfg() {
  return config.MATCHING_INTELLIGENCE || {};
}

function weights() {
  return cfg().scoreWeights || {};
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function roundScore(n) {
  return Math.round(clamp01(n) * 1000) / 1000;
}

function safeReason(label, score, icon) {
  return {
    label,
    score: Math.round((Number(score) || 0) * 1000) / 1000,
    icon: icon || null,
  };
}

function maxReasons() {
  return Math.max(1, Number(cfg().maxExplanationReasons) || 5);
}

function hasCategoryMatch(worker, jobOrContext) {
  const categories = Array.isArray(worker?.categories)
    ? worker.categories
    : (Array.isArray(worker?.user?.categories) ? worker.user.categories : []);

  const category = jobOrContext?.category ||
    (Array.isArray(jobOrContext?.categories) && jobOrContext.categories.length === 1 ? jobOrContext.categories[0] : null);

  if (!category) return false;
  return categories.includes(category);
}

function distanceScore(distanceKm, radiusKm) {
  if (!Number.isFinite(distanceKm)) return 0;
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = 30;
  return clamp01(1 - distanceKm / radiusKm);
}

function ratingScore(worker) {
  const rating = worker?.rating || worker?.user?.rating || { avg: 0, count: 0 };
  const avg = Number(rating.avg) || 0;
  const count = Number(rating.count) || 0;
  if (count <= 0) return 0;
  return clamp01(avg / 5);
}

async function resolveTrustScore(worker, context = {}) {
  if (typeof context.trustScore === 'number') return clamp01(context.trustScore);
  if (typeof worker?.trustScore === 'number') return clamp01(worker.trustScore);
  if (typeof worker?.user?.trustScore === 'number') return clamp01(worker.user.trustScore);

  const userId = worker?.id || worker?.userId || worker?.user?.id;
  if (!userId) return 0.5;

  try {
    const { getTrustScoreV2 } = await import('./trustScoreV2.js');
    const result = await getTrustScoreV2(userId, { admin: false });
    if (result && typeof result.score === 'number') return clamp01(result.score);
    if (result && typeof result.score01 === 'number') return clamp01(result.score01);
  } catch (_) {
    // Fallback below.
  }

  try {
    const { getUserTrustScore } = await import('./trust.js');
    const result = await getUserTrustScore(userId);
    if (result && typeof result.score === 'number') return clamp01(result.score);
  } catch (_) {
    // Default below.
  }

  return 0.5;
}

function isOnline(worker, context = {}) {
  if (context.presenceData && context.presenceData.status === 'online') return true;
  if (context.presenceStatus === 'online') return true;
  if (worker?.isOnline === true) return true;
  if (worker?.status === 'online') return true;
  return false;
}

function isAvailable(worker, context = {}) {
  if (context.availableNow === true) return true;
  if (context.activeAd) return true;
  if (worker?.hasActiveAd) return true;

  const availability = worker?.availability || worker?.user?.availability;
  if (availability && availability.available === false) return false;

  return isOnline(worker, context);
}

function hasActiveAd(worker, context = {}) {
  return !!(context.activeAd || worker?.activeAd || worker?.hasActiveAd || worker?.adSummary);
}

async function getPairOffers(employerId, workerId) {
  if (!employerId || !workerId) return [];

  try {
    const indexPath = config.DATABASE.indexFiles.employerOffersIndex;
    const ids = await getFromSetIndex(indexPath, employerId);
    const offers = [];
    for (const id of ids) {
      const offer = await readJSON(getRecordPath('direct_offers', id));
      if (offer && offer.workerId === workerId) offers.push(offer);
    }
    return offers;
  } catch (_) {
    return [];
  }
}

/**
 * Get safe direct-offer acceptance signals for employer→worker pair.
 *
 * @param {string} employerId
 * @param {string} workerId
 * @param {object} context
 */
export async function getDirectOfferAcceptanceSignals(employerId, workerId, context = {}) {
  const offers = Array.isArray(context.pairOffers)
    ? context.pairOffers
    : await getPairOffers(employerId, workerId);

  let total = 0;
  let accepted = 0;
  let declined = 0;
  let expired = 0;
  let withdrawn = 0;
  let responseMsTotal = 0;
  let responseCount = 0;

  for (const offer of offers) {
    total++;
    if (offer.status === 'accepted') accepted++;
    else if (offer.status === 'declined') declined++;
    else if (offer.status === 'expired') expired++;
    else if (offer.status === 'withdrawn') withdrawn++;

    const responseAt = offer.acceptedAt || offer.declinedAt;
    if (responseAt && offer.createdAt) {
      const ms = new Date(responseAt).getTime() - new Date(offer.createdAt).getTime();
      if (Number.isFinite(ms) && ms > 0) {
        responseMsTotal += ms;
        responseCount++;
      }
    }
  }

  const decided = accepted + declined + expired;
  const acceptRate = decided > 0 ? accepted / decided : 0;
  const avgResponseMs = responseCount > 0 ? Math.round(responseMsTotal / responseCount) : 0;

  let responseSpeedScore = 0;
  if (avgResponseMs > 0) {
    // 0-120s is strong, >10min fades out.
    responseSpeedScore = clamp01(1 - Math.max(0, avgResponseMs - 120000) / (10 * 60 * 1000));
  }

  return {
    total,
    accepted,
    declined,
    expired,
    withdrawn,
    decided,
    acceptRate: Math.round(acceptRate * 100) / 100,
    avgResponseMs,
    responseSpeedScore: roundScore(responseSpeedScore),
  };
}

/**
 * Score one worker for a job/context.
 *
 * @param {object} worker — privacy-safe worker card OR raw user/candidate
 * @param {object} job — job-like object OR discovery filters
 * @param {object} context
 */
export async function scoreWorkerForJob(worker, job, context = {}) {
  if (!isEnabled()) {
    return { score: 0, reasons: [], noPunitiveAutomation: true };
  }

  const w = weights();
  let total = 0;
  const reasons = [];

  const categoryMatched = hasCategoryMatch(worker, job);
  if (categoryMatched) {
    total += w.category || 0;
    reasons.push(safeReason('تخصص مطابق', w.category || 0, 'briefcase'));
  }

  const distanceKm = Number.isFinite(context.distanceKm)
    ? context.distanceKm
    : (Number.isFinite(worker?.distanceKm) ? worker.distanceKm : worker?._distance);

  const radiusKm = Number(context.radiusKm || job?.radiusKm || config.WORKER_DISCOVERY?.defaultRadiusKm || 30);
  const distScore = distanceScore(distanceKm, radiusKm);
  if (distScore > 0) {
    total += (w.distance || 0) * distScore;
    if (Number.isFinite(distanceKm) && distanceKm <= Math.min(radiusKm, 15)) {
      reasons.push(safeReason('قريب منك', (w.distance || 0) * distScore, 'mapPin'));
    }
  }

  if (isAvailable(worker, context)) {
    total += w.availability || 0;
    reasons.push(safeReason(isOnline(worker, context) ? 'متاح الآن' : 'متاح للشغل', w.availability || 0, 'checkCircle'));
  }

  if (hasActiveAd(worker, context)) {
    total += w.activeAd || 0;
    reasons.push(safeReason('عنده إعلان إتاحة نشط', w.activeAd || 0, 'bell'));
  }

  const trust = await resolveTrustScore(worker, context);
  total += (w.trustScore || 0) * trust;
  if (trust >= 0.7) {
    reasons.push(safeReason('ثقة عالية', (w.trustScore || 0) * trust, 'shieldCheck'));
  } else if (trust >= 0.5) {
    reasons.push(safeReason('ثقة مناسبة', (w.trustScore || 0) * trust, 'shield'));
  }

  const rScore = ratingScore(worker);
  if (rScore > 0) {
    total += (w.rating || 0) * rScore;
    if (rScore >= 0.8) reasons.push(safeReason('تقييمات قوية', (w.rating || 0) * rScore, 'star'));
  }

  let offerSignals = context.offerSignals || null;
  const employerId = context.employerId || job?.employerId || null;
  const workerId = worker?.id || worker?.userId || worker?.user?.id || null;

  if (!offerSignals && employerId && workerId) {
    offerSignals = await getDirectOfferAcceptanceSignals(employerId, workerId, context);
  }

  if (offerSignals && offerSignals.responseSpeedScore > 0) {
    total += (w.responseSpeed || 0) * offerSignals.responseSpeedScore;
    if (offerSignals.avgResponseMs > 0 && offerSignals.avgResponseMs <= 5 * 60 * 1000) {
      reasons.push(safeReason('عادةً يرد بسرعة', (w.responseSpeed || 0) * offerSignals.responseSpeedScore, 'clock'));
    }
  }

  // Fairness cap is neutral: it can reduce exposure repetition, never label worker negatively.
  const sameWorkerCount = Number(context.sameWorkerRecommendationCount || 0);
  const cap = Number(cfg().fairness?.maxSameWorkerRecommendationsPerEmployerPerDay || 10);
  let fairnessCapped = false;
  if (cap > 0 && sameWorkerCount >= cap) {
    fairnessCapped = true;
    total *= 0.75;
  }

  reasons.sort((a, b) => b.score - a.score);

  const finalReasons = reasons
    .filter(r => r && r.label)
    .slice(0, maxReasons())
    .map(r => r.label);

  try {
    eventBus.emit('matching:explanation_generated', {
      workerId,
      employerId,
      jobId: job?.id || null,
      reasonCount: finalReasons.length,
      fairnessCapped,
      timestamp: new Date().toISOString(),
    });
  } catch (_) {
    // fire-and-forget
  }

  return {
    score: roundScore(total),
    reasons: finalReasons,
    reasonDetails: reasons.slice(0, maxReasons()),
    fairnessCapped,
    noPunitiveAutomation: cfg().fairness?.noPunitiveAutomation !== false,
  };
}

/**
 * Explain match as safe Arabic chips.
 *
 * @param {object} worker
 * @param {object} job
 * @param {object} context
 */
export async function explainWorkerJobMatch(worker, job, context = {}) {
  const result = await scoreWorkerForJob(worker, job, context);
  return result.reasons;
}

/**
 * Rank workers for a job/context.
 *
 * @param {object[]} workers
 * @param {object} job
 * @param {object} context
 */
export async function rankWorkersForJob(workers, job, context = {}) {
  if (!Array.isArray(workers)) return [];

  const rows = [];
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    const result = await scoreWorkerForJob(worker, job, context);
    rows.push({ worker, idx: i, score: result.score, reasons: result.reasons });
  }

  rows.sort((a, b) =>
    b.score - a.score ||
    String(a.worker?.id || a.worker?.userId || '').localeCompare(String(b.worker?.id || b.worker?.userId || '')) ||
    a.idx - b.idx
  );

  return rows.map(row => ({
    ...row.worker,
    _matchScore: row.score,
    _matchReasons: row.reasons,
  }));
}

/**
 * Lightweight stats for admin/health.
 */
export async function getMatchingIntelligenceStats() {
  return {
    enabled: isEnabled(),
    explainabilityEnabled: !!cfg().explainabilityEnabled,
    maxExplanationReasons: maxReasons(),
    noPunitiveAutomation: cfg().fairness?.noPunitiveAutomation !== false,
    diversifyResults: !!cfg().fairness?.diversifyResults,
  };
}

export const _testHelpers = {
  isEnabled,
  clamp01,
  roundScore,
  distanceScore,
  ratingScore,
  hasCategoryMatch,
  safeReason,
};
