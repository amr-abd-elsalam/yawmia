// ═══════════════════════════════════════════════════════════════
// server/handlers/paymentsHandler.js — Payment Endpoint Handlers
// ═══════════════════════════════════════════════════════════════

import { createPayment, confirmPayment, completePayment, disputePayment, findById, listByJob, getFinancialSummary } from '../services/payments.js';
import { sanitizeText } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs/:id/payment
 * Create payment record for a completed job
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleCreatePayment(req, res) {
  try {
    const jobId = req.params.id;
    const employerId = req.user.id;
    const body = req.body || {};

    const options = {};
    if (body.method) options.method = body.method;
    if (body.notes) options.notes = sanitizeText(body.notes);

    const result = await createPayment(jobId, employerId, options);
    if (!result.ok) {
      const statusMap = {
        PAYMENTS_DISABLED: 400,
        JOB_NOT_FOUND: 404,
        JOB_NOT_COMPLETED: 400,
        NOT_JOB_OWNER: 403,
        PAYMENT_EXISTS: 409,
        INVALID_PAYMENT_METHOD: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    return sendJSON(res, 201, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء سجل الدفع', code: 'CREATE_PAYMENT_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/payment
 * Get payment info for a job
 * Requires: requireAuth
 */
export async function handleGetJobPayment(req, res) {
  try {
    const jobId = req.params.id;
    const payments = await listByJob(jobId);

    if (payments.length === 0) {
      return sendJSON(res, 404, { error: 'لا يوجد سجل دفع لهذه الفرصة', code: 'PAYMENT_NOT_FOUND' });
    }

    return sendJSON(res, 200, { ok: true, payment: payments[0] });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل الدفع', code: 'GET_PAYMENT_ERROR' });
  }
}

/**
 * POST /api/payments/:id/confirm
 * Employer confirms cash payment
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleConfirmPayment(req, res) {
  try {
    const paymentId = req.params.id;
    const employerId = req.user.id;

    const result = await confirmPayment(paymentId, employerId);
    if (!result.ok) {
      const statusMap = {
        PAYMENT_NOT_FOUND: 404,
        NOT_PAYMENT_OWNER: 403,
        INVALID_PAYMENT_STATUS: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تأكيد الدفع', code: 'CONFIRM_PAYMENT_ERROR' });
  }
}

/**
 * POST /api/payments/:id/dispute
 * Raise dispute on a payment
 * Requires: requireAuth (employer or accepted worker)
 */
export async function handleDisputePayment(req, res) {
  try {
    const paymentId = req.params.id;
    const userId = req.user.id;
    const body = req.body || {};

    let reason = body.reason || '';
    reason = sanitizeText(reason);

    if (!reason || reason.length < 5) {
      return sendJSON(res, 400, { error: 'سبب النزاع لازم يكون 5 حروف على الأقل', code: 'INVALID_DISPUTE_REASON' });
    }

    const result = await disputePayment(paymentId, userId, reason);
    if (!result.ok) {
      const statusMap = {
        PAYMENT_NOT_FOUND: 404,
        PAYMENT_ALREADY_COMPLETED: 400,
        ALREADY_DISPUTED: 400,
        DISPUTE_WINDOW_CLOSED: 400,
        NOT_INVOLVED: 403,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فتح النزاع', code: 'DISPUTE_PAYMENT_ERROR' });
  }
}

/**
 * GET /api/admin/financial-summary
 * Admin financial overview
 * Requires: requireAdmin
 */
export async function handleAdminFinancialSummary(req, res) {
  try {
    const summary = await getFinancialSummary();
    return sendJSON(res, 200, { ok: true, summary });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الملخص المالي', code: 'FINANCIAL_SUMMARY_ERROR' });
  }
}

/**
 * POST /api/admin/payments/:id/complete
 * Admin finalizes a payment
 * Requires: requireAdmin
 */
export async function handleAdminCompletePayment(req, res) {
  try {
    const paymentId = req.params.id;

    const result = await completePayment(paymentId);
    if (!result.ok) {
      const statusMap = {
        PAYMENT_NOT_FOUND: 404,
        INVALID_PAYMENT_STATUS: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, payment: result.payment });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنهاء الدفعة', code: 'COMPLETE_PAYMENT_ERROR' });
  }
}
