// ═══════════════════════════════════════════════════════════════
// tests/scripts/payment-backfill-dry-run.test.js
// Patch 73 — Payment Backfill Dry-run Script Characterization
// ═══════════════════════════════════════════════════════════════
// Safety:
//   - temp data path only
//   - no ./data mutation
//   - no server.js import
//   - no payment service import
//   - no ledger writes
//   - no receipt generation
//   - no DB writes
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = resolve('scripts/payment-backfill-dry-run.js');

async function writeJson(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeText(filePath, text) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf-8');
}

async function snapshotDir(root) {
  const result = {};

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const raw = await readFile(full);
        result[full.slice(root.length + 1).replace(/\\/g, '/')] = raw.toString('utf-8');
      }
    }
  }

  await walk(root);
  return result;
}

function runScript(args, options = {}) {
  const proc = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  let parsed = null;
  try {
    parsed = JSON.parse(proc.stdout);
  } catch (_) {}

  return {
    status: proc.status,
    stdout: proc.stdout,
    stderr: proc.stderr,
    parsed,
  };
}

async function createTempDataPath() {
  return await mkdtemp(join(tmpdir(), 'yawmia-payment-backfill-dry-run-'));
}

function baseJob(patch = {}) {
  const now = new Date().toISOString();
  return {
    id: patch.id || 'job_test',
    employerId: patch.employerId || 'usr_employer',
    title: patch.title || 'Completed job',
    category: patch.category || 'general',
    governorate: patch.governorate || 'cairo',
    status: patch.status || 'completed',
    workersAccepted: patch.workersAccepted ?? 1,
    workersNeeded: patch.workersNeeded ?? 1,
    dailyWage: patch.dailyWage ?? 300,
    durationDays: patch.durationDays ?? 1,
    totalCost: patch.totalCost ?? 300,
    platformFee: patch.platformFee ?? 45,
    createdAt: patch.createdAt || now,
    completedAt: patch.completedAt || now,
    updatedAt: patch.updatedAt || now,
  };
}

function basePayment(patch = {}) {
  const now = new Date().toISOString();
  return {
    id: patch.id || 'pay_test',
    jobId: patch.jobId || 'job_test',
    employerId: patch.employerId || 'usr_employer',
    amount: patch.amount ?? 300,
    platformFee: patch.platformFee ?? 45,
    workerPayout: patch.workerPayout ?? 255,
    method: patch.method || 'cash',
    status: patch.status || 'completed',
    workersAccepted: patch.workersAccepted ?? 1,
    dailyWage: patch.dailyWage ?? 300,
    durationDays: patch.durationDays ?? 1,
    createdAt: patch.createdAt || now,
    confirmedAt: patch.confirmedAt || now,
    completedAt: patch.completedAt || now,
    disputedBy: patch.disputedBy || null,
    disputeReason: patch.disputeReason || null,
    disputedAt: patch.disputedAt || null,
    notes: patch.notes || null,
    attendanceBreakdown: patch.attendanceBreakdown || null,
  };
}

test('payment backfill dry-run rejects forbidden mutation flags', async () => {
  const basePath = await createTempDataPath();

  const result = runScript([
    '--json',
    '--base-path',
    basePath,
    '--confirm',
  ]);

  assert.equal(result.status, 2);
  assert.ok(result.parsed);
  assert.equal(result.parsed.ok, false);
  assert.equal(result.parsed.mutationPerformed, false);
  assert.equal(result.parsed.code, 'FORBIDDEN_MUTATION_FLAG');
  assert.deepEqual(result.parsed.forbiddenFlags, ['--confirm']);
});

