// ═══════════════════════════════════════════════════════════════
// server/handlers/ratingsHandler.js — Rating API Handlers
// ═══════════════════════════════════════════════════════════════

import { submitRating, listByJob, listByUser, getUserRatingSummary, getPendingRatings } from '../services/ratings.js';
import { sanitizeText } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/jobs/:id/rate
 * Submit a rating for a completed job (requireAuth)
 */
export async function handleSubmitRating(req, res) {
  try {
    const jobId = req.params.id;
    const fromUserId = req.user.id;
    const body = req.body || {};

    if (!body.toUserId) {
      return sendJSON(res, 400, { error: 'يجب تحديد المستخدم المُقيَّم', code: 'MISSING_TARGET_USER' });
    }

    const result = await submitRating(jobId, fromUserId, {
      toUserId: body.toUserId,
      stars: body.stars,
      comment: sanitizeText(body.comment),
    });

    if (!result.ok) {
      const notFoundCodes = ['JOB_NOT_FOUND', 'USER_NOT_FOUND'];
      const statusCode = notFoundCodes.includes(result.code) ? 404 : 400;
      return sendJSON(res, statusCode, { error: result.error, code: result.code });
    }

    return sendJSON(res, 201, { ok: true, rating: result.rating });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/ratings
 * List all ratings for a job (public)
 */
export async function handleListJobRatings(req, res) {
  try {
    const jobId = req.params.id;
    const ratings = await listByJob(jobId);
    return sendJSON(res, 200, { ok: true, ratings, count: ratings.length });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/users/:id/ratings
 * List ratings received by a user (public, paginated)
 */
export async function handleListUserRatings(req, res) {
  try {
    const userId = req.params.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await listByUser(userId, { limit, offset });
    return sendJSON(res, 200, { ok: true, items: result.items, total: result.total, limit: result.limit, offset: result.offset });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/users/:id/rating-summary
 * Get rating summary for a user (public)
 */
export async function handleUserRatingSummary(req, res) {
  try {
    const userId = req.params.id;
    const summary = await getUserRatingSummary(userId);
    return sendJSON(res, 200, { ok: true, avg: summary.avg, count: summary.count, distribution: summary.distribution });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/ratings/pending
 * Get pending ratings for the current user (max 3)
 * Requires: requireAuth
 */
export async function handleGetPendingRatings(req, res) {
  try {
    const pending = await getPendingRatings(req.user.id);
    return sendJSON(res, 200, { ok: true, pending });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
