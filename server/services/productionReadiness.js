// ═══════════════════════════════════════════════════════════════
// server/services/productionReadiness.js — Production Readiness Checks (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Admin/system readiness assessment. Never exposes secret values.
// ═══════════════════════════════════════════════════════════════

import { access, constants, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import { readJSON, getCollectionPath } from './database.js';
import { getInstanceInfo } from './instanceMode.js';
import { getWorkerStats } from './queueWorkers.js';
import { getQueueStats } from './opsQueue.js';
import { getAlertDeliveryStats } from './alertDeliveryHistory.js';
import { getAuditIndexStats } from './auditLogIndex.js';
import { getPhase60ReadinessChecks } from './phase60Readiness.js';

function check(id, status, message, details = {}, recommendation = null) {
  const out = { id, status, message, details };
  if (recommendation) out.recommendation = recommendation;
  return out;
}

function safeBool(value) {
  return !!value;
}

async function pathWritable(path) {
  try {
    await access(path, constants.R_OK | constants.W_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function classifyStatus(checks) {
  if (checks.some(c => c.status === 'fail')) return 'not_ready';
  if (checks.some(c => c.status === 'warn')) return 'warnings';
  return 'ready';
}

export function classifyReadiness(checks) {
  const summary = { pass: 0, warn: 0, fail: 0 };

  for (const c of checks || []) {
    if (summary[c.status] !== undefined) summary[c.status]++;
  }

  return {
    ok: summary.fail === 0,
    status: classifyStatus(checks || []),
    summary,
  };
}

async function checkCriticalDirs() {
  const ids = [
    'users',
    'sessions',
    'jobs',
    'applications',
    'notifications',
    'audit',
    'ops_queue',
    'alert_deliveries',
    'exports',
    'ops_locks',
    'scheduler',
    'ops_rollups',
    'incidents',
    'backup_restore_drills',
  ];

  const missing = [];
  for (const id of ids) {
    try {
      const dir = getCollectionPath(id);
      const ok = await pathWritable(dir);
      if (!ok) missing.push(id);
    } catch (_) {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    return check('critical_dirs', 'fail', 'Some critical data directories are missing or not writable', { missing });
  }

  return check('critical_dirs', 'pass', 'Critical data directories are present and writable');
}

async function checkCriticalIndexes() {
  const basePath = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
  const required = [
    config.DATABASE.indexFiles.phoneIndex,
    config.DATABASE.indexFiles.jobsIndex,
    config.DATABASE.indexFiles.workerAppsIndex,
    config.DATABASE.indexFiles.jobAppsIndex,
  ];

  const missing = [];
  const corrupt = [];

  for (const rel of required) {
    const full = join(basePath, rel);
    try {
      const data = await readJSON(full);
      if (!data || typeof data !== 'object') missing.push(rel);
    } catch (_) {
      corrupt.push(rel);
    }
  }

  if (corrupt.length > 0) {
    return check('critical_indexes', 'fail', 'Some critical indexes are corrupt', { corrupt });
  }

  if (missing.length > 0) {
    return check('critical_indexes', 'warn', 'Some critical indexes are missing', { missing });
  }

  return check('critical_indexes', 'pass', 'Critical indexes exist and parse correctly');
}

async function checkScaleHygiene() {
  try {
    const { getScaleHygieneOverview } = await import('./scaleHygiene.js');
    const overview = await getScaleHygieneOverview();

    if (!overview.enabled) {
      return check('scale_hygiene', 'warn', 'Scale hygiene overview is disabled');
    }

    if (overview.status === 'critical') {
      return check('scale_hygiene', 'fail', 'Scale hygiene has critical warnings', {
        warningCount: overview.warningCount || 0,
      });
    }

    if (overview.status === 'warnings') {
      return check('scale_hygiene', 'warn', 'Scale hygiene has warnings', {
        warningCount: overview.warningCount || 0,
      });
    }

    return check('scale_hygiene', 'pass', 'Scale hygiene checks are healthy');
  } catch (err) {
    return check('scale_hygiene', 'warn', 'Could not evaluate scale hygiene', { error: err.message });
  }
}

async function checkScaleThresholdsConfigured(isProd) {
  const enabled = !!(config.SCALE_LIMITS && config.SCALE_LIMITS.enabled);
  const hasThresholds = !!(config.SCALE_LIMITS && config.SCALE_LIMITS.thresholds);

  if (!enabled || !hasThresholds) {
    return check(
      'scale_thresholds_configured',
      isProd ? 'fail' : 'warn',
      'Phase 59 scale thresholds are not configured',
      { enabled, hasThresholds },
      'Configure SCALE_LIMITS in config.js'
    );
  }

  return check('scale_thresholds_configured', 'pass', 'Phase 59 scale thresholds are configured', {
    mode: config.SCALE_LIMITS.mode || 'advisory',
  });
}

async function checkStoragePressureReadiness(isProd) {
  if (!config.STORAGE_PRESSURE || !config.STORAGE_PRESSURE.enabled) {
    return check(
      'storage_pressure_available',
      isProd ? 'fail' : 'warn',
      'Storage pressure monitoring is disabled',
      {},
      'Enable STORAGE_PRESSURE in config.js'
    );
  }

  try {
    const { getLatestStoragePressureSnapshot } = await import('./storagePressure.js');
    const latest = await getLatestStoragePressureSnapshot();

    if (!latest) {
      return check(
        'storage_pressure_available',
        'warn',
        'No storage pressure snapshot exists yet',
        {},
        'node scripts/measure-storage-pressure.js'
      );
    }

    const warningCount = Array.isArray(latest.warnings) ? latest.warnings.length : 0;
    const criticalCount = Array.isArray(latest.criticals) ? latest.criticals.length : 0;
    const ageHours = latest.timestamp
      ? Math.round(((Date.now() - new Date(latest.timestamp).getTime()) / 3600000) * 10) / 10
      : null;

    if (latest.status === 'critical' || criticalCount > 0) {
      return check(
        'storage_pressure_critical',
        isProd ? 'fail' : 'warn',
        'Latest storage pressure snapshot has critical findings',
        {
          snapshotId: latest.id,
          timestamp: latest.timestamp,
          ageHours,
          warningCount,
          criticalCount,
        },
        'node scripts/verify-scale-thresholds.js --strict'
      );
    }

    if (latest.status === 'warning' || warningCount > 0) {
      return check(
        'storage_pressure_available',
        'warn',
        'Latest storage pressure snapshot has warnings',
        {
          snapshotId: latest.id,
          timestamp: latest.timestamp,
          ageHours,
          warningCount,
          criticalCount,
        },
        'node scripts/measure-storage-pressure.js'
      );
    }

    return check('storage_pressure_available', 'pass', 'Latest storage pressure snapshot is healthy', {
      snapshotId: latest.id,
      timestamp: latest.timestamp,
      ageHours,
      warningCount,
      criticalCount,
    });
  } catch (err) {
    return check(
      'storage_pressure_available',
      'warn',
      'Could not evaluate storage pressure readiness',
      { error: err.message },
      'node scripts/measure-storage-pressure.js'
    );
  }
}

async function checkPhase61Docs(isProd) {
  const docs = [
    { id: 'phase61_evidence_cadence_doc_exists', path: './PHASE61_EVIDENCE_CADENCE.md', label: 'PHASE61_EVIDENCE_CADENCE.md' },
    { id: 'phase61_deep_migration_rehearsal_doc_exists', path: './PHASE61_DEEP_MIGRATION_REHEARSAL.md', label: 'PHASE61_DEEP_MIGRATION_REHEARSAL.md' },
    { id: 'phase61_rollback_rehearsal_doc_exists', path: './PHASE61_ROLLBACK_REHEARSAL_REPORT.md', label: 'PHASE61_ROLLBACK_REHEARSAL_REPORT.md' },
    { id: 'phase61_pilot_decision_doc_exists', path: './PHASE61_PILOT_CANDIDATE_DECISION.md', label: 'PHASE61_PILOT_CANDIDATE_DECISION.md' },
    { id: 'phase61_repository_contracts_doc_exists', path: './PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md', label: 'PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md' },
    { id: 'phase61_event_bridge_plan_doc_exists', path: './PHASE61_EVENT_BRIDGE_PILOT_PLAN.md', label: 'PHASE61_EVENT_BRIDGE_PILOT_PLAN.md' },
    { id: 'phase61_sse_fanout_plan_doc_exists', path: './PHASE61_SSE_FANOUT_PILOT_PLAN.md', label: 'PHASE61_SSE_FANOUT_PILOT_PLAN.md' },
  ];

  const checks = [];
  for (const d of docs) {
    const ok = await fileExists(d.path);
    checks.push(check(
      d.id,
      ok ? 'pass' : (isProd ? 'warn' : 'warn'),
      ok ? `${d.label} exists` : `${d.label} is missing`,
      { path: d.path },
      ok ? null : `Create ${d.label}`
    ));
  }

  return checks;
}

async function checkPhase61EvidenceCadence(isProd) {
  try {
    const { getEvidenceCadenceStatus } = await import('./phase61EvidenceCadence.js');
    const status = await getEvidenceCadenceStatus();

    if (!status.enabled) {
      return check(
        'phase61_evidence_cadence_available',
        isProd ? 'warn' : 'warn',
        'Phase 61 evidence cadence is disabled',
        status
      );
    }

    if (status.status === 'critical') {
      return check(
        'phase61_evidence_cadence_available',
        isProd ? 'warn' : 'warn',
        'Phase 61 evidence cadence has critical stale/missing blockers',
        {
          status: status.status,
          warningCount: status.warnings.length,
          blockerCount: status.blockers.length,
        },
        'node scripts/capture-phase61-evidence.js --persist'
      );
    }

    if (status.status === 'missing' || status.status === 'stale') {
      return check(
        'phase61_evidence_cadence_available',
        'warn',
        `Phase 61 evidence cadence is ${status.status}`,
        {
          status: status.status,
          warningCount: status.warnings.length,
          blockerCount: status.blockers.length,
        },
        'node scripts/capture-phase61-evidence.js --persist'
      );
    }

    return check('phase61_evidence_cadence_available', 'pass', 'Phase 61 evidence cadence is fresh', {
      status: status.status,
    });
  } catch (err) {
    return check(
      'phase61_evidence_cadence_available',
      'warn',
      'Could not evaluate Phase 61 evidence cadence',
      { error: err.message },
      'node scripts/capture-phase61-evidence.js --json'
    );
  }
}

async function checkPhase61PilotGate(isProd) {
  try {
    const { getPilotDecisionGate } = await import('./pilotDecisionGate.js');
    const gate = await getPilotDecisionGate();

    if (!gate.enabled) {
      return check(
        'phase61_pilot_gate_blocks_externalization',
        isProd ? 'warn' : 'warn',
        'Phase 61 pilot gate is disabled',
        gate
      );
    }

    if (gate.implementationAllowed) {
      return check(
        'phase61_pilot_gate_blocks_externalization',
        'fail',
        'Phase 61 pilot gate unexpectedly allows implementation',
        gate
      );
    }

    return check(
      'phase61_pilot_gate_blocks_externalization',
      'pass',
      gate.pilotAllowed
        ? 'Pilot gate has no blockers but implementation remains disabled by default'
        : 'Pilot gate blocks premature externalization',
      {
        pilotAllowed: gate.pilotAllowed,
        implementationAllowed: gate.implementationAllowed,
        blockerCount: gate.blockers.length,
        candidate: gate.candidate || null,
      }
    );
  } catch (err) {
    return check(
      'phase61_pilot_gate_blocks_externalization',
      'warn',
      'Could not evaluate Phase 61 pilot gate',
      { error: err.message },
      'node scripts/evaluate-pilot-gate.js --json'
    );
  }
}

async function checkRepositoryContracts(isProd) {
  try {
    const { getRepositoryContractReadiness } = await import('./repositoryContractReport.js');
    const report = await getRepositoryContractReadiness();

    if (report.status === 'critical') {
      return check(
        'repository_contract_docs_exist',
        isProd ? 'warn' : 'warn',
        'Repository contract readiness has blockers',
        {
          blockerCount: report.blockers.length,
          warningCount: report.warnings.length,
          runtimeSwitchEnabled: report.runtimeSwitchEnabled,
        },
        'node scripts/verify-repository-contracts.js --json'
      );
    }

    if (report.status === 'warning') {
      return check(
        'repository_contract_docs_exist',
        'warn',
        'Repository contract readiness has warnings',
        {
          warningCount: report.warnings.length,
          runtimeSwitchEnabled: report.runtimeSwitchEnabled,
        },
        'node scripts/verify-repository-contracts.js --json'
      );
    }

    return check('repository_contract_docs_exist', 'pass', 'Repository contracts are documented and runtime switch is disabled', {
      contractCount: report.matrix.length,
      runtimeSwitchEnabled: report.runtimeSwitchEnabled,
    });
  } catch (err) {
    return check(
      'repository_contract_docs_exist',
      'warn',
      'Could not evaluate repository contracts',
      { error: err.message },
      'node scripts/verify-repository-contracts.js --json'
    );
  }
}

async function checkRollbackRehearsalReadiness(isProd) {
  try {
    const { getLatestRollbackRehearsal } = await import('./rollbackRehearsal.js');
    const latest = await getLatestRollbackRehearsal();

    if (!latest) {
      return check(
        'latest_rollback_rehearsal_warning_if_missing',
        'warn',
        'No rollback rehearsal report exists yet',
        {},
        'node scripts/run-rollback-rehearsal.js --dry-run --json'
      );
    }

    if (latest.status === 'failed') {
      return check(
        'latest_rollback_rehearsal_warning_if_missing',
        isProd ? 'warn' : 'warn',
        'Latest rollback rehearsal failed',
        { id: latest.id, status: latest.status },
        'node scripts/run-rollback-rehearsal.js --dry-run --json'
      );
    }

    return check('latest_rollback_rehearsal_warning_if_missing', latest.status === 'passed' ? 'pass' : 'warn', 'Latest rollback rehearsal exists', {
      id: latest.id,
      status: latest.status,
      generatedAt: latest.generatedAt,
    });
  } catch (err) {
    return check(
      'latest_rollback_rehearsal_warning_if_missing',
      'warn',
      'Could not evaluate rollback rehearsal readiness',
      { error: err.message },
      'node scripts/run-rollback-rehearsal.js --dry-run --json'
    );
  }
}

async function checkPhase59Docs(isProd) {
  const docs = [
    { id: 'scale_limits_doc_exists', path: './SCALE_LIMITS.md', label: 'SCALE_LIMITS.md' },
    { id: 'externalization_readiness_doc_exists', path: './EXTERNALIZATION_READINESS.md', label: 'EXTERNALIZATION_READINESS.md' },
    { id: 'multi_instance_boundary_doc_exists', path: './MULTI_INSTANCE_BOUNDARY.md', label: 'MULTI_INSTANCE_BOUNDARY.md' },
    { id: 'data_migration_formats_doc_exists', path: './DATA_MIGRATION_FORMATS.md', label: 'DATA_MIGRATION_FORMATS.md' },
    { id: 'storage_pressure_runbook_exists', path: './STORAGE_PRESSURE_RUNBOOK.md', label: 'STORAGE_PRESSURE_RUNBOOK.md' },
  ];

  const checks = [];
  for (const d of docs) {
    const ok = await fileExists(d.path);
    checks.push(check(
      d.id,
      ok ? 'pass' : (isProd ? 'fail' : 'warn'),
      ok ? `${d.label} exists` : `${d.label} is missing`,
      { path: d.path },
      ok ? null : `Create ${d.label}`
    ));
  }

  return checks;
}

async function checkMultiInstanceBoundaryConfig(isProd) {
  const enabled = !!(config.MULTI_INSTANCE_BOUNDARY && config.MULTI_INSTANCE_BOUNDARY.enabled);

  if (!enabled) {
    return check(
      'multi_instance_boundary_configured',
      isProd ? 'fail' : 'warn',
      'MULTI_INSTANCE_BOUNDARY config is disabled',
      {},
      'Enable MULTI_INSTANCE_BOUNDARY in config.js'
    );
  }

  return check('multi_instance_boundary_configured', 'pass', 'Multi-instance boundary config is enabled', {
    requireSingleWriterForQueueAndSchedulers: !!config.MULTI_INSTANCE_BOUNDARY.requireSingleWriterForQueueAndSchedulers,
    eventBusBridgeRequiredForMultiInstance: !!config.MULTI_INSTANCE_BOUNDARY.eventBusBridgeRequiredForMultiInstance,
    sseFanoutRequiredForMultiInstance: !!config.MULTI_INSTANCE_BOUNDARY.sseFanoutRequiredForMultiInstance,
    externalQueueRequiredForMultiWriter: !!config.MULTI_INSTANCE_BOUNDARY.externalQueueRequiredForMultiWriter,
  });
}

async function checkExternalizationReadinessConfig(isProd) {
  const enabled = !!(config.EXTERNALIZATION_READINESS && config.EXTERNALIZATION_READINESS.enabled);
  const phase = config.EXTERNALIZATION_READINESS?.noExternalizationBeforePhase || 60;

  if (!enabled) {
    return check(
      'externalization_readiness_configured',
      isProd ? 'fail' : 'warn',
      'EXTERNALIZATION_READINESS config is disabled',
      {},
      'Enable EXTERNALIZATION_READINESS in config.js'
    );
  }

  return check('externalization_readiness_configured', 'pass', 'Externalization readiness config is advisory-only and enabled', {
    noExternalizationBeforePhase: phase,
    candidates: config.EXTERNALIZATION_READINESS?.candidates || [],
    implementationAllowedInPhase59: false,
  });
}

async function checkDomainConsistency() {
  try {
    const brandDomain = config.BRAND?.domain || '';
    const origins = config.SECURITY?.allowedOrigins || [];
    const originDomains = origins
      .filter(o => typeof o === 'string' && o !== '*')
      .map(o => {
        try { return new URL(o).hostname; } catch (_) { return ''; }
      })
      .filter(Boolean);

    const mismatches = originDomains.filter(d => brandDomain && d !== brandDomain);

    if (mismatches.length > 0) {
      return check('domain_consistency', 'warn', 'Brand domain differs from configured allowed origins', {
        brandDomain,
        originDomains,
        mismatches,
      });
    }

    return check('domain_consistency', 'pass', 'Domain configuration is consistent', {
      brandDomain,
      originDomains,
    });
  } catch (err) {
    return check('domain_consistency', 'warn', 'Could not evaluate domain consistency', { error: err.message });
  }
}

async function checkPwaCacheVersion() {
  try {
    const swRaw = await readFile('./frontend/sw.js', 'utf-8');
    const expected = config.PWA?.cacheName || '';
    const ok = expected && swRaw.includes(`CACHE_NAME = '${expected}'`);

    if (!ok) {
      return check('pwa_cache_version', 'warn', 'PWA cache version may not match config.PWA.cacheName', {
        expected,
      });
    }

    return check('pwa_cache_version', 'pass', 'PWA cache version matches config');
  } catch (_) {
    return check('pwa_cache_version', 'warn', 'Could not read frontend/sw.js');
  }
}

async function checkRestoreDrillFreshness(isProd) {
  try {
    const { getLatestRestoreDrillFreshness } = await import('./backupRestoreDrill.js');
    const freshness = await getLatestRestoreDrillFreshness();

    if (!freshness.enabled) {
      return check('restore_drill_recent', isProd ? 'warn' : 'pass', 'Backup restore drill feature is disabled', freshness);
    }

    if (!freshness.latest) {
      const status = isProd && config.DEPLOYMENT_DISCIPLINE?.requireRecentBackupRestoreDrillInProduction ? 'fail' : 'warn';
      return check(
        'restore_drill_recent',
        status,
        'No backup restore drill has been recorded',
        freshness,
        'node scripts/run-backup-restore-drill.js'
      );
    }

    if (!freshness.passed) {
      const status = isProd && config.DEPLOYMENT_DISCIPLINE?.requireRecentBackupRestoreDrillInProduction ? 'fail' : 'warn';
      return check(
        'restore_drill_recent',
        status,
        'Latest backup restore drill did not pass',
        freshness,
        'node scripts/run-backup-restore-drill.js'
      );
    }

    if (!freshness.fresh) {
      const status = isProd && config.DEPLOYMENT_DISCIPLINE?.requireRecentBackupRestoreDrillInProduction ? 'fail' : 'warn';
      return check(
        'restore_drill_recent',
        status,
        `Latest backup restore drill is stale (${freshness.ageDays} days old)`,
        freshness,
        'node scripts/run-backup-restore-drill.js'
      );
    }

    return check('restore_drill_recent', 'pass', 'Latest backup restore drill is recent and passing', freshness);
  } catch (err) {
    return check('restore_drill_recent', 'warn', 'Could not evaluate restore drill freshness', { error: err.message }, 'node scripts/run-backup-restore-drill.js');
  }
}

async function checkMarketplaceRollupFreshness(isProd) {
  try {
    const { getMarketplaceRollupFreshness } = await import('./marketplaceIntelligenceRollups.js');
    const freshness = await getMarketplaceRollupFreshness();

    if (!freshness.enabled) {
      return check('marketplace_rollup_fresh', 'pass', 'Marketplace intelligence is disabled', freshness);
    }

    if (freshness.stale) {
      const status = isProd && config.DEPLOYMENT_DISCIPLINE?.requireMarketplaceRollupFreshInProduction ? 'fail' : 'warn';
      return check(
        'marketplace_rollup_fresh',
        status,
        freshness.latestGeneratedAt ? 'Marketplace intelligence rollup is stale' : 'Marketplace intelligence rollup is missing',
        freshness,
        'node scripts/rollup-product-intelligence.js'
      );
    }

    return check('marketplace_rollup_fresh', 'pass', 'Marketplace intelligence rollup is fresh', freshness);
  } catch (err) {
    return check('marketplace_rollup_fresh', 'warn', 'Could not evaluate marketplace rollup freshness', { error: err.message }, 'node scripts/verify-marketplace-intelligence.js');
  }
}

async function checkSchedulerStaleness(isProd) {
  try {
    const { listStaleSchedulers } = await import('./schedulerRegistry.js');
    const stale = await listStaleSchedulers();

    if (stale.length > 0) {
      return check(
        'scheduler_no_stale',
        isProd ? 'warn' : 'warn',
        `${stale.length} scheduler job(s) are stale or failed`,
        { stale: stale.slice(0, 10) },
        'node scripts/scheduler-cadence-report.js'
      );
    }

    return check('scheduler_no_stale', 'pass', 'No stale scheduler jobs detected');
  } catch (err) {
    return check('scheduler_no_stale', 'warn', 'Could not evaluate scheduler staleness', { error: err.message }, 'node scripts/scheduler-cadence-report.js');
  }
}

async function checkQueueOperationalHealth(isProd) {
  try {
    const { getQueueStats } = await import('./opsQueue.js');
    const { readQueueSummary } = await import('./queueStorageIndex.js');

    const [stats, summary] = await Promise.all([
      getQueueStats(),
      readQueueSummary().catch(() => null),
    ]);

    if (!stats || stats.enabled === false) {
      return check(
        'queue_health',
        'warn',
        'Ops queue is disabled or unavailable',
        { stats },
        'Review OPS_QUEUE.enabled and node scripts/verify-queue.js'
      );
    }

    const byStatus = stats.byStatus || {};
    const deadLetter = byStatus['dead-letter'] || stats.deadLetter || 0;
    const failed = byStatus.failed || 0;
    const pending = byStatus.pending || 0;
    const summaryStale = !!(summary && summary.stale);

    if (summaryStale) {
      return check(
        'queue_health',
        isProd && config.DEPLOYMENT_DISCIPLINE?.requireQueueHealthyInProduction ? 'fail' : 'warn',
        'Queue summary is stale',
        { summary },
        'node scripts/repair-queue.js'
      );
    }

    if (deadLetter >= 5) {
      return check(
        'queue_health',
        isProd && config.DEPLOYMENT_DISCIPLINE?.requireQueueHealthyInProduction ? 'fail' : 'warn',
        'Queue has elevated dead-letter jobs',
        { deadLetter, failed, pending },
        'node scripts/queue-retry-dlq.js --dry-run'
      );
    }

    if (deadLetter > 0 || failed >= 5 || pending >= 5000) {
      return check(
        'queue_health',
        'warn',
        'Queue has operational warnings',
        { deadLetter, failed, pending },
        'node scripts/verify-queue.js'
      );
    }

    return check('queue_health', 'pass', 'Queue summary and status counts are acceptable', {
      deadLetter,
      failed,
      pending,
      summaryStale,
    });
  } catch (err) {
    return check(
      'queue_health',
      'warn',
      'Could not evaluate queue operational health',
      { error: err.message },
      'node scripts/verify-queue.js'
    );
  }
}

async function checkMaintenanceInactive(isProd) {
  try {
    const { getMaintenanceMode, isFeatureEnabled } = await import('./maintenanceMode.js');
    if (!isFeatureEnabled()) {
      return check('maintenance_not_active', 'pass', 'Maintenance mode feature is disabled');
    }

    const state = await getMaintenanceMode();
    if (state && state.enabled) {
      return check(
        'maintenance_not_active',
        isProd ? 'warn' : 'warn',
        'Maintenance mode is currently active',
        { enabledAt: state.enabledAt || null, message: state.message || null },
        'Review /api/admin/maintenance'
      );
    }

    return check('maintenance_not_active', 'pass', 'Maintenance mode is not active');
  } catch (err) {
    return check('maintenance_not_active', 'warn', 'Could not evaluate maintenance mode', { error: err.message });
  }
}

async function checkQueueNoStaleRunningGate(isProd) {
  return check(
    'queue_no_stale_running',
    isProd ? 'warn' : 'warn',
    'Stale running queue jobs require script-based verification',
    { scriptAvailable: true },
    'node scripts/verify-queue.js --strict'
  );
}

async function checkJsonHealthGate(isProd) {
  return check(
    'json_health',
    'warn',
    'JSON corruption scan is script-based and should be run before deploy',
    { scriptAvailable: true },
    'node scripts/verify-data-json.js --strict'
  );
}

async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function checkAdminRbacGovernance(isProd) {
  const enabled = !!(config.ADMIN_RBAC && config.ADMIN_RBAC.enabled);
  const roles = config.ADMIN_RBAC?.roles || [];
  const caps = config.ADMIN_RBAC?.capabilities || {};

  const hasSuper = roles.includes('super_admin') && Array.isArray(caps.super_admin) && caps.super_admin.includes('*');

  if (!enabled) {
    return check(
      'admin_rbac_enabled',
      isProd ? 'fail' : 'warn',
      'ADMIN_RBAC is disabled',
      { enabled },
      'Enable ADMIN_RBAC in config.js'
    );
  }

  if (!hasSuper) {
    return check(
      'admin_rbac_enabled',
      'fail',
      'ADMIN_RBAC is enabled but super_admin wildcard capability is missing',
      { roles },
      'Ensure ADMIN_RBAC.capabilities.super_admin includes "*"'
    );
  }

  return check('admin_rbac_enabled', 'pass', 'ADMIN_RBAC is enabled and super_admin is configured', {
    roles: roles.length,
  });
}

async function checkGovernanceDocs() {
  const docs = [
    { id: 'admin_rbac_runbook_exists', path: './ADMIN_RBAC_MODEL.md', label: 'ADMIN_RBAC_MODEL.md' },
    { id: 'privacy_runbook_exists', path: './PRIVACY_REQUEST_RUNBOOK.md', label: 'PRIVACY_REQUEST_RUNBOOK.md' },
    { id: 'postmortem_template_exists', path: './POSTMORTEM_TEMPLATE.md', label: 'POSTMORTEM_TEMPLATE.md' },
    { id: 'data_governance_runbook_exists', path: './DATA_GOVERNANCE_RUNBOOK.md', label: 'DATA_GOVERNANCE_RUNBOOK.md' },
  ];

  const checks = [];
  for (const d of docs) {
    const ok = await fileExists(d.path);
    checks.push(check(
      d.id,
      ok ? 'pass' : 'warn',
      ok ? `${d.label} exists` : `${d.label} is missing`,
      { path: d.path },
      ok ? null : `Create ${d.label}`
    ));
  }

  return checks;
}

async function checkPrivacyGovernance(isProd) {
  const enabled = !!(config.PRIVACY_REQUESTS && config.PRIVACY_REQUESTS.enabled);
  if (!enabled) {
    return check(
      'privacy_requests_enabled',
      isProd ? 'fail' : 'warn',
      'PRIVACY_REQUESTS is disabled',
      {},
      'Enable PRIVACY_REQUESTS in config.js'
    );
  }

  const requiredScripts = [
    './scripts/export-user-data.js',
    './scripts/anonymize-user-data.js',
    './scripts/verify-privacy-governance.js',
  ];

  const missingScripts = [];
  for (const s of requiredScripts) {
    if (!await fileExists(s)) missingScripts.push(s);
  }

  if (missingScripts.length > 0) {
    return check(
      'privacy_governance_scripts_available',
      isProd ? 'fail' : 'warn',
      'Some privacy governance scripts are missing',
      { missingScripts },
      'Add missing Phase 58 privacy scripts'
    );
  }

  return check('privacy_requests_enabled', 'pass', 'Privacy request workflow is enabled and scripts are present', {
    exportEnabled: !!config.PRIVACY_REQUESTS.exportEnabled,
    anonymizeEnabled: !!config.PRIVACY_REQUESTS.anonymizeEnabled,
  });
}

async function checkDangerousActionApprovals(isProd) {
  const enabled = !!(config.ADMIN_APPROVALS && config.ADMIN_APPROVALS.enabled);
  const required = !!(config.ADMIN_RBAC && config.ADMIN_RBAC.dangerousActionsRequireApproval);
  const actions = config.ADMIN_APPROVALS?.dangerousActions || [];

  if (!enabled || !required) {
    return check(
      'dangerous_actions_approval_configured',
      isProd ? 'fail' : 'warn',
      'Dangerous admin action approvals are not fully enabled',
      { enabled, required },
      'Enable ADMIN_APPROVALS.enabled and ADMIN_RBAC.dangerousActionsRequireApproval'
    );
  }

  if (actions.length === 0) {
    return check(
      'dangerous_actions_approval_configured',
      'fail',
      'Dangerous action approval list is empty',
      {},
      'Configure ADMIN_APPROVALS.dangerousActions'
    );
  }

  return check('dangerous_actions_approval_configured', 'pass', 'Dangerous admin action approval config is present', {
    actionCount: actions.length,
  });
}

async function checkWeeklyOpsReviewFreshness(isProd) {
  try {
    const { getReviewFreshness } = await import('./opsReviewRecords.js');
    const freshness = await getReviewFreshness(
      'weekly_ops_review',
      config.OPS_REVIEW_RECORDS?.weeklyReviewMaxAgeDays || 7
    );

    if (!freshness.fresh) {
      return check(
        'weekly_ops_review_fresh',
        isProd && config.OPS_REVIEW_RECORDS?.requiredWeeklyReview ? 'fail' : 'warn',
        freshness.status === 'missing'
          ? 'No weekly ops review record exists'
          : `Weekly ops review is stale (${freshness.ageDays} days old)`,
        freshness,
        'node scripts/ops-weekly-review.js --persist'
      );
    }

    return check('weekly_ops_review_fresh', 'pass', 'Weekly ops review is fresh', freshness);
  } catch (err) {
    return check('weekly_ops_review_fresh', 'warn', 'Could not evaluate weekly ops review freshness', {
      error: err.message,
    }, 'node scripts/ops-weekly-review.js --persist');
  }
}

async function checkCriticalIncidentPostmortems(isProd) {
  try {
    const { listIncidents } = await import('./incidentTimeline.js');
    const { isPostmortemRequired, getPostmortemByIncident } = await import('./postmortemRecords.js');

    const result = await listIncidents({ limit: 100, offset: 0 });
    const incidents = result.incidents || [];

    const missing = [];
    for (const inc of incidents) {
      if (!isPostmortemRequired(inc)) continue;
      const pm = await getPostmortemByIncident(inc.id);
      if (!pm) {
        missing.push({
          incidentId: inc.id,
          severity: inc.severity,
          title: inc.title,
          status: inc.status,
        });
      }
    }

    if (missing.length > 0) {
      return check(
        'critical_incidents_have_postmortem',
        isProd ? 'fail' : 'warn',
        `${missing.length} incident(s) require postmortem`,
        { missing: missing.slice(0, 10) },
        'Create postmortems from /api/admin/incidents/:id/postmortem'
      );
    }

    return check('critical_incidents_have_postmortem', 'pass', 'Critical incident postmortem requirement is satisfied');
  } catch (err) {
    return check('critical_incidents_have_postmortem', 'warn', 'Could not evaluate incident postmortem governance', {
      error: err.message,
    });
  }
}

export async function runReadinessChecks(options = {}) {
  const checks = [];

  const env = config.ENV?.current || process.env.NODE_ENV || 'development';
  const isProd = env === 'production';

  checks.push(check(
    'node_env',
    isProd ? 'pass' : 'warn',
    isProd ? 'NODE_ENV is production' : `NODE_ENV is ${env}`
  ));

  const adminToken = process.env.ADMIN_TOKEN || '';
  const defaultTokenBad = !adminToken || adminToken === 'change-me-in-production';

  if (config.PRODUCTION_READINESS?.requireNonDefaultAdminToken && defaultTokenBad) {
    checks.push(check(
      'admin_token',
      isProd ? 'fail' : 'warn',
      isProd
        ? 'ADMIN_TOKEN is missing or uses the default example value'
        : 'ADMIN_TOKEN is default/missing; acceptable only outside production',
      {},
      'Set a strong ADMIN_TOKEN in .env'
    ));
  } else {
    checks.push(check('admin_token', 'pass', 'ADMIN_TOKEN is configured'));
  }

  const origins = config.SECURITY?.allowedOrigins || [];
  if (isProd && config.PRODUCTION_READINESS?.requireRestrictedOriginsInProduction) {
    if (origins.includes('*')) {
      checks.push(check('allowed_origins', 'fail', 'Production allowedOrigins must not include wildcard'));
    } else {
      checks.push(check('allowed_origins', 'pass', 'Production allowedOrigins are restricted', { count: origins.length }));
    }
  } else {
    checks.push(check('allowed_origins', origins.includes('*') ? 'warn' : 'pass', 'Allowed origins checked', { count: origins.length }));
  }

  if (isProd && !config.LOGGING?.fileEnabled) {
    checks.push(check('file_logging', 'warn', 'File logging is disabled in production'));
  } else {
    checks.push(check('file_logging', 'pass', 'Logging configuration is acceptable'));
  }

  const basePath = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
  const dataPathWritable = await pathWritable(basePath);
  checks.push(check(
    'data_path_writable',
    dataPathWritable ? 'pass' : 'fail',
    dataPathWritable ? 'Data path is writable' : 'Data path is not writable',
    { basePath }
  ));

  checks.push(await checkCriticalDirs());
  checks.push(await checkCriticalIndexes());

  try {
    const auditIndex = await getAuditIndexStats();
    checks.push(check(
      'audit_index',
      auditIndex.stale ? 'warn' : (auditIndex.status === 'missing' ? 'warn' : 'pass'),
      auditIndex.stale ? 'Audit index is stale' : `Audit index status: ${auditIndex.status}`,
      { status: auditIndex.status, stale: auditIndex.stale, recordCount: auditIndex.recordCount }
    ));
  } catch (_) {
    checks.push(check('audit_index', 'warn', 'Could not read audit index status'));
  }

  try {
    const queueStats = await getQueueStats();
    const workerStats = getWorkerStats();
    checks.push(check(
      'ops_queue',
      queueStats.enabled ? 'pass' : 'warn',
      queueStats.enabled ? 'Ops queue is enabled' : 'Ops queue is disabled',
      { workerStarted: workerStats.started, deadLetter: queueStats.deadLetter || 0 }
    ));
  } catch (_) {
    checks.push(check('ops_queue', 'warn', 'Could not read ops queue stats'));
  }

  try {
    const alertStats = await getAlertDeliveryStats();
    checks.push(check(
      'alert_delivery',
      alertStats.enabled !== false ? 'pass' : 'warn',
      alertStats.enabled !== false ? 'Alert delivery history is enabled' : 'Alert delivery history is disabled'
    ));
  } catch (_) {
    checks.push(check('alert_delivery', 'warn', 'Could not read alert delivery stats'));
  }

  if (config.WEB_PUSH?.enabled && config.PRODUCTION_READINESS?.requireVapidIfWebPushEnabled) {
    const hasVapid = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    checks.push(check(
      'vapid_keys',
      hasVapid ? 'pass' : (isProd ? 'fail' : 'warn'),
      hasVapid
        ? 'VAPID keys are configured'
        : (isProd ? 'WEB_PUSH is enabled but VAPID keys are missing' : 'WEB_PUSH is enabled but VAPID keys are missing; acceptable only outside production'),
      {},
      'node scripts/generate-vapid-keys.js'
    ));
  }

  if (
    config.ADMIN_ALERT_CHANNELS?.enabled &&
    config.ADMIN_ALERT_CHANNELS?.webhook?.enabled &&
    config.PRODUCTION_READINESS?.requireAlertWebhookIfAlertChannelsEnabled
  ) {
    const hasWebhook = !!(process.env.ADMIN_ALERT_WEBHOOK_URL || config.ADMIN_ALERT_CHANNELS.webhook.url);
    checks.push(check(
      'admin_alert_webhook',
      hasWebhook ? 'pass' : 'fail',
      hasWebhook ? 'Admin alert webhook is configured' : 'Admin alert webhook is enabled but URL is missing'
    ));
  } else {
    checks.push(check('admin_alert_webhook', 'pass', 'Admin alert webhook requirement is not enforced'));
  }

  if (isProd && config.PRODUCTION_READINESS?.requireBackupPlanInProduction && !config.BACKUP?.enabled) {
    checks.push(check('backup_plan', 'warn', 'BACKUP is disabled in production config'));
  } else {
    checks.push(check('backup_plan', 'pass', 'Backup configuration checked'));
  }

  checks.push(check('instance_mode', 'pass', 'Instance mode evaluated', getInstanceInfo()));

  // Phase 55 — Scale hygiene + domain consistency.
  checks.push(await checkScaleHygiene());

  // Phase 59 — File-based scale limits + storage pressure readiness.
  checks.push(await checkScaleThresholdsConfigured(isProd));
  checks.push(await checkStoragePressureReadiness(isProd));
  checks.push(await checkMultiInstanceBoundaryConfig(isProd));
  checks.push(await checkExternalizationReadinessConfig(isProd));
  checks.push(...await checkPhase59Docs(isProd));

  checks.push(await checkDomainConsistency());

  checks.push(await checkPwaCacheVersion());

  // Phase 57 — Operational readiness gates.
  checks.push(await checkQueueOperationalHealth(isProd));
  checks.push(await checkQueueNoStaleRunningGate(isProd));
  checks.push(await checkRestoreDrillFreshness(isProd));
  checks.push(await checkMarketplaceRollupFreshness(isProd));
  checks.push(await checkSchedulerStaleness(isProd));
  checks.push(await checkMaintenanceInactive(isProd));
  checks.push(await checkJsonHealthGate(isProd));

  // Phase 58 — Governance / Privacy / RBAC readiness.
  checks.push(await checkAdminRbacGovernance(isProd));
  checks.push(...await checkGovernanceDocs());
  checks.push(await checkPrivacyGovernance(isProd));
  checks.push(await checkDangerousActionApprovals(isProd));
  checks.push(await checkWeeklyOpsReviewFreshness(isProd));
  checks.push(await checkCriticalIncidentPostmortems(isProd));

  // Phase 60 — Evidence-based externalization decision + migration rehearsal readiness.
  try {
    const phase60Checks = await getPhase60ReadinessChecks();
    for (const c of phase60Checks) checks.push(c);
  } catch (err) {
    checks.push(check(
      'phase60_readiness',
      'warn',
      'Could not evaluate Phase 60 readiness checks',
      { error: err.message },
      'node scripts/capture-externalization-decision.js --json'
    ));
  }

  // Phase 61 — Evidence cadence + rollback rehearsal + pilot gate readiness.
  checks.push(...await checkPhase61Docs(isProd));
  checks.push(await checkPhase61EvidenceCadence(isProd));
  checks.push(await checkRollbackRehearsalReadiness(isProd));
  checks.push(await checkPhase61PilotGate(isProd));
  checks.push(await checkRepositoryContracts(isProd));

  return checks;
}

export const _testHelpers = {
  classifyReadiness,
  runReadinessChecks,
};

export async function getProductionReadiness() {
  try {
    if (!config.PRODUCTION_READINESS || !config.PRODUCTION_READINESS.enabled) {
      return {
        ok: true,
        status: 'disabled',
        environment: config.ENV?.current || process.env.NODE_ENV || 'development',
        checks: [],
        summary: { pass: 0, warn: 0, fail: 0 },
      };
    }

    const checks = await runReadinessChecks();
    const classification = classifyReadiness(checks);

    return {
      ok: classification.ok,
      status: classification.status,
      environment: config.ENV?.current || process.env.NODE_ENV || 'development',
      generatedAt: new Date().toISOString(),
      checks,
      summary: classification.summary,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'not_ready',
      environment: config.ENV?.current || process.env.NODE_ENV || 'development',
      generatedAt: new Date().toISOString(),
      checks: [
        check('readiness_internal_error', 'fail', 'Production readiness check failed internally'),
      ],
      summary: { pass: 0, warn: 0, fail: 1 },
      error: err.message,
    };
  }
}
