// ═══════════════════════════════════════════════════════════════
// server/services/trustSnapshotRollups.js — Trust Snapshot Rollups (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Monthly rollups + retention for Trust Score V2 snapshots and calibration reports.
// Does NOT mutate trust weights.
// ═══════════════════════════════════════════════════════════════

import { readdir, rm } from 'node:fs/promises';
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
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

function isEnabled() {
  return !!(config.TRUST_RETENTION && config.TRUST_RETENTION.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function monthKey(iso = nowIso()) {
  return String(iso).slice(0, 7);
}

function rollupPath(month) {
  return getRecordPath('trust_rollups', month);
}

function snapshotRoot() {
  return getCollectionPath('trust_snapshots');
}

function reportPath(reportId) {
  return getRecordPath('trust_calibration', reportId);
}

function emptyRollup(month) {
  return {
    month,
    snapshotCount: 0,
    byRole: {},
    byGrade: {},
    avgScore: 0,
    scoreTotal: 0,
    generatedAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function addSnapshotToRollup(rollup, snapshot) {
  rollup.snapshotCount++;
  rollup.scoreTotal += Number(snapshot.score || 0);
  rollup.avgScore = rollup.snapshotCount > 0
    ? Math.round((rollup.scoreTotal / rollup.snapshotCount) * 100) / 100
    : 0;

  const role = snapshot.role || 'unknown';
  const grade = snapshot.grade || 'unknown';

  if (!rollup.byRole[role]) {
    rollup.byRole[role] = { count: 0, scoreTotal: 0, avgScore: 0 };
  }
  rollup.byRole[role].count++;
  rollup.byRole[role].scoreTotal += Number(snapshot.score || 0);
  rollup.byRole[role].avgScore = Math.round((rollup.byRole[role].scoreTotal / rollup.byRole[role].count) * 100) / 100;

  rollup.byGrade[grade] = (rollup.byGrade[grade] || 0) + 1;
}

/**
 * Create monthly rollup for trust snapshots.
 *
 * @param {{ month?: string }} options
 */
export async function createTrustSnapshotRollup(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  if (config.TRUST_RETENTION?.rollupEnabled === false) {
    return { skipped: true, reason: 'rollup_disabled' };
  }

  const month = options.month || monthKey();
  const dir = join(snapshotRoot(), month);

  let files = [];
  try {
    files = await readdir(dir);
  } catch (_) {
    const empty = emptyRollup(month);
    await atomicWrite(rollupPath(month), empty);
    return { ok: true, rollup: empty, empty: true };
  }

  const rollup = emptyRollup(month);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.startsWith('tsv2_') || !file.endsWith('.json') || file.endsWith('.tmp')) continue;

    const snapshot = await readJSON(join(dir, file)).catch(() => null);
    if (!snapshot) continue;

    addSnapshotToRollup(rollup, snapshot);

    if ((i + 1) % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  rollup.updatedAt = nowIso();

  await atomicWrite(rollupPath(month), rollup);

  eventBus.emit('trust_retention:rollup_created', {
    month,
    snapshotCount: rollup.snapshotCount,
    avgScore: rollup.avgScore,
    timestamp: rollup.updatedAt,
  });

  return { ok: true, rollup };
}

export async function listTrustSnapshotRollups(options = {}) {
  if (!isEnabled()) return { rollups: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('trust_rollups');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.month);

  rows.sort((a, b) => String(b.month).localeCompare(String(a.month)));

  const total = rows.length;
  const limit = Math.min(120, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    rollups: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Cleanup old trust snapshots after retention cutoff.
 */
export async function cleanupOldTrustSnapshots(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled', cleaned: 0 };

  const retentionDays = options.retentionDays || config.TRUST_RETENTION?.snapshotRetentionDays || 90;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const root = snapshotRoot();
  let months = [];

  try {
    const entries = await readdir(root, { withFileTypes: true });
    months = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map(e => e.name);
  } catch (_) {
    return { cleaned: 0, scanned: 0 };
  }

  let scanned = 0;
  let cleaned = 0;
  let failed = 0;

  for (const month of months) {
    const dir = join(root, month);
    const files = await readdir(dir).catch(() => []);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.startsWith('tsv2_') || !file.endsWith('.json') || file.endsWith('.tmp')) continue;

      scanned++;

      const filePath = join(dir, file);
      const snapshot = await readJSON(filePath).catch(() => null);
      const basisMs = snapshot ? new Date(snapshot.createdAt || snapshot.snapshotDate || 0).getTime() : 0;

      if (basisMs > 0 && basisMs < cutoffMs) {
        try {
          await rm(filePath, { force: true });
          cleaned++;
        } catch (_) {
          failed++;
        }
      }

      if (scanned % 100 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  return { scanned, cleaned, failed, retentionDays };
}

/**
 * Cleanup old calibration reports after retention cutoff.
 */
export async function cleanupOldCalibrationReports(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled', cleaned: 0 };

  const retentionDays = options.retentionDays || config.TRUST_RETENTION?.calibrationReportRetentionDays || 180;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const reports = await listJSON(getCollectionPath('trust_calibration')).catch(() => []);

  let scanned = 0;
  let cleaned = 0;
  let failed = 0;

  for (const report of reports) {
    if (!report || !report.id || !report.id.startsWith('tcal_')) continue;

    scanned++;
    const basisMs = new Date(report.generatedAt || report.createdAt || 0).getTime();

    if (basisMs > 0 && basisMs < cutoffMs) {
      try {
        await deleteJSON(reportPath(report.id));
        cleaned++;
      } catch (_) {
        failed++;
      }
    }

    if (scanned % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return { scanned, cleaned, failed, retentionDays };
}

export async function getTrustRetentionStats() {
  if (!isEnabled()) return { enabled: false };

  const rollups = await listTrustSnapshotRollups({ limit: 1 });

  let snapshotMonths = 0;
  try {
    const entries = await readdir(snapshotRoot(), { withFileTypes: true });
    snapshotMonths = entries.filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name)).length;
  } catch (_) {}

  let reportCount = 0;
  try {
    const reports = await listJSON(getCollectionPath('trust_calibration'));
    reportCount = reports.filter(r => r && r.id && r.id.startsWith('tcal_')).length;
  } catch (_) {}

  return {
    enabled: true,
    snapshotMonths,
    reportCount,
    rollupCount: rollups.total || 0,
    latestRollup: rollups.rollups?.[0] || null,
    snapshotRetentionDays: config.TRUST_RETENTION?.snapshotRetentionDays || 90,
    calibrationReportRetentionDays: config.TRUST_RETENTION?.calibrationReportRetentionDays || 180,
    generatedAt: nowIso(),
  };
}

export async function runTrustRetention(options = {}) {
  const rollup = await createTrustSnapshotRollup(options);
  const snapshots = await cleanupOldTrustSnapshots(options);
  const reports = await cleanupOldCalibrationReports(options);

  return {
    ok: true,
    rollup,
    snapshots,
    reports,
    completedAt: nowIso(),
  };
}

export const _testHelpers = {
  isEnabled,
  monthKey,
  rollupPath,
  emptyRollup,
  addSnapshotToRollup,
};
