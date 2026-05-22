// ═══════════════════════════════════════════════════════════════
// server/services/privacyRequests.js — Privacy Request Lifecycle (Phase 58)
// ═══════════════════════════════════════════════════════════════
// File-backed privacy requests:
//   requested → queued → processing → completed | failed | cancelled | expired
//
// Types:
//   - user_data_export
//   - user_anonymization
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

const VALID_TYPES = new Set(['user_data_export', 'user_anonymization']);
const VALID_STATUSES = new Set(['requested', 'queued', 'processing', 'completed', 'failed', 'cancelled', 'expired']);

function isEnabled() {
  return !!(config.PRIVACY_REQUESTS && config.PRIVACY_REQUESTS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'prq_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

function requestPath(id) {
  return getRecordPath('privacy_requests', id);
}

function exportExpiresAt() {
  const hours = config.PRIVACY_REQUESTS?.exportRetentionHours || 72;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function sanitizeReason(reason) {
  if (!reason || typeof reason !== 'string') return null;
  return reason.trim().slice(0, 1000) || null;
}

/**
 * Create a privacy request.
 */
export async function createPrivacyRequest(params = {}) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'PRIVACY_REQUESTS_DISABLED' };

  const type = params.type;
  if (!VALID_TYPES.has(type)) {
    return { ok: false, code: 'INVALID_PRIVACY_REQUEST_TYPE', error: 'invalid privacy request type' };
  }

  if (!params.userId || typeof params.userId !== 'string') {
    return { ok: false, code: 'USER_ID_REQUIRED', error: 'userId is required' };
  }

  const now = nowIso();
  const id = params.id || generateId();

  const record = {
    id,
    type,
    status: 'requested',
    userId: params.userId,
    requestedBy: params.requestedBy || 'admin_token',
    requestReason: sanitizeReason(params.reason),
    approvalId: params.approvalId || null,
    queueJobId: null,
    exportFilePath: null,
    exportExpiresAt: null,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    queuedAt: null,
    processingAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    cancelledBy: null,
  };

  await atomicWrite(requestPath(id), record);

  eventBus.emit('privacy_request:created', {
    requestId: id,
    type,
    userId: params.userId,
    requestedBy: record.requestedBy,
    timestamp: now,
  });

  return { ok: true, request: record };
}

export async function getPrivacyRequest(id) {
  if (!id || typeof id !== 'string') return null;
  return await readJSON(requestPath(id));
}

export async function listPrivacyRequests(options = {}) {
  if (!isEnabled()) return { requests: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('privacy_requests');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('prq_'));

  if (options.status) rows = rows.filter(r => r.status === options.status);
  if (options.type) rows = rows.filter(r => r.type === options.type);
  if (options.userId) rows = rows.filter(r => r.userId === options.userId);

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    requests: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

async function patchRequest(id, patch) {
  return withLock(`privacy-request:${id}`, async () => {
    const record = await getPrivacyRequest(id);
    if (!record) return null;

    const next = {
      ...record,
      ...patch,
      id: record.id,
      type: record.type,
      userId: record.userId,
      createdAt: record.createdAt,
      updatedAt: nowIso(),
    };

    await atomicWrite(requestPath(id), next);
    return next;
  });
}

/**
 * Queue privacy export job.
 */
export async function queuePrivacyExport(requestId, adminId) {
  if (!isEnabled() || !config.PRIVACY_REQUESTS.exportEnabled) {
    return { ok: false, code: 'PRIVACY_EXPORT_DISABLED', error: 'privacy export disabled' };
  }

  const record = await getPrivacyRequest(requestId);
  if (!record) return { ok: false, code: 'PRIVACY_REQUEST_NOT_FOUND', error: 'privacy request not found' };
  if (record.type !== 'user_data_export') {
    return { ok: false, code: 'INVALID_REQUEST_TYPE', error: 'request is not user_data_export' };
  }
  if (!['requested', 'failed'].includes(record.status)) {
    return { ok: false, code: 'INVALID_REQUEST_STATUS', error: 'request cannot be queued from current status', request: record };
  }

  const { enqueueJob } = await import('./opsQueue.js');

  const enqueueResult = await enqueueJob({
    type: 'privacy_user_data_export',
    priority: 'normal',
    payload: {
      requestId,
      userId: record.userId,
      options: {
        includeMessages: config.PRIVACY_REQUESTS.includeMessagesInExport !== false,
        includeAuditRefs: !!config.PRIVACY_REQUESTS.includeAuditRefsInExport,
      },
    },
    idempotencyKey: `privacy_export:${requestId}`,
    createdBy: adminId || 'admin_token',
  });

  if (!enqueueResult.ok) {
    return { ok: false, code: 'QUEUE_ENQUEUE_FAILED', error: enqueueResult.error || 'queue enqueue failed' };
  }

  const updated = await patchRequest(requestId, {
    status: 'queued',
    queueJobId: enqueueResult.job.id,
    queuedAt: nowIso(),
    error: null,
  });

  eventBus.emit('privacy_request:queued', {
    requestId,
    type: record.type,
    userId: record.userId,
    queueJobId: enqueueResult.job.id,
    timestamp: nowIso(),
  });

  return { ok: true, request: updated, queueJob: enqueueResult.job, deduped: !!enqueueResult.deduped };
}

/**
 * Queue user anonymization job.
 */
export async function queueUserAnonymization(requestId, adminId, approvalId) {
  if (!isEnabled() || !config.PRIVACY_REQUESTS.anonymizeEnabled) {
    return { ok: false, code: 'PRIVACY_ANONYMIZE_DISABLED', error: 'privacy anonymize disabled' };
  }

  const record = await getPrivacyRequest(requestId);
  if (!record) return { ok: false, code: 'PRIVACY_REQUEST_NOT_FOUND', error: 'privacy request not found' };
  if (record.type !== 'user_anonymization') {
    return { ok: false, code: 'INVALID_REQUEST_TYPE', error: 'request is not user_anonymization' };
  }
  if (!['requested', 'failed'].includes(record.status)) {
    return { ok: false, code: 'INVALID_REQUEST_STATUS', error: 'request cannot be queued from current status', request: record };
  }

  if (config.ADMIN_APPROVALS?.enabled && config.ADMIN_RBAC?.dangerousActionsRequireApproval) {
    const { isApprovalValid } = await import('./adminApprovals.js');
    const valid = await isApprovalValid(approvalId || record.approvalId, 'privacy_anonymize', record.userId);
    if (!valid) {
      return { ok: false, code: 'VALID_APPROVAL_REQUIRED', error: 'valid approval is required for anonymization' };
    }
  }

  const { enqueueJob } = await import('./opsQueue.js');

  const enqueueResult = await enqueueJob({
    type: 'privacy_user_anonymization',
    priority: 'high',
    payload: {
      requestId,
      userId: record.userId,
      approvalId: approvalId || record.approvalId || null,
      options: {
        confirm: true,
      },
    },
    idempotencyKey: `privacy_anonymize:${requestId}`,
    createdBy: adminId || 'admin_token',
  });

  if (!enqueueResult.ok) {
    return { ok: false, code: 'QUEUE_ENQUEUE_FAILED', error: enqueueResult.error || 'queue enqueue failed' };
  }

  const updated = await patchRequest(requestId, {
    status: 'queued',
    queueJobId: enqueueResult.job.id,
    approvalId: approvalId || record.approvalId || null,
    queuedAt: nowIso(),
    error: null,
  });

  eventBus.emit('privacy_request:queued', {
    requestId,
    type: record.type,
    userId: record.userId,
    queueJobId: enqueueResult.job.id,
    timestamp: nowIso(),
  });

  return { ok: true, request: updated, queueJob: enqueueResult.job, deduped: !!enqueueResult.deduped };
}

export async function completePrivacyRequest(id, patch = {}) {
  const now = nowIso();

  const updated = await patchRequest(id, {
    status: 'completed',
    completedAt: now,
    exportFilePath: patch.exportFilePath || null,
    exportExpiresAt: patch.exportExpiresAt || (patch.exportFilePath ? exportExpiresAt() : null),
    result: patch.result || null,
    error: null,
  });

  if (updated) {
    eventBus.emit('privacy_request:completed', {
      requestId: id,
      type: updated.type,
      userId: updated.userId,
      timestamp: now,
    });
  }

  return updated ? { ok: true, request: updated } : { ok: false, code: 'PRIVACY_REQUEST_NOT_FOUND' };
}

export async function failPrivacyRequest(id, error) {
  const now = nowIso();

  const updated = await patchRequest(id, {
    status: 'failed',
    failedAt: now,
    error: error ? String(error).slice(0, 2000) : 'Unknown error',
  });

  if (updated) {
    eventBus.emit('privacy_request:failed', {
      requestId: id,
      type: updated.type,
      userId: updated.userId,
      error: updated.error,
      timestamp: now,
    });
  }

  return updated ? { ok: true, request: updated } : { ok: false, code: 'PRIVACY_REQUEST_NOT_FOUND' };
}

export async function cancelPrivacyRequest(id, adminId) {
  const record = await getPrivacyRequest(id);
  if (!record) return { ok: false, code: 'PRIVACY_REQUEST_NOT_FOUND', error: 'privacy request not found' };

  if (['completed', 'cancelled', 'expired'].includes(record.status)) {
    return { ok: false, code: 'PRIVACY_REQUEST_ALREADY_FINISHED', error: 'request already finished', request: record };
  }

  const now = nowIso();
  const updated = await patchRequest(id, {
    status: 'cancelled',
    cancelledAt: now,
    cancelledBy: adminId || 'admin_token',
  });

  eventBus.emit('privacy_request:cancelled', {
    requestId: id,
    type: record.type,
    userId: record.userId,
    cancelledBy: adminId || 'admin_token',
    timestamp: now,
  });

  return { ok: true, request: updated };
}

/**
 * Mark old completed export files as expired.
 * Phase 58 does not delete files here; deletion can be added by hygiene later.
 */
export async function cleanupExpiredPrivacyExports() {
  if (!isEnabled()) return 0;

  const result = await listPrivacyRequests({ status: 'completed', limit: 1000, offset: 0 });
  let expired = 0;

  for (const r of result.requests || []) {
    if (r.exportExpiresAt && new Date(r.exportExpiresAt).getTime() <= Date.now()) {
      const updated = await patchRequest(r.id, {
        status: 'expired',
      });
      if (updated) expired++;
    }
  }

  return expired;
}

export const _testHelpers = {
  VALID_TYPES,
  VALID_STATUSES,
  generateId,
  requestPath,
  exportExpiresAt,
};
