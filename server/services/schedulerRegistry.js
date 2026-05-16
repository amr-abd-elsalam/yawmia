// ═══════════════════════════════════════════════════════════════
// server/services/schedulerRegistry.js — Persistent Scheduler Registry (Phase 54)
// ═══════════════════════════════════════════════════════════════
// File-backed recurring job registry.
// Prevents duplicate scheduled enqueue across accidental multi-process setups
// by using per-job persistent lease + existing queue idempotency.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  isValidId,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { getInstanceId, canRunSchedulers, getInstanceInfo } from './instanceMode.js';
import { recordSchedulerRun } from './schedulerRunHistory.js';

let registryTimer = null;

/** @type {Map<string, object>} */
const definitions = new Map();

function cfg() {
  return config.SCHEDULER_REGISTRY || {};
}

function isEnabled() {
  return !!(cfg().enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function schedulerPath(name) {
  if (!isValidId(name)) throw new Error(`Invalid scheduler job name: ${name}`);
  return getRecordPath('scheduler', name);
}

function payloadSizeBytes(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload || {}), 'utf-8');
  } catch (_) {
    return Infinity;
  }
}

function dateBucketForInterval(intervalMs, at = new Date()) {
  const iso = at.toISOString();

  if (intervalMs >= 24 * 60 * 60 * 1000) {
    return iso.slice(0, 10);
  }

  if (intervalMs >= 60 * 60 * 1000) {
    return iso.slice(0, 13);
  }

  return iso.slice(0, 16);
}

function computeNextRunAt(definition, fromMs = Date.now()) {
  const intervalMs = Math.max(1000, Number(definition.intervalMs || cfg().checkIntervalMs || 60000));
  return new Date(fromMs + intervalMs).toISOString();
}

function isLeaseActive(record) {
  if (!record || !record.leaseUntil) return false;
  return parseMs(record.leaseUntil) > Date.now();
}

function isDue(record) {
  if (!record || record.enabled === false) return false;
  return parseMs(record.nextRunAt) <= Date.now();
}

