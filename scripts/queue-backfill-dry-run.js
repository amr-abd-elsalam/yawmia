#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/queue-backfill-dry-run.js
// Patch 63 — Queue Backfill Dry-run Script Skeleton
// ═══════════════════════════════════════════════════════════════
// No-mutation scanner for legacy/segmented file-backed ops queue state.
//
// Guarantees:
//   - dry-run only
//   - no --confirm support
//   - no queue worker execution
//   - no scheduler execution
//   - no DB writes
//   - no repair/drain/retry/cancel/complete/import
//   - no server/runtime imports
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

const REPORT_VERSION = 2;
const CANONICAL_SELECTION_POLICY_VERSION = 1;

const PRIVACY_JOB_TYPES = new Set([
  'privacy_user_data_export',
  'privacy_user_anonymization',
]);

const PAYMENT_JOB_TYPE_HINTS = [
  'payment',
  'ledger',
  'receipt',
  'financial',
  'reconciliation',
];

const AUDIT_EXPORT_JOB_TYPES = new Set([
  'audit_csv_export',
  'audit_index_rebuild',
  'audit_token_compaction',
]);

const ADMIN_ALERT_JOB_TYPES = new Set([
  'admin_alert_webhook',
  'admin_alert_email',
]);

const PREDICTIVE_ANALYTICS_JOB_TYPES = new Set([
  'predictive_scan',
  'predictive_signal_retention',
  'predictive_archive_index_rebuild',
  'marketplace_intelligence_rollup',
  'search_analytics_rollup',
  'payment_dispute_analytics_rollup',
  'workroom_adoption_rollup',
  'notification_conversion_rollup',
  'activation_funnel_rollup',
  'search_relevance_rebuild',
  'trust_snapshot_batch',
  'trust_calibration_report',
  'trust_snapshot_rollup',
]);

const FORBIDDEN_FLAGS = new Set([
  '--confirm',
  '--repair',
  '--drain',
  '--retry',
  '--cancel',
  '--complete',
  '--import',
  '--write-db',
  '--delete-legacy',
]);

const KNOWN_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'dead-letter',
  'cancelled',
]);

const KNOWN_TYPES = new Set([
  'admin_alert_webhook',
  'admin_alert_email',
  'audit_csv_export',
  'predictive_scan',
  'counter_rebuild',
  'counter_compaction',
  'audit_index_rebuild',
  'backup_verify',
  'backup_restore_drill',
  'ops_rollup_capture',
  'production_readiness_check',
  'trust_snapshot_batch',
  'trust_calibration_report',
  'predictive_signal_retention',
  'workroom_search_rebuild',
  'queue_compaction',
  'queue_verify',
  'queue_repair',
  'workroom_hygiene_compaction',
  'workroom_search_verify',
  'workroom_attachment_cleanup',
  'audit_token_compaction',
  'trust_snapshot_rollup',
  'predictive_archive_index_rebuild',
  'scheduler_history_cleanup',
  'marketplace_intelligence_rollup',
  'search_analytics_rollup',
  'payment_dispute_analytics_rollup',
  'workroom_adoption_rollup',
  'notification_conversion_rollup',
  'activation_funnel_rollup',
  'search_relevance_rebuild',
  'privacy_user_data_export',
  'privacy_user_anonymization',
]);

const DEFAULT_MAX_PAYLOAD_BYTES = 256 * 1024;
const DEFAULT_STALE_RUNNING_MS = 10 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {
    json: false,
    basePath: process.env.YAWMIA_DATA_PATH || './data',
    includePreviews: false,
    maxPreview: 20,
    strict: false,
    statusFilter: null,
    forbiddenFlags: [],
    unknownFlags: [],
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (FORBIDDEN_FLAGS.has(arg)) {
      args.forbiddenFlags.push(arg);
      continue;
    }

    if (arg === '--json') {
      args.json = true;
      continue;
    }

    if (arg === '--include-previews') {
      args.includePreviews = true;
      continue;
    }

    if (arg === '--strict') {
      args.strict = true;
      continue;
    }

    if (arg === '--base-path') {
      const next = argv[i + 1];
      if (next) {
        args.basePath = next;
        i++;
      }
      continue;
    }

    if (arg.startsWith('--base-path=')) {
      args.basePath = arg.slice('--base-path='.length);
      continue;
    }

    if (arg === '--max-preview') {
      const next = argv[i + 1];
      if (next) {
        args.maxPreview = Math.max(0, Number(next) || 0);
        i++;
      }
      continue;
    }

    if (arg.startsWith('--max-preview=')) {
      args.maxPreview = Math.max(0, Number(arg.slice('--max-preview='.length)) || 0);
      continue;
    }

    if (arg === '--status') {
      const next = argv[i + 1];
      if (next) {
        args.statusFilter = parseStatusFilter(next);
        i++;
      }
      continue;
    }

    if (arg.startsWith('--status=')) {
      args.statusFilter = parseStatusFilter(arg.slice('--status='.length));
      continue;
    }

    args.unknownFlags.push(arg);
  }

  args.basePath = resolve(args.basePath);
  return args;
}

function parseStatusFilter(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? new Set(parts) : null;
}

