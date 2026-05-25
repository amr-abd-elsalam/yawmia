// ═══════════════════════════════════════════════════════════════
// server/services/queueStorageIndex.js — Segmented Queue Storage (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Compatibility layer for durable ops queue records.
// New writes can go to segmented status/month paths while legacy flat queue
// records remain readable.
//
// Legacy:
//   data/ops_queue/q_x.json
//   data/ops_queue/dead-letter/q_x.json
//
// Segmented:
//   data/ops_queue/pending/YYYY-MM/q_x.json
//   data/ops_queue/running/YYYY-MM/q_x.json
//   data/ops_queue/completed/YYYY-MM/q_x.json
//   data/ops_queue/failed/YYYY-MM/q_x.json
//   data/ops_queue/cancelled/YYYY-MM/q_x.json
//   data/ops_queue/dead-letter/YYYY-MM/q_x.json
//
// Summary:
//   data/metrics/queue/summary.json
// ═══════════════════════════════════════════════════════════════

import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  isValidId,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

const ACTIVE_STATUSES = new Set(['pending', 'running', 'completed', 'failed', 'cancelled']);
const DEAD_LETTER_STATUS = 'dead-letter';

function cfg() {
  return config.QUEUE_STORAGE || {};
}

function isEnabled() {
  return !!(cfg().enabled && cfg().segmentByStatus);
}

function nowIso() {
  return new Date().toISOString();
}

function monthKey(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 7);
  return d.toISOString().slice(0, 7);
}

function normalizeStatus(status) {
  if (status === 'deadLetter') return DEAD_LETTER_STATUS;
  if (status === DEAD_LETTER_STATUS) return DEAD_LETTER_STATUS;
  if (ACTIVE_STATUSES.has(status)) return status;
  return 'pending';
}

function dirKeyForStatus(status) {
  const s = normalizeStatus(status);
  if (s === DEAD_LETTER_STATUS) return 'ops_queue_dead_letter';

  const map = {
    pending: 'queue_pending',
    running: 'queue_running',
    completed: 'queue_completed',
    failed: 'queue_failed',
    cancelled: 'queue_cancelled',
  };

  return map[s] || 'queue_pending';
}

function statusDirName(status) {
  const s = normalizeStatus(status);
  const statusDirs = cfg().statusDirs || {};
  if (s === DEAD_LETTER_STATUS) return statusDirs.deadLetter || 'dead-letter';
  return statusDirs[s] || s;
}

function legacyQueuePath(jobId) {
  return getRecordPath('ops_queue', jobId);
}

function legacyDeadLetterPath(jobId) {
  return getRecordPath('ops_queue_dead_letter', jobId);
}

function summaryPath() {
  return join(BASE_PATH, cfg().summaryFile || 'metrics/queue/summary.json');
}

function makeEmptySummary() {
  return {
    version: 1,
    enabled: isEnabled(),
    byStatus: {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      'dead-letter': 0,
    },
    byType: {},
    locations: {},
    legacyRecords: 0,
    lastRebuiltAt: null,
    lastUpdatedAt: null,
    stale: false,
    staleReason: null,
  };
}

function publicSummary(summary) {
  const empty = makeEmptySummary();
  const s = summary && typeof summary === 'object' ? summary : empty;
  return {
    ...empty,
    ...s,
    byStatus: { ...empty.byStatus, ...(s.byStatus || {}) },
    byType: s.byType || {},
    locations: s.locations || {},
  };
}

function relativeToBase(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  if (filePath.startsWith(BASE_PATH + '/')) return filePath.slice(BASE_PATH.length + 1);
  return filePath;
}

function absoluteFromSummaryPath(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return null;
  if (pathValue.startsWith('/')) return pathValue;
  return join(BASE_PATH, pathValue);
}

function increment(obj, key, delta) {
  if (!obj[key]) obj[key] = 0;
  obj[key] += delta;
  if (obj[key] < 0) obj[key] = 0;
}

function decrementType(summary, type) {
  if (!type) return;
  if (!summary.byType) summary.byType = {};
  if (summary.byType[type]) {
    summary.byType[type]--;
    if (summary.byType[type] <= 0) delete summary.byType[type];
  }
}

