// ═══════════════════════════════════════════════════════════════
// tests/docs/payment-backfill-dry-run-design.test.js
// Patch 72 — Payment Backfill Dry-run Design Static Tests
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify payment backfill dry-run design exists and preserves the
//   no-mutation / no-ledger-write / no-receipt-generation posture.
//
// Safety:
//   - no runtime imports
//   - no DB connection
//   - no payment mutation
//   - no ledger writes
//   - no receipt generation
//   - no production data mutation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC_PATH = join(ROOT, 'docs', 'architecture', 'PAYMENT_BACKFILL_DRY_RUN_DESIGN.md');
const README_PATH = join(ROOT, 'docs', 'README.md');
const REALITY_PATH = join(ROOT, 'docs', 'operations', 'DOCS_REALITY_CHECK.md');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');

async function read(path) {
  return await readFile(path, 'utf-8');
}

function assertIncludesAll(source, snippets, label) {
  for (const snippet of snippets) {
    assert.ok(
      source.includes(snippet),
      `${label} missing required snippet: ${snippet}`
    );
  }
}

test('payment backfill dry-run design doc exists and defines dry-run posture', async () => {
  const doc = await read(DOC_PATH);

  assert.ok(doc.includes('# Payment Backfill Dry-run Design'));

  assertIncludesAll(doc, [
    'Patch 72',
    'Dry-run only',
    'Preview only, no ledger writes',
    'Preview only, no receipt generation',
    'No DB writes',
    'no PostgreSQL connection',
    'mutationPerformed = false',
    'No ledger writes.',
    'No receipt generation.',
    'No payment status mutation.',
    'No DB writes.',
    'No production data mutation.',
  ], 'payment backfill design doc');
});

test('payment backfill dry-run design covers legacy file-backed payment/job scanning', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    'data/payments/**/*.json',
    'data/jobs/**/*.json',
    'data/applications/**/*.json',
    'data/attendance/**/*.json',
    'completed jobs without payment records',
    'payments for non-completed jobs',
    'payments whose job file is missing',
    'duplicate payment records per job',
    'payment employerId mismatch with job.employerId',
  ], 'payment backfill source scanning');
});

test('payment backfill dry-run design defines financial invariants', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    'amount >= 0',
    'platformFee >= 0',
    'workerPayout >= 0',
    'amount = platformFee + workerPayout',
    'workersAccepted >= 0',
    'dailyWage >= FINANCIALS.minDailyWage when applicable',
    'durationDays >= 1',
    'one canonical payment per job unless policy says otherwise',
    'job.status should be completed for payment creation',
  ], 'payment financial invariants');
});

test('payment backfill dry-run design defines receipt persistence gap without receipt issuance', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    'receiptMissingCount',
    'receiptNotPersistedCount',
    'receiptNumberNonTransactionalRisk',
    'jobsEligibleForPersistedReceiptPreview',
    'wouldInsertReceiptCount',
    'wouldSkipReceiptCount',
    'generate receipt numbers',
    'persist receipts',
    'write receipt_sequences',
    'write receipts',
    'Do not issue retroactive receipts during dry-run.',
    'Do not allocate historical receipt numbers during dry-run.',
  ], 'receipt gap policy');
});

test('payment backfill dry-run design defines synthetic ledger preview only', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    'Synthetic Ledger Preview Policy',
    'payment_created',
    'platform_fee_accrual',
    'worker_payout_payable',
    'employer_payment_confirmed',
    'payment_dispute_opened',
    'payment_completed',
    'wouldInsertLedgerEntryCount',
    'wouldInsertLedgerEntriesPreview[]',
    'It must not write:',
    'payment_ledger_entries',
    'outbox_events',
  ], 'synthetic ledger preview policy');
});

test('payment backfill dry-run design defines import gate, blockers, warnings, and approvals', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    'Import Gate Policy',
    'importGate.canProceedToLedgerBackfill = false',
    'corrupt payment JSON',
    'duplicate active/canonical payments per job',
    'payment without job',
    'unknown payment status',
    'negative amount',
    'amount != platformFee + workerPayout',
    'missing required payment fields',
    'payment for non-completed job without explicit approval',
    'receipt number conflict if persisted receipts already exist later',
    'completed job without payment',
    'disputed payments',
    'receipt non-persistence',
    'finance_review',
    'admin_approval',
    'receipt_policy_approval',
  ], 'import gate policy');
});

