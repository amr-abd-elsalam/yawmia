// ═══════════════════════════════════════════════════════════════
// server/handlers/reportsHandler.js — Report & Trust Endpoints
// ═══════════════════════════════════════════════════════════════

import { createReport, listPending, listAll, reviewReport, findById } from '../services/reports.js';
import { getUserTrustScore } from '../services/trust.js';
import { sanitizeText } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/reports
 * Create a new report
 * Requires: auth token
 */
export async function handleCreateReport(req, res) {
  try {
    const body = req.body || {};
    const reporterId = req.user.id;
    const targetId = body.targetId;
    const type = body.type;
    const reason = sanitizeText(body.reason || '');
    const jobId = body.jobId || null;

    const result = await createReport(reporterId, targetId, { type, reason, jobId });

    if (!result.ok) {
      const statusMap = {
        REPORTS_DISABLED: 400,
        CANNOT_REPORT_SELF: 400,
        INVALID_REPORT_TYPE: 400,
        REASON_REQUIRED: 400,
        REASON_TOO_SHORT: 400,
        REASON_TOO_LONG: 400,
        TARGET_NOT_FOUND: 404,
        DAILY_REPORT_LIMIT: 429,
        DUPLICATE_REPORT: 409,
      };
      const statusCode = statusMap[result.code] || 400;
      return sendJSON(res, statusCode, { error: result.error, code: result.code });
    }

    return sendJSON(res, 201, { ok: true, report: result.report });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء البلاغ', code: 'CREATE_REPORT_ERROR' });
  }
}

/**
 * GET /api/admin/reports
 * List reports (paginated, filterable by status)
 * Requires: admin
 */
export async function handleAdminListReports(req, res) {
  try {
    const statusFilter = req.query.status || '';
    let reports;

    if (statusFilter === 'pending') {
      reports = await listPending();
    } else if (statusFilter) {
      const all = await listAll();
      reports = all.filter(r => r.status === statusFilter);
    } else {
      reports = await listAll();
    }

    const total = reports.length;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedReports = reports.slice(offset, offset + limit);

    return sendJSON(res, 200, {
      ok: true,
      reports: paginatedReports,
      count: paginatedReports.length,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب البلاغات', code: 'LIST_REPORTS_ERROR' });
  }
}

/**
 * PUT /api/admin/reports/:id
 * Review a report
 * Requires: admin
 */
export async function handleAdminReviewReport(req, res) {
  try {
    const reportId = req.params.id;
    const body = req.body || {};
    const status = body.status;
    const adminNotes = sanitizeText(body.adminNotes || '');

    const result = await reviewReport(reportId, { status, adminNotes });

    if (!result.ok) {
      const statusMap = {
        REPORT_NOT_FOUND: 404,
        INVALID_REPORT_STATUS: 400,
      };
      const statusCode = statusMap[result.code] || 400;
      return sendJSON(res, statusCode, { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, report: result.report });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في مراجعة البلاغ', code: 'REVIEW_REPORT_ERROR' });
  }
}

/**
 * GET /api/users/:id/trust-score
 * Get trust score for a user
 * Public endpoint
 */
export async function handleGetTrustScore(req, res) {
  try {
    const userId = req.params.id;
    const result = await getUserTrustScore(userId);

    if (!result) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    return sendJSON(res, 200, {
      ok: true,
      score: result.score,
      components: result.components,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في حساب مؤشر الثقة', code: 'TRUST_SCORE_ERROR' });
  }
}
