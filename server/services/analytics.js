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
