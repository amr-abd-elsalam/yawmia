// ═══════════════════════════════════════════════════════════════
// tests/docs/outbox-dispatcher-behavior-matrix.test.js
// Patch 86 — Outbox Dispatcher Behavior Matrix Static Test
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Guard the static outbox dispatcher behavior matrix.
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

const DOC_PATH = 'docs/architecture/OUTBOX_DISPATCHER_BEHAVIOR_MATRIX.md';

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

test('outbox dispatcher matrix document exists and states non-runtime posture', async () => {
  assert.equal(await fileExists(DOC_PATH), true, `${DOC_PATH} must exist`);

  const doc = await read(DOC_PATH);

  const requiredPhrases = [
    '# Outbox Dispatcher Behavior Matrix',
    'Patch 86 — static behavior matrix / migration preparation',
    'Runtime status: Not implemented',
    'Database posture: No DB connection',
    'Migration posture: No migration execution',
    'Outbox posture: Static SQL scaffold only; no PgOutboxRepository runtime',
    'Dispatcher posture: No OutboxDispatcher runtime',
    'EventBus posture: Current EventBus remains in-memory and is not durable event truth',
    'Queue posture: Current queue runtime remains file-backed',
    'Adapter posture: No runtime adapter implementation',
    'Mutation posture: No data mutation',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `dispatcher matrix missing posture phrase: ${phrase}`);
  }
});

test('outbox dispatcher matrix defines required dispatcher states', async () => {
  const doc = await read(DOC_PATH);

  const requiredStates = [
    'pending',
    'processing',
    'processed',
    'failed',
    'dead_letter',
    'cancelled',
    'pending events are eligible when available_at <= now()',
    'processing events must have lease_until and locked_by',
    'processed events must have processed_at',
    'dead_letter events must preserve last_error',
  ];

  for (const state of requiredStates) {
    assert.ok(doc.includes(state), `dispatcher matrix missing state rule: ${state}`);
  }
});

test('outbox dispatcher matrix defines atomic claim and lease semantics', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'claim pending events atomically',
    'FOR UPDATE SKIP LOCKED',
    "status = 'pending'",
    'available_at <= now()',
    'ORDER BY priority DESC, available_at ASC, created_at ASC',
    "set status = 'processing'",
    'set locked_by = dispatcher id',
    'set lease_until = now() + lease duration',
    'processing events with expired lease_until are recoverable',
    'multiple dispatchers must not claim the same unexpired event',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing claim/lease snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix defines handler registry and send behavior', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'registerHandler maps event_type to a handler',
    'getHandler returns the handler for event_type',
    'missing handler fails safely',
    'handlers must be idempotent',
    'handlers must tolerate duplicate delivery',
    'send only after event is durably claimed',
    'mark processed only after send succeeds',
    'preserve transport diagnostics in outbox_dispatch_attempts',
    'record dispatcher_id',
    'record attempt_number',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing handler/send snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix defines retry and dead-letter behavior', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'failed event remains durable',
    'attempts must be tracked',
    'max_attempts must be enforced',
    'retry_backoff controls available_at',
    'last_error must be preserved',
    'poison event payload must move to dead_letter after max attempts',
    'dead_letter threshold exceeded must preserve diagnostics',
    'dead_letter events are not silently deleted',
    'dead_letter events remain queryable by id',
    'dead_letter events remain queryable by aggregate id',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing retry/dead-letter snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix defines crash scenarios and duplicate delivery policy', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'crash before claim commit',
    'crash after claim before send',
    'crash before send',
    'crash during send',
    'crash after send before mark processed',
    'crash after send before mark processed may cause duplicate delivery',
    'crash after mark processed',
    'dispatcher restarts',
    'Expired leases are recovered safely',
    'Duplicate delivery must be safe because consumers and handlers must be idempotent',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing crash scenario snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix preserves queue and EventBus boundaries', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'outbox event remains financial event truth',
    'queue job id is delivery metadata, not financial truth',
    'queue enqueue failure must not erase outbox event',
    'outbox event remains pending until dispatcher succeeds',
    'file-backed queue runtime remains current runtime until separately migrated',
    'EventBus is not durable event truth',
    'EventBus may be a local delivery mechanism only after durable outbox event exists',
    'EventBus emission must not occur before durable producing transaction commits',
    'EventBus listeners must tolerate duplicate delivery',
    'claiming EventBus delivery equals durable outbox dispatch',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing queue/EventBus snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix defines payment coupling posture without activating runtime', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'payment workflow transaction writes payment state',
    'payment workflow transaction writes ledger state',
    'payment workflow transaction writes receipt state when applicable',
    'payment workflow transaction writes required outbox event insertion',
    'if required outbox insert fails, the payment workflow rolls back',
    'dispatcher only sends after durable outbox event exists',
    'dispatcher failure does not roll back already committed payment transaction',
    'The dispatcher is not allowed to create missing financial facts',
    'payment_created',
    'receipt_issued',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing payment coupling snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix defines observability, security, and privacy requirements', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'outboxPendingCount',
    'outboxProcessingCount',
    'outboxProcessedCount',
    'outboxFailedCount',
    'outboxDeadLetterCount',
    'outboxOldestPendingAgeMs',
    'outboxDispatchP95Ms',
    'raw tokens',
    'session tokens',
    'authorization headers',
    'API keys',
    'VAPID private keys',
    'OTP codes',
    'payload_json must be minimized',
    'last_error must be sanitized',
    'delivery_metadata_json must not contain raw secrets',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing observability/security snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix preserves runtime activation gate and forbidden shortcuts', async () => {
  const doc = await read(DOC_PATH);

  const requiredSnippets = [
    'Runtime Activation Gate',
    'PostgreSQL dependency approval',
    'migration tool approval',
    'OutboxRepository DB behavior tests pass',
    'OutboxDispatcher behavior tests pass',
    'TransactionManager behavior tests pass',
    'payment workflow transaction tests pass',
    'dispatcher crash recovery tests pass',
    'dead-letter and replay tests pass',
    'Forbidden Shortcuts',
    'install pg inside this behavior matrix patch',
    'install node-pg-migrate inside this behavior matrix patch',
    'open DB connection from documentation/static tests',
    'execute SQL migrations implicitly',
    'create an OutboxDispatcher runtime in this patch',
    'create PgOutboxRepository runtime in this patch',
    'replace EventBus in this patch',
    'treat dispatcher matrix as dispatcher implementation',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `dispatcher matrix missing gate/shortcut snippet: ${snippet}`);
  }
});

test('outbox dispatcher matrix does not claim runtime readiness', async () => {
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
      `dispatcher matrix must not claim runtime readiness: ${claim}`
    );
  }
});

test('outbox dispatcher matrix static test remains runtime-neutral', async () => {
  const source = await readFile(
    new URL('./outbox-dispatcher-behavior-matrix.test.js', import.meta.url),
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
      label: 'event bus import',
      pattern: /from\s+['"].*server\/services\/eventBus\.js['"]/,
    },
    {
      label: 'queue runtime service import',
      pattern: /from\s+['"].*server\/services\/opsQueue\.js['"]/,
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
      label: 'child process import',
      pattern: /from\s+['"]node:child_process['"]/,
    },
  ];

  for (const item of forbiddenPatterns) {
    assert.equal(
      item.pattern.test(source),
      false,
      `static dispatcher matrix test must remain runtime-neutral: ${item.label}`
    );
  }
});
