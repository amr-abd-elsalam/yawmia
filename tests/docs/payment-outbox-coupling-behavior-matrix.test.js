// ═══════════════════════════════════════════════════════════════
// tests/docs/payment-outbox-coupling-behavior-matrix.test.js
// Patch 83 — Payment Outbox Coupling Behavior Matrix Static Test
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Guard the static payment outbox coupling behavior matrix.
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
//   - no dispatcher runtime
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const DOC_PATH = 'docs/architecture/PAYMENT_OUTBOX_COUPLING_BEHAVIOR_MATRIX.md';

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

test('payment outbox coupling matrix document exists and states non-runtime posture', async () => {
  assert.equal(await fileExists(DOC_PATH), true, `${DOC_PATH} must exist`);

  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    '# Payment Outbox Coupling Behavior Matrix',
    'Status: Static behavior matrix / migration preparation',
    'Runtime status: Not implemented',
    'Database posture: No DB connection',
    'Migration posture: No migration execution',
    'Outbox posture: No outbox runtime, no dispatcher runtime',
    'Ledger posture: No ledger writes',
    'Receipt posture: No receipt generation, no receipt number allocation',
    'Adapter posture: No runtime adapter implementation',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `outbox matrix missing phrase: ${phrase}`);
  }
});

test('payment outbox coupling matrix lists required future payment outbox events', async () => {
  const doc = await read(DOC_PATH);

  const requiredEvents = [
    'payment_created',
    'payment_confirmed',
    'payment_disputed',
    'payment_completed',
    'receipt_issued',
    'payment_backfilled',
    'receipt_backfilled',
    'payment_reconciliation_warning',
  ];

  for (const eventName of requiredEvents) {
    assert.ok(doc.includes(eventName), `outbox matrix missing event: ${eventName}`);
  }
});

test('payment outbox coupling matrix defines event envelope and idempotency policy', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'Outbox Event Envelope',
    '"eventType": "payment_created"',
    '"aggregateType": "payment"',
    '"idempotencyKey": "payment_created:job:job_x"',
    'eventType',
    'aggregateType',
    'aggregateId',
    'idempotencyKey',
    'payload',
    'status',
    'createdAt',
    'Event Idempotency Policy',
    'outbox:payment_created:job:{jobId}',
    'outbox:payment_confirmed:{paymentId}:employer:{employerId}',
    'outbox:payment_disputed:{paymentId}:actor:{actorId}',
    'outbox:payment_completed:{paymentId}:admin:{adminId}',
    'outbox:receipt_issued:{paymentId}',
    'outbox:payment_backfilled:{sourcePaymentId}',
    'outbox:receipt_backfilled:{sourcePaymentId}',
    'outbox:payment_reconciliation_warning:{reportId}:{warningCode}',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `outbox matrix missing envelope/idempotency snippet: ${snippet}`);
  }
});

test('payment outbox coupling matrix defines all required workflow coupling groups', async () => {
  const doc = await read(DOC_PATH);

  const workflows = [
    'createPaymentForCompletedJob',
    'confirmPayment',
    'disputePayment',
    'completePaymentAsAdmin',
    'issueOrReadReceipt',
    'paymentBackfillImport',
    'receiptRetroactiveIssuance',
    'reconciliationWarningPublication',
  ];

  for (const workflow of workflows) {
    assert.ok(doc.includes(workflow), `outbox matrix missing workflow coupling group: ${workflow}`);
  }
});

test('payment outbox coupling matrix requires same-transaction outbox inserts and rollback on outbox failure', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'Future payment workflow events must be inserted into a durable outbox in the same transaction',
    'if required outbox insert fails, the payment workflow rolls back',
    'payment projection committed without required outbox event',
    'ledger entry committed without required outbox event',
    'receipt committed without receipt_issued outbox event',
    'outbox event committed without matching payment/ledger/receipt state',
    'if outbox payment_created insert fails, payment projection and ledger entries must roll back',
    'if outbox payment_confirmed insert fails, payment projection update and ledger append must roll back',
    'if outbox payment_disputed insert fails, dispute row, payment projection update, and ledger append must roll back',
    'if outbox payment_completed insert fails, payment completion, ledger append, dispute resolution, audit insert, and approval consumption must roll back',
    'if outbox receipt_issued insert fails, receipt insert, receipt sequence allocation, and receipt_issued ledger append must roll back',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `outbox matrix missing rollback/coupling snippet: ${snippet}`);
  }
});