test('payment backfill dry-run returns stable empty report shape', async () => {
  const basePath = await createTempDataPath();

  const result = runScript([
    '--json',
    '--base-path',
    basePath,
  ]);

  assert.equal(result.status, 0);
  assert.ok(result.parsed);

  const report = result.parsed;

  assert.equal(report.ok, true);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.reportVersion, 1);
  assert.equal(report.severity, 'ok');
  assert.equal(report.mutationPerformed, false);
  assert.equal(report.basePath, resolve(basePath));
  assert.equal(report.importGate.canProceedToLedgerBackfill, true);
  assert.equal(report.importBlockerCount, 0);

  const requiredKeys = [
    'scannedFileCount',
    'scannedPaymentFileCount',
    'scannedJobFileCount',
    'validPaymentCount',
    'corruptPaymentCount',
    'corruptJobCount',
    'duplicateJobPaymentCount',
    'missingPaymentForCompletedJobCount',
    'paymentForNonCompletedJobCount',
    'paymentWithoutJobCount',
    'invalidAmountCount',
    'invalidPlatformFeeCount',
    'invalidWorkerPayoutCount',
    'invalidAmountEquationCount',
    'unknownPaymentStatusCount',
    'statusCounts',
    'paymentMethodCounts',
    'receiptMissingCount',
    'receiptNotPersistedCount',
    'receiptNumberNonTransactionalRisk',
    'wouldInsertLedgerEntryCount',
    'wouldInsertReceiptCount',
    'wouldSkipPaymentCount',
    'wouldSkipByReason',
    'skippedByReasonCounts',
    'importGate',
    'financeRisk',
    'receiptRisk',
    'reconciliation',
    'warnings',
    'errors',
    'recommendations',
  ];

  for (const key of requiredKeys) {
    assert.ok(key in report, `missing report key: ${key}`);
  }
});

