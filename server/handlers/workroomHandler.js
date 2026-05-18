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
  getWorkroomSummary,
  resolveWorkroomAccess,
} from '../services/workroom.js';
import { eventBus } from '../services/eventBus.js';

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
  READ_RECEIPTS_DISABLED: 503,
  MESSAGE_NOT_FOUND: 404,
  QUERY_TOO_SHORT: 400,
  PINS_DISABLED: 503,
  PIN_FORBIDDEN: 403,
  MAX_PINS_REACHED: 429,
  CHECKLIST_DISABLED: 503,
  CHECKLIST_FORBIDDEN: 403,
  CHECKLIST_ITEM_NOT_FOUND: 404,
  MAX_CHECKLIST_ITEMS: 429,
  INVALID_ASSIGNEE: 400,
  INVALID_STATUS: 400,
  ATTACHMENTS_DISABLED: 503,
  INVALID_ATTACHMENT: 400,
  ATTACHMENT_STORE_FAILED: 400,
  MAX_ATTACHMENTS_EXCEEDED: 400,
  INVALID_ATTACHMENTS: 400,
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

    try {
      eventBus.emit('workroom:opened', {
        jobId,
        userId: req.user.id,
        role: result.workroom?.userRoleInWorkroom || req.user.role,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

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
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:message_sent', {
        jobId,
        userId: req.user.id,
        senderId: req.user.id,
        role: result.message?.senderRole || req.user.role,
        messageId: result.message?.id || null,
        hasAttachments: Array.isArray(result.message?.attachments) && result.message.attachments.length > 0,
        templateKey: result.message?.templateKey || null,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

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
      type: req.query.type || undefined,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:timeline_viewed', {
        jobId,
        userId: req.user.id,
        role: req.user.role,
        total: result.total || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 200, {
      ok: true,
      timeline: result.timeline || [],
      total: result.total || 0,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل مساحة العمل', code: 'WORKROOM_TIMELINE_ERROR' });
  }
}


/**
 * GET /api/workrooms/:id/search?q=&limit=
 * Search visible workroom messages.
 * Requires: requireAuth
 */
export async function handleSearchWorkroomMessages(req, res) {
  try {
    const jobId = req.params.id;
    const q = req.query.q || '';

    if (!q || String(q).trim().length < 2) {
      return sendJSON(res, 400, { error: 'كلمة البحث لازم تكون حرفين على الأقل', code: 'QUERY_TOO_SHORT' });
    }

    const access = await resolveWorkroomAccess(jobId, req.user.id);
    if (!access.allowed) {
      return sendJSON(res, errorStatus(access.code), { error: access.error, code: access.code });
    }

    const { searchWorkroomMessages } = await import('../services/workroomSearch.js');

    const result = await searchWorkroomMessages(jobId, q, {
      userId: req.user.id,
      limit: parseInt(req.query.limit) || 50,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في البحث داخل مساحة العمل', code: 'WORKROOM_SEARCH_ERROR' });
  }
}

/**
 * GET /api/workrooms/:id/read-receipts
 * Get read receipts for the workroom.
 * Requires: requireAuth
 */
export async function handleGetWorkroomReadReceipts(req, res) {
  try {
    const jobId = req.params.id;

    const access = await resolveWorkroomAccess(jobId, req.user.id);
    if (!access.allowed) {
      return sendJSON(res, errorStatus(access.code), { error: access.error, code: access.code });
    }

    const { getReadReceipts } = await import('../services/workroomReceipts.js');
    const receipts = await getReadReceipts(jobId);

    return sendJSON(res, 200, { ok: true, receipts });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب قراءات الرسائل', code: 'WORKROOM_RECEIPTS_ERROR' });
  }
}

/**
 * POST /api/workrooms/:id/messages/:messageId/read
 * Mark a single message as read in the workroom receipts sidecar.
 * Requires: requireAuth
 */
export async function handleMarkWorkroomMessageRead(req, res) {
  try {
    const jobId = req.params.id;
    const messageId = req.params.messageId;

    const { markMessageRead } = await import('../services/workroomReceipts.js');
    const result = await markMessageRead(jobId, messageId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    const code = err.code || 'WORKROOM_MESSAGE_READ_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في تعليم الرسالة كمقروءة', code });
  }
}


/**
 * GET /api/workrooms/:id/pins
 */
export async function handleListWorkroomPins(req, res) {
  try {
    const { listPins } = await import('../services/workroomPins.js');
    const result = await listPins(req.params.id, req.user.id);
    return sendJSON(res, 200, { ok: true, pins: result.pins || [], total: result.total || 0 });
  } catch (err) {
    const code = err.code || 'WORKROOM_PINS_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في جلب الرسائل المثبتة', code });
  }
}

/**
 * POST /api/workrooms/:id/pins
 * Body: { messageId, note? }
 */
export async function handlePinWorkroomMessage(req, res) {
  try {
    const { pinMessage } = await import('../services/workroomPins.js');
    const body = req.body || {};
    const messageId = body.messageId;

    if (!messageId || typeof messageId !== 'string') {
      return sendJSON(res, 400, { error: 'معرّف الرسالة مطلوب', code: 'MESSAGE_ID_REQUIRED' });
    }

    const result = await pinMessage(req.params.id, messageId, req.user.id, body.note || null);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:message_pinned', {
        jobId: req.params.id,
        userId: req.user.id,
        role: req.user.role,
        messageId,
        idempotent: !!result.idempotent,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 201, { ok: true, pin: result.pin, idempotent: !!result.idempotent });
  } catch (err) {
    const code = err.code || 'WORKROOM_PIN_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في تثبيت الرسالة', code });
  }
}

