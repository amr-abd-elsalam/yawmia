// ═══════════════════════════════════════════════════════════════
// server/services/activitySummary.js — Weekly Activity Digest
// ═══════════════════════════════════════════════════════════════
// Generates and sends weekly activity summaries per user role.
// Runs on configurable day+hour (default: Sunday 10AM Egypt time).
// Fire-and-forget per user — NEVER throws.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

/** @type {string|null} last summary date string (Egypt timezone YYYY-MM-DD) */
let lastSummaryDate = null;

/**
 * Get current date string in Egypt timezone (UTC+2) — YYYY-MM-DD
 * @returns {string}
 */
function getEgyptDateString() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(egyptDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get Egypt day of week (0=Sunday) and hour
 * @returns {{ dayOfWeek: number, hour: number }}
 */
function getEgyptDayAndHour() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  return {
    dayOfWeek: egyptDate.getUTCDay(),
    hour: egyptDate.getUTCHours(),
  };
}

/**
 * Get last Sunday midnight in Egypt timezone as UTC Date
 * @returns {Date}
 */
function getLastSundayMidnightEgypt() {
  const { getEgyptMidnight } = require_geo();
  const todayMidnight = getEgyptMidnight();
  const egyptMs = todayMidnight.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const daysSinceSunday = egyptDate.getUTCDay(); // 0=Sunday
  const sundayMidnightEgypt = new Date(todayMidnight.getTime() - (daysSinceSunday * 24 * 60 * 60 * 1000));
  return sundayMidnightEgypt;
}

/** Lazy geo import to avoid circular deps */
let _geo = null;
function require_geo() {
  if (!_geo) {
    // Sync-safe: geo.js is pure math, no async
    throw new Error('geo not loaded');
  }
  return _geo;
}

/**
 * Generate activity summary for an employer
 * @param {string} userId
 * @returns {Promise<{ activeJobs: number, newApplicationsThisWeek: number, acceptedWorkersThisWeek: number, completedJobsThisWeek: number }>}
 */
export async function generateEmployerSummary(userId) {
  const summary = { activeJobs: 0, newApplicationsThisWeek: 0, acceptedWorkersThisWeek: 0, completedJobsThisWeek: 0 };

  try {
    // Lazy load geo
    if (!_geo) _geo = await import('./geo.js');
    const weekStart = getLastSundayMidnightEgypt();

    const { getFromSetIndex, readJSON: readJSONFn, getRecordPath: getRecordPathFn } = await import('./database.js');
    const employerJobIds = await getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, userId);

    for (const jobId of employerJobIds) {
      const job = await readJSONFn(getRecordPathFn('jobs', jobId));
      if (!job) continue;

      // Active jobs: open, filled, in_progress
      if (job.status === 'open' || job.status === 'filled' || job.status === 'in_progress') {
        summary.activeJobs++;
      }

      // Completed this week
      if (job.status === 'completed' && job.completedAt && new Date(job.completedAt) >= weekStart) {
        summary.completedJobsThisWeek++;
      }

      // Applications this week
      try {
        const { listByJob } = await import('./applications.js');
        const apps = await listByJob(jobId);
        for (const app of apps) {
          if (new Date(app.appliedAt) >= weekStart) {
            summary.newApplicationsThisWeek++;
          }
          if (app.status === 'accepted' && app.respondedAt && new Date(app.respondedAt) >= weekStart) {
            summary.acceptedWorkersThisWeek++;
          }
        }
      } catch (_) { /* non-fatal */ }
    }
  } catch (err) {
    logger.warn('generateEmployerSummary error', { userId, error: err.message });
  }

  return summary;
}

/**
 * Generate activity summary for a worker
 * @param {string} userId
 * @returns {Promise<{ newJobsInArea: number, pendingApplications: number, newRatingsThisWeek: number }>}
 */
