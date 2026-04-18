// ═══════════════════════════════════════════════════════════════
// server/handlers/sseHandler.js — SSE Notification Stream
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { addConnection, formatSSE } from '../services/sseManager.js';
import { countUnread } from '../services/notifications.js';
import { verifySession } from '../services/sessions.js';
import { findById } from '../services/users.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/notifications/stream
 * Self-authenticated SSE endpoint
 * Token via Authorization: Bearer <token> OR ?token= query param
 */
export async function handleNotificationStream(req, res) {
  // ── Feature flag check ──
  if (!config.SSE.enabled) {
    return sendJSON(res, 503, { error: 'خدمة الإشعارات الفورية غير مفعّلة', code: 'SSE_DISABLED' });
  }

  // ── Self-authentication (must happen BEFORE writing SSE headers) ──
  let token = null;

  // Try Authorization header first
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fallback: query parameter
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
  }

  // Verify session
  const session = await verifySession(token);
  if (!session) {
    return sendJSON(res, 401, { error: 'الجلسة انتهت أو غير صالحة', code: 'SESSION_INVALID' });
  }

  // Load user
  const user = await findById(session.userId);
  if (!user) {
    return sendJSON(res, 401, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
  }

  if (user.status === 'banned') {
    return sendJSON(res, 403, { error: 'تم حظر حسابك', code: 'USER_BANNED' });
  }

  if (user.status === 'deleted') {
    return sendJSON(res, 403, { error: 'تم حذف هذا الحساب', code: 'ACCOUNT_DELETED' });
  }

  if (user.status !== 'active') {
    return sendJSON(res, 403, { error: 'الحساب موقوف', code: 'ACCOUNT_SUSPENDED' });
  }

  // ── Auth passed — write SSE headers ──

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // Disable nginx buffering
  });

  // ── Bypass request timeout for SSE connections ──
  if (req.socket) {
    req.socket.setTimeout(0);
  }

  // ── Send retry interval suggestion ──
  res.write(`retry: ${config.SSE.reconnectMs}\n\n`);

  // ── Send init event with unread count ──
  let unreadCount = 0;
  try {
    unreadCount = await countUnread(user.id);
  } catch (_) {
    // Non-blocking
  }

  res.write(formatSSE('init', { unreadCount, userId: user.id }));

  // ── Register connection ──
  const lastEventId = req.headers['last-event-id'] || null;
  addConnection(user.id, res, lastEventId);
}
