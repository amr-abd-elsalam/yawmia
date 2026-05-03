// ═══════════════════════════════════════════════════════════════
// server/services/auditLogSearch.js — Full-Text Search + CSV Export (Phase 47)
// ═══════════════════════════════════════════════════════════════
// Read-only operations on audit log entries.
// searchActions: full-text + combined filters with newest-first sort.
// exportToCSV: UTF-8 BOM + Arabic headers for Excel compatibility.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { getCollectionPath, listJSON } from './database.js';
import { logger } from './logger.js';

const BOM = '\uFEFF';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str.replace(/"/g, '""');
}

function csvRow(fields) {
  return fields.map(f => `"${csvEscape(f)}"`).join(',');
}

/**
 * Search audit log entries with full-text + filters.
 *
 * @param {object} options
 * @param {string} [options.q] — search query (matches action, targetId, targetType, adminId, ip, details JSON)
 * @param {string} [options.action] — exact action filter
 * @param {string} [options.adminId] — exact admin filter
 * @param {string} [options.targetType] — exact target type filter
 * @param {string} [options.from] — ISO date — entries with createdAt >= from
 * @param {string} [options.to] — ISO date — entries with createdAt <= to
 * @param {number} [options.limit=50]
 * @returns {Promise<{ entries: object[], total: number }>}
 */
export async function searchActions(options = {}) {
  const auditDir = getCollectionPath('audit');
  let entries;
  try {
    entries = await listJSON(auditDir);
  } catch (err) {
    logger.warn('auditLogSearch: listJSON failed', { error: err.message });
    return { entries: [], total: 0 };
  }

  // Filter to audit records only
  entries = entries.filter(e => e.id && e.id.startsWith('aud_'));

  // Apply exact-match filters
  if (options.action) {
    entries = entries.filter(e => e.action === options.action);
  }
  if (options.adminId) {
    entries = entries.filter(e => e.adminId === options.adminId);
  }
  if (options.targetType) {
    entries = entries.filter(e => e.targetType === options.targetType);
  }

  // Date range filters
  if (options.from) {
    entries = entries.filter(e => e.createdAt && e.createdAt >= options.from);
  }
  if (options.to) {
    entries = entries.filter(e => e.createdAt && e.createdAt <= options.to);
  }

  // Full-text search (case-insensitive)
  if (options.q && typeof options.q === 'string') {
    const q = options.q.toLowerCase().trim();
    if (q.length > 0) {
      entries = entries.filter(e => {
        const haystack = [
          e.action || '',
          e.targetId || '',
          e.targetType || '',
          e.adminId || '',
          e.ip || '',
          e.details ? JSON.stringify(e.details) : '',
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
  }

  // Sort newest first
  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = entries.length;
  const maxResults = (config.ADMIN_OPERATIONS && config.ADMIN_OPERATIONS.auditLogSearchMaxResults) || 200;
  const limit = Math.min(Math.max(1, options.limit || 50), maxResults);
  entries = entries.slice(0, limit);

  return { entries, total };
}

/**
 * Export audit log to CSV format with UTF-8 BOM for Arabic Excel compatibility.
 *
 * @param {object} options
 * @param {string} [options.from] — ISO date
 * @param {string} [options.to] — ISO date
 * @param {string} [options.action] — exact action filter
 * @returns {Promise<{ csv: string, count: number, filename: string }>}
 */
export async function exportToCSV(options = {}) {
  const auditDir = getCollectionPath('audit');
  let entries;
  try {
    entries = await listJSON(auditDir);
  } catch (err) {
    logger.warn('auditLogSearch: exportToCSV listJSON failed', { error: err.message });
    return { csv: BOM + 'لا توجد بيانات', count: 0, filename: 'audit-log-empty.csv' };
  }

  entries = entries.filter(e => e.id && e.id.startsWith('aud_'));

  if (options.from) entries = entries.filter(e => e.createdAt && e.createdAt >= options.from);
  if (options.to) entries = entries.filter(e => e.createdAt && e.createdAt <= options.to);
  if (options.action) entries = entries.filter(e => e.action === options.action);

  // Sort newest first
  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Enforce max rows
  const maxRows = (config.ADMIN_OPERATIONS && config.ADMIN_OPERATIONS.auditLogExportMaxRows) || 10000;
  entries = entries.slice(0, maxRows);

  // Build CSV
  const headers = csvRow([
    'المعرّف', 'الأدمن', 'الإجراء', 'نوع الهدف', 'معرّف الهدف',
    'IP', 'التفاصيل', 'التاريخ',
  ]);
  const rows = [headers];

  for (const e of entries) {
    rows.push(csvRow([
      e.id,
      e.adminId || '',
      e.action || '',
      e.targetType || '',
      e.targetId || '',
      e.ip || '',
      e.details ? JSON.stringify(e.details) : '',
      e.createdAt || '',
    ]));
  }

  const csv = BOM + rows.join('\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `audit-log-${dateStr}.csv`;

  return { csv, count: entries.length, filename };
}

// Test helpers
export const _testHelpers = {
  csvEscape,
  csvRow,
};
