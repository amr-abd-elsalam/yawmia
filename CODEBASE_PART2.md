# يوميّة (Yawmia) v0.32.0 — Part 2: Backend Services (21 services + 2 adapters)
> Auto-generated: 2026-04-24T20:24:30.850Z
> Files in this part: 45

## Files
1. `server/services/activitySummary.js`
2. `server/services/analytics.js`
3. `server/services/applications.js`
4. `server/services/arabicNormalizer.js`
5. `server/services/attendance.js`
6. `server/services/auditLog.js`
7. `server/services/auth.js`
8. `server/services/backupScheduler.js`
9. `server/services/cache.js`
10. `server/services/channels/sms.js`
11. `server/services/channels/whatsapp.js`
12. `server/services/contentFilter.js`
13. `server/services/database.js`
14. `server/services/errorAggregator.js`
15. `server/services/eventBus.js`
16. `server/services/eventReplayBuffer.js`
17. `server/services/favorites.js`
18. `server/services/financialExport.js`
19. `server/services/geo.js`
20. `server/services/indexHealth.js`
21. `server/services/jobAlerts.js`
22. `server/services/jobMatcher.js`
23. `server/services/jobs.js`
24. `server/services/logWriter.js`
25. `server/services/logger.js`
26. `server/services/messages.js`
27. `server/services/messaging.js`
28. `server/services/migration.js`
29. `server/services/monitor.js`
30. `server/services/notificationMessenger.js`
31. `server/services/notifications.js`
32. `server/services/payments.js`
33. `server/services/profileCompleteness.js`
34. `server/services/ratings.js`
35. `server/services/reports.js`
36. `server/services/resourceLock.js`
37. `server/services/sanitizer.js`
38. `server/services/searchIndex.js`
39. `server/services/sessions.js`
40. `server/services/sseManager.js`
41. `server/services/trust.js`
42. `server/services/users.js`
43. `server/services/validators.js`
44. `server/services/verification.js`
45. `server/services/webpush.js`

---

## `server/services/activitySummary.js`

```javascript
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
```

---

## `server/services/analytics.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/analytics.js — Analytics Computation Service
// ═══════════════════════════════════════════════════════════════
// On-the-fly aggregation with module-local cache (5-min TTL).
// Three scopes: employer, worker, platform.
// All functions return all-zero objects on empty data (no errors).
// Date filtering uses Egypt timezone (UTC+2).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { getFromSetIndex, readJSON, getRecordPath, getCollectionPath, listJSON } from './database.js';
import { logger } from './logger.js';

// ── Module-local analytics cache (separate from global cache.js) ──
/** @type {Map<string, { value: *, expiresAt: number }>} */
const analyticsCache = new Map();

function cacheGet(key) {
  const entry = analyticsCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    analyticsCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  const ttl = (config.ANALYTICS && config.ANALYTICS.cacheTtlMs) || 300000;
  analyticsCache.set(key, { value, expiresAt: Date.now() + ttl });
}

/** Clear analytics cache (for testing) */
export function clearAnalyticsCache() {
  analyticsCache.clear();
}

// ── Date helpers (Egypt timezone UTC+2) ──────────────────────

/**
 * Convert ISO timestamp to Egypt date string YYYY-MM-DD
 * @param {string} isoString
 * @returns {string}
 */
function toEgyptDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const egyptMs = d.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(egyptDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get today's Egypt date string
 * @returns {string} YYYY-MM-DD
 */
function todayEgypt() {
  return toEgyptDate(new Date().toISOString());
}

/**
 * Get default date range (last 30 days)
 * @returns {{ from: string, to: string }}
 */
function getDefaultRange() {
  const now = new Date();
  const to = todayEgypt();
  const fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = toEgyptDate(fromDate.toISOString());
  return { from, to };
}

/**
 * Check if a record's createdAt falls within [from, to] Egypt dates
 * @param {string} createdAt — ISO string
 * @param {string} from — YYYY-MM-DD
 * @param {string} to — YYYY-MM-DD
 * @returns {boolean}
 */
function inRange(createdAt, from, to) {
  if (!createdAt) return false;
  const egyptDate = toEgyptDate(createdAt);
  return egyptDate >= from && egyptDate <= to;
}

// ── Employer Analytics ───────────────────────────────────────

/**
 * Get analytics for an employer within a date range
 * @param {string} employerId
 * @param {{ from?: string, to?: string }} options
 * @returns {Promise<object>}
 */
export async function getEmployerAnalytics(employerId, options = {}) {
  if (!config.ANALYTICS || !config.ANALYTICS.enabled) {
    return emptyEmployerAnalytics();
  }

  const { from, to } = options.from && options.to ? options : getDefaultRange();
  const cacheKey = `analytics:employer:${employerId}:${from}:${to}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const result = emptyEmployerAnalytics();
  result.period = { from, to };

  try {
    const employerJobsIndex = config.DATABASE.indexFiles.employerJobsIndex;
    const jobIds = await getFromSetIndex(employerJobsIndex, employerId);

    const { findById: findJob } = await import('./jobs.js');
    const { listByJob: listAppsByJob } = await import('./applications.js');
    const { listByJob: listPaymentsByJob } = await import('./payments.js');
    const { getJobSummary } = await import('./attendance.js');
    const { findById: findUser } = await import('./users.js');

    const workerJobCounts = {}; // workerId → jobCount
    const workerNames = {};     // workerId → name
    let batchCount = 0;

    for (const jobId of jobIds) {
      const job = await readJSON(getRecordPath('jobs', jobId));
      if (!job) continue;
      if (!inRange(job.createdAt, from, to)) continue;

      // Jobs breakdown
      result.jobs.total++;
      if (result.jobs.byStatus[job.status] !== undefined) {
        result.jobs.byStatus[job.status]++;
      }

      // Financials from payments
      try {
        const payments = await listPaymentsByJob(jobId);
        for (const pay of payments) {
          result.financials.totalSpent += pay.amount || 0;
          result.financials.totalPlatformFees += pay.platformFee || 0;
          result.financials.totalWorkerPayout += pay.workerPayout || 0;
        }
      } catch (_) { /* non-fatal */ }

      // Wage stats
      if (job.dailyWage) {
        result.financials.wageStats.total += job.dailyWage;
        result.financials.wageStats.count++;
        if (job.dailyWage < result.financials.wageStats.min || result.financials.wageStats.min === 0) {
          result.financials.wageStats.min = job.dailyWage;
        }
        if (job.dailyWage > result.financials.wageStats.max) {
          result.financials.wageStats.max = job.dailyWage;
        }
      }

      // Applications
      try {
        const apps = await listAppsByJob(jobId);
        for (const app of apps) {
          result.applications.total++;
          if (app.status === 'accepted') {
            result.applications.accepted++;
            // Track workers
            workerJobCounts[app.workerId] = (workerJobCounts[app.workerId] || 0) + 1;
            if (!workerNames[app.workerId]) {
              try {
                const w = await findUser(app.workerId);
                workerNames[app.workerId] = (w && w.name) || 'بدون اسم';
              } catch (_) {
                workerNames[app.workerId] = 'بدون اسم';
              }
            }
          } else if (app.status === 'rejected') {
            result.applications.rejected++;
          } else if (app.status === 'pending') {
            result.applications.pending++;
          }
        }
      } catch (_) { /* non-fatal */ }

      // Attendance
      try {
        const summary = await getJobSummary(jobId);
        result.attendance.totalRecords += summary.totalRecords || 0;
        result.attendance.checkedIn += summary.checkedInCount || 0;
        result.attendance.noShows += summary.noShowCount || 0;
        result.attendance.confirmed += summary.confirmedCount || 0;
      } catch (_) { /* non-fatal */ }

      // Yield every 50 jobs
      batchCount++;
      if (batchCount % 50 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Calculate rates
    if (result.applications.total > 0) {
      result.applications.acceptRate = Math.round((result.applications.accepted / result.applications.total) * 100);
    }
    if (result.attendance.totalRecords > 0) {
      result.attendance.attendanceRate = Math.round((result.attendance.checkedIn / result.attendance.totalRecords) * 100);
    }
    if (result.financials.wageStats.count > 0) {
      result.financials.wageStats.avg = Math.round(result.financials.wageStats.total / result.financials.wageStats.count);
    }

    // Unique workers
    result.workers.unique = Object.keys(workerJobCounts).length;

    // Top workers (by job count, top 10)
    const sortedWorkers = Object.entries(workerJobCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Enrich top workers with rating
    const { getUserRatingSummary } = await import('./ratings.js');
    for (const [workerId, jobCount] of sortedWorkers) {
      let ratingAvg = 0;
      try {
        const rs = await getUserRatingSummary(workerId);
        ratingAvg = rs.avg || 0;
      } catch (_) { /* non-fatal */ }
      result.workers.top.push({
        workerId,
        name: workerNames[workerId] || 'بدون اسم',
        jobCount,
        ratingAvg,
      });
    }
  } catch (err) {
    logger.warn('getEmployerAnalytics error', { employerId, error: err.message });
  }

  cacheSet(cacheKey, result);
  return result;
}

function emptyEmployerAnalytics() {
  return {
    period: { from: '', to: '' },
    jobs: {
      total: 0,
      byStatus: { open: 0, filled: 0, in_progress: 0, completed: 0, cancelled: 0, expired: 0 },
    },
    financials: {
      totalSpent: 0,
      totalPlatformFees: 0,
      totalWorkerPayout: 0,
      wageStats: { avg: 0, min: 0, max: 0, total: 0, count: 0 },
    },
    applications: { total: 0, accepted: 0, rejected: 0, pending: 0, acceptRate: 0 },
    attendance: { totalRecords: 0, checkedIn: 0, noShows: 0, confirmed: 0, attendanceRate: 0 },
    workers: { unique: 0, top: [] },
  };
}

// ── Worker Analytics ─────────────────────────────────────────

/**
 * Get analytics for a worker within a date range
 * @param {string} workerId
 * @param {{ from?: string, to?: string }} options
 * @returns {Promise<object>}
 */
export async function getWorkerAnalytics(workerId, options = {}) {
  if (!config.ANALYTICS || !config.ANALYTICS.enabled) {
    return emptyWorkerAnalytics();
  }

  const { from, to } = options.from && options.to ? options : getDefaultRange();
  const cacheKey = `analytics:worker:${workerId}:${from}:${to}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const result = emptyWorkerAnalytics();
  result.period = { from, to };

  try {
    const workerAppsIndex = config.DATABASE.indexFiles.workerAppsIndex;
    const appIds = await getFromSetIndex(workerAppsIndex, workerId);

    const { findById: findJob } = await import('./jobs.js');
    const { listByJob: listPaymentsByJob } = await import('./payments.js');
    const { listByWorker: listAttByWorker } = await import('./attendance.js');
    const { listByUser: listRatings } = await import('./ratings.js');

    let batchCount = 0;

    for (const appId of appIds) {
      const app = await readJSON(getRecordPath('applications', appId));
      if (!app) continue;
      if (!inRange(app.appliedAt, from, to)) continue;

      result.applications.total++;

      if (app.status === 'accepted') {
        result.applications.accepted++;

        // Load job for earnings
        try {
          const job = await findJob(app.jobId);
          if (job && job.status === 'completed') {
            result.jobs.completed++;
            // Calculate earnings from payment
            try {
              const payments = await listPaymentsByJob(app.jobId);
              if (payments.length > 0) {
                const pay = payments[0];
                // Worker payout split evenly among accepted workers
                const acceptedCount = pay.workersAccepted || 1;
                const perWorker = Math.round((pay.workerPayout || 0) / acceptedCount);
                result.earnings.total += perWorker;
              }
            } catch (_) { /* non-fatal */ }
          }
        } catch (_) { /* non-fatal */ }
      } else if (app.status === 'rejected') {
        result.applications.rejected++;
      } else if (app.status === 'pending') {
        result.applications.pending++;
      }

      batchCount++;
      if (batchCount % 50 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Completion rate
    if (result.applications.accepted > 0) {
      result.applications.completionRate = Math.round((result.jobs.completed / result.applications.accepted) * 100);
    }

    // Attendance
    try {
      const attRecords = await listAttByWorker(workerId);
      const periodRecords = attRecords.filter(r => inRange(r.createdAt, from, to));
      result.attendance.totalRecords = periodRecords.length;
      result.attendance.checkedIn = periodRecords.filter(r =>
        r.status === 'checked_in' || r.status === 'checked_out' || r.status === 'confirmed'
      ).length;
      result.attendance.noShows = periodRecords.filter(r => r.status === 'no_show').length;
      if (result.attendance.totalRecords > 0) {
        result.attendance.attendanceRate = Math.round((result.attendance.checkedIn / result.attendance.totalRecords) * 100);
      }
    } catch (_) { /* non-fatal */ }

    // Rating trend
    try {
      const ratingsResult = await listRatings(workerId, { limit: 100, offset: 0 });
      const items = (ratingsResult && ratingsResult.items) || [];
      const periodRatings = items.filter(r => inRange(r.createdAt, from, to));
      result.ratings.count = periodRatings.length;

      if (periodRatings.length >= 2) {
        const mid = Math.floor(periodRatings.length / 2);
        // items are newest first
        const recentAvg = periodRatings.slice(0, mid).reduce((s, r) => s + r.stars, 0) / mid;
        const olderAvg = periodRatings.slice(mid).reduce((s, r) => s + r.stars, 0) / (periodRatings.length - mid);
        if (recentAvg > olderAvg + 0.3) {
          result.ratings.trend = 'up';
        } else if (recentAvg < olderAvg - 0.3) {
          result.ratings.trend = 'down';
        } else {
          result.ratings.trend = 'stable';
        }
      } else {
        result.ratings.trend = 'stable';
      }
    } catch (_) { /* non-fatal */ }
  } catch (err) {
    logger.warn('getWorkerAnalytics error', { workerId, error: err.message });
  }

  cacheSet(cacheKey, result);
  return result;
}

function emptyWorkerAnalytics() {
  return {
    period: { from: '', to: '' },
    applications: { total: 0, accepted: 0, rejected: 0, pending: 0, completionRate: 0 },
    jobs: { completed: 0 },
    earnings: { total: 0 },
    attendance: { totalRecords: 0, checkedIn: 0, noShows: 0, attendanceRate: 0 },
    ratings: { count: 0, trend: 'stable' },
  };
}

// ── Platform Analytics (Admin) ───────────────────────────────

/**
 * Get platform-wide analytics within a date range
 * @param {{ from?: string, to?: string }} options
 * @returns {Promise<object>}
 */
export async function getPlatformAnalytics(options = {}) {
  if (!config.ANALYTICS || !config.ANALYTICS.enabled) {
    return emptyPlatformAnalytics();
  }

  const { from, to } = options.from && options.to ? options : getDefaultRange();
  const cacheKey = `analytics:platform:${from}:${to}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const result = emptyPlatformAnalytics();
  result.period = { from, to };

  try {
    // Users
    const { listAll: listAllUsers } = await import('./users.js');
    const allUsers = await listAllUsers();
    for (const u of allUsers) {
      if (inRange(u.createdAt, from, to)) {
        result.users.newRegistrations++;
        if (u.role === 'worker') result.users.byRole.worker++;
        else if (u.role === 'employer') result.users.byRole.employer++;
      }
      if (u.status === 'active') result.users.active++;
      else if (u.status === 'banned') result.users.banned++;
      else if (u.status === 'deleted') result.users.deleted++;
    }

    await new Promise(resolve => setImmediate(resolve));

    // Jobs
    const { listAll: listAllJobs } = await import('./jobs.js');
    const allJobs = await listAllJobs();
    for (const j of allJobs) {
      if (!inRange(j.createdAt, from, to)) continue;
      result.jobs.created++;
      if (j.status === 'completed') result.jobs.completed++;
      else if (j.status === 'cancelled') result.jobs.cancelled++;
      else if (j.status === 'expired') result.jobs.expired++;
      if (j.status === 'filled' || j.status === 'in_progress' || j.status === 'completed') {
        result.jobs.filled++;
      }
    }
    if (result.jobs.created > 0) {
      result.jobs.fillRate = Math.round((result.jobs.filled / result.jobs.created) * 100);
    }

    await new Promise(resolve => setImmediate(resolve));

    // Financials
    const { listAll: listAllPayments } = await import('./payments.js');
    const allPayments = await listAllPayments();
    for (const pay of allPayments) {
      if (!inRange(pay.createdAt, from, to)) continue;
      result.financials.totalPayments++;
      result.financials.totalVolume += pay.amount || 0;
      result.financials.platformRevenue += pay.platformFee || 0;
      if (pay.status === 'disputed') result.financials.disputed++;
    }
    if (result.financials.totalPayments > 0) {
      result.financials.avgJobValue = Math.round(result.financials.totalVolume / result.financials.totalPayments);
      result.financials.disputeRate = Math.round((result.financials.disputed / result.financials.totalPayments) * 100);
    }

    await new Promise(resolve => setImmediate(resolve));

    // Engagement — avg applications per job
    const { listAll: listAllApps } = await import('./applications.js');
    const allApps = await listAllApps();
    const periodApps = allApps.filter(a => inRange(a.appliedAt, from, to));
    result.engagement.totalApplications = periodApps.length;
    if (result.jobs.created > 0) {
      result.engagement.avgApplicationsPerJob = Math.round((periodApps.length / result.jobs.created) * 10) / 10;
    }
  } catch (err) {
    logger.warn('getPlatformAnalytics error', { error: err.message });
  }

  cacheSet(cacheKey, result);
  return result;
}

function emptyPlatformAnalytics() {
  return {
    period: { from: '', to: '' },
    users: { newRegistrations: 0, active: 0, banned: 0, deleted: 0, byRole: { worker: 0, employer: 0 } },
    jobs: { created: 0, completed: 0, cancelled: 0, expired: 0, filled: 0, fillRate: 0 },
    financials: { totalPayments: 0, totalVolume: 0, platformRevenue: 0, avgJobValue: 0, disputed: 0, disputeRate: 0 },
    engagement: { totalApplications: 0, avgApplicationsPerJob: 0 },
  };
}
```

---

## `server/services/applications.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/applications.js — Application Lifecycle
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { findById as findJobById, incrementAccepted } from './jobs.js';
import { eventBus } from './eventBus.js';
import { withLock } from './resourceLock.js';

const WORKER_APPS_INDEX = config.DATABASE.indexFiles.workerAppsIndex;
const JOB_APPS_INDEX = config.DATABASE.indexFiles.jobAppsIndex;

/**
 * Apply to a job
 */
export function apply(jobId, workerId) {
  return withLock(`apply:${jobId}:${workerId}`, async () => {
  // Check job exists and is open
  const job = await findJobById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'open') {
    return { ok: false, error: 'الفرصة مش متاحة للتقديم', code: 'JOB_NOT_OPEN' };
  }

  // Check not already applied
  const existing = await findByJobAndWorker(jobId, workerId);
  if (existing) {
    return { ok: false, error: 'أنت تقدمت لهذه الفرصة بالفعل', code: 'ALREADY_APPLIED' };
  }

  const id = 'app_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const application = {
    id,
    jobId,
    workerId,
    status: 'pending',
    appliedAt: now,
    respondedAt: null,
  };

  const appPath = getRecordPath('applications', id);
  await atomicWrite(appPath, application);

  // Update secondary indexes
  await addToSetIndex(WORKER_APPS_INDEX, workerId, id);
  await addToSetIndex(JOB_APPS_INDEX, jobId, id);

  eventBus.emit('application:submitted', { applicationId: id, jobId, workerId, employerId: job.employerId });

  return { ok: true, application };
  }); // end withLock
}

/**
 * Accept a worker application
 */
export function accept(applicationId, employerId) {
  return withLock(`accept:${applicationId}`, async () => {
  const application = await findById(applicationId);
  if (!application) {
    return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
  }

  // Verify employer owns the job
  const job = await findJobById(application.jobId);
  if (!job || job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تتحكم في هذا الطلب', code: 'NOT_JOB_OWNER' };
  }

  if (application.status !== 'pending') {
    return { ok: false, error: 'تم الرد على هذا الطلب بالفعل', code: 'ALREADY_RESPONDED' };
  }

  // Check if job still has room
  if (job.workersAccepted >= job.workersNeeded) {
    return { ok: false, error: 'الفرصة اكتملت بالفعل', code: 'JOB_FILLED' };
  }

  // Update application
  application.status = 'accepted';
  application.respondedAt = new Date().toISOString();

  const appPath = getRecordPath('applications', applicationId);
  await atomicWrite(appPath, application);

  // Increment accepted count
  const updatedJob = await incrementAccepted(application.jobId);

  // Emit rich event for notifications
  eventBus.emit('application:accepted', {
    applicationId,
    jobId: application.jobId,
    workerId: application.workerId,
    employerId,
    jobTitle: job.title,
  });

  // Check if job is now filled
  if (updatedJob && updatedJob.status === 'filled') {
    eventBus.emit('job:filled', {
      jobId: application.jobId,
      employerId,
      jobTitle: job.title,
    });
  }

  return { ok: true, application };
  }); // end withLock
}

/**
 * Reject a worker application
 */
export async function reject(applicationId, employerId) {
  const application = await findById(applicationId);
  if (!application) {
    return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
  }

  // Verify employer owns the job
  const job = await findJobById(application.jobId);
  if (!job || job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تتحكم في هذا الطلب', code: 'NOT_JOB_OWNER' };
  }

  if (application.status !== 'pending') {
    return { ok: false, error: 'تم الرد على هذا الطلب بالفعل', code: 'ALREADY_RESPONDED' };
  }

  application.status = 'rejected';
  application.respondedAt = new Date().toISOString();

  const appPath = getRecordPath('applications', applicationId);
  await atomicWrite(appPath, application);

  // Emit rich event for notifications
  eventBus.emit('application:rejected', {
    applicationId,
    jobId: application.jobId,
    workerId: application.workerId,
    employerId,
    jobTitle: job.title,
  });

  return { ok: true, application };
}

/**
 * Find application by ID
 */
export async function findById(applicationId) {
  const appPath = getRecordPath('applications', applicationId);
  return await readJSON(appPath);
}

/**
 * Find application by job + worker (index-accelerated with fallback)
 */
export async function findByJobAndWorker(jobId, workerId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(JOB_APPS_INDEX, jobId);
  if (indexedIds.length > 0) {
    for (const appId of indexedIds) {
      const app = await readJSON(getRecordPath('applications', appId));
      if (app && app.workerId === workerId) return app;
    }
    return null;
  }

  // Fallback: full scan (backward compatibility for pre-index data)
  const appsDir = getCollectionPath('applications');
  const all = await listJSON(appsDir);
  return all.find(a => a.jobId === jobId && a.workerId === workerId) || null;
}

/**
 * List all applications for a job (index-accelerated with fallback)
 */
export async function listByJob(jobId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(JOB_APPS_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const appId of indexedIds) {
      const app = await readJSON(getRecordPath('applications', appId));
      if (app) results.push(app);
    }
    return results;
  }

  // Fallback: full scan (backward compatibility for pre-index data)
  const appsDir = getCollectionPath('applications');
  const all = await listJSON(appsDir);
  return all.filter(a => a.jobId === jobId);
}

/**
 * List all applications by a worker (index-accelerated with fallback)
 */
export async function listByWorker(workerId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(WORKER_APPS_INDEX, workerId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const appId of indexedIds) {
      const app = await readJSON(getRecordPath('applications', appId));
      if (app) results.push(app);
    }
    return results;
  }

  // Fallback: full scan (backward compatibility for pre-index data)
  const appsDir = getCollectionPath('applications');
  const all = await listJSON(appsDir);
  return all.filter(a => a.workerId === workerId);
}

/**
 * Count applications submitted by a worker today
 * @param {string} workerId
 * @returns {Promise<number>}
 */
export async function countTodayByWorker(workerId) {
  const apps = await listByWorker(workerId);
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  return apps.filter(a => new Date(a.appliedAt) >= todayMidnight).length;
}

/**
 * List all applications (for admin)
 */
export async function listAll() {
  const appsDir = getCollectionPath('applications');
  return await listJSON(appsDir);
}

/**
 * Count applications by status
 */
export async function countByStatus() {
  const apps = await listAll();
  const counts = { pending: 0, accepted: 0, rejected: 0, withdrawn: 0, total: apps.length };
  for (const app of apps) {
    if (counts[app.status] !== undefined) counts[app.status]++;
  }
  return counts;
}

/**
 * Worker confirms acceptance (two-phase acceptance)
 * @param {string} applicationId
 * @param {string} workerId
 * @returns {Promise<{ ok: boolean, application?: object, error?: string, code?: string }>}
 */
export function workerConfirm(applicationId, workerId) {
  return withLock(`confirm:${applicationId}`, async () => {
    const application = await findById(applicationId);
    if (!application) {
      return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
    }
    if (application.workerId !== workerId) {
      return { ok: false, error: 'مش مسموحلك تأكد هذا الطلب', code: 'NOT_APPLICATION_OWNER' };
    }
    if (application.status !== 'accepted') {
      return { ok: false, error: 'الطلب مش في حالة مقبول', code: 'INVALID_STATUS' };
    }

    // Deadline check
    if (application.respondedAt && config.JOBS.workerConfirmationTimeoutHours) {
      const deadline = new Date(new Date(application.respondedAt).getTime() + config.JOBS.workerConfirmationTimeoutHours * 60 * 60 * 1000);
      if (new Date() > deadline) {
        return { ok: false, error: 'انتهت مهلة التأكيد', code: 'DEADLINE_PASSED' };
      }
    }

    application.status = 'worker_confirmed';
    application.workerConfirmedAt = new Date().toISOString();
    const appPath = getRecordPath('applications', applicationId);
    await atomicWrite(appPath, application);

    eventBus.emit('application:worker_confirmed', {
      applicationId,
      jobId: application.jobId,
      workerId,
    });

    return { ok: true, application };
  });
}

/**
 * Worker declines acceptance (two-phase acceptance)
 * @param {string} applicationId
 * @param {string} workerId
 * @returns {Promise<{ ok: boolean, application?: object, error?: string, code?: string }>}
 */
export function workerDecline(applicationId, workerId) {
  return withLock(`decline:${applicationId}`, async () => {
    const application = await findById(applicationId);
    if (!application) {
      return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
    }
    if (application.workerId !== workerId) {
      return { ok: false, error: 'مش مسموحلك ترفض هذا الطلب', code: 'NOT_APPLICATION_OWNER' };
    }
    if (application.status !== 'accepted') {
      return { ok: false, error: 'الطلب مش في حالة مقبول', code: 'INVALID_STATUS' };
    }

    application.status = 'worker_declined';
    application.workerDeclinedAt = new Date().toISOString();
    const appPath = getRecordPath('applications', applicationId);
    await atomicWrite(appPath, application);

    // Decrement workersAccepted on the job
    const job = await findJobById(application.jobId);
    if (job && job.workersAccepted > 0) {
      job.workersAccepted -= 1;
      // Revert job status from filled → open if needed
      if (job.status === 'filled' && job.workersAccepted < job.workersNeeded) {
        job.status = 'open';
        // Update jobs index
        const { readIndex, writeIndex } = await import('./database.js');
        const jobsIndex = await readIndex('jobsIndex');
        if (jobsIndex[job.id]) {
          jobsIndex[job.id].status = 'open';
          await writeIndex('jobsIndex', jobsIndex);
        }
      }
      const jobPath = getRecordPath('jobs', job.id);
      await atomicWrite(jobPath, job);
    }

    eventBus.emit('application:worker_declined', {
      applicationId,
      jobId: application.jobId,
      workerId,
      employerId: job ? job.employerId : null,
    });

    return { ok: true, application };
  });
}

/**
 * Withdraw a pending application (worker action)
 * @param {string} applicationId
 * @param {string} workerId - the requesting worker's ID (ownership check)
 * @returns {Promise<{ ok: boolean, application?: object, error?: string, code?: string }>}
 */
export async function withdraw(applicationId, workerId) {
  // Rule 1: APPLICATION_EXISTS
  const application = await findById(applicationId);
  if (!application) {
    return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
  }

  // Rule 2: OWNERSHIP_CHECK
  if (application.workerId !== workerId) {
    return { ok: false, error: 'مش مسموحلك تسحب هذا الطلب', code: 'NOT_APPLICATION_OWNER' };
  }

  // Rule 3: STATUS_CHECK — can only withdraw pending
  if (application.status !== 'pending') {
    return { ok: false, error: 'لا يمكن سحب هذا الطلب', code: 'CANNOT_WITHDRAW' };
  }

  // Rule 4: UPDATE
  application.status = 'withdrawn';
  application.respondedAt = new Date().toISOString();

  const appPath = getRecordPath('applications', applicationId);
  await atomicWrite(appPath, application);

  eventBus.emit('application:withdrawn', {
    applicationId,
    jobId: application.jobId,
    workerId,
  });

  return { ok: true, application };
}
```

---

## `server/services/arabicNormalizer.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/arabicNormalizer.js — Arabic Text Normalization
// ═══════════════════════════════════════════════════════════════
// Pure functions — zero dependencies, zero I/O.
// Normalizes Arabic text for improved search matching:
//   - Removes diacritics (tashkeel)
//   - Normalizes hamza variants (أ إ آ ٱ → ا)
//   - Normalizes taa marbuta (ة → ه)
//   - Normalizes alef maksura (ى → ي)
//   - Removes tatweel (kashida ـ)
//   - Normalizes whitespace
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize Arabic text for search matching.
 * Handles common variations that should be treated as equivalent.
 *
 * @param {*} text — input text (any type, non-strings return '')
 * @returns {string} normalized text
 */
export function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';

  let normalized = text;

  // Step 1: Remove Arabic diacritics (tashkeel)
  // U+0610-U+061A: Arabic sign ranges
  // U+064B-U+065F: Arabic fathatan through wavy hamza below
  // U+0670: Arabic letter superscript alef
  normalized = normalized.replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '');

  // Step 2: Normalize hamza variants → bare alef (ا)
  // أ (U+0623) — alef with hamza above
  // إ (U+0625) — alef with hamza below
  // آ (U+0622) — alef with madda above
  // ٱ (U+0671) — alef wasla
  normalized = normalized.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');

  // Step 3: Normalize taa marbuta → haa
  // ة (U+0629) → ه (U+0647)
  normalized = normalized.replace(/\u0629/g, '\u0647');

  // Step 4: Normalize alef maksura → yaa
  // ى (U+0649) → ي (U+064A)
  normalized = normalized.replace(/\u0649/g, '\u064A');

  // Step 5: Remove tatweel (kashida)
  // ـ (U+0640)
  normalized = normalized.replace(/\u0640/g, '');

  // Step 6: Normalize whitespace (collapse multiple spaces)
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Check if a string contains Arabic characters.
 * Tests for the Arabic Unicode block (U+0600-U+06FF).
 *
 * @param {*} text — input text
 * @returns {boolean} true if text contains at least one Arabic character
 */
export function hasArabic(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u0600-\u06FF]/.test(text);
}
```

---

## `server/services/attendance.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/attendance.js — Worker Attendance & GPS Check-in
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, getRecordPath, getCollectionPath,
  listJSON, addToSetIndex, getFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { withLock } from './resourceLock.js';

const JOB_ATTENDANCE_INDEX = config.DATABASE.indexFiles.jobAttendanceIndex;
const WORKER_ATTENDANCE_INDEX = config.DATABASE.indexFiles.workerAttendanceIndex;

/**
 * Generate attendance record ID
 */
