// ═══════════════════════════════════════════════════════════════
// server/services/queueHealthVerify.js — Queue Verify/Repair (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Verifies queue storage consistency across segmented + legacy layouts.
// Repair is intentionally conservative: summary rebuild + stale recovery hints.
// ═══════════════════════════════════════════════════════════════

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import {
  readJSON,
  getCollectionPath,
  walkCollectionFiles,
} from './database.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';
import {
  listQueueRecords,
  readQueueSummary,
  rebuildQueueSummary,
  markQueueSummaryStale,
  _testHelpers as storageHelpers,
} from './queueStorageIndex.js';
import { isLeaseExpired } from './opsQueue.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

function nowIso() {
  return new Date().toISOString();
}

function expectedStatusFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  const segments = filePath.split(/[\\/]+/);

  if (segments.includes('pending')) return 'pending';
  if (segments.includes('running')) return 'running';
  if (segments.includes('completed')) return 'completed';
  if (segments.includes('failed')) return 'failed';
  if (segments.includes('cancelled')) return 'cancelled';
  if (segments.includes('dead-letter')) return 'dead-letter';

  return null;
}

function isQueueRecord(row) {
  return row && row.id && String(row.id).startsWith('q_');
}

async function listSegmentFiles(collectionName) {
  try {
    const root = getCollectionPath(collectionName);
    return await walkCollectionFiles(root, 'q_');
  } catch (_) {
    return [];
  }
}

async function listAllQueueFiles() {
  const collections = [
    'queue_pending',
    'queue_running',
    'queue_completed',
    'queue_failed',
    'queue_cancelled',
    'ops_queue',
    'ops_queue_dead_letter',
  ];

  const files = [];
  for (const col of collections) {
    try {
      files.push(...await listSegmentFiles(col));
    } catch (_) {}
  }

  return files;
}

/**
 * Rebuild queue summary index from actual queue files.
 */
export async function rebuildQueueSummaryIndex(options = {}) {
  const result = await rebuildQueueSummary();

  eventBus.emit('queue:summary_rebuilt', {
    statusCounts: result.byStatus || {},
    legacyRecords: result.legacyRecords || 0,
    timestamp: result.lastRebuiltAt || nowIso(),
  });

  return {
    ok: true,
    summary: {
      byStatus: result.byStatus || {},
      byType: result.byType || {},
      legacyRecords: result.legacyRecords || 0,
      locationCount: Object.keys(result.locations || {}).length,
      lastRebuiltAt: result.lastRebuiltAt || null,
    },
  };
}

/**
 * Verify queue storage health.
 *
 * @param {{ fullScan?: boolean, sampleSize?: number }} options
 */
