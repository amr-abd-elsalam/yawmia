// ═══════════════════════════════════════════════════════════════
// server/handlers/applicationsHandler.js — Application Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { apply, accept, reject, listByJob, listByWorker, withdraw, countTodayByWorker, workerConfirm, workerDecline } from '../services/applications.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs/:id/apply
 * Requires: auth (worker)
 */
export async function handleApplyToJob(req, res) {
  const jobId = req.params.id;
  const workerId = req.user.id;

  // Daily limit enforcement (non-blocking — allows on count failure)
  try {
    const todayCount = await countTodayByWorker(workerId);
    if (todayCount >= config.LIMITS.maxApplicationsPerWorkerPerDay) {
      return sendJSON(res, 429, { error: 'وصلت للحد الأقصى للتقديم على الفرص اليوم', code: 'DAILY_APPLICATION_LIMIT' });
    }
  } catch (_) {
    // Non-blocking: allow action if count check fails
  }

  try {
    const result = await apply(jobId, workerId);
    if (!result.ok) {
      return sendJSON(res, 400, result);
    }
    return sendJSON(res, 201, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في التقديم على الفرصة', code: 'APPLY_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/accept
 * Body: { applicationId }
 * Requires: auth (employer, owns job)
 */
export async function handleAcceptWorker(req, res) {
  const { applicationId } = req.body || {};

  if (!applicationId) {
    return sendJSON(res, 400, { error: 'معرّف الطلب مطلوب', code: 'MISSING_APPLICATION_ID' });
  }

  try {
    const result = await accept(applicationId, req.user.id);
    if (!result.ok) {
      return sendJSON(res, 400, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في قبول العامل', code: 'ACCEPT_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/reject
 * Body: { applicationId }
 * Requires: auth (employer, owns job)
 */
export async function handleRejectWorker(req, res) {
  const { applicationId } = req.body || {};

  if (!applicationId) {
    return sendJSON(res, 400, { error: 'معرّف الطلب مطلوب', code: 'MISSING_APPLICATION_ID' });
  }

  try {
    const result = await reject(applicationId, req.user.id);
    if (!result.ok) {
      return sendJSON(res, 400, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في رفض العامل', code: 'REJECT_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/applications
 * Requires: auth (employer, owns job)
 * Returns: enriched applications with worker info
 */
export async function handleListJobApplications(req, res) {
  const jobId = req.params.id;

  try {
    // Dynamic imports to avoid circular dependencies
    const { findById: findJobById } = await import('../services/jobs.js');
    const { findById: findUserById } = await import('../services/users.js');

    const job = await findJobById(jobId);
    if (!job) {
      return sendJSON(res, 404, { error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' });
    }

    // Ownership check
    if (job.employerId !== req.user.id) {
      return sendJSON(res, 403, { error: 'مش مسموحلك تشوف طلبات هذه الفرصة', code: 'NOT_JOB_OWNER' });
    }

    const applications = await listByJob(jobId);

    // Enrich with worker info
    const enriched = [];
    for (const app of applications) {
      const worker = await findUserById(app.workerId);
      enriched.push({
        ...app,
        worker: worker ? {
          id: worker.id,
          name: worker.name || 'بدون اسم',
          phone: worker.phone,
          governorate: worker.governorate || '',
          categories: worker.categories || [],
          rating: worker.rating || { avg: 0, count: 0 },
          verificationStatus: worker.verificationStatus || 'unverified',
        } : { id: app.workerId, name: 'مستخدم محذوف', phone: '', governorate: '', categories: [], rating: { avg: 0, count: 0 }, verificationStatus: 'unverified' },
      });
    }

    return sendJSON(res, 200, { ok: true, applications: enriched, count: enriched.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب طلبات الفرصة', code: 'LIST_JOB_APPS_ERROR' });
  }
}

/**
 * GET /api/applications/mine
 * Requires: auth (worker)
 * Returns: worker's applications enriched with job info
 */
export async function handleListMyApplications(req, res) {
  try {
    const { findById: findJobById } = await import('../services/jobs.js');

    const applications = await listByWorker(req.user.id);

    // Sort by newest first
    applications.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

    // Enrich with job info
    const enriched = [];
    for (const app of applications) {
      const job = await findJobById(app.jobId);
      enriched.push({
        ...app,
        job: job ? {
          id: job.id,
          title: job.title,
          category: job.category,
          governorate: job.governorate,
          dailyWage: job.dailyWage,
          status: job.status,
          employerId: job.employerId,
          startDate: job.startDate,
          durationDays: job.durationDays,
        } : null,
      });
    }

    return sendJSON(res, 200, { ok: true, applications: enriched, count: enriched.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب طلباتك', code: 'LIST_MY_APPS_ERROR' });
  }
}

/**
 * POST /api/applications/:id/withdraw
 * Requires: auth (worker, owns application, status=pending)
 */
export async function handleWithdrawApplication(req, res) {
  const applicationId = req.params.id;

  try {
    const result = await withdraw(applicationId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'APPLICATION_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في سحب الطلب', code: 'WITHDRAW_ERROR' });
  }
}

/**
 * POST /api/applications/:id/confirm
 * Worker confirms acceptance (two-phase)
 * Requires: auth (worker)
 */
export async function handleWorkerConfirm(req, res) {
  const applicationId = req.params.id;

  try {
    const result = await workerConfirm(applicationId, req.user.id);
    if (!result.ok) {
      const statusMap = { APPLICATION_NOT_FOUND: 404, NOT_APPLICATION_OWNER: 403, INVALID_STATUS: 400, DEADLINE_PASSED: 400 };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تأكيد الطلب', code: 'CONFIRM_ERROR' });
  }
}

/**
 * POST /api/applications/:id/decline
 * Worker declines acceptance (two-phase)
 * Requires: auth (worker)
 */
export async function handleWorkerDecline(req, res) {
  const applicationId = req.params.id;

  try {
    const result = await workerDecline(applicationId, req.user.id);
    if (!result.ok) {
      const statusMap = { APPLICATION_NOT_FOUND: 404, NOT_APPLICATION_OWNER: 403, INVALID_STATUS: 400 };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في رفض الطلب', code: 'DECLINE_ERROR' });
  }
}