function emptyReport(basePath) {
  return {
    ok: true,
    mode: 'dry-run',
    reportVersion: REPORT_VERSION,
    severity: 'ok',
    mutationPerformed: false,
    generatedAt: nowIso(),
    basePath,
    canonicalSelectionPolicyVersion: CANONICAL_SELECTION_POLICY_VERSION,
    scannedFileCount: 0,
    scannedJobFileCount: 0,
    scannedIdempotencyFileCount: 0,
    validJobCount: 0,
    corruptJobCount: 0,
    corruptIdempotencyRecordCount: 0,
    duplicateJobIdCount: 0,
    duplicateActiveJobIdCount: 0,
    unknownStatusCount: 0,
    unknownActiveStatusCount: 0,
    unknownTypeCount: 0,
    oversizedPayloadCount: 0,
    missingRequiredFieldCount: 0,
    statusCounts: {},
    physicalStatusCounts: {},
    sourceLayoutCounts: {},
    typeCounts: {},
    runningJobCount: 0,
    activeRunningJobCount: 0,
    staleRunningJobCount: 0,
    invalidRunningJobCount: 0,
    skippedActiveRunningCount: 0,
    deadLetterCount: 0,
    deadLetterMirrorDuplicateCount: 0,
    idempotencyRecordCount: 0,
    validIdempotencyRecordCount: 0,
    orphanIdempotencyRecordCount: 0,
    duplicateIdempotencyKeyCount: 0,
    expiredIdempotencyRecordCount: 0,
    summary: {
      summaryPresent: false,
      summaryStale: false,
      summaryStaleReason: null,
      summaryLocationCount: 0,
      summaryStatusCounts: {},
      actualStatusCounts: {},
      summaryMismatchCount: 0,
      summaryMissingFileCount: 0,
      summaryExtraFileCount: 0,
      summaryWrongStatusCount: 0,
    },
    activeQueueRisk: {
      runningJobCount: 0,
      activeRunningJobCount: 0,
      staleRunningJobCount: 0,
      invalidRunningJobCount: 0,
      canImportWithoutPausingWorkers: true,
      requiresOperatorReview: false,
    },
    privacyJobFindings: {
      total: 0,
      byType: {},
      byStatus: {},
      missingApprovalId: 0,
      missingRequestId: 0,
      missingUserId: 0,
      jobIdsPreview: [],
    },
    paymentJobFindings: {
      total: 0,
      byType: {},
      byStatus: {},
      jobIdsPreview: [],
    },
    auditExportJobFindings: {
      total: 0,
      byType: {},
      byStatus: {},
    },
    adminAlertJobFindings: {
      total: 0,
      byType: {},
      byStatus: {},
    },
    predictiveAnalyticsJobFindings: {
      total: 0,
      byType: {},
      byStatus: {},
    },
    unknownJobFindings: {
      total: 0,
      byType: {},
      byStatus: {},
      jobIdsPreview: [],
    },
    wouldInsertJobCount: 0,
    wouldInsertAttemptCount: 0,
    wouldInsertIdempotencyCount: 0,
    wouldSkipJobCount: 0,
    wouldSkipAttemptCount: 0,
    wouldSkipIdempotencyCount: 0,
    wouldInsertByStatus: {},
    wouldSkipByReason: {},
    skippedByReasonCounts: {},
    importBlockerCount: 0,
    importGate: {
      canProceedToImport: true,
      blockers: [],
      warnings: [],
      requiredApprovals: [],
    },
    warnings: [],
    errors: [],
    recommendations: [],
  };
}

function inc(obj, key, delta = 1) {
  const safeKey = key || 'unknown';
  obj[safeKey] = (obj[safeKey] || 0) + delta;
}

function rel(basePath, filePath) {
  return relative(basePath, filePath).replace(/\\/g, '/');
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function listFilesFlat(dir, predicate) {
  const out = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (predicate && !predicate(entry.name)) continue;
    out.push(join(dir, entry.name));
  }

  return out;
}

async function listFilesMonthly(root, predicate) {
  const out = [];
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (_) {
    return out;
  }

  const months = entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
    .map(e => e.name)
    .sort();

  for (const month of months) {
    const dir = join(root, month);
    const files = await listFilesFlat(dir, predicate);
    out.push(...files);
  }

  return out;
}

async function discoverJobFiles(basePath) {
  const opsRoot = join(basePath, 'ops_queue');
  const files = [];

  const jobPredicate = name => name.startsWith('q_') && name.endsWith('.json') && !name.endsWith('.tmp');

  for (const filePath of await listFilesFlat(opsRoot, jobPredicate)) {
    files.push({
      filePath,
      sourceLayout: 'legacy_flat',
      physicalStatus: 'legacy_flat',
      sourceStatusDirectory: null,
    });
  }

  for (const statusName of ['pending', 'running', 'completed', 'failed', 'cancelled']) {
    const statusRoot = join(opsRoot, statusName);
    for (const filePath of await listFilesMonthly(statusRoot, jobPredicate)) {
      files.push({
        filePath,
        sourceLayout: 'segmented_status_month',
        physicalStatus: statusName,
        sourceStatusDirectory: statusName,
      });
    }
  }

  const deadLetterRoot = join(opsRoot, 'dead-letter');

  for (const filePath of await listFilesFlat(deadLetterRoot, jobPredicate)) {
    files.push({
      filePath,
      sourceLayout: 'legacy_dead_letter',
      physicalStatus: 'dead-letter',
      sourceStatusDirectory: 'dead-letter',
    });
  }

  for (const filePath of await listFilesMonthly(deadLetterRoot, jobPredicate)) {
    files.push({
      filePath,
      sourceLayout: 'segmented_dead_letter_month',
      physicalStatus: 'dead-letter',
      sourceStatusDirectory: 'dead-letter',
    });
  }

  return files;
}

async function discoverIdempotencyFiles(basePath) {
  const idemRoot = join(basePath, 'ops_queue', 'idempotency');
  return await listFilesFlat(
    idemRoot,
    name => name.endsWith('.json') && !name.endsWith('.tmp')
  );
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function readMaybeJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return {
      ok: true,
      data: JSON.parse(raw),
      rawSizeBytes: Buffer.byteLength(raw, 'utf-8'),
      error: null,
    };
  } catch (err) {
    let rawSizeBytes = 0;
    try {
      const raw = await readFile(filePath, 'utf-8');
      rawSizeBytes = Buffer.byteLength(raw, 'utf-8');
    } catch (_) {}
    return {
      ok: false,
      data: null,
      rawSizeBytes,
      error: err.message,
    };
  }
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function lifecycleFreshness(job) {
  const fields = [
    job.updatedAt,
    job.completedAt,
    job.failedAt,
    job.deadLetteredAt,
    job.cancelledAt,
    job.startedAt,
    job.createdAt,
  ];

  let max = 0;
  for (const iso of fields) {
    const ms = parseMs(iso);
    if (ms > max) max = ms;
  }
  return max;
}

