// ═══════════════════════════════════════════════════════════════
// server/handlers/workroomHandler.js — Workroom API Handlers (Phase 51)
// ═══════════════════════════════════════════════════════════════
// Job-scoped workroom endpoints.
// Builds on existing messages service without breaking old APIs.
// ═══════════════════════════════════════════════════════════════

import {
  getUserWorkrooms,
  getWorkroom,
  listWorkroomMessages,
  sendWorkroomMessage,
  markWorkroomRead,
  getWorkroomTimeline,
} from '../services/workroom.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  WORKROOM_DISABLED: 503,
  INVALID_REQUEST: 400,
  JOB_NOT_FOUND: 404,
  WORKROOM_NOT_AVAILABLE: 400,
  NOT_WORKROOM_PARTICIPANT: 403,
  TEXT_REQUIRED: 400,
  TEXT_TOO_LONG: 400,
  RECIPIENT_REQUIRED: 400,
  RECIPIENT_NOT_INVOLVED: 403,
  CANNOT_MESSAGE_SELF: 400,
  DAILY_MESSAGE_LIMIT: 429,
  CONTENT_BLOCKED: 400,
  MESSAGES_DISABLED: 503,
  JOB_STATUS_NOT_ELIGIBLE: 400,
  NOT_INVOLVED: 403,
  RECIPIENT_NOT_INVOLVED: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * GET /api/workrooms
 * List current user's workrooms.
 * Requires: requireAuth
 */
export async function handleListWorkrooms(req, res) {
  try {
    const result = await getUserWorkrooms(req.user.id, {
      status: req.query.status || undefined,
      activeOnly: req.query.activeOnly === 'false' ? false : true,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب مساحات العمل', code: 'WORKROOM_LIST_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id
 * Get one workroom by jobId.
 * Requires: requireAuth
 */
export async function handleGetWorkroom(req, res) {
  try {
    const jobId = req.params.id;
    const result = await getWorkroom(jobId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, workroom: result.workroom });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب مساحة العمل', code: 'WORKROOM_GET_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id/messages
 * List workroom messages.
 * Requires: requireAuth
 */
export async function handleListWorkroomMessages(req, res) {
  try {
    const jobId = req.params.id;
    const result = await listWorkroomMessages(jobId, req.user.id, {
      limit: Math.min(100, Math.max(1, parseInt(req.query.limit) || 50)),
      offset: Math.max(0, parseInt(req.query.offset) || 0),
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, {
      ok: true,
      items: result.items || [],
      total: result.total || 0,
      limit: result.limit || 50,
      offset: result.offset || 0,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب رسائل مساحة العمل', code: 'WORKROOM_MESSAGES_ERROR' });
  }
}

/**
 * POST /api/workrooms/:id/messages
 * Body: { text, recipientId?, templateKey? }
 * Requires: requireAuth
 */
export async function handleSendWorkroomMessage(req, res) {
  try {
    const jobId = req.params.id;
    const body = req.body || {};

    const result = await sendWorkroomMessage(jobId, req.user.id, {
      text: body.text,
      recipientId: body.recipientId || null,
      templateKey: body.templateKey || null,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 201, { ok: true, message: result.message });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إرسال رسالة مساحة العمل', code: 'WORKROOM_SEND_ERROR' });
  }
}

/**
 * POST /api/workrooms/:id/messages/read-all
 * Mark all workroom messages as read for current user.
 * Requires: requireAuth
 */
export async function handleMarkWorkroomRead(req, res) {
  try {
    const jobId = req.params.id;
    const result = await markWorkroomRead(jobId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, count: result.count || 0 });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تحديث قراءة الرسائل', code: 'WORKROOM_READ_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id/timeline
 * Get workroom timeline.
 * Requires: requireAuth
 */
export async function handleGetWorkroomTimeline(req, res) {
  try {
    const jobId = req.params.id;
    const result = await getWorkroomTimeline(jobId, req.user.id, {
      limit: Math.min(500, Math.max(1, parseInt(req.query.limit) || 200)),
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, {
      ok: true,
      timeline: result.timeline || [],
      total: result.total || 0,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل مساحة العمل', code: 'WORKROOM_TIMELINE_ERROR' });
  }
}