function generateId() {
  return 'att_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Get Egypt date string (YYYY-MM-DD) from a UTC Date
 */
function getEgyptDateString(utcDate) {
  const offsetMs = 2 * 60 * 60 * 1000; // UTC+2
  const egyptTime = new Date(utcDate.getTime() + offsetMs);
  const y = egyptTime.getUTCFullYear();
  const m = String(egyptTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(egyptTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Find today's attendance record for a specific worker on a specific job
 * @param {string} jobId
 * @param {string} workerId
 * @param {Date} todayMidnight — Egypt midnight as UTC Date
 * @returns {Promise<object|null>}
 */
async function findTodayRecord(jobId, workerId, todayMidnight) {
  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(JOB_ATTENDANCE_INDEX, jobId);
  if (indexedIds.length > 0) {
    for (const attId of indexedIds) {
      const record = await readJSON(getRecordPath('attendance', attId));
      if (record && record.workerId === workerId && new Date(record.createdAt) >= todayMidnight) {
        return record;
      }
    }
    return null;
  }

  // Fallback: full scan
  const attDir = getCollectionPath('attendance');
  const all = await listJSON(attDir);
  return all.find(a =>
    a.jobId === jobId &&
    a.workerId === workerId &&
    new Date(a.createdAt) >= todayMidnight
  ) || null;
}

/**
 * Worker GPS-verified check-in
 * @param {string} jobId
 * @param {string} workerId
 * @param {{ lat?: number, lng?: number }} coords
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export function checkIn(jobId, workerId, coords = {}) {
  return withLock(`attendance:${jobId}:${workerId}`, async () => {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Job exists & in_progress
  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'in_progress') {
    return { ok: false, error: 'الفرصة مش في حالة تنفيذ', code: 'JOB_NOT_IN_PROGRESS' };
  }

  // 3. Worker is accepted on this job
  const { listByJob: listApps } = await import('./applications.js');
  const apps = await listApps(jobId);
  const accepted = apps.find(a => a.workerId === workerId && a.status === 'accepted');
  if (!accepted) {
    return { ok: false, error: 'أنت مش مقبول في هذه الفرصة', code: 'NOT_ACCEPTED_WORKER' };
  }

  // 4. No duplicate today
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const existing = await findTodayRecord(jobId, workerId, todayMidnight);

  if (existing) {
    // Allow override if no_show → checked_in (worker arrives late)
    if (existing.status === 'no_show') {
      const now = new Date();
      existing.status = 'checked_in';
      existing.checkInAt = now.toISOString();
      existing.checkInLat = (typeof coords.lat === 'number') ? coords.lat : null;
      existing.checkInLng = (typeof coords.lng === 'number') ? coords.lng : null;
      await atomicWrite(getRecordPath('attendance', existing.id), existing);

      eventBus.emit('attendance:checkin', {
        attendanceId: existing.id,
        jobId,
        workerId,
        employerId: job.employerId,
      });

      return { ok: true, attendance: existing };
    }
    return { ok: false, error: 'أنت سجلت حضورك النهارده بالفعل', code: 'ALREADY_CHECKED_IN' };
  }

  // 5. GPS proximity check
  if (config.ATTENDANCE.requireGpsForCheckIn) {
    if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      return { ok: false, error: 'موقعك الجغرافي مطلوب لتسجيل الحضور', code: 'GPS_REQUIRED' };
    }

    const { haversineDistance, resolveCoordinates } = await import('./geo.js');
    const jobCoords = resolveCoordinates({
      lat: job.lat,
      lng: job.lng,
      governorate: job.governorate,
    });

    if (jobCoords) {
      const distance = haversineDistance(coords.lat, coords.lng, jobCoords.lat, jobCoords.lng);
      if (distance > config.ATTENDANCE.checkInRadiusKm) {
        return {
          ok: false,
          error: `أنت بعيد عن موقع العمل (${distance} كم). لازم تكون في نطاق ${config.ATTENDANCE.checkInRadiusKm} كم`,
          code: 'TOO_FAR_FROM_JOB',
        };
      }
    }
  }

  // ── Create attendance record ──
  const now = new Date();
  const id = generateId();
  const attendance = {
    id,
    jobId,
    workerId,
    employerId: job.employerId,
    date: getEgyptDateString(now),
    status: 'checked_in',
    checkInAt: now.toISOString(),
    checkInLat: (typeof coords.lat === 'number') ? coords.lat : null,
    checkInLng: (typeof coords.lng === 'number') ? coords.lng : null,
    checkOutAt: null,
    checkOutLat: null,
    checkOutLng: null,
    hoursWorked: null,
    employerConfirmed: false,
    employerConfirmedAt: null,
    noShowReportedBy: null,
    noShowReportedAt: null,
    createdAt: now.toISOString(),
  };

  await atomicWrite(getRecordPath('attendance', id), attendance);

  // Update indexes
  await addToSetIndex(JOB_ATTENDANCE_INDEX, jobId, id);
  await addToSetIndex(WORKER_ATTENDANCE_INDEX, workerId, id);

  eventBus.emit('attendance:checkin', {
    attendanceId: id,
    jobId,
    workerId,
    employerId: job.employerId,
  });

  return { ok: true, attendance };
  }); // end withLock
}

/**
 * Worker check-out
 * @param {string} jobId
 * @param {string} workerId
 * @param {{ lat?: number, lng?: number }} coords
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export async function checkOut(jobId, workerId, coords = {}) {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Find today's record
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const record = await findTodayRecord(jobId, workerId, todayMidnight);

  if (!record) {
    return { ok: false, error: 'مفيش سجل حضور ليك النهارده', code: 'NOT_CHECKED_IN' };
  }

  if (record.status !== 'checked_in') {
    return { ok: false, error: 'حالة الحضور مش مناسبة للانصراف', code: 'INVALID_ATTENDANCE_STATUS' };
  }

  // 3. Calculate hours worked
  const now = new Date();
  const checkInTime = new Date(record.checkInAt);
  const hoursWorked = Math.round(((now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 10) / 10;

  // 4. Update record
  record.status = 'checked_out';
  record.checkOutAt = now.toISOString();
  record.checkOutLat = (typeof coords.lat === 'number') ? coords.lat : null;
  record.checkOutLng = (typeof coords.lng === 'number') ? coords.lng : null;
  record.hoursWorked = hoursWorked;

  await atomicWrite(getRecordPath('attendance', record.id), record);

  eventBus.emit('attendance:checkout', {
    attendanceId: record.id,
    jobId,
    workerId,
    hoursWorked,
  });

  return { ok: true, attendance: record };
}

/**
 * Employer confirms attendance
 * @param {string} attendanceId
 * @param {string} employerId
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export async function confirmAttendance(attendanceId, employerId) {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Record exists
  const record = await findById(attendanceId);
  if (!record) {
    return { ok: false, error: 'سجل الحضور غير موجود', code: 'ATTENDANCE_NOT_FOUND' };
  }

  // 3. Employer owns job
  if (record.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تأكد حضور هذا العامل', code: 'NOT_JOB_OWNER' };
  }

  // 4. Valid status for confirmation
  if (record.status !== 'checked_in' && record.status !== 'checked_out') {
    return { ok: false, error: 'حالة الحضور مش مناسبة للتأكيد', code: 'INVALID_ATTENDANCE_STATUS' };
  }

  // 5. Not already confirmed
  if (record.employerConfirmed) {
    return { ok: false, error: 'تم تأكيد الحضور بالفعل', code: 'ALREADY_CONFIRMED' };
  }

  // 6. Update
  record.status = 'confirmed';
  record.employerConfirmed = true;
  record.employerConfirmedAt = new Date().toISOString();

  await atomicWrite(getRecordPath('attendance', record.id), record);

  eventBus.emit('attendance:confirmed', {
    attendanceId: record.id,
    jobId: record.jobId,
    workerId: record.workerId,
    employerId,
  });

  return { ok: true, attendance: record };
}

/**
 * Employer reports worker no-show
 * @param {string} jobId
 * @param {string} workerId
 * @param {string} reportedBy — employer ID
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export function reportNoShow(jobId, workerId, reportedBy) {
  return withLock(`attendance:${jobId}:${workerId}`, async () => {
  // 1. Feature flag
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
    return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
  }

  // 2. Job exists
  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }

  // 3. Reporter is job employer
  if (job.employerId !== reportedBy) {
    return { ok: false, error: 'مش مسموحلك تبلّغ عن غياب في هذه الفرصة', code: 'NOT_JOB_OWNER' };
  }

  // 4. Worker is accepted on the job
  const { listByJob: listApps } = await import('./applications.js');
  const apps = await listApps(jobId);
  const accepted = apps.find(a => a.workerId === workerId && a.status === 'accepted');
  if (!accepted) {
    return { ok: false, error: 'العامل مش مقبول في هذه الفرصة', code: 'NOT_ACCEPTED_WORKER' };
  }

  // 5. Check if worker already checked in today
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const existing = await findTodayRecord(jobId, workerId, todayMidnight);

  if (existing && (existing.status === 'checked_in' || existing.status === 'checked_out' || existing.status === 'confirmed')) {
    return { ok: false, error: 'العامل سجّل حضوره بالفعل النهارده', code: 'WORKER_ALREADY_CHECKED_IN' };
  }

  // If existing no_show record → return it (already reported)
  if (existing && existing.status === 'no_show') {
    return { ok: true, attendance: existing };
  }

  // 6. Create no_show record
  const now = new Date();
  const id = generateId();
  const attendance = {
    id,
    jobId,
    workerId,
    employerId: job.employerId,
    date: getEgyptDateString(now),
    status: 'no_show',
    checkInAt: null,
    checkInLat: null,
    checkInLng: null,
    checkOutAt: null,
    checkOutLat: null,
    checkOutLng: null,
    hoursWorked: null,
    employerConfirmed: false,
    employerConfirmedAt: null,
    noShowReportedBy: reportedBy,
    noShowReportedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };

  await atomicWrite(getRecordPath('attendance', id), attendance);

  // Update indexes
  await addToSetIndex(JOB_ATTENDANCE_INDEX, jobId, id);
  await addToSetIndex(WORKER_ATTENDANCE_INDEX, workerId, id);

  eventBus.emit('attendance:noshow', {
    attendanceId: id,
    jobId,
    workerId,
    reportedBy,
  });

  return { ok: true, attendance };
  }); // end withLock
}

/**
 * Employer manual check-in (no GPS required)
 * @param {string} jobId
 * @param {string} workerId
 * @param {string} employerId
 * @returns {Promise<{ ok: boolean, attendance?: object, error?: string, code?: string }>}
 */
export function employerCheckIn(jobId, workerId, employerId) {
  return withLock(`attendance:${jobId}:${workerId}`, async () => {
    // 1. Feature flag
    if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) {
      return { ok: false, error: 'نظام الحضور غير مفعّل حالياً', code: 'ATTENDANCE_DISABLED' };
    }

    // 2. allowEmployerOverride check
    if (!config.ATTENDANCE.allowEmployerOverride) {
      return { ok: false, error: 'تسجيل الحضور اليدوي غير مفعّل', code: 'MANUAL_CHECKIN_DISABLED' };
    }

    // 3. Job exists & in_progress
    const { findById: findJob } = await import('./jobs.js');
    const job = await findJob(jobId);
    if (!job) {
      return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
    }
    if (job.status !== 'in_progress') {
      return { ok: false, error: 'الفرصة مش في حالة تنفيذ', code: 'JOB_NOT_IN_PROGRESS' };
    }

    // 4. Employer owns the job
    if (job.employerId !== employerId) {
      return { ok: false, error: 'مش مسموحلك تسجل حضور في هذه الفرصة', code: 'NOT_JOB_OWNER' };
    }

    // 5. Worker is accepted on this job
    const { listByJob: listApps } = await import('./applications.js');
    const apps = await listApps(jobId);
    const accepted = apps.find(a => a.workerId === workerId && a.status === 'accepted');
    if (!accepted) {
      return { ok: false, error: 'العامل مش مقبول في هذه الفرصة', code: 'NOT_ACCEPTED_WORKER' };
    }

    // 6. No duplicate today
    const { getEgyptMidnight } = await import('./geo.js');
    const todayMidnight = getEgyptMidnight();
    const existing = await findTodayRecord(jobId, workerId, todayMidnight);

    if (existing) {
      if (existing.status === 'no_show') {
        // Override no_show → checked_in (confirmed by employer)
        const now = new Date();
        existing.status = 'confirmed';
        existing.checkInAt = now.toISOString();
        existing.employerConfirmed = true;
        existing.employerConfirmedAt = now.toISOString();
        await atomicWrite(getRecordPath('attendance', existing.id), existing);

        eventBus.emit('attendance:checkin', {
          attendanceId: existing.id,
          jobId,
          workerId,
          employerId,
        });

        return { ok: true, attendance: existing };
      }
      return { ok: false, error: 'العامل سجّل حضوره النهارده بالفعل', code: 'ALREADY_CHECKED_IN' };
    }

    // ── Create attendance record (pre-confirmed, no GPS) ──
    const now = new Date();
    const id = generateId();
    const attendance = {
      id,
      jobId,
      workerId,
      employerId: job.employerId,
      date: getEgyptDateString(now),
      status: 'confirmed',
      checkInAt: now.toISOString(),
      checkInLat: null,
      checkInLng: null,
      checkOutAt: null,
      checkOutLat: null,
      checkOutLng: null,
      hoursWorked: null,
      employerConfirmed: true,
      employerConfirmedAt: now.toISOString(),
      noShowReportedBy: null,
      noShowReportedAt: null,
      createdAt: now.toISOString(),
    };

    await atomicWrite(getRecordPath('attendance', id), attendance);

    // Update indexes
    await addToSetIndex(JOB_ATTENDANCE_INDEX, jobId, id);
    await addToSetIndex(WORKER_ATTENDANCE_INDEX, workerId, id);

    eventBus.emit('attendance:checkin', {
      attendanceId: id,
      jobId,
      workerId,
      employerId,
    });

    return { ok: true, attendance };
  }); // end withLock
}

/**
 * List attendance records for a job (index-accelerated)
 * @param {string} jobId
 * @param {{ date?: string }} options — optional YYYY-MM-DD date filter
 * @returns {Promise<object[]>}
 */
export async function listByJob(jobId, options = {}) {
  let records;

  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(JOB_ATTENDANCE_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const attId of indexedIds) {
      const record = await readJSON(getRecordPath('attendance', attId));
      if (record) results.push(record);
    }
    records = results;
  } else {
    // Fallback: full scan
    const attDir = getCollectionPath('attendance');
    const all = await listJSON(attDir);
    records = all.filter(a => a.jobId === jobId);
  }

  // Optional date filter
  if (options.date) {
    records = records.filter(r => r.date === options.date);
  }

  // Sort newest first
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return records;
}

/**
 * List attendance records for a worker (index-accelerated)
 * @param {string} workerId
 * @returns {Promise<object[]>}
 */
export async function listByWorker(workerId) {
  let records;

  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(WORKER_ATTENDANCE_INDEX, workerId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const attId of indexedIds) {
      const record = await readJSON(getRecordPath('attendance', attId));
      if (record) results.push(record);
    }
    records = results;
  } else {
    // Fallback: full scan
    const attDir = getCollectionPath('attendance');
    const all = await listJSON(attDir);
    records = all.filter(a => a.workerId === workerId);
  }

  // Sort newest first
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return records;
}

/**
 * Get aggregated attendance summary for a job
 * @param {string} jobId
 * @returns {Promise<object>}
 */
export async function getJobSummary(jobId) {
  const records = await listByJob(jobId);

  const uniqueDates = new Set(records.map(r => r.date));
  const noShowCount = records.filter(r => r.status === 'no_show').length;
  const confirmedCount = records.filter(r => r.status === 'confirmed' || r.employerConfirmed).length;
  const checkedInCount = records.filter(r => r.status === 'checked_in' || r.status === 'checked_out' || r.status === 'confirmed').length;
  const totalHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);

  // Attendance by worker
  const attendanceByWorker = {};
  for (const record of records) {
    if (!attendanceByWorker[record.workerId]) {
      attendanceByWorker[record.workerId] = {
        workerId: record.workerId,
        totalRecords: 0,
        checkedIn: 0,
        noShows: 0,
        confirmed: 0,
        totalHours: 0,
      };
    }
    const w = attendanceByWorker[record.workerId];
    w.totalRecords++;
    if (record.status === 'no_show') w.noShows++;
    if (record.status === 'checked_in' || record.status === 'checked_out' || record.status === 'confirmed') w.checkedIn++;
    if (record.status === 'confirmed' || record.employerConfirmed) w.confirmed++;
    w.totalHours = Math.round((w.totalHours + (record.hoursWorked || 0)) * 10) / 10;
  }

  return {
    jobId,
    totalDays: uniqueDates.size,
    totalRecords: records.length,
    checkedInCount,
    noShowCount,
    confirmedCount,
    totalHours: Math.round(totalHours * 10) / 10,
    attendanceByWorker,
  };
}

/**
 * Find attendance record by ID
 * @param {string} attendanceId
 * @returns {Promise<object|null>}
 */
export async function findById(attendanceId) {
  return await readJSON(getRecordPath('attendance', attendanceId));
}

/**
 * Auto-detect no-shows for in_progress jobs
 * Checks accepted workers who haven't checked in after autoNoShowAfterHours
 * Runs at startup + periodic cleanup (fire-and-forget)
 * @returns {Promise<number>} count of auto-detected no-shows
 */
export async function autoDetectNoShows() {
  // 1. Feature flag checks
  if (!config.ATTENDANCE || !config.ATTENDANCE.enabled) return 0;
  if (!config.ATTENDANCE.autoNoShowAfterHours || config.ATTENDANCE.autoNoShowAfterHours <= 0) return 0;

  // 2. Calculate cutoff time
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const cutoffMs = config.ATTENDANCE.autoNoShowAfterHours * 60 * 60 * 1000;
  const cutoffTime = new Date(todayMidnight.getTime() + cutoffMs);
  const now = new Date();

  // 3. Too early — don't mark anyone yet
  if (now < cutoffTime) return 0;

  // 4. Get all in_progress jobs
  const { listAll: listAllJobs } = await import('./jobs.js');
  const allJobs = await listAllJobs();
  const inProgressJobs = allJobs.filter(j => j.status === 'in_progress');

  if (inProgressJobs.length === 0) return 0;

  // 5. For each in_progress job, check accepted workers
  const { listByJob: listAppsByJob } = await import('./applications.js');
  let count = 0;

  for (const job of inProgressJobs) {
    try {
      const apps = await listAppsByJob(job.id);
      const acceptedWorkers = apps.filter(a => a.status === 'accepted');

      for (const app of acceptedWorkers) {
        // Check if worker has any record today
        const existing = await findTodayRecord(job.id, app.workerId, todayMidnight);
        if (!existing) {
          // No record → auto no-show (use 'system' as reporter)
          const result = await reportNoShow(job.id, app.workerId, 'system');
          if (result.ok) count++;
        }
      }
    } catch (err) {
      // Fire-and-forget per job — continue to next
      logger.warn('Auto no-show detection error for job', { jobId: job.id, error: err.message });
    }
  }

  if (count > 0) {
    logger.info(`Auto no-show: detected ${count} absences`);
  }

  return count;
}
```

---

## `server/services/auditLog.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/auditLog.js — Admin Audit Trail (Append-Only)
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, getCollectionPath, listJSON } from './database.js';

/**
 * Log an admin action (append-only — no update or delete)
 * Fire-and-forget safe — callers should use .catch(() => {})
 *
 * @param {{ adminId: string, action: string, targetType: string, targetId: string, details?: object, ip?: string }} params
 * @returns {Promise<object>} the created audit record
 */
export async function logAction({ adminId, action, targetType, targetId, details, ip }) {
  if (!config.AUDIT || !config.AUDIT.enabled) return null;

  const id = 'aud_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const record = {
    id,
    adminId: adminId || 'unknown',
    action: action || 'unknown',
    targetType: targetType || 'unknown',
    targetId: targetId || 'unknown',
    details: details || null,
    ip: ip || 'unknown',
    createdAt: now,
  };

  const recordPath = getRecordPath('audit', id);
  await atomicWrite(recordPath, record);

  return record;
}

/**
 * List audit log entries (paginated, filterable, newest first)
 *
 * @param {{ page?: number, limit?: number, action?: string, targetType?: string }} options
 * @returns {Promise<{ actions: object[], page: number, limit: number, total: number, totalPages: number }>}
 */
export async function listActions({ page = 1, limit = 50, action, targetType } = {}) {
  const maxPerPage = config.AUDIT ? config.AUDIT.maxEntriesPerPage : 50;
  const safeLimit = Math.min(Math.max(1, limit), maxPerPage);
  const safePage = Math.max(1, page);

  const auditDir = getCollectionPath('audit');
  let records = await listJSON(auditDir);

  // Filter to audit records only (prefix check)
  records = records.filter(r => r.id && r.id.startsWith('aud_'));

  // Apply filters
  if (action) {
    records = records.filter(r => r.action === action);
  }
  if (targetType) {
    records = records.filter(r => r.targetType === targetType);
  }

  // Sort newest first
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const clampedPage = Math.min(safePage, totalPages);
  const offset = (clampedPage - 1) * safeLimit;
  const actions = records.slice(offset, offset + safeLimit);

  return { actions, page: clampedPage, limit: safeLimit, total, totalPages };
}

/**
 * Count total audit log entries
 * @returns {Promise<number>}
 */
export async function countActions() {
  const auditDir = getCollectionPath('audit');
  const records = await listJSON(auditDir);
  return records.filter(r => r.id && r.id.startsWith('aud_')).length;
}
```

---

## `server/services/auth.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/auth.js — OTP Generation & Verification
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, deleteJSON, getRecordPath, listJSON, getCollectionPath } from './database.js';
import { createSession } from './sessions.js';
import { findByPhone, create as createUser } from './users.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { sendOtpMessage } from './messaging.js';

// ── OTP Hashing ──────────────────────────────────────────────
function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// ── Per-phone OTP rate limiting (in-memory) ──────────────────
const phoneOtpTracker = new Map();
const PHONE_OTP_WINDOW_MS = config.RATE_LIMIT.otpWindowMs;  // 5 minutes
const PHONE_OTP_MAX = config.RATE_LIMIT.otpMaxRequests;     // 5 per window

function isPhoneOtpRateLimited(phone) {
  const now = Date.now();
  const tracker = phoneOtpTracker.get(phone);
  if (!tracker) return false;
  // Clean old entries
  const recent = tracker.filter(ts => now - ts < PHONE_OTP_WINDOW_MS);
  phoneOtpTracker.set(phone, recent);
  return recent.length >= PHONE_OTP_MAX;
}

function recordPhoneOtp(phone) {
  const now = Date.now();
  if (!phoneOtpTracker.has(phone)) {
    phoneOtpTracker.set(phone, []);
  }
  phoneOtpTracker.get(phone).push(now);
}

// Cleanup stale entries periodically (every 10 minutes)
const phoneOtpCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [phone, timestamps] of phoneOtpTracker) {
    const recent = timestamps.filter(ts => now - ts < PHONE_OTP_WINDOW_MS);
    if (recent.length === 0) {
      phoneOtpTracker.delete(phone);
    } else {
      phoneOtpTracker.set(phone, recent);
    }
  }
}, 10 * 60 * 1000);
if (phoneOtpCleanupTimer.unref) phoneOtpCleanupTimer.unref();

/**
 * Generate a random OTP
 * @returns {string} e.g. "1234"
 */
export function generateOtp() {
  const length = config.AUTH.otpLength;
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  const num = crypto.randomInt(min, max);
  return String(num);
}

/**
 * Send OTP to phone (mock in Phase 1)
 */
export async function sendOtp(phone, role) {
  // Per-phone rate limiting
  if (isPhoneOtpRateLimited(phone)) {
    return {
      ok: false,
      error: 'تم تجاوز الحد المسموح من طلبات كود التحقق لهذا الرقم. حاول بعد قليل.',
      code: 'PHONE_OTP_RATE_LIMITED',
    };
  }
  recordPhoneOtp(phone);

  const otp = generateOtp();
  const now = new Date();

  const otpData = {
    phone,
    otpHash: hashOtp(otp),
    role,
    attempts: 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.AUTH.otpExpiryMs).toISOString(),
  };

  const otpPath = getRecordPath('otp', phone);
  await atomicWrite(otpPath, otpData);

  // Send OTP via messaging (WhatsApp → SMS → mock based on config)
  const msgResult = await sendOtpMessage(phone, otp);
  if (!msgResult.ok) {
    logger.warn('OTP message delivery failed — OTP still saved for verification', {
      phone, channel: msgResult.channel, error: msgResult.error,
    });
  }
  logger.info('OTP processed', {
    phone, role,
    channel: msgResult.channel,
    delivered: msgResult.ok,
    fallbackUsed: msgResult.fallbackUsed || false,
  });

  eventBus.emit('otp:sent', { phone, role });

  return { ok: true, message: 'تم إرسال كود التحقق' };
}

/**
 * Verify OTP and create session
 */
export async function verifyOtp(phone, otp, metadata) {
  const otpPath = getRecordPath('otp', phone);
  const otpData = await readJSON(otpPath);

  if (!otpData) {
    return { ok: false, error: 'لم يتم إرسال كود لهذا الرقم', code: 'OTP_NOT_FOUND' };
  }

  // Check expiry
  if (new Date() > new Date(otpData.expiresAt)) {
    await deleteJSON(otpPath);
    return { ok: false, error: 'كود التحقق انتهت صلاحيته', code: 'OTP_EXPIRED' };
  }

  // Check max attempts
  if (otpData.attempts >= config.AUTH.maxOtpAttempts) {
    await deleteJSON(otpPath);
    return { ok: false, error: 'تم تجاوز الحد الأقصى من المحاولات', code: 'OTP_MAX_ATTEMPTS' };
  }

  // Check OTP (hashed comparison — backward compatible with old plain 'otp' field)
  const inputHash = hashOtp(otp);
  const storedHash = otpData.otpHash || (otpData.otp ? hashOtp(otpData.otp) : null);
  if (!storedHash || storedHash !== inputHash) {
    otpData.attempts += 1;
    await atomicWrite(otpPath, otpData);
    return {
      ok: false,
      error: 'كود التحقق غير صحيح',
      code: 'OTP_INVALID',
      attemptsLeft: config.AUTH.maxOtpAttempts - otpData.attempts,
    };
  }

  // OTP is correct — delete it
  await deleteJSON(otpPath);

  // Find or create user
  let user = await findByPhone(phone);
  if (!user) {
    user = await createUser(phone, otpData.role);
    eventBus.emit('user:created', { userId: user.id, phone, role: otpData.role });
  }

  // Create session (with optional metadata for IP/userAgent tracking)
  const session = await createSession(user.id, user.role, metadata || undefined);

  eventBus.emit('session:created', { userId: user.id, token: session.token });

  logger.info('OTP verified successfully', { phone, userId: user.id });

  return {
    ok: true,
    token: session.token,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
      governorate: user.governorate,
      termsAcceptedAt: user.termsAcceptedAt || null,
    },
  };
}

/**
 * Clean expired OTP files (startup + periodic)
 * @returns {Promise<number>} count of cleaned OTP files
 */
export async function cleanExpiredOtps() {
  const otpDir = getCollectionPath('otp');
  const allOtps = await listJSON(otpDir);
  const now = new Date();
  let cleaned = 0;

  for (const otpData of allOtps) {
    if (otpData.expiresAt && new Date(otpData.expiresAt) < now) {
      const otpPath = getRecordPath('otp', otpData.phone);
      await deleteJSON(otpPath);
      cleaned++;
    }
  }

  return cleaned;
}
```

---

## `server/services/backupScheduler.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/backupScheduler.js — Automated Backup Scheduler
// ═══════════════════════════════════════════════════════════════
// Config-driven daily backup at configured hour (Egypt timezone).
// Integrity verification, retention policy, fire-and-forget.
// Follows activitySummary.js timer pattern.
// ═══════════════════════════════════════════════════════════════

import { cp, readdir, readFile, rm, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import { logger } from './logger.js';

/** @type {string|null} last backup date string (Egypt timezone YYYY-MM-DD) */
let lastBackupDate = null;

/** @type {{ lastDate: string|null, lastResult: object|null }} */
let lastBackupInfo = { lastDate: null, lastResult: null };

const DATA_DIR = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

/**
 * Get current date string + hour in Egypt timezone (UTC+2)
 * @returns {{ dateStr: string, hour: number }}
 */
function getEgyptDateAndHour() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(egyptDate.getUTCDate()).padStart(2, '0');
  return {
    dateStr: `${y}-${m}-${d}`,
    hour: egyptDate.getUTCHours(),
  };
}

/**
 * Verify integrity of backup by parsing each JSON file
 * @param {string} backupDir
 * @returns {Promise<{ valid: boolean, total: number, errors: number }>}
 */
async function verifyBackupIntegrity(backupDir) {
  let total = 0;
  let errors = 0;

  async function scanDir(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
          total++;
          try {
            const raw = await readFile(fullPath, 'utf-8');
            JSON.parse(raw);
          } catch (_) {
            errors++;
            logger.warn('Backup integrity: corrupted file', { file: fullPath });
          }
        }
      }
    } catch (_) {
      // Directory read error — non-fatal
    }
  }

  await scanDir(backupDir);
  return { valid: errors === 0, total, errors };
}

/**
 * Enforce retention policy — keep only the last N backups, delete the rest.
 * @param {string} targetDir
 * @param {number} retentionCount
 * @returns {Promise<number>} count of deleted backups
 */
async function enforceRetention(targetDir, retentionCount) {
  let deleted = 0;
  try {
    const entries = await readdir(targetDir);
    const backupDirs = entries
      .filter(e => e.startsWith('yawmia-backup-'))
      .sort(); // ascending by timestamp

    if (backupDirs.length <= retentionCount) return 0;

    const toDelete = backupDirs.slice(0, backupDirs.length - retentionCount);
    for (const dir of toDelete) {
      try {
        await rm(join(targetDir, dir), { recursive: true, force: true });
        deleted++;
      } catch (_) {
        // Individual deletion failure — non-fatal
      }
    }
  } catch (_) {
    // Non-fatal
  }
  return deleted;
}

/**
 * Check if backup should run, and run it if so.
 * Called by hourly timer — acts only at configured hour.
 * Prevents re-run on same date.
 * Fire-and-forget safe — NEVER throws.
 *
 * @returns {Promise<{ backed: boolean, verified?: boolean, cleaned?: number }>}
 */
export async function checkAndRunBackup() {
  try {
    // 1. Feature flag
    if (!config.BACKUP || !config.BACKUP.enabled) {
      return { backed: false };
    }

    // 2. Check hour
    const { dateStr, hour } = getEgyptDateAndHour();
    if (hour !== config.BACKUP.hourEgypt) {
      return { backed: false };
    }

    // 3. Prevent re-run same day
    if (lastBackupDate === dateStr) {
      return { backed: false };
    }

    // 4. Mark as ran
    lastBackupDate = dateStr;

    logger.info('Backup: starting daily backup');

    // 5. Create backup directory
    const targetDir = config.BACKUP.targetDir || './backups';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = join(targetDir, `yawmia-backup-${timestamp}`);

    await mkdir(backupDir, { recursive: true });

    // 6. Check source exists
    try {
      await stat(DATA_DIR);
    } catch (_) {
      logger.warn('Backup: data directory not found', { path: DATA_DIR });
      return { backed: false };
    }

    // 7. Copy data
    await cp(DATA_DIR, backupDir, { recursive: true });

    // 8. Optional integrity check
    let verified = undefined;
    if (config.BACKUP.verifyIntegrity) {
      const integrity = await verifyBackupIntegrity(backupDir);
      verified = integrity.valid;
      logger.info('Backup: integrity check', {
        total: integrity.total,
        errors: integrity.errors,
        valid: integrity.valid,
      });
    }

    // 9. Retention enforcement
    const cleaned = await enforceRetention(targetDir, config.BACKUP.retentionCount || 7);

    const result = { backed: true, verified, cleaned };
    lastBackupInfo = { lastDate: dateStr, lastResult: result };

    logger.info('Backup: completed', result);

    return result;
  } catch (err) {
    // NEVER throw — fire-and-forget safe
    logger.error('Backup: failed', { error: err.message });
    return { backed: false };
  }
}

/**
 * Get last backup info (for health/admin dashboard).
 * @returns {{ lastDate: string|null, lastResult: object|null }}
 */
export function getLastBackupInfo() {
  return { ...lastBackupInfo };
}
```

---

## `server/services/cache.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/cache.js — In-Memory Read Cache (TTL-based)
// ═══════════════════════════════════════════════════════════════
// Map-based cache with per-entry TTL, invalidation, prefix invalidation.
// Config-driven via config.CACHE — disabled mode = all ops are no-ops.
// Used by database.js to reduce filesystem I/O on hot paths.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/** @type {Map<string, { value: *, expiresAt: number }>} */
const store = new Map();

/** @type {{ hits: number, misses: number }} */
const counters = { hits: 0, misses: 0 };

/**
 * Check if cache is enabled via config
 * @returns {boolean}
 */
function isEnabled() {
  return !!(config.CACHE && config.CACHE.enabled);
}

/**
 * Get a cached value by key.
 * Returns undefined on miss or if cache is disabled.
 * @param {string} key
 * @returns {*} cached value or undefined
 */
export function get(key) {
  if (!isEnabled()) {
    counters.misses++;
    return undefined;
  }

  const entry = store.get(key);
  if (!entry) {
    counters.misses++;
    return undefined;
  }

  // Check TTL expiry
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    counters.misses++;
    return undefined;
  }

  counters.hits++;
  return entry.value;
}

/**
 * Store a value in cache with TTL.
 * No-op if cache is disabled.
 * @param {string} key
 * @param {*} value — the value to cache (should be JSON-serializable)
 * @param {number} [ttlMs] — TTL in milliseconds (defaults to config.CACHE.defaultTtlMs)
 */
export function set(key, value, ttlMs) {
  if (!isEnabled()) return;

  const ttl = ttlMs || config.CACHE.defaultTtlMs;
  const expiresAt = Date.now() + ttl;

  // Soft limit enforcement — evict oldest if over maxEntries
  if (store.size >= config.CACHE.maxEntries) {
    // Delete first entry (oldest insertion order in Map)
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) {
      store.delete(firstKey);
    }
  }

  store.set(key, { value, expiresAt });
}

/**
 * Invalidate (remove) a specific cache key.
 * No-op if cache is disabled.
 * @param {string} key
 */
export function invalidate(key) {
  if (!isEnabled()) return;
  store.delete(key);
}

/**
 * Invalidate all cache keys starting with the given prefix.
 * No-op if cache is disabled.
 * @param {string} prefix
 */
export function invalidatePrefix(prefix) {
  if (!isEnabled()) return;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Get cache statistics.
 * @returns {{ hits: number, misses: number, size: number, hitRate: string }}
 */
export function stats() {
  const total = counters.hits + counters.misses;
  const hitRate = total > 0
    ? Math.round((counters.hits / total) * 100) + '%'
    : '0%';

  return {
    hits: counters.hits,
    misses: counters.misses,
    size: store.size,
    hitRate,
  };
}

/**
 * Clear all cache entries and reset counters.
 * Used for testing.
 */
export function clear() {
  store.clear();
  counters.hits = 0;
  counters.misses = 0;
}

/**
 * Remove expired entries from cache.
 * Called by cleanup timer.
 */
function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(key);
    }
  }
}

// ── Cleanup Timer (unref'd — doesn't prevent process exit) ───
const cleanupIntervalMs = (config.CACHE && config.CACHE.cleanupIntervalMs) || 300000;
const cleanupTimer = setInterval(cleanupExpired, cleanupIntervalMs);
if (cleanupTimer.unref) cleanupTimer.unref();
```

---

## `server/services/channels/sms.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/channels/sms.js — Infobip SMS Adapter
// ═══════════════════════════════════════════════════════════════
// Sends OTP via Infobip SMS gateway (fallback channel)
// ═══════════════════════════════════════════════════════════════

import config from '../../../config.js';
import { logger } from '../logger.js';

/**
 * Convert Egyptian local phone to international format
 * 01012345678 → 2001012345678
 * @param {string} phone — Egyptian local (01...)
 * @returns {string} — International (201...)
 */
function toInternational(phone) {
  return phone.startsWith('0') ? '20' + phone.slice(1) : phone;
}

/**
 * Send OTP via Infobip SMS
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp — the OTP code
 * @returns {Promise<{ok: boolean, channel: string, messageId?: string, error?: string}>}
 */
export async function sendSmsOtp(phone, otp) {
  const channel = 'sms';

  // ── Check config ──
  if (!config.MESSAGING.sms.enabled) {
    return { ok: false, channel, error: 'SMS channel is disabled in config' };
  }

  // ── Check env vars ──
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;

  if (!apiKey || !baseUrl) {
    logger.error('Infobip env vars missing', {
      hasApiKey: !!apiKey,
      hasBaseUrl: !!baseUrl,
    });
    return { ok: false, channel, error: 'Infobip credentials not configured' };
  }

  // ── Build payload ──
  const senderId = process.env.INFOBIP_SENDER || config.MESSAGING.sms.senderId;
  const internationalPhone = toInternational(phone);
  const messageText = `يوميّة: كود التحقق الخاص بك هو ${otp}. صالح لمدة 5 دقائق.`;

  const payload = {
    messages: [
      {
        destinations: [{ to: internationalPhone }],
        from: senderId,
        text: messageText,
      },
    ],
  };

  // ── Send request ──
  const url = `${baseUrl}/sms/2/text/advanced`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `App ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const data = await response.json();

    // ── Success ──
    if (response.ok && data.messages && data.messages.length > 0) {
      const msg = data.messages[0];
      const messageId = msg.messageId || msg.id || 'unknown';
      const status = msg.status?.name || 'unknown';

      logger.info('SMS OTP sent successfully', {
        phone: internationalPhone,
        messageId,
        status,
      });
      return { ok: true, channel, messageId };
    }

    // ── Infobip error ──
    const errorMessage = data.requestError?.serviceException?.text
      || data.requestError?.policyException?.text
      || 'Unknown Infobip API error';

    logger.error('Infobip SMS API error', {
      phone: internationalPhone,
      statusCode: response.status,
      errorMessage,
    });
    return { ok: false, channel, error: errorMessage };

  } catch (err) {
    // Network / timeout errors
    logger.error('Infobip SMS request failed', {
      phone: internationalPhone,
      error: err.message,
      isTimeout: err.name === 'TimeoutError',
    });
    return { ok: false, channel, error: err.message };
  }
}
```

---

## `server/services/channels/whatsapp.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/channels/whatsapp.js — WhatsApp Cloud API Adapter
// ═══════════════════════════════════════════════════════════════
// Sends OTP via Meta WhatsApp Cloud API authentication template
// Template: yawmia_otp (pre-approved, with copy code button)
// ═══════════════════════════════════════════════════════════════

import config from '../../../config.js';
import { logger } from '../logger.js';

/**
 * Convert Egyptian local phone to international format
 * 01012345678 → 2001012345678
 * @param {string} phone — Egyptian local (01...)
 * @returns {string} — International (201...)
 */
function toInternational(phone) {
  return phone.startsWith('0') ? '20' + phone.slice(1) : phone;
}

/**
 * Send OTP via WhatsApp Cloud API authentication template
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp — the OTP code
 * @returns {Promise<{ok: boolean, channel: string, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppOtp(phone, otp) {
  const channel = 'whatsapp';

  // ── Check config ──
  if (!config.MESSAGING.whatsapp.enabled) {
    return { ok: false, channel, error: 'WhatsApp channel is disabled in config' };
  }

  // ── Check env vars ──
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error('WhatsApp env vars missing', {
      hasPhoneNumberId: !!phoneNumberId,
      hasAccessToken: !!accessToken,
    });
    return { ok: false, channel, error: 'WhatsApp credentials not configured' };
  }

  // ── Build payload ──
  const whatsappConfig = config.MESSAGING.whatsapp;
  const internationalPhone = toInternational(phone);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: internationalPhone,
    type: 'template',
    template: {
      name: whatsappConfig.templateName,
      language: { code: whatsappConfig.templateLanguage },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: otp }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: otp }],
        },
      ],
    },
  };

  // ── Send request ──
  const url = `https://graph.facebook.com/${whatsappConfig.apiVersion}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const data = await response.json();

    // ── Success ──
    if (response.ok && data.messages && data.messages.length > 0) {
      const messageId = data.messages[0].id;
      logger.info('WhatsApp OTP sent successfully', {
        phone: internationalPhone,
        messageId,
      });
      return { ok: true, channel, messageId };
    }

    // ── Meta API error ──
    const errorCode = data.error?.code;
    const errorMessage = data.error?.message || 'Unknown WhatsApp API error';

    // Error 131026: user not on WhatsApp
    if (errorCode === 131026) {
      logger.warn('User not on WhatsApp — will fallback', {
        phone: internationalPhone,
        errorCode,
      });
      return { ok: false, channel, error: 'User not on WhatsApp' };
    }

    // Error 131047: template not approved
    if (errorCode === 131047) {
      logger.error('WhatsApp template not approved', {
        templateName: whatsappConfig.templateName,
        errorCode,
      });
      return { ok: false, channel, error: 'Template not approved' };
    }

    // Other Meta errors
    logger.error('WhatsApp API error', {
      phone: internationalPhone,
      statusCode: response.status,
      errorCode,
      errorMessage,
    });
    return { ok: false, channel, error: errorMessage };

  } catch (err) {
    // Network / timeout errors
    logger.error('WhatsApp request failed', {
      phone: internationalPhone,
      error: err.message,
      isTimeout: err.name === 'TimeoutError',
    });
    return { ok: false, channel, error: err.message };
  }
}
```

---

## `server/services/contentFilter.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/contentFilter.js — Keyword Content Filtering
// ═══════════════════════════════════════════════════════════════
// Arabic-normalized blocklist matching + phone number detection.
// Scoring: 0.0 (clean) → 1.0 (definitely unsafe).
// Conservative — false positives worse than false negatives.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { normalizeArabic } from './arabicNormalizer.js';
import { logger } from './logger.js';

// ── Phone number detection regex (Egyptian format) ───────────
// Matches: 01012345678, 01112345678, 01212345678, 01512345678
// Also matches with dashes/spaces: 010-1234-5678, 010 1234 5678
const PHONE_REGEX = /01[0125][\s\-]?\d{4}[\s\-]?\d{4}/;

// ── URL detection regex ──────────────────────────────────────
// Matches: http://... https://... www.something...
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/i;

// ── Arabic-Indic digit phone detection ───────────────────────
// Matches Egyptian phone in Arabic-Indic digits: ٠١٠١٢٣٤٥٦٧٨
// Arabic-Indic digits: ٠١٢٣٤٥٦٧٨٩ (U+0660-U+0669)
// Pattern: ٠١[٠١٢٥]XXXXXXXX (11 Arabic-Indic digits, mirrors 01[0125]XXXXXXXX)
const ARABIC_PHONE_REGEX = /\u0660\u0661[\u0660\u0661\u0662\u0665][\s\-]?[\u0660-\u0669]{4}[\s\-]?[\u0660-\u0669]{4}/;

// ── Blocklist (pre-normalized Arabic terms) ──────────────────
// Categories: harassment, fraud, contact_info bypass
// Each term: { normalized: string, weight: number, category: string }
const RAW_BLOCKLIST = [
  // Harassment / offensive (weight 0.3–0.5)
  { term: 'نصاب', weight: 0.4, category: 'fraud' },
  { term: 'محتال', weight: 0.4, category: 'fraud' },
  { term: 'نصب', weight: 0.35, category: 'fraud' },
  { term: 'احتيال', weight: 0.4, category: 'fraud' },
  { term: 'سرقه', weight: 0.35, category: 'fraud' },
  { term: 'حرامي', weight: 0.35, category: 'fraud' },
  { term: 'تحرش', weight: 0.5, category: 'harassment' },
  { term: 'شتيمه', weight: 0.4, category: 'harassment' },
  { term: 'سب', weight: 0.3, category: 'harassment' },
  { term: 'ضرب', weight: 0.3, category: 'harassment' },
  { term: 'تهديد', weight: 0.4, category: 'harassment' },
  // Contact info bypass indicators (weight 0.5)
  { term: 'واتساب', weight: 0.5, category: 'contact_info' },
  { term: 'واتس', weight: 0.5, category: 'contact_info' },
  { term: 'whatsapp', weight: 0.5, category: 'contact_info' },
  { term: 'تليجرام', weight: 0.5, category: 'contact_info' },
  { term: 'telegram', weight: 0.5, category: 'contact_info' },
  { term: 'كلمني على', weight: 0.4, category: 'contact_info' },
  { term: 'رقمي', weight: 0.3, category: 'contact_info' },
  // Egyptian dialect — WhatsApp variations
  { term: 'واتس اب', weight: 0.5, category: 'contact_info' },
  { term: 'واتسب', weight: 0.5, category: 'contact_info' },
  { term: 'whats app', weight: 0.5, category: 'contact_info' },
  { term: 'وتساب', weight: 0.5, category: 'contact_info' },
  { term: 'الواتس', weight: 0.5, category: 'contact_info' },
  // Direct contact bypass
  { term: 'ابعتلي', weight: 0.4, category: 'contact_info' },
  { term: 'ابعتلى', weight: 0.4, category: 'contact_info' },
  { term: 'رقم التليفون', weight: 0.4, category: 'contact_info' },
  { term: 'رقم الموبايل', weight: 0.4, category: 'contact_info' },
  { term: 'موبايلي', weight: 0.3, category: 'contact_info' },
  { term: 'تليفوني', weight: 0.3, category: 'contact_info' },
  { term: 'نمرتي', weight: 0.3, category: 'contact_info' },
  { term: 'كلمني واتس', weight: 0.5, category: 'contact_info' },
  { term: 'راسلني', weight: 0.3, category: 'contact_info' },
  // Additional harassment/fraud
  { term: 'كداب', weight: 0.35, category: 'fraud' },
  { term: 'غشاش', weight: 0.35, category: 'fraud' },
  { term: 'لص', weight: 0.35, category: 'fraud' },
  { term: 'خاين', weight: 0.3, category: 'harassment' },
  { term: 'قليل الادب', weight: 0.4, category: 'harassment' },
];

// Pre-normalize blocklist terms (once at module load)
const BLOCKLIST = RAW_BLOCKLIST.map(entry => ({
  normalized: normalizeArabic(entry.term.toLowerCase()),
  weight: entry.weight,
  category: entry.category,
  original: entry.term,
}));

/**
 * Check content for unsafe terms and phone numbers.
 *
 * @param {*} text — input text (any type, non-strings return safe)
 * @returns {{ safe: boolean, score: number, flaggedTerms: string[] }}
 *   safe: true if score < blockThreshold (or feature disabled)
 *   score: 0.0 (clean) → 1.0 (definitely unsafe)
 *   flaggedTerms: array of matched term labels
 */
export function checkContent(text) {
  // Feature flag
  if (!config.CONTENT_FILTER || !config.CONTENT_FILTER.enabled) {
    return { safe: true, score: 0, flaggedTerms: [] };
  }

  // Null/empty/non-string → safe
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { safe: true, score: 0, flaggedTerms: [] };
  }

  const blockThreshold = config.CONTENT_FILTER.blockThreshold;
  const warnThreshold = config.CONTENT_FILTER.warnThreshold;

  let score = 0;
  const flaggedTerms = [];

  // 1. Phone number detection (on raw text — numbers don't need normalization)
  if (PHONE_REGEX.test(text)) {
    score += 0.8;
    flaggedTerms.push('رقم تليفون');
  }

  // 1b. URL detection (on raw text)
  if (URL_REGEX.test(text)) {
    score += 0.7;
    flaggedTerms.push('رابط خارجي');
  }

  // 1c. Arabic-Indic digit phone detection (٠١٠١٢٣٤٥٦٧٨)
  if (ARABIC_PHONE_REGEX.test(text)) {
    score += 0.8;
    flaggedTerms.push('رقم تليفون (أرقام عربية)');
  }

  // 2. Blocklist matching (on normalized text)
  const normalizedText = normalizeArabic(text.toLowerCase());

  for (const entry of BLOCKLIST) {
    if (normalizedText.includes(entry.normalized)) {
      score += entry.weight;
      flaggedTerms.push(entry.original);
    }
  }

  // Cap score at 1.0
  score = Math.min(score, 1.0);
  score = Math.round(score * 100) / 100;

  const safe = score < blockThreshold;

  // Log flagged content
  if (config.CONTENT_FILTER.logFlagged && score >= warnThreshold) {
    logger.warn('Content filter flagged', {
      score,
      safe,
      flaggedTerms,
      textPreview: text.substring(0, 100),
    });
  }

  return { safe, score, flaggedTerms };
}

