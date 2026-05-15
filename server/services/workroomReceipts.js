// ═══════════════════════════════════════════════════════════════
// server/services/workroomReceipts.js — Workroom Read Receipts (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Sidecar read receipts per workroom/job.
// Storage: data/workrooms/receipts/{jobId}.json
// Does NOT mutate old message files. Existing messages.read remains compatible.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';

function isEnabled() {
  return !!(config.WORKROOM_V2 && config.WORKROOM_V2.enabled && config.WORKROOM_V2.readReceiptsEnabled);
}

function nowIso() {
  return new Date().toISOString();
}

function receiptPath(jobId) {
  return getRecordPath('workroom_receipts', jobId);
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

async function messageBelongsToJob(jobId, messageId) {
  if (!jobId || !messageId) return false;
  const { readJSON: readJSONFn, getRecordPath: getRecordPathFn } = await import('./database.js');
  const msg = await readJSONFn(getRecordPathFn('messages', messageId));
  return !!(msg && msg.jobId === jobId);
}

function emptyReceipt(jobId) {
  return {
    jobId,
    messages: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export async function getReadReceipts(jobId) {
  if (!isEnabled()) return emptyReceipt(jobId);
  const data = await readJSON(receiptPath(jobId));
  if (!data || typeof data !== 'object') return emptyReceipt(jobId);
  return {
    jobId,
    messages: data.messages || {},
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getMessageReceipt(jobId, messageId) {
  const receipts = await getReadReceipts(jobId);
  return receipts.messages?.[messageId] || { readBy: {} };
}

export async function markMessageRead(jobId, messageId, userId) {
  if (!isEnabled()) {
    return { ok: false, code: 'READ_RECEIPTS_DISABLED', error: 'Read receipts disabled' };
  }

  await assertParticipant(jobId, userId);

  const belongs = await messageBelongsToJob(jobId, messageId);
  if (!belongs) {
    return { ok: false, code: 'MESSAGE_NOT_FOUND', error: 'الرسالة غير موجودة في مساحة العمل' };
  }

  return withLock(`workroom-receipts:${jobId}`, async () => {
    const filePath = receiptPath(jobId);
    const receipts = (await readJSON(filePath)) || emptyReceipt(jobId);

    if (!receipts.messages) receipts.messages = {};
    if (!receipts.messages[messageId]) {
      receipts.messages[messageId] = { readBy: {} };
    }
    if (!receipts.messages[messageId].readBy) {
      receipts.messages[messageId].readBy = {};
    }

    const alreadyReadAt = receipts.messages[messageId].readBy[userId] || null;
    if (!alreadyReadAt) {
      receipts.messages[messageId].readBy[userId] = nowIso();
      receipts.updatedAt = nowIso();
      if (!receipts.createdAt) receipts.createdAt = receipts.updatedAt;

      await atomicWrite(filePath, receipts);

      eventBus.emit('workroom:message_read', {
        jobId,
        messageId,
        userId,
        readAt: receipts.messages[messageId].readBy[userId],
      });
    }

    return {
      ok: true,
      messageId,
      readAt: receipts.messages[messageId].readBy[userId],
      idempotent: !!alreadyReadAt,
    };
  });
}

export async function markAllVisibleRead(jobId, userId, messageIds) {
  if (!isEnabled()) {
    return { ok: false, code: 'READ_RECEIPTS_DISABLED', error: 'Read receipts disabled', count: 0 };
  }

  await assertParticipant(jobId, userId);

  const ids = Array.isArray(messageIds)
    ? Array.from(new Set(messageIds.filter(id => typeof id === 'string')))
    : [];

  if (ids.length === 0) return { ok: true, count: 0 };

  return withLock(`workroom-receipts:${jobId}`, async () => {
    const filePath = receiptPath(jobId);
    const receipts = (await readJSON(filePath)) || emptyReceipt(jobId);
    const now = nowIso();

    if (!receipts.messages) receipts.messages = {};

    let count = 0;

    for (const messageId of ids) {
      const belongs = await messageBelongsToJob(jobId, messageId);
      if (!belongs) continue;

      if (!receipts.messages[messageId]) receipts.messages[messageId] = { readBy: {} };
      if (!receipts.messages[messageId].readBy) receipts.messages[messageId].readBy = {};

      if (!receipts.messages[messageId].readBy[userId]) {
        receipts.messages[messageId].readBy[userId] = now;
        count++;
      }
    }

    if (count > 0) {
      receipts.updatedAt = now;
      if (!receipts.createdAt) receipts.createdAt = now;
      await atomicWrite(filePath, receipts);

      eventBus.emit('workroom:messages_read', {
        jobId,
        userId,
        count,
        readAt: now,
      });
    }

    return { ok: true, count };
  });
}

export async function enrichMessagesWithReceipts(jobId, messages, viewerId) {
  if (!Array.isArray(messages) || messages.length === 0) return messages || [];

  if (!isEnabled()) {
    return messages.map(m => ({
      ...m,
      readReceipt: null,
    }));
  }

  const receipts = await getReadReceipts(jobId);
  const receiptMap = receipts.messages || {};

  return messages.map(msg => {
    const msgReceipt = receiptMap[msg.id] || { readBy: {} };
    const readBy = msgReceipt.readBy || {};
    const viewerReadAt = viewerId ? (readBy[viewerId] || null) : null;

    return {
      ...msg,
      readReceipt: {
        readBy,
        viewerReadAt,
        readCount: Object.keys(readBy).length,
      },
    };
  });
}

export const _testHelpers = {
  isEnabled,
  receiptPath,
  emptyReceipt,
  assertParticipant,
  messageBelongsToJob,
};
