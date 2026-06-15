// ═══════════════════════════════════════════════════════════════
// tests/docs/payment-workflow-transaction-boundary-matrix.test.js
// Patch 82 — Payment Workflow Transaction Boundary Matrix Static Test
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Guard the static payment workflow transaction boundary matrix.
//
// Safety:
//   - no DB connection
//   - no pg import
//   - no SQL execution
//   - no runtime adapter import
//   - no server/router import
//   - no payment mutation
//   - no ledger writes
//   - no receipt generation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const DOC_PATH = 'docs/architecture/PAYMENT_WORKFLOW_TRANSACTION_BOUNDARY_MATRIX.md';

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('payment workflow transaction boundary matrix document exists and states non-runtime posture', async () => {
  assert.equal(await fileExists(DOC_PATH), true, `${DOC_PATH} must exist`);

  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    '# Payment Workflow Transaction Boundary Matrix',
    'Status: Static behavior matrix / migration preparation',
    'Runtime status: Not implemented',
    'Database posture: No DB connection',
    'Migration posture: No migration execution',
    'Ledger posture: No ledger writes',
    'Receipt posture: No receipt generation, no receipt number allocation',
    'Adapter posture: No runtime adapter implementation',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `matrix document missing phrase: ${phrase}`);
  }
});

test('payment workflow transaction boundary matrix lists all required future workflows', async () => {
  const doc = await read(DOC_PATH);

  const workflows = [
    'createPaymentForCompletedJob',
    'confirmPayment',
    'disputePayment',
    'completePaymentAsAdmin',
    'issueOrReadReceipt',
    'paymentBackfillImport',
    'receiptRetroactiveIssuance',
  ];

  for (const workflow of workflows) {
    assert.ok(doc.includes(workflow), `matrix must include workflow: ${workflow}`);
  }
});

test('payment workflow transaction boundary matrix defines universal transaction and rollback rules', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'Universal Transaction Rules',
    'begin transaction',
    'load required rows with explicit lock where mutation is possible',
    'apply projection update',
    'append immutable ledger entry or entries',
    'insert durable outbox event',
    'insert audit row when admin or sensitive action',
    'consume approval inside the same transaction when required',
    'if ledger append fails, projection must roll back',
    'if outbox insert fails, projection/ledger/receipt/audit must roll back',
    'payment projection without matching required ledger entries',
    'receipt without receipt_issued ledger entry',
    'admin payment completion without audit',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `matrix missing transaction/rollback snippet: ${snippet}`);
  }
});

test('payment workflow transaction boundary matrix defines idempotency keys for future workflows', async () => {
  const doc = await read(DOC_PATH);

  const requiredKeys = [
    'payment_created:job:{jobId}',
    'payment_confirmed:{paymentId}:employer:{employerId}',
    'payment_disputed:{paymentId}:actor:{actorId}',
    'payment_completed:{paymentId}:admin:{adminId}',
    'receipt_issued:{paymentId}',
    'payment_backfill:{sourcePaymentId}',
    'receipt_backfill:{sourcePaymentId}',
  ];

  for (const key of requiredKeys) {
    assert.ok(doc.includes(key), `matrix missing idempotency key: ${key}`);
  }
});

test('payment workflow transaction boundary matrix connects repositories, ledger, receipts, outbox, audit, and approvals', async () => {
  const doc = await read(DOC_PATH);

  const requiredComponents = [
    'TransactionManager',
    'PaymentRepository',
    'PaymentLedgerRepository',
    'PaymentDisputeRepository',
    'ReceiptRepository',
    'OutboxRepository',
    'AuditRepository',
    'AdminApprovalRepository or approval service',
    'Outbox Coupling Matrix',
    'Audit / Approval Coupling Matrix',
  ];

  for (const component of requiredComponents) {
    assert.ok(doc.includes(component), `matrix missing component/coupling reference: ${component}`);
  }
});

test('payment workflow transaction boundary matrix preserves receipt-specific safety posture', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'issueOrReadReceipt',
    'if receipt exists, return persisted receipt without issuing a new one',
    'allocate receipt number transactionally',
    'insert immutable receipt snapshot',
    'append receipt_issued ledger entry',
    'concurrent calls return one receipt',
    'read existing receipt must not allocate a number',
    'receiptRetroactiveIssuance',
    'Blocked by default',
    'receipt policy approval',
    'finance approval',
    'admin approval',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `matrix missing receipt safety snippet: ${snippet}`);
  }
});