function isSegmentedLayout(layout) {
  return layout === 'segmented_status_month' || layout === 'segmented_dead_letter_month';
}

function chooseCanonical(entries) {
  const sorted = entries.slice().sort((a, b) => {
    const freshDelta = lifecycleFreshness(b.job) - lifecycleFreshness(a.job);
    if (freshDelta !== 0) return freshDelta;

    if (isSegmentedLayout(a.sourceLayout) !== isSegmentedLayout(b.sourceLayout)) {
      return isSegmentedLayout(b.sourceLayout) ? 1 : -1;
    }

    const aDead = normalizeStatus(a.recordStatus) === 'dead-letter' || a.physicalStatus === 'dead-letter';
    const bDead = normalizeStatus(b.recordStatus) === 'dead-letter' || b.physicalStatus === 'dead-letter';
    if (aDead !== bDead) return aDead ? 1 : -1;

    return a.sourcePath.localeCompare(b.sourcePath);
  });

  return sorted[0] || null;
}

function normalizeStatus(status) {
  if (status === 'deadLetter') return 'dead-letter';
  if (!status || typeof status !== 'string') return 'unknown';
  return status;
}

function pgStatus(status) {
  const s = normalizeStatus(status);
  return s === 'dead-letter' ? 'dead_letter' : s;
}

function payloadBytes(job) {
  try {
    return Buffer.byteLength(JSON.stringify(job.payload || {}), 'utf-8');
  } catch (_) {
    return Infinity;
  }
}

function classifyRunning(job, nowMs, staleRunningMs) {
  const hasLease = !!job.leaseUntil;
  const hasLockedBy = !!job.lockedBy;

  if (!hasLease || !hasLockedBy) {
    return 'invalid_running';
  }

  const leaseMs = parseMs(job.leaseUntil);
  if (leaseMs > 0 && leaseMs < nowMs) {
    return 'stale_running';
  }

  const updatedMs = parseMs(job.updatedAt);
  if (updatedMs > 0 && nowMs - updatedMs > staleRunningMs) {
    return 'stale_running';
  }

  return 'active_running';
}

function requiredFieldErrors(job) {
  const missing = [];
  if (!job.id || typeof job.id !== 'string') missing.push('id');
  if (!job.type || typeof job.type !== 'string') missing.push('type');
  if (!job.status || typeof job.status !== 'string') missing.push('status');
  if (!job.createdAt || typeof job.createdAt !== 'string') missing.push('createdAt');
  return missing;
}

