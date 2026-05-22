// ═══════════════════════════════════════════════════════════════
// server/services/postmortemRecords.js — Incident Postmortems (Phase 58)
// ═══════════════════════════════════════════════════════════════
// File-backed postmortems linked to incident timeline.
// Critical incidents require postmortem when configured.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';

const ACTION_STATUSES = new Set(['open', 'in_progress', 'done', 'cancelled']);

function isEnabled() {
  return !!(config.POSTMORTEMS && config.POSTMORTEMS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'pm_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

function generateActionItemId() {
  return 'act_' + crypto.randomBytes(5).toString('hex');
}

function postmortemPath(id) {
  return getRecordPath('postmortems', id);
}

function sanitizeText(value, max = 5000) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().slice(0, max) || null;
}

function sanitizeTimeline(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 200).map(item => ({
    timestamp: sanitizeText(item.timestamp || item.time || '', 80),
    event: sanitizeText(item.event || item.summary || item.text || '', 1000),
  })).filter(i => i.timestamp || i.event);
}

function sanitizeActionItem(item = {}) {
  return {
    id: item.id || generateActionItemId(),
    title: sanitizeText(item.title || item.text || '', 300) || 'Action item',
    owner: sanitizeText(item.owner || '', 120),
    dueDate: sanitizeText(item.dueDate || '', 40),
    status: ACTION_STATUSES.has(item.status) ? item.status : 'open',
    createdAt: item.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function sanitizePatch(patch = {}) {
  const out = {};

  const fields = [
    'summary',
    'impact',
    'rootCause',
    'whatWentWell',
    'whatWentWrong',
    'detection',
    'resolution',
    'prevention',
    'followUpStatus',
  ];

  for (const field of fields) {
    if (patch[field] !== undefined) {
      out[field] = sanitizeText(patch[field], 5000);
    }
  }

  if (patch.timeline !== undefined) out.timeline = sanitizeTimeline(patch.timeline);

  return out;
}

/**
 * Create postmortem.
 */
export async function createPostmortem(params = {}) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'POSTMORTEMS_DISABLED' };

  if (!params.incidentId || typeof params.incidentId !== 'string') {
    return { ok: false, code: 'INCIDENT_ID_REQUIRED', error: 'incidentId is required' };
  }

  const existing = await getPostmortemByIncident(params.incidentId);
  if (existing) {
    return { ok: true, postmortem: existing, alreadyExists: true };
  }

  const now = nowIso();
  const id = params.id || generateId();

  const record = {
    id,
    incidentId: params.incidentId,
    severity: params.severity || null,
    status: params.status || 'draft',
    summary: sanitizeText(params.summary || '', 5000),
    impact: sanitizeText(params.impact || '', 5000),
    timeline: sanitizeTimeline(params.timeline || []),
    rootCause: sanitizeText(params.rootCause || '', 5000),
    whatWentWell: sanitizeText(params.whatWentWell || '', 5000),
    whatWentWrong: sanitizeText(params.whatWentWrong || '', 5000),
    detection: sanitizeText(params.detection || '', 5000),
    resolution: sanitizeText(params.resolution || '', 5000),
    prevention: sanitizeText(params.prevention || '', 5000),
    followUpStatus: sanitizeText(params.followUpStatus || 'pending', 80) || 'pending',
    actionItems: Array.isArray(params.actionItems)
      ? params.actionItems.slice(0, config.POSTMORTEMS?.maxActionItems || 50).map(sanitizeActionItem)
      : [],
    createdBy: params.createdBy || 'admin_token',
    updatedBy: params.createdBy || 'admin_token',
    createdAt: now,
    updatedAt: now,
    completedAt: params.status === 'completed' ? now : null,
  };

  await atomicWrite(postmortemPath(id), record);

  eventBus.emit('postmortem:created', {
    postmortemId: id,
    incidentId: record.incidentId,
    severity: record.severity,
    createdBy: record.createdBy,
    timestamp: now,
  });

  return { ok: true, postmortem: record };
}

/**
 * Update postmortem.
 */