function incrementType(summary, type) {
  if (!type) return;
  if (!summary.byType) summary.byType = {};
  summary.byType[type] = (summary.byType[type] || 0) + 1;
}

/**
 * Return the segmented path for a queue job/status.
 *
 * @param {string} status
 * @param {string} jobId
 * @param {string} [createdAt]
 * @returns {string}
 */
export function getQueuePathByStatus(status, jobId, createdAt) {
  if (!jobId || !isValidId(jobId)) {
    throw new Error(`Invalid queue job ID: ${jobId}`);
  }

  const s = normalizeStatus(status);
  const dirKey = dirKeyForStatus(s);

  if (!isEnabled()) {
    if (s === DEAD_LETTER_STATUS) return legacyDeadLetterPath(jobId);
    return legacyQueuePath(jobId);
  }

  const root = getCollectionPath(dirKey);
  if (cfg().monthlySharding) {
    return join(root, monthKey(createdAt), `${jobId}.json`);
  }

  return join(root, `${jobId}.json`);
}

/**
 * Return path for a full job object.
 *
 * @param {object} job
 * @returns {string}
 */
export function getQueueRecordPath(job) {
  if (!job || !job.id) throw new Error('queue job is required');
  return getQueuePathByStatus(job.status, job.id, job.createdAt || job.updatedAt);
}

export async function readQueueSummary() {
  try {
    const summary = await readJSON(summaryPath());
    return publicSummary(summary);
  } catch (_) {
    return makeEmptySummary();
  }
}

async function writeQueueSummary(summary) {
  const next = publicSummary(summary);
  next.lastUpdatedAt = nowIso();
  await atomicWrite(summaryPath(), next);
  return next;
}

/**
 * Update queue summary and location index.
 * Safe to call repeatedly; if oldStatus===newStatus it refreshes location.
 */
export async function updateQueueSummary(job, oldStatus, newStatus) {
  if (!job || !job.id) return null;

  return withLock('queue-summary', async () => {
    const summary = await readQueueSummary();
    const oldS = oldStatus ? normalizeStatus(oldStatus) : null;
    const newS = newStatus ? normalizeStatus(newStatus) : normalizeStatus(job.status);

    summary.byStatus = summary.byStatus || makeEmptySummary().byStatus;
    summary.byType = summary.byType || {};
    summary.locations = summary.locations || {};

    if (oldS && oldS !== newS) {
      increment(summary.byStatus, oldS, -1);
      decrementType(summary, job.type);
    }

    if (!oldS || oldS !== newS) {
      increment(summary.byStatus, newS, 1);
      incrementType(summary, job.type);
    }

    const filePath = getQueuePathByStatus(newS, job.id, job.createdAt || job.updatedAt);
    summary.locations[job.id] = {
      jobId: job.id,
      status: newS,
      type: job.type || null,
      path: relativeToBase(filePath),
      createdAt: job.createdAt || null,
      updatedAt: job.updatedAt || null,
    };

    summary.stale = false;
    summary.staleReason = null;

    const saved = await writeQueueSummary(summary);

    eventBus.emit('ops_queue:summary_updated', {
      jobId: job.id,
      oldStatus: oldS,
      newStatus: newS,
      timestamp: saved.lastUpdatedAt,
    });

    return saved;
  });
}

/**
 * Write queue record to current storage layout.
 * If an existing summary location points to a different path, deletes old copy.
 *
 * @param {object} job
 */
export async function writeQueueRecord(job) {
  if (!job || !job.id) throw new Error('queue job is required');

  const newPath = getQueueRecordPath(job);
  let oldStatus = null;
  let oldPath = null;

  try {
    const summary = await readQueueSummary();
    const loc = summary.locations && summary.locations[job.id];
    if (loc) {
      oldStatus = loc.status || null;
      oldPath = absoluteFromSummaryPath(loc.path);
    }
  } catch (_) {
    // no summary yet
  }

  await atomicWrite(newPath, job);

  if (oldPath && oldPath !== newPath) {
    await deleteJSON(oldPath).catch(() => {});
    eventBus.emit('ops_queue:record_moved', {
      jobId: job.id,
      oldStatus,
      newStatus: job.status,
      from: relativeToBase(oldPath),
      to: relativeToBase(newPath),
      timestamp: nowIso(),
    });
  }

  await updateQueueSummary(job, oldStatus, job.status).catch(err => {
    logger.warn('queueStorageIndex: summary update failed', {
      jobId: job.id,
      error: err.message,
    });
  });

  return job;
}

