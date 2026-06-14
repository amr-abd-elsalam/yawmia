#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/payment-backfill-dry-run.js
// Patch 73 — Payment Backfill Dry-run Script Skeleton
// ═══════════════════════════════════════════════════════════════
// No-mutation scanner for legacy file-backed payment/job state.
//
// Guarantees:
//   - dry-run only
//   - no --confirm support
//   - no payment mutation
//   - no ledger writes
//   - no receipt generation
//   - no receipt number allocation
//   - no DB writes
//   - no queue execution
//   - no EventBus emission
//   - no server/runtime imports
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

const REPORT_VERSION = 1;
const MAX_PREVIEW_DEFAULT = 20;
const FINANCIALS_PLATFORM_FEE_PERCENT = 15;
const FINANCIALS_MIN_DAILY_WAGE = 150;

const KNOWN_PAYMENT_STATUSES = new Set([
  'pending',
  'employer_confirmed',
  'completed',
  'disputed',
]);

const KNOWN_PAYMENT_METHODS = new Set([
  'cash',
  'wallet',
  'instapay',
]);

const FORBIDDEN_FLAGS = new Set([
  '--confirm',
  '--repair',
  '--write',
  '--write-db',
  '--ledger-write',
  '--generate-receipts',
  '--issue-receipts',
  '--mutate-payments',
  '--complete-payments',
  '--resolve-disputes',
  '--delete-legacy',
  '--import',
]);

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {
    json: false,
    basePath: process.env.YAWMIA_DATA_PATH || './data',
    includePreviews: false,
    maxPreview: MAX_PREVIEW_DEFAULT,
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

    scannedFileCount: 0,
    scannedPaymentFileCount: 0,
    scannedJobFileCount: 0,
    validPaymentCount: 0,
    validJobCount: 0,
    corruptPaymentCount: 0,
    corruptJobCount: 0,

    duplicateJobPaymentCount: 0,
    missingPaymentForCompletedJobCount: 0,
    paymentForNonCompletedJobCount: 0,
    paymentWithoutJobCount: 0,
    employerMismatchCount: 0,
    amountMismatchWithJobCount: 0,
    workersAcceptedMismatchCount: 0,
    dailyWageMismatchCount: 0,
    durationDaysMismatchCount: 0,

    missingRequiredPaymentFieldCount: 0,
    invalidAmountCount: 0,
    invalidPlatformFeeCount: 0,
    invalidWorkerPayoutCount: 0,
    invalidAmountEquationCount: 0,
    invalidDailyWageCount: 0,
    invalidDurationDaysCount: 0,
    unknownPaymentStatusCount: 0,
    unknownPaymentMethodCount: 0,

    statusCounts: {},
    paymentMethodCounts: {},
    disputedPaymentCount: 0,
    completedPaymentCount: 0,
    pendingPaymentCount: 0,
    employerConfirmedPaymentCount: 0,

    completedJobCount: 0,
    completedJobWithPaymentCount: 0,
    completedJobWithoutPaymentCount: 0,

    receiptMissingCount: 0,
    receiptNotPersistedCount: 0,
    receiptNumberNonTransactionalRisk: true,
    jobsEligibleForPersistedReceiptPreview: 0,

    wouldInsertLedgerEntryCount: 0,
    wouldInsertReceiptCount: 0,
    wouldSkipPaymentCount: 0,
    wouldSkipByReason: {},
    skippedByReasonCounts: {},

    importBlockerCount: 0,
    importGate: {
      canProceedToLedgerBackfill: false,
      blockers: [],
      warnings: [],
      requiredApprovals: [],
    },

    financeRisk: {
      hasInvalidAmountMath: false,
      hasDuplicatePayments: false,
      hasPaymentWithoutJob: false,
      hasNonCompletedJobPayments: false,
      requiresFinanceReview: false,
    },

    receiptRisk: {
      receiptMissingCount: 0,
      receiptNotPersistedCount: 0,
      receiptNumberNonTransactionalRisk: true,
      requiresReceiptPolicyApproval: false,
    },

    reconciliation: {
      filePaymentCount: 0,
      canonicalPaymentCount: 0,
      paymentByJobCount: 0,
      completedJobCount: 0,
      completedJobWithPaymentCount: 0,
      completedJobWithoutPaymentCount: 0,
      statusCounts: {},
      amountTotals: {
        amount: 0,
        platformFee: 0,
        workerPayout: 0,
      },
      equationMismatchCount: 0,
      duplicateJobPaymentCount: 0,
      ledgerPreviewCount: 0,
      receiptPreviewCount: 0,
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

function boundedPush(arr, item, max) {
  if (arr.length < max) arr.push(item);
}

function rel(basePath, filePath) {
  return relative(basePath, filePath).replace(/\\/g, '/');
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

async function discoverRecordFiles(basePath, collection, prefix) {
  const root = join(basePath, collection);
  const predicate = name => name.startsWith(prefix) && name.endsWith('.json') && !name.endsWith('.tmp');

  const flat = await listFilesFlat(root, predicate);
  const monthly = await listFilesMonthly(root, predicate);

  return [
    ...flat.map(filePath => ({ filePath, sourceLayout: 'flat' })),
    ...monthly.map(filePath => ({ filePath, sourceLayout: 'monthly_shard' })),
  ];
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

function numericValue(value) {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function paymentFreshness(payment = {}) {
  const fields = [
    payment.updatedAt,
    payment.completedAt,
    payment.disputedAt,
    payment.confirmedAt,
    payment.createdAt,
  ];

  let max = 0;
  for (const iso of fields) {
    const ms = parseMs(iso);
    if (ms > max) max = ms;
  }
  return max;
}

function chooseCanonicalPayment(entries) {
  const sorted = entries.slice().sort((a, b) => {
    const freshDelta = paymentFreshness(b.payment) - paymentFreshness(a.payment);
    if (freshDelta !== 0) return freshDelta;

    const aShard = a.sourceLayout === 'monthly_shard';
    const bShard = b.sourceLayout === 'monthly_shard';
    if (aShard !== bShard) return bShard ? 1 : -1;

    return a.sourcePath.localeCompare(b.sourcePath);
  });

  return sorted[0] || null;
}

function requiredPaymentFieldErrors(payment) {
  const missing = [];
  if (!payment.id || typeof payment.id !== 'string') missing.push('id');
  if (!payment.jobId || typeof payment.jobId !== 'string') missing.push('jobId');
  if (!payment.employerId || typeof payment.employerId !== 'string') missing.push('employerId');
  if (!payment.status || typeof payment.status !== 'string') missing.push('status');
  if (!payment.createdAt || typeof payment.createdAt !== 'string') missing.push('createdAt');
  return missing;
}

function addError(report, code, message, details) {
  report.errors.push({
    code,
    message,
    details: details || null,
  });
}

function addWarning(report, code, message, details) {
  report.warnings.push({
    code,
    message,
    details: details || null,
  });
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

function validatePaymentRecord(entry, report, args, detail) {
  const payment = entry.payment;
  const missing = requiredPaymentFieldErrors(payment);

  if (missing.length > 0) {
    report.missingRequiredPaymentFieldCount++;
    inc(report.wouldSkipByReason, 'missing_required_payment_field');
    inc(report.skippedByReasonCounts, 'missing_required_payment_field');
    addError(report, 'PAYMENT_REQUIRED_FIELDS_MISSING', 'Payment is missing required fields', {
      paymentId: payment.id || null,
      missing,
      sourcePath: entry.sourcePath,
    });
    boundedPush(detail.invalidPayments, {
      paymentId: payment.id || null,
      reason: 'missing_required_payment_field',
      missing,
      sourcePath: entry.sourcePath,
    }, args.maxPreview);
  }

  if (!payment.id || !payment.id.startsWith('pay_')) {
    addError(report, 'INVALID_PAYMENT_ID', 'Payment id is missing or does not start with pay_', {
      paymentId: payment.id || null,
      sourcePath: entry.sourcePath,
    });
  }

  const amount = numericValue(payment.amount);
  const platformFee = numericValue(payment.platformFee);
  const workerPayout = numericValue(payment.workerPayout);

  if (amount === null || amount < 0) {
    report.invalidAmountCount++;
    inc(report.wouldSkipByReason, 'invalid_amount');
    inc(report.skippedByReasonCounts, 'invalid_amount');
    addError(report, 'INVALID_PAYMENT_AMOUNT', 'Payment amount must be a non-negative number', {
      paymentId: payment.id || null,
      amount: payment.amount,
      sourcePath: entry.sourcePath,
    });
  }

  if (platformFee === null || platformFee < 0) {
    report.invalidPlatformFeeCount++;
    inc(report.wouldSkipByReason, 'invalid_platform_fee');
    inc(report.skippedByReasonCounts, 'invalid_platform_fee');
    addError(report, 'INVALID_PLATFORM_FEE', 'Payment platformFee must be a non-negative number', {
      paymentId: payment.id || null,
      platformFee: payment.platformFee,
      sourcePath: entry.sourcePath,
    });
  }

  if (workerPayout === null || workerPayout < 0) {
    report.invalidWorkerPayoutCount++;
    inc(report.wouldSkipByReason, 'invalid_worker_payout');
    inc(report.skippedByReasonCounts, 'invalid_worker_payout');
    addError(report, 'INVALID_WORKER_PAYOUT', 'Payment workerPayout must be a non-negative number', {
      paymentId: payment.id || null,
      workerPayout: payment.workerPayout,
      sourcePath: entry.sourcePath,
    });
  }

  if (amount !== null && platformFee !== null && workerPayout !== null && amount !== platformFee + workerPayout) {
    report.invalidAmountEquationCount++;
    inc(report.wouldSkipByReason, 'invalid_amount_equation');
    inc(report.skippedByReasonCounts, 'invalid_amount_equation');
    addError(report, 'INVALID_AMOUNT_EQUATION', 'Payment amount must equal platformFee + workerPayout', {
      paymentId: payment.id || null,
      amount,
      platformFee,
      workerPayout,
      expectedAmount: platformFee + workerPayout,
      sourcePath: entry.sourcePath,
    });
  }

  if (typeof payment.workersAccepted === 'number' && payment.workersAccepted < 0) {
    addError(report, 'INVALID_WORKERS_ACCEPTED', 'workersAccepted must not be negative', {
      paymentId: payment.id || null,
      workersAccepted: payment.workersAccepted,
      sourcePath: entry.sourcePath,
    });
  }

  if (typeof payment.dailyWage === 'number' && payment.dailyWage < FINANCIALS_MIN_DAILY_WAGE) {
    report.invalidDailyWageCount++;
    addWarning(report, 'PAYMENT_DAILY_WAGE_BELOW_MINIMUM', 'Payment dailyWage is below configured minimum wage', {
      paymentId: payment.id || null,
      dailyWage: payment.dailyWage,
      minDailyWage: FINANCIALS_MIN_DAILY_WAGE,
      sourcePath: entry.sourcePath,
    });
  }

  if (typeof payment.durationDays === 'number' && payment.durationDays < 1) {
    report.invalidDurationDaysCount++;
    addError(report, 'INVALID_DURATION_DAYS', 'Payment durationDays must be at least 1', {
      paymentId: payment.id || null,
      durationDays: payment.durationDays,
      sourcePath: entry.sourcePath,
    });
  }

  if (!KNOWN_PAYMENT_STATUSES.has(payment.status)) {
    report.unknownPaymentStatusCount++;
    inc(report.wouldSkipByReason, 'unknown_payment_status');
    inc(report.skippedByReasonCounts, 'unknown_payment_status');
    addError(report, 'UNKNOWN_PAYMENT_STATUS', 'Payment has unknown status', {
      paymentId: payment.id || null,
      status: payment.status || null,
      sourcePath: entry.sourcePath,
    });
  }

  if (payment.method && !KNOWN_PAYMENT_METHODS.has(payment.method)) {
    report.unknownPaymentMethodCount++;
    addWarning(report, 'UNKNOWN_PAYMENT_METHOD', 'Payment method is not known by current payment method policy', {
      paymentId: payment.id || null,
      method: payment.method,
      sourcePath: entry.sourcePath,
    });
  }
}

async function scanPayments(basePath, report, args, detail) {
  const files = await discoverRecordFiles(basePath, 'payments', 'pay_');
  report.scannedPaymentFileCount = files.length;
  report.scannedFileCount += files.length;

  const entries = [];

  for (const file of files) {
    const read = await readMaybeJson(file.filePath);
    const sourcePath = rel(basePath, file.filePath);

    if (!read.ok) {
      report.corruptPaymentCount++;
      addError(report, 'CORRUPT_PAYMENT_JSON', 'Corrupt payment JSON file found', {
        sourcePath,
        sourceLayout: file.sourceLayout,
        error: read.error,
        rawSizeBytes: read.rawSizeBytes,
      });
      boundedPush(detail.corruptPayments, {
        sourcePath,
        sourceLayout: file.sourceLayout,
        error: read.error,
        rawSizeBytes: read.rawSizeBytes,
      }, args.maxPreview);
      continue;
    }

    const payment = read.data || {};
    if (args.statusFilter && !args.statusFilter.has(payment.status)) {
      continue;
    }

    report.validPaymentCount++;
    report.reconciliation.filePaymentCount++;
    inc(report.statusCounts, payment.status || 'unknown');
    inc(report.paymentMethodCounts, payment.method || 'unknown');

    if (payment.status === 'pending') report.pendingPaymentCount++;
    if (payment.status === 'employer_confirmed') report.employerConfirmedPaymentCount++;
    if (payment.status === 'completed') report.completedPaymentCount++;
    if (payment.status === 'disputed') report.disputedPaymentCount++;

    const amount = numericValue(payment.amount);
    const platformFee = numericValue(payment.platformFee);
    const workerPayout = numericValue(payment.workerPayout);

    if (amount !== null) report.reconciliation.amountTotals.amount += amount;
    if (platformFee !== null) report.reconciliation.amountTotals.platformFee += platformFee;
    if (workerPayout !== null) report.reconciliation.amountTotals.workerPayout += workerPayout;

    const entry = {
      payment,
      paymentId: payment.id || null,
      jobId: payment.jobId || null,
      sourcePath,
      sourceLayout: file.sourceLayout,
      rawSizeBytes: read.rawSizeBytes,
    };

    validatePaymentRecord(entry, report, args, detail);
    entries.push(entry);
  }

  return entries;
}

async function scanJobs(basePath, report, args, detail) {
  const files = await discoverRecordFiles(basePath, 'jobs', 'job_');
  report.scannedJobFileCount = files.length;
  report.scannedFileCount += files.length;

  const jobsById = new Map();

  for (const file of files) {
    const read = await readMaybeJson(file.filePath);
    const sourcePath = rel(basePath, file.filePath);

    if (!read.ok) {
      report.corruptJobCount++;
      addError(report, 'CORRUPT_JOB_JSON', 'Corrupt job JSON file found while preparing payment reconciliation', {
        sourcePath,
        sourceLayout: file.sourceLayout,
        error: read.error,
        rawSizeBytes: read.rawSizeBytes,
      });
      boundedPush(detail.corruptJobs, {
        sourcePath,
        sourceLayout: file.sourceLayout,
        error: read.error,
        rawSizeBytes: read.rawSizeBytes,
      }, args.maxPreview);
      continue;
    }

    const job = read.data || {};
    if (!job.id || !job.id.startsWith('job_')) continue;

    report.validJobCount++;

    const existing = jobsById.get(job.id);
    if (!existing || paymentFreshness({ updatedAt: job.updatedAt, completedAt: job.completedAt, createdAt: job.createdAt }) > paymentFreshness({ updatedAt: existing.updatedAt, completedAt: existing.completedAt, createdAt: existing.createdAt })) {
      jobsById.set(job.id, job);
    }

    if (job.status === 'completed') {
      report.completedJobCount++;
    }
  }

  return jobsById;
}

function paymentHasBlockingLocalErrors(paymentId, report) {
  return report.errors.some(err => {
    const details = err.details || {};
    return details.paymentId === paymentId &&
      [
        'PAYMENT_REQUIRED_FIELDS_MISSING',
        'INVALID_PAYMENT_ID',
        'INVALID_PAYMENT_AMOUNT',
        'INVALID_PLATFORM_FEE',
        'INVALID_WORKER_PAYOUT',
        'INVALID_AMOUNT_EQUATION',
        'INVALID_DURATION_DAYS',
        'UNKNOWN_PAYMENT_STATUS',
      ].includes(err.code);
  });
}

function comparePaymentToJob(entry, job, report, args, detail) {
  const payment = entry.payment;

  if (payment.employerId && job.employerId && payment.employerId !== job.employerId) {
    report.employerMismatchCount++;
    addWarning(report, 'PAYMENT_EMPLOYER_MISMATCH', 'Payment employerId differs from job.employerId', {
      paymentId: payment.id || null,
      jobId: job.id,
      paymentEmployerId: payment.employerId,
      jobEmployerId: job.employerId,
      sourcePath: entry.sourcePath,
    });
  }

  if (
    typeof payment.workersAccepted === 'number' &&
    typeof job.workersAccepted === 'number' &&
    payment.workersAccepted !== job.workersAccepted
  ) {
    report.workersAcceptedMismatchCount++;
    addWarning(report, 'PAYMENT_WORKERS_ACCEPTED_MISMATCH', 'Payment workersAccepted differs from job.workersAccepted', {
      paymentId: payment.id || null,
      jobId: job.id,
      paymentWorkersAccepted: payment.workersAccepted,
      jobWorkersAccepted: job.workersAccepted,
      sourcePath: entry.sourcePath,
    });
  }

  if (
    typeof payment.dailyWage === 'number' &&
    typeof job.dailyWage === 'number' &&
    payment.dailyWage !== job.dailyWage
  ) {
    report.dailyWageMismatchCount++;
    addWarning(report, 'PAYMENT_DAILY_WAGE_MISMATCH', 'Payment dailyWage differs from job.dailyWage', {
      paymentId: payment.id || null,
      jobId: job.id,
      paymentDailyWage: payment.dailyWage,
      jobDailyWage: job.dailyWage,
      sourcePath: entry.sourcePath,
    });
  }

  if (
    typeof payment.durationDays === 'number' &&
    typeof job.durationDays === 'number' &&
    payment.durationDays !== job.durationDays
  ) {
    report.durationDaysMismatchCount++;
    addWarning(report, 'PAYMENT_DURATION_DAYS_MISMATCH', 'Payment durationDays differs from job.durationDays', {
      paymentId: payment.id || null,
      jobId: job.id,
      paymentDurationDays: payment.durationDays,
      jobDurationDays: job.durationDays,
      sourcePath: entry.sourcePath,
    });
  }

  const hasAttendanceAdjustment = !!payment.attendanceBreakdown;
  if (
    !hasAttendanceAdjustment &&
    typeof payment.amount === 'number' &&
    typeof job.totalCost === 'number' &&
    payment.amount !== job.totalCost
  ) {
    report.amountMismatchWithJobCount++;
    addWarning(report, 'PAYMENT_AMOUNT_MISMATCH_WITH_JOB', 'Payment amount differs from job.totalCost without attendanceBreakdown', {
      paymentId: payment.id || null,
      jobId: job.id,
      paymentAmount: payment.amount,
      jobTotalCost: job.totalCost,
      sourcePath: entry.sourcePath,
    });
  }

  if (payment.attendanceBreakdown) {
    addWarning(report, 'ATTENDANCE_ADJUSTED_PAYMENT_REVIEW', 'Payment has attendanceBreakdown and should be reviewed during ledger backfill', {
      paymentId: payment.id || null,
      jobId: job.id,
      attendanceBreakdown: payment.attendanceBreakdown,
      sourcePath: entry.sourcePath,
    });
    boundedPush(detail.attendanceAdjustedPayments, {
      paymentId: payment.id || null,
      jobId: job.id,
      attendanceBreakdown: payment.attendanceBreakdown,
      sourcePath: entry.sourcePath,
    }, args.maxPreview);
  }
}

function buildLedgerPreview(entry, report, args, detail) {
  const payment = entry.payment;
  if (!payment.id) return;
  if (paymentHasBlockingLocalErrors(payment.id, report)) {
    report.wouldSkipPaymentCount++;
    inc(report.wouldSkipByReason, 'payment_has_blocking_errors');
    inc(report.skippedByReasonCounts, 'payment_has_blocking_errors');
    return;
  }

  const base = {
    paymentId: payment.id,
    jobId: payment.jobId || null,
    employerId: payment.employerId || null,
    source: 'file_json_backfill_preview',
  };

  const entries = [
    {
      ...base,
      type: 'payment_created',
      amount: payment.amount || 0,
      platformFee: payment.platformFee || 0,
      workerPayout: payment.workerPayout || 0,
      occurredAt: payment.createdAt || null,
    },
    {
      ...base,
      type: 'platform_fee_accrual',
      amount: payment.platformFee || 0,
      occurredAt: payment.createdAt || null,
    },
    {
      ...base,
      type: 'worker_payout_payable',
      amount: payment.workerPayout || 0,
      occurredAt: payment.createdAt || null,
    },
  ];

  if (payment.status === 'employer_confirmed' || payment.status === 'completed' || payment.confirmedAt) {
    entries.push({
      ...base,
      type: 'employer_payment_confirmed',
      amount: 0,
      occurredAt: payment.confirmedAt || payment.createdAt || null,
    });
  }

  if (payment.status === 'disputed' || payment.disputedAt) {
    entries.push({
      ...base,
      type: 'payment_dispute_opened',
      amount: 0,
      disputedBy: payment.disputedBy || null,
      occurredAt: payment.disputedAt || payment.createdAt || null,
    });
  }

  if (payment.status === 'completed' || payment.completedAt) {
    entries.push({
      ...base,
      type: 'payment_completed',
      amount: 0,
      occurredAt: payment.completedAt || payment.createdAt || null,
    });
  }

  report.wouldInsertLedgerEntryCount += entries.length;
  report.reconciliation.ledgerPreviewCount += entries.length;

  for (const item of entries) {
    boundedPush(detail.wouldInsertLedgerEntriesPreview, item, args.maxPreview);
  }

  if (payment.status === 'completed') {
    report.receiptMissingCount++;
    report.receiptNotPersistedCount++;
    report.jobsEligibleForPersistedReceiptPreview++;
    report.wouldInsertReceiptCount++;
    report.reconciliation.receiptPreviewCount++;
    boundedPush(detail.wouldInsertReceiptsPreview, {
      paymentId: payment.id,
      jobId: payment.jobId || null,
      policy: 'preview_only_no_number_allocated',
      receiptMissing: true,
    }, args.maxPreview);
  }
}

function reconcilePaymentsAndJobs(paymentEntries, jobsById, report, args, detail) {
  const byJobId = new Map();

  for (const entry of paymentEntries) {
    if (!entry.jobId) continue;
    if (!byJobId.has(entry.jobId)) byJobId.set(entry.jobId, []);
    byJobId.get(entry.jobId).push(entry);
  }

  report.reconciliation.paymentByJobCount = byJobId.size;

  const canonicalPayments = [];

  for (const [jobId, entries] of byJobId.entries()) {
    if (entries.length > 1) {
      report.duplicateJobPaymentCount++;
      addImportBlocker(report, 'DUPLICATE_JOB_PAYMENTS', 'Duplicate payment records for one job require finance canonical review', {
        jobId,
        paymentIds: entries.map(e => e.paymentId).filter(Boolean),
        locations: entries.map(e => e.sourcePath),
      });
      boundedPush(detail.duplicateJobPayments, {
        jobId,
        paymentIds: entries.map(e => e.paymentId).filter(Boolean),
        locations: entries.map(e => e.sourcePath),
        canonicalCandidate: chooseCanonicalPayment(entries)?.sourcePath || null,
      }, args.maxPreview);
    }

    const canonical = chooseCanonicalPayment(entries);
    if (canonical) canonicalPayments.push(canonical);
  }

  report.reconciliation.canonicalPaymentCount = canonicalPayments.length;

  for (const entry of canonicalPayments) {
    const payment = entry.payment;
    const job = jobsById.get(payment.jobId);

    if (!payment.jobId || !job) {
      report.paymentWithoutJobCount++;
      inc(report.wouldSkipByReason, 'payment_without_job');
      inc(report.skippedByReasonCounts, 'payment_without_job');
      addImportBlocker(report, 'PAYMENT_WITHOUT_JOB', 'Payment references a missing job', {
        paymentId: payment.id || null,
        jobId: payment.jobId || null,
        sourcePath: entry.sourcePath,
      });
      boundedPush(detail.paymentsWithoutJob, {
        paymentId: payment.id || null,
        jobId: payment.jobId || null,
        sourcePath: entry.sourcePath,
      }, args.maxPreview);
      continue;
    }

    if (job.status !== 'completed') {
      report.paymentForNonCompletedJobCount++;
      inc(report.wouldSkipByReason, 'payment_for_non_completed_job');
      inc(report.skippedByReasonCounts, 'payment_for_non_completed_job');
      addImportBlocker(report, 'PAYMENT_FOR_NON_COMPLETED_JOB', 'Payment exists for a job that is not completed', {
        paymentId: payment.id || null,
        jobId: job.id,
        jobStatus: job.status || null,
        sourcePath: entry.sourcePath,
      });
      boundedPush(detail.paymentsForNonCompletedJobs, {
        paymentId: payment.id || null,
        jobId: job.id,
        jobStatus: job.status || null,
        sourcePath: entry.sourcePath,
      }, args.maxPreview);
    }

    comparePaymentToJob(entry, job, report, args, detail);
    buildLedgerPreview(entry, report, args, detail);
  }

  for (const job of jobsById.values()) {
    if (job.status !== 'completed') continue;

    const entries = byJobId.get(job.id) || [];
    if (entries.length === 0) {
      report.missingPaymentForCompletedJobCount++;
      report.completedJobWithoutPaymentCount++;
      addWarning(report, 'COMPLETED_JOB_WITHOUT_PAYMENT', 'Completed job has no payment record', {
        jobId: job.id,
        employerId: job.employerId || null,
        completedAt: job.completedAt || null,
      });
      boundedPush(detail.completedJobsWithoutPayment, {
        jobId: job.id,
        employerId: job.employerId || null,
        completedAt: job.completedAt || null,
      }, args.maxPreview);
    } else {
      report.completedJobWithPaymentCount++;
    }
  }

  report.completedJobCount = Array.from(jobsById.values()).filter(job => job.status === 'completed').length;
  report.reconciliation.completedJobCount = report.completedJobCount;
  report.reconciliation.completedJobWithPaymentCount = report.completedJobWithPaymentCount;
  report.reconciliation.completedJobWithoutPaymentCount = report.completedJobWithoutPaymentCount;
  report.reconciliation.statusCounts = { ...report.statusCounts };
  report.reconciliation.equationMismatchCount = report.invalidAmountEquationCount;
  report.reconciliation.duplicateJobPaymentCount = report.duplicateJobPaymentCount;
}

function buildImportGate(report) {
  if (report.corruptPaymentCount > 0) {
    addImportBlocker(report, 'CORRUPT_PAYMENT_JSON_BLOCKER', 'Corrupt payment JSON must be quarantined or repaired before ledger backfill', {
      corruptPaymentCount: report.corruptPaymentCount,
    });
  }

  if (report.corruptJobCount > 0) {
    addImportBlocker(report, 'CORRUPT_JOB_JSON_BLOCKER', 'Corrupt job JSON affects payment relationship reconciliation', {
      corruptJobCount: report.corruptJobCount,
    });
  }

  if (report.invalidAmountCount > 0) {
    addImportBlocker(report, 'INVALID_AMOUNT_BLOCKER', 'Invalid payment amounts block ledger backfill', {
      invalidAmountCount: report.invalidAmountCount,
    });
  }

  if (report.invalidPlatformFeeCount > 0) {
    addImportBlocker(report, 'INVALID_PLATFORM_FEE_BLOCKER', 'Invalid platformFee values block ledger backfill', {
      invalidPlatformFeeCount: report.invalidPlatformFeeCount,
    });
  }

  if (report.invalidWorkerPayoutCount > 0) {
    addImportBlocker(report, 'INVALID_WORKER_PAYOUT_BLOCKER', 'Invalid workerPayout values block ledger backfill', {
      invalidWorkerPayoutCount: report.invalidWorkerPayoutCount,
    });
  }

  if (report.invalidAmountEquationCount > 0) {
    addImportBlocker(report, 'INVALID_AMOUNT_EQUATION_BLOCKER', 'Payments where amount != platformFee + workerPayout block ledger backfill', {
      invalidAmountEquationCount: report.invalidAmountEquationCount,
    });
  }

  if (report.unknownPaymentStatusCount > 0) {
    addImportBlocker(report, 'UNKNOWN_PAYMENT_STATUS_BLOCKER', 'Unknown payment statuses require explicit import policy', {
      unknownPaymentStatusCount: report.unknownPaymentStatusCount,
    });
  }

  if (report.paymentWithoutJobCount > 0) {
    addImportBlocker(report, 'PAYMENT_WITHOUT_JOB_BLOCKER', 'Payments without jobs cannot be safely imported into ledger', {
      paymentWithoutJobCount: report.paymentWithoutJobCount,
    });
  }

  if (report.paymentForNonCompletedJobCount > 0) {
    addImportBlocker(report, 'PAYMENT_FOR_NON_COMPLETED_JOB_BLOCKER', 'Payments for non-completed jobs require explicit finance/admin approval', {
      paymentForNonCompletedJobCount: report.paymentForNonCompletedJobCount,
    });
  }

  if (report.missingRequiredPaymentFieldCount > 0) {
    addImportBlocker(report, 'MISSING_REQUIRED_PAYMENT_FIELDS_BLOCKER', 'Payments missing required fields cannot be imported safely', {
      missingRequiredPaymentFieldCount: report.missingRequiredPaymentFieldCount,
    });
  }

  if (report.missingPaymentForCompletedJobCount > 0) {
    addImportWarning(
      report,
      'COMPLETED_JOBS_WITHOUT_PAYMENTS',
      'Completed jobs without payment records require finance reconciliation',
      { missingPaymentForCompletedJobCount: report.missingPaymentForCompletedJobCount },
      'Finance review required for completed jobs without payment records'
    );
  }

  if (report.disputedPaymentCount > 0) {
    addImportWarning(
      report,
      'DISPUTED_PAYMENTS_PRESENT',
      'Disputed payments require explicit import policy',
      { disputedPaymentCount: report.disputedPaymentCount },
      'Approve disputed payment import policy'
    );
  }

  if (report.pendingPaymentCount > 0 || report.employerConfirmedPaymentCount > 0) {
    addImportWarning(
      report,
      'NON_COMPLETED_PAYMENT_STATES_PRESENT',
      'Pending/employer-confirmed payments are mutable legacy states and require review',
      {
        pendingPaymentCount: report.pendingPaymentCount,
        employerConfirmedPaymentCount: report.employerConfirmedPaymentCount,
      },
      'Approve legacy mutable payment state import policy'
    );
  }

  if (report.receiptMissingCount > 0 || report.receiptNotPersistedCount > 0) {
    addImportWarning(
      report,
      'LEGACY_RECEIPT_GAP',
      'Completed legacy payments have no persisted transactional receipts',
      {
        receiptMissingCount: report.receiptMissingCount,
        receiptNotPersistedCount: report.receiptNotPersistedCount,
        receiptNumberNonTransactionalRisk: true,
      },
      'Receipt policy approval required before any persisted receipt backfill or retroactive issuance'
    );
  }

  if (report.employerMismatchCount > 0 || report.amountMismatchWithJobCount > 0 || report.workersAcceptedMismatchCount > 0 || report.dailyWageMismatchCount > 0 || report.durationDaysMismatchCount > 0) {
    addImportWarning(
      report,
      'PAYMENT_JOB_RECONCILIATION_WARNINGS',
      'Payment projection differs from job source fields and requires reconciliation review',
      {
        employerMismatchCount: report.employerMismatchCount,
        amountMismatchWithJobCount: report.amountMismatchWithJobCount,
        workersAcceptedMismatchCount: report.workersAcceptedMismatchCount,
        dailyWageMismatchCount: report.dailyWageMismatchCount,
        durationDaysMismatchCount: report.durationDaysMismatchCount,
      },
      'Finance/admin reconciliation review required'
    );
  }

  const seenApprovalCodes = new Set();
  report.importGate.requiredApprovals = report.importGate.requiredApprovals.filter(item => {
    if (!item || !item.code) return false;
    if (seenApprovalCodes.has(item.code)) return false;
    seenApprovalCodes.add(item.code);
    return true;
  });

  report.importBlockerCount = report.importGate.blockers.length;
  report.importGate.canProceedToLedgerBackfill =
    report.importGate.blockers.length === 0 &&
    report.importGate.requiredApprovals.length === 0;
}

function computeSeverity(report) {
  if (report.importGate.blockers.length > 0 || report.errors.length > 0) return 'critical';
  if (report.importGate.warnings.length > 0 || report.warnings.length > 0) return 'warning';
  return 'ok';
}

function finalizeReport(report, args, detail) {
  buildImportGate(report);

  report.financeRisk = {
    hasInvalidAmountMath: report.invalidAmountEquationCount > 0,
    hasDuplicatePayments: report.duplicateJobPaymentCount > 0,
    hasPaymentWithoutJob: report.paymentWithoutJobCount > 0,
    hasNonCompletedJobPayments: report.paymentForNonCompletedJobCount > 0,
    requiresFinanceReview: report.importGate.requiredApprovals.some(item => String(item.code || '').toLowerCase().includes('payment')) ||
      report.importGate.requiredApprovals.some(item => String(item.reason || '').toLowerCase().includes('finance')),
  };

  report.receiptRisk = {
    receiptMissingCount: report.receiptMissingCount,
    receiptNotPersistedCount: report.receiptNotPersistedCount,
    receiptNumberNonTransactionalRisk: true,
    requiresReceiptPolicyApproval: report.receiptMissingCount > 0 || report.receiptNotPersistedCount > 0,
  };

  if (report.corruptPaymentCount > 0) {
    report.recommendations.push({
      id: 'review_corrupt_payment_json',
      label: 'Review corrupt payment JSON files',
      severity: 'critical',
      reason: 'Corrupt payment files must be quarantined or repaired before any ledger backfill.',
    });
  }

  if (report.duplicateJobPaymentCount > 0) {
    report.recommendations.push({
      id: 'review_duplicate_job_payments',
      label: 'Review duplicate payments per job',
      severity: 'critical',
      reason: 'Financial canonical payment selection must be explicit and approved.',
    });
  }

  if (report.invalidAmountEquationCount > 0) {
    report.recommendations.push({
      id: 'review_invalid_amount_equations',
      label: 'Review invalid payment amount equations',
      severity: 'critical',
      reason: 'Ledger cannot be reconstructed safely when amount != platformFee + workerPayout.',
    });
  }

  if (report.paymentWithoutJobCount > 0 || report.paymentForNonCompletedJobCount > 0) {
    report.recommendations.push({
      id: 'review_payment_job_relationships',
      label: 'Review payment/job relationship blockers',
      severity: 'critical',
      reason: 'Payments without completed jobs require finance/admin decision before import.',
    });
  }

  if (report.missingPaymentForCompletedJobCount > 0) {
    report.recommendations.push({
      id: 'review_completed_jobs_without_payments',
      label: 'Review completed jobs without payments',
      severity: 'warning',
      reason: 'Completed jobs without payments may need reconciliation before ledger migration.',
    });
  }

  if (report.receiptMissingCount > 0) {
    report.recommendations.push({
      id: 'define_legacy_receipt_policy',
      label: 'Define legacy receipt policy',
      severity: 'warning',
      reason: 'Current receipts were generated on demand and were not persisted transactionally.',
    });
  }

  report.severity = computeSeverity(report);

  if (args.includePreviews) {
    report.previews = {
      corruptPayments: detail.corruptPayments,
      corruptJobs: detail.corruptJobs,
      duplicateJobPayments: detail.duplicateJobPayments,
      paymentsWithoutJob: detail.paymentsWithoutJob,
      paymentsForNonCompletedJobs: detail.paymentsForNonCompletedJobs,
      completedJobsWithoutPayment: detail.completedJobsWithoutPayment,
      attendanceAdjustedPayments: detail.attendanceAdjustedPayments,
      invalidPayments: detail.invalidPayments,
      wouldInsertLedgerEntriesPreview: detail.wouldInsertLedgerEntriesPreview,
      wouldInsertReceiptsPreview: detail.wouldInsertReceiptsPreview,
    };
  }

  report.ok =
    report.importGate.blockers.length === 0 &&
    report.errors.length === 0 &&
    (!args.strict || (report.warnings.length === 0 && report.importGate.warnings.length === 0));

  report.generatedAt = nowIso();

  return report;
}

async function runDryRun(args) {
  const report = emptyReport(args.basePath);
  const detail = {
    corruptPayments: [],
    corruptJobs: [],
    duplicateJobPayments: [],
    paymentsWithoutJob: [],
    paymentsForNonCompletedJobs: [],
    completedJobsWithoutPayment: [],
    attendanceAdjustedPayments: [],
    invalidPayments: [],
    wouldInsertLedgerEntriesPreview: [],
    wouldInsertReceiptsPreview: [],
  };

  const [payments, jobsById] = await Promise.all([
    scanPayments(args.basePath, report, args, detail),
    scanJobs(args.basePath, report, args, detail),
  ]);

  reconcilePaymentsAndJobs(payments, jobsById, report, args, detail);

  return finalizeReport(report, args, detail);
}

function printHuman(report) {
  console.log('\n🧪 يوميّة Payment Backfill Dry-run\n');
  console.log(`Mode: ${report.mode}`);
  console.log(`Report version: ${report.reportVersion}`);
  console.log(`Severity: ${report.severity}`);
  console.log(`Ledger backfill gate: ${report.importGate.canProceedToLedgerBackfill ? 'can proceed' : 'blocked/review required'}`);
  console.log(`Import blockers: ${report.importBlockerCount}`);
  console.log(`Mutation performed: ${report.mutationPerformed ? 'yes' : 'no'}`);
  console.log(`Base path: ${report.basePath}`);
  console.log(`Scanned files: ${report.scannedFileCount}`);
  console.log(`Payment files: ${report.scannedPaymentFileCount}`);
  console.log(`Job files: ${report.scannedJobFileCount}`);
  console.log(`Valid payments: ${report.validPaymentCount}`);
  console.log(`Completed jobs: ${report.completedJobCount}`);
  console.log(`Completed jobs without payment: ${report.missingPaymentForCompletedJobCount}`);
  console.log(`Duplicate job payments: ${report.duplicateJobPaymentCount}`);
  console.log(`Payment without job: ${report.paymentWithoutJobCount}`);
  console.log(`Payment for non-completed job: ${report.paymentForNonCompletedJobCount}`);
  console.log(`Invalid amount equation: ${report.invalidAmountEquationCount}`);
  console.log(`Receipt missing/not persisted: ${report.receiptMissingCount}`);
  console.log(`Would insert ledger entries: ${report.wouldInsertLedgerEntryCount}`);
  console.log(`Would insert receipts: ${report.wouldInsertReceiptCount}`);
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
      error: 'Payment backfill dry-run does not support mutation flags',
      forbiddenFlags: args.forbiddenFlags,
      generatedAt: nowIso(),
    };

    if (args.json) console.log(JSON.stringify(failure, null, 2));
    else {
      console.error('\n❌ FORBIDDEN_MUTATION_FLAG');
      console.error('Payment backfill dry-run is no-mutation only.');
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
    code: 'PAYMENT_BACKFILL_DRY_RUN_FAILED',
    error: err.message,
    generatedAt: nowIso(),
  };

  if (args.json) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Payment backfill dry-run failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