test('payment workflow transaction boundary matrix preserves backfill dry-run gate language', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'paymentBackfillImport',
    'scripts/payment-backfill-dry-run.js',
    'dry-run report exists',
    'dry-run report severity is not critical',
    'importBlockerCount = 0',
    'finance/admin approvals recorded',
    'receipt policy approval recorded when required',
    'do not issue retroactive receipts during payment import',
    'mark receiptMissing in reconciliation evidence only',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `matrix missing backfill gate snippet: ${snippet}`);
  }
});

test('payment workflow transaction boundary matrix preserves no-runtime and no-false-confidence language', async () => {
  const doc = await read(DOC_PATH);

  const requiredNoGoPhrases = [
    'This document does not change that runtime.',
    'Passing this matrix or any harness does not activate runtime behavior.',
    'Do not:',
    'install pg inside a behavior matrix patch',
    'open DB connection from documentation/static tests',
    'execute SQL migrations implicitly',
    'write ledger entries from dry-run',
    'generate receipt numbers from dry-run',
    'persist receipts from dry-run',
    'dual-write production payments secretly',
    'treat static SQL as executed schema',
    'treat behavior matrix as behavior tests passed',
    'treat harness skeleton as adapter implementation',
  ];

  for (const phrase of requiredNoGoPhrases) {
    assert.ok(doc.includes(phrase), `matrix missing no-go phrase: ${phrase}`);
  }
});

test('payment workflow transaction boundary matrix does not claim runtime readiness', async () => {
  const doc = await read(DOC_PATH);

  const forbiddenClaims = [
    ['production', 'ready'].join('-'),
    ['finance', 'ready'].join('-'),
    ['ledger', 'ready'].join('-'),
    ['receipt', 'ready'].join('-'),
    ['PostgreSQL', 'ready'].join('-'),
    ['migration', 'ready'].join('-'),
    ['runtime', 'ready'].join('-'),
    ['adapter', 'ready'].join('-'),
    ['receipt', 'persistence', 'ready'].join('-'),
    ['payment', 'import', 'ready'].join('-'),
    ['transaction', 'ready'].join('-'),
  ];

  for (const claim of forbiddenClaims) {
    assert.equal(
      doc.includes(claim),
      false,
      `matrix must not claim runtime readiness: ${claim}`
    );
  }
});

test('payment workflow transaction boundary matrix static test remains runtime-neutral', async () => {
  const source = await readFile(
    new URL('./payment-workflow-transaction-boundary-matrix.test.js', import.meta.url),
    'utf-8'
  );

  const forbiddenPatterns = [
    {
      label: 'static pg import',
      pattern: /from\s+['"]pg['"]/,
    },
    {
      label: 'dynamic pg import',
      pattern: /import\s*\(\s*['"]pg['"]\s*\)/,
    },
    {
      label: 'server import',
      pattern: /from\s+['"].*server\.js['"]/,
    },
    {
      label: 'router import',
      pattern: /from\s+['"].*server\/router\.js['"]/,
    },
    {
      label: 'payment runtime service import',
      pattern: /from\s+['"].*server\/services\/payments\.js['"]/,
    },
    {
      label: 'job runtime service import',
      pattern: /from\s+['"].*server\/services\/jobs\.js['"]/,
    },
    {
      label: 'financial export runtime import',
      pattern: /from\s+['"].*server\/services\/financialExport\.js['"]/,
    },
    {
      label: 'event bus import',
      pattern: /from\s+['"].*server\/services\/eventBus\.js['"]/,
    },
    {
      label: 'database service import',
      pattern: /from\s+['"].*server\/services\/database\.js['"]/,
    },
    {
      label: 'adapter runtime import',
      pattern: /from\s+['"].*server\/repositories\/.*Repository\.js['"]/,
    },
    {
      label: 'mutation fs import',
      pattern: /from\s+['"]node:fs['"]/,
    },
    {
      label: 'child process import',
      pattern: /from\s+['"]node:child_process['"]/,
    },
  ];

  for (const item of forbiddenPatterns) {
    assert.equal(
      item.pattern.test(source),
      false,
      `static matrix test must remain runtime-neutral: ${item.label}`
    );
  }
});