/**
 * Read queue record by ID.
 * Order:
 *   1. summary location
 *   2. legacy active path
 *   3. legacy dead-letter path
 *   4. segmented current/recent paths via bounded scan
 */
export async function readQueueRecord(jobId) {
  if (!jobId || typeof jobId !== 'string' || !isValidId(jobId)) return null;

  // 1. Summary location.
  try {
    const summary = await readQueueSummary();
    const loc = summary.locations && summary.locations[jobId];
    if (loc && loc.path) {
      const filePath = absoluteFromSummaryPath(loc.path);
      const record = await readJSON(filePath);
      if (record) return record;
    }
  } catch (_) {}

  // 2. Legacy active.
  if (cfg().legacyReadFallback !== false) {
    const legacy = await readJSON(legacyQueuePath(jobId)).catch(() => null);
    if (legacy) {
      eventBus.emit('ops_queue:legacy_record_detected', {
        jobId,
        status: legacy.status || null,
        timestamp: nowIso(),
      });
      return legacy;
    }

    const legacyDlq = await readJSON(legacyDeadLetterPath(jobId)).catch(() => null);
    if (legacyDlq) {
      eventBus.emit('ops_queue:legacy_record_detected', {
        jobId,
        status: 'dead-letter',
        timestamp: nowIso(),
      });
      return legacyDlq;
    }
  }

  // 3. Segmented bounded scan.
  if (!isEnabled()) return null;

  const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled', DEAD_LETTER_STATUS];
  const now = new Date();
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }

  for (const status of statuses) {
    const dirKey = dirKeyForStatus(status);
    const root = getCollectionPath(dirKey);

    for (const month of months) {
      const filePath = cfg().monthlySharding
        ? join(root, month, `${jobId}.json`)
        : join(root, `${jobId}.json`);

      const record = await readJSON(filePath).catch(() => null);
      if (record) {
        await updateQueueSummary(record, null, record.status).catch(() => {});
        return record;
      }
    }
  }

  return null;
}

/**
 * Delete queue record from known storage.
 */
export async function deleteQueueRecord(jobOrId) {
  const jobId = typeof jobOrId === 'string' ? jobOrId : jobOrId?.id;
  if (!jobId || !isValidId(jobId)) return false;

  let deleted = false;
  let status = typeof jobOrId === 'object' ? normalizeStatus(jobOrId.status) : null;
  let type = typeof jobOrId === 'object' ? jobOrId.type : null;

  const summary = await readQueueSummary().catch(() => makeEmptySummary());
  const loc = summary.locations && summary.locations[jobId];

  if (loc && loc.path) {
    const filePath = absoluteFromSummaryPath(loc.path);
    deleted = await deleteJSON(filePath).catch(() => false) || deleted;
    status = status || loc.status;
    type = type || loc.type;
  }

  // Legacy cleanup too (best-effort).
  deleted = await deleteJSON(legacyQueuePath(jobId)).catch(() => false) || deleted;
  deleted = await deleteJSON(legacyDeadLetterPath(jobId)).catch(() => false) || deleted;

  // Remove from summary.
  await withLock('queue-summary', async () => {
    const s = await readQueueSummary();
    if (s.locations && s.locations[jobId]) {
      const loc2 = s.locations[jobId];
      const st = status || loc2.status;
      const tp = type || loc2.type;
      if (st) increment(s.byStatus, normalizeStatus(st), -1);
      if (tp) decrementType(s, tp);
      delete s.locations[jobId];
      await writeQueueSummary(s);
    }
  }).catch(() => {});

  return deleted;
}

/**
 * Move queue record to a new status segment.
 */
