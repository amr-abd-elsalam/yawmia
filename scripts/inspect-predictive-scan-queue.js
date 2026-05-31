#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/inspect-predictive-scan-queue.js
// Phase 61.5 — Predictive Scan Queue Flood Inspector
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Read-only diagnostics for predictive_scan queue pressure/flood review.
//
// Safety:
//   - Read-only.
//   - Does not import worker runtime modules.
//   - Does not execute queue processing loops.
//   - Does not claim, retry, cancel, complete, fail, recover, move, or write jobs.
//   - Does not mutate queue records.
//   - Does not rebuild queue summary.
//   - Does not compact queue.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function ageBucket(iso) {
  const ms = parseMs(iso);
  if (!ms) return 'unknown';

  const ageMs = Date.now() - ms;
  if (ageMs < 60 * 60 * 1000) return '<1h';
  if (ageMs < 6 * 60 * 60 * 1000) return '1-6h';
  if (ageMs < 24 * 60 * 60 * 1000) return '6-24h';
  if (ageMs < 3 * 24 * 60 * 60 * 1000) return '1-3d';
  if (ageMs < 7 * 24 * 60 * 60 * 1000) return '3-7d';
  return '>7d';
}

function initStatusCounts() {
  return {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    'dead-letter': 0,
  };
}

function initAttemptBuckets() {
  return {
    '0': 0,
    '1': 0,
    '2': 0,
    '3': 0,
    '4_plus': 0,
    maxed: 0,
  };
}

function initAgeBuckets() {
  return {
    '<1h': 0,
    '1-6h': 0,
    '6-24h': 0,
    '1-3d': 0,
    '3-7d': 0,
    '>7d': 0,
    unknown: 0,
  };
}

function addAttemptBucket(buckets, job) {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.maxAttempts || 5);

  if (attempts >= maxAttempts) {
    buckets.maxed++;
  } else if (attempts >= 4) {
    buckets['4_plus']++;
  } else {
    buckets[String(attempts)] = (buckets[String(attempts)] || 0) + 1;
  }
}

function addAgeBucket(buckets, job) {
  const basis = job.updatedAt || job.createdAt || job.nextRunAt;
  const bucket = ageBucket(basis);
  buckets[bucket] = (buckets[bucket] || 0) + 1;
}

function safeSampleJob(job) {
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts || 0,
    maxAttempts: job.maxAttempts || 0,
    lockedBy: job.lockedBy || null,
    leaseUntil: job.leaseUntil || null,
    nextRunAt: job.nextRunAt || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    lastError: job.lastError ? String(job.lastError).slice(0, 300) : null,
  };
}

