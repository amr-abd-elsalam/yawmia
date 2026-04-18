// ═══════════════════════════════════════════════════════════════
// server/handlers/verificationHandler.js — Verification API Handlers
// ═══════════════════════════════════════════════════════════════

import { submitVerification, reviewVerification, listByUser, listAll } from '../services/verification.js';
import { sanitizeText } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/auth/verify-identity
 * Submit identity verification (requireAuth)
 */
export async function handleSubmitVerification(req, res) {
  const { nationalIdImage, selfieImage } = req.body || {};

  try {
    const result = await submitVerification(req.user.id, { nationalIdImage, selfieImage });

    if (!result.ok) {
      const statusMap = {
        VERIFICATION_DISABLED: 400,
        IMAGE_REQUIRED: 400,
        IMAGE_TOO_LARGE: 400,
        USER_NOT_FOUND: 404,
        ALREADY_VERIFIED: 409,
        ALREADY_PENDING: 409,
        COOLDOWN_ACTIVE: 429,
        DAILY_VERIFICATION_LIMIT: 429,
      };
      const httpStatus = statusMap[result.code] || 400;
      return sendJSON(res, httpStatus, result);
    }

    return sendJSON(res, 201, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تقديم طلب التحقق', code: 'VERIFICATION_SUBMIT_ERROR' });
  }
}

/**
 * GET /api/auth/verification-status
 * Get current user's verification status (requireAuth)
 */
export async function handleGetVerificationStatus(req, res) {
  try {
    const submissions = await listByUser(req.user.id);
    const latestSubmission = submissions.length > 0 ? submissions[0] : null;

    // Get fresh user data for verificationStatus
    const { findById } = await import('../services/users.js');
    const user = await findById(req.user.id);
    const verificationStatus = user ? (user.verificationStatus || 'unverified') : 'unverified';

    return sendJSON(res, 200, {
      ok: true,
      verificationStatus,
      latestSubmission: latestSubmission ? {
        id: latestSubmission.id,
        status: latestSubmission.status,
        adminNotes: latestSubmission.adminNotes,
        createdAt: latestSubmission.createdAt,
        reviewedAt: latestSubmission.reviewedAt,
      } : null,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب حالة التحقق', code: 'VERIFICATION_STATUS_ERROR' });
  }
}

/**
 * GET /api/users/:id/public-profile
 * Public profile view (no auth required)
 */
export async function handleGetPublicProfile(req, res) {
  const userId = req.params.id;

  try {
    const { findById } = await import('../services/users.js');
    const user = await findById(userId);

    if (!user) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    if (user.status === 'deleted') {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    // Build safe profile — NEVER expose phone, images, lat/lng, preferences
    const profile = {
      id: user.id,
      name: user.name || 'بدون اسم',
      role: user.role,
      governorate: user.governorate || '',
      categories: user.categories || [],
      rating: user.rating || { avg: 0, count: 0 },
      verificationStatus: user.verificationStatus || 'unverified',
      memberSince: user.createdAt,
    };

    // Optionally add trustScore (non-blocking)
    try {
      const { getUserTrustScore } = await import('../services/trust.js');
      const trustResult = await getUserTrustScore(userId);
      if (trustResult) {
        profile.trustScore = trustResult.score;
        profile.trustComponents = trustResult.components;
      }
    } catch (_) {
      // Non-blocking — trust score is optional
    }

    return sendJSON(res, 200, { ok: true, profile });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب البروفايل', code: 'PUBLIC_PROFILE_ERROR' });
  }
}

/**
 * GET /api/admin/verifications
 * List verifications with pagination + status filter (requireAdmin)
 */
export async function handleAdminListVerifications(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || undefined;

    const result = await listAll({ page, limit, status });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب طلبات التحقق', code: 'ADMIN_VERIFICATIONS_ERROR' });
  }
}

/**
 * PUT /api/admin/verifications/:id
 * Admin reviews a verification request (requireAdmin)
 */
export async function handleAdminReviewVerification(req, res) {
  const verificationId = req.params.id;
  const { status, adminNotes } = req.body || {};

  try {
    const sanitizedNotes = adminNotes ? sanitizeText(adminNotes) : undefined;

    const result = await reviewVerification(verificationId, {
      status,
      adminNotes: sanitizedNotes,
      reviewedBy: 'admin',
    });

    if (!result.ok) {
      const statusMap = {
        VERIFICATION_NOT_FOUND: 404,
        ALREADY_REVIEWED: 409,
        INVALID_VERIFICATION_STATUS: 400,
      };
      const httpStatus = statusMap[result.code] || 400;
      return sendJSON(res, httpStatus, result);
    }

    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في مراجعة طلب التحقق', code: 'ADMIN_REVIEW_ERROR' });
  }
}
