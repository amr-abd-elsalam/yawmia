// ═══════════════════════════════════════════════════════════════
// server/services/schedulerRunHistory.js — Scheduler Run History (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Persistent run history for scheduler registry.
// Storage:
//   data/scheduler/history/{jobName}/YYYY-MM.json
//
// Current scheduler record remains in data/scheduler/{jobName}.json.
// History is append-only per month with bounded retention.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  isValidId,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

function isEnabled() {
  return !!(config.SCHEDULER_HISTORY && config.SCHEDULER_HISTORY.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function monthKey(iso = nowIso()) {
  return String(iso).slice(0, 7);
}

function safeJobName(name) {
  const raw = String(name || 'unknown');
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return safe || 'unknown';
}

function historyRoot() {
  return join(BASE_PATH, config.SCHEDULER_HISTORY?.basePath || 'scheduler/history');
}

function historyFilePath(name, iso = nowIso()) {
  const safeName = safeJobName(name);
  return join(historyRoot(), safeName, `${monthKey(iso)}.json`);
}

function generateRunId() {
  return 'schrun_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function sanitizeEntry(entry = {}) {
  const now = nowIso();

  return {
    runId: entry.runId || generateRunId(),
    name: entry.name || 'unknown',
    queueJobId: entry.queueJobId || null,
    status: entry.status || 'queued',
    createdBy: entry.createdBy || 'scheduler',
    startedAt: entry.startedAt || now,
    completedAt: entry.completedAt || null,
    durationMs: Number(entry.durationMs || 0),
    error: entry.error ? String(entry.error).slice(0, 1000) : null,
    idempotencyKey: entry.idempotencyKey || null,
    deduped: !!entry.deduped,
    metadata: entry.metadata && typeof entry.metadata === 'object'
      ? JSON.parse(JSON.stringify(entry.metadata))
      : {},
  };
}

/**
 * Record one scheduler run history entry.
 *
 * @param {string} name
 * @param {object} entry
 */
export async function recordSchedulerRun(name, entry = {}) {
  if (!isEnabled()) return { ok: false, disabled: true };
  if (!name || !isValidId(safeJobName(name))) {
    return { ok: false, code: 'INVALID_SCHEDULER_NAME' };
  }

  const safeName = safeJobName(name);
  const record = sanitizeEntry({ ...entry, name: safeName });
  const filePath = historyFilePath(safeName, record.startedAt || nowIso());

  return withLock(`scheduler-history:${safeName}:${monthKey(record.startedAt)}`, async () => {
    const data = (await readJSON(filePath).catch(() => null)) || {
      name: safeName,
      month: monthKey(record.startedAt),
      runs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    data.runs = Array.isArray(data.runs) ? data.runs : [];
    data.runs.push(record);

    const maxRuns = config.SCHEDULER_HISTORY?.maxRunsPerJob || 100;
    data.runs.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
    data.runs = data.runs.slice(0, maxRuns);

    data.updatedAt = nowIso();

    await atomicWrite(filePath, data);

    eventBus.emit('scheduler:run_history_recorded', {
      name: safeName,
      runId: record.runId,
      status: record.status,
      queueJobId: record.queueJobId || null,
      timestamp: data.updatedAt,
    });

    return { ok: true, run: record };
  });
}

/**
 * List scheduler run history for one job.
 *
 * @param {string} name
 * @param {{ month?: string, limit?: number, offset?: number }} options
 */
export async function listSchedulerRuns(name, options = {}) {
  if (!isEnabled()) {
    return { runs: [], total: 0, limit: 20, offset: 0, disabled: true };
  }

  const safeName = safeJobName(name);
  const root = join(historyRoot(), safeName);

  let months = [];

  if (options.month) {
    months = [options.month];
  } else {
    try {
      const files = await readdir(root);
      months = files
        .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
        .map(f => f.replace('.json', ''))
        .sort()
        .reverse();
    } catch (_) {
      months = [];
    }
  }

  const runs = [];

  for (const month of months) {
    const filePath = join(root, `${month}.json`);
    const data = await readJSON(filePath).catch(() => null);
    if (!data || !Array.isArray(data.runs)) continue;
    runs.push(...data.runs);
  }

  runs.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

  const total = runs.length;
  const limit = Math.min(200, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    runs: runs.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Cleanup scheduler history older than retentionDays.
 */
export async function cleanupSchedulerHistory(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled', cleaned: 0 };

  const retentionDays = options.retentionDays || config.SCHEDULER_HISTORY?.retentionDays || 90;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const root = historyRoot();

  let jobDirs = [];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    jobDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch (_) {
    return { scanned: 0, cleaned: 0, retentionDays };
  }

  let scanned = 0;
  let cleaned = 0;
  let failed = 0;

  for (const jobName of jobDirs) {
    const dir = join(root, jobName);
    let files = [];

    try {
      files = await readdir(dir);
    } catch (_) {
      continue;
    }

    for (const file of files) {
      if (!/^\d{4}-\d{2}\.json$/.test(file)) continue;

      scanned++;
      const month = file.replace('.json', '');
      const monthMs = new Date(`${month}-01T00:00:00.000Z`).getTime();

      if (Number.isFinite(monthMs) && monthMs < cutoffMs) {
        try {
          await rm(join(dir, file), { force: true });
          cleaned++;
        } catch (_) {
          failed++;
        }
      }
    }
  }

  eventBus.emit('scheduler:history_cleanup_completed', {
    scanned,
    cleaned,
    failed,
    retentionDays,
    timestamp: nowIso(),
  });

  return { scanned, cleaned, failed, retentionDays };
}

export async function getSchedulerHistoryStats() {
  if (!isEnabled()) return { enabled: false };

  const root = historyRoot();

  let schedulerCount = 0;
  let fileCount = 0;
  let runCount = 0;

  try {
    const jobDirs = await readdir(root, { withFileTypes: true });
    const dirs = jobDirs.filter(e => e.isDirectory());
    schedulerCount = dirs.length;

    for (const dirEnt of dirs) {
      const dir = join(root, dirEnt.name);
      const files = await readdir(dir).catch(() => []);
      for (const file of files) {
        if (!/^\d{4}-\d{2}\.json$/.test(file)) continue;
        fileCount++;
        const data = await readJSON(join(dir, file)).catch(() => null);
        if (data && Array.isArray(data.runs)) runCount += data.runs.length;
      }
    }
  } catch (_) {}

  return {
    enabled: true,
    schedulerCount,
    fileCount,
    runCount,
    retentionDays: config.SCHEDULER_HISTORY?.retentionDays || 90,
    maxRunsPerJob: config.SCHEDULER_HISTORY?.maxRunsPerJob || 100,
  };
}

export const _testHelpers = {
  isEnabled,
  monthKey,
  safeJobName,
  historyRoot,
  historyFilePath,
  generateRunId,
  sanitizeEntry,
};