async function main() {
  const started = Date.now();

  const { default: config } = await import('../config.js');
  const { initDatabase, getCollectionPath, listJSON } = await import('../server/services/database.js');
  const { listQueueRecords } = await import('../server/services/queueStorageIndex.js');
  const { isLeaseExpired } = await import('../server/services/opsQueue.js');

  await initDatabase();

  const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled', 'dead-letter'];
  const byStatus = initStatusCounts();
  const attemptBuckets = initAttemptBuckets();
  const ageBuckets = initAgeBuckets();
  const staleRunning = [];
  const nonStaleRunning = [];
  const samplesByStatus = {};
  const totalByStatus = {};

  for (const status of statuses) {
    const rows = await listQueueRecords({
      status,
      deadLetter: status === 'dead-letter',
      includeDeadLetter: status === 'dead-letter',
      maxMonths: 120,
    });

    const predictive = rows.filter(job => job && job.type === 'predictive_scan');

    byStatus[status] = predictive.length;
    totalByStatus[status] = rows.filter(job => job && job.id).length;
    samplesByStatus[status] = predictive.slice(0, 10).map(safeSampleJob);

    for (const job of predictive) {
      addAttemptBucket(attemptBuckets, job);
      addAgeBucket(ageBuckets, job);

      if (status === 'running') {
        if (isLeaseExpired(job)) staleRunning.push(job);
        else nonStaleRunning.push(job);
      }
    }
  }

  let idempotency = {
    totalPredictiveScanKeys: 0,
    expiredPredictiveScanKeys: 0,
    activePredictiveScanKeys: 0,
    sample: [],
    readError: null,
  };

  try {
    const idemDir = getCollectionPath('ops_queue_idempotency');
    const rows = await listJSON(idemDir, { tolerateCorrupt: true });
    const now = Date.now();

    const predictiveRows = rows.filter(row =>
      row &&
      typeof row.idempotencyKey === 'string' &&
      row.idempotencyKey.includes('predictive_scan')
    );

    idempotency.totalPredictiveScanKeys = predictiveRows.length;

    for (const row of predictiveRows) {
      const expiresMs = parseMs(row.expiresAt);
      if (expiresMs > 0 && expiresMs <= now) idempotency.expiredPredictiveScanKeys++;
      else idempotency.activePredictiveScanKeys++;
    }

    idempotency.sample = predictiveRows.slice(0, 20).map(row => ({
      keyHash: row.keyHash || null,
      idempotencyKey: row.idempotencyKey || null,
      jobId: row.jobId || null,
      createdAt: row.createdAt || null,
      expiresAt: row.expiresAt || null,
      expired: row.expiresAt ? parseMs(row.expiresAt) <= now : false,
    }));
  } catch (err) {
    idempotency.readError = err.message;
  }

  let scheduler = null;
  try {
    const { getSchedulerJob } = await import('../server/services/schedulerRegistry.js');
    scheduler = await getSchedulerJob('predictive_scan');
  } catch (err) {
    scheduler = {
      error: err.message,
    };
  }

  const configState = {
    opsQueueEnabled: !!(config.OPS_QUEUE && config.OPS_QUEUE.enabled),
    opsQueueWorkerEnabled: !!(config.OPS_QUEUE && config.OPS_QUEUE.workerEnabled),
    predictiveAbuseEnabled: !!(config.PREDICTIVE_ABUSE && config.PREDICTIVE_ABUSE.enabled),
    predictiveAbuseScheduledScanEnabled: !!(config.PREDICTIVE_ABUSE && config.PREDICTIVE_ABUSE.scheduledScanEnabled),
    predictiveAbuseScanIntervalMs: config.PREDICTIVE_ABUSE?.scanIntervalMs || null,
    schedulerRegistryEnabled: !!(config.SCHEDULER_REGISTRY && config.SCHEDULER_REGISTRY.enabled),
    schedulerPredictiveScanEnabled: config.SCHEDULER_REGISTRY?.jobs?.predictive_scan?.enabled !== false,
  };

  const dualSchedulingRisk = !!(
    configState.predictiveAbuseScheduledScanEnabled &&
    configState.schedulerRegistryEnabled &&
    configState.schedulerPredictiveScanEnabled
  );

  const warnings = [];

  if (byStatus.running > 0) {
    warnings.push('predictive_scan jobs exist in running; verify stale/non-stale state before recovery');
  }

  if (staleRunning.length > 0) {
    warnings.push('stale predictive_scan running jobs detected; do not move back to pending blindly');
  }

  if (idempotency.expiredPredictiveScanKeys > 0) {
    warnings.push('expired predictive_scan idempotency keys detected; compaction may be useful after review');
  }

  if (dualSchedulingRisk) {
    warnings.push('predictive_scan appears scheduled by both legacy server timer and scheduler registry; review duplicate enqueue risk');
  }

  const result = {
    ok: true,
    readOnly: true,
    mutationPerformed: false,
    type: 'predictive_scan',
    byStatus,
    totalQueueRecordsByStatus: totalByStatus,
    totalPredictiveScanJobs:
      byStatus.pending +
      byStatus.running +
      byStatus.completed +
      byStatus.failed +
      byStatus.cancelled +
      byStatus['dead-letter'],
    staleRunningCount: staleRunning.length,
    nonStaleRunningCount: nonStaleRunning.length,
    attemptBuckets,
    ageBuckets,
    idempotency,
    scheduler,
    config: configState,
    dualSchedulingRisk,
    samplesByStatus,
    staleRunningSample: staleRunning.slice(0, 10).map(safeSampleJob),
    nonStaleRunningSample: nonStaleRunning.slice(0, 10).map(safeSampleJob),
    warnings,
    recommendedNextSteps: [
      'keep PM2/Yawmia stopped while reviewing queue remediation',
      'do not requeue stale predictive_scan jobs blindly',
      'repair queue summary/location index only after approval if dry-run scope is summary-only',
      'review whether legacy predictive scan timer should be paused or deduped against scheduler registry',
      'review expired predictive_scan idempotency keys after summary repair decision',
    ],
    forbiddenCommands: [
      'node scripts/queue-drain.js --confirm --json',
      'node scripts/recover-stale-running-jobs.js --confirm --json',
      'node scripts/compact-queue.js --confirm --json',
      'node scripts/repair-queue.js --confirm --json without approval',
    ],
    durationMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n🧠 Predictive Scan Queue Flood Inspector — Read Only\n');
  console.log(`totalPredictiveScanJobs: ${result.totalPredictiveScanJobs}`);
  console.log(`pending: ${byStatus.pending}`);
  console.log(`running: ${byStatus.running}`);
  console.log(`staleRunning: ${result.staleRunningCount}`);
  console.log(`expired predictive idempotency keys: ${idempotency.expiredPredictiveScanKeys}`);
  console.log(`dualSchedulingRisk: ${dualSchedulingRisk ? 'yes' : 'no'}`);

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(`  ⚠️ ${warning}`);
  }

  console.log('\nNo mutation performed.\n');
}

main().catch(err => {
  const failure = {
    ok: false,
    readOnly: true,
    mutationPerformed: false,
    error: err.message,
    stack: err.stack,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(failure, null, 2));
  } else {
    console.error('\n❌ Predictive scan queue inspection failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
