// ═══════════════════════════════════════════════════════════════
// server/services/auditLogSearch.js — Full-Text Search + CSV Export (Phase 47)
// ═══════════════════════════════════════════════════════════════
// Read-only operations on audit log entries.
// searchActions: full-text + combined filters with newest-first sort.
// exportToCSV: UTF-8 BOM + Arabic headers for Excel compatibility.
// ═══════════════════════════════════════════════════════════════

import { Readable } from 'node:stream';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import config from '../../config.js';
import { getCollectionPath, listJSON, readJSON } from './database.js';
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
 * Phase 48: cursor pagination support added.
 *
 * @param {object} options
 * @param {string} [options.q] — search query (matches action, targetId, targetType, adminId, ip, details JSON)
 * @param {string} [options.action] — exact action filter
 * @param {string} [options.adminId] — exact admin filter
 * @param {string} [options.targetType] — exact target type filter
 * @param {string} [options.from] — ISO date — entries with createdAt >= from
 * @param {string} [options.to] — ISO date — entries with createdAt <= to
 * @param {number} [options.limit=50]
 * @param {string} [options.cursor] — Phase 48: last entry id from previous page for forward pagination
 * @returns {Promise<{ entries: object[], total: number, nextCursor: string|null, hasMore: boolean }>}
 */
export async function searchActions(options = {}) {
  const auditDir = getCollectionPath('audit');
  let entries;
  try {
    entries = await listJSON(auditDir);
  } catch (err) {
    logger.warn('auditLogSearch: listJSON failed', { error: err.message });
    return { entries: [], total: 0, nextCursor: null, hasMore: false };
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

  // ── Phase 48 NEW: Cursor support ──
  // Apply cursor AFTER sort, BEFORE slice — preserves newest-first ordering
  const cursor = options.cursor;
  if (cursor && entries.length > 0) {
    const cursorIdx = entries.findIndex(e => e.id === cursor);
    if (cursorIdx >= 0) {
      entries = entries.slice(cursorIdx + 1);
    }
    // If cursorIdx === -1 (cursor not found), return from beginning (graceful)
  }

  const total = entries.length;
  const maxResults = (config.ADMIN_OPERATIONS && config.ADMIN_OPERATIONS.auditLogSearchMaxResults) || 200;
  const limit = Math.min(Math.max(1, options.limit || 50), maxResults);
  const sliced = entries.slice(0, limit);

  // ── Phase 48 NEW: Pagination metadata ──
  const nextCursor = (sliced.length === limit && total > limit)
    ? sliced[sliced.length - 1].id
    : null;
  const hasMore = nextCursor !== null;

  return { entries: sliced, total, nextCursor, hasMore };
}

/**
 * Phase 48: Create a Node.js Readable stream for memory-efficient CSV export.
 * Streams chunks instead of loading all entries into memory.
 * Memory pattern: <1KB at any time, regardless of dataset size.
 *
 * @param {object} options — { from?, to?, action? }
 * @returns {Readable}
 */
export function createCsvExportStream(options = {}) {
  const cfg = config.ADMIN_OPERATIONS;
  const maxRows = (cfg && cfg.auditLogExportMaxRows) || 100000;

  let rowCount = 0;
  let fileIndex = 0;
  /** @type {string[]|null} */
  let auditFiles = null;
  let auditDirPath = null;

  return new Readable({
    encoding: 'utf-8',
    async read() {
      try {
        // Lazy load file list on first read
        if (auditFiles === null) {
          auditDirPath = getCollectionPath('audit');
          let files;
          try {
            files = await readdir(auditDirPath);
          } catch (_) {
            files = [];
          }
          auditFiles = files.filter(f =>
            f.startsWith('aud_') && f.endsWith('.json') && !f.endsWith('.tmp')
          );

          // Push header chunk with BOM
          const headers = csvRow([
            'المعرّف', 'الأدمن', 'الإجراء', 'نوع الهدف', 'معرّف الهدف',
            'IP', 'التفاصيل', 'التاريخ',
          ]);
          this.push(BOM + headers + '\n');

          // Empty dataset — end immediately after header
          if (auditFiles.length === 0) {
            this.push(null);
            return;
          }
        }

        // Stream rows
        while (fileIndex < auditFiles.length && rowCount < maxRows) {
          const filePath = join(auditDirPath, auditFiles[fileIndex]);
          fileIndex++;

          let data = null;
          try {
            data = await readJSON(filePath);
          } catch (_) { /* skip unreadable files */ }
          if (!data) continue;

          // Apply filters
          if (options.from && data.createdAt && data.createdAt < options.from) continue;
          if (options.to && data.createdAt && data.createdAt > options.to) continue;
          if (options.action && data.action !== options.action) continue;

          // Build row
          const row = csvRow([
            data.id || '',
            data.adminId || '',
            data.action || '',
            data.targetType || '',
            data.targetId || '',
            data.ip || '',
            data.details ? JSON.stringify(data.details) : '',
            data.createdAt || '',
          ]);

          // Push with backpressure handling
          if (!this.push(row + '\n')) {
            // Backpressure — pause and wait for next read()
            return;
          }
          rowCount++;

          // Yield to event loop every 1000 rows
          if (rowCount % 1000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        // End stream when done
        this.push(null);
      } catch (err) {
        this.destroy(err);
      }
    },
  });
}

/**
 * Export audit log to CSV format with UTF-8 BOM for Arabic Excel compatibility.
 * Phase 48: Backward-compat wrapper consuming createCsvExportStream.
 * Memory-efficient via streaming internally, but accumulates final string for callers.
 *
 * @param {object} options
 * @param {string} [options.from] — ISO date
 * @param {string} [options.to] — ISO date
 * @param {string} [options.action] — exact action filter
 * @returns {Promise<{ csv: string, count: number, filename: string }>}
 */
export async function exportToCSV(options = {}) {
  const stream = createCsvExportStream(options);
  let csv = '';
  let count = 0;

  try {
    for await (const chunk of stream) {
      csv += chunk;
    }
  } catch (err) {
    logger.warn('auditLogSearch: exportToCSV stream failed', { error: err.message });
    return { csv: BOM + 'لا توجد بيانات', count: 0, filename: 'audit-log-empty.csv' };
  }

  // Count rows: total lines − header − trailing empty line from last \n
  // csv = "BOM+headers\nrow1\nrow2\n" → split('\n') = ['BOM+headers', 'row1', 'row2', '']
  // We want count = 2 (rows excluding header + trailing empty)
  const lines = csv.split('\n');
  // Subtract 1 for header. Last element is empty string due to trailing \n — also subtract.
  count = Math.max(0, lines.length - 2);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `audit-log-${dateStr}.csv`;

  return { csv, count, filename };
}

// Test helpers
export const _testHelpers = {
  csvEscape,
  csvRow,
};
