// ═══════════════════════════════════════════════════════════════
// server/services/adMatcher.js — Ad-Driven Job Matching
// ═══════════════════════════════════════════════════════════════
// Listens to 'job:created' events and notifies workers whose
// availability ads match the job (urgent + immediate only).
//
// Coordinates with jobMatcher via shared in-memory dedup map:
// - adMatcher fires first → writes notified workerIds
// - jobMatcher reads dedup → skips already-notified workers
//
// Net effect: workers with active ads get priority notification,
// jobMatcher serves as fallback for the broader pool.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

// ── Shared dedup map (jobId → { workerIds: Set, expiresAt }) ──
/** @type {Map<string, { workerIds: Set<string>, expiresAt: number }>} */
const notificationDedup = new Map();

const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get worker IDs already notified by adMatcher for this job.
 * Used by jobMatcher to skip duplicates.
 *
 * @param {string} jobId
 * @returns {Set<string>}
 */
export function getDedupedWorkers(jobId) {
  if (!jobId) return new Set();
  const entry = notificationDedup.get(jobId);
  if (!entry) return new Set();
  if (Date.now() > entry.expiresAt) {
    notificationDedup.delete(jobId);
    return new Set();
  }
  return entry.workerIds;
}

/**
 * Add worker IDs to dedup map for a job.
 *
 * @param {string} jobId
 * @param {string[]} workerIds
 */
export function addToDedup(jobId, workerIds) {
  if (!jobId || !Array.isArray(workerIds)) return;
  let entry = notificationDedup.get(jobId);
  if (!entry || Date.now() > entry.expiresAt) {
    entry = { workerIds: new Set(), expiresAt: Date.now() + DEDUP_TTL_MS };
    notificationDedup.set(jobId, entry);
  }
  for (const wid of workerIds) entry.workerIds.add(wid);
}

/**
 * Cleanup expired dedup entries (called by periodic timer).
 */
export function cleanupDedup() {
  const now = Date.now();
  for (const [jobId, entry] of notificationDedup) {
    if (now > entry.expiresAt) {
      notificationDedup.delete(jobId);
    }
  }
}

/**
 * Match availability ads to a newly created job.
 * Fire-and-forget — never throws.
 *
 * Pipeline:
 *   1. Skip if urgency === 'normal'
 *   2. Query active ads by governorate + category (Set intersection via queryIndex)
 *   3. For each ad, verify wage overlap + time overlap + geo overlap
 *   4. Notify ad owner (in-app + push)
 *   5. Increment ad.offerCount
 *   6. Track in dedup map for jobMatcher
 *
 * @param {object} job — full job object
 * @returns {Promise<number>} count of workers notified
 */
