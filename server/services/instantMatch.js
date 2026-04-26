// ═══════════════════════════════════════════════════════════════
// server/services/instantMatch.js — Instant Matching Pipeline
// ═══════════════════════════════════════════════════════════════
// Triggered on job:created (urgency='immediate').
// Selects top 5 candidates by score (distance + trust + rating).
// 90-second acceptance window. First-accept-wins via per-jobId lock.
// Storage: sharded monthly (data/instant_matches/YYYY-MM/).
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, getRecordPath, getWriteRecordPath,
  getCollectionPath, listJSON,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { withLock } from './resourceLock.js';

/** Generate match ID */
function generateId() {
  return 'im_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Score a candidate worker for an instant match.
 * @param {object} job
 * @param {object} workerEntry — { user, currentLocation, ... }
 * @param {object} jobCoords
 * @param {number} trustScore — 0–1
 * @returns {Promise<number>} score 0–1
 */
async function scoreCandidate(job, workerEntry, jobCoords, trustScore) {
  const weights = config.INSTANT_MATCH.scoreWeights;
  const radius = config.INSTANT_MATCH.searchRadiusKm;

  // Distance score
  let distScore = 0;
  try {
    const { haversineDistance, resolveCoordinates } = await import('./geo.js');
    const wCoords = workerEntry.currentLocation ||
      resolveCoordinates({
        lat: workerEntry.user.lat,
        lng: workerEntry.user.lng,
        governorate: workerEntry.user.governorate,
      });
    if (wCoords && jobCoords) {
      const dist = haversineDistance(jobCoords.lat, jobCoords.lng, wCoords.lat, wCoords.lng);
      distScore = Math.max(0, 1 - dist / radius);
    }
  } catch (_) { /* default 0 */ }

  // Rating score
  const ratingAvg = (workerEntry.user.rating && workerEntry.user.rating.avg) || 0;
  const ratingScore = ratingAvg / 5;

  // Trust score (already 0–1)
  const trust = typeof trustScore === 'number' ? trustScore : 0.5;

  return (
    distScore * weights.distance +
    trust * weights.trustScore +
    ratingScore * weights.ratingAvg
  );
}

/**
 * Start an instant match for a newly created immediate job.
 *
 * @param {object} job — full job object
 * @returns {Promise<{ ok: boolean, matchId?: string, candidateCount?: number, code?: string }>}
 */
export async function startMatch(job) {
  if (!config.INSTANT_MATCH || !config.INSTANT_MATCH.enabled) {
    return { ok: false, code: 'INSTANT_MATCH_DISABLED' };
  }
  if (!job || !job.id || job.status !== 'open' || job.urgency !== 'immediate') {
    return { ok: false, code: 'JOB_NOT_ELIGIBLE' };
  }

  try {
    const { getOnlineWorkers } = await import('./presenceService.js');
    const { isAvailableNow } = await import('./availabilityWindow.js');
    const { getUserTrustScore } = await import('./trust.js');
    const { resolveCoordinates } = await import('./geo.js');

    const jobCoords = resolveCoordinates({
      lat: job.lat,
      lng: job.lng,
      governorate: job.governorate,
    });

    // 1. Get online workers (with category + proximity filters)
    const onlineWorkers = await getOnlineWorkers({
      acceptingJobs: true,
      includeAway: false, // only fully online
      categories: [job.category],
      lat: jobCoords ? jobCoords.lat : undefined,
      lng: jobCoords ? jobCoords.lng : undefined,
      radiusKm: config.INSTANT_MATCH.searchRadiusKm,
    });

    if (onlineWorkers.length === 0) {
      return { ok: false, code: 'NO_CANDIDATES' };
    }

    // 2. Filter by availability window (parallel)
    const availabilityChecks = await Promise.all(
      onlineWorkers.map(w => isAvailableNow(w.userId).catch(() => true))
    );
    const availableWorkers = onlineWorkers.filter((_, i) => availabilityChecks[i]);

    if (availableWorkers.length === 0) {
      return { ok: false, code: 'NO_CANDIDATES' };
    }

    // 3. Don't include the employer himself if he's somehow a worker
    const filtered = availableWorkers.filter(w => w.userId !== job.employerId);
    if (filtered.length === 0) {
      return { ok: false, code: 'NO_CANDIDATES' };
    }

    // 4. Score candidates (load trust scores in parallel)
    const trustScores = await Promise.all(
      filtered.map(async w => {
        try {
          const t = await getUserTrustScore(w.userId);
          return t ? t.score : 0.5;
        } catch (_) {
          return 0.5;
        }
      })
    );

    const scored = await Promise.all(
      filtered.map(async (w, i) => ({
        worker: w,
        score: await scoreCandidate(job, w, jobCoords, trustScores[i]),
      }))
    );

    // 5. Sort and take top N
    scored.sort((a, b) => b.score - a.score);
    const topN = scored.slice(0, config.INSTANT_MATCH.topNCandidates);

    if (topN.length === 0) {
      return { ok: false, code: 'NO_CANDIDATES' };
    }

    // 6. Create instant_match record
    const matchId = generateId();
    const now = new Date();
    const record = {
      id: matchId,
      jobId: job.id,
      employerId: job.employerId,
      candidateWorkerIds: topN.map(c => c.worker.userId),
      candidateScores: topN.map(c => Math.round(c.score * 1000) / 1000),
      notifiedAt: now.toISOString(),
      acceptanceWindowSeconds: config.INSTANT_MATCH.acceptanceWindowSeconds,
      status: 'pending',
      acceptedBy: null,
      acceptedAt: null,
      expiredAt: null,
      createdAt: now.toISOString(),
    };

    const filePath = getWriteRecordPath('instant_matches', matchId);
    await atomicWrite(filePath, record);

    logger.info('Instant match started', {
      matchId,
      jobId: job.id,
      candidateCount: topN.length,
    });

    // 7. Emit candidates event (liveFeed listener delivers via SSE + Push)
    eventBus.emit('instant_match:candidates', {
      matchId,
      jobId: job.id,
      employerId: job.employerId,
      candidateWorkerIds: record.candidateWorkerIds,
      acceptanceWindowSeconds: record.acceptanceWindowSeconds,
      jobSummary: {
        id: job.id,
        title: job.title,
        category: job.category,
        governorate: job.governorate,
        dailyWage: job.dailyWage,
        durationDays: job.durationDays,
        startDate: job.startDate,
      },
    });

    // 8. Schedule expiry (in-process timer, unref'd)
    const expiryTimer = setTimeout(() => {
      expireMatch(matchId).catch(err => {
        logger.warn('Instant match expiry error', { matchId, error: err.message });
      });
    }, config.INSTANT_MATCH.acceptanceWindowSeconds * 1000);
    if (expiryTimer.unref) expiryTimer.unref();

    return { ok: true, matchId, candidateCount: topN.length };
  } catch (err) {
    logger.error('startMatch error', { jobId: job.id, error: err.message });
    return { ok: false, code: 'INTERNAL_ERROR' };
  }
}

/**
 * Try to accept an instant match — first-accept-wins via per-jobId lock.
 * Uses the SAME lock key as applications.js accept() — prevents races.
 *
 * @param {string} matchId
 * @param {string} workerId
 * @returns {Promise<{ ok: boolean, code?: string, application?: object, jobId?: string }>}
 */
export async function tryAccept(matchId, workerId) {
  const matchPath = getRecordPath('instant_matches', matchId);

  // Pre-lock read to get jobId
  let preMatch = await readJSON(matchPath);
  if (!preMatch) {
    return { ok: false, code: 'MATCH_NOT_FOUND' };
  }

  const jobId = preMatch.jobId;

  // Use SAME lock key as applications.accept() — prevents over-acceptance
  return withLock(`accept-job:${jobId}`, async () => {
    // Re-read inside lock
    const match = await readJSON(matchPath);
    if (!match) return { ok: false, code: 'MATCH_NOT_FOUND' };

    if (match.status === 'accepted') {
      return { ok: false, code: 'TOO_LATE' };
    }
    if (match.status === 'expired') {
      return { ok: false, code: 'EXPIRED' };
    }
    if (match.status !== 'pending') {
      return { ok: false, code: 'INVALID_STATUS' };
    }

    // Verify worker is in candidate list
    if (!Array.isArray(match.candidateWorkerIds) || !match.candidateWorkerIds.includes(workerId)) {
      return { ok: false, code: 'NOT_CANDIDATE' };
    }

    // Verify within acceptance window
    const notifiedMs = new Date(match.notifiedAt).getTime();
    const expiresMs = notifiedMs + match.acceptanceWindowSeconds * 1000;
    if (Date.now() >= expiresMs) {
      // Mark expired now
      match.status = 'expired';
      match.expiredAt = new Date().toISOString();
      await atomicWrite(matchPath, match);
      eventBus.emit('instant_match:expired', { matchId, jobId });
      return { ok: false, code: 'EXPIRED' };
    }

    // ── Atomic acceptance ──
    // 1. Mark match as accepted
    match.status = 'accepted';
    match.acceptedBy = workerId;
    match.acceptedAt = new Date().toISOString();
    await atomicWrite(matchPath, match);

    // 2. Create application via applications.instantAccept
    let application;
    try {
      const { instantAcceptInternal } = await import('./applications.js');
      const result = await instantAcceptInternal(jobId, workerId);
      if (!result.ok) {
        // Rollback match status (best-effort)
        match.status = 'pending';
        match.acceptedBy = null;
        match.acceptedAt = null;
        await atomicWrite(matchPath, match).catch(() => {});
        return { ok: false, code: result.code || 'ACCEPT_FAILED' };
      }
      application = result.application;
    } catch (err) {
      // Rollback
      match.status = 'pending';
      match.acceptedBy = null;
      match.acceptedAt = null;
      await atomicWrite(matchPath, match).catch(() => {});
      return { ok: false, code: 'ACCEPT_FAILED' };
    }

    // 3. Emit acceptance event
    eventBus.emit('instant_match:accepted', {
      matchId,
      jobId,
      workerId,
      otherCandidateIds: match.candidateWorkerIds.filter(id => id !== workerId),
    });

    logger.info('Instant match accepted', { matchId, jobId, workerId });

    return { ok: true, application, jobId };
  });
}

/**
 * Mark a match as expired (called by timer or cleanup).
 * @param {string} matchId
 * @returns {Promise<boolean>}
 */
export async function expireMatch(matchId) {
  const matchPath = getRecordPath('instant_matches', matchId);
  const match = await readJSON(matchPath);
  if (!match) return false;
  if (match.status !== 'pending') return false;

  match.status = 'expired';
  match.expiredAt = new Date().toISOString();
  await atomicWrite(matchPath, match);

  eventBus.emit('instant_match:expired', { matchId, jobId: match.jobId });
  logger.info('Instant match expired', { matchId, jobId: match.jobId });

  return true;
}

/**
 * Sweep pending matches that have exceeded their window.
 * Called by cleanup timer.
 * @returns {Promise<number>}
 */
export async function cleanupExpired() {
  if (!config.INSTANT_MATCH || !config.INSTANT_MATCH.enabled) return 0;

  const dir = getCollectionPath('instant_matches');
  let all;
  try {
    all = await listJSON(dir);
  } catch (_) {
    return 0;
  }

  const matches = all.filter(m => m.id && m.id.startsWith('im_') && m.status === 'pending');
  if (matches.length === 0) return 0;

  const now = Date.now();
  let count = 0;

  for (const m of matches) {
    const notifiedMs = new Date(m.notifiedAt).getTime();
    const expiresMs = notifiedMs + (m.acceptanceWindowSeconds || 90) * 1000;
    if (now >= expiresMs) {
      try {
        const did = await expireMatch(m.id);
        if (did) count++;
      } catch (_) { /* fire-and-forget */ }
    }
  }

  return count;
}

/**
 * Get aggregate stats for /api/health.
 * @returns {Promise<{ activeAttempts: number, successRateLastHour: number }>}
 */
export async function getStats() {
  if (!config.INSTANT_MATCH || !config.INSTANT_MATCH.enabled) {
    return { activeAttempts: 0, successRateLastHour: 0 };
  }

  const dir = getCollectionPath('instant_matches');
  let all;
  try {
    all = await listJSON(dir);
  } catch (_) {
    return { activeAttempts: 0, successRateLastHour: 0 };
  }

  const matches = all.filter(m => m.id && m.id.startsWith('im_'));
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  let activeAttempts = 0;
  let recentAccepted = 0;
  let recentExpired = 0;

  for (const m of matches) {
    const created = new Date(m.createdAt || m.notifiedAt || 0).getTime();
    if (m.status === 'pending') activeAttempts++;
    if (created >= hourAgo) {
      if (m.status === 'accepted') recentAccepted++;
      else if (m.status === 'expired') recentExpired++;
    }
  }

  const total = recentAccepted + recentExpired;
  const successRateLastHour = total > 0 ? Math.round((recentAccepted / total) * 100) : 0;

  return { activeAttempts, successRateLastHour };
}

/**
 * Setup EventBus listeners — call once at startup (from router.js).
 */
export function setupInstantMatchListeners() {
  if (!config.INSTANT_MATCH || !config.INSTANT_MATCH.enabled) {
    logger.info('Instant match: disabled via config');
    return;
  }

  // Note: jobMatcher.js handles 'job:created' for instant match trigger
  // (it calls startMatch directly to integrate with notification flow).
  // No listener needed here — instantMatch is invoked imperatively.

  logger.info('Instant match: enabled');
}

/**
 * Find match by ID (for handlers).
 */
export async function findById(matchId) {
  return await readJSON(getRecordPath('instant_matches', matchId));
}

/**
 * Find pending match for a job (for instantAccept by jobId).
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function findPendingByJob(jobId) {
  const dir = getCollectionPath('instant_matches');
  const all = await listJSON(dir);
  const matches = all
    .filter(m => m.id && m.id.startsWith('im_') && m.jobId === jobId && m.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return matches[0] || null;
}