function isImportEligible(entry, opts) {
  const job = entry.job;
  const reasons = [];

  const missing = requiredFieldErrors(job);
  if (missing.length > 0) reasons.push('missing_required_field');

  const status = normalizeStatus(job.status);
  if (!KNOWN_STATUSES.has(status)) reasons.push('unknown_status');

  if (!KNOWN_TYPES.has(job.type)) reasons.push('unknown_type');

  if (payloadBytes(job) > opts.maxPayloadBytes) reasons.push('oversized_payload');

  if (status === 'running') {
    const runningKind = classifyRunning(job, opts.nowMs, opts.staleRunningMs);
    if (runningKind === 'active_running') reasons.push('active_running');
    if (runningKind === 'invalid_running') reasons.push('invalid_running');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function boundedPush(arr, item, max) {
  if (arr.length < max) arr.push(item);
}

function addWarning(report, code, message, details) {
  report.warnings.push({
    code,
    message,
    details: details || null,
  });
}

function addError(report, code, message, details) {
  report.errors.push({
    code,
    message,
    details: details || null,
  });
}

async function scanJobs(basePath, report, args, detail) {
  const files = await discoverJobFiles(basePath);
  report.scannedJobFileCount = files.length;
  report.scannedFileCount += files.length;

  const parsedEntries = [];
  const byId = new Map();

  for (const file of files) {
    inc(report.sourceLayoutCounts, file.sourceLayout);
    const read = await readMaybeJson(file.filePath);

    if (!read.ok) {
      report.corruptJobCount++;
      addError(report, 'CORRUPT_QUEUE_JSON', 'Corrupt queue JSON file found', {
        sourcePath: rel(basePath, file.filePath),
        sourceLayout: file.sourceLayout,
        error: read.error,
        rawSizeBytes: read.rawSizeBytes,
      });

      boundedPush(detail.corruptFiles, {
        sourcePath: rel(basePath, file.filePath),
        sourceLayout: file.sourceLayout,
        error: read.error,
        rawSizeBytes: read.rawSizeBytes,
      }, args.maxPreview);
      continue;
    }

    const job = read.data || {};
    const recordStatus = normalizeStatus(job.status);
    const sourcePath = rel(basePath, file.filePath);

    if (args.statusFilter && !args.statusFilter.has(recordStatus) && !args.statusFilter.has(file.physicalStatus)) {
      continue;
    }

    inc(report.physicalStatusCounts, file.physicalStatus);
    inc(report.statusCounts, recordStatus);
    inc(report.typeCounts, job.type || 'unknown');

    if (file.physicalStatus === 'dead-letter' || recordStatus === 'dead-letter') {
      report.deadLetterCount++;
    }

    const entry = {
      job,
      jobId: job.id || null,
      sourcePath,
      sourceLayout: file.sourceLayout,
      sourceStatusDirectory: file.sourceStatusDirectory,
      physicalStatus: file.physicalStatus,
      recordStatus,
      rawSizeBytes: read.rawSizeBytes,
    };

    parsedEntries.push(entry);

    if (job.id && typeof job.id === 'string') {
      if (!byId.has(job.id)) byId.set(job.id, []);
      byId.get(job.id).push(entry);
    } else {
      report.missingRequiredFieldCount++;
      addError(report, 'QUEUE_JOB_ID_MISSING', 'Queue job is missing id', { sourcePath });
    }
  }

  const canonicalEntries = [];

  for (const [jobId, entries] of byId.entries()) {
    if (entries.length > 1) {
      report.duplicateJobIdCount++;

      const canonical = chooseCanonical(entries);
      const activeEntries = entries.filter(e => isActiveStatus(e.recordStatus) || isActiveStatus(e.physicalStatus));
      const duplicateItem = {
        jobId,
        locations: entries.map(e => ({
          sourcePath: e.sourcePath,
          sourceLayout: e.sourceLayout,
          physicalStatus: e.physicalStatus,
          recordStatus: e.recordStatus,
          updatedAt: e.job.updatedAt || null,
        })),
        canonicalCandidate: canonical ? canonical.sourcePath : null,
        canonicalSelectionPolicyVersion: CANONICAL_SELECTION_POLICY_VERSION,
        activeDuplicateCount: activeEntries.length,
        reason: 'reporting_only_latest_freshness_then_segmented_precedence',
      };

      boundedPush(detail.duplicateJobIds, duplicateItem, args.maxPreview);

      if (activeEntries.length > 1) {
        report.duplicateActiveJobIdCount++;
        addError(report, 'DUPLICATE_ACTIVE_QUEUE_JOB_ID', 'Duplicate active queue job IDs require operator review before import', {
          jobId,
          activeDuplicateCount: activeEntries.length,
          canonicalCandidate: canonical ? canonical.sourcePath : null,
        });
      }

      const dlqCopies = entries.filter(e => e.physicalStatus === 'dead-letter' || e.recordStatus === 'dead-letter').length;
      if (dlqCopies > 0 && entries.length > dlqCopies) {
        report.deadLetterMirrorDuplicateCount++;
        addWarning(report, 'HISTORICAL_DEAD_LETTER_DUPLICATE', 'Historical dead-letter duplicate detected', {
          jobId,
          deadLetterCopies: dlqCopies,
          totalCopies: entries.length,
        });
      }
    }

    const canonical = chooseCanonical(entries);
    if (canonical) canonicalEntries.push(canonical);
  }

  report.validJobCount = canonicalEntries.length;

  const opts = {
    nowMs: Date.now(),
    staleRunningMs: DEFAULT_STALE_RUNNING_MS,
    maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
  };

  for (const entry of canonicalEntries) {
    const job = entry.job;
    const status = normalizeStatus(job.status);

    if (!KNOWN_STATUSES.has(status)) {
      report.unknownStatusCount++;
      if (isActiveStatus(entry.physicalStatus)) {
        report.unknownActiveStatusCount++;
      }
      addError(report, 'UNKNOWN_QUEUE_STATUS', 'Queue job has unknown status', {
        jobId: job.id || null,
        status,
        physicalStatus: entry.physicalStatus,
        activePhysicalStatus: isActiveStatus(entry.physicalStatus),
        sourcePath: entry.sourcePath,
      });
      boundedPush(detail.unknownStatusJobs, {
        jobId: job.id || null,
        status,
        sourcePath: entry.sourcePath,
      }, args.maxPreview);
    }

    if (!KNOWN_TYPES.has(job.type)) {
      report.unknownTypeCount++;
      addWarning(report, 'UNKNOWN_QUEUE_TYPE', 'Queue job has unknown type', {
        jobId: job.id || null,
        type: job.type || null,
        sourcePath: entry.sourcePath,
      });
      boundedPush(detail.unknownTypeJobs, {
        jobId: job.id || null,
        type: job.type || null,
        sourcePath: entry.sourcePath,
      }, args.maxPreview);
    }

    if (payloadBytes(job) > DEFAULT_MAX_PAYLOAD_BYTES) {
      report.oversizedPayloadCount++;
      addError(report, 'OVERSIZED_QUEUE_PAYLOAD', 'Queue job payload exceeds max payload bytes', {
        jobId: job.id || null,
        payloadBytes: payloadBytes(job),
        maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
        sourcePath: entry.sourcePath,
      });
      boundedPush(detail.oversizedPayloadJobs, {
        jobId: job.id || null,
        payloadBytes: payloadBytes(job),
        maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
        sourcePath: entry.sourcePath,
      }, args.maxPreview);
    }

    const missing = requiredFieldErrors(job);
    if (missing.length > 0) {
      report.missingRequiredFieldCount++;
      addError(report, 'QUEUE_REQUIRED_FIELDS_MISSING', 'Queue job is missing required fields', {
        jobId: job.id || null,
        missing,
        sourcePath: entry.sourcePath,
      });
    }

    if (status === 'running') {
      report.runningJobCount++;
      const runningKind = classifyRunning(job, opts.nowMs, opts.staleRunningMs);

      if (runningKind === 'active_running') {
        report.activeRunningJobCount++;
        report.skippedActiveRunningCount++;
        boundedPush(detail.activeRunningJobs, {
          jobId: job.id,
          leaseUntil: job.leaseUntil || null,
          lockedBy: job.lockedBy || null,
          sourcePath: entry.sourcePath,
        }, args.maxPreview);
      } else if (runningKind === 'stale_running') {
        report.staleRunningJobCount++;
        boundedPush(detail.staleRunningJobs, {
          jobId: job.id,
          leaseUntil: job.leaseUntil || null,
          lockedBy: job.lockedBy || null,
          updatedAt: job.updatedAt || null,
          sourcePath: entry.sourcePath,
        }, args.maxPreview);
      } else {
        report.invalidRunningJobCount++;
        addError(report, 'INVALID_RUNNING_JOB', 'Running queue job is missing lease/lock metadata', {
          jobId: job.id,
          leaseUntil: job.leaseUntil || null,
          lockedBy: job.lockedBy || null,
          sourcePath: entry.sourcePath,
        });
      }
    }

    updateDomainFindings(report, entry, args.maxPreview);

    const eligibility = isImportEligible(entry, opts);

    if (eligibility.eligible) {
      report.wouldInsertJobCount++;
      inc(report.wouldInsertByStatus, pgStatus(job.status));
      const attempts = Math.max(0, Number(job.attempts) || 0);
      report.wouldInsertAttemptCount += attempts;

      boundedPush(detail.wouldInsertJobsPreview, {
        jobId: job.id,
        type: job.type,
        status: pgStatus(job.status),
        priority: job.priority || 'normal',
        attempts,
        reconstructedAttempts: attempts > 0,
        sourcePath: entry.sourcePath,
      }, args.maxPreview);
    } else {
      report.wouldSkipJobCount++;
      for (const reason of eligibility.reasons) {
        inc(report.wouldSkipByReason, reason);
        inc(report.skippedByReasonCounts, reason);
      }
      boundedPush(detail.wouldSkipJobs, {
        jobId: job.id || null,
        type: job.type || null,
        status: job.status || null,
        reasons: eligibility.reasons,
        sourcePath: entry.sourcePath,
      }, args.maxPreview);
    }
  }

  detail.canonicalJobIds = new Set(canonicalEntries.map(e => e.job.id).filter(Boolean));
  detail.importableJobIds = new Set(
    canonicalEntries
      .filter(e => isImportEligible(e, opts).eligible)
      .map(e => e.job.id)
      .filter(Boolean)
  );

  return canonicalEntries;
}

async function scanIdempotency(basePath, report, args, detail) {
  const files = await discoverIdempotencyFiles(basePath);
  report.scannedIdempotencyFileCount = files.length;
  report.scannedFileCount += files.length;
  report.idempotencyRecordCount = files.length;
  if (files.length > 0) inc(report.sourceLayoutCounts, 'idempotency', files.length);

  const byKey = new Map();
  const nowMs = Date.now();

  for (const filePath of files) {
    const read = await readMaybeJson(filePath);

    if (!read.ok) {
      report.corruptIdempotencyRecordCount++;
      addError(report, 'CORRUPT_IDEMPOTENCY_JSON', 'Corrupt queue idempotency JSON file found', {
        sourcePath: rel(basePath, filePath),
        error: read.error,
        rawSizeBytes: read.rawSizeBytes,
      });
      continue;
    }

    const record = read.data || {};
    const key = record.idempotencyKey || record.keyHash || null;

    if (record.keyHash || record.idempotencyKey || record.jobId) {
      report.validIdempotencyRecordCount++;
    }

    if (key) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ record, sourcePath: rel(basePath, filePath) });
    }

    const expiresMs = parseMs(record.expiresAt);
    const expired = expiresMs > 0 && expiresMs <= nowMs;
    if (expired) {
      report.expiredIdempotencyRecordCount++;
      boundedPush(detail.expiredIdempotencyRecords, {
        idempotencyKey: record.idempotencyKey || null,
        keyHash: record.keyHash || null,
        jobId: record.jobId || null,
        expiresAt: record.expiresAt || null,
        sourcePath: rel(basePath, filePath),
      }, args.maxPreview);
    }

    const jobId = record.jobId || null;
    const orphan = !jobId || !detail.canonicalJobIds.has(jobId);
    if (orphan) {
      report.orphanIdempotencyRecordCount++;
      boundedPush(detail.orphanIdempotencyRecords, {
        idempotencyKey: record.idempotencyKey || null,
        keyHash: record.keyHash || null,
        jobId,
        sourcePath: rel(basePath, filePath),
      }, args.maxPreview);
    }

    if (!expired && !orphan && detail.importableJobIds.has(jobId)) {
      report.wouldInsertIdempotencyCount++;
    } else {
      report.wouldSkipIdempotencyCount++;
      if (expired) inc(report.skippedByReasonCounts, 'expired_idempotency');
      if (orphan) inc(report.skippedByReasonCounts, 'orphan_idempotency');
      if (jobId && !detail.importableJobIds.has(jobId)) inc(report.skippedByReasonCounts, 'idempotency_job_not_importable');
    }
  }

  for (const [key, rows] of byKey.entries()) {
    if (rows.length > 1) {
      report.duplicateIdempotencyKeyCount++;
      addWarning(report, 'DUPLICATE_IDEMPOTENCY_KEY', 'Duplicate queue idempotency key found', {
        key,
        count: rows.length,
        locations: rows.map(r => r.sourcePath).slice(0, args.maxPreview),
      });
      boundedPush(detail.duplicateIdempotencyKeys, {
        key,
        count: rows.length,
        locations: rows.map(r => r.sourcePath),
      }, args.maxPreview);
    }
  }
}