test('payment backfill dry-run scans payments/jobs, reports blockers, warnings, previews, and performs no mutation', async () => {
  const basePath = await createTempDataPath();

  await writeJson(join(basePath, 'jobs', '2026-06', 'job_paid.json'), baseJob({
    id: 'job_paid',
    employerId: 'usr_emp_a',
    status: 'completed',
    totalCost: 300,
    platformFee: 45,
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_paid.json'), basePayment({
    id: 'pay_paid',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    amount: 300,
    platformFee: 45,
    workerPayout: 255,
    status: 'completed',
  }));

  await writeJson(join(basePath, 'jobs', '2026-06', 'job_missing_payment.json'), baseJob({
    id: 'job_missing_payment',
    employerId: 'usr_emp_b',
    status: 'completed',
    totalCost: 500,
    platformFee: 75,
  }));

  await writeJson(join(basePath, 'jobs', '2026-06', 'job_open.json'), baseJob({
    id: 'job_open',
    employerId: 'usr_emp_c',
    status: 'open',
    completedAt: null,
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_open_job.json'), basePayment({
    id: 'pay_open_job',
    jobId: 'job_open',
    employerId: 'usr_emp_c',
    status: 'pending',
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_without_job.json'), basePayment({
    id: 'pay_without_job',
    jobId: 'job_missing',
    employerId: 'usr_emp_x',
    status: 'pending',
  }));

  await writeJson(join(basePath, 'payments', 'pay_duplicate_a.json'), basePayment({
    id: 'pay_duplicate_a',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    status: 'completed',
    createdAt: '2026-06-01T00:00:00.000Z',
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_duplicate_b.json'), basePayment({
    id: 'pay_duplicate_b',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    status: 'completed',
    createdAt: '2026-06-02T00:00:00.000Z',
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_bad_equation.json'), basePayment({
    id: 'pay_bad_equation',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    amount: 300,
    platformFee: 40,
    workerPayout: 100,
    status: 'completed',
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_negative.json'), basePayment({
    id: 'pay_negative',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    amount: -1,
    platformFee: 0,
    workerPayout: -1,
    status: 'completed',
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_unknown_status.json'), basePayment({
    id: 'pay_unknown_status',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    status: 'archived',
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_disputed.json'), basePayment({
    id: 'pay_disputed',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    status: 'disputed',
    disputedBy: 'usr_worker',
    disputeReason: 'test',
    disputedAt: '2026-06-03T00:00:00.000Z',
    completedAt: null,
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_attendance_adjusted.json'), basePayment({
    id: 'pay_attendance_adjusted',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    amount: 150,
    platformFee: 23,
    workerPayout: 127,
    status: 'completed',
    attendanceBreakdown: {
      expectedWorkerDays: 1,
      actualWorkerDays: 0.5,
      noShowDays: 0,
      attendanceRate: 0.5,
    },
  }));

  await writeText(join(basePath, 'payments', '2026-06', 'pay_corrupt.json'), '{ not valid json');

  const before = await snapshotDir(basePath);

  const result = runScript([
    '--json',
    '--include-previews',
    '--max-preview',
    '50',
    '--base-path',
    basePath,
  ]);

  const after = await snapshotDir(basePath);

  assert.equal(result.status, 1);
  assert.ok(result.parsed);
  assert.deepEqual(after, before, 'payment dry-run must not mutate any source files');

  const report = result.parsed;

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.mutationPerformed, false);
  assert.equal(report.severity, 'critical');
  assert.equal(report.ok, false);

  assert.equal(report.scannedJobFileCount, 3);
  assert.equal(report.scannedPaymentFileCount, 11);
  assert.equal(report.corruptPaymentCount, 1);
  assert.equal(report.duplicateJobPaymentCount, 1);
  assert.equal(report.missingPaymentForCompletedJobCount, 1);
  assert.ok(report.paymentForNonCompletedJobCount >= 1);
  assert.ok(report.paymentWithoutJobCount >= 1);
  assert.equal(report.invalidAmountEquationCount, 1);
  assert.equal(report.invalidAmountCount, 1);
  assert.equal(report.invalidWorkerPayoutCount, 1);
  assert.equal(report.unknownPaymentStatusCount, 1);
  assert.equal(report.disputedPaymentCount, 1);

  assert.ok(report.receiptMissingCount >= 1);
  assert.equal(report.receiptNumberNonTransactionalRisk, true);
  assert.ok(report.wouldInsertLedgerEntryCount >= 1);
  assert.ok(report.wouldInsertReceiptCount >= 1);

  assert.equal(report.importGate.canProceedToLedgerBackfill, false);
  assert.ok(report.importGate.blockers.length >= 1);
  assert.ok(report.importBlockerCount >= 1);
  assert.ok(report.importGate.warnings.length >= 1);
  assert.ok(report.importGate.requiredApprovals.length >= 1);

  assert.equal(report.financeRisk.hasInvalidAmountMath, true);
  assert.equal(report.financeRisk.hasDuplicatePayments, true);
  assert.equal(report.financeRisk.hasPaymentWithoutJob, true);
  assert.equal(report.financeRisk.hasNonCompletedJobPayments, true);
  assert.equal(report.receiptRisk.receiptNumberNonTransactionalRisk, true);

  assert.ok(report.reconciliation.filePaymentCount >= 10);
  assert.equal(report.reconciliation.completedJobCount, 2);
  assert.equal(report.reconciliation.completedJobWithoutPaymentCount, 1);
  assert.equal(report.reconciliation.equationMismatchCount, 1);

  assert.ok(report.previews);
  assert.ok(report.previews.corruptPayments.length >= 1);
  assert.ok(report.previews.duplicateJobPayments.length >= 1);
  assert.ok(report.previews.paymentsWithoutJob.length >= 1);
  assert.ok(report.previews.paymentsForNonCompletedJobs.length >= 1);
  assert.ok(report.previews.completedJobsWithoutPayment.length >= 1);
  assert.ok(report.previews.attendanceAdjustedPayments.length >= 1);
  assert.ok(report.previews.wouldInsertLedgerEntriesPreview.length >= 1);
  assert.ok(report.previews.wouldInsertReceiptsPreview.length >= 1);
});