/**
 * Convenience: check if content is safe (boolean).
 *
 * @param {*} text
 * @returns {boolean} true if safe
 */
export function isContentSafe(text) {
  return checkContent(text).safe;
}
```

---

## `server/services/database.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/database.js — File-based DB with atomic writes
// ═══════════════════════════════════════════════════════════════

import { readFile, writeFile, rename, unlink, readdir, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import config from '../../config.js';
import { get as cacheGet, set as cacheSet, invalidate as cacheInvalidate } from './cache.js';
import { withLock } from './resourceLock.js';

// Allow override via env variable (for testing with temp directories)
const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const ENCODING = config.DATABASE.encoding;

/**
 * Initialize all database directories
 */
export async function initDatabase() {
  const dirs = Object.values(config.DATABASE.dirs);
  for (const dir of dirs) {
    const fullPath = join(BASE_PATH, dir);
    await mkdir(fullPath, { recursive: true });
  }
}

/**
 * Atomic write — write to .tmp then rename
 * Invalidates cache after successful write
 */
export async function atomicWrite(filePath, data) {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), ENCODING);
  await rename(tmpPath, filePath);
  // Invalidate cache AFTER successful disk write
  cacheInvalidate(`file:${filePath}`);
}

/**
 * Read JSON file — returns null if not found
 * Integrates with in-memory cache for read acceleration
 */
