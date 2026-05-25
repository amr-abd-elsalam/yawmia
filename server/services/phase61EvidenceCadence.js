// ═══════════════════════════════════════════════════════════════
// server/services/phase61EvidenceCadence.js — Phase 61 Evidence Cadence
// ═══════════════════════════════════════════════════════════════
// Reads persisted evidence artifacts only.
// No heavy scans.
// No external connections.
// No source data mutation.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';

function isEnabled() {
  return !!(config.PHASE61_EVIDENCE_CADENCE && config.PHASE61_EVIDENCE_CADENCE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'p61ev_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function snapshotPath(id) {
  return getRecordPath('phase61_evidence', id);
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function ageDays(iso) {
  const ms = parseMs(iso);
  if (!ms) return null;
  return Math.round(((Date.now() - ms) / 86400000) * 10) / 10;
}

async function latestFromCollection(collection, predicate = null) {
  try {
    const rows = await listJSON(getCollectionPath(collection), { tolerateCorrupt: true });
    const filtered = rows.filter(r => {
      if (!r || typeof r !== 'object') return false;
      if (predicate && !predicate(r)) return false;
      return !!(r.timestamp || r.generatedAt || r.createdAt || r.completedAt || r.startedAt);
    });

    filtered.sort((a, b) => {
      const aTs = parseMs(a.timestamp || a.generatedAt || a.completedAt || a.startedAt || a.createdAt);
      const bTs = parseMs(b.timestamp || b.generatedAt || b.completedAt || b.startedAt || b.createdAt);
      return bTs - aTs;
    });

    return filtered[0] || null;
  } catch (_) {
    return null;
  }
}

function compactArtifact(row, kind) {
  if (!row) return null;
  const ts = row.timestamp || row.generatedAt || row.completedAt || row.startedAt || row.createdAt || null;

  const evidenceUsable = row.evidenceUsable !== undefined
    ? !!row.evidenceUsable
    : (row.summary && row.summary.evidenceUsable !== undefined ? !!row.summary.evidenceUsable : undefined);

  const corruptionSuspected = row.corruptionSuspected !== undefined
    ? !!row.corruptionSuspected
    : !!(row.summary && row.summary.corruptionSuspected);

  let status = row.status || (row.ok === true ? 'passed' : row.ok === false ? 'failed' : 'unknown');

  // Phase 61.1:
  // A benchmark with corruption/errors must not be treated as valid pilot/externalization evidence.
  if (kind === 'benchmark' && evidenceUsable === false) {
    status = 'failed';
  }

  return {
    kind,
    id: row.id || null,
    status,
    timestamp: ts,
    ageDays: ageDays(ts),
    ok: row.ok !== undefined ? !!row.ok : undefined,
    evidenceUsable,
    corruptionSuspected,
    evidenceNotes: Array.isArray(row.evidenceNotes) ? row.evidenceNotes.slice(0, 5) : [],
    warningCount: Array.isArray(row.warnings) ? row.warnings.length : (row.summary?.warningCount || 0),
    criticalCount: Array.isArray(row.criticals) ? row.criticals.length : (row.summary?.criticalCount || 0),
    errorCount: Array.isArray(row.errors) ? row.errors.length : (row.summary?.errorCount || 0),
  };
}

function expectedFreshDaysFor(kind) {
  const c = config.PHASE61_EVIDENCE_CADENCE || {};
  if (kind === 'storagePressure') return c.storagePressureCadenceDays || 7;
  if (kind === 'benchmark') return c.benchmarkCadenceDays || 7;
  if (kind === 'scaleThresholds') return c.scaleThresholdCadenceDays || 7;
  if (kind === 'externalizationDecision') return c.externalizationDecisionCadenceDays || 7;
  if (kind === 'migrationRehearsal') return c.migrationRehearsalCadenceDays || 30;
  if (kind === 'rollbackRehearsal') return c.rollbackRehearsalCadenceDays || 30;
  if (kind === 'weeklyOpsReview') return 7;
  if (kind === 'restoreDrill') return config.PHASE61_PILOT_GATE?.restoreDrillMaxAgeDays || 7;
  return 7;
}

/**
 * Evaluate evidence freshness without performing scans.
 */
export function evaluateEvidenceFreshness(evidence, options = {}) {
  const cfg = config.PHASE61_EVIDENCE_CADENCE || {};
  const warnDays = Number(options.warningDays || cfg.staleEvidenceWarningDays || 14);
  const criticalDays = Number(options.criticalDays || cfg.staleEvidenceCriticalDays || 30);

  const warnings = [];
  const blockers = [];
  const latest = evidence || {};

  for (const [kind, artifact] of Object.entries(latest)) {
    if (!artifact) {
      warnings.push({
        code: `${kind}_missing`,
        level: kind === 'rollbackRehearsal' ? 'warning' : 'warning',
        message: `${kind} evidence is missing`,
        recommendation: recommendationForKind(kind),
      });
      continue;
    }

    const aDays = artifact.ageDays;
    if (aDays === null) {
      warnings.push({
        code: `${kind}_timestamp_missing`,
        level: 'warning',
        message: `${kind} timestamp is missing`,
      });
      continue;
    }

    const freshDays = expectedFreshDaysFor(kind);

    if (aDays > criticalDays) {
      blockers.push({
        code: `${kind}_critical_stale`,
        level: 'critical',
        message: `${kind} evidence is critically stale (${aDays} days old)`,
        recommendation: recommendationForKind(kind),
      });
    } else if (aDays > warnDays || aDays > freshDays * 2) {
      warnings.push({
        code: `${kind}_stale`,
        level: 'warning',
        message: `${kind} evidence is stale (${aDays} days old)`,
        recommendation: recommendationForKind(kind),
      });
    }

    if (artifact.status === 'failed' || artifact.status === 'critical') {
      blockers.push({
        code: `${kind}_failed_or_critical`,
        level: 'critical',
        message: `${kind} latest artifact is ${artifact.status}`,
        recommendation: recommendationForKind(kind),
      });
    }

    if (kind === 'benchmark' && artifact.evidenceUsable === false) {
      blockers.push({
        code: 'benchmark_not_usable_as_evidence',
        level: 'critical',
        message: artifact.corruptionSuspected
          ? 'Latest benchmark is not usable as evidence because JSON corruption is suspected'
          : 'Latest benchmark is not usable as externalization evidence',
        recommendation: 'node scripts/verify-data-json.js --strict && node scripts/benchmark-file-paths.js --json --persist',
      });
    }
  }

  let status = 'fresh';
  if (Object.values(latest).every(v => !v)) status = 'missing';
  else if (blockers.length > 0) status = 'critical';
  else if (warnings.length > 0) status = 'stale';

  return { status, warnings, blockers };
}

function recommendationForKind(kind) {
  const map = {
    storagePressure: 'node scripts/measure-storage-pressure.js --json --persist',
    benchmark: 'node scripts/benchmark-file-paths.js --json --persist',
    scaleThresholds: 'node scripts/verify-scale-thresholds.js --json',
    externalizationDecision: 'node scripts/capture-externalization-decision.js --persist',
    migrationRehearsal: 'node scripts/run-migration-rehearsal.js --snapshot=./migration-snapshots/test --dry-run --json',
    rollbackRehearsal: 'node scripts/run-rollback-rehearsal.js --dry-run --json',
    weeklyOpsReview: 'node scripts/ops-weekly-review.js --persist',
    restoreDrill: 'node scripts/run-backup-restore-drill.js',
  };
  return map[kind] || null;
}

export function buildEvidenceCadenceRecommendations(status) {
  const recommendations = [];

  for (const w of status.warnings || []) {
    recommendations.push({
      id: w.code,
      label: labelFromCode(w.code),
      severity: w.level || 'warning',
      command: w.recommendation || null,
      adminRoute: '/api/admin/phase61/evidence',
      reason: w.message,
    });
  }

  for (const b of status.blockers || []) {
    recommendations.push({
      id: b.code,
      label: labelFromCode(b.code),
      severity: 'critical',
      command: b.recommendation || null,
      adminRoute: '/api/admin/phase61/evidence',
      reason: b.message,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'phase61_evidence_cadence_ok',
      label: 'الأدلة محدثة',
      severity: 'info',
      command: null,
      adminRoute: '/api/admin/phase61/evidence',
      reason: 'Evidence cadence artifacts are fresh enough for monitoring.',
    });
  }

  return recommendations;
}

function labelFromCode(code) {
  if (!code) return 'راجع Evidence Cadence';
  if (code.includes('storagePressure')) return 'شغّل قياس ضغط التخزين';
  if (code.includes('benchmark_not_usable')) return 'أصلح سلامة البيانات ثم أعد Benchmark';
  if (code.includes('benchmark')) return 'شغّل Benchmark محفوظ';
  if (code.includes('scaleThresholds')) return 'تحقق من حدود التوسع';
  if (code.includes('externalizationDecision')) return 'احفظ قرار externalization';
  if (code.includes('migrationRehearsal')) return 'شغّل تدريب الهجرة';
  if (code.includes('rollbackRehearsal')) return 'شغّل تدريب الرجوع';
  if (code.includes('weeklyOpsReview')) return 'سجّل مراجعة التشغيل الأسبوعية';
  if (code.includes('restoreDrill')) return 'شغّل Restore Drill';
  return 'راجع Evidence Cadence';
}

export async function getEvidenceCadenceStatus(options = {}) {
  if (!isEnabled()) {
    return {
      enabled: false,
      phase: 61,
      status: 'disabled',
      latest: {},
      warnings: [],
      blockers: [],
      recommendations: [],
    };
  }

  const [
    storagePressure,
    scaleThresholds,
    benchmark,
    externalizationDecision,
    migrationRehearsal,
    rollbackRehearsal,
    weeklyOpsReview,
    restoreDrill,
  ] = await Promise.all([
    latestFromCollection('storage_pressure'),
    latestFromCollection('scale_thresholds'),
    latestFromCollection('benchmark_history'),
    latestFromCollection('externalization_decisions'),
    latestFromCollection('migration_rehearsals'),
    latestFromCollection('rollback_rehearsals'),
    latestFromCollection('ops_reviews', r => r.type === 'weekly_ops_review'),
    latestFromCollection('backup_restore_drills'),
  ]);

  const latest = {
    storagePressure: compactArtifact(storagePressure, 'storagePressure'),
    scaleThresholds: compactArtifact(scaleThresholds, 'scaleThresholds'),
    benchmark: compactArtifact(benchmark, 'benchmark'),
    externalizationDecision: compactArtifact(externalizationDecision, 'externalizationDecision'),
    migrationRehearsal: compactArtifact(migrationRehearsal, 'migrationRehearsal'),
    rollbackRehearsal: compactArtifact(rollbackRehearsal, 'rollbackRehearsal'),
    weeklyOpsReview: compactArtifact(weeklyOpsReview, 'weeklyOpsReview'),
    restoreDrill: compactArtifact(restoreDrill, 'restoreDrill'),
  };

  const freshness = evaluateEvidenceFreshness(latest, options);
  const report = {
    enabled: true,
    phase: 61,
    advisoryOnly: true,
    status: freshness.status,
    generatedAt: nowIso(),
    latest,
    warnings: freshness.warnings,
    blockers: freshness.blockers,
    recommendations: [],
  };

  report.recommendations = buildEvidenceCadenceRecommendations(report);
  return report;
}

export async function captureEvidenceCadenceSnapshot(options = {}) {
  const report = await getEvidenceCadenceStatus(options);
  if (!isEnabled()) return { ok: false, disabled: true, report };

  const id = options.id || generateId();
  const record = {
    id,
    kind: 'phase61_evidence_cadence',
    version: '0.57.0',
    ...report,
    createdAt: nowIso(),
  };

  await atomicWrite(snapshotPath(id), record);
  return { ok: true, evidence: record };
}

export async function listEvidenceCadenceSnapshots(options = {}) {
  if (!isEnabled()) return { snapshots: [], total: 0, limit: 20, offset: 0 };

  const rows = await listJSON(getCollectionPath('phase61_evidence')).catch(() => []);
  let snapshots = rows.filter(r => r && r.id && r.id.startsWith('p61ev_'));

  snapshots.sort((a, b) => {
    return parseMs(b.createdAt || b.generatedAt) - parseMs(a.createdAt || a.generatedAt);
  });

  const total = snapshots.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    snapshots: snapshots.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function cleanupOldEvidenceCadenceSnapshots() {
  if (!isEnabled()) return 0;

  const retentionDays = 90;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = await listEvidenceCadenceSnapshots({ limit: 100000, offset: 0 });

  let cleaned = 0;
  for (const row of result.snapshots) {
    const ts = parseMs(row.createdAt || row.generatedAt);
    if (ts > 0 && ts < cutoffMs) {
      await deleteJSON(snapshotPath(row.id)).catch(() => {});
      cleaned++;
    }
  }

  return cleaned;
}

export const _testHelpers = {
  ageDays,
  compactArtifact,
  expectedFreshDaysFor,
  recommendationForKind,
  snapshotPath,
};
