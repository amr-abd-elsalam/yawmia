// ═══════════════════════════════════════════════════════════════
// server/services/queueWorkers.js — Ops Queue Worker Loop (Phase 52)
// ═══════════════════════════════════════════════════════════════
// Bounded-concurrency durable queue worker.
// Built-in handlers:
//   - admin_alert_webhook
//   - admin_alert_email
//   - audit_csv_export
//   - predictive_scan
//   - counter_rebuild
//   - counter_compaction
//   - audit_index_rebuild
//   - backup_verify
//   - trust_snapshot_batch
//   - trust_calibration_report
//   - predictive_signal_retention
//   - workroom_search_rebuild
//   - privacy_user_data_export
//   - privacy_user_anonymization
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';
import { getInstanceId, canRunQueueWorkers, getInstanceInfo } from './instanceMode.js';
import {
  acquireProcessLock,
  releaseProcessLock,
  startLockHeartbeat,
  stopLockHeartbeat,
  getProcessLock,
} from './processLock.js';
import {
  claimNextJobs,
  completeJob,
  failJob,
  cancelJob,
  recoverStaleRunningJobs,
  cleanupOldJobs,
} from './opsQueue.js';
import {
  getDelivery,
  markRunning,
  recordAttempt,
  markDelivered,
  markFailed,
  markDeadLettered,
} from './alertDeliveryHistory.js';

const handlers = new Map();