export async function moveQueueRecord(job, newStatus) {
  if (!job || !job.id) throw new Error('queue job is required');

  const oldStatus = normalizeStatus(job.status);
  const nextStatus = normalizeStatus(newStatus);

  const next = {
    ...job,
    status: nextStatus,
    updatedAt: job.updatedAt || nowIso(),
  };

  const oldPath = await findCurrentPath(job.id, oldStatus).catch(() => null);
  const newPath = getQueuePathByStatus(nextStatus, next.id, next.createdAt || next.updatedAt);

  await atomicWrite(newPath, next);

  if (oldPath && oldPath !== newPath) {
    await deleteJSON(oldPath).catch(() => {});
  }

  await updateQueueSummary(next, oldStatus, nextStatus).catch(() => {});

  eventBus.emit('ops_queue:record_moved', {
    jobId: next.id,
    oldStatus,
    newStatus: nextStatus,
    from: oldPath ? relativeToBase(oldPath) : null,
    to: relativeToBase(newPath),
    timestamp: nowIso(),
  });

  return next;
}

async function findCurrentPath(jobId, expectedStatus) {
  const summary = await readQueueSummary();
  const loc = summary.locations && summary.locations[jobId];
  if (loc && loc.path) {
    const filePath = absoluteFromSummaryPath(loc.path);
    const exists = await stat(filePath).then(() => true).catch(() => false);
    if (exists) return filePath;
  }

  const legacy = legacyQueuePath(jobId);
  if (await stat(legacy).then(() => true).catch(() => false)) return legacy;

  const legacyDlq = legacyDeadLetterPath(jobId);
  if (await stat(legacyDlq).then(() => true).catch(() => false)) return legacyDlq;

  if (!isEnabled()) return null;

  const status = normalizeStatus(expectedStatus || 'pending');
  const root = getCollectionPath(dirKeyForStatus(status));

  if (!cfg().monthlySharding) {
    const p = join(root, `${jobId}.json`);
    return await stat(p).then(() => p).catch(() => null);
  }

  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const months = entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
    .map(e => e.name)
    .sort()
    .reverse();

  for (const month of months) {
    const p = join(root, month, `${jobId}.json`);
    const ok = await stat(p).then(() => true).catch(() => false);
    if (ok) return p;
  }

  return null;
}

async function listSegmentStatus(status, options = {}) {
  const dirKey = dirKeyForStatus(status);

  if (!isEnabled()) {
    if (status === DEAD_LETTER_STATUS) return await listJSON(getCollectionPath('ops_queue_dead_letter'));
    return await listJSON(getCollectionPath('ops_queue'));
  }

  const root = getCollectionPath(dirKey);
  const results = [];

  if (cfg().monthlySharding) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    let months = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    if (options.months && Array.isArray(options.months)) {
      const wanted = new Set(options.months);
      months = months.filter(m => wanted.has(m));
    }

    const maxMonths = options.maxMonths || 6;
    months = months.slice(0, maxMonths);

    for (const month of months) {
      const dir = join(root, month);
      const rows = await listJSON(dir, { tolerateCorrupt: true }).catch(() => []);
      for (const row of rows) results.push(row);
    }

    return results;
  }

  return await listJSON(root, { tolerateCorrupt: true }).catch(() => []);
}

/**
 * List queue records.
 *
 * @param {{ status?: string, type?: string, deadLetter?: boolean, limit?: number, offset?: number, maxMonths?: number }} options
 */
export async function listQueueRecords(options = {}) {
  const status = options.deadLetter ? DEAD_LETTER_STATUS : (options.status ? normalizeStatus(options.status) : null);

  let rows = [];

  if (status) {
    rows = await listSegmentStatus(status, options);

    // Legacy fallback for active mixed layout when requested status is not DLQ.
    if (cfg().legacyReadFallback !== false && status !== DEAD_LETTER_STATUS) {
      const legacyRows = await listJSON(getCollectionPath('ops_queue'), { tolerateCorrupt: true }).catch(() => []);
      rows.push(...legacyRows.filter(j => j && normalizeStatus(j.status) === status));
    }
  } else {
    const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    for (const s of statuses) {
      rows.push(...await listSegmentStatus(s, options));
    }

    if (options.includeDeadLetter) {
      rows.push(...await listSegmentStatus(DEAD_LETTER_STATUS, options));
    }

    if (cfg().legacyReadFallback !== false) {
      const legacyRows = await listJSON(getCollectionPath('ops_queue'), { tolerateCorrupt: true }).catch(() => []);
      rows.push(...legacyRows);
    }
  }

  // Dedupe by ID.
  const byId = new Map();
  for (const row of rows) {
    if (!row || !row.id || !row.id.startsWith('q_')) continue;
    byId.set(row.id, row);
  }

  rows = Array.from(byId.values());

  if (options.type) rows = rows.filter(j => j.type === options.type);
  if (options.createdBy) rows = rows.filter(j => j.createdBy === options.createdBy);

  return rows;
}

