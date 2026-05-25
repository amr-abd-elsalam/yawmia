// ═══════════════════════════════════════════════════════════════
// server/services/opsQueue.js — Durable File-Backed Ops Queue (Phase 52)
// ═══════════════════════════════════════════════════════════════
// Persistent operational queue:
//   - survives restart
//   - idempotency keys
//   - retry + exponential backoff
//   - lease-based claiming
//   - stale running recovery
//   - dead-letter queue
//   - atomic JSON writes only
//
// Storage:
//   data/ops_queue/q_xxx.json
//   data/ops_queue/idempotency/{sha256}.json
//   data/ops_queue/dead-letter/q_xxx.json
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
import {
  writeQueueRecord,
  readQueueRecord,
  deleteQueueRecord,
  moveQueueRecord,
  listQueueRecords,
  readQueueSummary,
  rebuildQueueSummary,
} from './queueStorageIndex.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

const VALID_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'dead-letter',
  'cancelled',
]);

const PRIORITY_WEIGHTS = {
  low: 25,
  normal: 50,
  high: 75,
  critical: 100,
};

function isEnabled() {
  return !!(config.OPS_QUEUE && config.OPS_QUEUE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function getQueuePaths() {
  return {
    base: getCollectionPath('ops_queue'),
    pending: getCollectionPath('queue_pending'),
    running: getCollectionPath('queue_running'),
    completed: getCollectionPath('queue_completed'),
    failed: getCollectionPath('queue_failed'),
    cancelled: getCollectionPath('queue_cancelled'),
    idempotency: getCollectionPath('ops_queue_idempotency'),
    deadLetter: getCollectionPath('ops_queue_dead_letter'),
    archive: getCollectionPath('queue_archive'),
  };
}

function queuePath(jobId) {
  return getRecordPath('ops_queue', jobId);
}

function deadLetterPath(jobId) {
  return getRecordPath('ops_queue_dead_letter', jobId);
}

function idempotencyPath(keyHash) {
  return getRecordPath('ops_queue_idempotency', keyHash);
}

function sanitizeError(error) {
  if (!error) return null;
  if (typeof error === 'string') return error.slice(0, 2000);
  if (error.message) return String(error.message).slice(0, 2000);
  try {
    return JSON.stringify(error).slice(0, 2000);
  } catch (_) {
    return String(error).slice(0, 2000);
  }
}

function payloadSizeBytes(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload || {}), 'utf-8');
  } catch (_) {
    return Infinity;
  }
}

