// ═══════════════════════════════════════════════════════════════
// server/services/queueCompaction.js — Queue Hygiene + Archive (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Archives old completed/failed/cancelled/dead-letter queue records,
// cleans expired idempotency records, and captures slow running job diagnostics.
//
// Archive layout:
//   data/ops_queue/archive/YYYY-MM/completed.json
//   data/ops_queue/archive/YYYY-MM/failed.json
//   data/ops_queue/archive/YYYY-MM/cancelled.json
//   data/ops_queue/archive/YYYY-MM/dead-letter.json
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getCollectionPath,
  getRecordPath,
  listJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import {
  listQueueRecords,
  deleteQueueRecord,
  rebuildQueueSummary,
  readQueueSummary,
} from './queueStorageIndex.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

let lastQueueCompactionStats = null;

function isEnabled() {
  return !!(config.QUEUE_HYGIENE && config.QUEUE_HYGIENE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function monthKey(iso = nowIso()) {
  return String(iso).slice(0, 7);
}

function normalizeArchiveStatus(status) {
  if (status === 'deadLetter') return 'dead-letter';
  if (status === 'dead-letter') return 'dead-letter';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return null;
}

function archiveFilePath(status, iso) {
  const s = normalizeArchiveStatus(status);
  if (!s) throw new Error(`Invalid archive status: ${status}`);
  const archiveRoot = config.QUEUE_HYGIENE?.archivePath || 'ops_queue/archive';
  return join(BASE_PATH, archiveRoot, monthKey(iso), `${s}.json`);
}

function archiveBasis(job) {
  return job.completedAt ||
    job.deadLetteredAt ||
    job.cancelledAt ||
    job.failedAt ||
    job.updatedAt ||
    job.createdAt ||
    nowIso();
}

function retentionCutoffForStatus(status) {
  const cfg = config.QUEUE_HYGIENE || {};
  const now = Date.now();

  if (status === 'completed') {
    return now - (cfg.archiveCompletedAfterHours || 48) * 60 * 60 * 1000;
  }

  if (status === 'failed') {
    return now - (cfg.archiveFailedAfterDays || 14) * 24 * 60 * 60 * 1000;
  }

  if (status === 'cancelled') {
    return now - (cfg.archiveCancelledAfterHours || 48) * 60 * 60 * 1000;
  }

  if (status === 'dead-letter') {
    return now - (cfg.archiveDeadLetterAfterDays || 90) * 24 * 60 * 60 * 1000;
  }

  return 0;
}

function shouldArchive(job) {
  if (!job || !job.id) return false;

  const status = normalizeArchiveStatus(job.status);
  if (!status) return false;

  // Never archive active execution states.
  if (job.status === 'pending' || job.status === 'running') return false;

  const basis = archiveBasis(job);
  const basisMs = parseMs(basis);
  if (!basisMs) return false;

  return basisMs < retentionCutoffForStatus(status);
}

async function appendArchiveRecord(status, job) {
  const s = normalizeArchiveStatus(status);
  if (!s || !job || !job.id) return false;

  const basis = archiveBasis(job);
  const filePath = archiveFilePath(s, basis);

  return withLock(`queue-archive:${s}:${monthKey(basis)}`, async () => {
    const archive = (await readJSON(filePath)) || {
      version: 1,
      status: s,
      month: monthKey(basis),
      archivedAt: nowIso(),
      entries: {},
    };

    if (!archive.entries) archive.entries = {};

    archive.entries[job.id] = {
      ...job,
      archivedAt: nowIso(),
    };

    archive.updatedAt = nowIso();

    await atomicWrite(filePath, archive);
    return true;
  });
}

/**
 * Archive old queue records by retention policy.
 *
 * @param {{ status?: string, dryRun?: boolean, limit?: number }} options
 */
export async function archiveOldQueueRecords(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled', archived: 0 };

  const statuses = options.status
    ? [normalizeArchiveStatus(options.status)].filter(Boolean)
    : ['completed', 'failed', 'cancelled', 'dead-letter'];

  const limit = Math.max(1, parseInt(options.limit) || 10000);
  const dryRun = !!options.dryRun;

  let scanned = 0;
  let archived = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const status of statuses) {
    const rows = await listQueueRecords({
      status,
      deadLetter: status === 'dead-letter',
      includeDeadLetter: status === 'dead-letter',
      maxMonths: 120,
    });

    for (let i = 0; i < rows.length; i++) {
      if (scanned >= limit) break;

      const job = rows[i];
      scanned++;

      if (!shouldArchive(job)) {
        skipped++;
        continue;
      }

      try {
        if (!dryRun) {
          await appendArchiveRecord(status, job);
          await deleteQueueRecord(job);

          // Keep legacy DLQ mirror clean if this was a dead-letter job.
          if (status === 'dead-letter') {
            await deleteJSON(getRecordPath('ops_queue_dead_letter', job.id)).catch(() => {});
          }
        }

        archived++;
      } catch (err) {
        failed++;
        failures.push({ jobId: job.id, status, error: err.message });
        logger.warn('queueCompaction: archive failed', { jobId: job.id, status, error: err.message });
      }

      if ((i + 1) % 100 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  if (!dryRun && archived > 0) {
    await rebuildQueueSummary().catch(() => {});
  }

  return {
    scanned,
    archived,
    skipped,
    failed,
    dryRun,
    failures: failures.slice(0, 20),
  };
}

/**
 * Cleanup expired idempotency records.
 *
 * @param {{ dryRun?: boolean, limit?: number }} options
 */
export async function cleanupIdempotencyRecords(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled', cleaned: 0 };

  if (config.QUEUE_HYGIENE?.idempotencyCleanupEnabled === false) {
    return { skipped: true, reason: 'idempotency_cleanup_disabled', cleaned: 0 };
  }

  const dryRun = !!options.dryRun;
  const limit = Math.max(1, parseInt(options.limit) || 10000);
  const dir = getCollectionPath('ops_queue_idempotency');

  const records = await listJSON(dir);
  const now = Date.now();

  let scanned = 0;
  let cleaned = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const rec of records) {
    if (scanned >= limit) break;
    scanned++;

    if (!rec || !rec.keyHash) {
      skipped++;
      continue;
    }

    const expiresMs = parseMs(rec.expiresAt);
    if (!expiresMs || expiresMs > now) {
      skipped++;
      continue;
    }

    try {
      if (!dryRun) {
        await deleteJSON(getRecordPath('ops_queue_idempotency', rec.keyHash));
      }
      cleaned++;
    } catch (err) {
      failed++;
      failures.push({ keyHash: rec.keyHash, error: err.message });
    }

    if (scanned % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  eventBus.emit('queue:idempotency_cleanup_completed', {
    scanned,
    cleaned,
    skipped,
    failed,
    timestamp: nowIso(),
  });

  return {
    scanned,
    cleaned,
    skipped,
    failed,
    dryRun,
    failures: failures.slice(0, 20),
  };
}

/**
 * Capture slow/stale running job diagnostics.
 *
 * @param {{ thresholdMs?: number }} options
 */
export async function captureSlowJobDiagnostics(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled', slowJobs: [] };

  const thresholdMs = options.thresholdMs || config.QUEUE_HYGIENE?.slowJobThresholdMs || (5 * 60 * 1000);
  const rows = await listQueueRecords({ status: 'running', maxMonths: 2 });
  const now = Date.now();

  const slowJobs = rows
    .filter(job => {
      const startedMs = parseMs(job.startedAt || job.updatedAt);
      return startedMs > 0 && (now - startedMs) >= thresholdMs;
    })
    .map(job => ({
      jobId: job.id,
      type: job.type,
      attempts: job.attempts || 0,
      lockedBy: job.lockedBy || null,
      startedAt: job.startedAt || null,
      updatedAt: job.updatedAt || null,
      ageMs: now - parseMs(job.startedAt || job.updatedAt),
      leaseUntil: job.leaseUntil || null,
    }))
    .sort((a, b) => b.ageMs - a.ageMs);

  if (slowJobs.length > 0) {
    const filePath = join(BASE_PATH, 'metrics/scale-hygiene/queue-slow-jobs.json');
    await atomicWrite(filePath, {
      generatedAt: nowIso(),
      thresholdMs,
      count: slowJobs.length,
      slowJobs: slowJobs.slice(0, 200),
    });

    eventBus.emit('queue:slow_jobs_detected', {
      count: slowJobs.length,
      thresholdMs,
      sample: slowJobs.slice(0, 5),
      timestamp: nowIso(),
    });
  }

  return {
    thresholdMs,
    slowJobs,
    count: slowJobs.length,
  };
}

/**
 * Run full queue compaction.
 */
export async function compactQueue(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const started = Date.now();

  eventBus.emit('queue:compaction_started', {
    timestamp: nowIso(),
  });

  try {
    const archive = await archiveOldQueueRecords(options);
    const idempotency = await cleanupIdempotencyRecords(options);
    const slowJobs = await captureSlowJobDiagnostics(options);
    const summary = await readQueueSummary().catch(() => null);

    const result = {
      ok: true,
      archive,
      idempotency,
      slowJobs: {
        count: slowJobs.count || 0,
        thresholdMs: slowJobs.thresholdMs || null,
      },
      summary: summary ? {
        byStatus: summary.byStatus || {},
        legacyRecords: summary.legacyRecords || 0,
        lastUpdatedAt: summary.lastUpdatedAt || null,
      } : null,
      durationMs: Date.now() - started,
      completedAt: nowIso(),
    };

    lastQueueCompactionStats = result;

    eventBus.emit('queue:compaction_completed', {
      archived: archive.archived || 0,
      idempotencyCleaned: idempotency.cleaned || 0,
      slowJobs: slowJobs.count || 0,
      durationMs: result.durationMs,
      timestamp: result.completedAt,
    });

    return result;
  } catch (err) {
    const failure = {
      ok: false,
      error: err.message,
      durationMs: Date.now() - started,
      failedAt: nowIso(),
    };

    lastQueueCompactionStats = failure;

    eventBus.emit('queue:compaction_failed', failure);
    logger.warn('queueCompaction: compactQueue failed', { error: err.message });

    throw err;
  }
}

export function getLastQueueCompactionStats() {
  return lastQueueCompactionStats;
}

export async function getQueueArchiveStats() {
  const archiveRoot = join(BASE_PATH, config.QUEUE_HYGIENE?.archivePath || 'ops_queue/archive');

  const stats = {
    archiveRoot,
    months: 0,
    files: 0,
    entries: 0,
    byStatus: {
      completed: 0,
      failed: 0,
      cancelled: 0,
      'dead-letter': 0,
    },
  };

  let months = [];
  try {
    const entries = await import('node:fs/promises').then(fs => fs.readdir(archiveRoot, { withFileTypes: true }));
    months = entries.filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name)).map(e => e.name);
  } catch (_) {
    return stats;
  }

  stats.months = months.length;

  for (const month of months) {
    for (const status of Object.keys(stats.byStatus)) {
      const filePath = join(archiveRoot, month, `${status}.json`);
      const data = await readJSON(filePath).catch(() => null);
      if (!data) continue;

      stats.files++;
      const count = Object.keys(data.entries || {}).length;
      stats.entries += count;
      stats.byStatus[status] += count;
    }
  }

  return stats;
}

export const _testHelpers = {
  isEnabled,
  parseMs,
  monthKey,
  normalizeArchiveStatus,
  archiveFilePath,
  archiveBasis,
  retentionCutoffForStatus,
  shouldArchive,
  appendArchiveRecord,
};
