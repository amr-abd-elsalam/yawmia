// ═══════════════════════════════════════════════════════════════
// server/handlers/messagesHandler.js — Messaging API Handlers
// ═══════════════════════════════════════════════════════════════

import {
  sendMessage, broadcastMessage, listByJob, markAsRead,
  markAllAsRead, countUnread, canMessage,
} from '../services/messages.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  MESSAGES_DISABLED: 503,
  JOB_NOT_FOUND: 404,
  JOB_STATUS_NOT_ELIGIBLE: 400,
  NOT_INVOLVED: 403,
  TEXT_REQUIRED: 400,
  TEXT_TOO_LONG: 400,
  RECIPIENT_REQUIRED: 400,
  RECIPIENT_NOT_INVOLVED: 400,
  CANNOT_MESSAGE_SELF: 400,
  DAILY_MESSAGE_LIMIT: 429,
  BROADCAST_DISABLED: 503,
  NOT_JOB_OWNER: 403,
  NO_ACCEPTED_WORKERS: 400,
  MESSAGE_NOT_FOUND: 404,
  NOT_MESSAGE_RECIPIENT: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/jobs/:id/messages
 * Send a message to a specific user on a job
 * Requires: requireAuth
 */
export async function handleSendMessage(req, res) {
  try {
    const jobId = req.params.id;
    const senderId = req.user.id;
    const body = req.body || {};

    const result = await sendMessage(jobId, senderId, {
      recipientId: body.recipientId,
      text: body.text,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, message: result.message });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/messages/broadcast
 * Broadcast a message to all accepted workers on a job
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleBroadcastMessage(req, res) {
  try {
    const jobId = req.params.id;
    const employerId = req.user.id;
    const body = req.body || {};

    const result = await broadcastMessage(jobId, employerId, body.text);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, message: result.message });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/jobs/:id/messages
 * List messages for a job (only messages the user can see)
 * Requires: requireAuth
 */
export async function handleListJobMessages(req, res) {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    // Verify user is involved
    const check = await canMessage(jobId, userId);
    if (!check.allowed) {
      return sendJSON(res, errorStatus(check.code), { error: check.error, code: check.code });
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const result = await listByJob(jobId, userId, { limit, offset });

    sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/messages/unread-count
 * Get total unread message count for the authenticated user
 * Requires: requireAuth
 */
export async function handleGetUnreadCount(req, res) {
  try {
    const count = await countUnread(req.user.id);
    sendJSON(res, 200, { ok: true, unread: count });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/messages/:id/read
 * Mark a single message as read
 * Requires: requireAuth
 */
export async function handleMarkMessageRead(req, res) {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;

    const result = await markAsRead(messageId, userId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, message: result.message });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/jobs/:id/messages/read-all
 * Mark all messages in a job as read for the authenticated user
 * Requires: requireAuth
 */
export async function handleMarkAllJobMessagesRead(req, res) {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    const result = await markAllAsRead(jobId, userId);

    sendJSON(res, 200, result);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
