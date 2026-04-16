// ═══════════════════════════════════════════════════════════════
// server/handlers/jobsHandler.js — Job Endpoints
// ═══════════════════════════════════════════════════════════════

import { create, findById, list, startJob, completeJob } from '../services/jobs.js';
import { validateJobFields } from '../services/validators.js';

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

  try {
    const job = await create(req.user.id, body);
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
