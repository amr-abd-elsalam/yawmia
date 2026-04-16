// ═══════════════════════════════════════════════════════════════
// server/handlers/notificationsHandler.js — Notification Endpoints
// ═══════════════════════════════════════════════════════════════

import { listByUser, markAsRead, markAllAsRead } from '../services/notifications.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/notifications
 * Requires: auth
 * Query: ?limit=20&offset=0
 */
export async function handleListNotifications(req, res) {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = Math.max(0, parseInt(req.query.offset) || 0);

  try {
    const result = await listByUser(req.user.id, { limit, offset });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب الإشعارات', code: 'LIST_NOTIFICATIONS_ERROR' });
  }
}

/**
 * POST /api/notifications/:id/read
 * Requires: auth
 */
export async function handleMarkAsRead(req, res) {
  const notificationId = req.params.id;

  try {
    const result = await markAsRead(notificationId, req.user.id);
    if (!result.ok) {
      const status = result.code === 'NOTIFICATION_NOT_FOUND' ? 404 : 403;
      return sendJSON(res, status, result);
    }
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث الإشعار', code: 'MARK_READ_ERROR' });
  }
}

/**
 * POST /api/notifications/read-all
 * Requires: auth
 */
export async function handleMarkAllAsRead(req, res) {
  try {
    const result = await markAllAsRead(req.user.id);
    return sendJSON(res, 200, result);
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث الإشعارات', code: 'MARK_ALL_READ_ERROR' });
  }
}