export async function verifyQueueHealth(options = {}) {
  const started = Date.now();
  const warnings = [];
  const errors = [];
  const details = {
    parsedRecords: 0,
    statusDirMismatches: [],
    staleRunningJobs: [],
    orphanIdempotency: [],
    expiredIdempotency: [],
    summaryMismatches: [],
    legacyRecords: 0,
  };

  // 1. Parse queue files + status-dir consistency.
  const files = await listAllQueueFiles();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    let record = null;
    try {
      record = await readJSON(file.filePath);
    } catch (err) {
      errors.push(`corrupt queue record: ${file.filePath}: ${err.message}`);
      continue;
    }

    if (!isQueueRecord(record)) continue;

    details.parsedRecords++;

    const expected = expectedStatusFromPath(file.filePath);
    if (expected && expected !== record.status) {
      details.statusDirMismatches.push({
        jobId: record.id,
        path: file.filePath.replace(BASE_PATH + '/', ''),
        expectedStatus: expected,
        actualStatus: record.status,
      });
    }

    if (!expected) {
      details.legacyRecords++;
    }

    if (record.status === 'running' && isLeaseExpired(record)) {
      details.staleRunningJobs.push({
        jobId: record.id,
        lockedBy: record.lockedBy || null,
        leaseUntil: record.leaseUntil || null,
        updatedAt: record.updatedAt || null,
      });
    }

    if ((i + 1) % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  if (details.statusDirMismatches.length > 0) {
    warnings.push(`status-dir mismatches: ${details.statusDirMismatches.length}`);
  }

  if (details.staleRunningJobs.length > 0) {
    warnings.push(`stale running jobs: ${details.staleRunningJobs.length}`);
  }

  if (details.legacyRecords > 0) {
    warnings.push(`legacy flat queue records detected: ${details.legacyRecords}`);
  }

  // 2. Idempotency records.
  try {
    const idemDir = getCollectionPath('ops_queue_idempotency');
    const idemRecords = await import('./database.js').then(db => db.listJSON(idemDir));
    const now = Date.now();

    for (const rec of idemRecords) {
      if (!rec || !rec.jobId) continue;

      const job = await import('./opsQueue.js').then(q => q.getJob(rec.jobId)).catch(() => null);
      if (!job && (!rec.expiresAt || new Date(rec.expiresAt).getTime() > now)) {
        details.orphanIdempotency.push({
          keyHash: rec.keyHash || null,
          jobId: rec.jobId,
        });
      }

      if (rec.expiresAt && new Date(rec.expiresAt).getTime() <= now) {
        details.expiredIdempotency.push({
          keyHash: rec.keyHash || null,
          jobId: rec.jobId,
          expiresAt: rec.expiresAt,
        });
      }
    }

    if (details.orphanIdempotency.length > 0) {
      warnings.push(`orphan idempotency records: ${details.orphanIdempotency.length}`);
    }

    if (details.expiredIdempotency.length > 0) {
      warnings.push(`expired idempotency records: ${details.expiredIdempotency.length}`);
    }
  } catch (err) {
    warnings.push(`idempotency verification failed: ${err.message}`);
  }

  // 3. Summary consistency.
  try {
    const summary = await readQueueSummary();

    const scanRows = await listQueueRecords({ includeDeadLetter: true, maxMonths: 120 });
    const counts = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      'dead-letter': 0,
    };

    for (const job of scanRows) {
      if (counts[job.status] !== undefined) counts[job.status]++;
    }

    for (const [status, count] of Object.entries(counts)) {
      const summaryCount = summary.byStatus?.[status] || 0;
      if (summaryCount !== count) {
        details.summaryMismatches.push({
          status,
          summaryCount,
          scanCount: count,
        });
      }
    }

    if (details.summaryMismatches.length > 0) {
      warnings.push(`summary mismatches: ${details.summaryMismatches.length}`);
      await markQueueSummaryStale('verify_summary_mismatch').catch(() => {});
    }
  } catch (err) {
    warnings.push(`summary verification failed: ${err.message}`);
    await markQueueSummaryStale('verify_summary_failed').catch(() => {});
  }

  const result = {
    ok: errors.length === 0,
    status: errors.length > 0 ? 'failed' : (warnings.length > 0 ? 'warnings' : 'healthy'),
    warnings,
    errors,
    details: {
      parsedRecords: details.parsedRecords,
      legacyRecords: details.legacyRecords,
      statusDirMismatches: details.statusDirMismatches.slice(0, 50),
      staleRunningJobs: details.staleRunningJobs.slice(0, 50),
      orphanIdempotency: details.orphanIdempotency.slice(0, 50),
      expiredIdempotency: details.expiredIdempotency.slice(0, 50),
      summaryMismatches: details.summaryMismatches,
    },
    durationMs: Date.now() - started,
    checkedAt: nowIso(),
  };

  eventBus.emit('queue:health_verified', {
    status: result.status,
    warningCount: warnings.length,
    errorCount: errors.length,
    timestamp: result.checkedAt,
  });

  return result;
}

/**
 * Conservative repair:
 * - rebuild summary/location index
 * - reports stale running jobs, but does not mutate them here
 * - idempotency cleanup is handled by queueCompaction
 *
 * Phase 61.1:
 * - dryRun=true performs verification and returns deterministic repair plan only.
 * - no summary write occurs in dry-run.
 */
