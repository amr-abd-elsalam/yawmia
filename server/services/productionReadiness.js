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

function check(id, status, message, details = {}) {
  return { id, status, message, details };
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
    checks.push(check('admin_token', 'fail', 'ADMIN_TOKEN is missing or uses the default example value'));
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
      hasVapid ? 'pass' : 'fail',
      hasVapid ? 'VAPID keys are configured' : 'WEB_PUSH is enabled but VAPID keys are missing'
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

  checks.push(await checkPwaCacheVersion());

  return checks;
}

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