async function scanSummary(basePath, report, args, detail) {
  const summaryFile = join(basePath, 'metrics', 'queue', 'summary.json');

  if (!await pathExists(summaryFile)) {
    report.summary.summaryPresent = false;
    return;
  }

  report.scannedFileCount++;
  inc(report.sourceLayoutCounts, 'summary');
  report.summary.summaryPresent = true;

  const read = await readMaybeJson(summaryFile);
  if (!read.ok) {
    report.summary.summaryStale = true;
    report.summary.summaryStaleReason = 'summary_corrupt_json';
    report.summary.summaryMismatchCount++;
    addError(report, 'CORRUPT_QUEUE_SUMMARY_JSON', 'Queue summary JSON is corrupt', {
      sourcePath: rel(basePath, summaryFile),
      error: read.error,
    });
    return;
  }

  const summary = read.data || {};
  const locations = summary.locations || {};
  const summaryByStatus = summary.byStatus || {};

  report.summary.summaryStale = !!summary.stale;
  report.summary.summaryStaleReason = summary.staleReason || null;
  report.summary.summaryLocationCount = Object.keys(locations).length;
  report.summary.summaryStatusCounts = summaryByStatus;
  report.summary.actualStatusCounts = report.statusCounts;

  for (const [status, count] of Object.entries(summaryByStatus)) {
    const actual = report.statusCounts[status] || 0;
    if (Number(count) !== actual) {
      report.summary.summaryMismatchCount++;
      boundedPush(detail.summaryMismatches, {
        type: 'status_count_mismatch',
        status,
        summaryCount: Number(count) || 0,
        actualCount: actual,
      }, args.maxPreview);
    }
  }

  for (const [jobId, loc] of Object.entries(locations)) {
    const locPath = loc && loc.path ? join(basePath, loc.path) : null;
    const exists = locPath ? await pathExists(locPath) : false;

    if (!exists) {
      report.summary.summaryMissingFileCount++;
      report.summary.summaryMismatchCount++;
      boundedPush(detail.summaryMismatches, {
        type: 'summary_location_missing_file',
        jobId,
        path: loc && loc.path ? loc.path : null,
      }, args.maxPreview);
      continue;
    }

    const parsed = await readMaybeJson(locPath);
    if (parsed.ok && parsed.data && loc.status && parsed.data.status && normalizeStatus(loc.status) !== normalizeStatus(parsed.data.status)) {
      report.summary.summaryWrongStatusCount++;
      report.summary.summaryMismatchCount++;
      boundedPush(detail.summaryMismatches, {
        type: 'summary_wrong_status',
        jobId,
        summaryStatus: normalizeStatus(loc.status),
        recordStatus: normalizeStatus(parsed.data.status),
        path: loc.path,
      }, args.maxPreview);
    }
  }

  if (report.summary.summaryMismatchCount > 0) {
    report.summary.summaryStale = true;
    if (!report.summary.summaryStaleReason) {
      report.summary.summaryStaleReason = 'summary_actual_file_mismatch';
    }
  }
}

