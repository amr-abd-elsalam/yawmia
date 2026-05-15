// ═══════════════════════════════════════════════════════════════
// server/services/predictiveSignalRetention.js — Predictive Signal Hygiene (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Archives old resolved predictive signals and computes precision stats.
//
// Resolved statuses:
//   - dismissed
//   - escalated
//   - false_positive
//   - confirmed
//
// Active signals are never archived.
// Archive path:
//   data/metrics/predictive-signal-archives/{YYYY-MM}.json
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

const RESOLVED_STATUSES = new Set([
  'dismissed',
  'escalated',
  'false_positive',
  'confirmed',
]);

let lastRetentionStats = null;

function isEnabled() {
  return !!(config.PREDICTIVE_SIGNAL_RETENTION && config.PREDICTIVE_SIGNAL_RETENTION.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function monthKey(iso = nowIso()) {
  return String(iso).slice(0, 7);
}

function signalPath(signalId) {
  return getRecordPath('predictive_signals', signalId);
}

function archivePath(month) {
  return getRecordPath('predictive_signal_archives', month);
}

function isResolved(signal) {
  return !!(signal && RESOLVED_STATUSES.has(signal.status));
}

function retentionBasis(signal) {
  return signal.outcomeAt ||
    signal.reviewedAt ||
    signal.updatedAt ||
    signal.createdAt ||
    null;
}

async function listAllSignalsRaw() {
  try {
    const dir = getCollectionPath('predictive_signals');
    const all = await listJSON(dir);
    return all.filter(s => s && s.id && s.id.startsWith('sig_'));
  } catch (err) {
    logger.warn('predictiveSignalRetention: listAllSignalsRaw failed', { error: err.message });
    return [];
  }
}

/**
 * Archive one resolved signal into month archive file.
 *
 * @param {object} signal
 */
export async function archiveSignal(signal) {
  if (!signal || !signal.id) {
    return { ok: false, error: 'INVALID_SIGNAL' };
  }

  if (!isResolved(signal)) {
    return { ok: false, error: 'SIGNAL_NOT_RESOLVED' };
  }

  const basis = retentionBasis(signal) || nowIso();
  const month = monthKey(basis);
  const filePath = archivePath(month);

  return withLock(`predictive-signal-archive:${month}`, async () => {
    const archive = (await readJSON(filePath)) || {
      month,
      kind: 'predictive_signals',
      archivedAt: nowIso(),
      entries: {},
    };

    if (!archive.entries) archive.entries = {};

    archive.entries[signal.id] = {
      ...signal,
      archivedAt: nowIso(),
    };
    archive.updatedAt = nowIso();

    await atomicWrite(filePath, archive);

    eventBus.emit('predictive_signal:archived', {
      signalId: signal.id,
      status: signal.status,
      month,
      timestamp: archive.updatedAt,
    });

    return { ok: true, month, signalId: signal.id };
  });
}

/**
 * Run retention cleanup.
 *
 * @param {{ force?: boolean, reason?: string }} options
 */
export async function runPredictiveSignalRetention(options = {}) {
  if (!isEnabled()) {
    return { ok: false, disabled: true, code: 'PREDICTIVE_SIGNAL_RETENTION_DISABLED' };
  }

  const started = Date.now();
  const retentionDays = config.PREDICTIVE_SIGNAL_RETENTION.resolvedRetentionDays || 90;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const batchSize = config.PREDICTIVE_SIGNAL_RETENTION.batchSize || 100;

  const signals = await listAllSignalsRaw();

  let scanned = 0;
  let archived = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    scanned++;

    try {
      if (!isResolved(signal)) {
        skipped++;
        continue;
      }

      const basis = retentionBasis(signal);
      if (!basis) {
        skipped++;
        continue;
      }

      const basisMs = new Date(basis).getTime();
      if (!options.force && basisMs > cutoffMs) {
        skipped++;
        continue;
      }

      const archiveResult = await archiveSignal(signal);
      if (!archiveResult.ok) {
        skipped++;
        continue;
      }

      await deleteJSON(signalPath(signal.id)).catch(() => {});
      archived++;
    } catch (err) {
      failed++;
      failures.push({ signalId: signal.id, error: err.message });
    }

    if ((i + 1) % batchSize === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  const result = {
    ok: true,
    scanned,
    archived,
    skipped,
    failed,
    failures: failures.slice(0, 20),
    retentionDays,
    durationMs: Date.now() - started,
    completedAt: nowIso(),
    reason: options.reason || null,
  };

  lastRetentionStats = result;

  eventBus.emit('predictive_signal:retention_completed', {
    scanned,
    archived,
    skipped,
    failed,
    timestamp: result.completedAt,
  });

  return result;
}

/**
 * Return last retention stats.
 */
export async function getRetentionStats() {
  return {
    enabled: isEnabled(),
    lastRun: lastRetentionStats,
  };
}

/**
 * Compute precision and lifecycle quality stats.
 *
 * @param {{ from?: string, to?: string }} options
 */
export async function getPredictivePrecisionStats(options = {}) {
  const signals = await listAllSignalsRaw();

  const filtered = signals.filter(s => {
    const basis = s.outcomeAt || s.reviewedAt || s.updatedAt || s.createdAt;
    if (!basis) return true;
    if (options.from && basis < options.from) return false;
    if (options.to && basis > options.to) return false;
    return true;
  });

  const byStatus = {
    active: 0,
    dismissed: 0,
    escalated: 0,
    false_positive: 0,
    confirmed: 0,
    archived: 0,
  };

  const byRiskType = {};
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const s of filtered) {
    if (byStatus[s.status] !== undefined) byStatus[s.status]++;
    else byStatus[s.status] = (byStatus[s.status] || 0) + 1;

    if (s.riskType) byRiskType[s.riskType] = (byRiskType[s.riskType] || 0) + 1;
    if (bySeverity[s.severity] !== undefined) bySeverity[s.severity]++;
  }

  const resolved = byStatus.dismissed + byStatus.escalated + byStatus.false_positive + byStatus.confirmed;
  const qualityLabeled = byStatus.false_positive + byStatus.confirmed;
  const precisionRate = qualityLabeled > 0
    ? Math.round((byStatus.confirmed / qualityLabeled) * 100)
    : 0;

  const confirmationRate = resolved > 0
    ? Math.round((byStatus.confirmed / resolved) * 100)
    : 0;

  const falsePositiveRate = qualityLabeled > 0
    ? Math.round((byStatus.false_positive / qualityLabeled) * 100)
    : 0;

  return {
    enabled: isEnabled(),
    total: filtered.length,
    resolved,
    qualityLabeled,
    byStatus,
    byRiskType,
    bySeverity,
    precisionRate,
    confirmationRate,
    falsePositiveRate,
    generatedAt: nowIso(),
  };
}

export const _testHelpers = {
  RESOLVED_STATUSES,
  isEnabled,
  monthKey,
  signalPath,
  archivePath,
  isResolved,
  retentionBasis,
  listAllSignalsRaw,
  setLastRetentionStats: (stats) => { lastRetentionStats = stats; },
};