export async function readJSON(filePath) {
  // Check cache first
  const cacheKey = `file:${filePath}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const raw = await readFile(filePath, ENCODING);
    const parsed = JSON.parse(raw);

    // Cache the result with appropriate TTL
    const ttl = resolveCacheTtl(filePath);
    if (ttl > 0) {
      cacheSet(cacheKey, parsed, ttl);
    }

    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Resolve cache TTL based on file path
 * @param {string} filePath
 * @returns {number} TTL in ms (0 = don't cache)
 */
function resolveCacheTtl(filePath) {
  if (!config.CACHE || !config.CACHE.enabled) return 0;
  const ttl = config.CACHE.ttl;
  if (filePath.includes('/users/') && filePath.includes('phone-index')) return ttl.phoneIndex;
  if (filePath.includes('/users/')) return ttl.user;
  if (filePath.includes('/jobs/') && !filePath.includes('index.json') && !filePath.includes('employer-index')) return ttl.job;
  if (filePath.includes('/sessions/')) return ttl.session;
  return config.CACHE.defaultTtlMs;
}

/**
 * Safe Read JSON — attempts recovery from .tmp backup on corrupted JSON
 * Use for critical paths (users, jobs, payments) where data loss is unacceptable.
 * Falls back to readJSON behavior for ENOENT. Re-throws non-parse, non-ENOENT errors.
 *
 * @param {string} filePath
 * @returns {Promise<object|null>}
 */
export async function safeReadJSON(filePath) {
  try {
    const raw = await readFile(filePath, ENCODING);
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    if (err instanceof SyntaxError) {
      // Corrupted JSON — attempt recovery from .tmp backup
      const tmpPath = filePath + '.tmp';
      try {
        const tmpRaw = await readFile(tmpPath, ENCODING);
        const data = JSON.parse(tmpRaw);
        // Restore from .tmp — overwrite corrupted file
        await writeFile(filePath, tmpRaw, ENCODING);
        // Log recovery (dynamic import to avoid circular dependency)
        try {
          const { logger } = await import('./logger.js');
          logger.warn('Recovered corrupted JSON from .tmp', { filePath });
        } catch (_) { /* logging failure is non-fatal */ }
        return data;
      } catch {
        // .tmp also missing or corrupted — unrecoverable
        try {
          const { logger } = await import('./logger.js');
          logger.error('Unrecoverable corrupted JSON', { filePath, error: err.message });
        } catch (_) { /* logging failure is non-fatal */ }
        return null;
      }
    }
    throw err;
  }
}

/**
 * Delete a JSON file — ignores ENOENT
 * Invalidates cache after successful delete
 */
export async function deleteJSON(filePath) {
  try {
    await unlink(filePath);
    // Invalidate cache AFTER successful disk delete
    cacheInvalidate(`file:${filePath}`);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}


/**
 * List all JSON files in a directory
 * @param {string} dirPath
 * @param {{ prefix?: string }} [options] — optional prefix filter for filenames
 */
export async function listJSON(dirPath, options = {}) {
  try {
    const files = await readdir(dirPath);
    let jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
    if (options.prefix) {
      jsonFiles = jsonFiles.filter(f => f.startsWith(options.prefix));
    }
    const results = [];
    for (const file of jsonFiles) {
      const data = await readJSON(join(dirPath, file));
      if (data) results.push(data);
    }
    return results;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Paginated list of JSON files in a directory.
 * Reads ONLY the requested slice — O(k) disk reads instead of O(n).
 * @param {string} dirPath
 * @param {{ skip?: number, limit?: number, prefix?: string, sortDir?: 'asc'|'desc' }} [options]
 * @returns {Promise<{ items: object[], total: number }>}
 */
export async function paginatedListJSON(dirPath, options = {}) {
  const skip = Math.max(0, options.skip || 0);
  const limit = Math.max(0, typeof options.limit === 'number' ? options.limit : 20);
  const prefix = options.prefix || '';
  const sortDir = options.sortDir || 'desc';

  try {
    const files = await readdir(dirPath);
    let jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
    if (prefix) {
      jsonFiles = jsonFiles.filter(f => f.startsWith(prefix));
    }

    // Sort by filename (lexicographic — crypto hex IDs are roughly chronological)
    jsonFiles.sort();
    if (sortDir === 'desc') {
      jsonFiles.reverse();
    }

    const total = jsonFiles.length;

    // Slice to requested page
    const sliced = jsonFiles.slice(skip, skip + limit);

    // Read only sliced files
    const items = [];
    for (const file of sliced) {
      const data = await readJSON(join(dirPath, file));
      if (data) items.push(data);
    }

    return { items, total };
  } catch (err) {
    if (err.code === 'ENOENT') return { items: [], total: 0 };
    throw err;
  }
}

/**
 * Read or create an index file
 */
export async function readIndex(indexName) {
  const filePath = join(BASE_PATH, config.DATABASE.indexFiles[indexName]);
  return (await readJSON(filePath)) || {};
}

/**
 * Write an index file (atomic)
 */
export async function writeIndex(indexName, data) {
  const filePath = join(BASE_PATH, config.DATABASE.indexFiles[indexName]);
  await atomicWrite(filePath, data);
}

/**
 * Validate a record ID for safe filesystem use.
 * Allows: alphanumeric, underscore, hyphen (covers all ID formats + phone numbers).
 * Rejects: path traversal (..), slashes, HTML/script, empty, null, too long.
 * @param {*} id
 * @returns {boolean}
 */
export function isValidId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 100) return false;
  if (id.includes('..')) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Get full path for a record
 */
export function getRecordPath(collection, id) {
  const dir = config.DATABASE.dirs[collection];
  if (!dir) throw new Error(`Unknown collection: ${collection}`);
  if (!isValidId(id)) throw new Error(`Invalid record ID: ${id}`);
  return join(BASE_PATH, dir, `${id}.json`);
}

/**
 * Get full directory path for a collection
 */
export function getCollectionPath(collection) {
  const dir = config.DATABASE.dirs[collection];
  if (!dir) throw new Error(`Unknown collection: ${collection}`);
  return join(BASE_PATH, dir);
}

// ═══════════════════════════════════════════════════════════════
// Secondary Set-Based Index Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Read a set-based index file — returns {} if not found
 * @param {string} relativePath — path relative to BASE_PATH (e.g. 'applications/worker-index.json')
 */
export async function readSetIndex(relativePath) {
  const filePath = join(BASE_PATH, relativePath);
  return (await readJSON(filePath)) || {};
}

/**
 * Write a set-based index file atomically
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {object} data — the full index object
 */
export async function writeSetIndex(relativePath, data) {
  const filePath = join(BASE_PATH, relativePath);
  await atomicWrite(filePath, data);
}

/**
 * Add an ID to a key's set in a set-based index (no duplicates)
 * Serialized per index file via withLock to prevent concurrent write races
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key (e.g. workerId, jobId)
 * @param {string} id — the record ID to add
 */
export async function addToSetIndex(relativePath, key, id) {
  return withLock(`index:${relativePath}`, async () => {
    const index = await readSetIndex(relativePath);
    if (!index[key]) {
      index[key] = [];
    }
    if (!index[key].includes(id)) {
      index[key].push(id);
    }
    await writeSetIndex(relativePath, index);
  });
}

/**
 * Remove an ID from a key's set in a set-based index
 * Deletes the key entirely if the array becomes empty
 * Serialized per index file via withLock to prevent concurrent write races
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key
 * @param {string} id — the record ID to remove
 */
export async function removeFromSetIndex(relativePath, key, id) {
  return withLock(`index:${relativePath}`, async () => {
    const index = await readSetIndex(relativePath);
    if (!index[key]) return;
    index[key] = index[key].filter(item => item !== id);
    if (index[key].length === 0) {
      delete index[key];
    }
    await writeSetIndex(relativePath, index);
  });
}

/**
 * Get all IDs for a key from a set-based index
 * Returns [] if key doesn't exist
 * @param {string} relativePath — path relative to BASE_PATH
 * @param {string} key — the grouping key
 * @returns {Promise<string[]>}
 */
export async function getFromSetIndex(relativePath, key) {
  const index = await readSetIndex(relativePath);
  return index[key] || [];
}

// ═══════════════════════════════════════════════════════════════
// Stale .tmp File Cleanup
// ═══════════════════════════════════════════════════════════════

/**
 * Clean stale .tmp files from all data directories
 * Orphan .tmp files older than 5 minutes are deleted (crash leftovers)
 * Fire-and-forget safe — logs warnings but never throws
 * @returns {Promise<number>} count of cleaned .tmp files
 */
export async function cleanStaleTmpFiles() {
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  let cleaned = 0;

  const dirs = Object.values(config.DATABASE.dirs);
  for (const dir of dirs) {
    const fullPath = join(BASE_PATH, dir);
    try {
      const files = await readdir(fullPath);
      for (const file of files) {
        if (!file.endsWith('.tmp')) continue;
        try {
          const filePath = join(fullPath, file);
          const fileStat = await stat(filePath);
          const ageMs = now - fileStat.mtime.getTime();
          if (ageMs > STALE_THRESHOLD_MS) {
            await unlink(filePath);
            cleaned++;
            // Dynamic import to avoid circular dependency
            try {
              const { logger } = await import('./logger.js');
              logger.warn('Cleaned stale .tmp file', { file: filePath, ageMinutes: Math.round(ageMs / 60000) });
            } catch (_) { /* non-fatal */ }
          }
        } catch (_) {
          // Skip individual file errors — non-fatal
        }
      }
    } catch (_) {
      // Skip directory errors — non-fatal (dir might not exist yet)
    }
  }

  return cleaned;
}
```

---

## `server/services/errorAggregator.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/errorAggregator.js — Per-Endpoint Error Counting
// ═══════════════════════════════════════════════════════════════
// In-memory Map: endpoint+hour → { count, lastError, lastTimestamp }.
// 24-hour retention. Hourly cleanup. No file persistence.
// ═══════════════════════════════════════════════════════════════

/**
 * @type {Map<string, { count: number, lastError: string, lastTimestamp: string }>}
 * Key format: `${endpoint}::${hourKey}` where hourKey = YYYY-MM-DDTHH
 */
const counters = new Map();

/**
 * Get current hour key (UTC-based for simplicity)
 * @returns {string} e.g. '2026-04-24T09'
 */
function getHourKey() {
  return new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

/**
 * Record an error for an endpoint.
 * @param {string} endpoint — e.g. '/api/jobs'
 * @param {number} statusCode — HTTP status code
 * @param {string} errorMessage — error message
 */
export function recordError(endpoint, statusCode, errorMessage) {
  const hourKey = getHourKey();
  const key = `${endpoint}::${hourKey}`;

  const entry = counters.get(key);
  if (entry) {
    entry.count++;
    entry.lastError = errorMessage || 'Unknown error';
    entry.lastTimestamp = new Date().toISOString();
    entry.statusCode = statusCode;
  } else {
    counters.set(key, {
      count: 1,
      endpoint,
      hourKey,
      statusCode,
      lastError: errorMessage || 'Unknown error',
      lastTimestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get error summary for the last 24 hours.
 * Aggregated by endpoint (summing across hours).
 * Sorted by total count descending.
 *
 * @returns {{ totalErrors: number, endpoints: Array<{ endpoint: string, count: number, lastError: string, lastTimestamp: string }> }}
 */
export function getErrorSummary() {
  // Aggregate by endpoint across all hour slots
  /** @type {Map<string, { count: number, lastError: string, lastTimestamp: string }>} */
  const aggregated = new Map();
  let totalErrors = 0;

  for (const [, entry] of counters) {
    totalErrors += entry.count;
    const existing = aggregated.get(entry.endpoint);
    if (existing) {
      existing.count += entry.count;
      // Keep the most recent error
      if (entry.lastTimestamp > existing.lastTimestamp) {
        existing.lastError = entry.lastError;
        existing.lastTimestamp = entry.lastTimestamp;
      }
    } else {
      aggregated.set(entry.endpoint, {
        endpoint: entry.endpoint,
        count: entry.count,
        lastError: entry.lastError,
        lastTimestamp: entry.lastTimestamp,
      });
    }
  }

  // Sort by count descending
  const endpoints = Array.from(aggregated.values())
    .sort((a, b) => b.count - a.count);

  return { totalErrors, endpoints };
}

/**
 * Remove entries older than 24 hours.
 */
export function cleanup() {
  const now = new Date();
  const cutoffHour = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 13);

  for (const [key, entry] of counters) {
    if (entry.hourKey < cutoffHour) {
      counters.delete(key);
    }
  }
}

/**
 * Clear all counters (for testing).
 */
export function clear() {
  counters.clear();
}

// ── Cleanup Timer (hourly, unref'd) ─────────────────────────
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();
```

---

## `server/services/eventBus.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/eventBus.js — EventBus Singleton
// ═══════════════════════════════════════════════════════════════

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this._listeners.delete(event);
    }
  }

  /**
   * Emit an event
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }


  /**
   * Remove all listeners (useful for testing)
   */
  clear() {
    this._listeners.clear();
  }

}

// Singleton
export const eventBus = new EventBus();
```

---

## `server/services/eventReplayBuffer.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/eventReplayBuffer.js — SSE Event Replay Buffer
// ═══════════════════════════════════════════════════════════════
// In-memory ring buffer per user. Stores last N events with TTL.
// On reconnect with last-event-id, replays missed events.
// Memory estimate: 100 events × ~500 bytes × N users ≈ 50KB per user.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/** @type {Map<string, Array<{ id: string, event: string, data: *, timestamp: number }>>} */
const buffers = new Map();

/**
 * Check if replay buffer is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return !!(config.SSE_REPLAY && config.SSE_REPLAY.enabled);
}

/**
 * Add an event to the user's replay buffer.
 * Evicts oldest if over maxEventsPerUser.
 * No-op if disabled or eventId is falsy.
 *
 * @param {string} userId
 * @param {string} eventId — unique event identifier (e.g. ntf_xxx)
 * @param {string} eventType — SSE event name (e.g. 'notification')
 * @param {*} data — JSON-serializable payload
 */
export function addEvent(userId, eventId, eventType, data) {
  if (!isEnabled()) return;
  if (!userId || !eventId) return;

  if (!buffers.has(userId)) {
    buffers.set(userId, []);
  }

  const buffer = buffers.get(userId);
  const maxEvents = config.SSE_REPLAY.maxEventsPerUser;

  buffer.push({
    id: eventId,
    event: eventType,
    data,
    timestamp: Date.now(),
  });

  // Evict oldest if over limit
  while (buffer.length > maxEvents) {
    buffer.shift();
  }
}

/**
 * Get events after the given lastEventId for a user.
 * Returns empty array if:
 *   - disabled
 *   - lastEventId is null/undefined (fresh connection — no replay)
 *   - lastEventId not found in buffer (too old or unknown)
 *   - no buffered events
 *
 * @param {string} userId
 * @param {string|null} lastEventId
 * @returns {Array<{ id: string, event: string, data: * }>}
 */
export function getEventsSince(userId, lastEventId) {
  if (!isEnabled()) return [];
  if (!userId || !lastEventId) return [];

  const buffer = buffers.get(userId);
  if (!buffer || buffer.length === 0) return [];

  // Find the index of lastEventId
  const idx = buffer.findIndex(e => e.id === lastEventId);
  if (idx === -1) return []; // ID not found — too old or unknown

  // Return events AFTER the found index
  return buffer.slice(idx + 1).map(e => ({
    id: e.id,
    event: e.event,
    data: e.data,
  }));
}

/**
 * Remove events older than maxEventAgeMs.
 * Remove users with empty buffers.
 */
export function cleanup() {
  if (!isEnabled()) return;

  const maxAge = config.SSE_REPLAY.maxEventAgeMs;
  const cutoff = Date.now() - maxAge;

  for (const [userId, buffer] of buffers) {
    // Remove old events from the beginning (they're in chronological order)
    while (buffer.length > 0 && buffer[0].timestamp < cutoff) {
      buffer.shift();
    }
    // Remove user entry if buffer is empty
    if (buffer.length === 0) {
      buffers.delete(userId);
    }
  }
}

/**
 * Get buffer statistics.
 * @returns {{ totalUsers: number, totalEvents: number }}
 */
export function getStats() {
  let totalEvents = 0;
  for (const [, buffer] of buffers) {
    totalEvents += buffer.length;
  }
  return { totalUsers: buffers.size, totalEvents };
}

/**
 * Clear all buffers (for testing).
 */
export function clear() {
  buffers.clear();
}

// ── Cleanup Timer (unref'd — doesn't prevent process exit) ───
const cleanupIntervalMs = (config.SSE_REPLAY && config.SSE_REPLAY.cleanupIntervalMs) || 600000;
if (isEnabled()) {
  const cleanupTimer = setInterval(cleanup, cleanupIntervalMs);
  if (cleanupTimer.unref) cleanupTimer.unref();
}
```

---

## `server/services/favorites.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/favorites.js — Employer Favorite Workers System
// ═══════════════════════════════════════════════════════════════
// CRUD for employer → worker favorites with secondary index.
// Enriched with worker public profile on list.
// Employer-only feature (enforced at handler level).
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, deleteJSON, getRecordPath,
  getCollectionPath, listJSON,
  addToSetIndex, getFromSetIndex, removeFromSetIndex,
} from './database.js';
import { logger } from './logger.js';

const USER_FAVORITES_INDEX = config.DATABASE.indexFiles.userFavoritesIndex;

/**
 * Generate favorite record ID
 */
function generateId() {
  return 'fav_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Add a worker to employer's favorites
 * @param {string} userId — employer ID
 * @param {string} favoriteUserId — worker ID to favorite
 * @param {string} [note] — optional note
 * @returns {Promise<{ ok: boolean, favorite?: object, error?: string, code?: string }>}
 */
export async function addFavorite(userId, favoriteUserId, note) {
  // 1. Feature flag
  if (!config.FAVORITES || !config.FAVORITES.enabled) {
    return { ok: false, error: 'خدمة المفضّلة غير مفعّلة', code: 'FAVORITES_DISABLED' };
  }

  // 2. Validate favoriteUserId
  if (!favoriteUserId || typeof favoriteUserId !== 'string') {
    return { ok: false, error: 'معرّف المستخدم المطلوب مطلوب', code: 'FAVORITE_USER_REQUIRED' };
  }

  // 3. Cannot favorite self
  if (userId === favoriteUserId) {
    return { ok: false, error: 'لا يمكنك إضافة نفسك للمفضّلة', code: 'CANNOT_FAVORITE_SELF' };
  }

  // 4. Target user exists
  const { findById } = await import('./users.js');
  const targetUser = await findById(favoriteUserId);
  if (!targetUser) {
    return { ok: false, error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' };
  }

  // 5. Check duplicate
  const existingIds = await getFromSetIndex(USER_FAVORITES_INDEX, userId);
  for (const favId of existingIds) {
    const existing = await readJSON(getRecordPath('favorites', favId));
    if (existing && existing.favoriteUserId === favoriteUserId) {
      return { ok: false, error: 'هذا المستخدم موجود في المفضّلة بالفعل', code: 'ALREADY_FAVORITE' };
    }
  }

  // 6. Max limit
  if (existingIds.length >= config.FAVORITES.maxPerUser) {
    return { ok: false, error: `وصلت للحد الأقصى (${config.FAVORITES.maxPerUser} مفضّلة)`, code: 'MAX_FAVORITES_REACHED' };
  }

  // 7. Create record
  const id = generateId();
  const now = new Date().toISOString();

  const favorite = {
    id,
    userId,
    favoriteUserId,
    note: (note && typeof note === 'string') ? note.trim().substring(0, 200) : null,
    createdAt: now,
  };

  const favPath = getRecordPath('favorites', id);
  await atomicWrite(favPath, favorite);

  // Update index
  await addToSetIndex(USER_FAVORITES_INDEX, userId, id);

  logger.info('Favorite added', { favoriteId: id, userId, favoriteUserId });

  return { ok: true, favorite };
}

/**
 * Remove a favorite
 * @param {string} favoriteId
 * @param {string} userId — ownership check
 * @returns {Promise<{ ok: boolean, error?: string, code?: string }>}
 */
export async function removeFavorite(favoriteId, userId) {
  const favPath = getRecordPath('favorites', favoriteId);
  const favorite = await readJSON(favPath);

  if (!favorite) {
    return { ok: false, error: 'المفضّلة غير موجودة', code: 'FAVORITE_NOT_FOUND' };
  }

  if (favorite.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تحذف هذه المفضّلة', code: 'NOT_FAVORITE_OWNER' };
  }

  await deleteJSON(favPath);
  await removeFromSetIndex(USER_FAVORITES_INDEX, userId, favoriteId);

  logger.info('Favorite removed', { favoriteId, userId });

  return { ok: true };
}

/**
 * List favorites for a user (enriched with target user profile)
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listFavorites(userId) {
  const indexedIds = await getFromSetIndex(USER_FAVORITES_INDEX, userId);

  let favorites = [];

  if (indexedIds.length > 0) {
    for (const favId of indexedIds) {
      const fav = await readJSON(getRecordPath('favorites', favId));
      if (fav) favorites.push(fav);
    }
  } else {
    // Fallback: full scan
    const favsDir = getCollectionPath('favorites');
    const all = await listJSON(favsDir);
    favorites = all.filter(f => f.id && f.id.startsWith('fav_') && f.userId === userId);
  }

  // Sort newest first
  favorites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Enrich with target user public profile
  const { findById } = await import('./users.js');
  const enriched = [];

  for (const fav of favorites) {
    let targetProfile = null;
    try {
      const user = await findById(fav.favoriteUserId);
      if (user) {
        targetProfile = {
          id: user.id,
          name: user.name || 'بدون اسم',
          governorate: user.governorate || '',
          categories: user.categories || [],
          rating: user.rating || { avg: 0, count: 0 },
          verificationStatus: user.verificationStatus || 'unverified',
        };
      }
    } catch (_) {
      // Non-blocking — missing user → null profile
    }

    enriched.push({
      ...fav,
      targetProfile: targetProfile || {
        id: fav.favoriteUserId,
        name: 'مستخدم محذوف',
        governorate: '',
        categories: [],
        rating: { avg: 0, count: 0 },
        verificationStatus: 'unverified',
      },
    });
  }

  return enriched;
}

/**
 * Check if a user is in the employer's favorites
 * @param {string} userId — employer ID
 * @param {string} favoriteUserId — target user ID
 * @returns {Promise<boolean>}
 */
export async function isFavorite(userId, favoriteUserId) {
  const indexedIds = await getFromSetIndex(USER_FAVORITES_INDEX, userId);

  for (const favId of indexedIds) {
    const fav = await readJSON(getRecordPath('favorites', favId));
    if (fav && fav.favoriteUserId === favoriteUserId) return true;
  }

  return false;
}
```

---

## `server/services/financialExport.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/financialExport.js — CSV Export + Receipt
// ═══════════════════════════════════════════════════════════════
// UTF-8 BOM CSV for Arabic Excel compatibility.
// Receipt generation with sequential numbering.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

const BOM = '\uFEFF';
const MAX_ROWS = (config.ANALYTICS && config.ANALYTICS.maxExportRows) || 10000;
const RECEIPT_PREFIX = (config.ANALYTICS && config.ANALYTICS.receiptPrefix) || 'RCT';

// ── CSV Helpers ──────────────────────────────────────────────

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str.replace(/"/g, '""');
}

function csvRow(fields) {
  return fields.map(f => `"${csvEscape(f)}"`).join(',');
}

function toDateStr(isoString) {
  if (!isoString) return '';
  return isoString.split('T')[0];
}

function toEgyptDateStr() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const d = new Date(egyptMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ── Receipt Generation ───────────────────────────────────────

/**
 * Generate a receipt for a payment
 * @param {string} paymentId
 * @returns {Promise<object|null>}
 */
export async function generateReceipt(paymentId) {
  try {
    const { findById: findPayment } = await import('./payments.js');
    const payment = await findPayment(paymentId);
    if (!payment) return null;

    const { findById: findJob } = await import('./jobs.js');
    const job = await findJob(payment.jobId);
    if (!job) return null;

    const { findById: findUser } = await import('./users.js');
    const employer = await findUser(payment.employerId);

    const { listByJob: listApps } = await import('./applications.js');
    const apps = await listApps(payment.jobId);
    const acceptedApps = apps.filter(a => a.status === 'accepted');

    // Load worker details
    const workers = [];
    for (const app of acceptedApps) {
      const worker = await findUser(app.workerId);
      workers.push({
        name: (worker && worker.name) || 'بدون اسم',
        workerId: app.workerId,
      });
    }

    // Attendance summary
    let attendance = { totalDays: 0, attendedDays: 0, noShows: 0, attendanceRate: 0 };
    try {
      const { getJobSummary } = await import('./attendance.js');
      const summary = await getJobSummary(payment.jobId);
      attendance.totalDays = summary.totalDays || 0;
      attendance.attendedDays = summary.checkedInCount || 0;
      attendance.noShows = summary.noShowCount || 0;
      if (summary.totalRecords > 0) {
        attendance.attendanceRate = Math.round((summary.checkedInCount / summary.totalRecords) * 100);
      }
    } catch (_) { /* non-fatal */ }

    // Receipt number: RCT-YYYYMMDD-NNN
    const dateStr = toEgyptDateStr();
    let seq = 1;
    try {
      const { readdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      // Count doesn't need a dedicated storage — we generate on-demand
      // Use a simple timestamp-based approach for sequential numbering
      seq = Math.floor(Date.now() % 1000) + 1; // Simple fallback
    } catch (_) { /* non-fatal */ }
    const receiptNumber = `${RECEIPT_PREFIX}-${dateStr}-${String(seq).padStart(3, '0')}`;

    const subtotal = payment.amount || 0;
    const platformFee = payment.platformFee || 0;
    const grandTotal = subtotal;
    const feePercent = config.FINANCIALS.platformFeePercent;

    return {
      receiptNumber,
      date: new Date().toISOString(),
      employer: {
        name: (employer && employer.name) || 'بدون اسم',
        phone: (employer && employer.phone) || '',
      },
      job: {
        title: job.title,
        category: job.category,
        governorate: job.governorate,
        startDate: job.startDate,
        durationDays: job.durationDays,
      },
      workers: workers.map(w => ({
        name: w.name,
        dailyWage: job.dailyWage,
        daysWorked: job.durationDays,
        total: job.dailyWage * job.durationDays,
      })),
      subtotal,
      platformFee,
      feePercent,
      grandTotal,
      workerPayout: payment.workerPayout || 0,
      paymentMethod: payment.method || 'cash',
      paymentStatus: payment.status || 'pending',
      attendance,
      attendanceBreakdown: payment.attendanceBreakdown || null,
    };
  } catch (err) {
    logger.warn('generateReceipt error', { paymentId, error: err.message });
    return null;
  }
}

// ── CSV Exports ──────────────────────────────────────────────

/**
 * Export payments as CSV
 * @param {{ employerId?: string, from?: string, to?: string, status?: string }} filters
 * @returns {Promise<{ csv: string, count: number, filename: string }>}
 */
export async function exportPaymentsCSV(filters = {}) {
  const { listAll: listAllPayments } = await import('./payments.js');
  const { findById: findJob } = await import('./jobs.js');
  const { findById: findUser } = await import('./users.js');

  let payments = await listAllPayments();

  // Apply filters
  if (filters.employerId) {
    payments = payments.filter(p => p.employerId === filters.employerId);
  }
  if (filters.status) {
    payments = payments.filter(p => p.status === filters.status);
  }
  if (filters.from) {
    payments = payments.filter(p => toDateStr(p.createdAt) >= filters.from);
  }
  if (filters.to) {
    payments = payments.filter(p => toDateStr(p.createdAt) <= filters.to);
  }

  // Sort newest first
  payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Limit
  payments = payments.slice(0, MAX_ROWS);

  const statusLabels = {
    pending: 'في الانتظار',
    employer_confirmed: 'تم التأكيد',
    completed: 'مكتمل',
    disputed: 'نزاع',
  };

  const headers = csvRow(['المعرّف', 'الفرصة', 'صاحب العمل', 'المبلغ', 'عمولة المنصة', 'صافي العمال', 'طريقة الدفع', 'الحالة', 'تاريخ الإنشاء']);
  const rows = [headers];

  for (const pay of payments) {
    let jobTitle = '';
    let employerName = '';
    try {
      const job = await findJob(pay.jobId);
      if (job) jobTitle = job.title;
    } catch (_) {}
    try {
      const emp = await findUser(pay.employerId);
      if (emp) employerName = emp.name || emp.phone;
    } catch (_) {}

    rows.push(csvRow([
      pay.id,
      jobTitle,
      employerName,
      pay.amount || 0,
      pay.platformFee || 0,
      pay.workerPayout || 0,
      pay.method || 'cash',
      statusLabels[pay.status] || pay.status,
      toDateStr(pay.createdAt),
    ]));
  }

  const csv = BOM + rows.join('\n');
  const filename = `yawmia-payments-${toDateStr(new Date().toISOString())}.csv`;

  return { csv, count: payments.length, filename };
}

/**
 * Export jobs as CSV
 * @param {{ employerId?: string, from?: string, to?: string, status?: string, governorate?: string, category?: string }} filters
 * @returns {Promise<{ csv: string, count: number, filename: string }>}
 */
export async function exportJobsCSV(filters = {}) {
  const { listAll: listAllJobs } = await import('./jobs.js');
  let jobs = await listAllJobs();

  if (filters.employerId) jobs = jobs.filter(j => j.employerId === filters.employerId);
  if (filters.status) jobs = jobs.filter(j => j.status === filters.status);
  if (filters.governorate) jobs = jobs.filter(j => j.governorate === filters.governorate);
  if (filters.category) jobs = jobs.filter(j => j.category === filters.category);
  if (filters.from) jobs = jobs.filter(j => toDateStr(j.createdAt) >= filters.from);
  if (filters.to) jobs = jobs.filter(j => toDateStr(j.createdAt) <= filters.to);

  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  jobs = jobs.slice(0, MAX_ROWS);

  const statusLabels = {
    open: 'متاحة', filled: 'مكتملة العدد', in_progress: 'جاري التنفيذ',
    completed: 'مكتملة', expired: 'منتهية', cancelled: 'ملغية',
  };

  const headers = csvRow(['المعرّف', 'العنوان', 'التخصص', 'المحافظة', 'اليومية', 'عدد العمال', 'المدة', 'الحالة', 'تاريخ الإنشاء']);
  const rows = [headers];

  for (const j of jobs) {
    rows.push(csvRow([
      j.id, j.title, j.category, j.governorate,
      j.dailyWage || 0, j.workersNeeded || 0, j.durationDays || 0,
      statusLabels[j.status] || j.status, toDateStr(j.createdAt),
    ]));
  }

  const csv = BOM + rows.join('\n');
  const filename = `yawmia-jobs-${toDateStr(new Date().toISOString())}.csv`;
  return { csv, count: jobs.length, filename };
}

/**
 * Export users as CSV (admin only)
 * @param {{ role?: string, status?: string, governorate?: string, from?: string, to?: string }} filters
 * @returns {Promise<{ csv: string, count: number, filename: string }>}
 */
export async function exportUsersCSV(filters = {}) {
  const { listAll: listAllUsers } = await import('./users.js');
  let users = await listAllUsers();

  if (filters.role) users = users.filter(u => u.role === filters.role);
  if (filters.status) users = users.filter(u => u.status === filters.status);
  if (filters.governorate) users = users.filter(u => u.governorate === filters.governorate);
  if (filters.from) users = users.filter(u => toDateStr(u.createdAt) >= filters.from);
  if (filters.to) users = users.filter(u => toDateStr(u.createdAt) <= filters.to);

  users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  users = users.slice(0, MAX_ROWS);

  const roleLabels = { worker: 'عامل', employer: 'صاحب عمل', admin: 'أدمن' };
  const statusLabels = { active: 'نشط', banned: 'محظور', deleted: 'محذوف' };

  const headers = csvRow(['المعرّف', 'الاسم', 'الموبايل', 'النوع', 'المحافظة', 'الحالة', 'التقييم', 'تاريخ التسجيل']);
  const rows = [headers];

  for (const u of users) {
    const ratingStr = u.rating ? `${u.rating.avg} (${u.rating.count})` : '0';
    rows.push(csvRow([
      u.id, u.name || '', u.phone || '', roleLabels[u.role] || u.role,
      u.governorate || '', statusLabels[u.status] || u.status,
      ratingStr, toDateStr(u.createdAt),
    ]));
  }

  const csv = BOM + rows.join('\n');
  const filename = `yawmia-users-${toDateStr(new Date().toISOString())}.csv`;
  return { csv, count: users.length, filename };
}
```

---

## `server/services/geo.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/geo.js — Geolocation Utilities
// Pure math — no external APIs, no database access
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const EARTH_RADIUS_KM = config.GEOLOCATION.earthRadiusKm;
const GOVERNORATE_CENTERS = config.GEOLOCATION.governorateCenters;

/**
 * Convert degrees to radians
 * @param {number} deg
 * @returns {number}
 */
function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate great-circle distance between two lat/lng points using Haversine formula
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in km, rounded to 1 decimal place
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;
  return Math.round(distance * 10) / 10;
}

/**
 * Check if lat/lng are valid numbers in general range
 * @param {*} lat
 * @param {*} lng
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Resolve coordinates from explicit lat/lng or governorate center fallback
 * @param {{ lat?: number, lng?: number, governorate?: string }} location
 * @returns {{ lat: number, lng: number } | null}
 */
export function resolveCoordinates(location) {
  if (!location) return null;

  // Try explicit lat/lng first
  if (typeof location.lat === 'number' && typeof location.lng === 'number' &&
      !isNaN(location.lat) && !isNaN(location.lng)) {
    return { lat: location.lat, lng: location.lng };
  }

  // Fallback to governorate center
  if (location.governorate && GOVERNORATE_CENTERS[location.governorate]) {
    const center = GOVERNORATE_CENTERS[location.governorate];
    return { lat: center.lat, lng: center.lng };
  }

  return null;
}

/**
 * Filter and sort items by proximity to a reference point
 * Each item should have { lat?, lng?, governorate? } fields
 * @param {Array} items - array of objects with location data
 * @param {number} refLat - reference latitude
 * @param {number} refLng - reference longitude
 * @param {number} radiusKm - maximum distance in km
 * @returns {Array<{ item: object, distance: number }>} sorted by distance (nearest first)
 */
export function filterByProximity(items, refLat, refLng, radiusKm) {
  const results = [];

  for (const item of items) {
    const coords = resolveCoordinates({
      lat: item.lat,
      lng: item.lng,
      governorate: item.governorate,
    });

    if (!coords) continue; // Skip items with no resolvable location

    const distance = haversineDistance(refLat, refLng, coords.lat, coords.lng);

    if (distance <= radiusKm) {
      results.push({ item, distance });
    }
  }

  // Sort by distance (nearest first)
  results.sort((a, b) => a.distance - b.distance);

  return results;
}

/**
 * Get Egypt timezone offset in milliseconds
 * Egypt abolished DST in 2014 — always UTC+2
 * @returns {number} 7200000 (2 hours in ms)
 */
export function getEgyptTimezoneOffsetMs() {
  return 2 * 60 * 60 * 1000; // 7200000
}

/**
 * Get today's midnight in Egypt timezone (UTC+2) as a UTC Date
 * Egypt abolished DST in 2014 — always UTC+2, no edge cases
 *
 * Example: if now is 2026-04-17 15:00 UTC → Egypt is 17:00
 *   → Egypt midnight was 2026-04-17 00:00 EGY = 2026-04-16 22:00 UTC
 *   → Returns Date('2026-04-16T22:00:00.000Z')
 *
 * @returns {Date}
 */
export function getEgyptMidnight() {
  const now = new Date();
  const offsetMs = getEgyptTimezoneOffsetMs();

  // Get current time in Egypt
  const egyptTime = new Date(now.getTime() + offsetMs);

  // Get midnight in Egypt (set H/M/S/MS to 0 in Egypt time)
  const egyptMidnight = new Date(Date.UTC(
    egyptTime.getUTCFullYear(),
    egyptTime.getUTCMonth(),
    egyptTime.getUTCDate(),
    0, 0, 0, 0
  ));

  // Convert back to UTC by subtracting the offset
  return new Date(egyptMidnight.getTime() - offsetMs);
}
```

---

## `server/services/indexHealth.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/indexHealth.js — Index Integrity Monitor
// ═══════════════════════════════════════════════════════════════
// Sample-based health check: picks random records and verifies
// their presence in the corresponding secondary index.
// Warning-only — no auto-repair. Use repair-indexes.js for fixes.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

const SAMPLE_SIZE = 10;

/** Cached health status */
let cachedStatus = {
  lastCheck: null,
  status: 'unknown',
  warnings: 0,
  details: [],
};

/**
 * Pick random elements from an array (Fisher-Yates partial shuffle).
 * @param {Array} arr
 * @param {number} count
 * @returns {Array}
 */
function pickRandom(arr, count) {
  if (!arr || arr.length === 0) return [];
  const n = Math.min(count, arr.length);
  const copy = arr.slice();
  for (let i = copy.length - 1; i > copy.length - 1 - n && i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(copy.length - n);
}

/**
 * Run sample-based index integrity check.
 * Checks:
 *   1. phone-index — sample users → verify phone→userId mapping
 *   2. job-apps-index — sample applications → verify jobId→appId presence
 *
 * @returns {Promise<{ status: string, warnings: string[], checkedAt: string }>}
 */
export async function checkIndexHealth() {
  const warnings = [];
  const checkedAt = new Date().toISOString();

  try {
    const { readJSON, getRecordPath, getCollectionPath, listJSON, readSetIndex } = await import('./database.js');
    const { join } = await import('node:path');
    const basePath = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

    // ── Check 1: phone-index ──────────────────────────────────
    try {
      const usersDir = getCollectionPath('users');
      const allUsers = await listJSON(usersDir);
      const users = allUsers.filter(u => u.id && u.id.startsWith('usr_') && u.phone);

      if (users.length > 0) {
        const sample = pickRandom(users, SAMPLE_SIZE);
        const phoneIndexPath = join(basePath, config.DATABASE.indexFiles.phoneIndex);
        const phoneIndex = await readJSON(phoneIndexPath) || {};

        for (const user of sample) {
          const indexedId = phoneIndex[user.phone];
          if (indexedId !== user.id) {
            warnings.push(`phone-index: phone ${user.phone} maps to ${indexedId || 'MISSING'}, expected ${user.id}`);
          }
        }
      }
    } catch (err) {
      warnings.push(`phone-index check failed: ${err.message}`);
    }

    // ── Check 2: job-apps-index ───────────────────────────────
    try {
      const appsDir = getCollectionPath('applications');
      const allApps = await listJSON(appsDir);
      const apps = allApps.filter(a => a.id && a.id.startsWith('app_') && a.jobId);

      if (apps.length > 0) {
        const sample = pickRandom(apps, SAMPLE_SIZE);
        const jobAppsIndex = await readSetIndex(config.DATABASE.indexFiles.jobAppsIndex);

        for (const app of sample) {
          const indexed = jobAppsIndex[app.jobId] || [];
          if (!indexed.includes(app.id)) {
            warnings.push(`job-apps-index: app ${app.id} not found under job ${app.jobId}`);
          }
        }
      }
    } catch (err) {
      warnings.push(`job-apps-index check failed: ${err.message}`);
    }

  } catch (err) {
    warnings.push(`Index health check error: ${err.message}`);
  }

  const status = warnings.length === 0 ? 'healthy' : 'warnings';

  // Update cached status
  cachedStatus = {
    lastCheck: checkedAt,
    status,
    warnings: warnings.length,
    details: warnings,
  };

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Index health check: warnings detected', {
      count: warnings.length,
      warnings: warnings.slice(0, 5), // Log first 5 only
    });
  }

  return { status, warnings, checkedAt };
}

/**
 * Get cached index health status (sync — for health endpoint).
 * @returns {{ lastCheck: string|null, status: string, warnings: number }}
 */
export function getHealthStatus() {
  return {
    lastCheck: cachedStatus.lastCheck,
    status: cachedStatus.status,
    warnings: cachedStatus.warnings,
  };
}
```

---

## `server/services/jobAlerts.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/jobAlerts.js — Job Alert Subscription System
// ═══════════════════════════════════════════════════════════════
// CRUD for user-defined job alerts with criteria-based matching.
// Listens to 'job:created' events and notifies matching users.
// Fire-and-forget — NEVER blocks job creation flow.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, deleteJSON, getRecordPath,
  getCollectionPath, listJSON,
  addToSetIndex, getFromSetIndex, removeFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const USER_ALERTS_INDEX = config.DATABASE.indexFiles.userAlertsIndex;

/**
 * Generate alert record ID
 */
function generateId() {
  return 'alt_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Create a new job alert
 * @param {string} userId
 * @param {{ name: string, criteria: { categories: string[], governorate?: string, minWage?: number, maxWage?: number } }} fields
 * @returns {Promise<{ ok: boolean, alert?: object, error?: string, code?: string }>}
 */
export async function createAlert(userId, fields) {
  // 1. Feature flag
  if (!config.JOB_ALERTS || !config.JOB_ALERTS.enabled) {
    return { ok: false, error: 'تنبيهات الفرص غير مفعّلة حالياً', code: 'ALERTS_DISABLED' };
  }

  const { name, criteria } = fields || {};

  // 2. Validate name
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return { ok: false, error: 'اسم التنبيه مطلوب (حرفين على الأقل)', code: 'NAME_REQUIRED' };
  }

  // 3. Validate criteria object
  if (!criteria || typeof criteria !== 'object') {
    return { ok: false, error: 'معايير التنبيه مطلوبة', code: 'CRITERIA_REQUIRED' };
  }

  // 4. Validate categories (required, at least one)
  if (!criteria.categories || !Array.isArray(criteria.categories) || criteria.categories.length === 0) {
    return { ok: false, error: 'اختار تخصص واحد على الأقل', code: 'CATEGORIES_REQUIRED' };
  }

  // Validate each category ID
  const validCategoryIds = new Set(config.LABOR_CATEGORIES.map(c => c.id));
  for (const catId of criteria.categories) {
    if (!validCategoryIds.has(catId)) {
      return { ok: false, error: `التخصص "${catId}" غير موجود`, code: 'INVALID_CATEGORY' };
    }
  }

  // 5. Validate governorate (optional)
  if (criteria.governorate !== undefined && criteria.governorate !== null && criteria.governorate !== '') {
    const validGovIds = new Set(config.REGIONS.governorates.map(g => g.id));
    if (!validGovIds.has(criteria.governorate)) {
      return { ok: false, error: 'المحافظة غير موجودة', code: 'INVALID_GOVERNORATE' };
    }
  }

  // 6. Validate wage range (optional)
  if (criteria.minWage !== undefined && criteria.minWage !== null) {
    if (typeof criteria.minWage !== 'number' || isNaN(criteria.minWage) || criteria.minWage < 0) {
      return { ok: false, error: 'الحد الأدنى للأجر لازم يكون رقم صحيح', code: 'INVALID_MIN_WAGE' };
    }
  }
  if (criteria.maxWage !== undefined && criteria.maxWage !== null) {
    if (typeof criteria.maxWage !== 'number' || isNaN(criteria.maxWage) || criteria.maxWage < 0) {
      return { ok: false, error: 'الحد الأقصى للأجر لازم يكون رقم صحيح', code: 'INVALID_MAX_WAGE' };
    }
  }
  if (criteria.minWage != null && criteria.maxWage != null && criteria.minWage > criteria.maxWage) {
    return { ok: false, error: 'الحد الأدنى للأجر لازم يكون أقل من أو يساوي الحد الأقصى', code: 'INVALID_WAGE_RANGE' };
  }

  // 7. Enforce max alerts per user
  const existingIds = await getFromSetIndex(USER_ALERTS_INDEX, userId);
  if (existingIds.length >= config.JOB_ALERTS.maxAlertsPerUser) {
    return { ok: false, error: `وصلت للحد الأقصى (${config.JOB_ALERTS.maxAlertsPerUser} تنبيهات)`, code: 'MAX_ALERTS_REACHED' };
  }

  // 8. Create alert record
  const id = generateId();
  const now = new Date().toISOString();

  const alert = {
    id,
    userId,
    name: name.trim(),
    criteria: {
      categories: criteria.categories,
      governorate: criteria.governorate || null,
      minWage: (criteria.minWage != null) ? criteria.minWage : null,
      maxWage: (criteria.maxWage != null) ? criteria.maxWage : null,
    },
    enabled: true,
    matchCount: 0,
    lastMatchedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const alertPath = getRecordPath('alerts', id);
  await atomicWrite(alertPath, alert);

  // Update user-alerts index
  await addToSetIndex(USER_ALERTS_INDEX, userId, id);

  logger.info('Job alert created', { alertId: id, userId });

  return { ok: true, alert };
}

/**
 * List alerts for a user (index-accelerated, newest first)
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listByUser(userId) {
  const indexedIds = await getFromSetIndex(USER_ALERTS_INDEX, userId);

  if (indexedIds.length > 0) {
    const results = [];
    for (const altId of indexedIds) {
      const alert = await readJSON(getRecordPath('alerts', altId));
      if (alert) results.push(alert);
    }
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results;
  }

  // Fallback: full scan
  const alertsDir = getCollectionPath('alerts');
  const all = await listJSON(alertsDir);
  return all
    .filter(a => a.id && a.id.startsWith('alt_') && a.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Delete an alert
 * @param {string} alertId
 * @param {string} userId — ownership check
 * @returns {Promise<{ ok: boolean, error?: string, code?: string }>}
 */
export async function deleteAlert(alertId, userId) {
  const alertPath = getRecordPath('alerts', alertId);
  const alert = await readJSON(alertPath);

  if (!alert) {
    return { ok: false, error: 'التنبيه غير موجود', code: 'ALERT_NOT_FOUND' };
  }

  if (alert.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تحذف هذا التنبيه', code: 'NOT_ALERT_OWNER' };
  }

  await deleteJSON(alertPath);
  await removeFromSetIndex(USER_ALERTS_INDEX, userId, alertId);

  logger.info('Job alert deleted', { alertId, userId });

  return { ok: true };
}

/**
 * Toggle alert enabled/disabled
 * @param {string} alertId
 * @param {string} userId — ownership check
 * @param {boolean} enabled
 * @returns {Promise<{ ok: boolean, alert?: object, error?: string, code?: string }>}
 */
export async function toggleAlert(alertId, userId, enabled) {
  const alertPath = getRecordPath('alerts', alertId);
  const alert = await readJSON(alertPath);

  if (!alert) {
    return { ok: false, error: 'التنبيه غير موجود', code: 'ALERT_NOT_FOUND' };
  }

  if (alert.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تعدّل هذا التنبيه', code: 'NOT_ALERT_OWNER' };
  }

  alert.enabled = !!enabled;
  alert.updatedAt = new Date().toISOString();

  await atomicWrite(alertPath, alert);

  return { ok: true, alert };
}

/**
 * Match a newly created job against all enabled alerts
 * Called by EventBus on 'job:created' — fire-and-forget
 * @param {object} job — full job object
 * @returns {Promise<number>} count of matched alerts
 */
export async function matchJobToAlerts(job) {
  if (!config.JOB_ALERTS || !config.JOB_ALERTS.enabled || !config.JOB_ALERTS.matchOnCreation) {
    return 0;
  }

  if (!job || !job.id || job.status !== 'open') return 0;

  // Full scan of all alerts (acceptable — alerts are few)
  const alertsDir = getCollectionPath('alerts');
  let allAlerts;
  try {
    allAlerts = await listJSON(alertsDir);
  } catch (_) {
    return 0;
  }

  const enabledAlerts = allAlerts.filter(a => a.id && a.id.startsWith('alt_') && a.enabled);

  if (enabledAlerts.length === 0) return 0;

  const cooldownMs = (config.JOB_ALERTS.cooldownMinutes || 60) * 60 * 1000;
  const now = Date.now();
  let matchCount = 0;

  for (const alert of enabledAlerts) {
    try {
      const criteria = alert.criteria;
      if (!criteria || !criteria.categories || !Array.isArray(criteria.categories)) continue;

      // Category match (required)
      if (!criteria.categories.includes(job.category)) continue;

      // Governorate match (optional — null means all governorates)
      if (criteria.governorate && criteria.governorate !== job.governorate) continue;

      // Wage range match (optional)
      if (criteria.minWage != null && (job.dailyWage || 0) < criteria.minWage) continue;
      if (criteria.maxWage != null && (job.dailyWage || 0) > criteria.maxWage) continue;

      // Cooldown check
      if (alert.lastMatchedAt) {
        const lastMatched = new Date(alert.lastMatchedAt).getTime();
        if (now - lastMatched < cooldownMs) continue;
      }

      // ── Match found — create notification ──
      const { createNotification } = await import('./notifications.js');
      const message = `🔔 فرصة مطابقة لتنبيه "${alert.name}": ${job.title} — ${job.dailyWage} جنيه/يوم`;

      await createNotification(
        alert.userId,
        'job_alert_match',
        message,
        { jobId: job.id, alertId: alert.id, alertName: alert.name }
      );

      // Update alert stats
      alert.matchCount = (alert.matchCount || 0) + 1;
      alert.lastMatchedAt = new Date().toISOString();
      alert.updatedAt = alert.lastMatchedAt;

      const alertPath = getRecordPath('alerts', alert.id);
      await atomicWrite(alertPath, alert);

      matchCount++;
    } catch (_) {
      // Fire-and-forget per alert — continue to next
    }
  }

  if (matchCount > 0) {
    logger.info('Job alerts matched', { jobId: job.id, matchCount });
  }

  return matchCount;
}

/**
 * Setup EventBus listener for job alert matching.
 * Registers 'job:created' listener if JOB_ALERTS.enabled is true.
 * Must be called after setupJobMatching().
 */
export function setupJobAlerts() {
  if (!config.JOB_ALERTS || !config.JOB_ALERTS.enabled) {
    logger.info('Job alerts: disabled via config');
    return;
  }

  eventBus.on('job:created', (data) => {
    if (!data || !data.jobId) return;
    // Fire-and-forget: load job and match against alerts
    import('./jobs.js').then(({ findById }) => {
      findById(data.jobId).then(job => {
        if (job) matchJobToAlerts(job).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  });

  logger.info('Job alerts: enabled');
}
```

---

## `server/services/jobMatcher.js`

```javascript
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

    // 8. Create notifications (fire-and-forget per worker)
    const { createNotification } = await import('./notifications.js');
    const message = `فرصة عمل جديدة قريبة منك: ${job.title} — ${job.dailyWage} جنيه/يوم`;

    let notified = 0;
    for (const match of toNotify) {
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

    if (notified > 0) {
      logger.info('Job matching: notified workers', {
        jobId,
        matched: matches.length,
        notified,
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
```

---

## `server/services/jobs.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/jobs.js — Job CRUD with filtering
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, safeReadJSON, getRecordPath, readIndex, writeIndex, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { eventBus } from './eventBus.js';
import { withLock } from './resourceLock.js';

const EMPLOYER_JOBS_INDEX = config.DATABASE.indexFiles.employerJobsIndex;

/**
 * Calculate fees
 */
export function calculateFees(workersNeeded, dailyWage, durationDays) {
  const totalCost = workersNeeded * dailyWage * durationDays;
  const platformFee = Math.round(totalCost * (config.FINANCIALS.platformFeePercent / 100));
  return { totalCost, platformFee };
}

/**
 * Create a new job
 */
export async function create(employerId, fields) {
  const id = 'job_' + crypto.randomBytes(6).toString('hex');
  const now = new Date();
  const urgency = fields.urgency || (config.URGENCY ? config.URGENCY.defaultLevel : 'normal');

  // Adaptive expiry based on urgency
  let expiryHours = config.JOBS.expiryHours; // default 72h (normal)
  if (config.URGENCY && config.URGENCY.enabled) {
    if (urgency === 'immediate') expiryHours = config.URGENCY.immediateExpiryHours;
    else if (urgency === 'urgent') expiryHours = config.URGENCY.urgentExpiryHours;
  }
  const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);

  // Immediate jobs: auto-calculate startDate + default durationDays
  let startDate = fields.startDate;
  let durationDays = fields.durationDays;
  if (urgency === 'immediate') {
    if (!startDate) {
      const egyptNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      startDate = egyptNow.toISOString().split('T')[0];
    }
    if (!durationDays || typeof durationDays !== 'number') {
      durationDays = 1;
    }
  }

  const { totalCost, platformFee } = calculateFees(fields.workersNeeded, fields.dailyWage, durationDays);

  const job = {
    id,
    employerId,
    title: fields.title.trim(),
    category: fields.category,
    governorate: fields.governorate,
    location: fields.location || null,
    lat: (typeof fields.lat === 'number') ? fields.lat : null,
    lng: (typeof fields.lng === 'number') ? fields.lng : null,
    workersNeeded: fields.workersNeeded,
    workersAccepted: 0,
    dailyWage: fields.dailyWage,
    startDate,
    durationDays,
    description: (fields.description || '').trim(),
    totalCost,
    platformFee,
    urgency,
    status: 'open',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Save job file
  const jobPath = getRecordPath('jobs', id);
  await atomicWrite(jobPath, job);

  // Update jobs index
  const jobsIndex = await readIndex('jobsIndex');
  jobsIndex[id] = {
    id,
    employerId,
    category: job.category,
    governorate: job.governorate,
    status: job.status,
    urgency: job.urgency || 'normal',
    createdAt: job.createdAt,
  };
  await writeIndex('jobsIndex', jobsIndex);

  // Update employer-jobs secondary index
  await addToSetIndex(EMPLOYER_JOBS_INDEX, employerId, id);

  eventBus.emit('job:created', { jobId: id, employerId });

  return job;
}

/**
 * Find job by ID (with lazy expiry enforcement)
 */
export async function findById(jobId) {
  const jobPath = getRecordPath('jobs', jobId);
  const job = await safeReadJSON(jobPath);
  if (!job) return null;
  return await checkExpiry(job);
}

/**
 * List jobs with filters
 * @param {{ governorate?: string, category?: string, status?: string }} filters
 */
export async function list(filters = {}) {
  const jobsDir = getCollectionPath('jobs');
  const allJobs = await listJSON(jobsDir);

  // Filter out index.json (not a job record)
  let jobs = allJobs.filter(item => item.id && item.id.startsWith('job_'));

  if (filters.governorate) {
    jobs = jobs.filter(j => j.governorate === filters.governorate);
  }
  if (filters.category) {
    jobs = jobs.filter(j => j.category === filters.category);
  }
  if (filters.urgency) {
    jobs = jobs.filter(j => (j.urgency || 'normal') === filters.urgency);
  }
  if (filters.status) {
    jobs = jobs.filter(j => j.status === filters.status);
  } else {
    // Default: only open jobs for public listing
    jobs = jobs.filter(j => j.status === 'open');
  }

  // Filter out jobs that should be expired but haven't been updated yet
  // Prevents showing stale open jobs between periodic enforcement runs
  if (!filters.status || filters.status === 'open') {
    const now = new Date();
    jobs = jobs.filter(j => {
      if (j.status === 'open' && j.expiresAt && new Date(j.expiresAt) < now) {
        // Trigger lazy expiry in background (fire-and-forget)
        checkExpiry(j).catch(() => {});
        return false;
      }
      return true;
    });
  }

  // ── Multi-category filter (comma-separated) ───────────────
  if (filters.categories) {
    const cats = filters.categories.split(',').map(c => c.trim()).filter(Boolean);
    if (cats.length > 0) {
      jobs = jobs.filter(j => cats.includes(j.category));
    }
  }

  // ── Wage range filter ─────────────────────────────────────
  if (filters.minWage !== undefined && !isNaN(Number(filters.minWage))) {
    jobs = jobs.filter(j => (j.dailyWage || 0) >= Number(filters.minWage));
  }
  if (filters.maxWage !== undefined && !isNaN(Number(filters.maxWage))) {
    jobs = jobs.filter(j => (j.dailyWage || 0) <= Number(filters.maxWage));
  }

  // ── Date range filter ─────────────────────────────────────
  if (filters.startDateFrom) {
    jobs = jobs.filter(j => j.startDate && j.startDate >= filters.startDateFrom);
  }
  if (filters.startDateTo) {
    jobs = jobs.filter(j => j.startDate && j.startDate <= filters.startDateTo);
  }

  // ── Proximity filter (Haversine) ──────────────────────────
  if (filters.lat !== undefined && filters.lng !== undefined) {
    const { filterByProximity } = await import('./geo.js');
    const refLat = Number(filters.lat);
    const refLng = Number(filters.lng);
    const radius = Number(filters.radius) || config.GEOLOCATION.defaultRadiusKm;

    if (!isNaN(refLat) && !isNaN(refLng) && config.GEOLOCATION.enabled) {
      const clampedRadius = Math.min(radius, config.GEOLOCATION.maxRadiusKm);
      const proximityResults = filterByProximity(jobs, refLat, refLng, clampedRadius);
      jobs = proximityResults.map(r => {
        r.item._distance = r.distance;
        return r.item;
      });
      // Proximity results are already sorted by distance — skip manual sort later
      filters._proximitySorted = true;
    }
  }

  // Text search on title + description (search index accelerated, Arabic-normalized)
  if (filters.search) {
    let searchHandled = false;
    if (config.SEARCH_INDEX && config.SEARCH_INDEX.enabled) {
      try {
        const { search: searchIndexQuery, getStats: getSearchStats } = await import('./searchIndex.js');
        const searchStats = getSearchStats();
        // Only use index if it has been built (size > 0)
        if (searchStats.size > 0) {
          const { normalizeArabic } = await import('./arabicNormalizer.js');
          const normalizedTerm = normalizeArabic(filters.search.toLowerCase());
          const matchedIds = searchIndexQuery(normalizedTerm, {
            status: filters.status || 'open',
            category: filters.category,
            governorate: filters.governorate,
          });
          jobs = jobs.filter(j => matchedIds.includes(j.id));
          searchHandled = true;
        }
      } catch (_) {
        // Fallback to full scan below
      }
    }
    if (!searchHandled) {
      const { normalizeArabic } = await import('./arabicNormalizer.js');
      const normalizedTerm = normalizeArabic(filters.search.toLowerCase());
      jobs = jobs.filter(j => {
        const title = normalizeArabic((j.title || '').toLowerCase());
        const desc = normalizeArabic((j.description || '').toLowerCase());
        return title.includes(normalizedTerm) || desc.includes(normalizedTerm);
      });
    }
  }

  // Sort (skip if already sorted by proximity)
  if (!filters._proximitySorted) {
    const sort = filters.sort || 'newest';
    const urgencyOrder = { immediate: 0, urgent: 1, normal: 2 };
    if (sort === 'wage_high') {
      jobs.sort((a, b) => (b.dailyWage || 0) - (a.dailyWage || 0));
    } else if (sort === 'wage_low') {
      jobs.sort((a, b) => (a.dailyWage || 0) - (b.dailyWage || 0));
    } else {
      // Default: urgency-first, then newest
      jobs.sort((a, b) => {
        const ua = urgencyOrder[a.urgency || 'normal'] ?? 2;
        const ub = urgencyOrder[b.urgency || 'normal'] ?? 2;
        if (ua !== ub) return ua - ub;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }
  }

  return jobs;
}

/**
 * Update job status
 */
export async function updateStatus(jobId, status) {
  const job = await findById(jobId);
  if (!job) return null;

  job.status = status;
  const jobPath = getRecordPath('jobs', jobId);
  await atomicWrite(jobPath, job);

  // Update index
  const jobsIndex = await readIndex('jobsIndex');
  if (jobsIndex[jobId]) {
    jobsIndex[jobId].status = status;
    await writeIndex('jobsIndex', jobsIndex);
  }

  return job;
}

/**
 * Increment accepted workers count
 */
export async function incrementAccepted(jobId) {
  const job = await findById(jobId);
  if (!job) return null;

  job.workersAccepted += 1;

  // Auto-fill if all workers accepted
  if (job.workersAccepted >= job.workersNeeded) {
    job.status = 'filled';
  }

  const jobPath = getRecordPath('jobs', jobId);
  await atomicWrite(jobPath, job);

  // Update index status if changed
  if (job.status === 'filled') {
    const jobsIndex = await readIndex('jobsIndex');
    if (jobsIndex[jobId]) {
      jobsIndex[jobId].status = 'filled';
      await writeIndex('jobsIndex', jobsIndex);
    }
  }

  return job;
}

/**
 * List all jobs (for admin)
 */
export async function listAll() {
  const jobsDir = getCollectionPath('jobs');
  const allJobs = await listJSON(jobsDir);
  return allJobs.filter(item => item.id && item.id.startsWith('job_'));
}

/**
 * Count jobs by status
 */
export async function countByStatus() {
  const jobs = await listAll();
  const counts = { open: 0, filled: 0, expired: 0, cancelled: 0, in_progress: 0, completed: 0, total: jobs.length };
  for (const job of jobs) {
    if (counts[job.status] !== undefined) counts[job.status]++;
  }
  return counts;
}

/**
 * Count jobs created by an employer today (index-accelerated with fallback)
 * @param {string} employerId
 * @returns {Promise<number>}
 */
export async function countTodayByEmployer(employerId) {
  let employerJobs;

  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(EMPLOYER_JOBS_INDEX, employerId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const jobId of indexedIds) {
      const job = await readJSON(getRecordPath('jobs', jobId));
      if (job) results.push(job);
    }
    employerJobs = results;
  } else {
    // Fallback: full scan
    const allJobs = await listAll();
    employerJobs = allJobs.filter(j => j.employerId === employerId);
  }

  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  return employerJobs.filter(j => new Date(j.createdAt) >= todayMidnight).length;
}

/**
 * Check if a job is expired and update its status if needed (lazy enforcement)
 * Also auto-rejects pending applications on the expired job
 */
export async function checkExpiry(job) {
  if (!job) return null;
  if (job.status === 'open' && job.expiresAt && new Date(job.expiresAt) < new Date()) {
    job.status = 'expired';
    const jobPath = getRecordPath('jobs', job.id);
    await atomicWrite(jobPath, job);

    // Update index
    const jobsIndex = await readIndex('jobsIndex');
    if (jobsIndex[job.id]) {
      jobsIndex[job.id].status = 'expired';
      await writeIndex('jobsIndex', jobsIndex);
    }

    // Auto-reject pending applications (fire-and-forget)
    rejectPendingApplications(job.id, job.title).catch(() => {});
  }
  return job;
}

/**
 * Auto-reject all pending applications for a job (used on expiry)
 * Fire-and-forget — errors don't break the parent flow
 * @param {string} jobId
 * @param {string} jobTitle
 */
async function rejectPendingApplications(jobId, jobTitle) {
  try {
    const { listByJob: listAppsByJob } = await import('./applications.js');
    const { createNotification } = await import('./notifications.js');
    const apps = await listAppsByJob(jobId);
    const now = new Date().toISOString();

    for (const app of apps) {
      if (app.status === 'pending') {
        app.status = 'rejected';
        app.respondedAt = now;
        const appPath = getRecordPath('applications', app.id);
        await atomicWrite(appPath, app);

        // Notify worker
        await createNotification(
          app.workerId,
          'application_rejected',
          `الفرصة "${jobTitle}" انتهت صلاحيتها — تم رفض طلبك تلقائياً`,
          { jobId, applicationId: app.id, reason: 'job_expired' }
        ).catch(() => {});
      }
    }
  } catch (_) {
    // Fire-and-forget — don't break expiry flow
  }
}

/**
 * Enforce expiry on all open jobs (startup + periodic)
 * Optimized: single index read/write instead of per-job
 * Uses batch processing with event loop yielding to avoid blocking
 * @returns {number} count of jobs that were expired
 */
export async function enforceExpiredJobs() {
  const jobsDir = getCollectionPath('jobs');
  let files;
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(jobsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp') && f.startsWith('job_'));
  let count = 0;
  const now = new Date();
  const expiredJobIds = [];
  const expiredJobTitles = {};
  const BATCH_SIZE = 100;

  for (let i = 0; i < jsonFiles.length; i++) {
    const job = await readJSON(getCollectionPath('jobs') + '/' + jsonFiles[i]);
    if (job && job.status === 'open' && job.expiresAt && new Date(job.expiresAt) < now) {
      job.status = 'expired';
      const jobPath = getRecordPath('jobs', job.id);
      await atomicWrite(jobPath, job);
      expiredJobIds.push(job.id);
      expiredJobTitles[job.id] = job.title;
      count++;
    }
    // Yield to event loop every BATCH_SIZE files
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  // Batch update jobs index — single read + single write
  if (expiredJobIds.length > 0) {
    const jobsIndex = await readIndex('jobsIndex');
    for (const jobId of expiredJobIds) {
      if (jobsIndex[jobId]) {
        jobsIndex[jobId].status = 'expired';
      }
    }
    await writeIndex('jobsIndex', jobsIndex);

    // Auto-reject pending applications for each expired job (fire-and-forget)
    for (const jobId of expiredJobIds) {
      rejectPendingApplications(jobId, expiredJobTitles[jobId]).catch(() => {});
    }
  }

  return count;
}

/**
 * Start a job (employer marks job as in_progress)
 * Requires: status === 'filled' && employer owns job
 */
export async function startJob(jobId, employerId) {
  const job = await findById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تبدأ هذه الفرصة', code: 'NOT_JOB_OWNER' };
  }
  if (job.status !== 'filled') {
    return { ok: false, error: 'الفرصة لازم تكون مكتملة العدد قبل البدء', code: 'INVALID_STATUS' };
  }

  job.status = 'in_progress';
  job.startedAt = new Date().toISOString();

  const jobPath = getRecordPath('jobs', jobId);
  await atomicWrite(jobPath, job);

  // Update index
  const jobsIndex = await readIndex('jobsIndex');
  if (jobsIndex[jobId]) {
    jobsIndex[jobId].status = 'in_progress';
    await writeIndex('jobsIndex', jobsIndex);
  }

  eventBus.emit('job:started', { jobId, employerId });

  return { ok: true, job };
}

/**
 * Complete a job (employer marks job as completed)
 * Requires: status === 'in_progress' && employer owns job
 */
export async function completeJob(jobId, employerId) {
  const job = await findById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تنهي هذه الفرصة', code: 'NOT_JOB_OWNER' };
  }
  if (job.status !== 'in_progress') {
    return { ok: false, error: 'الفرصة لازم تكون جاري تنفيذها', code: 'INVALID_STATUS' };
  }

  job.status = 'completed';
  job.completedAt = new Date().toISOString();

  const jobPath = getRecordPath('jobs', jobId);
  await atomicWrite(jobPath, job);

  // Update index
  const jobsIndex = await readIndex('jobsIndex');
  if (jobsIndex[jobId]) {
    jobsIndex[jobId].status = 'completed';
    await writeIndex('jobsIndex', jobsIndex);
  }

  eventBus.emit('job:completed', { jobId, employerId, jobTitle: job.title });

  // Auto-create payment record (fire-and-forget)
  try {
    const { createPayment } = await import('./payments.js');
    createPayment(jobId, employerId).catch(() => {});
  } catch (_) {
    // Fire-and-forget — don't break completion flow
  }

  return { ok: true, job };
}

/**
 * Cancel an open job (employer action)
 * Requires: status === 'open' && employer owns job
 */
export async function cancelJob(jobId, employerId) {
  const job = await findById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تلغي هذه الفرصة', code: 'NOT_JOB_OWNER' };
  }
  if (job.status !== 'open') {
    return { ok: false, error: 'لا يمكن إلغاء هذه الفرصة — الحالة الحالية: ' + job.status, code: 'INVALID_STATUS' };
  }

  job.status = 'cancelled';
  job.cancelledAt = new Date().toISOString();

  const jobPath = getRecordPath('jobs', jobId);
  await atomicWrite(jobPath, job);

  // Update index
  const jobsIndex = await readIndex('jobsIndex');
  if (jobsIndex[jobId]) {
    jobsIndex[jobId].status = 'cancelled';
    await writeIndex('jobsIndex', jobsIndex);
  }

  eventBus.emit('job:cancelled', { jobId, employerId, jobTitle: job.title });

  return { ok: true, job };
}

/**
 * Duplicate an existing job (employer action)
 * Copies content fields, resets lifecycle fields
 * @param {string} jobId — source job to duplicate
 * @param {string} employerId — must own the source job
 * @returns {Promise<{ ok: boolean, job?: object, error?: string, code?: string }>}
 */
export async function duplicateJob(jobId, employerId) {
  // 1. Source job exists
  const source = await findById(jobId);
  if (!source) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }

  // 2. Employer owns source job
  if (source.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تنسخ هذه الفرصة', code: 'NOT_JOB_OWNER' };
  }

  // 3. Daily limit check
  try {
    const todayCount = await countTodayByEmployer(employerId);
    if (todayCount >= config.LIMITS.maxJobsPerEmployerPerDay) {
      return { ok: false, error: 'وصلت للحد الأقصى لنشر الفرص اليوم', code: 'DAILY_JOB_LIMIT' };
    }
  } catch (_) {
    // Non-blocking: allow action if count check fails
  }

  // 4. Calculate startDate = tomorrow (Egypt timezone)
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const tomorrowMidnight = new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrowMidnight.toISOString().split('T')[0];

  // 5. Create new job with copied content fields
  const newJob = await create(employerId, {
    title: source.title,
    category: source.category,
    governorate: source.governorate,
    location: source.location || null,
    lat: source.lat,
    lng: source.lng,
    workersNeeded: source.workersNeeded,
    dailyWage: source.dailyWage,
    durationDays: source.durationDays,
    description: source.description || '',
    startDate: tomorrowStr,
  });

  return { ok: true, job: newJob };
}

/**
 * Renew an expired or cancelled job
 * Requires: employer owns job, status in allowedFromStatuses, under max renewals
 */
export function renewJob(jobId, employerId) {
  return withLock(`renew:${jobId}`, async () => {
  // 1. Feature flag check
  if (!config.JOB_RENEWAL || !config.JOB_RENEWAL.enabled) {
    return { ok: false, error: 'تجديد الفرص غير مفعّل حالياً', code: 'RENEWAL_DISABLED' };
  }

  // 2. Job exists
  const job = await findById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }

  // 3. Employer owns job
  if (job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تجدد هذه الفرصة', code: 'NOT_JOB_OWNER' };
  }

  // 4. Status check
  const allowedStatuses = config.JOB_RENEWAL.allowedFromStatuses;
  if (!allowedStatuses.includes(job.status)) {
    return { ok: false, error: 'لا يمكن تجديد فرصة بحالة: ' + job.status, code: 'INVALID_STATUS_FOR_RENEWAL' };
  }

  // 5. Max renewals check
  const currentRenewals = job.renewalCount || 0;
  if (currentRenewals >= config.JOB_RENEWAL.maxRenewalsPerJob) {
    return { ok: false, error: 'وصلت للحد الأقصى لتجديد هذه الفرصة', code: 'MAX_RENEWALS_REACHED' };
  }

  // 6. Daily limit check (non-blocking — same as create)
  try {
    const todayCount = await countTodayByEmployer(employerId);
    if (todayCount >= config.LIMITS.maxJobsPerEmployerPerDay) {
      return { ok: false, error: 'وصلت للحد الأقصى لنشر الفرص اليوم', code: 'DAILY_JOB_LIMIT' };
    }
  } catch (_) {
    // Non-blocking: allow action if count check fails
  }

  // ── Reset job ──
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.JOB_RENEWAL.renewalExpiryHours * 60 * 60 * 1000);

  job.status = 'open';
  job.expiresAt = expiresAt.toISOString();
  job.renewedAt = now.toISOString();
  job.renewalCount = currentRenewals + 1;

  const jobPath = getRecordPath('jobs', jobId);
  await atomicWrite(jobPath, job);

  // Update index
  const jobsIndex = await readIndex('jobsIndex');
  if (jobsIndex[jobId]) {
    jobsIndex[jobId].status = 'open';
    await writeIndex('jobsIndex', jobsIndex);
  }

  eventBus.emit('job:renewed', { jobId, employerId, jobTitle: job.title });

  return { ok: true, job };
  }); // end withLock
}

/**
 * Check for jobs about to expire and send warning notifications
 * Called in periodic cleanup (every 30 minutes)
 * Sends one-time warning 24 hours before expiry
 * Fire-and-forget per job — errors don't block others
 * @returns {Promise<number>} count of warnings sent
 */
export async function checkExpiryWarnings() {
  const jobsDir = getCollectionPath('jobs');
  let files;
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(jobsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp') && f.startsWith('job_'));
  const now = new Date();
  const warningWindowMs = 24 * 60 * 60 * 1000; // 24 hours
  let count = 0;

  for (const file of jsonFiles) {
    try {
      const job = await readJSON(getCollectionPath('jobs') + '/' + file);
      if (!job) continue;
      if (job.status !== 'open') continue;
      if (job.expiryWarningNotified) continue;
      if (!job.expiresAt) continue;

      const expiresAt = new Date(job.expiresAt);
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();

      // Only warn if expiry is within 24 hours AND not already expired
      if (timeUntilExpiry > 0 && timeUntilExpiry <= warningWindowMs) {
        // Set flag to prevent duplicate warnings
        job.expiryWarningNotified = true;
        const jobPath = getRecordPath('jobs', job.id);
        await atomicWrite(jobPath, job);

        // Get pending applicant IDs
        let pendingWorkerIds = [];
        try {
          const { listByJob: listAppsByJob } = await import('./applications.js');
          const apps = await listAppsByJob(job.id);
          pendingWorkerIds = apps
            .filter(a => a.status === 'pending')
            .map(a => a.workerId);
        } catch (_) { /* non-fatal */ }

        // Emit event for notification system
        eventBus.emit('job:expiry_warning', {
          jobId: job.id,
          employerId: job.employerId,
          jobTitle: job.title,
          pendingWorkerIds,
        });

        count++;
      }
    } catch (_) {
      // Fire-and-forget per job — continue to next
    }
  }

  return count;
}
```

---

## `server/services/logWriter.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/logWriter.js — Append-Only Log File Writer
// ═══════════════════════════════════════════════════════════════
// Daily rotation by Egypt timezone (UTC+2).
// Fire-and-forget — NEVER throws, NEVER imports logger.js.
// Writes to: {filePath}/yawmia-YYYY-MM-DD.log
// ═══════════════════════════════════════════════════════════════

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';

/** @type {boolean} */
let dirCreated = false;

/**
 * Get current date string in Egypt timezone (UTC+2) — YYYY-MM-DD
 * Egypt abolished DST in 2014 — always UTC+2
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
 * Get the log file path for today.
 * @returns {string}
 */
function getLogFilePath() {
  const logDir = (config.LOGGING && config.LOGGING.filePath) || './logs';
  const dateStr = getEgyptDateString();
  return join(logDir, `yawmia-${dateStr}.log`);
}

/**
 * Ensure log directory exists (once per process).
 */
async function ensureDir() {
  if (dirCreated) return;
  try {
    const logDir = (config.LOGGING && config.LOGGING.filePath) || './logs';
    await mkdir(logDir, { recursive: true });
    dirCreated = true;
  } catch (_) {
    // Directory creation failure — will retry next call
  }
}

/**
 * Append a message to today's log file.
 * Fire-and-forget — NEVER throws.
 * @param {string} message — pre-formatted log line (should include \n)
 */
export function append(message) {
  // Feature flag check
  if (!config.LOGGING || !config.LOGGING.fileEnabled) return;

  // Fire-and-forget async operation
  (async () => {
    try {
      await ensureDir();
      const filePath = getLogFilePath();
      await appendFile(filePath, message, 'utf-8');
    } catch (_) {
      // NEVER throw — log writer failure is non-fatal
      // Fallback: silent — console output still works via logger.js
    }
  })();
}
```

---

## `server/services/logger.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/logger.js — Structured Console Logger
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const configLevel = LEVELS[config.LOGGING.level] ?? LEVELS.info;

// Lazy logWriter singleton — avoids top-level await / circular deps
let _logWriter = null;
let _logWriterLoaded = false;
function writeToFile(formatted) {
  if (_logWriterLoaded) {
    if (_logWriter) _logWriter.append(formatted + '\n');
    return;
  }
  _logWriterLoaded = true;
  import('./logWriter.js').then(mod => {
    _logWriter = mod;
    _logWriter.append(formatted + '\n');
  }).catch(() => { _logWriter = null; });
}

function formatMessage(level, msg, data) {
  const timestamp = new Date().toISOString();
  // JSON output in production — parseable by log aggregation tools (ELK, CloudWatch, Datadog)
  if (config.ENV && config.ENV.isProduction) {
    const entry = { timestamp, level, msg };
    if (data && Object.keys(data).length > 0) Object.assign(entry, data);
    return JSON.stringify(entry);
  }
  // Development: human-readable format
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${msg} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${msg}`;
}

export const logger = {
  error(msg, data = {}) {
    if (configLevel >= LEVELS.error) {
      const formatted = formatMessage('error', msg, data);
      console.error(formatted);
      writeToFile(formatted);
    }
  },

  warn(msg, data = {}) {
    if (configLevel >= LEVELS.warn) {
      const formatted = formatMessage('warn', msg, data);
      console.warn(formatted);
      writeToFile(formatted);
    }
  },

  info(msg, data = {}) {
    if (configLevel >= LEVELS.info) {
      const formatted = formatMessage('info', msg, data);
      console.log(formatted);
      writeToFile(formatted);
    }
  },

  debug(msg, data = {}) {
    if (configLevel >= LEVELS.debug) {
      const formatted = formatMessage('debug', msg, data);
      console.log(formatted);
      writeToFile(formatted);
    }
  },

  /** Log HTTP request */
  request(req, statusCode, durationMs) {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this[level](`${req.method} ${req.pathname} ${statusCode}`, {
      requestId: req.id,
      duration: `${durationMs}ms`,
    });
  },
};
```

---

## `server/services/messages.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/messages.js — Job-Scoped In-App Messaging
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, getRecordPath, getCollectionPath,
  listJSON, addToSetIndex, getFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { sanitizeText } from './sanitizer.js';
import { logger } from './logger.js';

const MESSAGE_JOB_INDEX = config.DATABASE.indexFiles.messageJobIndex;
const MESSAGE_USER_INDEX = config.DATABASE.indexFiles.messageUserIndex;

/**
 * Check if a user can send/receive messages on a job
 * Rules:
 *   1. MESSAGES feature enabled
 *   2. Job exists
 *   3. Job status in ['filled', 'in_progress', 'completed']
 *   4. User is employer OR accepted worker on the job
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<{ allowed: boolean, error?: string, code?: string, job?: object }>}
 */
export async function canMessage(jobId, userId) {
  // 1. Feature flag
  if (!config.MESSAGES || !config.MESSAGES.enabled) {
    return { allowed: false, error: 'خدمة الرسائل غير مفعّلة', code: 'MESSAGES_DISABLED' };
  }

  // 2. Job exists
  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);
  if (!job) {
    return { allowed: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }

  // 3. Job status check
  const allowedStatuses = ['filled', 'in_progress', 'completed'];
  if (!allowedStatuses.includes(job.status)) {
    return { allowed: false, error: 'الرسائل غير متاحة في هذه المرحلة', code: 'JOB_STATUS_NOT_ELIGIBLE' };
  }

  // 4. User involvement check
  const isEmployer = job.employerId === userId;

  if (!isEmployer) {
    // Check if user is an accepted worker
    if (config.MESSAGES.onlyAfterAcceptance) {
      const { listByJob: listApps } = await import('./applications.js');
      const apps = await listApps(jobId);
      const accepted = apps.find(a => a.workerId === userId && a.status === 'accepted');
      if (!accepted) {
        return { allowed: false, error: 'أنت مش مشارك في هذه الفرصة', code: 'NOT_INVOLVED' };
      }
    }
  }

  return { allowed: true, job };
}

/**
 * Send a message from one user to another on a specific job
 *
 * @param {string} jobId
 * @param {string} senderId
 * @param {{ recipientId: string, text: string }} fields
 * @returns {Promise<{ ok: boolean, message?: object, error?: string, code?: string }>}
 */
export async function sendMessage(jobId, senderId, { recipientId, text }) {
  // 1. canMessage check for sender
  const senderCheck = await canMessage(jobId, senderId);
  if (!senderCheck.allowed) {
    return { ok: false, error: senderCheck.error, code: senderCheck.code };
  }
  const job = senderCheck.job;

  // 2. Validate text
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'نص الرسالة مطلوب', code: 'TEXT_REQUIRED' };
  }

  const sanitized = sanitizeText(text.trim());
  const maxLen = config.MESSAGES.maxLengthChars || 500;
  if (sanitized.length > maxLen) {
    return { ok: false, error: `الرسالة لا تتجاوز ${maxLen} حرف`, code: 'TEXT_TOO_LONG' };
  }

  // 2b. Content filter check
  if (config.CONTENT_FILTER && config.CONTENT_FILTER.enabled && config.CONTENT_FILTER.checkMessages) {
    try {
      const { isContentSafe } = await import('./contentFilter.js');
      if (!isContentSafe(sanitized)) {
        return { ok: false, error: 'الرسالة تحتوي على محتوى غير مسموح', code: 'CONTENT_BLOCKED' };
      }
    } catch (_) { /* content filter failure is non-blocking */ }
  }

  // 3. Validate recipient
  if (!recipientId || typeof recipientId !== 'string') {
    return { ok: false, error: 'معرّف المستلم مطلوب', code: 'RECIPIENT_REQUIRED' };
  }

  // 4. Recipient must also be involved
  const recipientCheck = await canMessage(jobId, recipientId);
  if (!recipientCheck.allowed) {
    return { ok: false, error: 'المستلم مش مشارك في هذه الفرصة', code: 'RECIPIENT_NOT_INVOLVED' };
  }

  // 5. Cannot message self
  if (senderId === recipientId) {
    return { ok: false, error: 'لا يمكنك مراسلة نفسك', code: 'CANNOT_MESSAGE_SELF' };
  }

  // 6. Daily limit per user per job
  const todayCount = await countTodayByUserJob(senderId, jobId);
  const dailyLimit = config.MESSAGES.maxMessagesPerJobPerDay || 50;
  if (todayCount >= dailyLimit) {
    return { ok: false, error: 'وصلت للحد اليومي للرسائل في هذه الفرصة', code: 'DAILY_MESSAGE_LIMIT' };
  }

  // 7. Determine sender role
  const senderRole = job.employerId === senderId ? 'employer' : 'worker';

  // 8. Create message record
  const id = 'msg_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const message = {
    id,
    jobId,
    senderId,
    senderRole,
    recipientId,
    text: sanitized,
    read: false,
    readAt: null,
    createdAt: now,
  };

  const msgPath = getRecordPath('messages', id);
  await atomicWrite(msgPath, message);

  // 9. Update secondary indexes
  await addToSetIndex(MESSAGE_JOB_INDEX, jobId, id);
  await addToSetIndex(MESSAGE_USER_INDEX, recipientId, id);

  // 10. Emit event
  eventBus.emit('message:created', {
    messageId: id,
    jobId,
    senderId,
    senderRole,
    recipientId,
    jobTitle: job.title,
    preview: sanitized.substring(0, 100),
  });

  return { ok: true, message };
}

/**
 * Broadcast a message from employer to all accepted workers on a job
 *
 * @param {string} jobId
 * @param {string} employerId
 * @param {string} text
 * @returns {Promise<{ ok: boolean, message?: object, error?: string, code?: string }>}
 */
export async function broadcastMessage(jobId, employerId, text) {
  // 1. Feature flag for broadcast
  if (config.MESSAGES && config.MESSAGES.allowBroadcast === false) {
    return { ok: false, error: 'البث غير مفعّل', code: 'BROADCAST_DISABLED' };
  }

  // 2. canMessage check
  const check = await canMessage(jobId, employerId);
  if (!check.allowed) {
    return { ok: false, error: check.error, code: check.code };
  }
  const job = check.job;

  // 3. Must be employer
  if (job.employerId !== employerId) {
    return { ok: false, error: 'البث متاح لصاحب العمل فقط', code: 'NOT_JOB_OWNER' };
  }

  // 4. Validate text
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'نص الرسالة مطلوب', code: 'TEXT_REQUIRED' };
  }

  const sanitized = sanitizeText(text.trim());
  const maxLen = config.MESSAGES.maxLengthChars || 500;
  if (sanitized.length > maxLen) {
    return { ok: false, error: `الرسالة لا تتجاوز ${maxLen} حرف`, code: 'TEXT_TOO_LONG' };
  }

  // 4b. Content filter check
  if (config.CONTENT_FILTER && config.CONTENT_FILTER.enabled && config.CONTENT_FILTER.checkMessages) {
    try {
      const { isContentSafe } = await import('./contentFilter.js');
      if (!isContentSafe(sanitized)) {
        return { ok: false, error: 'الرسالة تحتوي على محتوى غير مسموح', code: 'CONTENT_BLOCKED' };
      }
    } catch (_) { /* content filter failure is non-blocking */ }
  }

  // 5. Daily limit
  const todayCount = await countTodayByUserJob(employerId, jobId);
  const dailyLimit = config.MESSAGES.maxMessagesPerJobPerDay || 50;
  if (todayCount >= dailyLimit) {
    return { ok: false, error: 'وصلت للحد اليومي للرسائل في هذه الفرصة', code: 'DAILY_MESSAGE_LIMIT' };
  }

  // 6. Get all accepted worker IDs
  const { listByJob: listApps } = await import('./applications.js');
  const apps = await listApps(jobId);
  const workerIds = apps
    .filter(a => a.status === 'accepted')
    .map(a => a.workerId);

  if (workerIds.length === 0) {
    return { ok: false, error: 'لا يوجد عمال مقبولين في هذه الفرصة', code: 'NO_ACCEPTED_WORKERS' };
  }

  // 7. Create ONE broadcast message (recipientId: null)
  const id = 'msg_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const message = {
    id,
    jobId,
    senderId: employerId,
    senderRole: 'employer',
    recipientId: null, // broadcast
    text: sanitized,
    read: false,
    readAt: null,
    createdAt: now,
  };

  const msgPath = getRecordPath('messages', id);
  await atomicWrite(msgPath, message);

  // 8. Update job index
  await addToSetIndex(MESSAGE_JOB_INDEX, jobId, id);

  // 9. Update user index for each worker (so they can find it via countUnread)
  for (const workerId of workerIds) {
    await addToSetIndex(MESSAGE_USER_INDEX, workerId, id);
  }

  // 10. Emit event
  eventBus.emit('message:broadcast', {
    messageId: id,
    jobId,
    senderId: employerId,
    workerIds,
    jobTitle: job.title,
    preview: sanitized.substring(0, 100),
  });

  return { ok: true, message };
}

/**
 * List messages for a job that the user can see
 * A user sees: messages where they are sender OR recipient OR broadcast (recipientId: null)
 *
 * @param {string} jobId
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
export async function listByJob(jobId, userId, { limit = 50, offset = 0 } = {}) {
  // Get all messages for job
  let jobMessages;

  const indexedIds = await getFromSetIndex(MESSAGE_JOB_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const msgId of indexedIds) {
      const msg = await readJSON(getRecordPath('messages', msgId));
      if (msg) results.push(msg);
    }
    jobMessages = results;
  } else {
    // Fallback: full scan
    const msgsDir = getCollectionPath('messages');
    const all = await listJSON(msgsDir);
    jobMessages = all.filter(m => m.jobId === jobId);
  }

  // Filter: user can see messages where they are sender, recipient, or broadcast
  const visible = jobMessages.filter(m =>
    m.senderId === userId ||
    m.recipientId === userId ||
    m.recipientId === null // broadcast
  );

  // Sort newest first
  visible.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = visible.length;
  const items = visible.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

/**
 * Mark a single message as read
 * User must be the recipient (or a broadcast recipient)
 *
 * @param {string} messageId
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, message?: object, error?: string, code?: string }>}
 */
export async function markAsRead(messageId, userId) {
  const msgPath = getRecordPath('messages', messageId);
  const message = await readJSON(msgPath);

  if (!message) {
    return { ok: false, error: 'الرسالة غير موجودة', code: 'MESSAGE_NOT_FOUND' };
  }

  // Ownership: recipient or broadcast recipient
  if (message.recipientId !== null && message.recipientId !== userId) {
    return { ok: false, error: 'مش مسموحلك تعدّل هذه الرسالة', code: 'NOT_MESSAGE_RECIPIENT' };
  }

  // For broadcasts, verify user is involved via index
  if (message.recipientId === null && message.senderId !== userId) {
    // Check if user is in the user-index for this message
    const userMsgIds = await getFromSetIndex(MESSAGE_USER_INDEX, userId);
    if (!userMsgIds.includes(messageId)) {
      return { ok: false, error: 'مش مسموحلك تعدّل هذه الرسالة', code: 'NOT_MESSAGE_RECIPIENT' };
    }
  }

  // Don't re-mark sender's own messages
  if (message.senderId === userId) {
    return { ok: true, message };
  }

  if (message.read) {
    return { ok: true, message };
  }

  message.read = true;
  message.readAt = new Date().toISOString();
  await atomicWrite(msgPath, message);

  return { ok: true, message };
}

/**
 * Mark all unread messages for a user in a specific job as read
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, count: number }>}
 */
export async function markAllAsRead(jobId, userId) {
  const { items } = await listByJob(jobId, userId, { limit: 10000, offset: 0 });

  let count = 0;
  const now = new Date().toISOString();

  for (const msg of items) {
    // Only mark messages where the user is the recipient (not sender)
    if (msg.senderId === userId) continue;
    if (msg.read) continue;

    msg.read = true;
    msg.readAt = now;
    await atomicWrite(getRecordPath('messages', msg.id), msg);
    count++;
  }

  return { ok: true, count };
}

/**
 * Count total unread messages across all jobs for a user
 * Used for notification badge
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countUnread(userId) {
  // Get all message IDs from user index
  const indexedIds = await getFromSetIndex(MESSAGE_USER_INDEX, userId);

  if (indexedIds.length > 0) {
    let count = 0;
    for (const msgId of indexedIds) {
      const msg = await readJSON(getRecordPath('messages', msgId));
      if (msg && !msg.read && msg.senderId !== userId) count++;
    }
    return count;
  }

  // Fallback: full scan
  const msgsDir = getCollectionPath('messages');
  const all = await listJSON(msgsDir);
  return all.filter(m =>
    (m.recipientId === userId || (m.recipientId === null && m.senderId !== userId)) &&
    !m.read
  ).length;
}

/**
 * Count messages sent by a user on a specific job today (Egypt midnight reset)
 *
 * @param {string} userId
 * @param {string} jobId
 * @returns {Promise<number>}
 */
export async function countTodayByUserJob(userId, jobId) {
  // Get messages for this job
  const indexedIds = await getFromSetIndex(MESSAGE_JOB_INDEX, jobId);

  let jobMessages;
  if (indexedIds.length > 0) {
    const results = [];
    for (const msgId of indexedIds) {
      const msg = await readJSON(getRecordPath('messages', msgId));
      if (msg) results.push(msg);
    }
    jobMessages = results;
  } else {
    const msgsDir = getCollectionPath('messages');
    const all = await listJSON(msgsDir);
    jobMessages = all.filter(m => m.jobId === jobId);
  }

  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();

  return jobMessages.filter(m =>
    m.senderId === userId &&
    new Date(m.createdAt) >= todayMidnight
  ).length;
}
```

---

## `server/services/messaging.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/messaging.js — Multi-Channel OTP Messaging Router
// ═══════════════════════════════════════════════════════════════
// Strategy: preferred channel → fallback channel → error
// Default (enabled=false): mock adapter (console.log)
// Production: WhatsApp primary → SMS fallback
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { sendWhatsAppOtp } from './channels/whatsapp.js';
import { sendSmsOtp } from './channels/sms.js';
import { logger } from './logger.js';

// ── Mock Adapter ─────────────────────────────────────────────

/**
 * Mock OTP adapter — logs to console (development/testing)
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp
 * @returns {Promise<{ok: boolean, channel: string, messageId: string, fallbackUsed: boolean}>}
 */
async function sendMockOtp(phone, otp) {
  console.log(`📱 OTP [MOCK] to ${phone}: ${otp}`);
  return {
    ok: true,
    channel: 'mock',
    messageId: `mock_${Date.now()}`,
    fallbackUsed: false,
  };
}

// ── Channel Registry ─────────────────────────────────────────

const adapters = {
  whatsapp: sendWhatsAppOtp,
  sms: sendSmsOtp,
  mock: sendMockOtp,
};

// ── Messaging Router ─────────────────────────────────────────

/**
 * Send OTP message via configured channels (preferred → fallback → error)
 * @param {string} phone — Egyptian local format (01...)
 * @param {string} otp — the OTP code
 * @returns {Promise<{ok: boolean, channel: string, messageId?: string, error?: string, fallbackUsed: boolean}>}
 */
export async function sendOtpMessage(phone, otp) {
  // ── Mock mode (development) ──
  if (!config.MESSAGING.enabled) {
    return sendMockOtp(phone, otp);
  }

  // ── Production: try preferred channel ──
  const preferredChannel = config.MESSAGING.preferredChannel;
  const fallbackChannel = config.MESSAGING.fallbackChannel;

  const preferredAdapter = adapters[preferredChannel];
  if (preferredAdapter) {
    try {
      const result = await preferredAdapter(phone, otp);
      if (result.ok) {
        return { ...result, fallbackUsed: false };
      }
      // Preferred failed — log and continue to fallback
      logger.warn('Preferred messaging channel failed', {
        channel: preferredChannel,
        phone,
        error: result.error || 'unknown',
      });
    } catch (err) {
      logger.error('Preferred messaging channel threw error', {
        channel: preferredChannel,
        phone,
        error: err.message,
      });
    }
  }

  // ── Fallback channel ──
  if (fallbackChannel) {
    const fallbackAdapter = adapters[fallbackChannel];
    if (fallbackAdapter) {
      try {
        const result = await fallbackAdapter(phone, otp);
        if (result.ok) {
          return { ...result, fallbackUsed: true };
        }
        logger.warn('Fallback messaging channel failed', {
          channel: fallbackChannel,
          phone,
          error: result.error || 'unknown',
        });
      } catch (err) {
        logger.error('Fallback messaging channel threw error', {
          channel: fallbackChannel,
          phone,
          error: err.message,
        });
      }
    }
  }

  // ── All channels failed ──
  logger.error('All messaging channels failed — OTP still saved for verification', { phone });
  return {
    ok: false,
    channel: 'none',
    error: 'All messaging channels failed',
    fallbackUsed: !!fallbackChannel,
  };
}

// ── Generic Text Message Delivery ────────────────────────────

/**
 * Send a generic text message (non-OTP) via preferred channel
 * Used for notification messages (application accepted, job filled, etc.)
 *
 * NOTE: sendSmsOtp() in sms.js constructs OTP message internally,
 * so for arbitrary text we build the Infobip payload directly here.
 * WhatsApp free-form messages require 24h conversation window —
 * template-based notifications are a future enhancement.
 *
 * @param {string} phone — Egyptian phone number (01xxx)
 * @param {string} message — Arabic text message
 * @param {{ channel?: string }} options — optional preferred channel override
 * @returns {Promise<{ ok: boolean, channel: string, messageId?: string, error?: string }>}
 */
export async function sendMessage(phone, message, options = {}) {
  // Mock mode (development/testing)
  if (!config.MESSAGING.enabled) {
    console.log(`📩 NOTIFICATION [MOCK] to ${phone}: ${message}`);
    return { ok: true, channel: 'mock', messageId: 'mock_' + Date.now() };
  }

  // Try SMS (the reliable channel for non-OTP text messages)
  const wantSms = options.channel === 'sms' || config.MESSAGING.preferredChannel === 'sms' || config.MESSAGING.fallbackChannel === 'sms';
  if (wantSms && config.MESSAGING.sms.enabled) {
    try {
      const apiKey = process.env.INFOBIP_API_KEY;
      const baseUrl = process.env.INFOBIP_BASE_URL;
      if (apiKey && baseUrl) {
        const senderId = process.env.INFOBIP_SENDER || config.MESSAGING.sms.senderId;
        const internationalPhone = phone.startsWith('0') ? '20' + phone.slice(1) : phone;
        const payload = {
          messages: [{
            destinations: [{ to: internationalPhone }],
            from: senderId,
            text: message,
          }],
        };
        const response = await fetch(`${baseUrl}/sms/2/text/advanced`, {
          method: 'POST',
          headers: {
            'Authorization': `App ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (response.ok && data.messages && data.messages.length > 0) {
          const msg = data.messages[0];
          return { ok: true, channel: 'sms', messageId: msg.messageId || msg.id || 'unknown' };
        }
      }
    } catch (err) {
      logger.warn('SMS notification send failed', { phone, error: err.message });
    }
  }

  // Fallback to mock
  console.log(`📩 NOTIFICATION [MOCK-FALLBACK] to ${phone}: ${message}`);
  return { ok: true, channel: 'mock', messageId: 'mock_fallback_' + Date.now() };
}
```

---

## `server/services/migration.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/migration.js — Schema Migration System
// ═══════════════════════════════════════════════════════════════
// Forward-only, idempotent migrations. No rollback.
// Tracks state in data/migration.json.
// Built-in migrations array — add new migrations at the end.
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import config from '../../config.js';
import { atomicWrite, readJSON, getCollectionPath, listJSON, getRecordPath } from './database.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

/**
 * Get migration state file path
 * @returns {string}
 */
function getMigrationFilePath() {
  const fileName = (config.MIGRATION && config.MIGRATION.dataFile) || 'migration.json';
  return join(BASE_PATH, fileName);
}

/**
 * Read current migration state
 * @returns {Promise<{ version: number, appliedAt: string|null, migrations: object[] }>}
 */
async function readState() {
  const filePath = getMigrationFilePath();
  const state = await readJSON(filePath);
  return state || { version: 0, appliedAt: null, migrations: [] };
}

/**
 * Write migration state atomically
 * @param {object} state
 */
async function writeState(state) {
  const filePath = getMigrationFilePath();
  await atomicWrite(filePath, state);
}

/**
 * Get current schema version (0 = fresh system, no migrations applied)
 * @returns {Promise<number>}
 */
export async function getCurrentVersion() {
  const state = await readState();
  return state.version;
}

// ═══════════════════════════════════════════════════════════════
// Built-in Migrations
// ═══════════════════════════════════════════════════════════════

const builtInMigrations = [
  {
    version: 1,
    name: 'Ensure availability field on all users',
    up: async () => {
      const usersDir = getCollectionPath('users');
      const allUsers = await listJSON(usersDir);
      const users = allUsers.filter(u => u.id && u.id.startsWith('usr_'));

      let updated = 0;
      const now = new Date().toISOString();

      for (const user of users) {
        if (!user.availability) {
          user.availability = {
            available: (config.WORKER_AVAILABILITY && config.WORKER_AVAILABILITY.defaultAvailable !== undefined)
              ? config.WORKER_AVAILABILITY.defaultAvailable : true,
            availableFrom: null,
            availableUntil: null,
            updatedAt: now,
          };
          const userPath = getRecordPath('users', user.id);
          await atomicWrite(userPath, user);
          updated++;
        }
      }

      if (updated > 0) {
        logger.info(`Migration v1: added availability to ${updated} users`);
      }
    },
  },
];

/**
 * Run all pending migrations in order
 * Forward-only — stops on first failure
 * Idempotent — skips already-applied migrations
 *
 * @returns {Promise<{ applied: number, current: number }>}
 */
export async function runMigrations() {
  // Feature flag check
  if (!config.MIGRATION || !config.MIGRATION.enabled) {
    return { applied: 0, current: 0 };
  }

  const state = await readState();
  const currentVersion = state.version;

  // Filter pending migrations (higher version than current)
  const pending = builtInMigrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    return { applied: 0, current: currentVersion };
  }

  logger.info(`Migration: ${pending.length} pending migration(s) from v${currentVersion}`);

  let applied = 0;

  for (const migration of pending) {
    try {
      logger.info(`Migration: running v${migration.version} — ${migration.name}`);
      await migration.up();

      // Update state atomically after each successful migration
      state.version = migration.version;
      state.appliedAt = new Date().toISOString();
      state.migrations.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date().toISOString(),
      });
      await writeState(state);

      applied++;
      logger.info(`Migration: v${migration.version} applied successfully`);
    } catch (err) {
      // Stop on first failure — no partial state
      logger.error(`Migration: v${migration.version} FAILED — stopping`, { error: err.message });
      throw err;
    }
  }

  return { applied, current: state.version };
}
```

---

## `server/services/monitor.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/monitor.js — Metrics Snapshots + Alerting
// ═══════════════════════════════════════════════════════════════
// Hourly snapshots stored in data/metrics/.
// Threshold-based alerting (warning/critical).
// Cleanup for old snapshots.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir, unlink, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import { atomicWrite, readJSON, deleteJSON } from './database.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const METRICS_DIR = join(BASE_PATH, 'metrics');

/**
 * Count .json files in a collection directory (no content reading)
 * @param {string} collectionName
 * @returns {Promise<number>}
 */
async function countCollectionFiles(collectionName) {
  try {
    const dir = join(BASE_PATH, config.DATABASE.dirs[collectionName] || collectionName);
    const files = await readdir(dir);
    return files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp')).length;
  } catch (_) {
    return 0;
  }
}

/**
 * Capture a metrics snapshot
 * @returns {Promise<object>}
 */
export async function captureSnapshot() {
  const id = 'mtr_' + crypto.randomBytes(6).toString('hex');
  const timestamp = new Date().toISOString();

  // Memory
  const mem = process.memoryUsage();
  const memory = {
    heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
    heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
    rssMB: +(mem.rss / 1048576).toFixed(1),
  };

  // Cache stats
  let cache = { hits: 0, misses: 0, size: 0, hitRate: '0%' };
  try {
    const { stats: cacheStats } = await import('./cache.js');
    cache = cacheStats();
  } catch (_) {}

  // Request metrics
  let requests = { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, errorRate: '0%' };
  try {
    const { getMetrics } = await import('../middleware/timing.js');
    requests = getMetrics();
  } catch (_) {}

  // SSE connections
  let connections = { sse: 0, sseUsers: 0 };
  try {
    const { getStats } = await import('./sseManager.js');
    const s = getStats();
    connections = { sse: s.totalConnections, sseUsers: s.totalUsers };
  } catch (_) {}

  // Active locks
  let locks = { active: 0 };
  try {
    const { getLockCount } = await import('./resourceLock.js');
    locks = { active: getLockCount() };
  } catch (_) {}

  // Index health
  let indexHealth = { status: 'unknown', warnings: 0 };
  try {
    const { getHealthStatus } = await import('./indexHealth.js');
    indexHealth = getHealthStatus();
  } catch (_) {}

  // Search index
  let searchIndex = { size: 0, lastBuilt: null };
  try {
    const { getStats: searchStats } = await import('./searchIndex.js');
    searchIndex = searchStats();
  } catch (_) {}

  // Data sizes (file counts per collection)
  const dataSize = {
    users: await countCollectionFiles('users'),
    jobs: await countCollectionFiles('jobs'),
    applications: await countCollectionFiles('applications'),
    notifications: await countCollectionFiles('notifications'),
    messages: await countCollectionFiles('messages'),
    payments: await countCollectionFiles('payments'),
  };

  const snapshot = {
    id,
    timestamp,
    memory,
    cache,
    requests,
    connections,
    locks,
    indexHealth,
    searchIndex,
    dataSize,
  };

  // Save to disk (use BASE_PATH directly to respect YAWMIA_DATA_PATH)
  await mkdir(METRICS_DIR, { recursive: true });
  const snapshotPath = join(METRICS_DIR, `${id}.json`);
  await atomicWrite(snapshotPath, snapshot);

  return snapshot;
}

/**
 * Get snapshots within a date range
 * @param {{ from?: string, to?: string, limit?: number }} options
 * @returns {Promise<object[]>}
 */
export async function getSnapshots(options = {}) {
  const limit = options.limit || 24;

  let files;
  try {
    files = await readdir(METRICS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const jsonFiles = files.filter(f => f.startsWith('mtr_') && f.endsWith('.json') && !f.endsWith('.tmp'));

  const snapshots = [];
  for (const file of jsonFiles) {
    const data = await readJSON(join(METRICS_DIR, file));
    if (!data || !data.timestamp) continue;

    // Date range filter
    if (options.from && data.timestamp < options.from) continue;
    if (options.to && data.timestamp > options.to) continue;

    snapshots.push(data);
  }

  // Sort newest first
  snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return snapshots.slice(0, limit);
}

/**
 * Check thresholds against a snapshot
 * @param {object} snapshot
 * @returns {Array<{ level: string, metric: string, value: number, threshold: number, message: string }>}
 */
export function checkThresholds(snapshot) {
  if (!config.MONITORING || !config.MONITORING.thresholds) return [];
  if (!snapshot) return [];

  const alerts = [];
  const thresholds = config.MONITORING.thresholds;

  // Heap used
  if (thresholds.heapUsedMB && snapshot.memory) {
    const val = snapshot.memory.heapUsedMB;
    if (val >= thresholds.heapUsedMB.critical) {
      alerts.push({ level: 'critical', metric: 'heapUsedMB', value: val, threshold: thresholds.heapUsedMB.critical, message: `Heap usage critical: ${val}MB` });
    } else if (val >= thresholds.heapUsedMB.warning) {
      alerts.push({ level: 'warning', metric: 'heapUsedMB', value: val, threshold: thresholds.heapUsedMB.warning, message: `Heap usage warning: ${val}MB` });
    }
  }

  // Error rate
  if (thresholds.errorRate && snapshot.requests) {
    const rateStr = snapshot.requests.errorRate || '0%';
    const val = parseFloat(rateStr);
    if (!isNaN(val)) {
      if (val >= thresholds.errorRate.critical) {
        alerts.push({ level: 'critical', metric: 'errorRate', value: val, threshold: thresholds.errorRate.critical, message: `Error rate critical: ${val}%` });
      } else if (val >= thresholds.errorRate.warning) {
        alerts.push({ level: 'warning', metric: 'errorRate', value: val, threshold: thresholds.errorRate.warning, message: `Error rate warning: ${val}%` });
      }
    }
  }

  // P95 latency
  if (thresholds.p95Ms && snapshot.requests) {
    const val = snapshot.requests.p95Ms || 0;
    if (val >= thresholds.p95Ms.critical) {
      alerts.push({ level: 'critical', metric: 'p95Ms', value: val, threshold: thresholds.p95Ms.critical, message: `P95 latency critical: ${val}ms` });
    } else if (val >= thresholds.p95Ms.warning) {
      alerts.push({ level: 'warning', metric: 'p95Ms', value: val, threshold: thresholds.p95Ms.warning, message: `P95 latency warning: ${val}ms` });
    }
  }

  // Cache hit rate (lower = worse)
  if (thresholds.cacheHitRate && snapshot.cache) {
    const rateStr = snapshot.cache.hitRate || '0%';
    const val = parseFloat(rateStr);
    if (!isNaN(val)) {
      if (val <= thresholds.cacheHitRate.critical) {
        alerts.push({ level: 'critical', metric: 'cacheHitRate', value: val, threshold: thresholds.cacheHitRate.critical, message: `Cache hit rate critical: ${val}%` });
      } else if (val <= thresholds.cacheHitRate.warning) {
        alerts.push({ level: 'warning', metric: 'cacheHitRate', value: val, threshold: thresholds.cacheHitRate.warning, message: `Cache hit rate warning: ${val}%` });
      }
    }
  }

  return alerts;
}

/**
 * Clean old snapshots beyond retention period
 * @returns {Promise<number>} count of deleted snapshots
 */
export async function cleanOldSnapshots() {
  if (!config.MONITORING || !config.MONITORING.retentionDays) return 0;

  const retentionMs = config.MONITORING.retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - retentionMs);
  let cleaned = 0;

  let files;
  try {
    files = await readdir(METRICS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  for (const file of files) {
    if (!file.startsWith('mtr_') || !file.endsWith('.json') || file.endsWith('.tmp')) continue;
    try {
      const filePath = join(METRICS_DIR, file);
      const data = await readJSON(filePath);
      if (data && data.timestamp && new Date(data.timestamp) < cutoff) {
        try { await unlink(filePath); } catch (_) {}
        cleaned++;
      }
    } catch (_) {
      // Skip individual file errors
    }
  }

  return cleaned;
}
```

---

## `server/services/notificationMessenger.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/notificationMessenger.js — Notification Delivery Pipeline
// ═══════════════════════════════════════════════════════════════
// 7-step pipeline: feature flag → event criticality → user preferences →
// channel availability → per-user cooldown → daily limit → send
// NEVER throws — all errors caught internally (fire-and-forget safe)
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

// ── In-memory state ──────────────────────────────────────────

/** @type {Map<string, number>} userId → lastSentTimestamp */
const userCooldowns = new Map();

/** @type {Map<string, number>} userId → todayMessageCount */
const userDailyCounts = new Map();

/** @type {string|null} last reset date string (Egypt timezone) */
let lastResetDate = null;

// ── Internal helpers ─────────────────────────────────────────

/**
 * Get current date string in Egypt timezone (UTC+2)
 * @returns {string} e.g. "2026-04-18"
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
 * Check if user is within cooldown period
 * @param {string} userId
 * @returns {boolean} true if cooled down (can send), false if still in cooldown
 */
function isCooledDown(userId) {
  const last = userCooldowns.get(userId);
  if (!last) return true;
  return (Date.now() - last) >= config.NOTIFICATION_MESSAGING.cooldownMs;
}

/**
 * Record a successful send for cooldown + daily tracking
 * @param {string} userId
 */
function recordSend(userId) {
  userCooldowns.set(userId, Date.now());
  const current = userDailyCounts.get(userId) || 0;
  userDailyCounts.set(userId, current + 1);
}

/**
 * Check if user is within daily message limit
 * @param {string} userId
 * @returns {boolean} true if under limit (can send), false if limit reached
 */
function checkDailyLimit(userId) {
  // Reset counters if Egypt date has changed
  const today = getEgyptDateString();
  if (lastResetDate !== today) {
    userDailyCounts.clear();
    lastResetDate = today;
  }

  const count = userDailyCounts.get(userId) || 0;
  return count < config.NOTIFICATION_MESSAGING.maxDailyMessagesPerUser;
}

/**
 * Resolve notification preferences from user record or config defaults
 * @param {object|null} user
 * @returns {{ inApp: boolean, whatsapp: boolean, sms: boolean }}
 */
function resolvePreferences(user) {
  if (user && user.notificationPreferences) {
    return {
      inApp: true, // always true
      whatsapp: user.notificationPreferences.whatsapp ?? config.NOTIFICATION_MESSAGING.defaultPreferences.whatsapp,
      sms: user.notificationPreferences.sms ?? config.NOTIFICATION_MESSAGING.defaultPreferences.sms,
    };
  }
  return { ...config.NOTIFICATION_MESSAGING.defaultPreferences };
}

// ── Cooldown cleanup timer ───────────────────────────────────
// Every 10 minutes, remove stale cooldown entries
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - (config.NOTIFICATION_MESSAGING.cooldownMs * 2);
  for (const [userId, timestamp] of userCooldowns) {
    if (timestamp < cutoff) {
      userCooldowns.delete(userId);
    }
  }
}, 10 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

// ── Main export ──────────────────────────────────────────────

/**
 * Send a notification message via WhatsApp/SMS for critical events
 *
 * 7-step pipeline:
 * 1. Feature flag check
 * 2. Event criticality check
 * 3. User preferences resolution
 * 4. Channel determination
 * 5. Cooldown check
 * 6. Daily limit check
 * 7. Send via messaging.js sendMessage()
 *
 * @param {{ userId: string, phone: string, eventType: string, message: string, user?: object }} params
 * @returns {Promise<{ sent: boolean, channel?: string, reason?: string }>}
 */
export async function sendNotificationMessage(params) {
  try {
    const { userId, phone, eventType, message, user } = params || {};

    // Step 1: Feature flag
    if (!config.NOTIFICATION_MESSAGING.enabled) {
      return { sent: false, reason: 'notification_messaging_disabled' };
    }

    // Step 2: Event criticality
    if (!eventType || !config.NOTIFICATION_MESSAGING.criticalEvents[eventType]) {
      return { sent: false, reason: 'event_not_critical' };
    }

    // Step 3: User preferences
    const prefs = resolvePreferences(user);

    // Step 4: Channel determination
    // WhatsApp free-form requires 24h window — Phase 13 routes to SMS
    // SMS is the reliable channel for non-OTP notifications
    let selectedChannel = null;
    if (prefs.sms) {
      selectedChannel = 'sms';
    } else if (prefs.whatsapp) {
      // WhatsApp templates not yet implemented — fallback to SMS if available
      selectedChannel = 'sms';
    }

    if (!selectedChannel) {
      return { sent: false, reason: 'no_channel_available' };
    }

    // Step 5: Cooldown check
    if (!userId || !isCooledDown(userId)) {
      return { sent: false, reason: 'cooldown_active' };
    }

    // Step 6: Daily limit check
    if (!checkDailyLimit(userId)) {
      return { sent: false, reason: 'daily_limit_reached' };
    }

    // Step 7: Send via messaging.js sendMessage()
    if (!phone) {
      return { sent: false, reason: 'no_phone' };
    }

    const { sendMessage } = await import('./messaging.js');
    const result = await sendMessage(phone, message, { channel: selectedChannel });

    if (result && result.ok) {
      recordSend(userId);
      logger.info('Notification message sent', {
        userId,
        eventType,
        channel: result.channel,
      });
      return { sent: true, channel: result.channel };
    }

    return { sent: false, reason: 'send_failed' };
  } catch (err) {
    // NEVER throw — fire-and-forget safe
    logger.warn('Notification message error', {
      error: err.message,
      userId: params?.userId,
      eventType: params?.eventType,
    });
    return { sent: false, reason: 'internal_error' };
  }
}
```

---

## `server/services/notifications.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/notifications.js — In-App Notification System
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, deleteJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex, readSetIndex, writeSetIndex } from './database.js';
import { eventBus } from './eventBus.js';

const USER_NTF_INDEX = config.DATABASE.indexFiles.userNotificationsIndex;

// ── Notification Deduplication (in-memory) ───────────────────
/** @type {Map<string, number>} dedupKey → timestamp */
const recentNotifications = new Map();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup stale dedup entries every 10 minutes
const dedupCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - (DEDUP_WINDOW_MS * 2);
  for (const [key, timestamp] of recentNotifications) {
    if (timestamp < cutoff) {
      recentNotifications.delete(key);
    }
  }
}, 10 * 60 * 1000);
if (dedupCleanupTimer.unref) dedupCleanupTimer.unref();

/**
 * Create a notification
 */
export async function createNotification(userId, type, message, meta = {}) {
  // Dedup check: skip if same userId+type within window
  const dedupKey = `${userId}:${type}`;
  const lastSent = recentNotifications.get(dedupKey);
  if (lastSent && (Date.now() - lastSent) < DEDUP_WINDOW_MS) {
    return null;
  }
  recentNotifications.set(dedupKey, Date.now());

  const id = 'ntf_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const notification = {
    id,
    userId,
    type,
    message,
    meta,
    read: false,
    createdAt: now,
    readAt: null,
  };

  const ntfPath = getRecordPath('notifications', id);
  await atomicWrite(ntfPath, notification);

  // Update secondary index
  await addToSetIndex(USER_NTF_INDEX, userId, id);

  eventBus.emit('notification:created', { notificationId: id, userId, type });

  // Push notification via SSE (fire-and-forget)
  try {
    const { sendToUser } = await import('./sseManager.js');
    sendToUser(userId, 'notification', notification, id);
  } catch (_) {
    // Fire-and-forget — don't break notification creation flow
  }

  // Enforce max notifications per user (fire-and-forget)
  enforceMaxNotifications(userId).catch(() => {});

  return notification;
}

/**
 * List notifications for a user (index-accelerated, paginated, newest first)
 */
export async function listByUser(userId, { limit = 20, offset = 0 } = {}) {
  let userNotifications;

  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf) results.push(ntf);
    }
    userNotifications = results;
  } else {
    // Fallback: full scan (backward compatibility for pre-index data)
    const ntfDir = getCollectionPath('notifications');
    const allNotifications = await listJSON(ntfDir);
    userNotifications = allNotifications.filter(n => n.userId === userId);
  }

  // Sort newest first
  userNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = userNotifications.length;
  const items = userNotifications.slice(offset, offset + limit);
  const unread = userNotifications.filter(n => !n.read).length;

  return { items, total, unread, limit, offset };
}

/**
 * Count unread notifications for a user (index-accelerated)
 */
export async function countUnread(userId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
  if (indexedIds.length > 0) {
    let count = 0;
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf && !ntf.read) count++;
    }
    return count;
  }

  // Fallback: full scan
  const ntfDir = getCollectionPath('notifications');
  const allNotifications = await listJSON(ntfDir);
  return allNotifications.filter(n => n.userId === userId && !n.read).length;
}

/**
 * Mark a notification as read (with ownership check)
 */
export async function markAsRead(notificationId, userId) {
  const ntfPath = getRecordPath('notifications', notificationId);
  const notification = await readJSON(ntfPath);

  if (!notification) {
    return { ok: false, error: 'الإشعار غير موجود', code: 'NOTIFICATION_NOT_FOUND' };
  }

  if (notification.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تعدّل هذا الإشعار', code: 'NOT_NOTIFICATION_OWNER' };
  }

  if (notification.read) {
    return { ok: true, notification };
  }

  notification.read = true;
  notification.readAt = new Date().toISOString();
  await atomicWrite(ntfPath, notification);

  return { ok: true, notification };
}

/**
 * Mark all notifications as read for a user (index-accelerated)
 */
export async function markAllAsRead(userId) {
  let userNotifications;

  // Try index-accelerated lookup first (same pattern as listByUser/countUnread)
  const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf) results.push(ntf);
    }
    userNotifications = results;
  } else {
    // Fallback: full scan (backward compatibility for pre-index data)
    const ntfDir = getCollectionPath('notifications');
    const allNotifications = await listJSON(ntfDir);
    userNotifications = allNotifications.filter(n => n.userId === userId);
  }

  let count = 0;
  const now = new Date().toISOString();

  for (const notification of userNotifications) {
    if (!notification.read) {
      notification.read = true;
      notification.readAt = now;
      const ntfPath = getRecordPath('notifications', notification.id);
      await atomicWrite(ntfPath, notification);
      count++;
    }
  }

  return { ok: true, count };
}

