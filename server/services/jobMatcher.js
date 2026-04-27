// ═══════════════════════════════════════════════════════════════
// server/services/jobMatcher.js — Smart Job-Worker Matching
// ═══════════════════════════════════════════════════════════════
// Listens to 'job:created' events and proactively notifies
// matching workers based on category, proximity, and availability.
// Fire-and-forget — NEVER blocks job creation flow.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

/**
 * Match workers to a newly created job and send notifications.
 * Fire-and-forget — all errors caught internally.
 *
 * Matching criteria (scored):
 *   Category match (required): +2
 *   Proximity match (within radius): +1
 *   Governorate exact match: +1
 *
 * Filters:
 *   - role === 'worker' && status === 'active'
 *   - availability.available !== false
 *   - worker.categories includes job.category
 *   - worker is NOT the job employer
 *
 * @param {{ jobId: string, employerId: string }} data — event payload
 */
async function matchAndNotify(data) {
  try {
    // 1. Feature flag
    if (!config.JOB_MATCHING || !config.JOB_MATCHING.enabled) return;

    const { jobId, employerId } = data;
    if (!jobId) return;

    // 2. Load job
    const { findById: findJob } = await import('./jobs.js');
    const job = await findJob(jobId);
    if (!job || job.status !== 'open') return;

    // 2b. Phase 40 — Instant match for immediate jobs
    // If we get enough candidates via instant match, skip broad notification
    // to avoid over-notification. Otherwise fall through to broad flow.
    if (job.urgency === 'immediate' && config.INSTANT_MATCH && config.INSTANT_MATCH.enabled) {
      try {
        const { startMatch } = await import('./instantMatch.js');
        const result = await startMatch(job);
        const minCandidates = Math.ceil((config.INSTANT_MATCH.topNCandidates || 5) / 2);
        if (result.ok && result.candidateCount >= minCandidates) {
          logger.info('Instant match took over for immediate job', {
            jobId,
            candidates: result.candidateCount,
          });
          return; // Skip broad notification — instant match handles delivery
        }
        // Otherwise fall through to broad notification (graceful fallback)
      } catch (err) {
        logger.warn('Instant match attempt failed — falling back to broad notification', {
          jobId,
          error: err.message,
        });
      }
    }

    // 3. Load all users
    const { listAll: listAllUsers } = await import('./users.js');
    const allUsers = await listAllUsers();

    // 4. Load geo utilities
    const { resolveCoordinates, haversineDistance } = await import('./geo.js');
    const jobCoords = resolveCoordinates({
      lat: job.lat,
      lng: job.lng,
      governorate: job.governorate,
    });

    const matchRadius = config.JOB_MATCHING.proximityRadiusKm || 50;

    // 5. Filter and score workers
    const matches = [];

    for (const u of allUsers) {
      // Must be active worker
      if (u.role !== 'worker' || u.status !== 'active') continue;

      // Must not be the employer who created the job
      if (u.id === employerId) continue;

      // Availability check — explicit false means unavailable
      if (u.availability && u.availability.available === false) continue;

      // Category match (required)
      if (!config.JOB_MATCHING.matchByCategory) continue;
      if (!u.categories || !Array.isArray(u.categories)) continue;
      if (!u.categories.includes(job.category)) continue;

      // Score: category match = +2 (already passed filter)
      let score = 2;

      // Governorate exact match = +1
      if (u.governorate && u.governorate === job.governorate) {
        score += 1;
      }

      // Urgency bonus
      if (job.urgency === 'immediate') score += 3;
      else if (job.urgency === 'urgent') score += 1;

      // Proximity match = +1
      if (config.JOB_MATCHING.matchByProximity && jobCoords) {
        const workerCoords = resolveCoordinates({
          lat: u.lat,
          lng: u.lng,
          governorate: u.governorate,
        });
        if (workerCoords) {
          const distance = haversineDistance(
            workerCoords.lat, workerCoords.lng,
            jobCoords.lat, jobCoords.lng
          );
          if (distance <= matchRadius) {
            score += 1;
          }
        }
      }

      matches.push({ user: u, score });
    }

    // 6. Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    // 7. Limit to maxNotificationsPerJob
    const maxNotifications = config.JOB_MATCHING.maxNotificationsPerJob || 50;
    const toNotify = matches.slice(0, maxNotifications);

    if (toNotify.length === 0) return;

    // Phase 41 — Read shared dedup from adMatcher (workers already notified about this job)
    let dedupedWorkers = new Set();
    try {
      const { getDedupedWorkers } = await import('./adMatcher.js');
      dedupedWorkers = getDedupedWorkers(jobId);
    } catch (_) { /* non-fatal — proceed with no dedup */ }

    // 8. Create notifications (fire-and-forget per worker)
    const { createNotification } = await import('./notifications.js');
    const message = `فرصة عمل جديدة قريبة منك: ${job.title} — ${job.dailyWage} جنيه/يوم`;

    let notified = 0;
    let skippedByDedup = 0;
    for (const match of toNotify) {
      // Skip workers already notified by adMatcher
      if (dedupedWorkers.has(match.user.id)) {
        skippedByDedup++;
        continue;
      }
      try {
        await createNotification(
          match.user.id,
          'job_nearby',
          message,
          { jobId: job.id, category: job.category, governorate: job.governorate }
        );
        notified++;
      } catch (_) {
        // Fire-and-forget per worker — continue to next
      }
    }

    if (notified > 0 || skippedByDedup > 0) {
      logger.info('Job matching: notified workers', {
        jobId,
        matched: matches.length,
        notified,
        skippedByDedup,
        category: job.category,
        governorate: job.governorate,
      });
    }
  } catch (err) {
    // NEVER propagate errors — fire-and-forget
    logger.warn('Job matching error', { error: err.message, jobId: data?.jobId });
  }
}

/**
 * Setup EventBus listener for smart job matching.
 * Registers 'job:created' listener if JOB_MATCHING.enabled is true.
 * Must be called after setupNotificationListeners().
 */
export function setupJobMatching() {
  if (!config.JOB_MATCHING || !config.JOB_MATCHING.enabled) {
    logger.info('Job matching: disabled via config');
    return;
  }

  eventBus.on('job:created', (data) => {
    // Fire-and-forget — async but not awaited
    matchAndNotify(data).catch(() => {});
  });

  logger.info('Job matching: enabled');
}