export async function repairQueueStorage(options = {}) {
  const started = Date.now();
  const dryRun = !!options.dryRun;

  const before = await verifyQueueHealth({ fullScan: true }).catch(err => ({
    ok: false,
    status: 'failed',
    warnings: [],
    errors: [err.message],
    details: {},
  }));

  const repairPlan = {
    dryRun,
    actions: [],
    risks: [],
  };

  const beforeDetails = before.details || {};

  if (Array.isArray(beforeDetails.summaryMismatches) && beforeDetails.summaryMismatches.length > 0) {
    repairPlan.actions.push({
      type: 'rebuild_queue_summary',
      reason: 'summary counts differ from scanned queue files',
      mismatches: beforeDetails.summaryMismatches,
    });
  }

  if (Array.isArray(beforeDetails.statusDirMismatches) && beforeDetails.statusDirMismatches.length > 0) {
    repairPlan.actions.push({
      type: 'report_status_dir_mismatches',
      reason: 'records are stored under a status dir that differs from record.status',
      count: beforeDetails.statusDirMismatches.length,
    });
    repairPlan.risks.push('status-dir mismatches are reported only; no blind move is performed by repairQueueStorage');
  }

  if (Array.isArray(beforeDetails.staleRunningJobs) && beforeDetails.staleRunningJobs.length > 0) {
    repairPlan.actions.push({
      type: 'report_stale_running_jobs',
      reason: 'running jobs have expired leases or stale updatedAt',
      count: beforeDetails.staleRunningJobs.length,
    });
    repairPlan.risks.push('stale running jobs are not mutated here; use queue drain/recovery workflow after review');
  }

  if ((beforeDetails.legacyRecords || 0) > 0) {
    repairPlan.actions.push({
      type: 'preserve_legacy_records_in_summary',
      reason: 'legacy flat queue records are still readable and must remain represented',
      count: beforeDetails.legacyRecords,
    });
  }

  if (repairPlan.actions.length === 0) {
    repairPlan.actions.push({
      type: 'no_summary_repair_needed',
      reason: 'verification did not find summary mismatch requiring rebuild',
    });
  }

  if (dryRun) {
    return {
      ok: before.ok,
      dryRun: true,
      mutationPerformed: false,
      before: {
        status: before.status,
        warnings: before.warnings || [],
        errors: before.errors || [],
      },
      after: null,
      summary: null,
      repairPlan,
      durationMs: Date.now() - started,
      checkedAt: nowIso(),
    };
  }

  const summaryResult = await rebuildQueueSummaryIndex(options);

  const after = await verifyQueueHealth({ fullScan: true }).catch(err => ({
    ok: false,
    status: 'failed',
    warnings: [],
    errors: [err.message],
  }));

  const result = {
    ok: after.ok,
    dryRun: false,
    mutationPerformed: true,
    before: {
      status: before.status,
      warnings: before.warnings || [],
      errors: before.errors || [],
    },
    after: {
      status: after.status,
      warnings: after.warnings || [],
      errors: after.errors || [],
    },
    summary: summaryResult.summary,
    repairPlan,
    durationMs: Date.now() - started,
    repairedAt: nowIso(),
  };

  eventBus.emit('queue:repair_completed', {
    ok: result.ok,
    beforeStatus: result.before.status,
    afterStatus: result.after.status,
    timestamp: result.repairedAt,
  });

  return result;
}

/**
 * Phase 57: Translate queue health into operational recommended actions.
 * Report-only. No writes.
 */
