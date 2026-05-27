// ═══════════════════════════════════════════════════════════════
// server/services/rollbackRehearsal.js — Phase 61 Rollback Rehearsal
// ═══════════════════════════════════════════════════════════════
// Non-destructive rollback readiness report.
// Does not restore production.
// Does not mutate source data.
// Does not connect to external DB/search/queue.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
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

function isEnabled() {
  return !!(config.PHASE61_ROLLBACK_REHEARSAL && config.PHASE61_ROLLBACK_REHEARSAL.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'rbr_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function rehearsalPath(id) {
  return getRecordPath('rollback_rehearsals', id);
}

async function pathExists(path) {
  if (!path) return false;
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function findLatestBackupPath() {
  const targetDir = config.BACKUP?.targetDir || './backups';

  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith('yawmia-backup-'))
      .map(e => e.name)
      .sort()
      .reverse();

    if (dirs.length === 0) return null;
    return join(targetDir, dirs[0]);
  } catch (_) {
    return null;
  }
}

async function findLatestMigrationSnapshotPath() {
  const base = config.EXTERNALIZATION_READINESS?.migrationSnapshotBasePath || './migration-snapshots';

  try {
    const entries = await readdir(base, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.includes('rehearsal'))
      .map(e => e.name)
      .sort()
      .reverse();

    if (dirs.length === 0) return null;
    return join(base, dirs[0]);
  } catch (_) {
    return null;
  }
}

function defaultIndexRepairPlan() {
  return [
    { command: 'node scripts/repair-indexes.js', required: true },
    { command: 'node scripts/rebuild-audit-index.js', required: true },
    { command: 'node scripts/rebuild-workroom-search.js', required: true },
    { command: 'node scripts/rebuild-predictive-archive-index.js', required: false },
  ];
}

function defaultQueueVerifyPlan() {
  return [
    { command: 'node scripts/verify-queue.js --strict --json', required: true },
    { command: 'node scripts/repair-queue.js --dry-run --json', required: true },
    { command: 'node scripts/queue-retry-dlq.js --dry-run', required: false },
  ];
}

function defaultSmokePlan() {
  return [
    { command: 'node scripts/postdeploy-smoke.js --json --admin-timeout-ms=3500', required: true },
    { command: 'node scripts/verify-production-readiness.js --json', required: true },
    { command: 'node scripts/verify-data-json.js --strict --json', required: true },
  ];
}

function defaultIncidentPlan() {
  return [
    'Open incident if rollback causes user-visible impact.',
    'Assign incident runbookKey.',
    'Resolve only after smoke and readiness pass.',
    'Create postmortem for critical incidents.',
    'Track action items until closed.',
  ];
}

export function evaluateRollbackReadiness(inputs = {}, options = {}) {
  const cfg = config.PHASE61_ROLLBACK_REHEARSAL || {};
  const blockers = [];
  const warnings = [];

  const backupReference = inputs.backupReference || null;
  const restoreDrill = inputs.restoreDrill || null;
  const snapshotReference = inputs.snapshotReference || null;

  if (cfg.requireBackupReference !== false && !backupReference) {
    blockers.push({
      code: 'BACKUP_REFERENCE_MISSING',
      message: 'Rollback rehearsal requires a backup reference.',
      recommendation: 'node scripts/backup.js',
    });
  }

  if (cfg.requireRestoreDrillReference !== false) {
    if (!restoreDrill || !restoreDrill.latest) {
      blockers.push({
        code: 'RESTORE_DRILL_MISSING',
        message: 'No restore drill reference exists.',
        recommendation: 'node scripts/run-backup-restore-drill.js',
      });
    } else if (!restoreDrill.passed) {
      blockers.push({
        code: 'RESTORE_DRILL_FAILED',
        message: 'Latest restore drill did not pass.',
        recommendation: 'node scripts/run-backup-restore-drill.js',
      });
    } else if (!restoreDrill.fresh) {
      blockers.push({
        code: 'RESTORE_DRILL_STALE',
        message: `Latest restore drill is stale (${restoreDrill.ageDays} days old).`,
        recommendation: 'node scripts/run-backup-restore-drill.js',
      });
    }
  }

  if (!snapshotReference) {
    warnings.push({
      code: 'SNAPSHOT_REFERENCE_MISSING',
      message: 'No migration snapshot reference was provided.',
      recommendation: 'node scripts/export-migration-snapshot.js --dry-run',
    });
  }

  if (!Array.isArray(inputs.indexRepairPlan) || inputs.indexRepairPlan.length === 0) {
    blockers.push({
      code: 'INDEX_REPAIR_PLAN_MISSING',
      message: 'Index repair plan is missing.',
    });
  }

  if (!Array.isArray(inputs.queueVerifyPlan) || inputs.queueVerifyPlan.length === 0) {
    blockers.push({
      code: 'QUEUE_VERIFY_PLAN_MISSING',
      message: 'Queue verification plan is missing.',
    });
  }

  if (!Array.isArray(inputs.smokePlan) || inputs.smokePlan.length === 0) {
    blockers.push({
      code: 'SMOKE_PLAN_MISSING',
      message: 'Postdeploy smoke plan is missing.',
    });
  }

  const status = blockers.length > 0
    ? 'failed'
    : warnings.length > 0
      ? 'warning'
      : 'passed';

  return {
    ok: blockers.length === 0,
    status,
    blockers,
    warnings,
  };
}

