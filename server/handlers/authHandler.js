// ═══════════════════════════════════════════════════════════════
// server/handlers/authHandler.js — Auth Endpoints
// ═══════════════════════════════════════════════════════════════

import { sendOtp, verifyOtp } from '../services/auth.js';
import { update as updateUser, findById } from '../services/users.js';
import { destroySession } from '../services/sessions.js';
import { validatePhone, validateOtp, validateRole, validateProfileFields, validateLatitude, validateLongitude } from '../services/validators.js';
import { sanitizeFields } from '../services/sanitizer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/auth/send-otp
 * Body: { phone, role }
 */
export async function handleSendOtp(req, res) {
  const { phone, role } = req.body || {};

  const phoneResult = validatePhone(phone);
  if (!phoneResult.valid) {
    return sendJSON(res, 400, { error: phoneResult.error, code: 'INVALID_PHONE' });
  }

  const roleResult = validateRole(role);
  if (!roleResult.valid) {
    return sendJSON(res, 400, { error: roleResult.error, code: 'INVALID_ROLE' });
  }

  // Don't allow admin registration via OTP
  if (role === 'admin') {
    return sendJSON(res, 403, { error: 'لا يمكن تسجيل حساب أدمن من هنا', code: 'ADMIN_REGISTRATION_FORBIDDEN' });
  }

  try {
    const result = await sendOtp(phone, role);
    if (!result.ok) {
      const statusCode = result.code === 'PHONE_OTP_RATE_LIMITED' ? 429 : 400;
      return sendJSON(res, statusCode, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إرسال الكود', code: 'OTP_SEND_ERROR' });
  }
}

/**
 * POST /api/auth/verify-otp
 * Body: { phone, otp }
 */
export async function handleVerifyOtp(req, res) {
  const { phone, otp } = req.body || {};

  const phoneResult = validatePhone(phone);
  if (!phoneResult.valid) {
    return sendJSON(res, 400, { error: phoneResult.error, code: 'INVALID_PHONE' });
  }

  const otpResult = validateOtp(otp);
  if (!otpResult.valid) {
    return sendJSON(res, 400, { error: otpResult.error, code: 'INVALID_OTP' });
  }

  try {
    // Extract metadata for session tracking
    const sessionMetadata = {
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await verifyOtp(phone, otp, sessionMetadata);
    if (!result.ok) {
      return sendJSON(res, 401, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في التحقق من الكود', code: 'OTP_VERIFY_ERROR' });
  }
}

/**
 * GET /api/auth/me
 * Requires: auth token
 */
export async function handleGetMe(req, res) {
  const user = req.user;

  // Calculate profile completeness
  let profileCompleteness = null;
  try {
    const { calculateCompleteness } = await import('../services/profileCompleteness.js');
    profileCompleteness = calculateCompleteness(user);
  } catch (_) {
    // Non-blocking — completeness is optional enrichment
  }

  return sendJSON(res, 200, {
    ok: true,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
      governorate: user.governorate,
      categories: user.categories,
      lat: user.lat || null,
      lng: user.lng || null,
      rating: user.rating,
      status: user.status,
      notificationPreferences: user.notificationPreferences || null,
      availability: user.availability || null,
      createdAt: user.createdAt,
      profileCompleteness: profileCompleteness,
    },
  });
}

/**
 * PUT /api/auth/profile
 * Body: { name?, governorate?, categories? }
 * Requires: auth token
 */
export async function handleUpdateProfile(req, res) {
  const userId = req.user.id;
  const body = req.body || {};

  const result = validateProfileFields(body, req.user.role);
  if (!result.valid) {
    return sendJSON(res, 400, { error: result.errors.join('. '), code: 'INVALID_PROFILE' });
  }

  // Sanitize + build update fields
  const sanitized = sanitizeFields(body, ['name']);
  const updateFields = {};
  if (sanitized.name !== undefined) updateFields.name = sanitized.name.trim();
  if (body.governorate !== undefined) updateFields.governorate = body.governorate;
  if (body.categories !== undefined) updateFields.categories = body.categories;

  // Validate and add lat/lng if provided
  if (body.lat !== undefined && body.lat !== null && body.lat !== '') {
    const latResult = validateLatitude(body.lat);
    if (!latResult.valid) {
      return sendJSON(res, 400, { error: latResult.error, code: 'INVALID_LATITUDE' });
    }
    updateFields.lat = latResult.value;
  }
  if (body.lng !== undefined && body.lng !== null && body.lng !== '') {
    const lngResult = validateLongitude(body.lng);
    if (!lngResult.valid) {
      return sendJSON(res, 400, { error: lngResult.error, code: 'INVALID_LONGITUDE' });
    }
    updateFields.lng = lngResult.value;
  }

  // Handle availability update (workers only)
  if (body.availability && typeof body.availability === 'object' && req.user.role === 'worker') {
    const currentAvailability = req.user.availability || {};
    const updatedAvailability = {
      available: typeof body.availability.available === 'boolean'
        ? body.availability.available
        : (currentAvailability.available !== undefined ? currentAvailability.available : true),
      availableFrom: body.availability.availableFrom || currentAvailability.availableFrom || null,
      availableUntil: body.availability.availableUntil || currentAvailability.availableUntil || null,
      updatedAt: new Date().toISOString(),
    };
    updateFields.availability = updatedAvailability;
  }

  // Handle notification preferences update
  if (body.notificationPreferences && typeof body.notificationPreferences === 'object') {
    const { updateNotificationPreferences } = await import('../services/users.js');
    const prefsResult = await updateNotificationPreferences(userId, body.notificationPreferences);
    if (prefsResult) {
      if (Object.keys(updateFields).length === 0) {
        return sendJSON(res, 200, {
          ok: true,
          user: {
            id: prefsResult.id,
            phone: prefsResult.phone,
            role: prefsResult.role,
            name: prefsResult.name,
            governorate: prefsResult.governorate,
            categories: prefsResult.categories,
            lat: prefsResult.lat || null,
            lng: prefsResult.lng || null,
            rating: prefsResult.rating,
            status: prefsResult.status,
            notificationPreferences: prefsResult.notificationPreferences || null,
          },
        });
      }
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return sendJSON(res, 400, { error: 'لا توجد بيانات للتحديث', code: 'NO_FIELDS' });
  }

  try {
    const updatedUser = await updateUser(userId, updateFields);
    if (!updatedUser) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }
    return sendJSON(res, 200, {
      ok: true,
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        role: updatedUser.role,
        name: updatedUser.name,
        governorate: updatedUser.governorate,
        categories: updatedUser.categories,
        lat: updatedUser.lat || null,
        lng: updatedUser.lng || null,
        rating: updatedUser.rating,
        status: updatedUser.status,
        notificationPreferences: updatedUser.notificationPreferences || null,
      },
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث البيانات', code: 'UPDATE_ERROR' });
  }
}

/**
 * POST /api/auth/logout
 * Requires: auth token
 */
export async function handleLogout(req, res) {
  try {
    await destroySession(req.session.token);
    return sendJSON(res, 200, { ok: true, message: 'تم تسجيل الخروج' });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تسجيل الخروج', code: 'LOGOUT_ERROR' });
  }
}

/**
 * POST /api/auth/logout-all — Destroy all sessions for the current user
 */
export async function handleLogoutAll(req, res) {
  try {
    const { destroyAllByUser } = await import('../services/sessions.js');
    const destroyed = await destroyAllByUser(req.user.id);

    return sendJSON(res, 200, {
      ok: true,
      message: 'تم تسجيل الخروج من كل الأجهزة',
      sessionsDestroyed: destroyed,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/auth/accept-terms
 * Accept terms of service
 * Requires: auth token
 */
export async function handleAcceptTerms(req, res) {
  try {
    const { default: config } = await import('../../config.js');
    const { acceptTerms } = await import('../services/users.js');

    const updatedUser = await acceptTerms(req.user.id, config.TRUST.termsVersion);
    if (!updatedUser) {
      return sendJSON(res, 404, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
    }

    return sendJSON(res, 200, {
      ok: true,
      message: 'تم قبول الشروط والأحكام',
      termsVersion: updatedUser.termsVersion,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ داخلي', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/auth/account
 * Soft-delete user account
 * Requires: auth token
 */
export async function handleDeleteAccount(req, res) {
  try {
    const { softDelete } = await import('../services/users.js');
    const { destroyAllByUser } = await import('../services/sessions.js');

    const deletedUser = await softDelete(req.user.id);
    if (!deletedUser) {
      return sendJSON(res, 400, { error: 'لا يمكن حذف هذا الحساب', code: 'DELETE_FAILED' });
    }

    // Destroy all sessions (fire-and-forget)
    await destroyAllByUser(req.user.id).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      message: 'تم حذف الحساب. بياناتك هتتحذف نهائياً خلال 90 يوم.',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في حذف الحساب', code: 'DELETE_ACCOUNT_ERROR' });
  }
}