export async function getQueueOperationalRecommendations(options = {}) {
  const actions = [];

  let health = options.health || null;

  // Phase 57: do not run heavy queue verification implicitly from admin overview.
  // If health is not supplied, use lightweight queue stats + summary only.
  if (!health) {
    try {
      const { getQueueStats } = await import('./opsQueue.js');
      const { readQueueSummary } = await import('./queueStorageIndex.js');

      const [stats, summary] = await Promise.all([
        getQueueStats(),
        readQueueSummary().catch(() => null),
      ]);

      const byStatus = stats.byStatus || {};
      const deadLetter = byStatus['dead-letter'] || stats.deadLetter || 0;
      const pending = byStatus.pending || 0;
      const failed = byStatus.failed || 0;

      if (summary && summary.stale) {
        actions.push({
          id: 'queue_summary_repair',
          label: 'إصلاح ملخص الطابور',
          severity: 'warning',
          command: 'node scripts/repair-queue.js',
          adminRoute: '/api/admin/queue/repair',
          reason: 'Queue summary is stale.',
        });
      }

      if (deadLetter > 0) {
        actions.push({
          id: 'queue_dlq_review',
          label: 'مراجعة Dead Letter Queue',
          severity: deadLetter >= 5 ? 'critical' : 'warning',
          command: 'node scripts/queue-retry-dlq.js --dry-run',
          adminRoute: '/api/admin/ops-queue/dead-letter',
          reason: `${deadLetter} job(s) are in DLQ.`,
        });
      }

      if (pending >= 500) {
        actions.push({
          id: 'queue_pending_backlog',
          label: 'تفريغ Backlog الطابور',
          severity: pending >= 5000 ? 'critical' : 'warning',
          command: 'node scripts/queue-drain.js',
          adminRoute: '/api/admin/ops-queue/jobs?status=pending',
          reason: `${pending} pending job(s) are waiting.`,
        });
      }

      if (failed >= 5) {
        actions.push({
          id: 'queue_failed_review',
          label: 'مراجعة الوظائف الفاشلة',
          severity: 'warning',
          command: 'node scripts/verify-queue.js',
          adminRoute: '/api/admin/ops-queue/jobs?status=failed',
          reason: `${failed} failed job(s) need review.`,
        });
      }

      return actions;
    } catch (err) {
      return [{
        id: 'queue_recommendations_failed',
        label: 'فشل توليد توصيات الطابور',
        severity: 'warning',
        command: 'node scripts/verify-queue.js',
        adminRoute: '/api/admin/queue/health',
        reason: err.message,
      }];
    }
  }

  const details = health.details || {};

  if (details.summaryMismatches && details.summaryMismatches.length > 0) {
    actions.push({
      id: 'queue_summary_repair',
      label: 'إصلاح ملخص الطابور',
      severity: 'warning',
      command: 'node scripts/repair-queue.js',
      adminRoute: '/api/admin/queue/repair',
      reason: 'Queue summary does not match scanned queue records.',
    });
  }

  if (details.staleRunningJobs && details.staleRunningJobs.length > 0) {
    actions.push({
      id: 'queue_stale_running_recover',
      label: 'استعادة وظائف Running قديمة',
      severity: 'critical',
      command: 'node scripts/queue-drain.js',
      adminRoute: '/api/admin/ops-queue/jobs?status=running',
      reason: `${details.staleRunningJobs.length} running job(s) appear stale.`,
    });
  }

  try {
    const { getQueueStats } = await import('./opsQueue.js');
    const stats = await getQueueStats();
    const byStatus = stats.byStatus || {};
    const deadLetter = byStatus['dead-letter'] || stats.deadLetter || 0;
    const pending = byStatus.pending || 0;
    const failed = byStatus.failed || 0;

    if (deadLetter > 0) {
      actions.push({
        id: 'queue_dlq_review',
        label: 'مراجعة Dead Letter Queue',
        severity: deadLetter >= 5 ? 'critical' : 'warning',
        command: 'node scripts/queue-retry-dlq.js --dry-run',
        adminRoute: '/api/admin/ops-queue/dead-letter',
        reason: `${deadLetter} job(s) are in DLQ.`,
      });
    }

    if (pending >= 500) {
      actions.push({
        id: 'queue_pending_backlog',
        label: 'تفريغ Backlog الطابور',
        severity: pending >= 5000 ? 'critical' : 'warning',
        command: 'node scripts/queue-drain.js',
        adminRoute: '/api/admin/ops-queue/jobs?status=pending',
        reason: `${pending} pending job(s) are waiting.`,
      });
    }

    if (failed >= 5) {
      actions.push({
        id: 'queue_failed_review',
        label: 'مراجعة الوظائف الفاشلة',
        severity: 'warning',
        command: 'node scripts/verify-queue.js',
        adminRoute: '/api/admin/ops-queue/jobs?status=failed',
        reason: `${failed} failed job(s) need review.`,
      });
    }
  } catch (_) {
    // Stats enrichment failure should not break recommendations.
  }

  if (details.expiredIdempotency && details.expiredIdempotency.length > 0) {
    actions.push({
      id: 'queue_idempotency_cleanup',
      label: 'تنظيف مفاتيح idempotency المنتهية',
      severity: 'info',
      command: 'node scripts/compact-queue.js',
      adminRoute: '/api/admin/queue/compact',
      reason: `${details.expiredIdempotency.length} expired idempotency record(s).`,
    });
  }

  return actions;
}

export const _testHelpers = {
  expectedStatusFromPath,
  isQueueRecord,
  listSegmentFiles,
  listAllQueueFiles,
};