export async function runRollbackRehearsal(options = {}) {
  if (!isEnabled()) {
    return { ok: false, disabled: true, code: 'ROLLBACK_REHEARSAL_DISABLED' };
  }

  const started = Date.now();

  const backupReference = options.backupReference || await findLatestBackupPath();
  const backupExists = await pathExists(backupReference);

  let restoreDrillFreshness = null;
  try {
    const { getLatestRestoreDrillFreshness } = await import('./backupRestoreDrill.js');
    restoreDrillFreshness = await getLatestRestoreDrillFreshness({
      thresholdDays: config.PHASE61_PILOT_GATE?.restoreDrillMaxAgeDays || 7,
    });
  } catch (err) {
    restoreDrillFreshness = {
      enabled: true,
      latest: null,
      fresh: false,
      passed: false,
      status: 'unknown',
      error: err.message,
    };
  }

  const snapshotReference = options.snapshotReference || await findLatestMigrationSnapshotPath();

  const inputs = {
    backupReference: backupExists ? backupReference : null,
    restoreDrill: restoreDrillFreshness,
    snapshotReference,
    indexRepairPlan: defaultIndexRepairPlan(),
    queueVerifyPlan: defaultQueueVerifyPlan(),
    smokePlan: defaultSmokePlan(),
  };

  const readiness = evaluateRollbackReadiness(inputs, options);

  const report = {
    id: options.id || generateId(),
    kind: 'rollback_rehearsal',
    version: '0.57.0',
    phase: 61,
    ok: readiness.ok,
    status: readiness.status,
    dryRun: !!options.dryRun,
    confirm: !!options.confirm,
    sourceDataMutated: false,
    externalDbConnected: false,
    externalSearchConnected: false,
    externalQueueConnected: false,
    backupReference: inputs.backupReference,
    backupExists,
    restoreDrillReference: restoreDrillFreshness && restoreDrillFreshness.latest ? {
      id: restoreDrillFreshness.latest.id,
      status: restoreDrillFreshness.latest.status,
      completedAt: restoreDrillFreshness.latest.completedAt || null,
      ageDays: restoreDrillFreshness.ageDays,
      fresh: restoreDrillFreshness.fresh,
      passed: restoreDrillFreshness.passed,
    } : null,
    snapshotReference,
    indexRepairPlan: inputs.indexRepairPlan,
    queueVerifyPlan: inputs.queueVerifyPlan,
    smokePlan: inputs.smokePlan,
    incidentPlan: defaultIncidentPlan(),
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    generatedAt: nowIso(),
    durationMs: Date.now() - started,
    createdAt: nowIso(),
  };

  if (options.persist || options.confirm) {
    await atomicWrite(rehearsalPath(report.id), report);
  }

  return { ok: report.ok, rehearsal: report };
}

export async function getRollbackRehearsal(id) {
  if (!id || typeof id !== 'string') return null;
  return await readJSON(rehearsalPath(id));
}

export async function listRollbackRehearsals(options = {}) {
  if (!isEnabled()) return { rehearsals: [], total: 0, limit: 20, offset: 0 };

  const rows = await listJSON(getCollectionPath('rollback_rehearsals')).catch(() => []);
  let rehearsals = rows.filter(r => r && r.id && r.id.startsWith('rbr_'));

  if (options.status) rehearsals = rehearsals.filter(r => r.status === options.status);

  rehearsals.sort((a, b) => new Date(b.createdAt || b.generatedAt) - new Date(a.createdAt || a.generatedAt));

  const total = rehearsals.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    rehearsals: rehearsals.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function getLatestRollbackRehearsal(options = {}) {
  const result = await listRollbackRehearsals({ ...options, limit: 1, offset: 0 });
  return result.rehearsals && result.rehearsals[0] ? result.rehearsals[0] : null;
}

export async function cleanupOldRollbackRehearsals() {
  if (!isEnabled()) return 0;

  const retention = config.PHASE61_ROLLBACK_REHEARSAL?.retentionCount || 10;
  const result = await listRollbackRehearsals({ limit: 1000, offset: 0 });

  const toDelete = (result.rehearsals || []).slice(retention);
  let cleaned = 0;

  for (const row of toDelete) {
    await deleteJSON(rehearsalPath(row.id)).catch(() => {});
    cleaned++;
  }

  return cleaned;
}

export const _testHelpers = {
  generateId,
  rehearsalPath,
  findLatestBackupPath,
  findLatestMigrationSnapshotPath,
  defaultIndexRepairPlan,
  defaultQueueVerifyPlan,
  defaultSmokePlan,
};