/**
 * DELETE /api/workrooms/:id/pins/:messageId
 */
export async function handleUnpinWorkroomMessage(req, res) {
  try {
    const { unpinMessage } = await import('../services/workroomPins.js');
    const result = await unpinMessage(req.params.id, req.params.messageId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, removed: !!result.removed });
  } catch (err) {
    const code = err.code || 'WORKROOM_UNPIN_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في إلغاء تثبيت الرسالة', code });
  }
}

/**
 * GET /api/workrooms/:id/checklist
 */
export async function handleGetWorkroomChecklist(req, res) {
  try {
    const { getChecklist } = await import('../services/workroomChecklist.js');
    const result = await getChecklist(req.params.id, req.user.id);
    return sendJSON(res, 200, { ok: true, checklist: result.checklist });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في جلب قائمة المهام', code });
  }
}

/**
 * POST /api/workrooms/:id/checklist
 * Body: { text, assignedTo? }
 */
export async function handleCreateWorkroomChecklistItem(req, res) {
  try {
    const { createChecklistItem } = await import('../services/workroomChecklist.js');
    const result = await createChecklistItem(req.params.id, req.user.id, req.body || {});

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:checklist_item_created', {
        jobId: req.params.id,
        userId: req.user.id,
        role: req.user.role,
        itemId: result.item?.id || null,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 201, { ok: true, item: result.item });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_CREATE_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في إنشاء المهمة', code });
  }
}

/**
 * PUT /api/workrooms/:id/checklist/:itemId
 * Body: { text?, status?, assignedTo? }
 */
export async function handleUpdateWorkroomChecklistItem(req, res) {
  try {
    const { updateChecklistItem } = await import('../services/workroomChecklist.js');
    const result = await updateChecklistItem(req.params.id, req.params.itemId, req.user.id, req.body || {});

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      if (result.item && result.item.status === 'completed') {
        eventBus.emit('workroom:checklist_item_completed', {
          jobId: req.params.id,
          userId: req.user.id,
          role: req.user.role,
          itemId: result.item.id || req.params.itemId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (_) {}

    return sendJSON(res, 200, { ok: true, item: result.item });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_UPDATE_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في تحديث المهمة', code });
  }
}

/**
 * DELETE /api/workrooms/:id/checklist/:itemId
 */
export async function handleDeleteWorkroomChecklistItem(req, res) {
  try {
    const { deleteChecklistItem } = await import('../services/workroomChecklist.js');
    const result = await deleteChecklistItem(req.params.id, req.params.itemId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, deleted: true });
  } catch (err) {
    const code = err.code || 'WORKROOM_CHECKLIST_DELETE_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في حذف المهمة', code });
  }
}


/**
 * POST /api/workrooms/:id/attachments
 * Body: { dataUri, caption?, clientName? }
 * Requires: requireAuth
 */
export async function handleUploadWorkroomAttachment(req, res) {
  try {
    const jobId = req.params.id;
    const body = req.body || {};

    if (!body.dataUri || typeof body.dataUri !== 'string') {
      return sendJSON(res, 400, { error: 'بيانات المرفق مطلوبة', code: 'INVALID_ATTACHMENT' });
    }

    const { storeWorkroomAttachment } = await import('../services/workroomAttachments.js');

    const result = await storeWorkroomAttachment(jobId, req.user.id, body.dataUri, {
      caption: body.caption || null,
      clientName: body.clientName || null,
      purpose: 'workroom_attachment',
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    try {
      eventBus.emit('workroom:attachment_uploaded', {
        jobId,
        userId: req.user.id,
        role: req.user.role,
        attachmentType: result.attachment?.type || 'image',
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    return sendJSON(res, 201, { ok: true, attachment: result.attachment });
  } catch (err) {
    const code = err.code || 'WORKROOM_ATTACHMENT_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في رفع المرفق', code });
  }
}

/**
 * GET /api/workrooms/:id/summary
 * Requires: requireAuth
 */
export async function handleGetWorkroomSummary(req, res) {
  try {
    const result = await getWorkroomSummary(req.params.id, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    return sendJSON(res, 200, { ok: true, summary: result.summary });
  } catch (err) {
    const code = err.code || 'WORKROOM_SUMMARY_ERROR';
    return sendJSON(res, errorStatus(code), { error: err.message || 'خطأ في جلب ملخص مساحة العمل', code });
  }
}