/**
 * Clean old notifications beyond TTL (startup + periodic)
 * Only deletes READ notifications — unread always survive regardless of age
 * Uses batch processing with event loop yielding to avoid blocking
 * @returns {Promise<number>} count of cleaned notifications
 */
export async function cleanOldNotifications() {
  const ttlDays = config.CLEANUP?.notificationTtlDays;
  if (!ttlDays || ttlDays <= 0) return 0;

  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
  const ntfDir = getCollectionPath('notifications');

  let files;
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(ntfDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp') && f.startsWith('ntf_'));
  let cleaned = 0;
  const affectedUsers = new Set();
  const cleanedIds = new Set();
  const BATCH_SIZE = 100;
  const { join: joinPath } = await import('node:path');

  for (let i = 0; i < jsonFiles.length; i++) {
    const ntf = await readJSON(joinPath(ntfDir, jsonFiles[i]));
    if (ntf && ntf.createdAt && new Date(ntf.createdAt) < cutoff && ntf.read) {
      const ntfPath = getRecordPath('notifications', ntf.id);
      await deleteJSON(ntfPath);
      if (ntf.userId) affectedUsers.add(ntf.userId);
      cleanedIds.add(ntf.id);
      cleaned++;
    }
    // Yield to event loop every BATCH_SIZE files
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  // Update user notification indexes — remove cleaned notification IDs (batch)
  if (cleaned > 0 && affectedUsers.size > 0) {
    const indexPath = config.DATABASE.indexFiles.userNotificationsIndex;
    const index = await readSetIndex(indexPath);

    for (const userId of affectedUsers) {
      if (index[userId]) {
        index[userId] = index[userId].filter(id => !cleanedIds.has(id));
        if (index[userId].length === 0) delete index[userId];
      }
    }
    await writeSetIndex(indexPath, index);
  }

  return cleaned;
}

/**
 * Enforce max notifications per user — delete oldest read notifications if exceeding limit.
 * Fire-and-forget safe — NEVER throws.
 * Only deletes READ notifications — unread are always protected.
 * @param {string} userId
 */
async function enforceMaxNotifications(userId) {
  try {
    const maxPerUser = config.CLEANUP?.maxNotificationsPerUser;
    if (!maxPerUser || maxPerUser <= 0) return;

    // Get all notification IDs for user from index
    const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
    if (indexedIds.length <= maxPerUser) return;

    // Load all notifications
    const notifications = [];
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf) notifications.push(ntf);
    }

    if (notifications.length <= maxPerUser) return;

    // Sort oldest first
    notifications.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Calculate excess
    const excess = notifications.length - maxPerUser;

    // Collect oldest READ notifications to delete
    const toDelete = [];
    for (const ntf of notifications) {
      if (toDelete.length >= excess) break;
      if (ntf.read) {
        toDelete.push(ntf.id);
      }
    }

    if (toDelete.length === 0) return;

    // Delete files
    for (const ntfId of toDelete) {
      await deleteJSON(getRecordPath('notifications', ntfId));
    }

    // Batch update index — single read + single write
    const deletedSet = new Set(toDelete);
    const indexPath = USER_NTF_INDEX;
    const index = await readSetIndex(indexPath);
    if (index[userId]) {
      index[userId] = index[userId].filter(id => !deletedSet.has(id));
      if (index[userId].length === 0) delete index[userId];
      await writeSetIndex(indexPath, index);
    }
  } catch (_) {
    // Fire-and-forget — NEVER throws
  }
}