function isActiveStatus(status) {
  const s = normalizeStatus(status);
  return s === 'pending' || s === 'running';
}

function classifyJobDomain(job) {
  const type = String(job?.type || '').toLowerCase();

  if (PRIVACY_JOB_TYPES.has(type)) return 'privacy';
  if (AUDIT_EXPORT_JOB_TYPES.has(type)) return 'audit_export';
  if (ADMIN_ALERT_JOB_TYPES.has(type)) return 'admin_alert';
  if (PREDICTIVE_ANALYTICS_JOB_TYPES.has(type)) return 'predictive_analytics';

  if (PAYMENT_JOB_TYPE_HINTS.some(hint => type.includes(hint))) {
    return 'payment';
  }

  if (!KNOWN_TYPES.has(type)) return 'unknown';

  return 'general';
}

function updateDomainFindings(report, entry, maxPreview) {
  const job = entry.job || {};
  const domain = classifyJobDomain(job);
  const status = normalizeStatus(job.status);
  const type = job.type || 'unknown';

  function updateBucket(bucket) {
    bucket.total++;
    inc(bucket.byType, type);
    inc(bucket.byStatus, status);
  }

  if (domain === 'privacy') {
    updateBucket(report.privacyJobFindings);

    const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
    if (!payload.approvalId) report.privacyJobFindings.missingApprovalId++;
    if (!payload.requestId && !payload.privacyRequestId) report.privacyJobFindings.missingRequestId++;
    if (!payload.userId) report.privacyJobFindings.missingUserId++;

    boundedPush(report.privacyJobFindings.jobIdsPreview, {
      jobId: job.id || null,
      type,
      status,
      sourcePath: entry.sourcePath,
      approvalIdPresent: !!payload.approvalId,
      requestIdPresent: !!(payload.requestId || payload.privacyRequestId),
      userIdPresent: !!payload.userId,
    }, maxPreview);
    return;
  }

  if (domain === 'payment') {
    updateBucket(report.paymentJobFindings);
    boundedPush(report.paymentJobFindings.jobIdsPreview, {
      jobId: job.id || null,
      type,
      status,
      sourcePath: entry.sourcePath,
    }, maxPreview);
    return;
  }

  if (domain === 'audit_export') {
    updateBucket(report.auditExportJobFindings);
    return;
  }

  if (domain === 'admin_alert') {
    updateBucket(report.adminAlertJobFindings);
    return;
  }

  if (domain === 'predictive_analytics') {
    updateBucket(report.predictiveAnalyticsJobFindings);
    return;
  }

  if (domain === 'unknown') {
    updateBucket(report.unknownJobFindings);
    boundedPush(report.unknownJobFindings.jobIdsPreview, {
      jobId: job.id || null,
      type,
      status,
      sourcePath: entry.sourcePath,
    }, maxPreview);
  }
}

function addImportBlocker(report, code, message, details) {
  report.importGate.blockers.push({
    code,
    message,
    details: details || null,
  });
}

function addImportWarning(report, code, message, details, approvalReason) {
  report.importGate.warnings.push({
    code,
    message,
    details: details || null,
  });

  if (approvalReason) {
    report.importGate.requiredApprovals.push({
      code,
      reason: approvalReason,
    });
  }
}

