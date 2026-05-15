// ═══════════════════════════════════════════════════════════════
// server/services/workroomChecklist.js — Structured Workroom Checklist (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Sidecar checklist per workroom/job.
// Storage: data/workrooms/checklists/{jobId}.json
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
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
  return !!(config.WORKROOM_V2 && config.WORKROOM_V2.enabled && config.WORKROOM_V2.checklistEnabled);
}

function nowIso() {
  return new Date().toISOString();
}

function checklistPath(jobId) {
  return getRecordPath('workroom_checklists', jobId);
}

function generateId() {
  return 'chk_' + crypto.randomBytes(6).toString('hex');
}

function emptyChecklist(jobId) {
  return {
    jobId,
    items: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
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

function canCreateOrDelete(access) {
  return access && access.role === 'employer';
}

function canCompleteItem(access, item, userId) {
  if (!access || !item || !userId) return false;
  if (access.role === 'employer') return true;
  if (access.role === 'worker') {
    return !item.assignedTo || item.assignedTo === userId;
  }
  return false;
}

function publicChecklist(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    jobId: data.jobId,
    items,
    total: items.length,
    completed: items.filter(i => i.status === 'completed').length,
    open: items.filter(i => i.status !== 'completed').length,
    updatedAt: data.updatedAt || null,
  };
}

export async function getChecklist(jobId, userId) {
  if (!isEnabled()) {
    return { ok: true, checklist: publicChecklist(emptyChecklist(jobId)) };
  }

  await assertParticipant(jobId, userId);

  const data = (await readJSON(checklistPath(jobId))) || emptyChecklist(jobId);
  return { ok: true, checklist: publicChecklist(data) };
}

export async function createChecklistItem(jobId, userId, fields = {}) {
  if (!isEnabled()) {
    return { ok: false, error: 'قائمة المهام غير مفعّلة', code: 'CHECKLIST_DISABLED' };
  }

  const access = await assertParticipant(jobId, userId);
  if (!canCreateOrDelete(access)) {
    return { ok: false, error: 'إضافة المهام متاحة لصاحب العمل فقط', code: 'CHECKLIST_FORBIDDEN' };
  }

  const text = sanitizeText(fields.text || '').trim();
  if (!text || text.length < 2) {
    return { ok: false, error: 'نص المهمة مطلوب', code: 'TEXT_REQUIRED' };
  }
  if (text.length > 300) {
    return { ok: false, error: 'نص المهمة لا يتجاوز 300 حرف', code: 'TEXT_TOO_LONG' };
  }

  const assignedTo = fields.assignedTo && typeof fields.assignedTo === 'string'
    ? fields.assignedTo
    : null;

  if (assignedTo && !access.workerIds.includes(assignedTo) && assignedTo !== access.job.employerId) {
    return { ok: false, error: 'المستخدم المكلّف غير مشترك في مساحة العمل', code: 'INVALID_ASSIGNEE' };
  }

  return withLock(`workroom-checklist:${jobId}`, async () => {
    const filePath = checklistPath(jobId);
    const data = (await readJSON(filePath)) || emptyChecklist(jobId);
    data.items = Array.isArray(data.items) ? data.items : [];

    const max = config.WORKROOM_V2?.maxChecklistItems || 30;
    if (data.items.length >= max) {
      return { ok: false, error: `أقصى عدد للمهام هو ${max}`, code: 'MAX_CHECKLIST_ITEMS' };
    }

    const now = nowIso();
    const item = {
      id: generateId(),
      text,
      status: 'open',
      createdBy: userId,
      assignedTo,
      completedBy: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    data.items.push(item);
    data.updatedAt = now;
    if (!data.createdAt) data.createdAt = now;

    await atomicWrite(filePath, data);

    eventBus.emit('workroom:checklist_item_created', {
      jobId,
      itemId: item.id,
      createdBy: userId,
      assignedTo,
      timestamp: now,
    });

    return { ok: true, item };
  });
}

export async function updateChecklistItem(jobId, itemId, userId, patch = {}) {
  if (!isEnabled()) {
    return { ok: false, error: 'قائمة المهام غير مفعّلة', code: 'CHECKLIST_DISABLED' };
  }

  const access = await assertParticipant(jobId, userId);

  return withLock(`workroom-checklist:${jobId}`, async () => {
    const filePath = checklistPath(jobId);
    const data = (await readJSON(filePath)) || emptyChecklist(jobId);
    data.items = Array.isArray(data.items) ? data.items : [];

    const item = data.items.find(i => i.id === itemId);
    if (!item) {
      return { ok: false, error: 'المهمة غير موجودة', code: 'CHECKLIST_ITEM_NOT_FOUND' };
    }

    const now = nowIso();

    if (patch.status !== undefined) {
      if (patch.status !== 'open' && patch.status !== 'completed') {
        return { ok: false, error: 'حالة المهمة غير صالحة', code: 'INVALID_STATUS' };
      }

      if (patch.status === 'completed') {
        if (!canCompleteItem(access, item, userId)) {
          return { ok: false, error: 'غير مسموح لك بإكمال هذه المهمة', code: 'CHECKLIST_FORBIDDEN' };
        }
        item.status = 'completed';
        item.completedBy = userId;
        item.completedAt = now;

        eventBus.emit('workroom:checklist_item_completed', {
          jobId,
          itemId,
          completedBy: userId,
          timestamp: now,
        });
      } else {
        if (!canCreateOrDelete(access)) {
          return { ok: false, error: 'إعادة فتح المهمة متاحة لصاحب العمل فقط', code: 'CHECKLIST_FORBIDDEN' };
        }
        item.status = 'open';
        item.completedBy = null;
        item.completedAt = null;
      }
    }

    if (patch.text !== undefined) {
      if (!canCreateOrDelete(access)) {
        return { ok: false, error: 'تعديل نص المهمة متاح لصاحب العمل فقط', code: 'CHECKLIST_FORBIDDEN' };
      }

      const text = sanitizeText(String(patch.text || '')).trim();
      if (!text || text.length < 2) {
        return { ok: false, error: 'نص المهمة مطلوب', code: 'TEXT_REQUIRED' };
      }
      if (text.length > 300) {
        return { ok: false, error: 'نص المهمة لا يتجاوز 300 حرف', code: 'TEXT_TOO_LONG' };
      }
      item.text = text;
    }

    if (patch.assignedTo !== undefined) {
      if (!canCreateOrDelete(access)) {
        return { ok: false, error: 'تعديل التكليف متاح لصاحب العمل فقط', code: 'CHECKLIST_FORBIDDEN' };
      }

      const assignedTo = patch.assignedTo || null;
      if (assignedTo && !access.workerIds.includes(assignedTo) && assignedTo !== access.job.employerId) {
        return { ok: false, error: 'المستخدم المكلّف غير مشترك في مساحة العمل', code: 'INVALID_ASSIGNEE' };
      }
      item.assignedTo = assignedTo;
    }

    item.updatedAt = now;
    data.updatedAt = now;

    await atomicWrite(filePath, data);

    return { ok: true, item };
  });
}

export async function deleteChecklistItem(jobId, itemId, userId) {
  if (!isEnabled()) {
    return { ok: false, error: 'قائمة المهام غير مفعّلة', code: 'CHECKLIST_DISABLED' };
  }

  const access = await assertParticipant(jobId, userId);
  if (!canCreateOrDelete(access)) {
    return { ok: false, error: 'حذف المهام متاح لصاحب العمل فقط', code: 'CHECKLIST_FORBIDDEN' };
  }

  return withLock(`workroom-checklist:${jobId}`, async () => {
    const filePath = checklistPath(jobId);
    const data = (await readJSON(filePath)) || emptyChecklist(jobId);
    data.items = Array.isArray(data.items) ? data.items : [];

    const before = data.items.length;
    data.items = data.items.filter(i => i.id !== itemId);

    if (data.items.length === before) {
      return { ok: false, error: 'المهمة غير موجودة', code: 'CHECKLIST_ITEM_NOT_FOUND' };
    }

    data.updatedAt = nowIso();
    await atomicWrite(filePath, data);

    eventBus.emit('workroom:checklist_item_deleted', {
      jobId,
      itemId,
      deletedBy: userId,
      timestamp: data.updatedAt,
    });

    return { ok: true, deleted: true };
  });
}

export const _testHelpers = {
  isEnabled,
  checklistPath,
  generateId,
  emptyChecklist,
  publicChecklist,
  canCreateOrDelete,
  canCompleteItem,
};