/**
 * Setup EventBus listeners for automatic notification creation
 */
export function setupNotificationListeners() {
  if (!config.NOTIFICATIONS.enabled) return;

  // Worker gets notification when their application is accepted
  if (config.NOTIFICATIONS.workerNotifications.applicationAccepted) {
    eventBus.on('application:accepted', (data) => {
      const message = `تم قبولك في الفرصة: ${data.jobTitle}`;
      createNotification(
        data.workerId,
        'application_accepted',
        message,
        { jobId: data.jobId, applicationId: data.applicationId }
      ).catch(() => {});

      // Send WhatsApp/SMS for critical event (fire-and-forget)
      import('./notificationMessenger.js').then(({ sendNotificationMessage }) => {
        import('./users.js').then(({ findById: findUser }) => {
          findUser(data.workerId).then(user => {
            if (user && user.phone) {
              sendNotificationMessage({
                userId: data.workerId,
                phone: user.phone,
                eventType: 'application_accepted',
                message: `يوميّة: ${message}`,
                user,
              }).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});

      // Web Push (fire-and-forget)
      import('./webpush.js').then(({ sendPush }) => {
        sendPush(data.workerId, {
          title: 'يوميّة',
          body: message,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    });
  }

  // Worker gets notification when their application is rejected
  if (config.NOTIFICATIONS.workerNotifications.applicationRejected) {
    eventBus.on('application:rejected', (data) => {
      createNotification(
        data.workerId,
        'application_rejected',
        `للأسف لم يتم قبولك في الفرصة: ${data.jobTitle}`,
        { jobId: data.jobId, applicationId: data.applicationId }
      ).catch(() => {});
    });
  }

  // Employer gets notification when a worker applies to their job
  if (config.NOTIFICATIONS.employerNotifications.newApplication) {
    eventBus.on('application:submitted', (data) => {
      if (data.employerId) {
        createNotification(
          data.employerId,
          'new_application',
          'عامل جديد تقدّم على فرصتك',
          { jobId: data.jobId, applicationId: data.applicationId }
        ).catch(() => {});
      }
    });
  }

  // Employer gets notification when their job is filled
  if (config.NOTIFICATIONS.employerNotifications.jobFilled) {
    eventBus.on('job:filled', (data) => {
      const message = `الفرصة اكتملت العدد المطلوب: ${data.jobTitle}`;
      createNotification(
        data.employerId,
        'job_filled',
        message,
        { jobId: data.jobId }
      ).catch(() => {});

      // Send WhatsApp/SMS for critical event (fire-and-forget)
      import('./notificationMessenger.js').then(({ sendNotificationMessage }) => {
        import('./users.js').then(({ findById: findUser }) => {
          findUser(data.employerId).then(user => {
            if (user && user.phone) {
              sendNotificationMessage({
                userId: data.employerId,
                phone: user.phone,
                eventType: 'job_filled',
                message: `يوميّة: ${message}`,
                user,
              }).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});

      // Web Push (fire-and-forget)
      import('./webpush.js').then(({ sendPush }) => {
        sendPush(data.employerId, {
          title: 'يوميّة',
          body: message,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    });
  }

  // Workers get notified when a job they applied to is cancelled
  eventBus.on('job:cancelled', async (data) => {
    try {
      // Dynamic imports to avoid circular dependencies
      const { listByJob } = await import('./applications.js');
      const { atomicWrite: write, getRecordPath: recPath } = await import('./database.js');

      const apps = await listByJob(data.jobId);
      const now = new Date().toISOString();
      const affectedWorkerIds = new Set();

      for (const app of apps) {
        // Track workers who were pending or accepted
        if (app.status === 'pending' || app.status === 'accepted') {
          affectedWorkerIds.add(app.workerId);
        }
        // Auto-reject pending applications
        if (app.status === 'pending') {
          app.status = 'rejected';
          app.respondedAt = now;
          const appPath = recPath('applications', app.id);
          await write(appPath, app);
        }
      }

      // Notify all affected workers
      const cancelMessage = `تم إلغاء الفرصة: ${data.jobTitle}`;
      for (const workerId of affectedWorkerIds) {
        await createNotification(
          workerId,
          'job_cancelled',
          cancelMessage,
          { jobId: data.jobId }
        );
      }

      // Send WhatsApp/SMS to affected workers (fire-and-forget)
      try {
        const { sendNotificationMessage } = await import('./notificationMessenger.js');
        const { findById: findUser } = await import('./users.js');
        for (const workerId of affectedWorkerIds) {
          const worker = await findUser(workerId);
          if (worker && worker.phone) {
            sendNotificationMessage({
              userId: workerId,
              phone: worker.phone,
              eventType: 'job_cancelled',
              message: `يوميّة: ${cancelMessage}`,
              user: worker,
            }).catch(() => {});
          }
        }
      } catch (_) {
        // Fire-and-forget
      }
    } catch (err) {
      // Fire-and-forget — errors don't break the cancel flow
    }
  });

  // User gets notification when they receive a rating
  eventBus.on('rating:submitted', (data) => {
    const starText = '⭐'.repeat(Math.min(data.stars, 5));
    createNotification(
      data.toUserId,
      'rating_received',
      `تم تقييمك ${starText} (${data.stars}/5) في الفرصة: ${data.jobTitle}`,
      { jobId: data.jobId, ratingId: data.ratingId, stars: data.stars }
    ).catch(() => {});
  });

  // Employer gets notification when payment record is created
  eventBus.on('payment:created', (data) => {
    const message = `تم إنشاء سجل دفع للفرصة — المبلغ: ${data.amount} جنيه (عمولة المنصة: ${data.platformFee} جنيه)`;
    createNotification(
      data.employerId,
      'payment_created',
      message,
      { jobId: data.jobId, paymentId: data.paymentId, amount: data.amount, platformFee: data.platformFee }
    ).catch(() => {});

    // Send WhatsApp/SMS for critical event (fire-and-forget)
    import('./notificationMessenger.js').then(({ sendNotificationMessage }) => {
      import('./users.js').then(({ findById: findUser }) => {
        findUser(data.employerId).then(user => {
          if (user && user.phone) {
            sendNotificationMessage({
              userId: data.employerId,
              phone: user.phone,
              eventType: 'payment_created',
              message: `يوميّة: ${message}`,
              user,
            }).catch(() => {});
          }
        }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});

    // Web Push (fire-and-forget)
    import('./webpush.js').then(({ sendPush }) => {
      sendPush(data.employerId, {
        title: 'يوميّة',
        body: message,
        icon: '/assets/img/icon-192.png',
        url: '/dashboard.html',
      }).catch(() => {});
    }).catch(() => {});
  });

  // Employer gets notification when payment is disputed
  eventBus.on('payment:disputed', (data) => {
    if (data.disputedBy !== data.employerId) {
      createNotification(
        data.employerId,
        'payment_disputed',
        'تم فتح نزاع على دفعة — برجاء مراجعة التفاصيل',
        { jobId: data.jobId, paymentId: data.paymentId }
      ).catch(() => {});
    }
  });

  // Target user gets notification when reported
  eventBus.on('report:created', (data) => {
    createNotification(
      data.targetId,
      'report_received',
      'تم تقديم بلاغ بخصوص حسابك — يُرجى الالتزام بسياسة المنصة',
      { reportId: data.reportId, type: data.type }
    ).catch(() => {});
  });

  // Reporter gets notification when their report is reviewed
  eventBus.on('report:reviewed', (data) => {
    const statusMessages = {
      reviewed: 'تمت مراجعة بلاغك',
      action_taken: 'تم اتخاذ إجراء بناءً على بلاغك',
      dismissed: 'تم رفض بلاغك — لم يتم العثور على مخالفة',
    };
    createNotification(
      data.reporterId,
      'report_reviewed',
      statusMessages[data.status] || 'تم تحديث حالة بلاغك',
      { reportId: data.reportId, status: data.status }
    ).catch(() => {});
  });

  // User gets notification when verification is reviewed
  eventBus.on('verification:reviewed', (data) => {
    const statusMessages = {
      verified: 'تم التحقق من هويتك بنجاح ✓',
      rejected: 'لم يتم قبول طلب التحقق — يُرجى إعادة المحاولة',
    };
    createNotification(
      data.userId,
      'verification_reviewed',
      statusMessages[data.status] || 'تم تحديث حالة طلب التحقق',
      { verificationId: data.verificationId, status: data.status }
    ).catch(() => {});
  });

  // Workers get notified when a job they applied to is renewed
  eventBus.on('job:renewed', async (data) => {
    try {
      const { listByJob } = await import('./applications.js');
      const apps = await listByJob(data.jobId);
      const renewMessage = `الفرصة "${data.jobTitle}" تم تجديدها وهي متاحة مرة تانية`;

      for (const app of apps) {
        if (app.status === 'pending' || app.status === 'accepted') {
          await createNotification(
            app.workerId,
            'job_renewed',
            renewMessage,
            { jobId: data.jobId }
          ).catch(() => {});
        }
      }
    } catch (_) {
      // Fire-and-forget
    }
  });

  // Disconnect banned user from SSE (on auto-ban from reports)
  eventBus.on('report:autoban', async (data) => {
    try {
      const { disconnectUser } = await import('./sseManager.js');
      disconnectUser(data.targetId);
    } catch (_) {
      // Fire-and-forget
    }
  });

  // ── Attendance Notifications ────────────────────────────────

  // Employer gets notification when worker checks in
  eventBus.on('attendance:checkin', (data) => {
    createNotification(
      data.employerId,
      'worker_checked_in',
      'عامل سجّل حضوره في موقع العمل',
      { jobId: data.jobId, workerId: data.workerId, attendanceId: data.attendanceId }
    ).catch(() => {});
  });

  // Worker gets notification when reported as no-show
  eventBus.on('attendance:noshow', (data) => {
    createNotification(
      data.workerId,
      'attendance_noshow',
      'تم تسجيلك غائب عن العمل — تواصل مع صاحب العمل لو في خطأ',
      { jobId: data.jobId, attendanceId: data.attendanceId }
    ).catch(() => {});
  });

  // Worker gets notification when employer confirms attendance
  eventBus.on('attendance:confirmed', (data) => {
    createNotification(
      data.workerId,
      'attendance_confirmed',
      'صاحب العمل أكّد حضورك ✓',
      { jobId: data.jobId, attendanceId: data.attendanceId }
    ).catch(() => {});
  });

  // ── Messaging Notifications ─────────────────────────────────

  // Recipient gets notification when they receive a direct message
  eventBus.on('message:created', (data) => {
    if (data.recipientId) {
      const msgText = `رسالة جديدة في الفرصة: ${data.jobTitle || 'فرصة عمل'}`;
      createNotification(
        data.recipientId,
        'new_message',
        msgText,
        { jobId: data.jobId, messageId: data.messageId, senderId: data.senderId }
      ).catch(() => {});

      // Web Push (fire-and-forget)
      import('./webpush.js').then(({ sendPush }) => {
        sendPush(data.recipientId, {
          title: 'يوميّة — رسالة جديدة',
          body: data.preview || msgText,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    }
  });

  // All accepted workers get notification on broadcast message
  eventBus.on('message:broadcast', (data) => {
    if (data.workerIds && data.workerIds.length > 0) {
      const msgText = `رسالة جديدة من صاحب العمل في الفرصة: ${data.jobTitle || 'فرصة عمل'}`;
      for (const workerId of data.workerIds) {
        createNotification(
          workerId,
          'new_message',
          msgText,
          { jobId: data.jobId, messageId: data.messageId, senderId: data.senderId }
        ).catch(() => {});
      }

      // Web Push to all workers (fire-and-forget)
      import('./webpush.js').then(({ sendPushToMany }) => {
        sendPushToMany(data.workerIds, {
          title: 'يوميّة — رسالة جديدة',
          body: data.preview || msgText,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    }
  });

  // ── Job Expiry Warning Notifications ────────────────────────

  // Employer + pending applicants get warned before job expires
  eventBus.on('job:expiry_warning', async (data) => {
    try {
      // Notify employer
      createNotification(
        data.employerId,
        'job_expiry_warning',
        `فرصتك "${data.jobTitle}" هتنتهي خلال 24 ساعة — جدّدها أو أكملها`,
        { jobId: data.jobId }
      ).catch(() => {});

      // Notify pending applicants
      if (data.pendingWorkerIds && data.pendingWorkerIds.length > 0) {
        for (const workerId of data.pendingWorkerIds) {
          createNotification(
            workerId,
            'job_expiry_warning',
            `الفرصة "${data.jobTitle}" هتنتهي قريب`,
            { jobId: data.jobId }
          ).catch(() => {});
        }
      }
    } catch (_) {
      // Fire-and-forget
    }
  });
}
```

---

## `server/services/payments.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/payments.js — Payment Tracking Service
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, safeReadJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { withLock } from './resourceLock.js';

const JOB_PAYMENTS_INDEX = config.DATABASE.indexFiles.jobPaymentsIndex;

/**
 * Create a payment record for a completed job
 * @param {string} jobId
 * @param {string} employerId
 * @param {{ method?: string, notes?: string }} options
 */
export async function createPayment(jobId, employerId, options = {}) {
  return withLock(`payment:${jobId}`, async () => {
  if (!config.PAYMENTS.enabled) {
    return { ok: false, error: 'نظام المدفوعات غير مفعّل', code: 'PAYMENTS_DISABLED' };
  }

  // Verify job exists and is completed
  const { findById: findJobById } = await import('./jobs.js');
  const job = await findJobById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'completed') {
    return { ok: false, error: 'الفرصة لازم تكون منتهية عشان تنشئ سجل دفع', code: 'JOB_NOT_COMPLETED' };
  }
  if (job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تنشئ سجل دفع لهذه الفرصة', code: 'NOT_JOB_OWNER' };
  }

  // Check no duplicate payment for this job
  const existing = await listByJob(jobId);
  if (existing.length > 0) {
    return { ok: false, error: 'سجل دفع موجود بالفعل لهذه الفرصة', code: 'PAYMENT_EXISTS' };
  }

  // ── Attendance-based amount adjustment (non-blocking) ──
  let attendanceBreakdown = null;
  let adjustedTotalCost = job.totalCost;
  let adjustedPlatformFee = job.platformFee;

  try {
    const { getJobSummary } = await import('./attendance.js');
    const summary = await getJobSummary(jobId);

    if (summary && summary.totalRecords > 0) {
      const expectedWorkerDays = job.workersAccepted * job.durationDays;
      const actualWorkerDays = summary.checkedInCount; // includes checked_in + checked_out + confirmed
      const noShowDays = summary.noShowCount;

      if (expectedWorkerDays > 0) {
        const attendanceRate = Math.min(actualWorkerDays / expectedWorkerDays, 1);
        attendanceBreakdown = {
          expectedWorkerDays,
          actualWorkerDays,
          noShowDays,
          attendanceRate: Math.round(attendanceRate * 100) / 100,
        };

        if (attendanceRate < 1) {
          adjustedTotalCost = Math.round(job.totalCost * attendanceRate);
          adjustedPlatformFee = Math.round(adjustedTotalCost * (config.FINANCIALS.platformFeePercent / 100));
        }
      }
    }
  } catch (err) {
    // Non-blocking: if attendance unavailable, use full calculation
    logger.warn('Attendance data unavailable for payment', { jobId, error: err.message });
  }

  // Validate payment method
  const method = options.method || config.PAYMENTS.defaultMethod;
  if (!config.PAYMENTS.methods.includes(method)) {
    return { ok: false, error: 'طريقة الدفع غير صالحة', code: 'INVALID_PAYMENT_METHOD' };
  }

  const id = 'pay_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const amount = adjustedTotalCost;
  const platformFee = adjustedPlatformFee;
  const workerPayout = amount - platformFee;

  const payment = {
    id,
    jobId,
    employerId,
    amount,
    platformFee,
    workerPayout,
    method,
    status: 'pending',
    workersAccepted: job.workersAccepted,
    dailyWage: job.dailyWage,
    durationDays: job.durationDays,
    createdAt: now,
    confirmedAt: null,
    completedAt: null,
    disputedBy: null,
    disputeReason: null,
    disputedAt: null,
    notes: options.notes || null,
    attendanceBreakdown,
  };

  // Save payment file
  const paymentPath = getRecordPath('payments', id);
  await atomicWrite(paymentPath, payment);

  // Update job-payments index
  await addToSetIndex(JOB_PAYMENTS_INDEX, jobId, id);

  logger.info('Payment created', { paymentId: id, jobId, employerId, amount, platformFee });

  eventBus.emit('payment:created', {
    paymentId: id,
    jobId,
    employerId,
    amount,
    platformFee,
  });

  return { ok: true, payment };
  }); // end withLock
}

/**
 * Employer confirms cash payment
 * @param {string} paymentId
 * @param {string} employerId
 */
export async function confirmPayment(paymentId, employerId) {
  const payment = await findById(paymentId);
  if (!payment) {
    return { ok: false, error: 'سجل الدفع غير موجود', code: 'PAYMENT_NOT_FOUND' };
  }
  if (payment.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تأكد هذه الدفعة', code: 'NOT_PAYMENT_OWNER' };
  }
  if (payment.status !== 'pending') {
    return { ok: false, error: 'لا يمكن تأكيد هذه الدفعة — الحالة الحالية: ' + payment.status, code: 'INVALID_PAYMENT_STATUS' };
  }

  payment.status = 'employer_confirmed';
  payment.confirmedAt = new Date().toISOString();

  const paymentPath = getRecordPath('payments', paymentId);
  await atomicWrite(paymentPath, payment);

  logger.info('Payment confirmed', { paymentId, employerId });

  eventBus.emit('payment:confirmed', {
    paymentId,
    jobId: payment.jobId,
    employerId,
    amount: payment.amount,
  });

  return { ok: true, payment };
}

/**
 * Admin completes/finalizes a payment
 * Requires status: employer_confirmed OR disputed (resolve)
 * @param {string} paymentId
 */
export async function completePayment(paymentId) {
  const payment = await findById(paymentId);
  if (!payment) {
    return { ok: false, error: 'سجل الدفع غير موجود', code: 'PAYMENT_NOT_FOUND' };
  }
  if (payment.status !== 'employer_confirmed' && payment.status !== 'disputed') {
    return { ok: false, error: 'لا يمكن إنهاء هذه الدفعة — الحالة الحالية: ' + payment.status, code: 'INVALID_PAYMENT_STATUS' };
  }

  payment.status = 'completed';
  payment.completedAt = new Date().toISOString();

  const paymentPath = getRecordPath('payments', paymentId);
  await atomicWrite(paymentPath, payment);

  logger.info('Payment completed', { paymentId, jobId: payment.jobId });

  eventBus.emit('payment:completed', {
    paymentId,
    jobId: payment.jobId,
    employerId: payment.employerId,
    amount: payment.amount,
    platformFee: payment.platformFee,
  });

  return { ok: true, payment };
}

/**
 * Raise a dispute on a payment
 * @param {string} paymentId
 * @param {string} userId — employer or accepted worker
 * @param {string} reason — dispute reason (min 5 chars)
 */
export async function disputePayment(paymentId, userId, reason) {
  const payment = await findById(paymentId);
  if (!payment) {
    return { ok: false, error: 'سجل الدفع غير موجود', code: 'PAYMENT_NOT_FOUND' };
  }
  if (payment.status === 'completed') {
    return { ok: false, error: 'لا يمكن فتح نزاع على دفعة مكتملة', code: 'PAYMENT_ALREADY_COMPLETED' };
  }
  if (payment.status === 'disputed') {
    return { ok: false, error: 'تم فتح نزاع على هذه الدفعة بالفعل', code: 'ALREADY_DISPUTED' };
  }

  // Check dispute window
  const { findById: findJobById } = await import('./jobs.js');
  const job = await findJobById(payment.jobId);
  if (job && job.completedAt) {
    const completedDate = new Date(job.completedAt);
    const windowMs = config.PAYMENTS.disputeWindowDays * 24 * 60 * 60 * 1000;
    if (Date.now() - completedDate.getTime() > windowMs) {
      return { ok: false, error: 'انتهت مهلة فتح النزاع', code: 'DISPUTE_WINDOW_CLOSED' };
    }
  }

  // Check user involvement — employer or accepted worker
  let isInvolved = false;
  if (payment.employerId === userId) {
    isInvolved = true;
  } else {
    // Check if user is an accepted worker on this job
    const { listByJob: listAppsByJob } = await import('./applications.js');
    const apps = await listAppsByJob(payment.jobId);
    isInvolved = apps.some(a => a.workerId === userId && a.status === 'accepted');
  }

  if (!isInvolved) {
    return { ok: false, error: 'مش مسموحلك تفتح نزاع على هذه الدفعة', code: 'NOT_INVOLVED' };
  }

  payment.status = 'disputed';
  payment.disputedBy = userId;
  payment.disputeReason = reason;
  payment.disputedAt = new Date().toISOString();

  const paymentPath = getRecordPath('payments', paymentId);
  await atomicWrite(paymentPath, payment);

  logger.info('Payment disputed', { paymentId, userId, reason });

  eventBus.emit('payment:disputed', {
    paymentId,
    jobId: payment.jobId,
    employerId: payment.employerId,
    disputedBy: userId,
    reason,
  });

  return { ok: true, payment };
}

/**
 * Find payment by ID
 * @param {string} paymentId
 */
export async function findById(paymentId) {
  const paymentPath = getRecordPath('payments', paymentId);
  return await safeReadJSON(paymentPath);
}

/**
 * List payments for a job (index-accelerated with fallback)
 * @param {string} jobId
 */
export async function listByJob(jobId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(JOB_PAYMENTS_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const payId of indexedIds) {
      const pay = await readJSON(getRecordPath('payments', payId));
      if (pay) results.push(pay);
    }
    return results;
  }

  // Fallback: full scan
  const paymentsDir = getCollectionPath('payments');
  const all = await listJSON(paymentsDir);
  return all.filter(p => p.id && p.id.startsWith('pay_') && p.jobId === jobId);
}

/**
 * List all payments (for admin)
 */
export async function listAll() {
  const paymentsDir = getCollectionPath('payments');
  const all = await listJSON(paymentsDir);
  return all.filter(p => p.id && p.id.startsWith('pay_'));
}

/**
 * Get aggregated financial summary
 */
export async function getFinancialSummary() {
  const payments = await listAll();

  const summary = {
    totalPayments: payments.length,
    byStatus: { pending: 0, employer_confirmed: 0, completed: 0, disputed: 0 },
    totalAmount: 0,
    totalPlatformFee: 0,
    totalWorkerPayout: 0,
    completedAmount: 0,
    completedPlatformFee: 0,
    completedWorkerPayout: 0,
    pendingAmount: 0,
    pendingPlatformFee: 0,
    disputedCount: 0,
  };

  for (const pay of payments) {
    // Status counts
    if (summary.byStatus[pay.status] !== undefined) {
      summary.byStatus[pay.status]++;
    }

    // Totals
    summary.totalAmount += pay.amount || 0;
    summary.totalPlatformFee += pay.platformFee || 0;
    summary.totalWorkerPayout += pay.workerPayout || 0;

    // Completed money
    if (pay.status === 'completed') {
      summary.completedAmount += pay.amount || 0;
      summary.completedPlatformFee += pay.platformFee || 0;
      summary.completedWorkerPayout += pay.workerPayout || 0;
    }

    // Pending money (pending + employer_confirmed)
    if (pay.status === 'pending' || pay.status === 'employer_confirmed') {
      summary.pendingAmount += pay.amount || 0;
      summary.pendingPlatformFee += pay.platformFee || 0;
    }

    // Disputed
    if (pay.status === 'disputed') {
      summary.disputedCount++;
    }
  }

  return summary;
}

/**
 * Count payments by status
 */
export async function countByStatus() {
  const payments = await listAll();
  const counts = { pending: 0, employer_confirmed: 0, completed: 0, disputed: 0, total: payments.length };
  for (const pay of payments) {
    if (counts[pay.status] !== undefined) counts[pay.status]++;
  }
  return counts;
}
```

---

## `server/services/profileCompleteness.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/profileCompleteness.js — Profile Completeness Score
// ═══════════════════════════════════════════════════════════════
// Pure function — zero I/O, zero async, zero database access.
// Weights: name(20) + governorate(20) + categories(20) + location(15) + verification(15) + terms(10) = 100
// ═══════════════════════════════════════════════════════════════

const FIELD_LABELS = {
  name: 'الاسم',
  governorate: 'المحافظة',
  categories: 'التخصصات',
  location: 'الموقع الجغرافي',
  verification: 'التحقق من الهوية',
  terms: 'قبول الشروط والأحكام',
};

/**
 * Calculate profile completeness score.
 * Pure sync function — no I/O, no imports needed beyond this file.
 *
 * @param {object} user — user object from database
 * @returns {{ score: number, missing: string[], complete: boolean }}
 *   score: 0–100 integer
 *   missing: array of field keys that are incomplete
 *   complete: true if score >= 100
 */
export function calculateCompleteness(user) {
  if (!user) return { score: 0, missing: Object.keys(FIELD_LABELS), complete: false };

  const missing = [];
  let score = 0;

  // Name (20%)
  if (user.name && typeof user.name === 'string' && user.name.trim().length >= 2) {
    score += 20;
  } else {
    missing.push('name');
  }

  // Governorate (20%)
  if (user.governorate && typeof user.governorate === 'string' && user.governorate.trim().length > 0) {
    score += 20;
  } else {
    missing.push('governorate');
  }

  // Categories (20%) — workers need at least one, employers always pass
  if (user.role === 'employer') {
    score += 20;
  } else if (user.categories && Array.isArray(user.categories) && user.categories.length > 0) {
    score += 20;
  } else {
    missing.push('categories');
  }

  // Location — lat/lng (15%)
  if (typeof user.lat === 'number' && typeof user.lng === 'number') {
    score += 15;
  } else {
    missing.push('location');
  }

  // Verification (15%)
  if (user.verificationStatus === 'verified') {
    score += 15;
  } else {
    missing.push('verification');
  }

  // Terms accepted (10%)
  if (user.termsAcceptedAt) {
    score += 10;
  } else {
    missing.push('terms');
  }

  return {
    score,
    missing,
    complete: score >= 100,
  };
}

/**
 * Get Arabic label for a field key.
 * Used by frontend to display human-readable missing field names.
 * @param {string} fieldKey
 * @returns {string}
 */
export function getFieldLabel(fieldKey) {
  return FIELD_LABELS[fieldKey] || fieldKey;
}
```

---

## `server/services/ratings.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/ratings.js — Bidirectional Rating System
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath } from './database.js';
import { findById as findJobById } from './jobs.js';
import { findById as findUserById, update as updateUser } from './users.js';
import { listByJob as listApplicationsByJob } from './applications.js';
import { eventBus } from './eventBus.js';

/**
 * Check if a user is an accepted worker for a specific job
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isAcceptedWorker(jobId, userId) {
  const applications = await listApplicationsByJob(jobId);
  return applications.some(app => app.workerId === userId && app.status === 'accepted');
}

/**
 * Recalculate and persist user aggregate rating
 * Full recalculation from all ratings — not incremental — to avoid drift
 * @param {string} userId
 */
async function recalculateUserRating(userId) {
  const summary = await getUserRatingSummary(userId);
  await updateUser(userId, {
    rating: { avg: summary.avg, count: summary.count },
  });
}

/**
 * Submit a rating for a completed job
 * @param {string} jobId
 * @param {string} fromUserId
 * @param {{ toUserId: string, stars: number, comment?: string }} data
 * @returns {Promise<{ ok: boolean, rating?: object, error?: string, code?: string }>}
 */
export async function submitRating(jobId, fromUserId, { toUserId, stars, comment }) {
  // Rule 1: RATINGS_ENABLED
  if (!config.RATINGS.enabled) {
    return { ok: false, error: 'نظام التقييم غير مفعّل', code: 'RATINGS_DISABLED' };
  }

  // Rule 2: VALID_STARS
  if (typeof stars !== 'number' || !Number.isFinite(stars) || stars < 1 || stars > config.RATINGS.maxStars) {
    return { ok: false, error: `التقييم لازم يكون رقم بين 1 و ${config.RATINGS.maxStars}`, code: 'INVALID_STARS' };
  }

  // Ensure stars is an integer
  stars = Math.floor(stars);

  // Rule 3: VALID_COMMENT
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== 'string') {
      return { ok: false, error: 'التعليق لازم يكون نص', code: 'INVALID_COMMENT' };
    }
    if (comment.length > config.VALIDATION.descriptionMaxLength) {
      return { ok: false, error: `التعليق لازم يكون أقل من ${config.VALIDATION.descriptionMaxLength} حرف`, code: 'COMMENT_TOO_LONG' };
    }
  }

  // Rule 4: NO_SELF_RATING
  if (fromUserId === toUserId) {
    return { ok: false, error: 'مش ممكن تقيّم نفسك', code: 'CANNOT_RATE_SELF' };
  }

  // Rule 5: JOB_EXISTS_AND_COMPLETED
  const job = await findJobById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'completed') {
    return { ok: false, error: 'الفرصة لازم تكون مكتملة عشان تقدر تقيّم', code: 'JOB_NOT_COMPLETED' };
  }

  // Rule 6: USERS_EXIST
  const fromUser = await findUserById(fromUserId);
  if (!fromUser) {
    return { ok: false, error: 'المستخدم المُقيِّم غير موجود', code: 'USER_NOT_FOUND' };
  }
  const toUser = await findUserById(toUserId);
  if (!toUser) {
    return { ok: false, error: 'المستخدم المُقيَّم غير موجود', code: 'USER_NOT_FOUND' };
  }

  // Direction Permission Rules
  if (fromUser.role === 'worker' && !config.RATINGS.canWorkerRateEmployer) {
    return { ok: false, error: 'غير مسموح للعامل بتقييم صاحب العمل', code: 'WORKER_CANNOT_RATE' };
  }
  if (fromUser.role === 'employer' && !config.RATINGS.canEmployerRateWorker) {
    return { ok: false, error: 'غير مسموح لصاحب العمل بتقييم العامل', code: 'EMPLOYER_CANNOT_RATE' };
  }

  // Rule 7: FROM_USER_INVOLVED
  const isFromEmployer = job.employerId === fromUserId;
  const isFromAcceptedWorker = await isAcceptedWorker(jobId, fromUserId);
  if (!isFromEmployer && !isFromAcceptedWorker) {
    return { ok: false, error: 'أنت مش مشارك في هذه الفرصة', code: 'NOT_INVOLVED' };
  }

  // Rule 8: TO_USER_INVOLVED
  const isToEmployer = job.employerId === toUserId;
  const isToAcceptedWorker = await isAcceptedWorker(jobId, toUserId);
  if (!isToEmployer && !isToAcceptedWorker) {
    return { ok: false, error: 'المستخدم المُقيَّم مش مشارك في هذه الفرصة', code: 'TARGET_NOT_INVOLVED' };
  }

  // Rule 9: NO_DUPLICATE
  const existing = await findByJobAndUsers(jobId, fromUserId, toUserId);
  if (existing) {
    return { ok: false, error: 'أنت قيّمت هذا المستخدم في هذه الفرصة بالفعل', code: 'ALREADY_RATED' };
  }

  // ── Create rating ──
  const id = 'rtg_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const rating = {
    id,
    jobId,
    fromUserId,
    toUserId,
    fromRole: fromUser.role,
    toRole: toUser.role,
    stars,
    comment: (comment && typeof comment === 'string') ? comment : null,
    createdAt: now,
  };

  const ratingPath = getRecordPath('ratings', id);
  await atomicWrite(ratingPath, rating);

  // Update target user aggregate rating
  await recalculateUserRating(toUserId);

  // Emit event
  eventBus.emit('rating:submitted', {
    ratingId: id,
    jobId,
    fromUserId,
    toUserId,
    stars,
    jobTitle: job.title,
  });

  return { ok: true, rating };
}

/**
 * Find a rating by (jobId, fromUserId, toUserId) — duplicate check
 * @returns {Promise<object|null>}
 */
export async function findByJobAndUsers(jobId, fromUserId, toUserId) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);
  return all.find(r => r.jobId === jobId && r.fromUserId === fromUserId && r.toUserId === toUserId) || null;
}

/**
 * List all ratings for a job (newest first)
 * @param {string} jobId
 * @returns {Promise<object[]>}
 */
export async function listByJob(jobId) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);
  return all
    .filter(r => r.jobId === jobId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * List ratings received by a user (paginated, newest first)
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
export async function listByUser(userId, { limit = 20, offset = 0 } = {}) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);

  const userRatings = all
    .filter(r => r.toUserId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = userRatings.length;
  const items = userRatings.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

/**
 * Get rating summary for a user (avg, count, distribution)
 * @param {string} userId
 * @returns {Promise<{ avg: number, count: number, distribution: object }>}
 */
export async function getUserRatingSummary(userId) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);

  const userRatings = all.filter(r => r.toUserId === userId);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  for (const r of userRatings) {
    sum += r.stars;
    if (distribution[r.stars] !== undefined) {
      distribution[r.stars]++;
    }
  }

  const count = userRatings.length;
  const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

  return { avg, count, distribution };
}

/**
 * Get pending ratings for a user (completed jobs they haven't rated yet)
 * Returns max 3 items to avoid overwhelming the user
 * @param {string} userId
 * @returns {Promise<Array<{ jobId: string, jobTitle: string, targetUserId: string, targetRole: string }>>}
 */
export async function getPendingRatings(userId) {
  const pending = [];
  const MAX_PENDING = 3;

  try {
    const { findById: findUserById } = await import('./users.js');
    const user = await findUserById(userId);
    if (!user) return [];

    if (user.role === 'worker') {
      // Worker: find completed jobs where accepted, haven't rated employer
      const { listByWorker } = await import('./applications.js');
      const apps = await listByWorker(userId);
      const acceptedApps = apps.filter(a => a.status === 'accepted');

      for (const app of acceptedApps) {
        if (pending.length >= MAX_PENDING) break;
        const job = await findJobById(app.jobId);
        if (!job || job.status !== 'completed') continue;

        // Check if already rated employer for this job
        const existing = await findByJobAndUsers(app.jobId, userId, job.employerId);
        if (existing) continue;

        pending.push({
          jobId: job.id,
          jobTitle: job.title,
          targetUserId: job.employerId,
          targetRole: 'employer',
        });
      }
    } else if (user.role === 'employer') {
      // Employer: find own completed jobs, check if rated accepted workers
      const { getFromSetIndex, readJSON: readJSONFn, getRecordPath: getRecordPathFn } = await import('./database.js');
      const employerJobIds = await getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, userId);

      for (const jobId of employerJobIds) {
        if (pending.length >= MAX_PENDING) break;
        const job = await readJSONFn(getRecordPathFn('jobs', jobId));
        if (!job || job.status !== 'completed') continue;

        // Get accepted workers
        const jobApps = await listApplicationsByJob(jobId);
        const acceptedWorkers = jobApps.filter(a => a.status === 'accepted');

        for (const app of acceptedWorkers) {
          if (pending.length >= MAX_PENDING) break;
          const existing = await findByJobAndUsers(jobId, userId, app.workerId);
          if (existing) continue;

          pending.push({
            jobId: job.id,
            jobTitle: job.title,
            targetUserId: app.workerId,
            targetRole: 'worker',
          });
          break; // One per job for employers
        }
      }
    }
  } catch (err) {
    // Non-blocking — return empty on error
  }

  return pending;
}
```

---

## `server/services/reports.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/reports.js — User Reporting System
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { eventBus } from './eventBus.js';

const TARGET_INDEX = config.DATABASE.indexFiles.targetReportsIndex;
const REPORTER_INDEX = config.DATABASE.indexFiles.reporterReportsIndex;

/**
 * Create a new report
 * @param {string} reporterId
 * @param {string} targetId
 * @param {{ type: string, reason: string, jobId?: string }} fields
 * @returns {Promise<{ ok: boolean, report?: object, code?: string, error?: string }>}
 */
export async function createReport(reporterId, targetId, { type, reason, jobId }) {
  // Feature flag
  if (!config.REPORTS.enabled) {
    return { ok: false, error: 'نظام البلاغات غير مفعّل', code: 'REPORTS_DISABLED' };
  }

  // Cannot report self
  if (reporterId === targetId) {
    return { ok: false, error: 'لا يمكنك الإبلاغ عن نفسك', code: 'CANNOT_REPORT_SELF' };
  }

  // Validate type
  if (!type || !config.REPORTS.types.includes(type)) {
    return { ok: false, error: 'نوع البلاغ غير صحيح', code: 'INVALID_REPORT_TYPE' };
  }

  // Validate reason
  if (!reason || typeof reason !== 'string') {
    return { ok: false, error: 'سبب البلاغ مطلوب', code: 'REASON_REQUIRED' };
  }
  if (reason.length < config.REPORTS.minReasonLength) {
    return { ok: false, error: `سبب البلاغ لازم يكون ${config.REPORTS.minReasonLength} حروف على الأقل`, code: 'REASON_TOO_SHORT' };
  }
  if (reason.length > config.REPORTS.maxReasonLength) {
    return { ok: false, error: `سبب البلاغ لا يتجاوز ${config.REPORTS.maxReasonLength} حرف`, code: 'REASON_TOO_LONG' };
  }

  // Validate target exists
  const { findById } = await import('./users.js');
  const targetUser = await findById(targetId);
  if (!targetUser) {
    return { ok: false, error: 'المستخدم المُبلَّغ عنه غير موجود', code: 'TARGET_NOT_FOUND' };
  }

  // Daily limit check (non-blocking on failure)
  try {
    const todayCount = await countTodayByReporter(reporterId);
    if (todayCount >= config.REPORTS.maxReportsPerUserPerDay) {
      return { ok: false, error: 'تجاوزت الحد اليومي للبلاغات', code: 'DAILY_REPORT_LIMIT' };
    }
  } catch (_) {
    // Non-blocking — allow on count failure
  }

  // Duplicate check (same reporter + same target + same jobId)
  if (jobId) {
    const existingReports = await listByTarget(targetId);
    const duplicate = existingReports.find(
      r => r.reporterId === reporterId && r.targetId === targetId && r.jobId === jobId
    );
    if (duplicate) {
      return { ok: false, error: 'تم تقديم بلاغ مماثل مسبقاً', code: 'DUPLICATE_REPORT' };
    }
  }

  const id = 'rpt_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const report = {
    id,
    reporterId,
    targetId,
    type,
    reason,
    jobId: jobId || null,
    status: 'pending',
    adminNotes: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: now,
  };

  const reportPath = getRecordPath('reports', id);
  await atomicWrite(reportPath, report);

  // Update secondary indexes
  await addToSetIndex(TARGET_INDEX, targetId, id);
  await addToSetIndex(REPORTER_INDEX, reporterId, id);

  // Emit event (fire-and-forget notification)
  eventBus.emit('report:created', { reportId: id, reporterId, targetId, type });

  return { ok: true, report };
}

/**
 * Review a report (admin action)
 * @param {string} reportId
 * @param {{ status: string, adminNotes?: string }} fields
 * @returns {Promise<{ ok: boolean, report?: object, code?: string, error?: string }>}
 */
export async function reviewReport(reportId, { status, adminNotes }) {
  const report = await findById(reportId);
  if (!report) {
    return { ok: false, error: 'البلاغ غير موجود', code: 'REPORT_NOT_FOUND' };
  }

  const validStatuses = ['reviewed', 'action_taken', 'dismissed'];
  if (!status || !validStatuses.includes(status)) {
    return { ok: false, error: 'حالة البلاغ غير صحيحة', code: 'INVALID_REPORT_STATUS' };
  }

  const now = new Date().toISOString();
  report.status = status;
  report.adminNotes = adminNotes || null;
  report.reviewedAt = now;

  const reportPath = getRecordPath('reports', reportId);
  await atomicWrite(reportPath, report);

  // Emit event
  eventBus.emit('report:reviewed', {
    reportId,
    reporterId: report.reporterId,
    targetId: report.targetId,
    status,
  });

  // Auto-ban check (fire-and-forget)
  if (status === 'action_taken') {
    checkAutoban(report.targetId).catch(() => {});
  }

  return { ok: true, report };
}

/**
 * Find report by ID
 */
export async function findById(reportId) {
  const reportPath = getRecordPath('reports', reportId);
  return await readJSON(reportPath);
}

/**
 * List reports by target user (index-accelerated with fallback)
 */
export async function listByTarget(targetId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(TARGET_INDEX, targetId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const rptId of indexedIds) {
      const rpt = await readJSON(getRecordPath('reports', rptId));
      if (rpt) results.push(rpt);
    }
    return results;
  }

  // Fallback: full scan
  const reportsDir = getCollectionPath('reports');
  const allReports = await listJSON(reportsDir);
  return allReports.filter(r => r.id && r.id.startsWith('rpt_') && r.targetId === targetId);
}

/**
 * List pending reports (admin — sorted newest first)
 */
export async function listPending() {
  const reportsDir = getCollectionPath('reports');
  const allReports = await listJSON(reportsDir);
  return allReports
    .filter(r => r.id && r.id.startsWith('rpt_') && r.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * List all reports (admin — sorted newest first)
 */
export async function listAll() {
  const reportsDir = getCollectionPath('reports');
  const allReports = await listJSON(reportsDir);
  return allReports
    .filter(r => r.id && r.id.startsWith('rpt_'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Count action_taken reports against a target user
 */
export async function countActionTakenAgainst(targetId) {
  const reports = await listByTarget(targetId);
  return reports.filter(r => r.status === 'action_taken').length;
}

/**
 * Count reports submitted by a reporter today (Egypt midnight reset)
 */
export async function countTodayByReporter(reporterId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(REPORTER_INDEX, reporterId);
  let reporterReports;

  if (indexedIds.length > 0) {
    const results = [];
    for (const rptId of indexedIds) {
      const rpt = await readJSON(getRecordPath('reports', rptId));
      if (rpt) results.push(rpt);
    }
    reporterReports = results;
  } else {
    // Fallback: full scan
    const reportsDir = getCollectionPath('reports');
    const allReports = await listJSON(reportsDir);
    reporterReports = allReports.filter(r => r.id && r.id.startsWith('rpt_') && r.reporterId === reporterId);
  }

  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  return reporterReports.filter(r => new Date(r.createdAt) >= todayMidnight).length;
}

/**
 * Auto-ban check — fires when action_taken count reaches threshold
 * Fire-and-forget — must not break the review flow
 */
async function checkAutoban(targetId) {
  try {
    const count = await countActionTakenAgainst(targetId);
    if (count >= config.REPORTS.autobanThreshold) {
      const { banUser } = await import('./users.js');
      await banUser(targetId, `تم الحظر تلقائياً — ${count} بلاغات مؤكدة`);
      eventBus.emit('report:autoban', { targetId, reportCount: count });
    }
  } catch (_) {
    // Fire-and-forget
  }
}
```

---

## `server/services/resourceLock.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/resourceLock.js — In-Memory Mutex per Resource Key
// ═══════════════════════════════════════════════════════════════

/**
 * In-memory mutex map: key → Promise chain
 * Same key → serialized (waits for previous)
 * Different keys → fully concurrent
 * Lock released on success OR error (finally block)
 * Auto-cleanup after last operation per key
 * No deadlock risk (no nested locks on same key)
 * In-memory only — server restart clears all locks
 */
const locks = new Map();

/**
 * Execute fn() with exclusive access to the given resource key.
 * Concurrent calls with the SAME key are serialized.
 * Calls with DIFFERENT keys run concurrently.
 *
 * @param {string} key — resource identifier (e.g. 'apply:job_abc:usr_xyz')
 * @param {Function} fn — async function to execute under lock
 * @returns {Promise<*>} — result of fn()
 */
export function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();

  let releaseLock;
  const current = new Promise((resolve) => {
    releaseLock = resolve;
  });

  // Chain: wait for previous → run fn → release
  const execution = prev.then(async () => {
    try {
      return await fn();
    } finally {
      // Auto-cleanup: if this is still the current promise for this key, remove it
      if (locks.get(key) === current) {
        locks.delete(key);
      }
      releaseLock();
    }
  });

  // Store the release promise (not the execution) as the chain link
  locks.set(key, current);

  return execution;
}

/**
 * Get count of active lock keys (for monitoring/testing)
 * @returns {number}
 */
export function getLockCount() {
  return locks.size;
}

/**
 * Clear all locks (testing only)
 */
export function clearLocks() {
  locks.clear();
}
```

---

## `server/services/sanitizer.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/sanitizer.js — Input Sanitization Service
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Strip all HTML tags from a string
 * @param {*} text
 * @returns {*} cleaned string or original value if not a string
 */
export function stripHtml(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a text value — strip HTML tags + trim
 * Respects config.SECURITY.sanitizeInput flag
 * @param {*} text
 * @returns {*} sanitized string or original value if not a string
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  if (!config.SECURITY.sanitizeInput) return text;
  return stripHtml(text).trim();
}

/**
 * Sanitize specific fields in an object (shallow copy)
 * @param {object} obj - the object to sanitize
 * @param {string[]} keys - field names to sanitize
 * @returns {object} new object with sanitized fields
 */
export function sanitizeFields(obj, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const key of keys) {
    if (typeof result[key] === 'string') {
      result[key] = sanitizeText(result[key]);
    }
  }
  return result;
}
```

---

## `server/services/searchIndex.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/searchIndex.js — In-Memory Job Search Index
// ═══════════════════════════════════════════════════════════════
// Pre-normalized keyword index for fast text search.
// Build on startup, incremental updates via EventBus.
// Returns jobId[] — caller fetches full records.
// ~200 bytes per job → 10K jobs ≈ 2MB.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { normalizeArabic } from './arabicNormalizer.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

/**
 * @type {Map<string, { normalizedTitle: string, normalizedDesc: string, status: string, category: string, governorate: string, dailyWage: number, createdAt: string }>}
 */
const index = new Map();

/** @type {string|null} */
let lastBuilt = null;

/**
 * Check if search index is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return !!(config.SEARCH_INDEX && config.SEARCH_INDEX.enabled);
}

/**
 * Build (or rebuild) the entire search index from disk.
 * Async — reads all job files.
 * Called at startup and periodically as a safety net.
 *
 * @returns {Promise<number>} number of jobs indexed
 */
export async function buildIndex() {
  if (!isEnabled()) return 0;

  const { listAll } = await import('./jobs.js');
  const allJobs = await listAll();

  index.clear();

  for (const job of allJobs) {
    indexJob(job);
  }

  lastBuilt = new Date().toISOString();
  logger.info('Search index built', { size: index.size });

  return index.size;
}

/**
 * Add or update a single job in the index (sync).
 * Called after job creation.
 *
 * @param {object} job — full job object
 */
export function addToIndex(job) {
  if (!isEnabled()) return;
  if (!job || !job.id) return;
  indexJob(job);
}

/**
 * Remove a job from the index (sync).
 *
 * @param {string} jobId
 */
export function removeFromIndex(jobId) {
  if (!isEnabled()) return;
  index.delete(jobId);
}

/**
 * Update the status field of a job in the index (sync).
 *
 * @param {string} jobId
 * @param {string} status
 */
export function updateStatus(jobId, status) {
  if (!isEnabled()) return;
  const entry = index.get(jobId);
  if (entry) {
    entry.status = status;
  }
}

/**
 * Search the index for jobs matching a normalized query string.
 * Matches against normalizedTitle + normalizedDesc via includes().
 *
 * @param {string} normalizedQuery — pre-normalized search string
 * @param {{ status?: string, category?: string, governorate?: string }} filters
 * @returns {string[]} array of matching job IDs
 */
export function search(normalizedQuery, filters = {}) {
  if (!isEnabled()) return [];
  if (!normalizedQuery) return [];

  const results = [];

  for (const [jobId, entry] of index) {
    // Apply filters
    if (filters.status && entry.status !== filters.status) continue;
    if (filters.category && entry.category !== filters.category) continue;
    if (filters.governorate && entry.governorate !== filters.governorate) continue;

    // Text match
    if (entry.normalizedTitle.includes(normalizedQuery) ||
        entry.normalizedDesc.includes(normalizedQuery)) {
      results.push(jobId);
    }
  }

  return results;
}

/**
 * Get index statistics (sync).
 *
 * @returns {{ size: number, lastBuilt: string|null }}
 */
export function getStats() {
  return {
    size: index.size,
    lastBuilt,
  };
}

// ── Internal helper ──────────────────────────────────────────

/**
 * Index a single job (sync — normalizes once, stores in Map)
 * @param {object} job
 */
function indexJob(job) {
  index.set(job.id, {
    normalizedTitle: normalizeArabic((job.title || '').toLowerCase()),
    normalizedDesc: normalizeArabic((job.description || '').toLowerCase()),
    status: job.status,
    category: job.category,
    governorate: job.governorate,
    dailyWage: job.dailyWage,
    createdAt: job.createdAt,
  });
}

// ── EventBus integration ─────────────────────────────────────

if (isEnabled()) {
  eventBus.on('job:created', (data) => {
    if (!data || !data.jobId) return;
    // Fire-and-forget: load job and add to index
    import('./jobs.js').then(({ findById }) => {
      findById(data.jobId).then(job => {
        if (job) addToIndex(job);
      }).catch(() => {});
    }).catch(() => {});
  });
}
```

---

## `server/services/sessions.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/sessions.js — Session CRUD (file-based)
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, safeReadJSON, deleteJSON, listJSON, getRecordPath, getCollectionPath } from './database.js';

/**
 * Create a new session
 */
export async function createSession(userId, role, metadata) {
  const token = 'ses_' + crypto.randomBytes(16).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.SESSIONS.ttlDays * 24 * 60 * 60 * 1000);

  const session = {
    token,
    userId,
    role,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Add metadata if tracking is enabled and metadata is provided
  if (config.SESSIONS.trackMetadata && metadata) {
    session.ip = metadata.ip || null;
    session.userAgent = metadata.userAgent || null;
  }

  const sessionPath = getRecordPath('sessions', token);
  await atomicWrite(sessionPath, session);

  return session;
}

/**
 * Rotate a session token — creates new session, destroys old.
 * New session is created FIRST to prevent auth failure window.
 * Graceful: if oldToken doesn't exist, just creates new.
 * @param {string} oldToken
 * @param {string} userId
 * @param {string} role
 * @param {object} [metadata] — { ip, userAgent }
 * @returns {Promise<object>} new session
 */
export async function rotateSession(oldToken, userId, role, metadata) {
  // Create new session first (no auth gap)
  const newSession = await createSession(userId, role, metadata);

  // Destroy old session (fire-and-forget)
  if (oldToken) {
    await destroySession(oldToken).catch(() => {});
  }

  return newSession;
}

/**
 * Verify a session token
 * @returns {object|null} session data or null if invalid/expired
 */
export async function verifySession(token) {
  if (!token || typeof token !== 'string') return null;

  const sessionPath = getRecordPath('sessions', token);
  const session = await safeReadJSON(sessionPath);

  if (!session) return null;

  // Check expiry
  if (new Date() > new Date(session.expiresAt)) {
    await deleteJSON(sessionPath);
    return null;
  }

  return session;
}

/**
 * Destroy a session
 */
export async function destroySession(token) {
  const sessionPath = getRecordPath('sessions', token);
  return await deleteJSON(sessionPath);
}

/**
 * Clean up expired sessions
 * Uses batch processing with event loop yielding to avoid blocking
 */
export async function cleanExpired() {
  const sessionsDir = getCollectionPath('sessions');

  let files;
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(sessionsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp') && f.startsWith('ses_'));
  let cleaned = 0;
  const now = new Date();
  const BATCH_SIZE = 100;
  const { join: joinPath } = await import('node:path');

  for (let i = 0; i < jsonFiles.length; i++) {
    const session = await readJSON(joinPath(sessionsDir, jsonFiles[i]));
    if (session && now > new Date(session.expiresAt)) {
      const sessionPath = getRecordPath('sessions', session.token);
      await deleteJSON(sessionPath);
      cleaned++;
    }
    // Yield to event loop every BATCH_SIZE files
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return cleaned;
}

/**
 * Destroy all sessions for a specific user
 * @param {string} userId
 * @returns {Promise<number>} count of destroyed sessions
 */
export async function destroyAllByUser(userId) {
  const sessionsDir = getCollectionPath('sessions');
  const sessions = await listJSON(sessionsDir);
  let destroyed = 0;

  for (const session of sessions) {
    if (session.userId === userId) {
      const sessionPath = getRecordPath('sessions', session.token);
      await deleteJSON(sessionPath);
      destroyed++;
    }
  }

  return destroyed;
}
```

---

## `server/services/sseManager.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/sseManager.js — SSE Connection Manager
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

/**
 * In-memory SSE connection registry
 * Map<userId, Set<{ res, connectedAt, lastEventId }>>
 */
const connections = new Map();

/**
 * Format data as SSE message
 * @param {string} event — event name
 * @param {*} data — JSON-serializable data
 * @param {string} [id] — optional event ID
 * @returns {string}
 */
export function formatSSE(event, data, id) {
  let msg = '';
  if (id) msg += `id: ${id}\n`;
  msg += `event: ${event}\n`;
  msg += `data: ${JSON.stringify(data)}\n\n`;
  return msg;
}

/**
 * Register an SSE connection for a user
 * Enforces maxConnectionsPerUser — evicts oldest on overflow
 * @param {string} userId
 * @param {import('node:http').ServerResponse} res
 * @param {string} [lastEventId]
 */
export function addConnection(userId, res, lastEventId) {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }

  const userConns = connections.get(userId);
  const entry = { res, connectedAt: Date.now(), lastEventId: lastEventId || null };

  // Enforce max connections per user — evict oldest
  const maxConns = config.SSE.maxConnectionsPerUser;
  if (userConns.size >= maxConns) {
    // Find oldest
    let oldest = null;
    for (const conn of userConns) {
      if (!oldest || conn.connectedAt < oldest.connectedAt) {
        oldest = conn;
      }
    }
    if (oldest) {
      try { oldest.res.end(); } catch (_) { /* ignore */ }
      userConns.delete(oldest);
    }
  }

  userConns.add(entry);

  // Auto-cleanup on client disconnect
  res.on('close', () => {
    userConns.delete(entry);
    if (userConns.size === 0) {
      connections.delete(userId);
    }
  });
}

/**
 * Send SSE event to all connections of a specific user
 * @param {string} userId
 * @param {string} eventType
 * @param {*} data
 * @param {string} [eventId]
 */
export function sendToUser(userId, eventType, data, eventId) {
  const userConns = connections.get(userId);
  if (!userConns || userConns.size === 0) {
    // Still buffer the event even if no active connections (for replay on reconnect)
    if (eventId) {
      try {
        import('./eventReplayBuffer.js').then(({ addEvent }) => {
          addEvent(userId, eventId, eventType, data);
        }).catch(() => {});
      } catch (_) { /* non-fatal */ }
    }
    return;
  }

  const msg = formatSSE(eventType, data, eventId);

  for (const conn of userConns) {
    try {
      if (!conn.res.writableEnded && !conn.res.destroyed) {
        conn.res.write(msg);
      }
    } catch (_) {
      // Ignore write errors on dead connections
    }
  }

  // Buffer event for replay on reconnect (fire-and-forget)
  if (eventId) {
    try {
      import('./eventReplayBuffer.js').then(({ addEvent }) => {
        addEvent(userId, eventId, eventType, data);
      }).catch(() => {});
    } catch (_) { /* non-fatal */ }
  }
}

/**
 * Broadcast SSE event to ALL connected users
 * @param {string} eventType
 * @param {*} data
 * @param {string} [eventId]
 */
export function broadcast(eventType, data, eventId) {
  const msg = formatSSE(eventType, data, eventId);

  for (const [, userConns] of connections) {
    for (const conn of userConns) {
      try {
        if (!conn.res.writableEnded && !conn.res.destroyed) {
          conn.res.write(msg);
        }
      } catch (_) {
        // Ignore write errors
      }
    }
  }
}

/**
 * Send heartbeat comment to all connections (keeps connections alive)
 */
export function sendHeartbeat() {
  const comment = `: heartbeat\n\n`;

  for (const [, userConns] of connections) {
    for (const conn of userConns) {
      try {
        if (!conn.res.writableEnded && !conn.res.destroyed) {
          conn.res.write(comment);
        }
      } catch (_) {
        // Ignore write errors
      }
    }
  }
}

/**
 * Get connection stats
 * @returns {{ totalUsers: number, totalConnections: number }}
 */
export function getStats() {
  let totalConnections = 0;
  for (const [, userConns] of connections) {
    totalConnections += userConns.size;
  }
  return { totalUsers: connections.size, totalConnections };
}

/**
 * Disconnect all connections for a user (e.g., on ban)
 * @param {string} userId
 */
export function disconnectUser(userId) {
  const userConns = connections.get(userId);
  if (!userConns) return;

  for (const conn of userConns) {
    try { conn.res.end(); } catch (_) { /* ignore */ }
  }

  connections.delete(userId);
}

/**
 * Remove dead connections (writableEnded or destroyed)
 */
export function cleanupDeadConnections() {
  for (const [userId, userConns] of connections) {
    for (const conn of userConns) {
      if (conn.res.writableEnded || conn.res.destroyed) {
        userConns.delete(conn);
      }
    }
    if (userConns.size === 0) {
      connections.delete(userId);
    }
  }
}

// ── Timers (unref'd — don't prevent process exit) ────────────

let heartbeatTimer = null;
let cleanupTimer = null;

if (config.SSE.enabled) {
  heartbeatTimer = setInterval(() => {
    sendHeartbeat();
  }, config.SSE.heartbeatIntervalMs);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  cleanupTimer = setInterval(() => {
    cleanupDeadConnections();
  }, config.SSE.cleanupIntervalMs);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

// ── Export connections Map for testing ────────────────────────

export const _connections = connections;
```

---

## `server/services/trust.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/trust.js — Trust Score System
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Calculate trust score — pure function, no I/O
 * @param {{ ratingAvg: number, ratingCount: number, completedJobs: number, totalAssigned: number, confirmedReports: number, totalReports: number, accountAgeDays: number }} data
 * @returns {{ score: number, components: { ratingScore: number, completionScore: number, reportScore: number, accountAgeScore: number } }}
 */
export function calculateTrustScore(data) {
  const weights = config.TRUST.weights;

  // Attendance component (0–1)
  let attendanceScore;
  if (!data.totalAttendanceRecords || data.totalAttendanceRecords === 0) {
    attendanceScore = 0.5; // neutral
  } else {
    attendanceScore = (data.attendedDays || 0) / data.totalAttendanceRecords;
  }

  // Rating component (0–1)
  let ratingScore;
  if (data.ratingCount === 0) {
    ratingScore = 0.5; // neutral
  } else {
    ratingScore = data.ratingAvg / 5;
  }

  // Completion rate component (0–1)
  let completionScore;
  if (data.totalAssigned === 0) {
    completionScore = 0.5; // neutral
  } else {
    completionScore = data.completedJobs / data.totalAssigned;
  }

  // Report penalty component (0–1, where 1 = no reports)
  let reportScore;
  if (data.totalReports === 0) {
    reportScore = 1.0; // no penalty
  } else {
    reportScore = 1 - (data.confirmedReports / data.totalReports);
  }

  // Account age component (0–1, capped at accountAgeCap days)
  const cappedAge = Math.min(data.accountAgeDays, config.TRUST.accountAgeCap);
  const accountAgeScore = cappedAge / config.TRUST.accountAgeCap;

  // Weighted composite
  let score = 
    weights.ratingAvg * ratingScore +
    weights.completionRate * completionScore +
    (weights.attendanceRate || 0) * attendanceScore +
    weights.reportScore * reportScore +
    weights.accountAge * accountAgeScore;

  // Clamp to 0.0–1.0
  score = Math.max(0, Math.min(1, score));

  // Round to 2 decimal places
  score = Math.round(score * 100) / 100;

  return {
    score,
    components: {
      ratingScore: Math.round(ratingScore * 100) / 100,
      completionScore: Math.round(completionScore * 100) / 100,
      attendanceScore: Math.round(attendanceScore * 100) / 100,
      reportScore: Math.round(reportScore * 100) / 100,
      accountAgeScore: Math.round(accountAgeScore * 100) / 100,
    },
  };
}

/**
 * Get trust score for a user — gathers data from multiple services
 * @param {string} userId
 * @returns {Promise<{ score: number, components: object } | null>}
 */
export async function getUserTrustScore(userId) {
  // Dynamic imports to avoid circular dependencies
  const { findById } = await import('./users.js');
  const user = await findById(userId);
  if (!user) return null;

  // Gather rating data
  const ratingAvg = user.rating ? user.rating.avg : 0;
  const ratingCount = user.rating ? user.rating.count : 0;

  // Gather completion data
  let completedJobs = 0;
  let totalAssigned = 0;

  if (user.role === 'worker') {
    const { listByWorker } = await import('./applications.js');
    const apps = await listByWorker(userId);
    const acceptedApps = apps.filter(a => a.status === 'accepted');
    totalAssigned = acceptedApps.length;

    // Count how many of those jobs are completed
    const { findById: findJobById } = await import('./jobs.js');
    for (const app of acceptedApps) {
      const job = await findJobById(app.jobId);
      if (job && job.status === 'completed') {
        completedJobs++;
      }
    }
  } else if (user.role === 'employer') {
    // For employers, count their own jobs
    const { getFromSetIndex, readJSON: readJSONFn, getRecordPath: getRecordPathFn } = await import('./database.js');
    const employerJobIds = await getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, userId);
    totalAssigned = employerJobIds.length;
    for (const jobId of employerJobIds) {
      const job = await readJSONFn(getRecordPathFn('jobs', jobId));
      if (job && job.status === 'completed') {
        completedJobs++;
      }
    }
  }

  // Gather attendance data (workers only)
  let totalAttendanceRecords = 0;
  let attendedDays = 0;

  if (user.role === 'worker') {
    try {
      const { listByWorker: listAttendanceByWorker } = await import('./attendance.js');
      const attendanceRecords = await listAttendanceByWorker(userId);
      totalAttendanceRecords = attendanceRecords.length;
      attendedDays = attendanceRecords.filter(r =>
        r.status === 'checked_in' || r.status === 'checked_out' || r.status === 'confirmed'
      ).length;
    } catch (_) {
      // Non-blocking — attendance data unavailable
    }
  }

  // Gather report data
  const { listByTarget } = await import('./reports.js');
  const reports = await listByTarget(userId);
  const totalReports = reports.length;
  const confirmedReports = reports.filter(r => r.status === 'action_taken').length;

  // Account age
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)
  );

  return calculateTrustScore({
    ratingAvg,
    ratingCount,
    completedJobs,
    totalAssigned,
    confirmedReports,
    totalReports,
    accountAgeDays,
    totalAttendanceRecords,
    attendedDays,
  });
}
```

---

## `server/services/users.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/users.js — User CRUD with phone index
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, safeReadJSON, getRecordPath, readIndex, writeIndex, listJSON, getCollectionPath } from './database.js';

/**
 * Create a new user
 */
export async function create(phone, role) {
  const id = 'usr_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const user = {
    id,
    phone,
    role,
    name: '',
    governorate: '',
    categories: [],
    lat: null,
    lng: null,
    rating: { avg: 0, count: 0 },
    status: 'active',
    termsAcceptedAt: null,
    termsVersion: null,
    notificationPreferences: null,
    verificationStatus: 'unverified',
    verificationSubmittedAt: null,
    availability: {
      available: (config.WORKER_AVAILABILITY && config.WORKER_AVAILABILITY.defaultAvailable !== undefined)
        ? config.WORKER_AVAILABILITY.defaultAvailable : true,
      availableFrom: null,
      availableUntil: null,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  // Save user file
  const userPath = getRecordPath('users', id);
  await atomicWrite(userPath, user);

  // Update phone index
  const phoneIndex = await readIndex('phoneIndex');
  phoneIndex[phone] = id;
  await writeIndex('phoneIndex', phoneIndex);

  return user;
}

/**
 * Find user by phone number (via index)
 */
export async function findByPhone(phone) {
  const phoneIndex = await readIndex('phoneIndex');
  const userId = phoneIndex[phone];
  if (!userId) return null;
  return findById(userId);
}

/**
 * Find user by ID
 */
export async function findById(userId) {
  const userPath = getRecordPath('users', userId);
  return await safeReadJSON(userPath);
}

/**
 * Update user fields
 */
export async function update(userId, fields) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedUser = {
    ...user,
    ...fields,
    id: user.id,         // prevent overwrite
    phone: user.phone,   // prevent overwrite
    role: user.role,     // prevent overwrite
    createdAt: user.createdAt,  // prevent overwrite
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);

  return updatedUser;
}

/**
 * List all users
 */
export async function listAll() {
  const usersDir = getCollectionPath('users');
  const allFiles = await listJSON(usersDir);
  // Filter out the phone-index.json (it's not a user record)
  return allFiles.filter(item => item.id && item.id.startsWith('usr_'));
}

/**
 * Count users by role
 */
export async function countByRole() {
  const users = await listAll();
  const counts = { worker: 0, employer: 0, admin: 0, total: users.length };
  for (const user of users) {
    if (counts[user.role] !== undefined) counts[user.role]++;
  }
  return counts;
}

/**
 * Ban a user (set status to 'banned')
 * @param {string} userId
 * @param {string} reason
 * @returns {Promise<object|null>}
 */
export async function banUser(userId, reason = '') {
  const user = await findById(userId);
  if (!user) return null;
  if (user.role === 'admin') return null; // Cannot ban admins

  const updatedUser = {
    ...user,
    status: 'banned',
    bannedAt: new Date().toISOString(),
    banReason: reason,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}

/**
 * Unban a user (set status back to 'active')
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function unbanUser(userId) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedUser = {
    ...user,
    status: 'active',
    bannedAt: null,
    banReason: null,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}

/**
 * Accept terms of service
 * @param {string} userId
 * @param {string} version
 * @returns {Promise<object|null>}
 */
export async function acceptTerms(userId, version) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedUser = {
    ...user,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: version,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}

/**
 * Soft-delete a user account (anonymize + remove phone from index)
 * Cannot delete admin accounts.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function softDelete(userId) {
  const user = await findById(userId);
  if (!user) return null;
  if (user.role === 'admin') return null;

  const now = new Date().toISOString();
  const updatedUser = {
    ...user,
    status: 'deleted',
    name: 'مستخدم محذوف',
    phone: `deleted_${user.id}`,
    categories: [],
    lat: null,
    lng: null,
    deletedAt: now,
    updatedAt: now,
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);

  // Remove phone from index (allows reuse)
  const phoneIndex = await readIndex('phoneIndex');
  if (phoneIndex[user.phone]) {
    delete phoneIndex[user.phone];
    await writeIndex('phoneIndex', phoneIndex);
  }

  return updatedUser;
}

/**
 * Update notification preferences
 * inApp is always forced to true — cannot be disabled by user.
 * Partial updates: only provided fields change, rest preserved.
 * @param {string} userId
 * @param {{ inApp?: boolean, whatsapp?: boolean, sms?: boolean }} preferences
 * @returns {Promise<object|null>}
 */
export async function updateNotificationPreferences(userId, preferences) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedPrefs = {
    inApp: true,
    whatsapp: typeof preferences.whatsapp === 'boolean'
      ? preferences.whatsapp
      : (user.notificationPreferences?.whatsapp ?? true),
    sms: typeof preferences.sms === 'boolean'
      ? preferences.sms
      : (user.notificationPreferences?.sms ?? false),
  };

  const updatedUser = {
    ...user,
    notificationPreferences: updatedPrefs,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}
```

---

## `server/services/validators.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/validators.js — Input Validation
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const PHONE_REGEX = new RegExp(config.VALIDATION.phoneRegex);
const VALID_ROLES = config.AUTH.roles;
const GOVERNORATE_IDS = new Set(config.REGIONS.governorates.map(g => g.id));
const CATEGORY_IDS = new Set(config.LABOR_CATEGORIES.map(c => c.id));

/**
 * Validate Egyptian phone number
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'رقم الموبايل مطلوب' };
  }
  if (!PHONE_REGEX.test(phone)) {
    return { valid: false, error: 'رقم الموبايل غير صحيح. الصيغة: 01XXXXXXXXX' };
  }
  return { valid: true };
}

/**
 * Validate OTP code
 */
export function validateOtp(otp) {
  if (!otp || typeof otp !== 'string') {
    return { valid: false, error: 'كود التحقق مطلوب' };
  }
  const otpRegex = new RegExp(`^\\d{${config.AUTH.otpLength}}$`);
  if (!otpRegex.test(otp)) {
    return { valid: false, error: `كود التحقق لازم يكون ${config.AUTH.otpLength} أرقام` };
  }
  return { valid: true };
}

/**
 * Validate role
 */
export function validateRole(role) {
  if (!role || typeof role !== 'string') {
    return { valid: false, error: 'نوع المستخدم مطلوب' };
  }
  if (!VALID_ROLES.includes(role)) {
    return { valid: false, error: `نوع المستخدم غير صحيح. الأنواع المسموحة: ${VALID_ROLES.join(', ')}` };
  }
  return { valid: true };
}

/**
 * Validate governorate
 */
export function validateGovernorate(gov) {
  if (!gov || typeof gov !== 'string') {
    return { valid: false, error: 'المحافظة مطلوبة' };
  }
  if (!GOVERNORATE_IDS.has(gov)) {
    return { valid: false, error: 'المحافظة غير موجودة' };
  }
  return { valid: true };
}

/**
 * Validate category
 */
export function validateCategory(cat) {
  if (!cat || typeof cat !== 'string') {
    return { valid: false, error: 'التخصص مطلوب' };
  }
  if (!CATEGORY_IDS.has(cat)) {
    return { valid: false, error: 'التخصص غير موجود' };
  }
  return { valid: true };
}

/**
 * Validate daily wage
 */
export function validateDailyWage(wage) {
  if (wage == null || typeof wage !== 'number') {
    return { valid: false, error: 'اليومية مطلوبة ولازم تكون رقم' };
  }
  if (wage < config.FINANCIALS.minDailyWage || wage > config.FINANCIALS.maxDailyWage) {
    return { valid: false, error: `اليومية لازم تكون بين ${config.FINANCIALS.minDailyWage} و ${config.FINANCIALS.maxDailyWage} جنيه` };
  }
  return { valid: true };
}

/**
 * Validate urgency level
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateUrgency(urgency) {
  if (urgency === undefined || urgency === null) {
    return { valid: true }; // defaults to 'normal'
  }
  if (typeof urgency !== 'string') {
    return { valid: false, error: 'مستوى الاستعجال لازم يكون نص' };
  }
  if (!config.URGENCY || !config.URGENCY.levels || !config.URGENCY.levels.includes(urgency)) {
    return { valid: false, error: 'مستوى الاستعجال غير صحيح' };
  }
  return { valid: true };
}

/**
 * Validate profile fields (name, governorate, categories)
 */
export function validateProfileFields(body, role) {
  const errors = [];

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < config.VALIDATION.nameMinLength) {
      errors.push(`الاسم لازم يكون على الأقل ${config.VALIDATION.nameMinLength} حروف`);
    }
    if (typeof body.name === 'string' && body.name.trim().length > config.VALIDATION.nameMaxLength) {
      errors.push(`الاسم لازم يكون أقل من ${config.VALIDATION.nameMaxLength} حرف`);
    }
  }

  if (body.governorate !== undefined) {
    const govResult = validateGovernorate(body.governorate);
    if (!govResult.valid) errors.push(govResult.error);
  }

  if (body.categories !== undefined) {
    if (!Array.isArray(body.categories)) {
      errors.push('التخصصات لازم تكون مصفوفة');
    } else {
      for (const cat of body.categories) {
        const catResult = validateCategory(cat);
        if (!catResult.valid) errors.push(catResult.error);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Validate job creation fields
 */
export function validateJobFields(body) {
  const errors = [];

  // title
  if (!body.title || typeof body.title !== 'string') {
    errors.push('عنوان الفرصة مطلوب');
  } else if (body.title.trim().length < config.VALIDATION.titleMinLength) {
    errors.push(`العنوان لازم يكون على الأقل ${config.VALIDATION.titleMinLength} حروف`);
  } else if (body.title.trim().length > config.VALIDATION.titleMaxLength) {
    errors.push(`العنوان لازم يكون أقل من ${config.VALIDATION.titleMaxLength} حرف`);
  }

  // category
  if (!body.category) {
    errors.push('التخصص مطلوب');
  } else {
    const catResult = validateCategory(body.category);
    if (!catResult.valid) errors.push(catResult.error);
  }

  // governorate
  if (!body.governorate) {
    errors.push('المحافظة مطلوبة');
  } else {
    const govResult = validateGovernorate(body.governorate);
    if (!govResult.valid) errors.push(govResult.error);
  }

  // workersNeeded
  if (body.workersNeeded == null || typeof body.workersNeeded !== 'number') {
    errors.push('عدد العمال المطلوبين لازم يكون رقم');
  } else {
    // Integer enforcement — silently truncate decimals
    body.workersNeeded = Math.floor(body.workersNeeded);
    if (body.workersNeeded < config.JOBS.minWorkersPerJob || body.workersNeeded > config.JOBS.maxWorkersPerJob) {
      errors.push(`عدد العمال لازم يكون بين ${config.JOBS.minWorkersPerJob} و ${config.JOBS.maxWorkersPerJob}`);
    }
  }

  // dailyWage
  if (body.dailyWage == null) {
    errors.push('اليومية مطلوبة');
  } else {
    const wageResult = validateDailyWage(body.dailyWage);
    if (!wageResult.valid) errors.push(wageResult.error);
  }

  // urgency (optional — defaults to 'normal')
  if (body.urgency !== undefined && body.urgency !== null) {
    const urgencyResult = validateUrgency(body.urgency);
    if (!urgencyResult.valid) errors.push(urgencyResult.error);
  }

  const isImmediate = body.urgency === 'immediate';

  // startDate — immediate jobs skip this validation (auto-calculated)
  if (!isImmediate) {
    if (!body.startDate || typeof body.startDate !== 'string') {
      errors.push('تاريخ البدء مطلوب');
    } else {
      // Validate startDate is today or future (Egypt timezone approximation: UTC+2)
      const egyptNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const todayEgypt = egyptNow.toISOString().split('T')[0];
      if (body.startDate < todayEgypt) {
        errors.push('تاريخ البدء لازم يكون النهارده أو بعد كده');
      }
    }
  }

  // durationDays — immediate jobs default to 1 if not provided
  if (!isImmediate) {
    if (body.durationDays == null || typeof body.durationDays !== 'number') {
      errors.push('مدة العمل بالأيام مطلوبة');
    } else {
      body.durationDays = Math.floor(body.durationDays);
      if (body.durationDays < config.VALIDATION.minDurationDays || body.durationDays > config.VALIDATION.maxDurationDays) {
        errors.push(`مدة العمل لازم تكون بين ${config.VALIDATION.minDurationDays} و ${config.VALIDATION.maxDurationDays} يوم`);
      }
    }
  } else {
    // Immediate: default to 1 if missing, validate if provided
    if (body.durationDays != null && typeof body.durationDays === 'number') {
      body.durationDays = Math.floor(body.durationDays);
      if (body.durationDays < config.VALIDATION.minDurationDays || body.durationDays > config.VALIDATION.maxDurationDays) {
        errors.push(`مدة العمل لازم تكون بين ${config.VALIDATION.minDurationDays} و ${config.VALIDATION.maxDurationDays} يوم`);
      }
    }
  }

  // description (optional but validated if present)
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      errors.push('الوصف لازم يكون نص');
    } else if (body.description.length > config.VALIDATION.descriptionMaxLength) {
      errors.push(`الوصف لازم يكون أقل من ${config.VALIDATION.descriptionMaxLength} حرف`);
    }
  }

  // location (optional in Phase 1)
  if (body.location !== undefined) {
    if (typeof body.location !== 'object' || body.location === null) {
      errors.push('الموقع لازم يكون object فيه lat و lng');
    } else if (typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number') {
      errors.push('الموقع لازم يحتوي على lat و lng كأرقام');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Validate latitude (Egypt range: 22-32)
 * @param {*} lat
 * @returns {{ valid: boolean, error?: string, value?: number }}
 */
export function validateLatitude(lat) {
  if (lat === undefined || lat === null || lat === '') return { valid: true };
  const num = Number(lat);
  if (isNaN(num)) return { valid: false, error: 'خط العرض لازم يكون رقم' };
  if (num < 22 || num > 32) return { valid: false, error: 'خط العرض لازم يكون في نطاق مصر (22-32)' };
  return { valid: true, value: num };
}

/**
 * Validate longitude (Egypt range: 24-37)
 * @param {*} lng
 * @returns {{ valid: boolean, error?: string, value?: number }}
 */
export function validateLongitude(lng) {
  if (lng === undefined || lng === null || lng === '') return { valid: true };
  const num = Number(lng);
  if (isNaN(num)) return { valid: false, error: 'خط الطول لازم يكون رقم' };
  if (num < 24 || num > 37) return { valid: false, error: 'خط الطول لازم يكون في نطاق مصر (24-37)' };
  return { valid: true, value: num };
}
```

---

## `server/services/verification.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/verification.js — Identity Verification Service
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const VERIFICATION_INDEX = config.DATABASE.indexFiles.userVerificationIndex;

/**
 * Submit a verification request
 * @param {string} userId
 * @param {{ nationalIdImage: string, selfieImage?: string }} data
 * @returns {Promise<{ ok: boolean, verification?: object, error?: string, code?: string }>}
 */
export async function submitVerification(userId, { nationalIdImage, selfieImage } = {}) {
  // 1. Feature flag
  if (!config.VERIFICATION.enabled) {
    return { ok: false, error: 'خدمة التحقق غير مفعّلة حالياً', code: 'VERIFICATION_DISABLED' };
  }

  // 2. Image present
  if (!nationalIdImage || typeof nationalIdImage !== 'string') {
    return { ok: false, error: 'صورة البطاقة الشخصية مطلوبة', code: 'IMAGE_REQUIRED' };
  }

  // 3. Image size check (base64 string length approximates encoded size)
  const imageBytes = Buffer.byteLength(nationalIdImage, 'utf-8');
  if (imageBytes > config.VERIFICATION.maxImageSizeBytes) {
    return { ok: false, error: 'حجم الصورة أكبر من الحد المسموح (2MB)', code: 'IMAGE_TOO_LARGE' };
  }

  // Check selfie size too if provided
  if (selfieImage && typeof selfieImage === 'string') {
    const selfieBytes = Buffer.byteLength(selfieImage, 'utf-8');
    if (selfieBytes > config.VERIFICATION.maxImageSizeBytes) {
      return { ok: false, error: 'حجم صورة السيلفي أكبر من الحد المسموح (2MB)', code: 'IMAGE_TOO_LARGE' };
    }
  }

  // 4. User exists
  const { findById, update } = await import('./users.js');
  const user = await findById(userId);
  if (!user) {
    return { ok: false, error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' };
  }

  // 5. Not already verified
  if (user.verificationStatus === 'verified') {
    return { ok: false, error: 'تم التحقق من هويتك بالفعل', code: 'ALREADY_VERIFIED' };
  }

  // 6. Not already pending
  if (user.verificationStatus === 'pending') {
    return { ok: false, error: 'طلب التحقق قيد المراجعة بالفعل', code: 'ALREADY_PENDING' };
  }

  // 7. Rejection cooldown check
  if (user.verificationStatus === 'rejected' && user.verificationSubmittedAt) {
    const cooldownMs = config.VERIFICATION.rejectionCooldownHours * 60 * 60 * 1000;
    const submittedAt = new Date(user.verificationSubmittedAt).getTime();
    const now = Date.now();
    if (now - submittedAt < cooldownMs) {
      const hoursLeft = Math.ceil((cooldownMs - (now - submittedAt)) / (60 * 60 * 1000));
      return { ok: false, error: `يُرجى الانتظار ${hoursLeft} ساعة قبل إعادة التقديم`, code: 'COOLDOWN_ACTIVE' };
    }
  }

  // 8. Daily submission limit (non-blocking on failure)
  try {
    const todayCount = await countTodayByUser(userId);
    if (todayCount >= config.VERIFICATION.maxSubmissionsPerDay) {
      return { ok: false, error: 'وصلت للحد الأقصى لطلبات التحقق اليوم', code: 'DAILY_VERIFICATION_LIMIT' };
    }
  } catch (_) {
    // Non-blocking: allow on count failure
  }

  // 9. Create verification record
  const id = 'vrf_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const verification = {
    id,
    userId,
    nationalIdImage,
    selfieImage: selfieImage || null,
    status: 'pending',
    adminNotes: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: now,
  };

  const vrfPath = getRecordPath('verifications', id);
  await atomicWrite(vrfPath, verification);

  // Update user-verification index
  await addToSetIndex(VERIFICATION_INDEX, userId, id);

  // Update user verificationStatus
  await update(userId, {
    verificationStatus: 'pending',
    verificationSubmittedAt: now,
  });

  // Emit event
  eventBus.emit('verification:submitted', { verificationId: id, userId });

  logger.info('Verification submitted', { verificationId: id, userId });

  // Return WITHOUT image data (privacy)
  return {
    ok: true,
    verification: {
      id,
      userId,
      status: 'pending',
      createdAt: now,
    },
  };
}

/**
 * Admin reviews a verification request
 * @param {string} verificationId
 * @param {{ status: string, adminNotes?: string, reviewedBy?: string }} data
 * @returns {Promise<{ ok: boolean, verification?: object, error?: string, code?: string }>}
 */
export async function reviewVerification(verificationId, { status, adminNotes, reviewedBy } = {}) {
  // 1. Record exists
  const verification = await findById(verificationId);
  if (!verification) {
    return { ok: false, error: 'طلب التحقق غير موجود', code: 'VERIFICATION_NOT_FOUND' };
  }

  // 2. Still pending
  if (verification.status !== 'pending') {
    return { ok: false, error: 'تمت مراجعة هذا الطلب بالفعل', code: 'ALREADY_REVIEWED' };
  }

  // 3. Valid status
  if (status !== 'verified' && status !== 'rejected') {
    return { ok: false, error: 'حالة غير صالحة — يجب أن تكون verified أو rejected', code: 'INVALID_VERIFICATION_STATUS' };
  }

  // 4. Update record
  const now = new Date().toISOString();
  verification.status = status;
  verification.adminNotes = adminNotes || null;
  verification.reviewedAt = now;
  verification.reviewedBy = reviewedBy || null;

  const vrfPath = getRecordPath('verifications', verificationId);
  await atomicWrite(vrfPath, verification);

  // 5. Update user verificationStatus
  const { update } = await import('./users.js');
  await update(verification.userId, {
    verificationStatus: status,
  });

  // 6. Emit event
  eventBus.emit('verification:reviewed', {
    verificationId,
    userId: verification.userId,
    status,
  });

  logger.info('Verification reviewed', { verificationId, userId: verification.userId, status });

  // Return without image data
  return {
    ok: true,
    verification: {
      id: verification.id,
      userId: verification.userId,
      status: verification.status,
      adminNotes: verification.adminNotes,
      reviewedAt: verification.reviewedAt,
      reviewedBy: verification.reviewedBy,
      createdAt: verification.createdAt,
    },
  };
}

/**
 * Find verification by ID
 * @param {string} verificationId
 * @returns {Promise<object|null>}
 */
export async function findById(verificationId) {
  const vrfPath = getRecordPath('verifications', verificationId);
  return await readJSON(vrfPath);
}

/**
 * List verifications by user (index-accelerated, newest first)
 * Returns records WITHOUT image data (privacy)
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listByUser(userId) {
  let verifications = [];

  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(VERIFICATION_INDEX, userId);
  if (indexedIds.length > 0) {
    for (const vrfId of indexedIds) {
      const vrf = await readJSON(getRecordPath('verifications', vrfId));
      if (vrf) verifications.push(vrf);
    }
  } else {
    // Fallback: full scan
    const vrfDir = getCollectionPath('verifications');
    const allRecords = await listJSON(vrfDir);
    verifications = allRecords.filter(v => v.userId === userId);
  }

  // Sort newest first
  verifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Strip image data for privacy
  return verifications.map(v => ({
    id: v.id,
    userId: v.userId,
    status: v.status,
    adminNotes: v.adminNotes,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy,
    createdAt: v.createdAt,
  }));
}

/**
 * List all pending verifications (full scan, newest first)
 * Returns records WITHOUT image data
 * @returns {Promise<object[]>}
 */
export async function listPending() {
  const vrfDir = getCollectionPath('verifications');
  const allRecords = await listJSON(vrfDir);
  const pending = allRecords.filter(v => v.status === 'pending');

  // Sort newest first
  pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return pending.map(v => ({
    id: v.id,
    userId: v.userId,
    status: v.status,
    adminNotes: v.adminNotes,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy,
    createdAt: v.createdAt,
  }));
}

/**
 * List all verifications (paginated, filterable)
 * @param {{ page?: number, limit?: number, status?: string }} options
 * @returns {Promise<{ verifications: object[], page: number, limit: number, total: number, totalPages: number }>}
 */
export async function listAll({ page = 1, limit = 20, status } = {}) {
  const vrfDir = getCollectionPath('verifications');
  const allRecords = await listJSON(vrfDir);

  // Filter by status if provided
  let filtered = allRecords.filter(v => v.id && v.id.startsWith('vrf_'));
  if (status) {
    filtered = filtered.filter(v => v.status === status);
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const items = filtered.slice(start, start + limit);

  // Strip image data
  const verifications = items.map(v => ({
    id: v.id,
    userId: v.userId,
    status: v.status,
    adminNotes: v.adminNotes,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy,
    createdAt: v.createdAt,
  }));

  return { verifications, page: safePage, limit, total, totalPages };
}

/**
 * Count today's submissions by user (Egypt midnight reset)
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countTodayByUser(userId) {
  const { getEgyptMidnight } = await import('./geo.js');
  const midnight = getEgyptMidnight();

  // Get all user verifications (with image data for internal use)
  const indexedIds = await getFromSetIndex(VERIFICATION_INDEX, userId);
  let verifications = [];

  if (indexedIds.length > 0) {
    for (const vrfId of indexedIds) {
      const vrf = await readJSON(getRecordPath('verifications', vrfId));
      if (vrf) verifications.push(vrf);
    }
  } else {
    const vrfDir = getCollectionPath('verifications');
    const allRecords = await listJSON(vrfDir);
    verifications = allRecords.filter(v => v.userId === userId);
  }

  // Count submissions after midnight
  return verifications.filter(v =>
    v.createdAt && new Date(v.createdAt) >= midnight
  ).length;
}
```

---

## `server/services/webpush.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/services/webpush.js — Web Push Subscription + Delivery
// ═══════════════════════════════════════════════════════════════
// VAPID signing (RFC 8292) with node:crypto ECDSA P-256
// Payload encryption (RFC 8291) with ECDH + HKDF + AES-128-GCM
// Falls back to no-payload push if encryption fails
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, deleteJSON, getRecordPath, getCollectionPath,
  listJSON, addToSetIndex, getFromSetIndex, readSetIndex, writeSetIndex,
} from './database.js';
import { logger } from './logger.js';

const PUSH_USER_INDEX = config.DATABASE.indexFiles.pushUserIndex;

// ── Base64URL helpers ────────────────────────────────────────

function base64urlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// ── VAPID JWT signing ────────────────────────────────────────

/**
 * Create a VAPID JWT token for push service authentication
 * @param {string} audience — push service origin (e.g. https://fcm.googleapis.com)
 * @param {string} subject — contact URI (e.g. mailto:admin@yowmia.com)
 * @param {string} privateKeyBase64url — VAPID private key (base64url-encoded raw 32 bytes)
 * @returns {string} JWT token
 */
function createVapidJwt(audience, subject, privateKeyBase64url) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = headerB64 + '.' + payloadB64;

  // Import private key as JWK for ECDSA signing
  const privateKeyRaw = base64urlDecode(privateKeyBase64url);

  // Build JWK for P-256 private key (raw 32-byte d parameter)
  const keyObj = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: base64urlEncode(privateKeyRaw),
      // x and y are derived from d — but node:crypto needs them
      // We derive them by creating a key pair from the private key
      x: '', // placeholder — will use DER approach instead
      y: '',
    },
    format: 'jwk',
  });

  // Sign with ECDSA SHA-256
  const sign = crypto.createSign('SHA256');
  sign.update(unsignedToken);
  const derSignature = sign.sign(keyObj);

  // Convert DER signature to raw r||s (64 bytes) for JWT ES256
  const rawSig = derToRaw(derSignature);

  return unsignedToken + '.' + base64urlEncode(rawSig);
}

/**
 * Convert DER-encoded ECDSA signature to raw r||s format (64 bytes)
 */
function derToRaw(derSig) {
  // DER: 0x30 [len] 0x02 [rLen] [r] 0x02 [sLen] [s]
  let offset = 2; // skip 0x30 and total length
  if (derSig[offset] === 0x02) {
    const rLen = derSig[offset + 1];
    const rStart = offset + 2;
    let r = derSig.subarray(rStart, rStart + rLen);
    offset = rStart + rLen;

    const sLen = derSig[offset + 1];
    const sStart = offset + 2;
    let s = derSig.subarray(sStart, sStart + sLen);

    // Remove leading zero padding
    if (r.length === 33 && r[0] === 0) r = r.subarray(1);
    if (s.length === 33 && s[0] === 0) s = s.subarray(1);

    // Pad to 32 bytes each
    const raw = Buffer.alloc(64);
    r.copy(raw, 32 - r.length);
    s.copy(raw, 64 - s.length);
    return raw;
  }
  return derSig;
}

// ── VAPID key management ─────────────────────────────────────

/**
 * Build ECDSA private key object from raw base64url-encoded 32-byte private key
 * Uses PKCS8 DER encoding
 */
function buildPrivateKey(privateKeyB64url) {
  const rawKey = base64urlDecode(privateKeyB64url);

  // Generate an EC key pair and import just the private scalar
  // Node.js needs a full key — we build a JWK with x,y derived from d
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(rawKey);
  const publicKeyUncompressed = ecdh.getPublicKey(); // 65 bytes: 0x04 || x || y
  const x = publicKeyUncompressed.subarray(1, 33);
  const y = publicKeyUncompressed.subarray(33, 65);

  return crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: base64urlEncode(rawKey),
      x: base64urlEncode(x),
      y: base64urlEncode(y),
    },
    format: 'jwk',
  });
}

/**
 * Create VAPID Authorization header value
 * @param {string} endpoint — push service endpoint URL
 * @returns {{ authorization: string, cryptoKey: string } | null}
 */
function getVapidHeaders(endpoint) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return null;
  }

  try {
    const endpointUrl = new URL(endpoint);
    const audience = endpointUrl.origin;
    const subject = 'mailto:admin@yowmia.com';

    // Build private key object
    const keyObj = buildPrivateKey(privateKey);

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const header = { typ: 'JWT', alg: 'ES256' };
    const payload = {
      aud: audience,
      exp: now + 12 * 60 * 60,
      sub: subject,
    };

    const headerB64 = base64urlEncode(JSON.stringify(header));
    const payloadB64 = base64urlEncode(JSON.stringify(payload));
    const unsignedToken = headerB64 + '.' + payloadB64;

    const sign = crypto.createSign('SHA256');
    sign.update(unsignedToken);
    const derSignature = sign.sign(keyObj);
    const rawSig = derToRaw(derSignature);

    const jwt = unsignedToken + '.' + base64urlEncode(rawSig);

    // Public key in uncompressed form (65 bytes)
    const pubKeyDecoded = base64urlDecode(publicKey);

    return {
      authorization: `vapid t=${jwt}, k=${publicKey}`,
      cryptoKey: undefined, // not needed with vapid scheme
    };
  } catch (err) {
    logger.error('VAPID header generation failed', { error: err.message });
    return null;
  }
}

// ── Payload encryption (RFC 8291 — simplified) ──────────────

/**
 * Encrypt push payload using RFC 8291 (aes128gcm)
 * @param {Buffer} userPublicKey — subscriber's p256dh key (65 bytes uncompressed)
 * @param {Buffer} userAuth — subscriber's auth secret (16 bytes)
 * @param {Buffer} payload — plaintext payload
 * @returns {Buffer|null} encrypted payload or null on failure
 */
function encryptPayload(userPublicKey, userAuth, payload) {
  try {
    // Generate ephemeral ECDH key pair
    const localKey = crypto.createECDH('prime256v1');
    localKey.generateKeys();
    const localPublicKey = localKey.getPublicKey(); // 65 bytes uncompressed

    // ECDH shared secret
    const sharedSecret = localKey.computeSecret(userPublicKey);

    // HKDF for auth info
    // auth_info = "WebPush: info" || 0x00 || ua_public || as_public
    const authInfo = Buffer.concat([
      Buffer.from('WebPush: info\0'),
      userPublicKey,
      localPublicKey,
    ]);

    // IKM = HKDF(auth, sharedSecret, authInfo, 32)
    const prk = crypto.createHmac('sha256', userAuth).update(sharedSecret).digest();
    const ikm = hkdfExpand(prk, authInfo, 32);

    // salt (random 16 bytes)
    const salt = crypto.randomBytes(16);

    // PRK for content encryption
    const contentPrk = crypto.createHmac('sha256', salt).update(ikm).digest();

    // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm" || 0x01, 16)
    const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0\x01');
    const cek = hkdfExpand(contentPrk, cekInfo, 16);

    // Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce" || 0x01, 12)
    const nonceInfo = Buffer.from('Content-Encoding: nonce\0\x01');
    const nonce = hkdfExpand(contentPrk, nonceInfo, 12);

    // Pad payload: payload || 0x02 (delimiter)
    const paddedPayload = Buffer.concat([payload, Buffer.from([2])]);

    // Encrypt with AES-128-GCM
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const encrypted = Buffer.concat([cipher.update(paddedPayload), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Build aes128gcm content coding header:
    // salt (16) || rs (4 bytes, uint32 BE) || idlen (1) || keyid (65) || encrypted || tag
    const rs = Buffer.alloc(4);
    rs.writeUInt32BE(4096, 0);
    const idlen = Buffer.from([65]); // length of localPublicKey

    return Buffer.concat([salt, rs, idlen, localPublicKey, encrypted, tag]);
  } catch (err) {
    logger.warn('Push payload encryption failed — will send without payload', { error: err.message });
    return null;
  }
}

/**
 * HKDF-Expand (SHA-256)
 */
function hkdfExpand(prk, info, length) {
  const hashLen = 32; // SHA-256
  const n = Math.ceil(length / hashLen);
  let prev = Buffer.alloc(0);
  const output = [];
  for (let i = 1; i <= n; i++) {
    const hmac = crypto.createHmac('sha256', prk);
    hmac.update(Buffer.concat([prev, info, Buffer.from([i])]));
    prev = hmac.digest();
    output.push(prev);
  }
  return Buffer.concat(output).subarray(0, length);
}

// ── Subscription CRUD ────────────────────────────────────────

/**
 * Register a push subscription for a user
 * @param {string} userId
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {string} [userAgent]
 * @returns {Promise<{ ok: boolean, subscription?: object, error?: string, code?: string }>}
 */
export async function subscribe(userId, subscription, userAgent) {
  // 1. Feature flag
  if (!config.WEB_PUSH || !config.WEB_PUSH.enabled) {
    return { ok: false, error: 'إشعارات Push غير مفعّلة', code: 'PUSH_DISABLED' };
  }

  // 2. Validate subscription
  if (!subscription || !subscription.endpoint || !subscription.keys ||
      !subscription.keys.p256dh || !subscription.keys.auth) {
    return { ok: false, error: 'بيانات الاشتراك غير صالحة', code: 'INVALID_SUBSCRIPTION' };
  }

  // 3. Check for duplicate endpoint
  const existingIds = await getFromSetIndex(PUSH_USER_INDEX, userId);
  for (const subId of existingIds) {
    const existing = await readJSON(getRecordPath('push_subscriptions', subId));
    if (existing && existing.endpoint === subscription.endpoint) {
      // Update lastUsedAt and return existing
      existing.lastUsedAt = new Date().toISOString();
      await atomicWrite(getRecordPath('push_subscriptions', subId), existing);
      return { ok: true, subscription: existing };
    }
  }

  // 4. Enforce max subscriptions per user
  const maxSubs = config.WEB_PUSH.maxSubscriptionsPerUser || 5;
  if (existingIds.length >= maxSubs) {
    // Delete oldest
    let oldest = null;
    let oldestDate = null;
    for (const subId of existingIds) {
      const sub = await readJSON(getRecordPath('push_subscriptions', subId));
      if (sub) {
        const created = new Date(sub.createdAt);
        if (!oldestDate || created < oldestDate) {
          oldestDate = created;
          oldest = sub;
        }
      }
    }
    if (oldest) {
      await deleteJSON(getRecordPath('push_subscriptions', oldest.id));
      // Remove from index
      const index = await readSetIndex(PUSH_USER_INDEX);
      if (index[userId]) {
        index[userId] = index[userId].filter(id => id !== oldest.id);
        if (index[userId].length === 0) delete index[userId];
        await writeSetIndex(PUSH_USER_INDEX, index);
      }
    }
  }

  // 5. Create subscription record
  const id = 'psub_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const record = {
    id,
    userId,
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    userAgent: userAgent || null,
    createdAt: now,
    lastUsedAt: now,
  };

  await atomicWrite(getRecordPath('push_subscriptions', id), record);
  await addToSetIndex(PUSH_USER_INDEX, userId, id);

  logger.info('Push subscription registered', { userId, subscriptionId: id });

  return { ok: true, subscription: record };
}

/**
 * Remove a push subscription by endpoint
 * @param {string} userId
 * @param {string} endpoint
 * @returns {Promise<{ ok: boolean }>}
 */
export async function unsubscribe(userId, endpoint) {
  if (!endpoint) {
    return { ok: false, error: 'الـ endpoint مطلوب', code: 'ENDPOINT_REQUIRED' };
  }

  const existingIds = await getFromSetIndex(PUSH_USER_INDEX, userId);

  for (const subId of existingIds) {
    const sub = await readJSON(getRecordPath('push_subscriptions', subId));
    if (sub && sub.endpoint === endpoint) {
      await deleteJSON(getRecordPath('push_subscriptions', subId));
      // Remove from index
      const index = await readSetIndex(PUSH_USER_INDEX);
      if (index[userId]) {
        index[userId] = index[userId].filter(id => id !== subId);
        if (index[userId].length === 0) delete index[userId];
        await writeSetIndex(PUSH_USER_INDEX, index);
      }
      logger.info('Push subscription removed', { userId, subscriptionId: subId });
      return { ok: true };
    }
  }

  return { ok: true }; // Already gone — idempotent
}

/**
 * Send push notification to all subscriptions of a user
 * Fire-and-forget — NEVER throws
 *
 * @param {string} userId
 * @param {{ title: string, body: string, icon?: string, url?: string }} data
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendPush(userId, data) {
  try {
    if (!config.WEB_PUSH || !config.WEB_PUSH.enabled) {
      return { sent: 0, failed: 0 };
    }

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { sent: 0, failed: 0 };
    }

    const subIds = await getFromSetIndex(PUSH_USER_INDEX, userId);
    if (subIds.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    const expiredIds = [];

    for (const subId of subIds) {
      const sub = await readJSON(getRecordPath('push_subscriptions', subId));
      if (!sub) continue;

      try {
        const result = await deliverPush(sub, data);
        if (result.ok) {
          sent++;
          // Update lastUsedAt
          sub.lastUsedAt = new Date().toISOString();
          await atomicWrite(getRecordPath('push_subscriptions', subId), sub);
        } else if (result.gone) {
          // 410 Gone — subscription expired
          expiredIds.push(subId);
          failed++;
        } else {
          failed++;
        }
      } catch (_) {
        failed++;
      }
    }

    // Cleanup expired subscriptions
    if (expiredIds.length > 0) {
      for (const subId of expiredIds) {
        await deleteJSON(getRecordPath('push_subscriptions', subId)).catch(() => {});
      }
      // Batch update index
      const index = await readSetIndex(PUSH_USER_INDEX);
      if (index[userId]) {
        index[userId] = index[userId].filter(id => !expiredIds.includes(id));
        if (index[userId].length === 0) delete index[userId];
        await writeSetIndex(PUSH_USER_INDEX, index);
      }
      logger.info('Cleaned expired push subscriptions', { userId, count: expiredIds.length });
    }

    return { sent, failed };
  } catch (err) {
    // NEVER throw
    logger.warn('sendPush error', { userId, error: err.message });
    return { sent: 0, failed: 0 };
  }
}

/**
 * Send push notification to multiple users
 * Fire-and-forget — NEVER throws
 *
 * @param {string[]} userIds
 * @param {{ title: string, body: string, icon?: string, url?: string }} data
 * @returns {Promise<{ totalSent: number, totalFailed: number }>}
 */
export async function sendPushToMany(userIds, data) {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPush(userId, data);
    totalSent += result.sent;
    totalFailed += result.failed;
  }

  return { totalSent, totalFailed };
}

/**
 * Deliver a push notification to a single subscription endpoint
 * @param {object} subscription — stored subscription record
 * @param {{ title: string, body: string, icon?: string, url?: string }} data
 * @returns {Promise<{ ok: boolean, gone?: boolean }>}
 */
async function deliverPush(subscription, data) {
  const vapidHeaders = getVapidHeaders(subscription.endpoint);
  if (!vapidHeaders) {
    return { ok: false };
  }

  const payloadJson = JSON.stringify({
    title: data.title || 'يوميّة',
    body: data.body || 'إشعار جديد',
    icon: data.icon || '/assets/img/icon-192.png',
    url: data.url || '/dashboard.html',
  });

  // Try payload encryption
  const headers = {
    'Authorization': vapidHeaders.authorization,
    'TTL': '86400', // 24 hours
  };

  let bodyBuffer = null;

  try {
    const userPublicKey = base64urlDecode(subscription.keys.p256dh);
    const userAuth = base64urlDecode(subscription.keys.auth);
    const encrypted = encryptPayload(userPublicKey, userAuth, Buffer.from(payloadJson));

    if (encrypted) {
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Encoding'] = 'aes128gcm';
      headers['Content-Length'] = String(encrypted.length);
      bodyBuffer = encrypted;
    }
  } catch (_) {
    // Fallback: no payload
  }

  // If encryption failed, send without payload (Plan B)
  if (!bodyBuffer) {
    headers['Content-Length'] = '0';
  }

  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: bodyBuffer,
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 201 || response.status === 200) {
      return { ok: true };
    }

    if (response.status === 410 || response.status === 404) {
      // Subscription expired or not found
      return { ok: false, gone: true };
    }

    logger.warn('Push delivery failed', {
      endpoint: subscription.endpoint.substring(0, 60),
      status: response.status,
    });
    return { ok: false };
  } catch (err) {
    logger.warn('Push delivery error', {
      endpoint: subscription.endpoint.substring(0, 60),
      error: err.message,
    });
    return { ok: false };
  }
}
```

---
