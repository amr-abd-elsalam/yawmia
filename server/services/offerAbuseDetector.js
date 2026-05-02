// ═══════════════════════════════════════════════════════════════
// server/services/offerAbuseDetector.js — Rule-Based Abuse Detection (Phase 44)
// ═══════════════════════════════════════════════════════════════
// 3 detection rules:
//   1. Same-worker spam (employer→same worker > threshold in 24h)
//   2. High-decline employer (>=80% negative rate with >=10 offers in 7d)
//   3. Offer-bombing (worker receives > threshold from > minUnique employers in 60min)
//
// Pure read-only — no persistence, no auto-ban.
// Admin reviews flags + decides (human-in-the-loop pattern).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { getCollectionPath, listJSON } from './database.js';
import { logger } from './logger.js';
import * as abuseFlagReview from './abuseFlagReview.js';

/**
 * Read all direct offers (raw, bypassing redaction).
 * @returns {Promise<object[]>}
 */
async function listAllOffers() {
  try {
    const dir = getCollectionPath('direct_offers');
    const all = await listJSON(dir);
    return all.filter(o => o && o.id && o.id.startsWith('dof_'));
  } catch (err) {
    logger.warn('offerAbuseDetector: listAllOffers failed', { error: err.message });
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Rule 1: Same-Worker Spam
// ═══════════════════════════════════════════════════════════════

/**
 * Detect employers sending too many offers to same worker.
 * Severity: 'high' if 2x threshold, else 'medium'.
 *
 * @param {object[]} offers
 * @param {object} cfg — config.DIRECT_OFFERS.abuse
 * @returns {Array<object>} flags
 */
function detectSameWorkerSpam(offers, cfg) {
  const cutoff = Date.now() - cfg.sameWorkerWindowHours * 60 * 60 * 1000;
  const pairs = new Map();

  for (const o of offers) {
    const createdMs = new Date(o.createdAt).getTime();
    if (createdMs < cutoff) continue;

    const key = `${o.employerId}:${o.workerId}`;
    if (!pairs.has(key)) {
      pairs.set(key, {
        employerId: o.employerId,
        workerId: o.workerId,
        count: 0,
        declined: 0,
        expired: 0,
      });
    }
    const p = pairs.get(key);
    p.count++;
    if (o.status === 'declined') p.declined++;
    else if (o.status === 'expired') p.expired++;
  }

  const flags = [];
  for (const p of pairs.values()) {
    if (p.count >= cfg.sameWorkerOfferThreshold) {
      const severity = p.count >= cfg.sameWorkerOfferThreshold * 2 ? 'high' : 'medium';
      flags.push({
        type: 'same_worker_spam',
        employerId: p.employerId,
        workerId: p.workerId,
        offerCount: p.count,
        declinedOrExpired: p.declined + p.expired,
        severity,
      });
    }
  }
  return flags;
}

// ═══════════════════════════════════════════════════════════════
// Rule 2: High-Decline Employer
// ═══════════════════════════════════════════════════════════════

/**
 * Detect employers with toxic offer behavior (high decline+expire rate).
 * Severity: 'high' if >=95%, else 'medium'.
 * Requires >=employerMinOffersForRateCheck for statistical significance.
 *
 * @param {object[]} offers
 * @param {object} cfg
 * @returns {Array<object>} flags
 */
function detectHighDeclineEmployers(offers, cfg) {
  const cutoff = Date.now() - cfg.employerDeclineWindowDays * 24 * 60 * 60 * 1000;
  const byEmployer = new Map();

  for (const o of offers) {
    const createdMs = new Date(o.createdAt).getTime();
    if (createdMs < cutoff) continue;

    if (!byEmployer.has(o.employerId)) {
      byEmployer.set(o.employerId, { total: 0, declined: 0, expired: 0 });
    }
    const e = byEmployer.get(o.employerId);
    e.total++;
    if (o.status === 'declined') e.declined++;
    else if (o.status === 'expired') e.expired++;
  }

  const flags = [];
  for (const [empId, stats] of byEmployer) {
    if (stats.total < cfg.employerMinOffersForRateCheck) continue;

    const negativeRate = (stats.declined + stats.expired) / stats.total;
    if (negativeRate >= cfg.employerHighDeclineRateThreshold) {
      const severity = negativeRate >= 0.95 ? 'high' : 'medium';
      flags.push({
        type: 'high_decline_employer',
        employerId: empId,
        totalOffers: stats.total,
        declinedOrExpired: stats.declined + stats.expired,
        negativeRate: Math.round(negativeRate * 100),
        severity,
      });
    }
  }
  return flags;
}

// ═══════════════════════════════════════════════════════════════
// Rule 3: Offer Bombing
// ═══════════════════════════════════════════════════════════════

/**
 * Detect coordinated offer bombing on a single worker.
 * Always 'high' severity (system-level abuse signal).
 * Requires >= minUniqueEmployers (rules out single-employer spam).
 *
 * @param {object[]} offers
 * @param {object} cfg
 * @returns {Array<object>} flags
 */
function detectOfferBombing(offers, cfg) {
  const cutoff = Date.now() - cfg.workerOfferBombingWindowMinutes * 60 * 1000;
  const byWorker = new Map();

  for (const o of offers) {
    const createdMs = new Date(o.createdAt).getTime();
    if (createdMs < cutoff) continue;

    if (!byWorker.has(o.workerId)) {
      byWorker.set(o.workerId, { count: 0, employers: new Set() });
    }
    const w = byWorker.get(o.workerId);
    w.count++;
    w.employers.add(o.employerId);
  }

  const flags = [];
  for (const [wid, stats] of byWorker) {
    if (stats.count >= cfg.workerOfferBombingThreshold &&
        stats.employers.size >= cfg.workerOfferBombingMinUniqueEmployers) {
      flags.push({
        type: 'worker_offer_bombing',
        workerId: wid,
        offerCount: stats.count,
        uniqueEmployers: stats.employers.size,
        severity: 'high',
      });
    }
  }
  return flags;
}

// ═══════════════════════════════════════════════════════════════
// Main Entry
// ═══════════════════════════════════════════════════════════════

/**
 * Run all 3 detection rules and return flagged signals.
 * Sorted by severity: high → medium → low.
 *
 * @returns {Promise<{
 *   enabled: boolean,
 *   generatedAt?: string,
 *   flagCount?: number,
 *   flags?: Array<object>,
 *   error?: string
 * }>}
 */
export async function detectAbuse() {
  if (!config.DIRECT_OFFERS || !config.DIRECT_OFFERS.abuse || !config.DIRECT_OFFERS.abuse.enabled) {
    return { enabled: false, flags: [] };
  }

  const cfg = config.DIRECT_OFFERS.abuse;

  let offers;
  try {
    offers = await listAllOffers();
  } catch (err) {
    logger.warn('detectAbuse: failed to list offers', { error: err.message });
    return { enabled: true, flags: [], error: 'list_failed' };
  }

  const rawFlags = [
    ...detectSameWorkerSpam(offers, cfg),
    ...detectHighDeclineEmployers(offers, cfg),
    ...detectOfferBombing(offers, cfg),
  ];

  // Phase 45: filter snoozed flags + attach fingerprint + reviewState
  const reviewWorkflowEnabled = cfg.reviewWorkflowEnabled !== false;
  const filtered = [];
  for (const flag of rawFlags) {
    if (reviewWorkflowEnabled) {
      try {
        const fingerprint = abuseFlagReview.computeFingerprint(flag);
        const snoozed = await abuseFlagReview.isCurrentlySnoozed(fingerprint);
        if (snoozed) continue; // skip snoozed
        flag.fingerprint = fingerprint;
        flag.reviewState = await abuseFlagReview.getReviewState(fingerprint);
      } catch (err) {
        logger.warn('detectAbuse: review state lookup failed', { error: err.message });
        // On error, include flag without reviewState (degrade gracefully)
        flag.fingerprint = abuseFlagReview.computeFingerprint(flag);
        flag.reviewState = null;
      }
    }
    filtered.push(flag);
  }

  // Sort by severity: high (3) → medium (2) → low (1)
  const severityOrder = { high: 3, medium: 2, low: 1 };
  filtered.sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0));

  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    flagCount: filtered.length,
    flags: filtered,
  };
}

// ── Test helpers (exported for unit tests) ───────────────────
export const _testHelpers = {
  detectSameWorkerSpam,
  detectHighDeclineEmployers,
  detectOfferBombing,
};
