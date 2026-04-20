// ═══════════════════════════════════════════════════════════════
// server/services/auditLog.js — Admin Audit Trail (Append-Only)
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, getCollectionPath, listJSON } from './database.js';

/**
 * Log an admin action (append-only — no update or delete)
 * Fire-and-forget safe — callers should use .catch(() => {})
 *
 * @param {{ adminId: string, action: string, targetType: string, targetId: string, details?: object, ip?: string }} params
 * @returns {Promise<object>} the created audit record
 */
export async function logAction({ adminId, action, targetType, targetId, details, ip }) {
  if (!config.AUDIT || !config.AUDIT.enabled) return null;

  const id = 'aud_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const record = {
    id,
    adminId: adminId || 'unknown',
    action: action || 'unknown',
    targetType: targetType || 'unknown',
    targetId: targetId || 'unknown',
    details: details || null,
    ip: ip || 'unknown',
    createdAt: now,
  };

  const recordPath = getRecordPath('audit', id);
  await atomicWrite(recordPath, record);

  return record;
}

/**
 * List audit log entries (paginated, filterable, newest first)
 *
 * @param {{ page?: number, limit?: number, action?: string, targetType?: string }} options
 * @returns {Promise<{ actions: object[], page: number, limit: number, total: number, totalPages: number }>}
 */
export async function listActions({ page = 1, limit = 50, action, targetType } = {}) {
  const maxPerPage = config.AUDIT ? config.AUDIT.maxEntriesPerPage : 50;
  const safeLimit = Math.min(Math.max(1, limit), maxPerPage);
  const safePage = Math.max(1, page);

  const auditDir = getCollectionPath('audit');
  let records = await listJSON(auditDir);

  // Filter to audit records only (prefix check)
  records = records.filter(r => r.id && r.id.startsWith('aud_'));

  // Apply filters
  if (action) {
    records = records.filter(r => r.action === action);
  }
  if (targetType) {
    records = records.filter(r => r.targetType === targetType);
  }

  // Sort newest first
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const clampedPage = Math.min(safePage, totalPages);
  const offset = (clampedPage - 1) * safeLimit;
  const actions = records.slice(offset, offset + safeLimit);

  return { actions, page: clampedPage, limit: safeLimit, total, totalPages };
}

/**
 * Count total audit log entries
 * @returns {Promise<number>}
 */
export async function countActions() {
  const auditDir = getCollectionPath('audit');
  const records = await listJSON(auditDir);
  return records.filter(r => r.id && r.id.startsWith('aud_')).length;
}
