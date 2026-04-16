// ═══════════════════════════════════════════════════════════════
// server/middleware/auth.js — Auth Middleware
// ═══════════════════════════════════════════════════════════════

import { verifySession } from '../services/sessions.js';
import { findById } from '../services/users.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * requireAuth middleware
 * Reads Authorization: Bearer <token>
 * Sets req.user and req.session
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
  }

  verifySession(token)
    .then((session) => {
      if (!session) {
        return sendJSON(res, 401, { error: 'الجلسة انتهت أو غير صالحة', code: 'SESSION_INVALID' });
      }
      return findById(session.userId).then((user) => {
        if (!user) {
          return sendJSON(res, 401, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
        }
        if (user.status !== 'active') {
          return sendJSON(res, 403, { error: 'الحساب موقوف', code: 'ACCOUNT_SUSPENDED' });
        }
        req.user = user;
        req.session = session;
        next();
      });
    })
    .catch((err) => {
      sendJSON(res, 500, { error: 'خطأ في التحقق من الجلسة', code: 'AUTH_ERROR' });
    });
}

/**
 * requireRole middleware factory
 * Must be used after requireAuth
 */
export function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
    }
    if (req.user.role !== role) {
      return sendJSON(res, 403, { error: 'غير مسموح بهذا الإجراء', code: 'FORBIDDEN' });
    }
    next();
  };
}

/**
 * requireAdmin middleware
 * Checks either admin role via session or ADMIN_TOKEN
 */
export function requireAdmin(req, res, next) {
  // Check via ADMIN_TOKEN header
  const adminToken = req.headers['x-admin-token'];
  if (adminToken && adminToken === process.env.ADMIN_TOKEN) {
    req.isAdmin = true;
    return next();
  }

  // Check via session (admin role)
  if (req.user && req.user.role === 'admin') {
    req.isAdmin = true;
    return next();
  }

  // If not authenticated at all, try auth first
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return sendJSON(res, 401, { error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' });
  }

  verifySession(token)
    .then((session) => {
      if (!session) {
        return sendJSON(res, 401, { error: 'الجلسة غير صالحة', code: 'SESSION_INVALID' });
      }
      return findById(session.userId).then((user) => {
        if (!user || user.role !== 'admin') {
          return sendJSON(res, 403, { error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' });
        }
        req.user = user;
        req.session = session;
        req.isAdmin = true;
        next();
      });
    })
    .catch(() => {
      sendJSON(res, 500, { error: 'خطأ في التحقق', code: 'AUTH_ERROR' });
    });
}
