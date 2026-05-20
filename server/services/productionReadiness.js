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
