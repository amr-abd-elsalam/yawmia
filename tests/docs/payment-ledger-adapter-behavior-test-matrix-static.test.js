// ═══════════════════════════════════════════════════════════════
// tests/docs/payment-ledger-adapter-behavior-test-matrix-static.test.js
// Patch 77 — Payment Ledger Adapter Behavior Test Matrix Static Tests
// ═══════════════════════════════════════════════════════════════
// Safety:
//   - docs-only
//   - no DB connection
//   - no runtime imports
//   - no migration execution
//   - no payment import
//   - no ledger writes
//   - no receipt generation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOC_PATH = 'docs/architecture/PAYMENT_LEDGER_ADAPTER_BEHAVIOR_TEST_MATRIX.md';
const PACKAGE_JSON_PATH = 'package.json';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('payment ledger adapter behavior matrix doc exists and defines non-runtime posture', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    '# Payment Ledger Adapter Behavior Test Matrix',
    'Runtime status: Not implemented',
    'Adapter status: PgPaymentRepository / PaymentLedgerRepository / ReceiptRepository not implemented',
    'Database posture: No DB connection',
    'Migration posture: No migration execution',
    'Ledger posture: No ledger writes',
    'Receipt posture: No receipt generation',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing phrase: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix requires DB test guard before DB connection', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    'YAWMIA_ALLOW_DB_TESTS=true',
    'YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test',
    'assertPostgresTestDatabaseSafety(env)',
    'Default CI must remain DB-free',
    'DB tests must skip by default',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing DB guard phrase: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix covers required repository contracts', async () => {
  const doc = await read(DOC_PATH);

  const requiredContracts = [
    'PaymentRepository',
    'PaymentLedgerRepository',
    'PaymentDisputeRepository',
    'ReceiptRepository',
    'OutboxRepository',
    'AuditRepository',
    'TransactionManager',
  ];

  for (const contract of requiredContracts) {
    assert.ok(doc.includes(contract), `missing contract: ${contract}`);
  }
});

test('payment ledger adapter behavior matrix covers payment projection behavior', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    'createProjection',
    'findById',
    'findForUpdate',
    'findByJob',
    'updateProjection',
    'getFinancialSummary',
    'rejects duplicate payment for same job',
    'enforces amount = platformFee + workerPayout',
    'locks row inside transaction',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing payment repository behavior: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix covers immutable ledger behavior', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    'appends immutable ledger entry',
    'rejects duplicate idempotency_key',
    'UPDATE payment_ledger_entries fails',
    'DELETE payment_ledger_entries fails',
    'repository exposes no update/delete method',
    'findByIdempotencyKey',
    'prevents duplicate appends during concurrent calls',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing ledger behavior: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix covers receipt transaction behavior', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    'allocateReceiptNumber',
    'allocates receipt numbers transactionally',
    'concurrent allocations for same date are unique',
    'issue',
    'inserts persisted receipt snapshot',
    'enforces unique receipt_number',
    'enforces one receipt per payment',
    'findByPayment',
    'read existing receipt returns existing persisted artifact',
    'concurrent receipt requests return one receipt',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing receipt behavior: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix covers workflow transaction rollback behavior', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    'createPaymentForCompletedJob',
    'rolls back payment if ledger append fails',
    'rolls back payment and ledger if outbox insert fails',
    'confirmPayment',
    'disputePayment',
    'completePaymentAsAdmin',
    'issueOrReadReceipt',
    'rolls back all changes on any failure',
    'rollback does not create orphan receipt or orphan ledger entry',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing workflow rollback behavior: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix covers backfill and reconciliation gates', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    'dry-run report is required input',
    'critical dry-run report blocks import',
    'importBlockerCount > 0 blocks import',
    'required approvals must be present',
    'legacy completed payments can be imported without issuing receipts by default',
    'receipt backfill is disabled unless explicit receipt policy approval exists',
    'file payment count equals imported projection count',
    'ledger preview count matches inserted ledger count',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing backfill/reconciliation gate: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix preserves AI advisory-only boundary and forbidden shortcuts', async () => {
  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    'AI may assist',
    'AI must not',
    'choose canonical payment rows',
    'append ledger entries',
    'issue receipts',
    'approve receipt policy',
    'run migrations',
    'Forbidden Shortcuts',
    'uses EventBus as durable financial event truth',
    'bypasses TransactionManager',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `missing AI/shortcut boundary: ${phrase}`);
  }
});

test('payment ledger adapter behavior matrix patch does not add PostgreSQL dependencies', async () => {
  const pkg = JSON.parse(await read(PACKAGE_JSON_PATH));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'pg'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'), false);
});

test('payment ledger adapter behavior matrix static test does not import runtime or DB modules', async () => {
  const source = await readFile(new URL('./payment-ledger-adapter-behavior-test-matrix-static.test.js', import.meta.url), 'utf-8');

  const forbiddenPatterns = [
    /from\s+['"]pg['"]/,
    /import\s*\(\s*['"]pg['"]\s*\)/,
    /server\/services\/payments\.js/,
    /server\/services\/financialExport\.js/,
    /server\/services\/jobs\.js/,
    /server\.js/,
    /server\/router\.js/,
  new RegExp(['node:child', 'process'].join('_'))
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(source),
      false,
      `static docs test must not import runtime/DB dependency: ${pattern}`
    );
  }
});
