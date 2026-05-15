// ═══════════════════════════════════════════════════════════════
// server/services/workroomPins.js — Workroom Pinned Messages (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Sidecar pinned messages per workroom/job.
// Storage: data/workrooms/pins/{jobId}.json
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
} from './database.js';
import { withLock } from './resourceLock.js';
import { sanitizeText } from './sanitizer.js';
import { eventBus } from './eventBus.js';

function isEnabled() {
  return !!(config.WORKROOM_V2 && config.WORKROOM_V2.enabled && config.WORKROOM_V2.pinsEnabled);
}

function nowIso() {
  return new Date().toISOString();
}

function pinsPath(jobId) {
  return getRecordPath('workroom_pins', jobId);
}

function emptyPins(jobId) {
  return {
    jobId,
    pins: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

async function getMessage(messageId) {
  if (!messageId || typeof messageId !== 'string') return null;
  const { readJSON: readJSONFn, getRecordPath: getRecordPathFn } = await import('./database.js');
  return await readJSONFn(getRecordPathFn('messages', messageId));
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

function canPin(access) {
  // Phase 53: employer-only pinning by default.
  return access && access.role === 'employer';
}

function publicPin(pin, message) {
  return {
    id: pin.id,
    jobId: pin.jobId,
    messageId: pin.messageId,
    pinnedBy: pin.pinnedBy,
    note: pin.note || null,
    pinnedAt: pin.pinnedAt,
    message: message ? {
      id: message.id,
      senderId: message.senderId,
      senderRole: message.senderRole,
      text: message.text,
      createdAt: message.createdAt,
      source: message.source || 'job_messages',
      attachments: message.attachments || [],
    } : null,
  };
}

export async function listPins(jobId, userId) {
  if (!isEnabled()) return { ok: true, pins: [], total: 0 };

  await assertParticipant(jobId, userId);

  const data = (await readJSON(pinsPath(jobId))) || emptyPins(jobId);
  const pins = Array.isArray(data.pins) ? data.pins : [];

  const enriched = [];
  for (const pin of pins) {
    const msg = await getMessage(pin.messageId);
    enriched.push(publicPin(pin, msg));
  }

  enriched.sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));

  return {
    ok: true,
    pins: enriched,
    total: enriched.length,
  };
}

export async function isPinned(jobId, messageId) {
  if (!isEnabled()) return false;
  const data = await readJSON(pinsPath(jobId));
  if (!data || !Array.isArray(data.pins)) return false;
  return data.pins.some(p => p.messageId === messageId);
}

export async function pinMessage(jobId, messageId, userId, note) {
  if (!isEnabled()) {
    return { ok: false, error: 'تثبيت الرسائل غير مفعّل', code: 'PINS_DISABLED' };
  }

  const access = await assertParticipant(jobId, userId);
  if (!canPin(access)) {
    return { ok: false, error: 'التثبيت متاح لصاحب العمل فقط حالياً', code: 'PIN_FORBIDDEN' };
  }

  const message = await getMessage(messageId);
  if (!message || message.jobId !== jobId) {
    return { ok: false, error: 'الرسالة غير موجودة في مساحة العمل', code: 'MESSAGE_NOT_FOUND' };
  }

  return withLock(`workroom-pins:${jobId}`, async () => {
    const filePath = pinsPath(jobId);
    const data = (await readJSON(filePath)) || emptyPins(jobId);
    data.pins = Array.isArray(data.pins) ? data.pins : [];

    const existing = data.pins.find(p => p.messageId === messageId);
    if (existing) {
      return { ok: true, pin: publicPin(existing, message), idempotent: true };
    }

    const max = config.WORKROOM_V2?.maxPinnedMessagesPerWorkroom || 5;
    if (data.pins.length >= max) {
      return { ok: false, error: `أقصى عدد للرسائل المثبتة هو ${max}`, code: 'MAX_PINS_REACHED' };
    }

    const pin = {
      id: `pin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      jobId,
      messageId,
      pinnedBy: userId,
      note: note ? sanitizeText(String(note)).slice(0, 300) : null,
      pinnedAt: nowIso(),
    };

    data.pins.push(pin);
    data.updatedAt = nowIso();
    if (!data.createdAt) data.createdAt = data.updatedAt;

    await atomicWrite(filePath, data);

    eventBus.emit('workroom:message_pinned', {
      jobId,
      messageId,
      pinnedBy: userId,
      timestamp: pin.pinnedAt,
    });

    return { ok: true, pin: publicPin(pin, message), idempotent: false };
  });
}

export async function unpinMessage(jobId, messageId, userId) {
  if (!isEnabled()) {
    return { ok: false, error: 'تثبيت الرسائل غير مفعّل', code: 'PINS_DISABLED' };
  }

  const access = await assertParticipant(jobId, userId);
  if (!canPin(access)) {
    return { ok: false, error: 'إلغاء التثبيت متاح لصاحب العمل فقط حالياً', code: 'PIN_FORBIDDEN' };
  }

  return withLock(`workroom-pins:${jobId}`, async () => {
    const filePath = pinsPath(jobId);
    const data = (await readJSON(filePath)) || emptyPins(jobId);
    data.pins = Array.isArray(data.pins) ? data.pins : [];

    const before = data.pins.length;
    data.pins = data.pins.filter(p => p.messageId !== messageId);

    if (data.pins.length === before) {
      return { ok: true, removed: false };
    }

    data.updatedAt = nowIso();
    await atomicWrite(filePath, data);

    eventBus.emit('workroom:message_unpinned', {
      jobId,
      messageId,
      unpinnedBy: userId,
      timestamp: data.updatedAt,
    });

    return { ok: true, removed: true };
  });
}

export const _testHelpers = {
  isEnabled,
  pinsPath,
  emptyPins,
  publicPin,
  canPin,
};