export async function generateWorkerSummary(userId) {
  const summary = { newJobsInArea: 0, pendingApplications: 0, newRatingsThisWeek: 0 };

  try {
    // Lazy load geo
    if (!_geo) _geo = await import('./geo.js');
    const weekStart = getLastSundayMidnightEgypt();

    // Get user for governorate + categories
    const { findById: findUser } = await import('./users.js');
    const user = await findUser(userId);
    if (!user) return summary;

    // New jobs in user's area + categories this week
    try {
      const { list: listJobs } = await import('./jobs.js');
      const openJobs = await listJobs({ status: 'open' });
      for (const job of openJobs) {
        if (new Date(job.createdAt) < weekStart) continue;
        // Match governorate
        if (user.governorate && job.governorate !== user.governorate) continue;
        // Match category
        if (user.categories && user.categories.length > 0 && !user.categories.includes(job.category)) continue;
        summary.newJobsInArea++;
      }
    } catch (_) { /* non-fatal */ }

    // Pending applications
    try {
      const { listByWorker } = await import('./applications.js');
      const apps = await listByWorker(userId);
      summary.pendingApplications = apps.filter(a => a.status === 'pending').length;
    } catch (_) { /* non-fatal */ }

    // New ratings this week
    try {
      const { listByUser: listRatings } = await import('./ratings.js');
      const ratingsResult = await listRatings(userId, { limit: 100, offset: 0 });
      if (ratingsResult && ratingsResult.items) {
        summary.newRatingsThisWeek = ratingsResult.items.filter(r =>
          r.createdAt && new Date(r.createdAt) >= weekStart
        ).length;
      }
    } catch (_) { /* non-fatal */ }
  } catch (err) {
    logger.warn('generateWorkerSummary error', { userId, error: err.message });
  }

  return summary;
}

/**
 * Send weekly activity summaries to all active users
 * Checks day+hour match, prevents re-runs, batched with yielding
 * @returns {Promise<number>} count of summaries sent
 */
export async function sendWeeklySummaries() {
  // 1. Feature flag
  if (!config.ACTIVITY_SUMMARY || !config.ACTIVITY_SUMMARY.enabled) return 0;

  // 2. Lazy load geo
  if (!_geo) _geo = await import('./geo.js');

  // 3. Check day + hour
  const { dayOfWeek, hour } = getEgyptDayAndHour();
  if (dayOfWeek !== config.ACTIVITY_SUMMARY.dayOfWeek) return 0;
  if (hour !== config.ACTIVITY_SUMMARY.hourEgypt) return 0;

  // 4. Prevent re-runs today
  const today = getEgyptDateString();
  if (lastSummaryDate === today) return 0;

  // 5. Mark as ran
  lastSummaryDate = today;

  logger.info('Activity summary: starting weekly digest');

  // 6. List all active users
  const { listAll: listAllUsers } = await import('./users.js');
  const allUsers = await listAllUsers();
  const activeUsers = allUsers.filter(u => u.status === 'active');

  if (activeUsers.length === 0) return 0;

  const { createNotification } = await import('./notifications.js');
  const BATCH_SIZE = 50;
  let sent = 0;

  for (let i = 0; i < activeUsers.length; i++) {
    const user = activeUsers[i];

    try {
      if (user.role === 'employer') {
        const summary = await generateEmployerSummary(user.id);

        // Skip empty summaries
        if (summary.activeJobs === 0 && summary.newApplicationsThisWeek === 0 &&
            summary.acceptedWorkersThisWeek === 0 && summary.completedJobsThisWeek === 0) {
          continue;
        }

        const parts = [];
        if (summary.activeJobs > 0) parts.push(`${summary.activeJobs} فرص نشطة`);
        if (summary.newApplicationsThisWeek > 0) parts.push(`${summary.newApplicationsThisWeek} طلبات جديدة`);
        if (summary.acceptedWorkersThisWeek > 0) parts.push(`${summary.acceptedWorkersThisWeek} عمال مقبولين`);
        if (summary.completedJobsThisWeek > 0) parts.push(`${summary.completedJobsThisWeek} فرص مكتملة`);

        const message = `📊 ملخصك الأسبوعي: ${parts.join(' • ')}`;
        await createNotification(user.id, 'activity_summary', message, { summary });
        sent++;

      } else if (user.role === 'worker') {
        const summary = await generateWorkerSummary(user.id);

        // Skip empty summaries
        if (summary.newJobsInArea === 0 && summary.pendingApplications === 0 &&
            summary.newRatingsThisWeek === 0) {
          continue;
        }

        const parts = [];
        if (summary.newJobsInArea > 0) parts.push(`${summary.newJobsInArea} فرص جديدة في منطقتك`);
        if (summary.pendingApplications > 0) parts.push(`${summary.pendingApplications} طلبات معلقة`);
        if (summary.newRatingsThisWeek > 0) parts.push(`${summary.newRatingsThisWeek} تقييمات جديدة`);

        const message = `📊 ملخصك الأسبوعي: ${parts.join(' • ')}`;
        await createNotification(user.id, 'activity_summary', message, { summary });
        sent++;
      }
    } catch (_) {
      // Fire-and-forget per user — continue to next
    }

    // Yield to event loop every BATCH_SIZE users
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  if (sent > 0) {
    logger.info(`Activity summary: sent ${sent} digests`);
  }

  return sent;
}