function buildImportGate(report) {
  report.activeQueueRisk = {
    runningJobCount: report.runningJobCount,
    activeRunningJobCount: report.activeRunningJobCount,
    staleRunningJobCount: report.staleRunningJobCount,
    invalidRunningJobCount: report.invalidRunningJobCount,
    canImportWithoutPausingWorkers: report.activeRunningJobCount === 0,
    requiresOperatorReview: report.runningJobCount > 0,
  };

  if (report.corruptJobCount > 0) {
    addImportBlocker(report, 'CORRUPT_QUEUE_JSON_BLOCKER', 'Corrupt queue JSON must be quarantined or repaired before import', {
      corruptJobCount: report.corruptJobCount,
    });
  }

  if (report.duplicateActiveJobIdCount > 0) {
    addImportBlocker(report, 'DUPLICATE_ACTIVE_JOB_ID_BLOCKER', 'Duplicate active queue job IDs require operator canonical review before import', {
      duplicateActiveJobIdCount: report.duplicateActiveJobIdCount,
    });
  }

  if (report.activeRunningJobCount > 0) {
    addImportBlocker(report, 'ACTIVE_RUNNING_JOBS_BLOCKER', 'Active running jobs require workers to be paused and queue state reviewed before import', {
      activeRunningJobCount: report.activeRunningJobCount,
    });
  }

  if (report.invalidRunningJobCount > 0) {
    addImportBlocker(report, 'INVALID_RUNNING_JOBS_BLOCKER', 'Invalid running jobs are missing lease/lock metadata and cannot be imported safely', {
      invalidRunningJobCount: report.invalidRunningJobCount,
    });
  }

  if (report.unknownActiveStatusCount > 0) {
    addImportBlocker(report, 'UNKNOWN_ACTIVE_STATUS_BLOCKER', 'Unknown statuses in active queue locations require explicit import policy', {
      unknownActiveStatusCount: report.unknownActiveStatusCount,
    });
  }

  if (report.oversizedPayloadCount > 0) {
    addImportBlocker(report, 'OVERSIZED_PAYLOAD_BLOCKER', 'Oversized queue payloads exceed import-safe payload limits', {
      oversizedPayloadCount: report.oversizedPayloadCount,
    });
  }

  if (report.missingRequiredFieldCount > 0) {
    addImportBlocker(report, 'MISSING_REQUIRED_FIELDS_BLOCKER', 'Queue jobs missing required fields cannot be imported safely', {
      missingRequiredFieldCount: report.missingRequiredFieldCount,
    });
  }

  if (report.deadLetterMirrorDuplicateCount > 0) {
    addImportWarning(
      report,
      'HISTORICAL_DEAD_LETTER_DUPLICATES',
      'Historical dead-letter mirror duplicates require operator review before import',
      { deadLetterMirrorDuplicateCount: report.deadLetterMirrorDuplicateCount },
      'Approve dead-letter historical import policy'
    );
  }

  if (report.summary.summaryMismatchCount > 0) {
    addImportWarning(
      report,
      'QUEUE_SUMMARY_DRIFT',
      'Queue summary drift detected; summary.json must not be treated as source of truth',
      { summaryMismatchCount: report.summary.summaryMismatchCount },
      'Approve import based on physical queue files, not summary.json'
    );
  }

  if (report.staleRunningJobCount > 0) {
    addImportWarning(
      report,
      'STALE_RUNNING_JOBS',
      'Stale running jobs require operator review before import',
      { staleRunningJobCount: report.staleRunningJobCount },
      'Approve stale running job handling policy'
    );
  }

  if (report.orphanIdempotencyRecordCount > 0) {
    addImportWarning(
      report,
      'ORPHAN_IDEMPOTENCY_RECORDS',
      'Orphan idempotency records will be skipped unless a later import policy says otherwise',
      { orphanIdempotencyRecordCount: report.orphanIdempotencyRecordCount },
      'Approve idempotency orphan skip policy'
    );
  }

  if (report.expiredIdempotencyRecordCount > 0) {
    addImportWarning(report, 'EXPIRED_IDEMPOTENCY_RECORDS', 'Expired idempotency records will be skipped', {
      expiredIdempotencyRecordCount: report.expiredIdempotencyRecordCount,
    });
  }

  if (report.unknownTypeCount > 0) {
    addImportWarning(
      report,
      'UNKNOWN_QUEUE_TYPES',
      'Unknown queue job types require explicit import or skip policy',
      { unknownTypeCount: report.unknownTypeCount },
      'Approve unknown queue type handling policy'
    );
  }

  if (report.privacyJobFindings.total > 0) {
    addImportWarning(
      report,
      'PRIVACY_QUEUE_JOBS_PRESENT',
      'Privacy queue jobs are high-risk and require privacy review before import',
      report.privacyJobFindings,
      'Privacy review required before importing privacy jobs'
    );
  }

  if (report.paymentJobFindings.total > 0) {
    addImportWarning(
      report,
      'PAYMENT_QUEUE_JOBS_PRESENT',
      'Payment/ledger/receipt queue jobs require financial review before import',
      report.paymentJobFindings,
      'Finance review required before importing payment jobs'
    );
  }

  report.importGate.canProceedToImport = report.importGate.blockers.length === 0;
  report.importBlockerCount = report.importGate.blockers.length;

  const seenApprovalCodes = new Set();
  report.importGate.requiredApprovals = report.importGate.requiredApprovals.filter(item => {
    if (!item || !item.code) return false;
    if (seenApprovalCodes.has(item.code)) return false;
    seenApprovalCodes.add(item.code);
    return true;
  });
}

function computeSeverity(report) {
  if (report.importGate.blockers.length > 0 || report.errors.length > 0) return 'critical';
  if (report.importGate.warnings.length > 0 || report.warnings.length > 0) return 'warning';
  return 'ok';
}