test('payment outbox coupling matrix preserves EventBus boundary language', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'EventBus Boundary',
    'Current EventBus is in-memory',
    'EventBus is not financial event truth',
    'EventBus may be a local delivery mechanism only after durable outbox event exists',
    'EventBus listeners must tolerate duplicate delivery',
    'emitting payment_created on EventBus before transaction commit',
    'using EventBus as the only record that payment_completed occurred',
    'using EventBus as receipt issuance proof',
    'using EventBus as ledger import proof',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `outbox matrix missing EventBus boundary snippet: ${snippet}`);
  }
});

test('payment outbox coupling matrix defines dispatcher states, crash scenarios, and queue coupling', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'Dispatcher Behavior Matrix',
    'pending',
    'processing',
    'processed',
    'failed',
    'dead_letter',
    'claim pending events atomically',
    'mark processing with lease',
    'mark processed only after send succeeds',
    'move poison events to dead_letter after max attempts',
    'crash before send leaves event pending or recoverable processing',
    'crash after send before mark processed may cause duplicate delivery',
    'Queue Coupling',
    'queue enqueue failure must not erase outbox event',
    'outbox event remains pending until dispatcher succeeds',
    'queue job id is delivery metadata, not financial truth',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `outbox matrix missing dispatcher/queue snippet: ${snippet}`);
  }
});

test('payment outbox coupling matrix defines failure modes, observability, security, and privacy requirements', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'Failure Mode Matrix',
    'outbox insert failure',
    'outbox duplicate idempotency key',
    'dispatcher crash before send',
    'dispatcher crash after send before processed mark',
    'dead-letter threshold exceeded',
    'poison event payload',
    'missing payment reference',
    'missing ledger reference',
    'missing receipt reference',
    'paymentOutboxPendingCount',
    'paymentOutboxDeadLetterCount',
    'paymentOutboxOldestPendingAgeMs',
    'raw tokens',
    'session tokens',
    'authorization headers',
    'API keys',
    'VAPID private keys',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `outbox matrix missing failure/observability/security snippet: ${snippet}`);
  }
});

test('payment outbox coupling matrix preserves runtime activation gate and forbidden shortcuts', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'Runtime Activation Gate',
    'TransactionManager behavior tests',
    'PaymentRepository behavior tests',
    'PaymentLedgerRepository behavior tests',
    'ReceiptRepository behavior tests',
    'OutboxRepository behavior tests',
    'payment workflow transaction tests',
    'dry-run evidence review',
    'finance/admin approvals',
    'receipt policy approval',
    'migration rehearsal',
    'rollback rehearsal',
    'Forbidden Shortcuts',
    'install pg inside this behavior matrix patch',
    'open DB connection from documentation/static tests',
    'execute SQL migrations implicitly',
    'create an outbox dispatcher in this patch',
    'replace EventBus in this patch',
    'claim EventBus is durable',
    'claim queue job equals financial event truth',
    'treat static SQL as executed schema',
    'treat behavior matrix as behavior tests passed',
    'treat harness skeleton as adapter implementation',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `outbox matrix missing gate/no-go snippet: ${snippet}`);
  }
});

test('payment outbox coupling matrix does not claim runtime readiness', async () => {
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
    ['outbox', 'ready'].join('-'),
    ['dispatcher', 'ready'].join('-'),
    ['payment', 'events', 'ready'].join('-'),
  ];

  for (const claim of forbiddenClaims) {
    assert.equal(
      doc.includes(claim),
      false,
      `outbox matrix must not claim runtime readiness: ${claim}`
    );
  }
});

test('payment outbox coupling matrix static test remains runtime-neutral', async () => {
  const source = await readFile(
    new URL('./payment-outbox-coupling-behavior-matrix.test.js', import.meta.url),
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
      `static outbox matrix test must remain runtime-neutral: ${item.label}`
    );
  }
});
