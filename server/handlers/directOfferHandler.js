// ═══════════════════════════════════════════════════════════════
// server/handlers/directOfferHandler.js — Direct Offer Endpoints
// ═══════════════════════════════════════════════════════════════

import {
  create, tryAccept, decline, withdraw, findById, listByEmployer, listByWorker,
  redactOfferForViewer,
} from '../services/directOffer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  OFFERS_DISABLED: 503,
  SELF_OFFER: 400,
  INVALID_EMPLOYER: 403,
  INVALID_WORKER: 404,
  INVALID_FIELDS: 400,
  INVALID_CATEGORY: 400,
  INVALID_GOVERNORATE: 400,
  INVALID_WAGE: 400,
  INVALID_START_DATE: 400,
  INVALID_DURATION: 400,
  MESSAGE_TOO_LONG: 400,
  CONTENT_BLOCKED: 400,
  EMPLOYER_PENDING_CAP: 429,
  WORKER_PENDING_CAP: 429,
  EMPLOYER_DAILY_CAP: 429,
  DUPLICATE_PENDING: 409,
  INVALID_AD: 400,
  OFFER_NOT_FOUND: 404,
  NOT_OFFER_RECIPIENT: 403,
  NOT_OFFER_OWNER: 403,
  OFFER_NOT_PENDING: 409,
  OFFER_EXPIRED: 410,
  USER_DELETED: 410,
  JOB_CREATION_FAILED: 500,
  APP_CREATION_FAILED: 500,
  INVALID_REASON: 400,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/direct-offers
 * Body: { workerId, adId?, category, governorate, proposedDailyWage, proposedStartDate, proposedDurationDays?, message? }
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleCreateOffer(req, res) {
  try {
    const employerId = req.user.id;
    const body = req.body || {};

    if (!body.workerId || typeof body.workerId !== 'string') {
      return sendJSON(res, 400, { error: 'معرّف العامل مطلوب', code: 'WORKER_ID_REQUIRED' });
    }

    const result = await create(employerId, body.workerId, {
      adId: body.adId || null,
      category: body.category,
      governorate: body.governorate,
      proposedDailyWage: body.proposedDailyWage,
      proposedStartDate: body.proposedStartDate,
      proposedDurationDays: body.proposedDurationDays,
      message: body.message,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/direct-offers/:id/accept
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleAcceptOffer(req, res) {
  try {
    const offerId = req.params.id;
    const workerId = req.user.id;

    const result = await tryAccept(offerId, workerId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, offer: result.offer, jobId: result.jobId });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/direct-offers/:id/decline
 * Body: { reason? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleDeclineOffer(req, res) {
  try {
    const offerId = req.params.id;
    const workerId = req.user.id;
    const body = req.body || {};

    const result = await decline(offerId, workerId, body.reason);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/direct-offers/:id
 * Employer withdraws a pending offer.
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleWithdrawOffer(req, res) {
  try {
    const offerId = req.params.id;
    const employerId = req.user.id;

    const result = await withdraw(offerId, employerId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/direct-offers/mine?status=pending&limit=20&offset=0
 * Role-aware: employer sees their sent offers, worker sees their received offers.
 * Requires: requireAuth (any role)
 */
export async function handleListMyOffers(req, res) {
  try {
    const user = req.user;
    const status = req.query.status || undefined;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    let result;
    if (user.role === 'employer') {
      result = await listByEmployer(user.id, { status, limit, offset });
    } else if (user.role === 'worker') {
      result = await listByWorker(user.id, { status, limit, offset });
    } else {
      return sendJSON(res, 403, { error: 'غير مسموح', code: 'FORBIDDEN' });
    }

    sendJSON(res, 200, { ok: true, ...result, role: user.role });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/direct-offers/:id
 * Get a single offer (redacted per viewer).
 * Requires: requireAuth (must be involved party)
 */
export async function handleGetOffer(req, res) {
  try {
    const offerId = req.params.id;
    const userId = req.user.id;

    const offer = await findById(offerId);
    if (!offer) {
      return sendJSON(res, 404, { error: 'العرض غير موجود', code: 'OFFER_NOT_FOUND' });
    }

    // Authorization: must be employer or worker on this offer
    if (offer.employerId !== userId && offer.workerId !== userId) {
      return sendJSON(res, 403, { error: 'مش مسموحلك تشوف هذا العرض', code: 'NOT_AUTHORIZED' });
    }

    sendJSON(res, 200, { ok: true, offer: redactOfferForViewer(offer, userId) });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