export function generateJobId() {
  return 'q_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

export function safeIdempotencyHash(idempotencyKey) {
  return crypto
    .createHash('sha256')
    .update(String(idempotencyKey || ''))
    .digest('hex');
}

export function normalizePriority(priority) {
  const levels = config.OPS_QUEUE?.priorityLevels || ['low', 'normal', 'high', 'critical'];
  const p = levels.includes(priority) ? priority : 'normal';
  return {
    priority: p,
    priorityWeight: PRIORITY_WEIGHTS[p] || PRIORITY_WEIGHTS.normal,
  };
}

export function calculateNextRunAt(attempts, backoffMs) {
  const base = Number(backoffMs || config.OPS_QUEUE?.defaultBackoffMs || 30000);
  const max = Number(config.OPS_QUEUE?.maxBackoffMs || 30 * 60 * 1000);
  const safeAttempts = Math.max(1, Number(attempts) || 1);
  const delay = Math.min(max, base * Math.pow(2, safeAttempts - 1));
  return new Date(Date.now() + delay).toISOString();
}

export function isDue(job, at = Date.now()) {
  if (!job || job.status !== 'pending') return false;
  return parseMs(job.nextRunAt) <= at;
}

export function isLeaseExpired(job, at = Date.now()) {
  if (!job || job.status !== 'running') return false;

  const leaseUntilMs = parseMs(job.leaseUntil);
  if (leaseUntilMs > 0 && leaseUntilMs < at) return true;

  const staleMs = config.OPS_QUEUE?.staleRunningMs || (10 * 60 * 1000);
  const updatedMs = parseMs(job.updatedAt);
  return updatedMs > 0 && (at - updatedMs) > staleMs;
}

export function buildInitialJob(params = {}) {
  if (!params.type || typeof params.type !== 'string') {
    throw new Error('queue job type is required');
  }

  const payload = params.payload || {};
  const maxPayloadBytes = config.OPS_QUEUE?.maxPayloadBytes || (256 * 1024);
  const size = payloadSizeBytes(payload);
  if (size > maxPayloadBytes) {
    const err = new Error(`Queue job payload exceeds maxPayloadBytes (${size} > ${maxPayloadBytes})`);
    err.code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }

  const { priority, priorityWeight } = normalizePriority(params.priority);
  const now = nowIso();

  return {
    id: params.id || generateJobId(),
    type: params.type,
    status: 'pending',
    priority,
    priorityWeight,
    payload,
    idempotencyKey: params.idempotencyKey || null,
    attempts: 0,
    maxAttempts: Number(params.maxAttempts || config.OPS_QUEUE?.maxAttempts || 5),
    backoffMs: Number(params.backoffMs || config.OPS_QUEUE?.defaultBackoffMs || 30000),
    nextRunAt: params.nextRunAt || now,
    leaseUntil: null,
    lockedBy: null,
    lastError: null,
    result: null,
    cancelRequested: false,
    createdBy: params.createdBy || 'system',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    deadLetteredAt: null,
    cancelledAt: null,
  };
}

/**
 * Enqueue a durable queue job.
 */
export async function enqueueJob(params = {}) {
  if (!isEnabled()) {
    return { ok: false, disabled: true, error: 'OPS_QUEUE_DISABLED' };
  }

  const idempotencyKey = params.idempotencyKey || null;

  if (idempotencyKey) {
    const keyHash = safeIdempotencyHash(idempotencyKey);

    return withLock(`queue-idem:${keyHash}`, async () => {
      const existing = await readJSON(idempotencyPath(keyHash));
      if (existing && existing.expiresAt && parseMs(existing.expiresAt) > Date.now()) {
        const existingJob = await getJob(existing.jobId);
        if (
          existingJob &&
          ['pending', 'running', 'completed'].includes(existingJob.status)
        ) {
          return { ok: true, job: existingJob, deduped: true };
        }
      }

      const job = buildInitialJob(params);
      await writeQueueRecord(job);

      const ttlHours = config.OPS_QUEUE?.idempotencyTtlHours || 24;
      await atomicWrite(idempotencyPath(keyHash), {
        keyHash,
        idempotencyKey,
        jobId: job.id,
        createdAt: job.createdAt,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
      });

      eventBus.emit('ops_queue:job_enqueued', {
        jobId: job.id,
        type: job.type,
        priority: job.priority,
        timestamp: nowIso(),
      });

      return { ok: true, job, deduped: false };
    });
  }

  const job = buildInitialJob(params);
  await writeQueueRecord(job);

  eventBus.emit('ops_queue:job_enqueued', {
    jobId: job.id,
    type: job.type,
    priority: job.priority,
    timestamp: nowIso(),
  });

  return { ok: true, job, deduped: false };
}

/**
 * Read queue job from active queue or dead-letter dir.
 */
export async function getJob(jobId) {
  if (!jobId || typeof jobId !== 'string') return null;
  return await readQueueRecord(jobId);
}

/**
 * List queue jobs.
 */
export async function listJobs(options = {}) {
  if (!isEnabled()) {
    return { jobs: [], total: 0, limit: 20, offset: 0 };
  }

  const includeDeadLetter = options.deadLetter === true || options.status === 'dead-letter';

  let jobs = await listQueueRecords({
    ...options,
    deadLetter: includeDeadLetter,
    includeDeadLetter,
  });
  jobs = jobs.filter(j => j && j.id && j.id.startsWith('q_'));

  if (options.status) jobs = jobs.filter(j => j.status === options.status);
  if (options.type) jobs = jobs.filter(j => j.type === options.type);
  if (options.createdBy) jobs = jobs.filter(j => j.createdBy === options.createdBy);

  jobs.sort((a, b) =>
    (b.priorityWeight || 0) - (a.priorityWeight || 0) ||
    parseMs(b.createdAt) - parseMs(a.createdAt)
  );

  const total = jobs.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    jobs: jobs.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Claim due jobs using lease semantics.
 */
export async function claimNextJobs(options = {}) {
  if (!isEnabled()) return [];

  const workerId = options.workerId || `worker_${process.pid}`;
  const limit = Math.min(
    Math.max(1, Number(options.limit) || 1),
    config.OPS_QUEUE?.maxJobsPerScan || 10
  );

  await recoverStaleRunningJobs().catch(() => {});

  const all = await listQueueRecords({ status: 'pending', maxMonths: 2 });
  const due = all
    .filter(j => j && j.id && j.status === 'pending' && !j.cancelRequested && isDue(j))
    .sort((a, b) =>
      (b.priorityWeight || 0) - (a.priorityWeight || 0) ||
      parseMs(a.nextRunAt) - parseMs(b.nextRunAt) ||
      parseMs(a.createdAt) - parseMs(b.createdAt)
    );

  const claimed = [];
  const leaseMs = config.OPS_QUEUE?.leaseMs || (5 * 60 * 1000);

  for (const candidate of due) {
    if (claimed.length >= limit) break;

    const claimedJob = await withLock(`queue-job:${candidate.id}`, async () => {
      const fresh = await readQueueRecord(candidate.id);
      if (!fresh || fresh.status !== 'pending' || fresh.cancelRequested || !isDue(fresh)) return null;

      const now = nowIso();

      fresh.status = 'running';
      fresh.lockedBy = workerId;
      fresh.leaseUntil = new Date(Date.now() + leaseMs).toISOString();
      fresh.attempts = (fresh.attempts || 0) + 1;
      fresh.startedAt = fresh.startedAt || now;
      fresh.updatedAt = now;
      fresh.lastError = null;

      await writeQueueRecord(fresh);

      eventBus.emit('ops_queue:job_started', {
        jobId: fresh.id,
        type: fresh.type,
        attempts: fresh.attempts,
        lockedBy: workerId,
        timestamp: now,
      });

      return fresh;
    });

    if (claimedJob) claimed.push(claimedJob);
  }

  return claimed;
}

/**
 * Complete a running job.
 */
export async function completeJob(jobId, result = {}) {
  return withLock(`queue-job:${jobId}`, async () => {
    const job = await readQueueRecord(jobId);
    if (!job) return { ok: false, error: 'JOB_NOT_FOUND' };

    const now = nowIso();
    job.status = 'completed';
    job.result = result || {};
    job.leaseUntil = null;
    job.lockedBy = null;
    job.completedAt = now;
    job.updatedAt = now;
    job.lastError = null;

    await writeQueueRecord(job);

    eventBus.emit('ops_queue:job_completed', {
      jobId: job.id,
      type: job.type,
      timestamp: now,
    });

    return { ok: true, job };
  });
}

/**
 * Fail a job and schedule retry or move to DLQ.
 */
export async function failJob(jobId, error, options = {}) {
  return withLock(`queue-job:${jobId}`, async () => {
    const job = await readQueueRecord(jobId);
    if (!job) return { ok: false, error: 'JOB_NOT_FOUND' };

    const retryable = options.retryable !== false;
    const now = nowIso();

    job.lastError = sanitizeError(error);
    job.failedAt = now;
    job.updatedAt = now;
    job.leaseUntil = null;
    job.lockedBy = null;

    const exhausted = (job.attempts || 0) >= (job.maxAttempts || config.OPS_QUEUE?.maxAttempts || 5);

    if (!retryable || exhausted) {
      await writeQueueRecord(job);
      return await moveToDeadLetter(job.id, retryable ? 'MAX_ATTEMPTS_EXHAUSTED' : 'PERMANENT_FAILURE');
    }

    job.status = 'pending';
    job.nextRunAt = calculateNextRunAt(job.attempts, job.backoffMs);

    await writeQueueRecord(job);

    eventBus.emit('ops_queue:job_failed', {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      nextRunAt: job.nextRunAt,
      error: job.lastError,
      timestamp: now,
    });

    return { ok: true, job, retryScheduled: true };
  });
}

/**
 * Cancel a pending/running job.
 */
export async function cancelJob(jobId, reason = 'cancelled') {
  return withLock(`queue-job:${jobId}`, async () => {
    const job = await readQueueRecord(jobId);
    if (!job) return { ok: false, error: 'JOB_NOT_FOUND' };

    if (job.status === 'completed' || job.status === 'dead-letter') {
      return { ok: false, error: 'JOB_NOT_CANCELABLE', job };
    }

    const now = nowIso();
    job.status = 'cancelled';
    job.cancelRequested = true;
    job.cancelledAt = now;
    job.updatedAt = now;
    job.leaseUntil = null;
    job.lockedBy = null;
    job.lastError = reason || null;

    await writeQueueRecord(job);

    eventBus.emit('ops_queue:job_cancelled', {
      jobId: job.id,
      type: job.type,
      reason,
      timestamp: now,
    });

    return { ok: true, job };
  });
}

/**
 * Retry failed/cancelled/dead-letter job.
 */
export async function retryJob(jobId, options = {}) {
  return withLock(`queue-job:${jobId}`, async () => {
    let job = await readQueueRecord(jobId);
    let fromDeadLetter = job && job.status === 'dead-letter';

    if (!job) {
      job = await readJSON(deadLetterPath(jobId));
      fromDeadLetter = !!job;
    }

    if (!job) return { ok: false, error: 'JOB_NOT_FOUND' };

    const now = nowIso();
    const wasDeadLetter = fromDeadLetter || job.status === 'dead-letter';

    job.status = 'pending';
    job.cancelRequested = false;
    job.nextRunAt = options.nextRunAt || now;
    job.leaseUntil = null;
    job.lockedBy = null;
    job.updatedAt = now;
    job.failedAt = null;
    job.deadLetteredAt = null;
    job.cancelledAt = null;
    job.lastError = null;

    if (options.resetAttempts !== false) {
      job.attempts = 0;
    }

    await writeQueueRecord(job);

    if (wasDeadLetter) {
      await deleteJSON(deadLetterPath(job.id)).catch(() => {});
    }

    eventBus.emit('ops_queue:job_retried', {
      jobId: job.id,
      type: job.type,
      fromDeadLetter,
      timestamp: now,
    });

    return { ok: true, job };
  });
}

/**
 * Move exhausted/permanent-failure job to dead-letter queue.
 */
export async function moveToDeadLetter(jobId, reason = 'dead-letter') {
  const existing = await readQueueRecord(jobId);
  if (!existing) return { ok: false, error: 'JOB_NOT_FOUND' };

  const now = nowIso();
  const job = {
    ...existing,
    status: 'dead-letter',
    deadLetteredAt: now,
    updatedAt: now,
    leaseUntil: null,
    lockedBy: null,
    lastError: existing.lastError || reason,
  };

  await writeQueueRecord(job);

  // Legacy mirror for backward compatibility with older DLQ tooling.
  await atomicWrite(deadLetterPath(job.id), job).catch(() => {});

  eventBus.emit('ops_queue:job_dead_lettered', {
    jobId: job.id,
    type: job.type,
    reason,
    attempts: job.attempts || 0,
    timestamp: now,
  });

  return { ok: true, job, deadLettered: true };
}

/**
 * Recover stale running jobs after crash/restart.
 */
export async function recoverStaleRunningJobs() {
  if (!isEnabled()) return 0;

  const jobs = await listQueueRecords({ status: 'running', maxMonths: 2 });
  let recovered = 0;

  for (const job of jobs) {
    if (!job || job.status !== 'running') continue;
    if (!isLeaseExpired(job)) continue;

    await withLock(`queue-job:${job.id}`, async () => {
      const fresh = await readQueueRecord(job.id);
      if (!fresh || fresh.status !== 'running' || !isLeaseExpired(fresh)) return;

      if ((fresh.attempts || 0) >= (fresh.maxAttempts || config.OPS_QUEUE?.maxAttempts || 5)) {
        await moveToDeadLetter(fresh.id, 'STALE_RUNNING_EXHAUSTED');
      } else {
        fresh.status = 'pending';
        fresh.leaseUntil = null;
        fresh.lockedBy = null;
        fresh.nextRunAt = calculateNextRunAt(fresh.attempts || 1, fresh.backoffMs);
        fresh.lastError = 'Recovered stale running job';
        fresh.updatedAt = nowIso();
        await writeQueueRecord(fresh);

        eventBus.emit('ops_queue:job_recovered', {
          jobId: fresh.id,
          type: fresh.type,
          nextRunAt: fresh.nextRunAt,
          timestamp: nowIso(),
        });
      }

      recovered++;
    });
  }

  if (recovered > 0) {
    logger.warn('opsQueue: recovered stale running jobs', { recovered });
  }

  return recovered;
}

/**
 * Cleanup old queue records.
 */
export async function cleanupOldJobs() {
  if (!isEnabled()) return 0;

  const completedCutoff = Date.now() - (config.OPS_QUEUE?.cleanupCompletedAfterHours || 48) * 60 * 60 * 1000;
  const failedCutoff = Date.now() - (config.OPS_QUEUE?.cleanupFailedAfterDays || 14) * 24 * 60 * 60 * 1000;
  const dlqCutoff = Date.now() - (config.OPS_QUEUE?.deadLetterRetentionDays || 90) * 24 * 60 * 60 * 1000;

  let cleaned = 0;

  const activeJobs = await listQueueRecords({ includeDeadLetter: false, maxMonths: 120 });
  for (const job of activeJobs) {
    if (!job || !job.id) continue;

    const completedOld =
      (job.status === 'completed' || job.status === 'cancelled') &&
      parseMs(job.updatedAt) < completedCutoff;

    const failedOld =
      job.status === 'failed' &&
      parseMs(job.updatedAt) < failedCutoff;

    const activeDeadLetterOld =
      job.status === 'dead-letter' &&
      parseMs(job.deadLetteredAt || job.updatedAt) < dlqCutoff;

    if (completedOld || failedOld || activeDeadLetterOld) {
      await deleteQueueRecord(job).catch(() => {});
      cleaned++;
    }
  }

  const deadJobs = await listQueueRecords({ deadLetter: true, status: 'dead-letter', maxMonths: 120 });
  for (const job of deadJobs) {
    if (!job || !job.id) continue;
    if (parseMs(job.deadLetteredAt || job.updatedAt) < dlqCutoff) {
      await deleteQueueRecord(job).catch(() => {});
      await deleteJSON(deadLetterPath(job.id)).catch(() => {});
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Queue aggregate stats.
 */
export async function getQueueStats() {
  if (!isEnabled()) {
    return { enabled: false };
  }

  // Phase 55: prefer cheap summary/index stats.
  try {
    let summary = await readQueueSummary();

    // If summary has never been built/updated, rebuild once lazily.
    const hasAnyLocation = summary.locations && Object.keys(summary.locations).length > 0;
    const hasAnyCount = Object.values(summary.byStatus || {}).some(v => Number(v) > 0);

    if (!hasAnyLocation && !hasAnyCount) {
      summary = await rebuildQueueSummary();
    }

    if (!summary.stale) {
      const byStatus = {
        pending: summary.byStatus?.pending || 0,
        running: summary.byStatus?.running || 0,
        completed: summary.byStatus?.completed || 0,
        failed: summary.byStatus?.failed || 0,
        'dead-letter': summary.byStatus?.['dead-letter'] || 0,
        cancelled: summary.byStatus?.cancelled || 0,
      };

      const locationCount = Object.keys(summary.locations || {}).length;
      const statusTotal =
        byStatus.pending +
        byStatus.running +
        byStatus.completed +
        byStatus.failed +
        byStatus.cancelled +
        byStatus['dead-letter'];

      const mismatchSuspected = locationCount > 0 && statusTotal > locationCount * 2;

      return {
        enabled: true,
        byStatus,
        byType: summary.byType || {},
        totalActiveRecords:
          byStatus.pending +
          byStatus.running +
          byStatus.completed +
          byStatus.failed +
          byStatus.cancelled,
        deadLetter: byStatus['dead-letter'],
        summary: {
          lastRebuiltAt: summary.lastRebuiltAt || null,
          lastUpdatedAt: summary.lastUpdatedAt || null,
          stale: !!summary.stale || mismatchSuspected,
          staleReason: mismatchSuspected ? 'status_total_exceeds_location_count' : (summary.staleReason || null),
          mismatchSuspected,
          statusTotal,
          legacyRecords: summary.legacyRecords || 0,
          locationCount,
        },
        workerEnabled: !!config.OPS_QUEUE.workerEnabled,
        workerConcurrency: config.OPS_QUEUE.workerConcurrency,
        scanIntervalMs: config.OPS_QUEUE.scanIntervalMs,
      };
    }
  } catch (err) {
    logger.warn('opsQueue: summary stats failed, falling back to scan', { error: err.message });
  }

  // Safe fallback: full scan.
  const jobs = await listQueueRecords({ includeDeadLetter: false, maxMonths: 120 });
  const dead = await listQueueRecords({ deadLetter: true, status: 'dead-letter', maxMonths: 120 });

  const byStatus = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    'dead-letter': 0,
    cancelled: 0,
  };

  const byType = {};

  for (const job of jobs) {
    if (!job || !job.id) continue;
    if (byStatus[job.status] !== undefined) byStatus[job.status]++;
    byType[job.type] = (byType[job.type] || 0) + 1;
  }

  byStatus['dead-letter'] = dead.filter(j => j && j.id).length;

  return {
    enabled: true,
    byStatus,
    byType,
    totalActiveRecords: jobs.filter(j => j && j.id).length,
    deadLetter: byStatus['dead-letter'],
    summary: {
      stale: true,
      fallbackUsed: true,
    },
    workerEnabled: !!config.OPS_QUEUE.workerEnabled,
    workerConcurrency: config.OPS_QUEUE.workerConcurrency,
    scanIntervalMs: config.OPS_QUEUE.scanIntervalMs,
  };
}

export const _testHelpers = {
  generateJobId,
  safeIdempotencyHash,
  calculateNextRunAt,
  normalizePriority,
  isDue,
  isLeaseExpired,
  buildInitialJob,
  payloadSizeBytes,
  VALID_STATUSES,
};