test('payment backfill dry-run can return warning-only report when import requires approvals but no hard blockers', async () => {
  const basePath = await createTempDataPath();

  await writeJson(join(basePath, 'jobs', '2026-06', 'job_paid.json'), baseJob({
    id: 'job_paid',
    employerId: 'usr_emp_a',
    status: 'completed',
    totalCost: 300,
    platformFee: 45,
  }));

  await writeJson(join(basePath, 'payments', '2026-06', 'pay_paid.json'), basePayment({
    id: 'pay_paid',
    jobId: 'job_paid',
    employerId: 'usr_emp_a',
    amount: 300,
    platformFee: 45,
    workerPayout: 255,
    status: 'completed',
  }));

  const result = runScript([
    '--json',
    '--include-previews',
    '--base-path',
    basePath,
  ]);

  assert.equal(result.status, 0);
  assert.ok(result.parsed);

  const report = result.parsed;

  assert.equal(report.ok, true);
  assert.equal(report.severity, 'warning');
  assert.equal(report.importGate.blockers.length, 0);
  assert.equal(report.importBlockerCount, 0);
  assert.equal(report.importGate.canProceedToLedgerBackfill, false);
  assert.ok(report.importGate.requiredApprovals.some(a => a.code === 'LEGACY_RECEIPT_GAP'));
  assert.equal(report.receiptMissingCount, 1);
  assert.equal(report.receiptNotPersistedCount, 1);
  assert.equal(report.wouldInsertReceiptCount, 1);
  assert.ok(report.wouldInsertLedgerEntryCount >= 4);
});

test('payment backfill dry-run supports status filtering', async () => {
  const basePath = await createTempDataPath();

  await writeJson(join(basePath, 'jobs', 'job_a.json'), baseJob({ id: 'job_a', status: 'completed' }));
  await writeJson(join(basePath, 'payments', 'pay_completed.json'), basePayment({
    id: 'pay_completed',
    jobId: 'job_a',
    status: 'completed',
  }));

  await writeJson(join(basePath, 'payments', 'pay_pending.json'), basePayment({
    id: 'pay_pending',
    jobId: 'job_a',
    status: 'pending',
  }));

  const result = runScript([
    '--json',
    '--status',
    'completed',
    '--base-path',
    basePath,
  ]);

  assert.equal(result.status, 0);
  assert.ok(result.parsed);

  const report = result.parsed;

  assert.equal(report.validPaymentCount, 1);
  assert.equal(report.statusCounts.completed, 1);
  assert.equal(report.statusCounts.pending, undefined);
});

test('payment backfill dry-run honors YAWMIA_DATA_PATH when base path is not passed', async () => {
  const basePath = await createTempDataPath();

  await writeJson(join(basePath, 'jobs', 'job_env.json'), baseJob({
    id: 'job_env',
    status: 'completed',
  }));

  await writeJson(join(basePath, 'payments', 'pay_env.json'), basePayment({
    id: 'pay_env',
    jobId: 'job_env',
    status: 'completed',
  }));

  const result = runScript([
    '--json',
  ], {
    env: {
      YAWMIA_DATA_PATH: basePath,
    },
  });

  assert.equal(result.status, 0);
  assert.ok(result.parsed);
  assert.equal(result.parsed.basePath, resolve(basePath));
  assert.equal(result.parsed.validPaymentCount, 1);
});

test('payment backfill dry-run source remains runtime-neutral and does not import payment services, DB, queue, or receipt generator', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf-8');

  const forbiddenSnippets = [
    '../server.js',
    '../server/router.js',
    '../server/services/payments.js',
    '../server/services/financialExport.js',
    '../server/services/jobs.js',
    '../server/services/applications.js',
    '../server/services/attendance.js',
    '../server/services/opsQueue.js',
    '../server/services/queueWorkers.js',
    '../server/services/schedulerRegistry.js',
    '../server/services/database.js',
    '../server/services/eventBus.js',
    '../server/repositories',
    'generateReceipt',
    'createPayment',
    'confirmPayment',
    'completePayment',
    'disputePayment',
    'atomicWrite',
    'writeFile(',
    'appendFile',
    'unlink(',
    'rm(',
    'rename(',
    'mkdir(',
    'enqueueJob',
    'eventBus.emit',
    'pg',
    'node-pg-migrate',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `payment dry-run script must not include runtime/mutation snippet: ${snippet}`
    );
  }

  assert.equal(source.includes('FORBIDDEN_MUTATION_FLAG'), true);
  assert.equal(source.includes('--confirm'), true);
  assert.equal(source.includes('mutationPerformed: false'), true);
  assert.equal(source.includes('receiptNumberNonTransactionalRisk'), true);
  assert.equal(source.includes('wouldInsertLedgerEntryCount'), true);
});