export async function matchAdsToJob(job) {
  try {
    if (!config.AVAILABILITY_ADS || !config.AVAILABILITY_ADS.enabled) return 0;
    if (!job || !job.id || job.status !== 'open') return 0;

    // Only urgent + immediate jobs trigger ad matching
    const urgency = job.urgency || 'normal';
    if (urgency !== 'urgent' && urgency !== 'immediate') return 0;

    // Get matching active ad IDs via query index
    let candidateAdIds = [];
    try {
      const { queryAds, getStats } = await import('./queryIndex.js');
      const stats = getStats();
      if (stats.activeAds > 0 || stats.totalAds > 0) {
        candidateAdIds = queryAds({
          governorate: job.governorate,
          categories: [job.category],
        });
      } else {
        // Index empty — fall back via searchAds
        const { searchAds } = await import('./availabilityAd.js');
        const ads = await searchAds({
          governorate: job.governorate,
          categories: [job.category],
          limit: 100,
        });
        candidateAdIds = ads.map(a => a.id);
      }
    } catch (err) {
      logger.warn('adMatcher queryIndex error', { jobId: job.id, error: err.message });
      return 0;
    }

    if (candidateAdIds.length === 0) return 0;

    // Lazy imports
    const { findById: findAd, incrementOfferCount } = await import('./availabilityAd.js');
    const { createNotification } = await import('./notifications.js');
    const { haversineDistance, resolveCoordinates } = await import('./geo.js');

    // Resolve job coordinates
    const jobCoords = resolveCoordinates({
      lat: job.lat,
      lng: job.lng,
      governorate: job.governorate,
    });

    const notifiedWorkerIds = [];
    const jobStartMs = job.startDate ? new Date(job.startDate).getTime() : null;

    for (const adId of candidateAdIds) {
      try {
        const ad = await findAd(adId);
        if (!ad || ad.status !== 'active') continue;

        // Wage overlap: job's dailyWage must be within ad's range
        if (typeof job.dailyWage === 'number') {
          if (job.dailyWage < ad.minDailyWage || job.dailyWage > ad.maxDailyWage) continue;
        }

        // Time overlap: job's startDate must be within ad's window
        if (jobStartMs !== null) {
          const adFromMs = new Date(ad.availableFrom).getTime();
          const adUntilMs = new Date(ad.availableUntil).getTime();
          if (jobStartMs < adFromMs || jobStartMs > adUntilMs) continue;
        }

        // Geo overlap: job within ad.radiusKm OR ad within reasonable proximity
        if (jobCoords) {
          const dist = haversineDistance(jobCoords.lat, jobCoords.lng, ad.lat, ad.lng);
          if (dist > ad.radiusKm) continue;
        }

        // ── Match ──
        const message = `فرصة جديدة مطابقة لإعلانك: ${job.title} — ${job.dailyWage} جنيه/يوم`;
        try {
          await createNotification(
            ad.workerId,
            'job_match',
            message,
            { jobId: job.id, adId: ad.id, dailyWage: job.dailyWage, urgency: job.urgency }
          );
        } catch (_) { /* per-ad fire-and-forget */ }

        // Web push (fire-and-forget)
        try {
          const { sendPush } = await import('./webpush.js');
          sendPush(ad.workerId, {
            title: 'يوميّة — فرصة مطابقة لإعلانك',
            body: `${job.title} — ${job.dailyWage} جنيه/يوم`,
            icon: '/assets/img/icon-192.png',
            url: '/dashboard.html',
          }).catch(() => {});
        } catch (_) { /* non-fatal */ }

        // Increment offer count (fire-and-forget)
        incrementOfferCount(ad.id).catch(() => {});

        // Track for dedup
        notifiedWorkerIds.push(ad.workerId);

        // Emit event
        eventBus.emit('ad:job_match', {
          adId: ad.id,
          workerId: ad.workerId,
          jobId: job.id,
          employerId: job.employerId,
        });
      } catch (err) {
        // Per-ad fire-and-forget
        logger.warn('adMatcher per-ad error', { adId, error: err.message });
      }
    }

    if (notifiedWorkerIds.length > 0) {
      addToDedup(job.id, notifiedWorkerIds);
      logger.info('Ad matcher notified workers', {
        jobId: job.id,
        count: notifiedWorkerIds.length,
        urgency: job.urgency,
      });
    }

    return notifiedWorkerIds.length;
  } catch (err) {
    // NEVER throw — fire-and-forget at caller
    logger.warn('matchAdsToJob error', { jobId: job?.id, error: err.message });
    return 0;
  }
}

/**
 * Setup EventBus listener for job:created.
 * Called once at startup (from router.js).
 */
export function setupAdMatchListeners() {
  if (!config.AVAILABILITY_ADS || !config.AVAILABILITY_ADS.enabled) {
    logger.info('Ad matcher: disabled via config');
    return;
  }

  eventBus.on('job:created', (data) => {
    if (!data || !data.jobId) return;
    // Fire-and-forget: load job and match against ads
    import('./jobs.js').then(({ findById }) => {
      findById(data.jobId).then(job => {
        if (job) matchAdsToJob(job).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  });

  logger.info('Ad matcher: enabled');
}

/**
 * Test helpers.
 */
export const _testHelpers = { notificationDedup, DEDUP_TTL_MS };
