// ═══════════════════════════════════════════════════════════════
// server/services/exportRegistry.js — Persistent Export Registry (Phase 50)
// ═══════════════════════════════════════════════════════════════
// File-backed export lifecycle registry.
// Storage: data/exports/{exportId}.json
// Optional CSV files: data/exports/{exportId}.csv
//
// Status lifecycle:
//   pending → running → completed | failed | cancelled | expired
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

function isEnabled() {
  return !!(config.EXPORTS && config.EXPORTS.enabled);
}

function generateId() {
  return 'exp_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function defaultExpiresAt() {
  const hours = config.EXPORTS?.retentionHours || 48;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function registryPath(exportId) {
  return getRecordPath('exports', exportId);
}

export function getExportCsvRelativePath(exportId) {
  return `${config.EXPORTS?.basePath || 'exports'}/${exportId}.csv`;
}

export function getExportCsvAbsolutePath(exportId) {
  return join(BASE_PATH, getExportCsvRelativePath(exportId));
}

function safePublicExport(record) {
  if (!record) return null;
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    requestedBy: record.requestedBy,
    filters: record.filters || {},
    rowsProcessed: record.rowsProcessed || 0,
    totalEstimate: record.totalEstimate || 0,
    percentage: record.percentage || 0,
    filePath: record.filePath || null,
    error: record.error || null,
    cancelRequested: !!record.cancelRequested,
    createdAt: record.createdAt,
    startedAt: record.startedAt || null,
    completedAt: record.completedAt || null,
    expiresAt: record.expiresAt || null,
  };
}

/**
 * Create a persistent export record.
 */
export async function createExport({ type, filters, requestedBy, totalEstimate } = {}) {
  if (!isEnabled()) return null;

  const id = generateId();
  const persistCsv = config.EXPORTS.persistCsvFiles !== false;
  const now = nowIso();

  const record = {
    id,
    type: type || 'unknown',
    status: 'pending',
    requestedBy: requestedBy || 'unknown',
    filters: filters || {},
    rowsProcessed: 0,
    totalEstimate: Math.max(0, Number(totalEstimate) || 0),
    percentage: 0,
    filePath: persistCsv ? getExportCsvRelativePath(id) : null,
    error: null,
    cancelRequested: false,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    expiresAt: defaultExpiresAt(),
  };

  await atomicWrite(registryPath(id), record);

  eventBus.emit('export:created', {
    exportId: id,
    type: record.type,
    requestedBy: record.requestedBy,
    timestamp: now,
  });

  return safePublicExport(record);
}

/**
 * Patch export progress/status.
 */
export async function updateExportProgress(exportId, patch = {}) {
  if (!isEnabled() || !exportId) return null;

  const path = registryPath(exportId);
  const record = await readJSON(path);
  if (!record) return null;

  const rowsProcessed = patch.rowsProcessed !== undefined
    ? Math.max(0, Number(patch.rowsProcessed) || 0)
    : record.rowsProcessed || 0;

  const totalEstimate = patch.totalEstimate !== undefined
    ? Math.max(0, Number(patch.totalEstimate) || 0)
    : record.totalEstimate || 0;

  let percentage = patch.percentage;
  if (percentage === undefined) {
    percentage = totalEstimate > 0
      ? Math.min(99, Math.round((rowsProcessed / totalEstimate) * 100))
      : (record.percentage || 0);
  }

  const next = {
    ...record,
    ...patch,
    rowsProcessed,
    totalEstimate,
    percentage,
    status: patch.status || (record.status === 'pending' ? 'running' : record.status),
    startedAt: record.startedAt || patch.startedAt || nowIso(),
    updatedAt: nowIso(),
  };

  await atomicWrite(path, next);

  eventBus.emit('export:progress', {
    exportId,
    status: next.status,
    rowsProcessed: next.rowsProcessed,
    totalEstimate: next.totalEstimate,
    percentage: next.percentage,
    timestamp: nowIso(),
  });

  return safePublicExport(next);
}

/**
 * Mark an export as completed.
 */
export async function completeExport(exportId, patch = {}) {
  if (!isEnabled() || !exportId) return null;

  const path = registryPath(exportId);
  const record = await readJSON(path);
  if (!record) return null;

  if (record.status === 'cancelled') return safePublicExport(record);

  const next = {
    ...record,
    ...patch,
    status: 'completed',
    percentage: 100,
    cancelRequested: false,
    completedAt: nowIso(),
    updatedAt: nowIso(),
  };

  await atomicWrite(path, next);

  eventBus.emit('export:completed', {
    exportId,
    type: next.type,
    rowsProcessed: next.rowsProcessed,
    timestamp: next.completedAt,
  });

  return safePublicExport(next);
}

