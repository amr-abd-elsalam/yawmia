// ═══════════════════════════════════════════════════════════════
// server/services/workroomAttachments.js — Workroom Attachments (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Metadata wrapper around existing imageStore.
// Stores binary/base64 image through imageStore, then returns safe metadata.
// Message JSON stores only imageRef metadata — never raw base64.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { sanitizeText } from './sanitizer.js';
import { eventBus } from './eventBus.js';

function isEnabled() {
  return !!(
    config.WORKROOM_V2 &&
    config.WORKROOM_V2.enabled &&
    config.WORKROOM_V2.attachmentsEnabled
  );
}

function nowIso() {
  return new Date().toISOString();
}

async function assertParticipant(jobId, userId) {
  const { resolveWorkroomAccess } = await import('./workroom.js');
  const access = await resolveWorkroomAccess(jobId, userId);

  if (!access.allowed) {
    const err = new Error(access.error || 'NOT_WORKROOM_PARTICIPANT');
    err.code = access.code || 'NOT_WORKROOM_PARTICIPANT';
    throw err;
  }

  return access;
}

export function sanitizeAttachmentMetadata(meta = {}) {
  const safe = {};

  if (meta.caption !== undefined && meta.caption !== null) {
    safe.caption = sanitizeText(String(meta.caption)).slice(0, 160);
  } else {
    safe.caption = null;
  }

  if (meta.clientName !== undefined && meta.clientName !== null) {
    safe.clientName = sanitizeText(String(meta.clientName)).slice(0, 160);
  } else {
    safe.clientName = null;
  }

  if (meta.purpose !== undefined && meta.purpose !== null) {
    safe.purpose = sanitizeText(String(meta.purpose)).slice(0, 80);
  } else {
    safe.purpose = 'workroom_attachment';
  }

  return safe;
}

export async function storeWorkroomAttachment(jobId, userId, base64DataUri, metadata = {}) {
  if (!isEnabled()) {
    return { ok: false, error: 'مرفقات مساحة العمل غير مفعّلة', code: 'ATTACHMENTS_DISABLED' };
  }

  if (!base64DataUri || typeof base64DataUri !== 'string') {
    return { ok: false, error: 'بيانات المرفق غير صالحة', code: 'INVALID_ATTACHMENT' };
  }

  await assertParticipant(jobId, userId);

  const safeMeta = sanitizeAttachmentMetadata(metadata);
  const { storeImage } = await import('./imageStore.js');

  const result = await storeImage(base64DataUri, {
    uploadedBy: userId,
    purpose: safeMeta.purpose || 'workroom_attachment',
  });

  if (!result || !result.ok) {
    return {
      ok: false,
      error: result?.error || 'تعذّر حفظ المرفق',
      code: result?.code || 'ATTACHMENT_STORE_FAILED',
    };
  }

  const attachment = {
    type: 'image',
    imageRef: result.imageRef,
    hash: result.hash || null,
    contentType: result.contentType || null,
    sizeBytes: result.sizeBytes || 0,
    caption: safeMeta.caption,
    clientName: safeMeta.clientName,
    uploadedBy: userId,
    uploadedAt: nowIso(),
  };

  eventBus.emit('workroom:attachment_added', {
    jobId,
    userId,
    imageRef: attachment.imageRef,
    timestamp: attachment.uploadedAt,
  });

  return { ok: true, attachment };
}

export async function attachToMessage(message, attachments) {
  if (!message || typeof message !== 'object') return message;

  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length === 0) {
    message.attachments = [];
    return message;
  }

  const max = config.WORKROOM_V2?.maxAttachmentsPerMessage || 3;
  const trimmed = list.slice(0, max);

  message.attachments = trimmed
    .filter(a => a && a.type === 'image' && a.imageRef)
    .map(a => ({
      type: 'image',
      imageRef: String(a.imageRef).slice(0, 80),
      caption: a.caption ? sanitizeText(String(a.caption)).slice(0, 160) : null,
      clientName: a.clientName ? sanitizeText(String(a.clientName)).slice(0, 160) : null,
      uploadedAt: a.uploadedAt || nowIso(),
    }));

  return message;
}

export function validateAttachmentList(attachments) {
  if (attachments === undefined || attachments === null) {
    return { ok: true, attachments: [] };
  }

  if (!Array.isArray(attachments)) {
    return { ok: false, error: 'المرفقات يجب أن تكون قائمة', code: 'INVALID_ATTACHMENTS' };
  }

  const max = config.WORKROOM_V2?.maxAttachmentsPerMessage || 3;
  if (attachments.length > max) {
    return { ok: false, error: `أقصى عدد للمرفقات هو ${max}`, code: 'MAX_ATTACHMENTS_EXCEEDED' };
  }

  for (const a of attachments) {
    if (!a || typeof a !== 'object' || a.type !== 'image' || !a.imageRef) {
      return { ok: false, error: 'مرفق غير صالح', code: 'INVALID_ATTACHMENT' };
    }
  }

  return { ok: true, attachments };
}

export const _testHelpers = {
  isEnabled,
  sanitizeAttachmentMetadata,
  validateAttachmentList,
  nowIso,
};
