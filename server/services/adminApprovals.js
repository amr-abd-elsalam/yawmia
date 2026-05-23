// ═══════════════════════════════════════════════════════════════
// server/services/adminApprovals.js — Dangerous Admin Action Approvals (Phase 58)
// ═══════════════════════════════════════════════════════════════
// File-backed approval records for dangerous admin actions.
// Lifecycle:
//   pending → approved | rejected | expired | consumed
//
// Important:
//   - Approval does NOT execute the action.
//   - Approval payload is sanitized.
//   - consumeApproval() is one-time.
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
import { logger } from './logger.js';

function isEnabled() {
  return !!(config.ADMIN_APPROVALS && config.ADMIN_APPROVALS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'apr_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

function approvalPath(id) {
  return getRecordPath('admin_approvals', id);
}

function expiryIso(hours) {
  const ttlHours = Number(hours || config.ADMIN_APPROVALS?.expiryHours || 24);
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};

  const out = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;

    if (/token|secret|password|apikey|api_key|authorization|vapid/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }

    if (typeof value === 'string') {
      out[key] = value.slice(0, 1000);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value;
    } else {
      try {
        out[key] = JSON.parse(JSON.stringify(value));
      } catch (_) {
        out[key] = String(value).slice(0, 1000);
      }
    }
  }

  return out;
}

function validStatus(status) {
  return ['pending', 'approved', 'rejected', 'expired', 'consumed'].includes(status);
}

function isExpired(record) {
  if (!record || !record.expiresAt) return false;
  return new Date(record.expiresAt).getTime() <= Date.now();
}

/**
 * Create a new approval request.
 *
 * @param {{
 *   action: string,
 *   targetType?: string,
 *   targetId?: string,
 *   requestedBy: string,
 *   reason?: string,
 *   payload?: object,
 *   expiresAt?: string
 * }} params
 */
export async function createApprovalRequest(params = {}) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'ADMIN_APPROVALS_DISABLED' };

  if (!params.action || typeof params.action !== 'string') {
    return { ok: false, code: 'ACTION_REQUIRED', error: 'action is required' };
  }

  if (!params.requestedBy) {
    return { ok: false, code: 'REQUESTED_BY_REQUIRED', error: 'requestedBy is required' };
  }

  const dangerous = config.ADMIN_APPROVALS?.dangerousActions || [];
  if (!dangerous.includes(params.action)) {
    return { ok: false, code: 'ACTION_NOT_DANGEROUS', error: 'action is not configured as dangerous' };
  }

  const id = params.id || generateId();
  const now = nowIso();

  const record = {
    id,
    action: params.action,
    targetType: params.targetType || 'unknown',
    targetId: params.targetId || 'unknown',
    status: 'pending',
    requestedBy: params.requestedBy,
    requestedAt: now,
    requestReason: params.reason ? String(params.reason).slice(0, 1000) : null,
    payload: sanitizePayload(params.payload || {}),
    approvedBy: null,
    approvedAt: null,
    approvalNote: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionNote: null,
    consumedAt: null,
    consumedByAction: null,
    consumedTargetId: null,
    expiredAt: null,
    expiresAt: params.expiresAt || expiryIso(),
    createdAt: now,
    updatedAt: now,
  };

  await atomicWrite(approvalPath(id), record);

  eventBus.emit('admin_approval:created', {
    approvalId: id,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    requestedBy: record.requestedBy,
    timestamp: now,
  });

  return { ok: true, approval: record };
}

/**
 * Get approval by ID. Lazily marks expired pending records as expired.
 */
export async function getApproval(approvalId) {
  if (!approvalId || typeof approvalId !== 'string') return null;

  const record = await readJSON(approvalPath(approvalId));
  if (!record) return null;

  if (record.status === 'pending' && isExpired(record)) {
    record.status = 'expired';
    record.expiredAt = nowIso();
    record.updatedAt = record.expiredAt;

    try {
      await atomicWrite(approvalPath(approvalId), record);
      eventBus.emit('admin_approval:expired', {
        approvalId,
        action: record.action,
        targetId: record.targetId,
        timestamp: record.expiredAt,
      });
    } catch (err) {
      logger.warn('adminApprovals: lazy expiry write failed', { approvalId, error: err.message });
    }
  }

  return record;
}