function finalizeReport(report, args, detail) {
  buildImportGate(report);

  if (report.corruptJobCount > 0) {
    report.recommendations.push({
      id: 'review_corrupt_queue_json',
      label: 'Review corrupt queue JSON files',
      severity: 'critical',
      reason: 'Corrupt queue files must be quarantined or repaired before any import.',
    });
  }

  if (report.duplicateJobIdCount > 0) {
    report.recommendations.push({
      id: 'review_duplicate_queue_jobs',
      label: 'Review duplicate queue job IDs',
      severity: report.duplicateActiveJobIdCount > 0 ? 'critical' : 'warning',
      reason: 'Dry-run selected canonical candidates for reporting only; no files were repaired.',
    });
  }

  if (report.activeRunningJobCount > 0) {
    report.recommendations.push({
      id: 'pause_workers_before_import',
      label: 'Pause queue workers before real import',
      severity: 'critical',
      reason: 'Active running jobs must not be imported blindly.',
    });
  }

  if (report.staleRunningJobCount > 0) {
    report.recommendations.push({
      id: 'review_stale_running_jobs',
      label: 'Review stale running jobs',
      severity: 'warning',
      reason: 'Stale running jobs require explicit operator handling before import.',
    });
  }

  if (report.summary.summaryMismatchCount > 0) {
    report.recommendations.push({
      id: 'review_queue_summary_drift',
      label: 'Review queue summary drift',
      severity: 'warning',
      reason: 'summary.json is acceleration data only and must not be treated as source of truth.',
    });
  }

  if (report.unknownTypeCount > 0 || report.unknownStatusCount > 0) {
    report.recommendations.push({
      id: 'review_unknown_queue_records',
      label: 'Review unknown queue statuses/types',
      severity: report.unknownStatusCount > 0 ? 'critical' : 'warning',
      reason: 'Unknown queue records require explicit import policy.',
    });
  }

  if (report.privacyJobFindings.total > 0) {
    report.recommendations.push({
      id: 'privacy_queue_job_review',
      label: 'Review privacy queue jobs before import',
      severity: 'warning',
      reason: 'Privacy jobs must not be imported without privacy review and approval evidence.',
    });
  }

  if (report.paymentJobFindings.total > 0) {
    report.recommendations.push({
      id: 'payment_queue_job_review',
      label: 'Review payment queue jobs before import',
      severity: 'warning',
      reason: 'Payment/ledger/receipt jobs require finance review before import.',
    });
  }

  report.severity = computeSeverity(report);

  if (args.includePreviews) {
    report.previews = {
      corruptFiles: detail.corruptFiles,
      duplicateJobIds: detail.duplicateJobIds,
      activeRunningJobs: detail.activeRunningJobs,
      staleRunningJobs: detail.staleRunningJobs,
      orphanIdempotencyRecords: detail.orphanIdempotencyRecords,
      duplicateIdempotencyKeys: detail.duplicateIdempotencyKeys,
      expiredIdempotencyRecords: detail.expiredIdempotencyRecords,
      unknownStatusJobs: detail.unknownStatusJobs,
      unknownTypeJobs: detail.unknownTypeJobs,
      oversizedPayloadJobs: detail.oversizedPayloadJobs,
      summaryMismatches: detail.summaryMismatches,
      wouldInsertJobsPreview: detail.wouldInsertJobsPreview,
      wouldSkipJobs: detail.wouldSkipJobs,
    };
  }

  report.ok = report.importGate.canProceedToImport &&
    report.errors.length === 0 &&
    (!args.strict || (report.warnings.length === 0 && report.importGate.warnings.length === 0));

  report.generatedAt = nowIso();

  return report;
}

async function runDryRun(args) {
  const report = emptyReport(args.basePath);

  const detail = {
    corruptFiles: [],
    duplicateJobIds: [],
    activeRunningJobs: [],
    staleRunningJobs: [],
    orphanIdempotencyRecords: [],
    duplicateIdempotencyKeys: [],
    expiredIdempotencyRecords: [],
    unknownStatusJobs: [],
    unknownTypeJobs: [],
    oversizedPayloadJobs: [],
    summaryMismatches: [],
    wouldInsertJobsPreview: [],
    wouldSkipJobs: [],
    canonicalJobIds: new Set(),
    importableJobIds: new Set(),
  };

  await scanJobs(args.basePath, report, args, detail);
  await scanIdempotency(args.basePath, report, args, detail);
  await scanSummary(args.basePath, report, args, detail);

  return finalizeReport(report, args, detail);
}

function printHuman(report) {
  console.log('\n🧪 يوميّة Queue Backfill Dry-run\n');
  console.log(`Mode: ${report.mode}`);
  console.log(`Report version: ${report.reportVersion}`);
  console.log(`Severity: ${report.severity}`);
  console.log(`Import gate: ${report.importGate.canProceedToImport ? 'can proceed' : 'blocked'}`);
  console.log(`Import blockers: ${report.importBlockerCount}`);
  console.log(`Mutation performed: ${report.mutationPerformed ? 'yes' : 'no'}`);
  console.log(`Base path: ${report.basePath}`);
  console.log(`Scanned files: ${report.scannedFileCount}`);
  console.log(`Queue job files: ${report.scannedJobFileCount}`);
  console.log(`Idempotency files: ${report.scannedIdempotencyFileCount}`);
  console.log(`Valid logical jobs: ${report.validJobCount}`);
  console.log(`Would insert jobs: ${report.wouldInsertJobCount}`);
  console.log(`Would skip jobs: ${report.wouldSkipJobCount}`);
  console.log(`Corrupt jobs: ${report.corruptJobCount}`);
  console.log(`Duplicate job IDs: ${report.duplicateJobIdCount}`);
  console.log(`Active running: ${report.activeRunningJobCount}`);
  console.log(`Stale running: ${report.staleRunningJobCount}`);
  console.log(`Invalid running: ${report.invalidRunningJobCount}`);
  console.log(`Dead-letter: ${report.deadLetterCount}`);
  console.log(`Idempotency records: ${report.idempotencyRecordCount}`);
  console.log(`Summary mismatches: ${report.summary.summaryMismatchCount}`);
  console.log(`Warnings: ${report.warnings.length}`);
  console.log(`Errors: ${report.errors.length}`);

  if (report.recommendations.length > 0) {
    console.log('\nRecommendations:');
    for (const rec of report.recommendations.slice(0, 10)) {
      console.log(`  → ${rec.label}`);
      if (rec.reason) console.log(`    ${rec.reason}`);
    }
  }

  console.log(report.ok ? '\n✅ Dry-run complete\n' : '\n❌ Dry-run found blockers\n');
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.forbiddenFlags.length > 0) {
    const failure = {
      ok: false,
      mode: 'dry-run',
      mutationPerformed: false,
      code: 'FORBIDDEN_MUTATION_FLAG',
      error: 'Queue backfill dry-run does not support mutation flags',
      forbiddenFlags: args.forbiddenFlags,
      generatedAt: nowIso(),
    };

    if (args.json) console.log(JSON.stringify(failure, null, 2));
    else {
      console.error('\n❌ FORBIDDEN_MUTATION_FLAG');
      console.error('Queue backfill dry-run is no-mutation only.');
      console.error('Forbidden flags:', args.forbiddenFlags.join(', '));
    }

    process.exit(2);
  }

  const report = await runDryRun(args);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (!report.ok) process.exit(1);
}

main().catch(err => {
  const args = parseArgs(process.argv);
  const failure = {
    ok: false,
    mode: 'dry-run',
    mutationPerformed: false,
    code: 'QUEUE_BACKFILL_DRY_RUN_FAILED',
    error: err.message,
    generatedAt: nowIso(),
  };

  if (args.json) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Queue backfill dry-run failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