function publicRecord(record) {
  if (!record) return null;
  return {
    name: record.name,
    enabled: !!record.enabled,
    queueType: record.queueType,
    intervalMs: record.intervalMs,
    priority: record.priority || 'normal',
    lastRunAt: record.lastRunAt || null,
    nextRunAt: record.nextRunAt || null,
    lastStatus: record.lastStatus || null,
    lastQueueJobId: record.lastQueueJobId || null,
    leaseOwner: record.leaseOwner || null,
    leaseUntil: record.leaseUntil || null,
    leaseActive: isLeaseActive(record),
    runCount: record.runCount || 0,
    failCount: record.failCount || 0,
    lastError: record.lastError || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function defaultEnabled(name) {
  const jobs = cfg().jobs || {};
  if (jobs[name] && typeof jobs[name].enabled === 'boolean') return jobs[name].enabled;
  return true;
}

function defaultDefinitions() {
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const min15 = 15 * 60 * 1000;

  return [
    {
      name: 'predictive_scan',
      queueType: 'predictive_scan',
      intervalMs: config.PREDICTIVE_ABUSE?.scanIntervalMs || min15,
      priority: 'normal',
      payload: { force: true, persist: true },
      enabled: defaultEnabled('predictive_scan'),
      idempotencyKeyFn: (bucket) => `predictive_scan:scheduled:${bucket}`,
    },
    {
      name: 'trust_snapshot_batch',
      queueType: 'trust_snapshot_batch',
      intervalMs: config.TRUST_CALIBRATION?.snapshotIntervalMs || day,
      priority: 'low',
      payload: { reason: 'scheduled', force: false },
      enabled: defaultEnabled('trust_snapshot_batch'),
      idempotencyKeyFn: (bucket) => `trust_snapshot_batch:scheduled:${bucket}`,
    },
    {
      name: 'predictive_signal_retention',
      queueType: 'predictive_signal_retention',
      intervalMs: config.PREDICTIVE_SIGNAL_RETENTION?.cleanupIntervalMs || day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('predictive_signal_retention'),
      idempotencyKeyFn: (bucket) => `predictive_signal_retention:scheduled:${bucket}`,
    },
    {
      name: 'ops_rollup_capture',
      queueType: 'ops_rollup_capture',
      intervalMs: config.OPS_METRICS_ROLLUPS?.intervalMs || hour,
      priority: 'low',
      payload: { reason: 'scheduled' },
      enabled: defaultEnabled('ops_rollup_capture'),
      idempotencyKeyFn: (bucket) => `ops_rollup_capture:${bucket}`,
    },
    {
      name: 'backup_restore_drill',
      queueType: 'backup_restore_drill',
      intervalMs: day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: false,
      idempotencyKeyFn: (bucket) => `backup_restore_drill:scheduled:${bucket}`,
    },

    // Phase 55 — File-Based Scale Hygiene schedulers
    {
      name: 'queue_compaction',
      queueType: 'queue_compaction',
      intervalMs: config.QUEUE_HYGIENE?.compactIntervalMs || day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('queue_compaction'),
      idempotencyKeyFn: (bucket) => `queue_compaction:scheduled:${bucket}`,
    },
    {
      name: 'workroom_hygiene_compaction',
      queueType: 'workroom_hygiene_compaction',
      intervalMs: config.WORKROOM_HYGIENE?.cleanupIntervalMs || day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('workroom_hygiene_compaction'),
      idempotencyKeyFn: (bucket) => `workroom_hygiene_compaction:scheduled:${bucket}`,
    },
    {
      name: 'workroom_attachment_cleanup',
      queueType: 'workroom_attachment_cleanup',
      intervalMs: config.WORKROOM_HYGIENE?.cleanupIntervalMs || day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('workroom_attachment_cleanup'),
      idempotencyKeyFn: (bucket) => `workroom_attachment_cleanup:scheduled:${bucket}`,
    },
    {
      name: 'trust_snapshot_rollup',
      queueType: 'trust_snapshot_rollup',
      intervalMs: config.TRUST_RETENTION?.cleanupIntervalMs || day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('trust_snapshot_rollup'),
      idempotencyKeyFn: (bucket) => `trust_snapshot_rollup:scheduled:${bucket}`,
    },
    {
      name: 'predictive_archive_index_rebuild',
      queueType: 'predictive_archive_index_rebuild',
      intervalMs: day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('predictive_archive_index_rebuild'),
      idempotencyKeyFn: (bucket) => `predictive_archive_index_rebuild:scheduled:${bucket}`,
    },
    {
      name: 'audit_token_compaction',
      queueType: 'audit_token_compaction',
      intervalMs: day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('audit_token_compaction'),
      idempotencyKeyFn: (bucket) => `audit_token_compaction:scheduled:${bucket}`,
    },
    {
      name: 'scheduler_history_cleanup',
      queueType: 'scheduler_history_cleanup',
      intervalMs: day,
      priority: 'low',
      payload: { options: { reason: 'scheduled' } },
      enabled: defaultEnabled('scheduler_history_cleanup'),
      idempotencyKeyFn: (bucket) => `scheduler_history_cleanup:scheduled:${bucket}`,
    },
  ];
}

/**
 * Register one scheduler definition and ensure persistent record exists.
 */
export async function registerSchedulerJob(definition) {
  if (!isEnabled()) return { ok: false, disabled: true };
  if (!definition || !definition.name || !isValidId(definition.name)) {
    return { ok: false, code: 'INVALID_SCHEDULER_DEFINITION' };
  }
  if (!definition.queueType || typeof definition.queueType !== 'string') {
    return { ok: false, code: 'QUEUE_TYPE_REQUIRED' };
  }

  const payloadBytes = payloadSizeBytes(definition.payload || {});
  const maxBytes = cfg().maxManualRunPayloadBytes || (64 * 1024);
  if (payloadBytes > maxBytes) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  }

  definitions.set(definition.name, { ...definition });

  return withLock(`scheduler:${definition.name}`, async () => {
    const path = schedulerPath(definition.name);
    const existing = await readJSON(path);
    const now = nowIso();

    if (existing) {
      existing.queueType = definition.queueType;
      existing.intervalMs = Number(definition.intervalMs || existing.intervalMs || 60000);
      existing.priority = definition.priority || existing.priority || 'normal';
      if (existing.enabled === undefined) existing.enabled = definition.enabled !== false;
      existing.updatedAt = now;

      if (!existing.nextRunAt) {
        existing.nextRunAt = computeNextRunAt(definition);
      }

      await atomicWrite(path, existing);
      return { ok: true, record: publicRecord(existing), existing: true };
    }

    const record = {
      name: definition.name,
      enabled: definition.enabled !== false,
      queueType: definition.queueType,
      intervalMs: Number(definition.intervalMs || 60000),
      priority: definition.priority || 'normal',
      lastRunAt: null,
      nextRunAt: definition.nextRunAt || computeNextRunAt(definition, Date.now()),
      lastStatus: 'registered',
      lastQueueJobId: null,
      leaseOwner: null,
      leaseUntil: null,
      runCount: 0,
      failCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };

    await atomicWrite(path, record);

    eventBus.emit('scheduler:job_registered', {
      name: record.name,
      queueType: record.queueType,
      timestamp: now,
    });

    return { ok: true, record: publicRecord(record), existing: false };
  });
}

export async function registerDefaultSchedulerJobs() {
  if (!isEnabled()) return { ok: false, disabled: true, registered: 0 };

  let registered = 0;
  for (const def of defaultDefinitions()) {
    const result = await registerSchedulerJob(def);
    if (result.ok) registered++;
  }

  return { ok: true, registered };
}

export async function getSchedulerJob(name) {
  if (!name || typeof name !== 'string') return null;
  try {
    const record = await readJSON(schedulerPath(name));
    return publicRecord(record);
  } catch (_) {
    return null;
  }
}

export async function listSchedulerJobs() {
  if (!isEnabled()) return [];

  try {
    const dir = getCollectionPath('scheduler');
    const rows = await listJSON(dir);
    return rows
      .filter(r => r && r.name)
      .map(publicRecord)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch (err) {
    logger.warn('schedulerRegistry: list failed', { error: err.message });
    return [];
  }
}

export async function acquireSchedulerLease(name, ownerId) {
  if (!isEnabled()) return { ok: false, disabled: true };
  if (!name || !isValidId(name)) return { ok: false, code: 'INVALID_SCHEDULER_NAME' };

  const leaseOwner = ownerId || getInstanceId();

  return withLock(`scheduler:${name}`, async () => {
    const path = schedulerPath(name);
    const record = await readJSON(path);

    if (!record) return { ok: false, code: 'SCHEDULER_NOT_FOUND' };
    if (record.enabled === false) return { ok: false, code: 'SCHEDULER_DISABLED', record: publicRecord(record) };

    if (record.leaseOwner && isLeaseActive(record) && record.leaseOwner !== leaseOwner) {
      return { ok: false, code: 'LEASE_HELD', record: publicRecord(record) };
    }

    const now = nowIso();
    record.leaseOwner = leaseOwner;
    record.leaseUntil = new Date(Date.now() + (cfg().leaseMs || 10 * 60 * 1000)).toISOString();
    record.updatedAt = now;

    await atomicWrite(path, record);

    return { ok: true, record: publicRecord(record) };
  });
}

export async function releaseSchedulerLease(name, ownerId) {
  if (!isEnabled()) return { ok: false, disabled: true };

  const leaseOwner = ownerId || getInstanceId();

  return withLock(`scheduler:${name}`, async () => {
    const path = schedulerPath(name);
    const record = await readJSON(path);

    if (!record) return { ok: false, code: 'SCHEDULER_NOT_FOUND' };

    if (record.leaseOwner && record.leaseOwner !== leaseOwner) {
      return { ok: false, code: 'LEASE_NOT_OWNER', record: publicRecord(record) };
    }

    record.leaseOwner = null;
    record.leaseUntil = null;
    record.updatedAt = nowIso();

    await atomicWrite(path, record);

    return { ok: true, record: publicRecord(record) };
  });
}

async function enqueueSchedulerRun(record, definition, options = {}) {
  const { enqueueJob } = await import('./opsQueue.js');

  const now = new Date();
  const bucket = options.bucket || dateBucketForInterval(record.intervalMs, now);

  const payload = options.payloadOverride || definition.payload || {};
  const priority = options.priority || definition.priority || record.priority || 'normal';
  const idempotencyKey = options.idempotencyKey ||
    (typeof definition.idempotencyKeyFn === 'function'
      ? definition.idempotencyKeyFn(bucket)
      : `${record.queueType}:scheduled:${bucket}`);

  const enqueueResult = await enqueueJob({
    type: record.queueType,
    priority,
    payload,
    idempotencyKey,
    createdBy: options.createdBy || 'scheduler',
  });

  return { enqueueResult, bucket, idempotencyKey };
}

export async function updateSchedulerAfterRun(name, patch = {}) {
  if (!isEnabled()) return { ok: false, disabled: true };

  return withLock(`scheduler:${name}`, async () => {
    const path = schedulerPath(name);
    const record = await readJSON(path);

    if (!record) return { ok: false, code: 'SCHEDULER_NOT_FOUND' };

    const def = definitions.get(name) || record;
    const now = nowIso();

    if (patch.lastStatus) record.lastStatus = patch.lastStatus;
    if (patch.lastQueueJobId !== undefined) record.lastQueueJobId = patch.lastQueueJobId;
    if (patch.lastError !== undefined) record.lastError = patch.lastError;

    record.lastRunAt = patch.lastRunAt || now;
    record.nextRunAt = patch.nextRunAt || computeNextRunAt(def, Date.now());
    record.runCount = (record.runCount || 0) + (patch.incrementRun === false ? 0 : 1);

    if (patch.failed) record.failCount = (record.failCount || 0) + 1;

    record.leaseOwner = null;
    record.leaseUntil = null;
    record.updatedAt = now;

    await atomicWrite(path, record);

    return { ok: true, record: publicRecord(record) };
  });
}

export async function runSchedulerJobNow(name, options = {}) {
  if (!isEnabled()) return { ok: false, disabled: true };
  if (!canRunSchedulers() && options.force !== true) {
    return { ok: false, code: 'SCHEDULERS_DISABLED_BY_INSTANCE_MODE', instance: getInstanceInfo() };
  }

  if (options.payload) {
    const payloadBytes = payloadSizeBytes(options.payload);
    const maxBytes = cfg().maxManualRunPayloadBytes || (64 * 1024);
    if (payloadBytes > maxBytes) {
      return {
        ok: false,
        code: 'PAYLOAD_TOO_LARGE',
        error: `Scheduler manual payload exceeds maxManualRunPayloadBytes (${payloadBytes} > ${maxBytes})`,
      };
    }
  }

  const definition = definitions.get(name);
  const record = await readJSON(schedulerPath(name)).catch(() => null);

  if (!record) return { ok: false, code: 'SCHEDULER_NOT_FOUND' };
  if (!definition && !record.queueType) return { ok: false, code: 'SCHEDULER_DEFINITION_NOT_REGISTERED' };

  const ownerId = options.ownerId || getInstanceId();
  const lease = await acquireSchedulerLease(name, ownerId);

  if (!lease.ok) return lease;

  try {
    const enqueue = await enqueueSchedulerRun(record, definition || record, {
      createdBy: options.createdBy || ownerId,
      payloadOverride: options.payload,
      priority: options.priority,
      idempotencyKey: options.idempotencyKey,
      bucket: options.bucket || dateBucketForInterval(record.intervalMs, new Date()),
    });

    if (!enqueue.enqueueResult || !enqueue.enqueueResult.ok) {
      await updateSchedulerAfterRun(name, {
        lastStatus: 'failed',
        lastError: enqueue.enqueueResult?.error || 'QUEUE_ENQUEUE_FAILED',
        failed: true,
      });

      await recordSchedulerRun(name, {
        status: 'failed',
        createdBy: options.createdBy || ownerId,
        startedAt: nowIso(),
        completedAt: nowIso(),
        error: enqueue.enqueueResult?.error || 'QUEUE_ENQUEUE_FAILED',
        idempotencyKey: enqueue.idempotencyKey,
      }).catch(() => {});

      eventBus.emit('scheduler:job_failed', {
        name,
        error: enqueue.enqueueResult?.error || 'QUEUE_ENQUEUE_FAILED',
        timestamp: nowIso(),
      });

      return { ok: false, code: 'QUEUE_ENQUEUE_FAILED', result: enqueue.enqueueResult };
    }

    const updated = await updateSchedulerAfterRun(name, {
      lastStatus: enqueue.enqueueResult.deduped ? 'deduped' : 'queued',
      lastQueueJobId: enqueue.enqueueResult.job?.id || null,
      lastError: null,
    });

    await recordSchedulerRun(name, {
      status: enqueue.enqueueResult.deduped ? 'skipped' : 'queued',
      queueJobId: enqueue.enqueueResult.job?.id || null,
      createdBy: options.createdBy || ownerId,
      startedAt: nowIso(),
      completedAt: nowIso(),
      idempotencyKey: enqueue.idempotencyKey,
      deduped: !!enqueue.enqueueResult.deduped,
      metadata: {
        queueType: record.queueType,
      },
    }).catch(() => {});

    eventBus.emit('scheduler:job_queued', {
      name,
      queueType: record.queueType,
      queueJobId: enqueue.enqueueResult.job?.id || null,
      deduped: !!enqueue.enqueueResult.deduped,
      idempotencyKey: enqueue.idempotencyKey,
      timestamp: nowIso(),
    });

    return {
      ok: true,
      queued: true,
      deduped: !!enqueue.enqueueResult.deduped,
      queueJob: enqueue.enqueueResult.job || null,
      scheduler: updated.record,
      idempotencyKey: enqueue.idempotencyKey,
    };
  } catch (err) {
    await updateSchedulerAfterRun(name, {
      lastStatus: 'failed',
      lastError: err.message,
      failed: true,
    }).catch(() => {});

    await recordSchedulerRun(name, {
      status: 'failed',
      createdBy: options.createdBy || ownerId,
      startedAt: nowIso(),
      completedAt: nowIso(),
      error: err.message,
    }).catch(() => {});

    eventBus.emit('scheduler:job_failed', {
      name,
      error: err.message,
      timestamp: nowIso(),
    });

    return { ok: false, code: 'SCHEDULER_RUN_FAILED', error: err.message };
  } finally {
    await releaseSchedulerLease(name, ownerId).catch(() => {});
  }
}

export async function checkAndRunDueJobs() {
  if (!isEnabled()) return { checked: 0, queued: 0, disabled: true };
  if (!canRunSchedulers()) {
    return { checked: 0, queued: 0, skipped: true, code: 'SCHEDULERS_DISABLED_BY_INSTANCE_MODE' };
  }

  await registerDefaultSchedulerJobs().catch(() => {});

  const rows = await listSchedulerJobs();
  let checked = 0;
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    checked++;

    if (!isDue(row)) {
      skipped++;
      continue;
    }

    eventBus.emit('scheduler:job_due', {
      name: row.name,
      queueType: row.queueType,
      timestamp: nowIso(),
    });

    const result = await runSchedulerJobNow(row.name, { createdBy: 'scheduler' });

    if (result.ok) queued++;
    else failed++;
  }

  return { checked, queued, skipped, failed };
}

export async function enableSchedulerJob(name, enabled = true) {
  if (!isEnabled()) return { ok: false, disabled: true };

  return withLock(`scheduler:${name}`, async () => {
    const path = schedulerPath(name);
    const record = await readJSON(path);

    if (!record) return { ok: false, code: 'SCHEDULER_NOT_FOUND' };

    record.enabled = !!enabled;
    record.updatedAt = nowIso();

    if (record.enabled && !record.nextRunAt) {
      record.nextRunAt = computeNextRunAt(record);
    }

    await atomicWrite(path, record);

    eventBus.emit(record.enabled ? 'scheduler:job_enabled' : 'scheduler:job_disabled', {
      name,
      timestamp: record.updatedAt,
    });

    return { ok: true, record: publicRecord(record) };
  });
}

export function startSchedulerRegistry() {
  if (registryTimer) return;
  if (!isEnabled()) {
    logger.info('Scheduler registry: disabled via config');
    return;
  }

  if (!canRunSchedulers()) {
    logger.warn('Scheduler registry: refused to start by instance mode', {
      instance: getInstanceInfo(),
    });
    return;
  }

  registerDefaultSchedulerJobs().catch(err => {
    logger.warn('Scheduler registry: default registration failed', { error: err.message });
  });

  registryTimer = setInterval(() => {
    checkAndRunDueJobs().catch(err => {
      logger.warn('Scheduler registry: due check failed', { error: err.message });
    });
  }, cfg().checkIntervalMs || 60000);

  if (registryTimer.unref) registryTimer.unref();

  logger.info('Scheduler registry: started', {
    intervalMs: cfg().checkIntervalMs || 60000,
    instanceId: getInstanceId(),
  });
}

export function stopSchedulerRegistry() {
  if (registryTimer) {
    clearInterval(registryTimer);
    registryTimer = null;
  }
}

export const _testHelpers = {
  definitions,
  defaultDefinitions,
  dateBucketForInterval,
  computeNextRunAt,
  isDue,
  isLeaseActive,
  payloadSizeBytes,
  getTimer: () => registryTimer,
  clearDefinitions: () => definitions.clear(),
};
