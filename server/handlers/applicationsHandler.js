// ═══════════════════════════════════════════════════════════════
// server/handlers/applicationsHandler.js — Application Endpoints
// ═══════════════════════════════════════════════════════════════

import { apply, accept, reject, listByJob } from '../services/applications.js';

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
