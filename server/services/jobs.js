// ═══════════════════════════════════════════════════════════════
// server/services/jobs.js — Job CRUD with filtering
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, readIndex, writeIndex, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
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
  const expiresAt = new Date(now.getTime() + config.JOBS.expiryHours * 60 * 60 * 1000);
  const { totalCost, platformFee } = calculateFees(fields.workersNeeded, fields.dailyWage, fields.durationDays);

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
    startDate: fields.startDate,
    durationDays: fields.durationDays,
    description: (fields.description || '').trim(),
    totalCost,
    platformFee,
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
  const job = await readJSON(jobPath);
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

  // Text search on title + description (case-insensitive)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    jobs = jobs.filter(j => {
      const title = (j.title || '').toLowerCase();
      const desc = (j.description || '').toLowerCase();
      return title.includes(term) || desc.includes(term);
    });
  }

  // Sort (skip if already sorted by proximity)
  if (!filters._proximitySorted) {
    const sort = filters.sort || 'newest';
    if (sort === 'wage_high') {
      jobs.sort((a, b) => (b.dailyWage || 0) - (a.dailyWage || 0));
    } else if (sort === 'wage_low') {
      jobs.sort((a, b) => (a.dailyWage || 0) - (b.dailyWage || 0));
    } else {
      // Default: newest first
      jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
