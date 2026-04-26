// ═══════════════════════════════════════════════════════════════
// server/services/jobs.js — Job CRUD with filtering
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, safeReadJSON, getRecordPath, getWriteRecordPath, readIndex, writeIndex, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex, walkCollectionFiles } from './database.js';
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

  // Save job file (write to current month shard)
  const jobPath = getWriteRecordPath('jobs', id);
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
  let jobs;

  // Try query index for first-pass filtering (reduces disk I/O)
  let usedQueryIndex = false;
  if (config.QUERY_INDEX && config.QUERY_INDEX.enabled) {
    try {
      const { queryJobs, getStats: qiStats } = await import('./queryIndex.js');
      const stats = qiStats();
      if (stats.totalJobs > 0) {
        const matchedIds = queryJobs({
          status: filters.status || undefined,
          governorate: filters.governorate || undefined,
          category: filters.category || undefined,
          categories: filters.categories || undefined,
          urgency: filters.urgency || undefined,
        });
        const results = [];
        for (const id of matchedIds) {
          const job = await readJSON(getRecordPath('jobs', id));
          if (job) results.push(job);
        }
        jobs = results;
        usedQueryIndex = true;
      }
    } catch (_) { /* fallback to full scan */ }
  }

  if (!usedQueryIndex) {
    const jobsDir = getCollectionPath('jobs');
    const allJobs = await listJSON(jobsDir);
    // Filter out index.json (not a job record)
    jobs = allJobs.filter(item => item.id && item.id.startsWith('job_'));
  }

  if (filters.governorate) {
    jobs = jobs.filter(j => j.governorate === filters.governorate);
  }
  if (filters.category) {
    jobs = jobs.filter(j => j.category === filters.category);
  }
  if (filters.urgency) {
    jobs = jobs.filter(j => (j.urgency || 'normal') === filters.urgency);
  }

  // Phase 40 — onlyOnline filter (employer perspective)
  // Show only jobs whose category has at least one online worker available
  if (filters.onlyOnline) {
    try {
      const { getOnlineWorkers } = await import('./presenceService.js');
      const online = await getOnlineWorkers({ acceptingJobs: true, includeAway: false });
      const onlineCats = new Set();
      for (const w of online) {
        if (w.user && Array.isArray(w.user.categories)) {
          for (const c of w.user.categories) onlineCats.add(c);
        }
      }
      jobs = jobs.filter(j => onlineCats.has(j.category));
    } catch (_) { /* non-blocking — keep jobs as-is */ }
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
  let allFiles;
  try {
    allFiles = await walkCollectionFiles(jobsDir, 'job_');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  // Compatibility: map to the format used below
  const jsonFiles = allFiles;
  let count = 0;
  const now = new Date();
  const expiredJobIds = [];
  const expiredJobTitles = {};
  const BATCH_SIZE = 100;

  for (let i = 0; i < jsonFiles.length; i++) {
    const job = await readJSON(jsonFiles[i].filePath);
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
  let allJobFiles;
  try {
    allJobFiles = await walkCollectionFiles(jobsDir, 'job_');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const now = new Date();
  const warningWindowMs = 24 * 60 * 60 * 1000; // 24 hours
  let count = 0;

  for (const entry of allJobFiles) {
    try {
      const job = await readJSON(entry.filePath);
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