/**
 * Mark an export as failed.
 */
export async function failExport(exportId, error) {
  if (!isEnabled() || !exportId) return null;

  const path = registryPath(exportId);
  const record = await readJSON(path);
  if (!record) return null;

  if (record.status === 'completed' || record.status === 'cancelled') {
    return safePublicExport(record);
  }

  const next = {
    ...record,
    status: 'failed',
    error: error ? String(error).slice(0, 1000) : 'Unknown export error',
    completedAt: nowIso(),
    updatedAt: nowIso(),
  };

  await atomicWrite(path, next);

  eventBus.emit('export:failed', {
    exportId,
    error: next.error,
    timestamp: next.completedAt,
  });

  return safePublicExport(next);
}

/**
 * Request cancellation.
 */
export async function cancelExport(exportId, requestedBy) {
  if (!isEnabled() || !config.EXPORTS.cancellationEnabled) {
    return { ok: false, error: 'EXPORT_CANCELLATION_DISABLED' };
  }

  const path = registryPath(exportId);
  const record = await readJSON(path);
  if (!record) return { ok: false, error: 'EXPORT_NOT_FOUND' };

  if (record.status === 'completed' || record.status === 'failed' || record.status === 'expired') {
    return { ok: false, error: 'EXPORT_ALREADY_FINISHED', export: safePublicExport(record) };
  }

  const next = {
    ...record,
    status: 'cancelled',
    cancelRequested: true,
    cancelledBy: requestedBy || 'unknown',
    completedAt: nowIso(),
    updatedAt: nowIso(),
  };

  await atomicWrite(path, next);

  eventBus.emit('export:cancelled', {
    exportId,
    requestedBy: requestedBy || 'unknown',
    timestamp: next.completedAt,
  });

  return { ok: true, export: safePublicExport(next) };
}

/**
 * Check cancellation flag.
 */
export async function isCancellationRequested(exportId) {
  if (!isEnabled() || !exportId) return false;
  const record = await readJSON(registryPath(exportId));
  return !!(record && (record.cancelRequested || record.status === 'cancelled'));
}

/**
 * Get export by ID.
 */
export async function getExport(exportId) {
  if (!isEnabled() || !exportId) return null;
  const record = await readJSON(registryPath(exportId));
  return safePublicExport(record);
}

/**
 * List exports newest first.
 */
export async function listExports(options = {}) {
  if (!isEnabled()) return { exports: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('exports');
  const all = await listJSON(dir);
  let rows = all.filter(e => e && e.id && e.id.startsWith('exp_'));

  if (options.type) rows = rows.filter(e => e.type === options.type);
  if (options.status) rows = rows.filter(e => e.status === options.status);
  if (options.requestedBy) rows = rows.filter(e => e.requestedBy === options.requestedBy);

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    exports: rows.slice(offset, offset + limit).map(safePublicExport),
    total,
    limit,
    offset,
  };
}

/**
 * Cleanup expired export records and CSV files.
 */
export async function cleanupExpiredExports() {
  if (!isEnabled()) return 0;

  const dir = getCollectionPath('exports');
  let files;
  try {
    files = await readdir(dir);
  } catch (_) {
    return 0;
  }

  const now = Date.now();
  let cleaned = 0;

  for (const file of files) {
    if (!file.startsWith('exp_') || !file.endsWith('.json') || file.endsWith('.tmp')) continue;

    const exportId = file.replace('.json', '');
    const record = await readJSON(registryPath(exportId)).catch(() => null);
    if (!record || !record.expiresAt) continue;

    if (new Date(record.expiresAt).getTime() <= now) {
      try {
        if (record.filePath) {
          await unlink(join(BASE_PATH, record.filePath)).catch(() => {});
        }
        await deleteJSON(registryPath(exportId)).catch(() => {});
        cleaned++;
      } catch (err) {
        logger.warn('exportRegistry: cleanup failed', { exportId, error: err.message });
      }
    }
  }

  if (cleaned > 0) {
    logger.info('exportRegistry: cleaned expired exports', { cleaned });
  }

  return cleaned;
}

/**
 * Check if persisted CSV file exists.
 */
export async function exportFileExists(exportId) {
  try {
    await stat(getExportCsvAbsolutePath(exportId));
    return true;
  } catch (_) {
    return false;
  }
}

export function getStats() {
  return {
    enabled: isEnabled(),
    basePath: config.EXPORTS?.basePath || 'exports',
    persistCsvFiles: config.EXPORTS?.persistCsvFiles !== false,
  };
}

export const _testHelpers = {
  generateId,
  safePublicExport,
  registryPath,
  getExportCsvAbsolutePath,
};