test('payment backfill dry-run design defines stable minimum report shape', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    '"mode": "dry-run"',
    '"reportVersion": 1',
    '"severity": "ok"',
    '"mutationPerformed": false',
    '"scannedPaymentFileCount": 0',
    '"scannedJobFileCount": 0',
    '"validPaymentCount": 0',
    '"corruptPaymentCount": 0',
    '"duplicateJobPaymentCount": 0',
    '"missingPaymentForCompletedJobCount": 0',
    '"paymentForNonCompletedJobCount": 0',
    '"paymentWithoutJobCount": 0',
    '"invalidAmountCount": 0',
    '"invalidPlatformFeeCount": 0',
    '"invalidWorkerPayoutCount": 0',
    '"invalidAmountEquationCount": 0',
    '"unknownPaymentStatusCount": 0',
    '"receiptMissingCount": 0',
    '"receiptNotPersistedCount": 0',
    '"wouldInsertLedgerEntryCount": 0',
    '"wouldInsertReceiptCount": 0',
    '"importGate"',
    '"canProceedToLedgerBackfill": false',
    '"requiredApprovals": []',
  ], 'minimum report shape');
});

test('payment backfill dry-run design links required architecture dependencies', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    'docs/architecture/PAYMENT_LEDGER_RUNTIME_MIGRATION_PLAN.md',
    'server/repositories/transactionManager.contract.js',
    'docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md',
    'docs/architecture/PRIVACY_ACTION_LOG_MINIMUM_DESIGN.md',
    'TransactionManager',
    'persisted receipts',
    'durable outbox',
    'privacy_action_log',
  ], 'architecture dependency links');
});

test('payment backfill dry-run design forbids dangerous runtime behaviors', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    '--confirm',
    '--repair',
    '--write-db',
    '--ledger-write',
    '--generate-receipts',
    '--issue-receipts',
    '--mutate-payments',
    '--complete-payments',
    '--resolve-disputes',
    '--delete-legacy',
    'If any forbidden flag appears, the script must fail closed.',
    'no queue enqueue',
    'no EventBus emit',
    'no atomicWrite',
    'no deleteJSON',
  ], 'forbidden runtime behavior');
});

test('payment backfill dry-run design preserves AI advisory-only boundary', async () => {
  const doc = await read(DOC_PATH);

  assertIncludesAll(doc, [
    'AI may assist with:',
    'summarizing the dry-run report',
    'explaining blockers',
    'drafting finance review notes',
    'AI must not:',
    'choose canonical payments',
    'write ledger entries',
    'issue receipts',
    'approve finance migration',
    'override reconciliation',
    'complete payments',
    'resolve disputes',
    'mutate payment records',
    'run migrations',
  ], 'AI boundary');
});

test('docs README references payment backfill dry-run design', async () => {
  const readme = await read(README_PATH);

  assert.ok(
    readme.includes('docs/architecture/PAYMENT_BACKFILL_DRY_RUN_DESIGN.md'),
    'docs/README.md must reference payment backfill dry-run design'
  );

  assert.ok(
    readme.includes('PAYMENT_BACKFILL_DRY_RUN_DESIGN.md') &&
    readme.includes('does not write ledger entries') &&
    readme.includes('does not generate receipts'),
    'docs/README.md must describe no-ledger/no-receipt posture'
  );
});

test('docs reality check references payment backfill dry-run design', async () => {
  const reality = await read(REALITY_PATH);

  assert.ok(
    reality.includes('docs/architecture/PAYMENT_BACKFILL_DRY_RUN_DESIGN.md'),
    'DOCS_REALITY_CHECK.md must reference payment backfill dry-run design'
  );

  assert.ok(
    reality.includes('No-mutation payment backfill dry-run design') ||
    reality.includes('Payment backfill dry-run design'),
    'DOCS_REALITY_CHECK.md must classify payment backfill dry-run design'
  );
});

test('payment backfill dry-run docs patch does not add PostgreSQL dependencies', async () => {
  const raw = await read(PACKAGE_JSON_PATH);
  const pkg = JSON.parse(raw);

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'pg'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'), false);
});