let workerTimer = null;
let started = false;
let activeCount = 0;
let workerId = `queue_worker_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
let lastProcessAt = null;
let processedCount = 0;
let failedCount = 0;
let stoppedAt = null;
let queueWorkerLock = null;
let queueWorkerLockName = 'queue_worker';

function isEnabled() {
  return !!(config.OPS_QUEUE && config.OPS_QUEUE.enabled && config.OPS_QUEUE.workerEnabled);
}

export function registerJobHandler(type, handler) {
  if (!type || typeof handler !== 'function') {
    throw new Error('registerJobHandler requires type and handler');
  }
  handlers.set(type, handler);
}

function registerBuiltIns() {
  if (handlers.has('__builtins_registered__')) return;
  handlers.set('__builtins_registered__', async () => {});

  registerJobHandler('admin_alert_webhook', handleAdminAlertWebhookJob);
  registerJobHandler('admin_alert_email', handleAdminAlertEmailJob);
  registerJobHandler('audit_csv_export', handleAuditCsvExportJob);
  registerJobHandler('predictive_scan', handlePredictiveScanJob);
  registerJobHandler('counter_rebuild', handleCounterRebuildJob);
  registerJobHandler('counter_compaction', handleCounterCompactionJob);
  registerJobHandler('audit_index_rebuild', handleAuditIndexRebuildJob);
  registerJobHandler('backup_verify', handleBackupVerifyJob);
  registerJobHandler('backup_restore_drill', handleBackupRestoreDrillJob);
  registerJobHandler('ops_rollup_capture', handleOpsRollupCaptureJob);
  registerJobHandler('production_readiness_check', handleProductionReadinessCheckJob);

  // Phase 53 — Trust Calibration + Predictive Hygiene + Workroom Search
  registerJobHandler('trust_snapshot_batch', handleTrustSnapshotBatchJob);
  registerJobHandler('trust_calibration_report', handleTrustCalibrationReportJob);
  registerJobHandler('predictive_signal_retention', handlePredictiveSignalRetentionJob);
  registerJobHandler('workroom_search_rebuild', handleWorkroomSearchRebuildJob);

  // Phase 55 — File-Based Scale Hygiene
  registerJobHandler('queue_compaction', handleQueueCompactionJob);
  registerJobHandler('queue_verify', handleQueueVerifyJob);
  registerJobHandler('queue_repair', handleQueueRepairJob);
  registerJobHandler('workroom_hygiene_compaction', handleWorkroomHygieneCompactionJob);
  registerJobHandler('workroom_search_verify', handleWorkroomSearchVerifyJob);
  registerJobHandler('workroom_attachment_cleanup', handleWorkroomAttachmentCleanupJob);

  registerJobHandler('audit_token_compaction', handleAuditTokenCompactionJob);
  registerJobHandler('trust_snapshot_rollup', handleTrustSnapshotRollupJob);
  registerJobHandler('predictive_archive_index_rebuild', handlePredictiveArchiveIndexRebuildJob);
  registerJobHandler('scheduler_history_cleanup', handleSchedulerHistoryCleanupJob);

  // Phase 56 — Marketplace Intelligence + Product UX Maturity
  registerJobHandler('marketplace_intelligence_rollup', handleMarketplaceIntelligenceRollupJob);
  registerJobHandler('search_analytics_rollup', handleSearchAnalyticsRollupJob);
  registerJobHandler('payment_dispute_analytics_rollup', handlePaymentDisputeAnalyticsRollupJob);
  registerJobHandler('workroom_adoption_rollup', handleWorkroomAdoptionRollupJob);
  registerJobHandler('notification_conversion_rollup', handleNotificationConversionRollupJob);
  registerJobHandler('activation_funnel_rollup', handleActivationFunnelRollupJob);
  registerJobHandler('search_relevance_rebuild', handleSearchRelevanceRebuildJob);

  // Phase 58 — Privacy Governance
  registerJobHandler('privacy_user_data_export', handlePrivacyUserDataExportJob);
  registerJobHandler('privacy_user_anonymization', handlePrivacyUserAnonymizationJob);
}

export async function startQueueWorkers() {
  if (started) return;
  if (!isEnabled()) {
    logger.info('Ops queue workers: disabled via config');
    return;
  }

  if (!canRunQueueWorkers()) {
    logger.warn('Ops queue workers: refused to start by instance mode', {
      instance: getInstanceInfo(),
    });
    return;
  }

  const ownerId = getInstanceId();

  if (config.PROCESS_LOCKS && config.PROCESS_LOCKS.enabled) {
    const lockResult = await acquireProcessLock(queueWorkerLockName, {
      ownerId,
      metadata: {
        workerId,
        purpose: 'ops_queue_workers',
        concurrency: config.OPS_QUEUE.workerConcurrency,
      },
    });

    if (!lockResult.ok) {
      // Do NOT store lockResult.lock here: it belongs to another owner.
      // queueWorkerLock represents the lock held by THIS worker instance only.
      queueWorkerLock = null;
      logger.warn('Ops queue workers: lock not acquired — workers will not start', {
        lockName: queueWorkerLockName,
        ownerId,
        code: lockResult.code,
        currentOwnerId: lockResult.lock && lockResult.lock.ownerId,
      });
      return;
    }

    queueWorkerLock = lockResult.lock || null;
    startLockHeartbeat(queueWorkerLockName, ownerId);
  } else if (config.ENV && config.ENV.isProduction) {
    logger.warn('Ops queue workers: PROCESS_LOCKS disabled in production — unsafe multi-instance deployment');
  }

  registerBuiltIns();
  started = true;
  stoppedAt = null;

  recoverStaleRunningJobs().catch(err => {
    logger.warn('Ops queue workers: stale recovery failed', { error: err.message });
  });

  workerTimer = setInterval(() => {
    processDueJobs().catch(err => {
      logger.warn('Ops queue workers: processDueJobs failed', { error: err.message });
    });
  }, config.OPS_QUEUE.scanIntervalMs || 5000);

  if (workerTimer.unref) workerTimer.unref();

  logger.info('Ops queue workers: started', {
    workerId,
    ownerId,
    lockName: queueWorkerLockName,
    lockHeld: !!queueWorkerLock,
    concurrency: config.OPS_QUEUE.workerConcurrency,
    scanIntervalMs: config.OPS_QUEUE.scanIntervalMs,
  });
}

export async function stopQueueWorkers(options = {}) {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  started = false;
  stoppedAt = new Date().toISOString();

  const drainMs = Math.max(0, Number(options.drainMs) || 0);
  const deadline = Date.now() + drainMs;

  while (activeCount > 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const ownerId = getInstanceId();

  try {
    stopLockHeartbeat(queueWorkerLockName);
    if (queueWorkerLock && queueWorkerLock.ownerId === ownerId) {
      await releaseProcessLock(queueWorkerLockName, ownerId);
    }
  } catch (err) {
    logger.warn('Ops queue workers: process lock release failed', {
      lockName: queueWorkerLockName,
      ownerId,
      error: err.message,
    });
  } finally {
    queueWorkerLock = null;
  }

  logger.info('Ops queue workers: stopped', {
    activeCount,
    drainMs,
    lockName: queueWorkerLockName,
  });
}

export async function processDueJobs() {
  if (!isEnabled()) return { claimed: 0, activeCount };

  registerBuiltIns();
  lastProcessAt = new Date().toISOString();

  const concurrency = Math.max(1, config.OPS_QUEUE.workerConcurrency || 2);
  const availableSlots = Math.max(0, concurrency - activeCount);
  if (availableSlots <= 0) return { claimed: 0, activeCount };

  const claimed = await claimNextJobs({
    workerId,
    limit: Math.min(availableSlots, config.OPS_QUEUE.maxJobsPerScan || 10),
  });

  for (const job of claimed) {
    activeCount++;
    processOneJob(job)
      .catch(err => {
        logger.warn('Ops queue worker: unhandled processOneJob error', {
          jobId: job.id,
          error: err.message,
        });
      })
      .finally(() => {
        activeCount--;
      });
  }

  // Opportunistic cleanup, bounded by interval.
  cleanupOldJobs().catch(() => {});

  return { claimed: claimed.length, activeCount };
}

async function processOneJob(job) {
  if (!job || !job.id) return;

  if (job.cancelRequested) {
    await cancelJob(job.id, 'cancel requested before execution');
    return;
  }

  const handler = handlers.get(job.type);
  if (!handler) {
    failedCount++;
    await failJob(job.id, new Error(`No queue handler registered for type: ${job.type}`), { retryable: false });
    return;
  }

  try {
    const result = await handler({ job, payload: job.payload || {} });
    await completeJob(job.id, result || {});

    if (job.type === 'audit_csv_export' && job.payload?.exportId) {
      eventBus.emit('export:job_completed', {
        exportId: job.payload.exportId,
        queueJobId: job.id,
        result: result || {},
        timestamp: new Date().toISOString(),
      });
    }

    processedCount++;
  } catch (err) {
    failedCount++;

    const retryable = err && err.retryable === false ? false : true;
    const result = await failJob(job.id, err, { retryable });

    if (job.type === 'audit_csv_export' && job.payload?.exportId) {
      eventBus.emit('export:job_failed', {
        exportId: job.payload.exportId,
        queueJobId: job.id,
        error: err && err.message ? err.message : String(err),
        retryable,
        timestamp: new Date().toISOString(),
      });
    }

    // If alert delivery reached DLQ, mirror delivery status.
    if (result && result.deadLettered && job.type.startsWith('admin_alert_') && job.payload?.deliveryId) {
      await markDeadLettered(job.payload.deliveryId, err.message || 'queue job dead-lettered').catch(() => {});
    }
  }
}

export function getWorkerStats() {
  return {
    enabled: isEnabled(),
    started,
    workerId,
    activeCount,
    registeredHandlers: Array.from(handlers.keys()).filter(k => k !== '__builtins_registered__'),
    lastProcessAt,
    processedCount,
    failedCount,
    stoppedAt,
    concurrency: config.OPS_QUEUE?.workerConcurrency || 0,
    instance: getInstanceInfo(),
    lock: {
      enabled: !!(config.PROCESS_LOCKS && config.PROCESS_LOCKS.enabled),
      held: !!(queueWorkerLock && queueWorkerLock.ownerId === getInstanceId()),
      ownerId: queueWorkerLock ? queueWorkerLock.ownerId : null,
      lockName: queueWorkerLockName,
      heartbeatAt: queueWorkerLock ? queueWorkerLock.heartbeatAt : null,
      expiresAt: queueWorkerLock ? queueWorkerLock.expiresAt : null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Built-in handlers
// ═══════════════════════════════════════════════════════════════

async function handleAdminAlertWebhookJob({ job, payload }) {
  const deliveryId = payload.deliveryId;
  const delivery = await getDelivery(deliveryId);
  if (!delivery) {
    const err = new Error('Alert delivery record not found');
    err.retryable = false;
    throw err;
  }

  const startedAt = new Date().toISOString();

  await markRunning(deliveryId).catch(() => {});

  try {
    const { sendWebhook } = await import('./adminAlertChannels.js');
    const result = await sendWebhook(payload.payload || delivery.payload || {});

    await recordAttempt(deliveryId, {
      attempt: job.attempts || 1,
      startedAt,
      completedAt: new Date().toISOString(),
      ok: !!result.ok,
      statusCode: result.statusCode || null,
      error: result.ok ? null : result.error || 'Webhook failed',
      channel: 'webhook',
    });

    if (result.ok) {
      await markDelivered(deliveryId, result);
      return { delivered: true, channel: 'webhook', statusCode: result.statusCode || null };
    }

    await markFailed(deliveryId, result.error || 'Webhook failed');
    const err = new Error(result.error || 'Webhook failed');
    err.retryable = true;
    err.__attemptRecorded = true;
    throw err;
  } catch (err) {
    // recordAttempt is best-effort if sendWebhook threw before returning.
    // If result.ok=false path already recorded attempt, avoid duplicate attempt rows.
    if (!err.__attemptRecorded) {
      try {
        await recordAttempt(deliveryId, {
          attempt: job.attempts || 1,
          startedAt,
          completedAt: new Date().toISOString(),
          ok: false,
          error: err.message,
          channel: 'webhook',
        });
        await markFailed(deliveryId, err.message);
      } catch (_) {}
    }

    err.retryable = err.retryable !== false;
    throw err;
  }
}

async function handleAdminAlertEmailJob({ job, payload }) {
  const deliveryId = payload.deliveryId;
  const delivery = await getDelivery(deliveryId);
  if (!delivery) {
    const err = new Error('Alert delivery record not found');
    err.retryable = false;
    throw err;
  }

  const startedAt = new Date().toISOString();

  await markRunning(deliveryId).catch(() => {});

  try {
    const { sendEmail } = await import('./adminAlertChannels.js');
    const result = await sendEmail(payload.payload || delivery.payload || {});

    await recordAttempt(deliveryId, {
      attempt: job.attempts || 1,
      startedAt,
      completedAt: new Date().toISOString(),
      ok: !!result.ok,
      error: result.ok ? null : result.error || 'Email failed',
      channel: 'email',
    });

    if (result.ok) {
      await markDelivered(deliveryId, result);
      return { delivered: true, channel: 'email' };
    }

    await markFailed(deliveryId, result.error || 'Email failed');
    const err = new Error(result.error || 'Email failed');
    err.retryable = true;
    err.__attemptRecorded = true;
    throw err;
  } catch (err) {
    if (!err.__attemptRecorded) {
      try {
        await recordAttempt(deliveryId, {
          attempt: job.attempts || 1,
          startedAt,
          completedAt: new Date().toISOString(),
          ok: false,
          error: err.message,
          channel: 'email',
        });
        await markFailed(deliveryId, err.message);
      } catch (_) {}
    }

    err.retryable = err.retryable !== false;
    throw err;
  }
}

async function handleAuditCsvExportJob({ payload }) {
  const exportId = payload.exportId;
  if (!exportId) {
    const err = new Error('exportId is required');
    err.retryable = false;
    throw err;
  }

  const registry = await import('./exportRegistry.js');
  const auditSearch = await import('./auditLogSearch.js');
  const progress = await import('./csvExportProgress.js');

  const exp = await registry.getExport(exportId);
  if (!exp) {
    const err = new Error('Export record not found');
    err.retryable = false;
    throw err;
  }

  if (exp.status === 'cancelled' || exp.cancelRequested) {
    return { cancelled: true, exportId };
  }

  try {
    progress.startExport(exportId, exp.totalEstimate || 0);

    await registry.updateExportProgress(exportId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      rowsProcessed: exp.rowsProcessed || 0,
    });

    const filePath = registry.getExportCsvAbsolutePath(exportId);

    const stream = auditSearch.createCsvExportStream({
      ...(payload.filters || {}),
      exportId,
      persistFilePath: filePath,
    });

    for await (const _chunk of stream) {
      if (await registry.isCancellationRequested(exportId)) {
        return { cancelled: true, exportId };
      }
      // chunks are persisted by generator; no memory accumulation.
    }

    return { exportId, completed: true };
  } catch (err) {
    await registry.failExport(exportId, err.message || String(err)).catch(() => {});
    throw err;
  }
}

async function handlePredictiveScanJob({ payload }) {
  const { runPredictiveScan } = await import('./predictiveAbuse.js');
  const result = await runPredictiveScan({
    force: payload.force !== false,
    persist: payload.persist !== false,
  });
  return {
    signalCount: result.signalCount || 0,
    created: result.created || 0,
    updated: result.updated || 0,
    durationMs: result.durationMs || 0,
  };
}

async function handleCounterRebuildJob() {
  const { rebuildCounters } = await import('./directOfferCounters.js');
  return await rebuildCounters();
}

async function handleCounterCompactionJob({ payload }) {
  const { compactCounters } = await import('./counterCompaction.js');
  return await compactCounters(payload.options || {});
}

async function handleAuditIndexRebuildJob({ payload }) {
  const { rebuildAuditIndex } = await import('./auditLogIndex.js');
  return await rebuildAuditIndex(payload.options || {});
}

async function handleBackupVerifyJob() {
  return {
    skipped: true,
    reason: 'backup_verify handler is deprecated; use backup_restore_drill',
  };
}

async function handleBackupRestoreDrillJob({ payload }) {
  try {
    const { runBackupRestoreDrill } = await import('./backupRestoreDrill.js');
    return await runBackupRestoreDrill(payload.options || {});
  } catch (err) {
    // Until backupRestoreDrill.js is added in the next batch, fail as retryable.
    err.retryable = true;
    throw err;
  }
}

async function handleOpsRollupCaptureJob({ payload }) {
  try {
    const { captureOpsRollup } = await import('./metricsRollups.js');
    return await captureOpsRollup(payload.options || {});
  } catch (err) {
    // Until metricsRollups.js is added in the next batch, fail as retryable.
    err.retryable = true;
    throw err;
  }
}

async function handleProductionReadinessCheckJob() {
  const { getProductionReadiness } = await import('./productionReadiness.js');
  const result = await getProductionReadiness();

  return {
    status: result.status,
    summary: result.summary,
    generatedAt: result.generatedAt,
  };
}

// ═══════════════════════════════════════════════════════════════
// Phase 53 Built-in handlers
// ═══════════════════════════════════════════════════════════════

async function handleTrustSnapshotBatchJob({ payload }) {
  const { createSnapshotsForActiveUsers } = await import('./trustCalibration.js');

  const result = await createSnapshotsForActiveUsers({
    role: payload.role || undefined,
    limit: payload.limit ? parseInt(payload.limit) : undefined,
    force: payload.force === true,
    reason: payload.reason || 'queue_job',
  });

  if (!result || result.ok === false) {
    const err = new Error(result?.error || result?.code || 'TRUST_SNAPSHOT_BATCH_FAILED');
    err.retryable = result?.disabled ? false : true;
    throw err;
  }

  return {
    scanned: result.scanned || 0,
    created: result.created || 0,
    deduped: result.deduped || 0,
    failed: result.failed || 0,
    durationMs: result.durationMs || 0,
  };
}

async function handleTrustCalibrationReportJob({ payload }) {
  const { generateCalibrationReport } = await import('./trustCalibration.js');

  const result = await generateCalibrationReport({
    from: payload.from || undefined,
    to: payload.to || undefined,
    role: payload.role || undefined,
    outcomeWindowDays: payload.outcomeWindowDays ? parseInt(payload.outcomeWindowDays) : undefined,
    persist: payload.persist !== false,
  });

  if (!result || result.ok === false) {
    const err = new Error(result?.error || result?.code || 'TRUST_CALIBRATION_REPORT_FAILED');
    err.retryable = result?.disabled ? false : true;
    throw err;
  }

  return {
    reportId: result.report?.id || null,
    sampleCount: result.report?.sampleCount || 0,
    driftWarningCount: result.report?.driftWarnings?.length || 0,
    durationMs: result.report?.durationMs || 0,
  };
}

async function handlePredictiveSignalRetentionJob({ payload }) {
  const { runPredictiveSignalRetention } = await import('./predictiveSignalRetention.js');

  const result = await runPredictiveSignalRetention(payload.options || {});

  if (!result || result.ok === false) {
    const err = new Error(result?.error || result?.code || 'PREDICTIVE_SIGNAL_RETENTION_FAILED');
    err.retryable = result?.disabled ? false : true;
    throw err;
  }

  return {
    scanned: result.scanned || 0,
    archived: result.archived || 0,
    skipped: result.skipped || 0,
    failed: result.failed || 0,
    durationMs: result.durationMs || 0,
  };
}

async function handleWorkroomSearchRebuildJob({ payload }) {
  if (!payload || !payload.jobId) {
    const err = new Error('jobId is required');
    err.retryable = false;
    throw err;
  }

  const { rebuildWorkroomSearchIndex } = await import('./workroomSearch.js');
  const result = await rebuildWorkroomSearchIndex(payload.jobId);

  if (!result || result.rebuilt === false) {
    const err = new Error(result?.error || 'WORKROOM_SEARCH_REBUILD_FAILED');
    err.retryable = result?.skipped ? false : true;
    throw err;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Phase 55 Built-in handlers — Queue Scale Hygiene
// ═══════════════════════════════════════════════════════════════

async function handleQueueCompactionJob({ payload }) {
  const { compactQueue } = await import('./queueCompaction.js');
  const result = await compactQueue(payload.options || {});

  if (!result || result.ok === false) {
    const err = new Error(result?.error || result?.reason || 'QUEUE_COMPACTION_FAILED');
    err.retryable = result?.skipped ? false : true;
    throw err;
  }

  return {
    archive: result.archive || {},
    idempotency: result.idempotency || {},
    slowJobs: result.slowJobs || {},
    durationMs: result.durationMs || 0,
  };
}

async function handleQueueVerifyJob({ payload }) {
  const { verifyQueueHealth } = await import('./queueHealthVerify.js');
  const result = await verifyQueueHealth(payload.options || {});

  if (!result || result.ok === false) {
    const err = new Error((result?.errors || []).join('; ') || 'QUEUE_VERIFY_FAILED');
    err.retryable = false;
    throw err;
  }

  return {
    status: result.status,
    warningCount: (result.warnings || []).length,
    errorCount: (result.errors || []).length,
    durationMs: result.durationMs || 0,
  };
}

async function handleQueueRepairJob({ payload }) {
  const { repairQueueStorage } = await import('./queueHealthVerify.js');
  const result = await repairQueueStorage(payload.options || {});

  if (!result || result.ok === false) {
    const err = new Error((result?.after?.errors || result?.before?.errors || []).join('; ') || 'QUEUE_REPAIR_FAILED');
    err.retryable = false;
    throw err;
  }

  return {
    beforeStatus: result.before?.status || 'unknown',
    afterStatus: result.after?.status || 'unknown',
    summary: result.summary || {},
    durationMs: result.durationMs || 0,
  };
}

async function handleWorkroomHygieneCompactionJob({ payload }) {
  const { compactAllWorkrooms, compactWorkroom } = await import('./workroomHygiene.js');

  if (payload && payload.jobId) {
    return await compactWorkroom(payload.jobId, payload.options || {});
  }

  return await compactAllWorkrooms(payload.options || {});
}

async function handleWorkroomSearchVerifyJob({ payload }) {
  const { verifyAllWorkroomSearchIndexes, verifyWorkroomSearchIndex, repairWorkroomSearchIndex } = await import('./workroomIndexHealth.js');

  if (payload && payload.jobId && payload.repair) {
    return await repairWorkroomSearchIndex(payload.jobId);
  }

  if (payload && payload.jobId) {
    return await verifyWorkroomSearchIndex(payload.jobId, payload.options || {});
  }

  const result = await verifyAllWorkroomSearchIndexes(payload.options || {});

  if (!result || result.ok === false) {
    const err = new Error('WORKROOM_SEARCH_VERIFY_FAILED');
    err.retryable = false;
    throw err;
  }

  return result;
}

async function handleWorkroomAttachmentCleanupJob({ payload }) {
  const { cleanupOrphanAttachments } = await import('./workroomHygiene.js');
  return await cleanupOrphanAttachments(payload.options || {});
}

async function handleAuditTokenCompactionJob({ payload }) {
  const { compactAuditTokenIndex } = await import('./auditLogIndex.js');
  return await compactAuditTokenIndex(payload.options || {});
}

async function handleTrustSnapshotRollupJob({ payload }) {
  const { runTrustRetention, createTrustSnapshotRollup } = await import('./trustSnapshotRollups.js');

  if (payload && payload.rollupOnly) {
    return await createTrustSnapshotRollup(payload.options || {});
  }

  return await runTrustRetention(payload.options || {});
}

async function handlePredictiveArchiveIndexRebuildJob({ payload }) {
  const { rebuildPredictiveArchiveIndex } = await import('./predictiveArchiveIndex.js');
  return await rebuildPredictiveArchiveIndex(payload.options || {});
}

async function handleSchedulerHistoryCleanupJob({ payload }) {
  const { cleanupSchedulerHistory } = await import('./schedulerRunHistory.js');
  return await cleanupSchedulerHistory(payload.options || {});
}

// ═══════════════════════════════════════════════════════════════
// Phase 56 Built-in handlers — Marketplace/Product Intelligence
// ═══════════════════════════════════════════════════════════════

async function handleMarketplaceIntelligenceRollupJob({ payload }) {
  const { captureMarketplaceIntelligenceRollup } = await import('./marketplaceIntelligenceRollups.js');

  const result = await captureMarketplaceIntelligenceRollup(payload.options || {});

  if (!result || result.skipped) {
    return result || { skipped: true };
  }

  return {
    rollupId: result.id || null,
    day: result.day || null,
    warningCount: result.health?.warningCount || 0,
    durationMs: result.durationMs || 0,
  };
}

async function handleSearchAnalyticsRollupJob({ payload }) {
  const { rollupSearchAnalytics } = await import('./searchAnalytics.js');

  const result = await rollupSearchAnalytics(payload.options || {});

  if (!result || result.skipped) {
    return result || { skipped: true };
  }

  return {
    month: result.month || null,
    totals: result.totals || {},
    topQueryCount: Array.isArray(result.topQueries) ? result.topQueries.length : 0,
  };
}

async function handlePaymentDisputeAnalyticsRollupJob({ payload }) {
  const { rollupPaymentDisputeAnalytics } = await import('./paymentDisputeAnalytics.js');

  const result = await rollupPaymentDisputeAnalytics(payload.options || {});

  if (!result || result.skipped) {
    return result || { skipped: true };
  }

  return {
    disputes: result.analytics?.totals?.disputes || 0,
    disputeRate: result.analytics?.totals?.disputeRate || 0,
    trendDays: Array.isArray(result.trend) ? result.trend.length : 0,
  };
}

async function handleWorkroomAdoptionRollupJob({ payload }) {
  const { rollupWorkroomAdoption } = await import('./workroomAdoptionMetrics.js');

  const result = await rollupWorkroomAdoption(payload.options || {});

  if (!result || result.skipped) {
    return result || { skipped: true };
  }

  return {
    month: result.month || null,
    totals: result.totals || {},
    rates: result.rates || {},
  };
}

async function handleNotificationConversionRollupJob({ payload }) {
  const { rollupNotificationConversions } = await import('./notificationConversionMetrics.js');

  const result = await rollupNotificationConversions(payload.options || {});

  if (!result || result.skipped) {
    return result || { skipped: true };
  }

  return {
    month: result.month || null,
    totals: result.totals || {},
    rowCount: Array.isArray(result.rows) ? result.rows.length : 0,
  };
}

async function handleActivationFunnelRollupJob({ payload }) {
  const { rollupActivationFunnel } = await import('./activationFunnelMetrics.js');

  const result = await rollupActivationFunnel(payload.options || {});

  if (!result || result.skipped) {
    return result || { skipped: true };
  }

  return {
    month: result.month || null,
    totals: result.totals || {},
    rates: result.rates || {},
  };
}

async function handleSearchRelevanceRebuildJob({ payload }) {
  const result = {
    searchIndex: { rebuilt: false, count: 0 },
    queryIndex: { rebuilt: false, count: 0 },
  };

  try {
    const searchIndex = await import('./searchIndex.js');
    const count = await searchIndex.buildIndex();
    result.searchIndex = { rebuilt: true, count };
  } catch (err) {
    result.searchIndex = { rebuilt: false, error: err.message };
  }

  try {
    const queryIndex = await import('./queryIndex.js');
    const count = await queryIndex.buildAllIndexes();
    result.queryIndex = { rebuilt: true, count };
  } catch (err) {
    result.queryIndex = { rebuilt: false, error: err.message };
  }

  if (!result.searchIndex.rebuilt && !result.queryIndex.rebuilt) {
    const err = new Error('SEARCH_RELEVANCE_REBUILD_FAILED');
    err.retryable = true;
    throw err;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Phase 58 Built-in handlers — Privacy Governance
// ═══════════════════════════════════════════════════════════════

async function handlePrivacyUserDataExportJob({ payload }) {
  if (!payload || !payload.requestId || !payload.userId) {
    const err = new Error('requestId and userId are required');
    err.retryable = false;
    throw err;
  }

  const privacy = await import('./privacyRequests.js');
  const exporter = await import('./userDataExport.js');

  try {
    const result = await exporter.persistUserDataExport(
      payload.requestId,
      payload.userId,
      payload.options || {}
    );

    if (!result || !result.ok) {
      const err = new Error(result?.error || result?.code || 'PRIVACY_EXPORT_FAILED');
      err.retryable = false;
      throw err;
    }

    await privacy.completePrivacyRequest(payload.requestId, {
      exportFilePath: result.relativePath,
      result: {
        userId: payload.userId,
        filePath: result.relativePath,
        generatedAt: result.export?.generatedAt || new Date().toISOString(),
      },
    });

    return {
      requestId: payload.requestId,
      userId: payload.userId,
      exportFilePath: result.relativePath,
      completed: true,
    };
  } catch (err) {
    await privacy.failPrivacyRequest(payload.requestId, err.message || String(err)).catch(() => {});
    err.retryable = err.retryable !== false;
    throw err;
  }
}

async function handlePrivacyUserAnonymizationJob({ payload }) {
  if (!payload || !payload.requestId || !payload.userId) {
    const err = new Error('requestId and userId are required');
    err.retryable = false;
    throw err;
  }

  const privacy = await import('./privacyRequests.js');

  try {
    if (payload.approvalId) {
      const approvals = await import('./adminApprovals.js');
      const consumed = await approvals.consumeApproval(
        payload.approvalId,
        'privacy_anonymize',
        payload.userId
      );

      if (!consumed.ok) {
        const err = new Error(consumed.error || consumed.code || 'APPROVAL_CONSUME_FAILED');
        err.retryable = false;
        throw err;
      }
    }

    const anonymizer = await import('./userAnonymization.js');

    const result = await anonymizer.anonymizeUserData(payload.userId, {
      ...(payload.options || {}),
      dryRun: false,
      preview: false,
    });

    if (!result || !result.ok) {
      const err = new Error(result?.error || result?.code || 'PRIVACY_ANONYMIZATION_FAILED');
      err.retryable = false;
      throw err;
    }

    await privacy.completePrivacyRequest(payload.requestId, {
      result: {
        userId: payload.userId,
        anonId: result.anonId || null,
        counts: result.counts || {},
        anonymizationResult: result.result || {},
        durationMs: result.durationMs || 0,
      },
    });

    return {
      requestId: payload.requestId,
      userId: payload.userId,
      anonId: result.anonId || null,
      completed: true,
      idempotent: !!result.idempotent,
    };
  } catch (err) {
    await privacy.failPrivacyRequest(payload.requestId, err.message || String(err)).catch(() => {});
    err.retryable = err.retryable !== false;
    throw err;
  }
}

export const _testHelpers = {
  handlers,
  processOneJob,
  registerBuiltIns,
  setWorkerId: (id) => { workerId = id; },
  getQueueWorkerLock: () => queueWorkerLock,
  setQueueWorkerLockName: (name) => { queueWorkerLockName = name; },
  resetQueueWorkerLockState: () => {
    if (workerTimer) {
      clearInterval(workerTimer);
      workerTimer = null;
    }
    started = false;
    activeCount = 0;
    stopLockHeartbeat(queueWorkerLockName);
    queueWorkerLock = null;
    queueWorkerLockName = 'queue_worker';
  },
};