export async function updatePostmortem(id, patch = {}) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'POSTMORTEMS_DISABLED' };

  return withLock(`postmortem:${id}`, async () => {
    const record = await getPostmortem(id);
    if (!record) return { ok: false, code: 'POSTMORTEM_NOT_FOUND', error: 'postmortem not found' };

    const sanitized = sanitizePatch(patch);
    Object.assign(record, sanitized);

    if (patch.status) record.status = String(patch.status).slice(0, 40);
    if (patch.updatedBy) record.updatedBy = String(patch.updatedBy).slice(0, 120);

    if (record.status === 'completed' && !record.completedAt) {
      record.completedAt = nowIso();
    }

    record.updatedAt = nowIso();

    await atomicWrite(postmortemPath(id), record);

    eventBus.emit('postmortem:updated', {
      postmortemId: id,
      incidentId: record.incidentId,
      status: record.status,
      timestamp: record.updatedAt,
    });

    return { ok: true, postmortem: record };
  });
}

export async function getPostmortem(id) {
  if (!id || typeof id !== 'string') return null;
  return await readJSON(postmortemPath(id));
}

export async function getPostmortemByIncident(incidentId) {
  if (!incidentId || typeof incidentId !== 'string') return null;

  const dir = getCollectionPath('postmortems');
  const rows = await listJSON(dir);

  return rows.find(r => r && r.id && r.id.startsWith('pm_') && r.incidentId === incidentId) || null;
}

export async function listPostmortems(options = {}) {
  if (!isEnabled()) return { postmortems: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('postmortems');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('pm_'));

  if (options.incidentId) rows = rows.filter(r => r.incidentId === options.incidentId);
  if (options.status) rows = rows.filter(r => r.status === options.status);
  if (options.severity) rows = rows.filter(r => r.severity === options.severity);

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    postmortems: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function addActionItem(postmortemId, item) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'POSTMORTEMS_DISABLED' };

  return withLock(`postmortem:${postmortemId}`, async () => {
    const record = await getPostmortem(postmortemId);
    if (!record) return { ok: false, code: 'POSTMORTEM_NOT_FOUND', error: 'postmortem not found' };

    const max = config.POSTMORTEMS?.maxActionItems || 50;
    record.actionItems = Array.isArray(record.actionItems) ? record.actionItems : [];

    if (record.actionItems.length >= max) {
      return { ok: false, code: 'MAX_ACTION_ITEMS', error: `max action items reached (${max})` };
    }

    const actionItem = sanitizeActionItem(item || {});
    record.actionItems.push(actionItem);
    record.updatedAt = nowIso();

    await atomicWrite(postmortemPath(postmortemId), record);

    eventBus.emit('postmortem:action_item_added', {
      postmortemId,
      incidentId: record.incidentId,
      itemId: actionItem.id,
      timestamp: record.updatedAt,
    });

    return { ok: true, postmortem: record, actionItem };
  });
}

export async function updateActionItem(postmortemId, itemId, patch = {}) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'POSTMORTEMS_DISABLED' };

  return withLock(`postmortem:${postmortemId}`, async () => {
    const record = await getPostmortem(postmortemId);
    if (!record) return { ok: false, code: 'POSTMORTEM_NOT_FOUND', error: 'postmortem not found' };

    record.actionItems = Array.isArray(record.actionItems) ? record.actionItems : [];

    const item = record.actionItems.find(i => i.id === itemId);
    if (!item) return { ok: false, code: 'ACTION_ITEM_NOT_FOUND', error: 'action item not found' };

    if (patch.title !== undefined) item.title = sanitizeText(patch.title, 300) || item.title;
    if (patch.owner !== undefined) item.owner = sanitizeText(patch.owner, 120);
    if (patch.dueDate !== undefined) item.dueDate = sanitizeText(patch.dueDate, 40);
    if (patch.status !== undefined && ACTION_STATUSES.has(patch.status)) item.status = patch.status;
    item.updatedAt = nowIso();

    record.updatedAt = item.updatedAt;

    await atomicWrite(postmortemPath(postmortemId), record);

    eventBus.emit('postmortem:action_item_updated', {
      postmortemId,
      incidentId: record.incidentId,
      itemId,
      status: item.status,
      timestamp: record.updatedAt,
    });

    return { ok: true, postmortem: record, actionItem: item };
  });
}

/**
 * Determine if postmortem is required for an incident.
 */
export function isPostmortemRequired(incident) {
  if (!isEnabled()) return false;
  if (!incident) return false;

  const severity = incident.severity || 'medium';

  if (severity === 'critical' && config.POSTMORTEMS?.requireForCriticalIncidents) {
    return true;
  }

  if (severity === 'high' && config.POSTMORTEMS?.requireForHighIncidents) {
    return true;
  }

  return false;
}

export const _testHelpers = {
  generateId,
  generateActionItemId,
  postmortemPath,
  sanitizeActionItem,
  sanitizeTimeline,
  ACTION_STATUSES,
};
