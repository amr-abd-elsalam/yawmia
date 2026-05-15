// ═══════════════════════════════════════════════════════════════
// server/services/metricsRollups.js — Ops Metrics Rollups (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Hourly operational rollups for queue, alert delivery, schedulers and locks.
// No external observability dependencies.
// Storage: data/metrics/ops-rollups/{YYYY-MM-DDTHH}.json
// ═══════════════════════════════════════════════════════════════

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
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

function isEnabled() {
  return !!(config.OPS_METRICS_ROLLUPS && config.OPS_METRICS_ROLLUPS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function hourKey(date = new Date()) {
  return date.toISOString().slice(0, 13);
}

function rollupIdFromHour(hour) {
  return `or_${hour}`;
}

function rollupPath(id) {
  return getRecordPath('ops_rollups', id);
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function inLastHour(iso, nowMs = Date.now()) {
  const ms = parseMs(iso);
  return ms > 0 && (nowMs - ms) <= 60 * 60 * 1000;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[idx]);
}

async function loadQueueJobs() {
  try {
    const dir = getCollectionPath('ops_queue');
    const rows = await listJSON(dir);
    return rows.filter(j => j && j.id && j.id.startsWith('q_'));
  } catch (err) {
    logger.warn('metricsRollups: loadQueueJobs failed', { error: err.message });
    return [];
  }
}

async function loadDeadLetterJobs() {
  try {
    const dir = getCollectionPath('ops_queue_dead_letter');
    const rows = await listJSON(dir);
    return rows.filter(j => j && j.id && j.id.startsWith('q_'));
  } catch (_) {
    return [];
  }
}

async function loadAlertDeliveries() {
  try {
    const dir = getCollectionPath('alert_deliveries');
    const rows = await listJSON(dir);
    return rows.filter(d => d && d.id && d.id.startsWith('adl_'));
  } catch (err) {
    logger.warn('metricsRollups: loadAlertDeliveries failed', { error: err.message });
    return [];
  }
}

async function loadSchedulers() {
  try {
    const { listSchedulerJobs } = await import('./schedulerRegistry.js');
    return await listSchedulerJobs();
  } catch (_) {
    return [];
  }
}

async function loadLocks() {
  try {
    const { listProcessLocks } = await import('./processLock.js');
    return await listProcessLocks();
  } catch (_) {
    return [];
  }
}

function computeQueueRollup(jobs, deadJobs, nowMs) {
  const queue = {
    pending: 0,
    running: 0,
    failed: 0,
    deadLetter: deadJobs.length,
    completedLastHour: 0,
    failedLastHour: 0,
    deadLetterLastHour: 0,
  };

  for (const job of jobs) {
    if (job.status === 'pending') queue.pending++;
    else if (job.status === 'running') queue.running++;
    else if (job.status === 'failed') queue.failed++;

    if (job.status === 'completed' && inLastHour(job.completedAt || job.updatedAt, nowMs)) {
      queue.completedLastHour++;
    }
    if (job.status === 'failed' && inLastHour(job.failedAt || job.updatedAt, nowMs)) {
      queue.failedLastHour++;
    }
    if (job.status === 'dead-letter' && inLastHour(job.deadLetteredAt || job.updatedAt, nowMs)) {
      queue.deadLetterLastHour++;
    }
  }

  for (const job of deadJobs) {
    if (inLastHour(job.deadLetteredAt || job.updatedAt, nowMs)) {
      queue.deadLetterLastHour++;
    }
  }

  return queue;
}

function computeAlertRollup(deliveries, nowMs) {
  let total = 0;
  let delivered = 0;
  let failed = 0;
  let deadLetter = 0;
  const deliveryLatencies = [];

  for (const d of deliveries) {
    total++;
    if (d.status === 'delivered') delivered++;
    else if (d.status === 'failed') failed++;
    else if (d.status === 'dead-letter') deadLetter++;

    if (d.deliveredAt && d.createdAt) {
      const latency = parseMs(d.deliveredAt) - parseMs(d.createdAt);
      if (latency > 0) deliveryLatencies.push(latency);
    }
  }

  return {
    total,
    deliveredRate: total > 0 ? Math.round((delivered / total) * 100) : 100,
    failed,
    deadLetter,
    p95DeliveryMs: percentile(deliveryLatencies, 0.95),
  };
}

function computeSchedulerRollup(schedulers) {
  const now = Date.now();
  const staleMs = config.OPS_METRICS_ROLLUPS?.slo?.schedulerStaleWarningMs || (2 * 60 * 60 * 1000);

  let stale = 0;
  let failed = 0;

  for (const s of schedulers) {
    if (s.lastStatus === 'failed') failed++;

    if (s.enabled && s.nextRunAt) {
      const nextRunMs = parseMs(s.nextRunAt);
      if (nextRunMs > 0 && now - nextRunMs > staleMs) stale++;
    }
  }

  return {
    total: schedulers.length,
    stale,
    failed,
  };
}

function computeLocksRollup(locks) {
  return {
    active: locks.length,
    stale: locks.filter(l => l.stale).length,
  };
}

function computeSloViolationsFromRollup(rollup) {
  const slo = config.OPS_METRICS_ROLLUPS?.slo || {};
  const violations = [];

  const q = rollup.queue || {};
  const alerts = rollup.alerts || {};
  const sched = rollup.schedulers || {};

  if ((q.deadLetter || 0) >= (slo.queueDeadLetterWarning || 5)) {
    violations.push({
      metric: 'queue.deadLetter',
      value: q.deadLetter,
      threshold: slo.queueDeadLetterWarning || 5,
      level: 'warning',
      message: `Queue dead-letter count is ${q.deadLetter}`,
    });
  }

  const decidedLastHour = (q.completedLastHour || 0) + (q.failedLastHour || 0) + (q.deadLetterLastHour || 0);
  const failedRate = decidedLastHour > 0
    ? Math.round((((q.failedLastHour || 0) + (q.deadLetterLastHour || 0)) / decidedLastHour) * 100)
    : 0;

  if (decidedLastHour >= 5 && failedRate >= (slo.queueFailedRateWarningPercent || 10)) {
    violations.push({
      metric: 'queue.failedRateLastHour',
      value: failedRate,
      threshold: slo.queueFailedRateWarningPercent || 10,
      level: 'warning',
      message: `Queue failed rate last hour is ${failedRate}%`,
    });
  }

  if (alerts.deliveredRate < (slo.alertDeliveryRateWarningPercent || 90)) {
    violations.push({
      metric: 'alerts.deliveredRate',
      value: alerts.deliveredRate,
      threshold: slo.alertDeliveryRateWarningPercent || 90,
      level: 'warning',
      message: `Alert delivery rate is ${alerts.deliveredRate}%`,
    });
  }

  if ((alerts.p95DeliveryMs || 0) >= (slo.alertDeliveryP95WarningMs || 30000)) {
    violations.push({
      metric: 'alerts.p95DeliveryMs',
      value: alerts.p95DeliveryMs,
      threshold: slo.alertDeliveryP95WarningMs || 30000,
      level: 'warning',
      message: `Alert delivery p95 is ${alerts.p95DeliveryMs}ms`,
    });
  }

  if ((sched.stale || 0) > 0) {
    violations.push({
      metric: 'schedulers.stale',
      value: sched.stale,
      threshold: 0,
      level: 'warning',
      message: `${sched.stale} scheduler job(s) are stale`,
    });
  }

  return violations;
}

export async function captureOpsRollup(options = {}) {
  if (!isEnabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  const started = Date.now();
  const now = Date.now();
  const hour = options.hourKey || hourKey();
  const id = rollupIdFromHour(hour);

  const [jobs, deadJobs, deliveries, schedulers, locks] = await Promise.all([
    loadQueueJobs(),
    loadDeadLetterJobs(),
    loadAlertDeliveries(),
    loadSchedulers(),
    loadLocks(),
  ]);

  const rollup = {
    id,
    hour,
    timestamp: nowIso(),
    queue: computeQueueRollup(jobs, deadJobs, now),
    alerts: computeAlertRollup(deliveries, now),
    schedulers: computeSchedulerRollup(schedulers),
    locks: computeLocksRollup(locks),
    sloViolations: [],
    durationMs: 0,
  };

  rollup.sloViolations = computeSloViolationsFromRollup(rollup);
  rollup.durationMs = Date.now() - started;

  await atomicWrite(rollupPath(id), rollup);

  eventBus.emit('ops_rollup:captured', {
    rollupId: id,
    hour,
    sloViolationCount: rollup.sloViolations.length,
    timestamp: rollup.timestamp,
  });

  for (const violation of rollup.sloViolations) {
    eventBus.emit('ops_slo:violated', {
      rollupId: id,
      violation,
      timestamp: rollup.timestamp,
    });
  }

  if (rollup.schedulers && rollup.schedulers.stale > 0) {
    eventBus.emit('scheduler:stale', {
      stale: rollup.schedulers.stale,
      total: rollup.schedulers.total,
      rollupId: id,
      timestamp: rollup.timestamp,
    });
  }

  return rollup;
}

export async function listOpsRollups(options = {}) {
  if (!isEnabled()) {
    return { rollups: [], total: 0, limit: 24, offset: 0 };
  }

  const dir = getCollectionPath('ops_rollups');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('or_'));

  if (options.from) rows = rows.filter(r => r.timestamp >= options.from);
  if (options.to) rows = rows.filter(r => r.timestamp <= options.to);

  rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total = rows.length;
  const limit = Math.min(200, Math.max(1, parseInt(options.limit) || 24));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    rollups: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function getLatestOpsRollup() {
  const result = await listOpsRollups({ limit: 1, offset: 0 });
  return result.rollups[0] || null;
}

export async function computeOpsSlo(options = {}) {
  const latest = options.rollup || await getLatestOpsRollup();

  if (!latest) {
    return {
      ok: true,
      status: 'unknown',
      latest: null,
      violations: [],
      generatedAt: nowIso(),
    };
  }

  const violations = latest.sloViolations || [];
  return {
    ok: violations.length === 0,
    status: violations.length === 0 ? 'healthy' : 'violations',
    latest,
    violations,
    generatedAt: nowIso(),
  };
}

export async function cleanupOldOpsRollups() {
  if (!isEnabled()) return 0;

  const retentionDays = config.OPS_METRICS_ROLLUPS?.retentionDays || 30;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const dir = getCollectionPath('ops_rollups');
  const rows = await listJSON(dir);

  let cleaned = 0;
  for (const r of rows) {
    if (!r || !r.id) continue;
    const ts = parseMs(r.timestamp);
    if (ts > 0 && ts < cutoffMs) {
      await deleteJSON(rollupPath(r.id)).catch(() => {});
      cleaned++;
    }
  }

  return cleaned;
}

export const _testHelpers = {
  hourKey,
  rollupIdFromHour,
  computeQueueRollup,
  computeAlertRollup,
  computeSchedulerRollup,
  computeLocksRollup,
  computeSloViolationsFromRollup,
  percentile,
};