/**
 * List approvals newest first.
 */
export async function listApprovals(options = {}) {
  if (!isEnabled()) return { approvals: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('admin_approvals');
  let rows = await listJSON(dir);

  rows = rows.filter(r => r && r.id && r.id.startsWith('apr_'));

  // Lazily expire pending approvals while listing.
  for (const row of rows) {
    if (row.status === 'pending' && isExpired(row)) {
      try {
        row.status = 'expired';
        row.expiredAt = nowIso();
        row.updatedAt = row.expiredAt;
        await atomicWrite(approvalPath(row.id), row);
      } catch (_) {}
    }
  }

  if (options.status) rows = rows.filter(r => r.status === options.status);
  if (options.action) rows = rows.filter(r => r.action === options.action);
  if (options.targetId) rows = rows.filter(r => r.targetId === options.targetId);
  if (options.requestedBy) rows = rows.filter(r => r.requestedBy === options.requestedBy);

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    approvals: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Approve a pending request.
 */
export async function approveRequest(approvalId, adminId, note) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'ADMIN_APPROVALS_DISABLED' };

  return withLock(`admin-approval:${approvalId}`, async () => {
    const record = await getApproval(approvalId);
    if (!record) return { ok: false, code: 'APPROVAL_NOT_FOUND', error: 'approval not found' };

    if (record.status !== 'pending') {
      return { ok: false, code: 'APPROVAL_NOT_PENDING', error: 'approval is not pending', approval: record };
    }

    if (isExpired(record)) {
      record.status = 'expired';
      record.expiredAt = nowIso();
      record.updatedAt = record.expiredAt;
      await atomicWrite(approvalPath(approvalId), record);
      return { ok: false, code: 'APPROVAL_EXPIRED', error: 'approval expired', approval: record };
    }

    const now = nowIso();
    record.status = 'approved';
    record.approvedBy = adminId || 'admin_token';
    record.approvedAt = now;
    record.approvalNote = note ? String(note).slice(0, 1000) : null;
    record.updatedAt = now;

    await atomicWrite(approvalPath(approvalId), record);

    eventBus.emit('admin_approval:approved', {
      approvalId,
      action: record.action,
      approvedBy: record.approvedBy,
      targetId: record.targetId,
      timestamp: now,
    });

    return { ok: true, approval: record };
  });
}

/**
 * Reject a pending request.
 */
export async function rejectRequest(approvalId, adminId, note) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'ADMIN_APPROVALS_DISABLED' };

  return withLock(`admin-approval:${approvalId}`, async () => {
    const record = await getApproval(approvalId);
    if (!record) return { ok: false, code: 'APPROVAL_NOT_FOUND', error: 'approval not found' };

    if (record.status !== 'pending') {
      return { ok: false, code: 'APPROVAL_NOT_PENDING', error: 'approval is not pending', approval: record };
    }

    const now = nowIso();
    record.status = 'rejected';
    record.rejectedBy = adminId || 'admin_token';
    record.rejectedAt = now;
    record.rejectionNote = note ? String(note).slice(0, 1000) : null;
    record.updatedAt = now;

    await atomicWrite(approvalPath(approvalId), record);

    eventBus.emit('admin_approval:rejected', {
      approvalId,
      action: record.action,
      rejectedBy: record.rejectedBy,
      targetId: record.targetId,
      timestamp: now,
    });

    return { ok: true, approval: record };
  });
}

/**
 * Validate approval for action/target.
 */
export async function isApprovalValid(approvalId, action, targetId) {
  const record = await getApproval(approvalId);
  if (!record) return false;
  if (record.status !== 'approved') return false;
  if (record.action !== action) return false;
  if (targetId && record.targetId !== targetId) return false;
  if (isExpired(record)) return false;
  return true;
}

/**
 * Consume approval once.
 */
