// ═══════════════════════════════════════════════════════════════
// server/handlers/jobsHandler.js — Job Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { create, findById, list, listAll, startJob, completeJob, cancelJob, countTodayByEmployer, renewJob } from '../services/jobs.js';
import { validateJobFields } from '../services/validators.js';
import { sanitizeFields } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs
 * Requires: auth (employer)
 */
export async function handleCreateJob(req, res) {
  const body = req.body || {};

  const result = validateJobFields(body);
  if (!result.valid) {
    return sendJSON(res, 400, { error: result.errors.join('. '), code: 'INVALID_JOB' });
  }

  // Daily limit enforcement (non-blocking — allows on count failure)
  try {
    const todayCount = await countTodayByEmployer(req.user.id);
    if (todayCount >= config.LIMITS.maxJobsPerEmployerPerDay) {
      return sendJSON(res, 429, { error: 'وصلت للحد الأقصى لنشر الفرص اليوم', code: 'DAILY_JOB_LIMIT' });
    }
  } catch (_) {
    // Non-blocking: allow action if count check fails
  }

  try {
    const sanitized = sanitizeFields(body, ['title', 'description']);
    const job = await create(req.user.id, sanitized);
    return sendJSON(res, 201, { ok: true, job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء الفرصة', code: 'CREATE_JOB_ERROR' });
  }
}

/**
 * GET /api/jobs
 * Public — with optional filters: ?governorate=cairo&category=farming&status=open
 * Supports pagination: ?page=1&limit=20
 */
export async function handleListJobs(req, res) {
  const filters = {};
  if (req.query.governorate) filters.governorate = req.query.governorate;
  if (req.query.category) filters.category = req.query.category;
  if (req.query.status) filters.status = req.query.status;
  if (req.query.search) filters.search = req.query.search;
  if (req.query.sort) filters.sort = req.query.sort;
  if (req.query.lat) filters.lat = req.query.lat;
  if (req.query.lng) filters.lng = req.query.lng;
  if (req.query.radius) filters.radius = req.query.radius;

  try {
    const allJobs = await list(filters);
    const total = allJobs.length;

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const jobs = allJobs.slice(offset, offset + limit);

    return sendJSON(res, 200, {
      ok: true,
      jobs,
      count: jobs.length,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الفرص', code: 'LIST_JOBS_ERROR' });
  }
}

/**
 * GET /api/jobs/:id
 * Public
 */
export async function handleGetJob(req, res) {
  const jobId = req.params.id;

  try {
    const job = await findById(jobId);
    if (!job) {
      return sendJSON(res, 404, { error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' });
    }
    return sendJSON(res, 200, { ok: true, job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الفرصة', code: 'GET_JOB_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/start
 * Requires: auth (employer, owns job, status=filled)
 */
export async function handleStartJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await startJob(jobId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في بدء الفرصة', code: 'START_JOB_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/complete
 * Requires: auth (employer, owns job, status=in_progress)
 */
export async function handleCompleteJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await completeJob(jobId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنهاء الفرصة', code: 'COMPLETE_JOB_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/cancel
 * Requires: auth (employer, owns job, status=open)
 */
export async function handleCancelJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await cancelJob(jobId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إلغاء الفرصة', code: 'CANCEL_JOB_ERROR' });
  }
}

/**
 * GET /api/jobs/mine
 * Requires: auth (employer)
 * Returns: all jobs by the employer (all statuses, paginated)
 */
export async function handleListMyJobs(req, res) {
  try {
    let myJobs;

    // Try index-accelerated lookup first (employer-jobs index)
    try {
      const { getFromSetIndex, readJSON, getRecordPath } = await import('../services/database.js');
      const employerJobsIndex = config.DATABASE.indexFiles.employerJobsIndex;
      const jobIds = await getFromSetIndex(employerJobsIndex, req.user.id);
      if (jobIds.length > 0) {
        const results = [];
        for (const jobId of jobIds) {
          const job = await readJSON(getRecordPath('jobs', jobId));
          if (job) results.push(job);
        }
        myJobs = results;
      }
    } catch (_) {
      // Fallback below
    }

    // Fallback: full scan (backward compatibility)
    if (!myJobs) {
      const allJobs = await listAll();
      myJobs = allJobs.filter(j => j.employerId === req.user.id);
    }

    // Sort: newest first
    myJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = myJobs.length;

    // Pagination (same pattern as handleListJobs)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const jobs = myJobs.slice(offset, offset + limit);

    return sendJSON(res, 200, {
      ok: true,
      jobs,
      count: jobs.length,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب فرصك', code: 'LIST_MY_JOBS_ERROR' });
  }
}

/**
 * GET /api/jobs/nearby
 * Requires: auth (worker)
 * Returns: nearby jobs based on worker's saved location or governorate center
 */
export async function handleNearbyJobs(req, res) {
  const user = req.user;

  try {
    const { resolveCoordinates } = await import('../services/geo.js');
    const coords = resolveCoordinates({
      lat: user.lat,
      lng: user.lng,
      governorate: user.governorate,
    });

    if (!coords) {
      return sendJSON(res, 400, {
        error: 'حدّد موقعك في الملف الشخصي عشان تشوف الفرص القريبة',
        code: 'LOCATION_REQUIRED',
      });
    }

    const radius = Math.min(
      Number(req.query.radius) || config.GEOLOCATION.defaultRadiusKm,
      config.GEOLOCATION.maxRadiusKm
    );
    const category = req.query.category || undefined;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const allJobs = await list({
      status: 'open',
      category,
      lat: coords.lat,
      lng: coords.lng,
      radius,
    });

    const total = allJobs.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const paginatedJobs = allJobs.slice(start, start + limit);

    return sendJSON(res, 200, {
      ok: true,
      jobs: paginatedJobs,
      count: paginatedJobs.length,
      total,
      page,
      totalPages,
      limit,
      location: { lat: coords.lat, lng: coords.lng, radius },
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الفرص القريبة', code: 'NEARBY_JOBS_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/renew
 * Requires: auth (employer, owns job, status=expired|cancelled)
 */
export async function handleRenewJob(req, res) {
  const jobId = req.params.id;

  try {
    const result = await renewJob(jobId, req.user.id);
    if (!result.ok) {
      const statusMap = {
        RENEWAL_DISABLED: 503,
        JOB_NOT_FOUND: 404,
        NOT_JOB_OWNER: 403,
        INVALID_STATUS_FOR_RENEWAL: 400,
        MAX_RENEWALS_REACHED: 400,
        DAILY_JOB_LIMIT: 429,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تجديد الفرصة', code: 'RENEW_JOB_ERROR' });
  }
}