/**
 * Full rebuild of summary/location index.
 */
export async function rebuildQueueSummary() {
  return withLock('queue-summary', async () => {
    const summary = makeEmptySummary();

    const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled', DEAD_LETTER_STATUS];

    for (const status of statuses) {
      const rows = await listSegmentStatus(status, { maxMonths: 120 }).catch(() => []);
      for (const job of rows) {
        if (!job || !job.id) continue;
        const s = normalizeStatus(job.status || status);
        increment(summary.byStatus, s, 1);
        incrementType(summary, job.type);

        summary.locations[job.id] = {
          jobId: job.id,
          status: s,
          type: job.type || null,
          path: relativeToBase(getQueuePathByStatus(s, job.id, job.createdAt || job.updatedAt)),
          createdAt: job.createdAt || null,
          updatedAt: job.updatedAt || null,
        };
      }
    }

    // Legacy flat records.
    if (cfg().legacyReadFallback !== false) {
      const legacy = await listJSON(getCollectionPath('ops_queue'), { tolerateCorrupt: true }).catch(() => []);
      for (const job of legacy) {
        if (!job || !job.id || !job.id.startsWith('q_')) continue;
        if (summary.locations[job.id]) continue;

        const s = normalizeStatus(job.status || 'pending');
        increment(summary.byStatus, s, 1);
        incrementType(summary, job.type);
        summary.legacyRecords++;
        summary.locations[job.id] = {
          jobId: job.id,
          status: s,
          type: job.type || null,
          path: relativeToBase(legacyQueuePath(job.id)),
          createdAt: job.createdAt || null,
          updatedAt: job.updatedAt || null,
          legacy: true,
        };
      }

      const legacyDlq = await listJSON(getCollectionPath('ops_queue_dead_letter'), { tolerateCorrupt: true }).catch(() => []);
      for (const job of legacyDlq) {
        if (!job || !job.id || !job.id.startsWith('q_')) continue;
        if (summary.locations[job.id]) continue;

        increment(summary.byStatus, DEAD_LETTER_STATUS, 1);
        incrementType(summary, job.type);
        summary.legacyRecords++;
        summary.locations[job.id] = {
          jobId: job.id,
          status: DEAD_LETTER_STATUS,
          type: job.type || null,
          path: relativeToBase(legacyDeadLetterPath(job.id)),
          createdAt: job.createdAt || null,
          updatedAt: job.updatedAt || null,
          legacy: true,
        };
      }
    }

    summary.lastRebuiltAt = nowIso();
    summary.lastUpdatedAt = summary.lastRebuiltAt;
    summary.stale = false;
    summary.staleReason = null;

    await atomicWrite(summaryPath(), summary);

    return summary;
  });
}

export async function markQueueSummaryStale(reason) {
  return withLock('queue-summary', async () => {
    const summary = await readQueueSummary();
    summary.stale = true;
    summary.staleReason = reason || 'unknown';
    summary.lastUpdatedAt = nowIso();
    await atomicWrite(summaryPath(), summary);
    return summary;
  });
}

export const _testHelpers = {
  BASE_PATH,
  isEnabled,
  monthKey,
  normalizeStatus,
  dirKeyForStatus,
  statusDirName,
  legacyQueuePath,
  legacyDeadLetterPath,
  summaryPath,
  makeEmptySummary,
  publicSummary,
  relativeToBase,
  absoluteFromSummaryPath,
  listSegmentStatus,
};