export async function consumeApproval(approvalId, action, targetId) {
  if (!isEnabled()) return { ok: false, disabled: true, code: 'ADMIN_APPROVALS_DISABLED' };

  return withLock(`admin-approval:${approvalId}`, async () => {
    const record = await getApproval(approvalId);
    if (!record) return { ok: false, code: 'APPROVAL_NOT_FOUND', error: 'approval not found' };

    if (record.status !== 'approved') {
      return { ok: false, code: 'APPROVAL_NOT_APPROVED', error: 'approval is not approved', approval: record };
    }

    if (record.action !== action) {
      return { ok: false, code: 'APPROVAL_ACTION_MISMATCH', error: 'approval action mismatch', approval: record };
    }

    if (targetId && record.targetId !== targetId) {
      return { ok: false, code: 'APPROVAL_TARGET_MISMATCH', error: 'approval target mismatch', approval: record };
    }

    if (isExpired(record)) {
      record.status = 'expired';
      record.expiredAt = nowIso();
      record.updatedAt = record.expiredAt;
      await atomicWrite(approvalPath(approvalId), record);
      return { ok: false, code: 'APPROVAL_EXPIRED', error: 'approval expired', approval: record };
    }

    const now = nowIso();
    record.status = 'consumed';
    record.consumedAt = now;
    record.consumedByAction = action;
    record.consumedTargetId = targetId || null;
    record.updatedAt = now;

    await atomicWrite(approvalPath(approvalId), record);

    eventBus.emit('admin_approval:consumed', {
      approvalId,
      action,
      targetId,
      timestamp: now,
    });

    return { ok: true, approval: record };
  });
}

/**
 * Cleanup expired approvals older than retention.
 */
export async function cleanupExpiredApprovals() {
  if (!isEnabled()) return 0;

  const retentionDays = config.ADMIN_APPROVALS?.retentionDays || 365;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const dir = getCollectionPath('admin_approvals');
  const rows = await listJSON(dir);

  let touched = 0;

  for (const row of rows) {
    if (!row || !row.id || !row.id.startsWith('apr_')) continue;

    if (row.status === 'pending' && isExpired(row)) {
      row.status = 'expired';
      row.expiredAt = nowIso();
      row.updatedAt = row.expiredAt;
      await atomicWrite(approvalPath(row.id), row).catch(() => {});
      touched++;
    }

    // Phase 58 keeps old approval records; retention deletion can be added safely later.
    const basis = row.updatedAt || row.createdAt;
    if (basis && new Date(basis).getTime() < cutoffMs) {
      // Intentionally not deleting yet to preserve audit/governance history.
    }
  }

  return touched;
}

/**
 * Phase 59: lightweight governance pressure stats for admin approvals.
 *
 * No PII/secrets are returned. Payloads are not exposed.
 */
export async function getAdminApprovalPressureStats() {
  if (!isEnabled()) {
    return {
      enabled: false,
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      consumed: 0,
      stale: 0,
      oldestPendingAt: null,
      expiringSoon: 0,
    };
  }

  const result = {
    enabled: true,
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    consumed: 0,
    stale: 0,
    oldestPendingAt: null,
    expiringSoon: 0,
    generatedAt: nowIso(),
  };

  try {
    const rows = await listApprovals({ limit: 100000, offset: 0 });
    const approvals = rows.approvals || [];

    const soonMs = 6 * 60 * 60 * 1000;
    const now = Date.now();

    for (const record of approvals) {
      if (!record || !record.id) continue;
      result.total++;

      if (record.status === 'pending') {
        result.pending++;

        if (!result.oldestPendingAt || record.createdAt < result.oldestPendingAt) {
          result.oldestPendingAt = record.createdAt || null;
        }

        if (isExpired(record)) {
          result.stale++;
        } else if (record.expiresAt) {
          const expiresMs = new Date(record.expiresAt).getTime();
          if (Number.isFinite(expiresMs) && expiresMs > now && expiresMs - now <= soonMs) {
            result.expiringSoon++;
          }
        }
      } else if (record.status === 'approved') {
        result.approved++;
      } else if (record.status === 'rejected') {
        result.rejected++;
      } else if (record.status === 'expired') {
        result.expired++;
      } else if (record.status === 'consumed') {
        result.consumed++;
      }
    }

    return result;
  } catch (err) {
    return {
      ...result,
      error: err.message,
      status: 'unknown',
    };
  }
}

export const _testHelpers = {
  generateId,
  approvalPath,
  sanitizePayload,
  validStatus,
  isExpired,
};
