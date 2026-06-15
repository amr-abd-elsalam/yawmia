// ═══════════════════════════════════════════════════════════════
// tests/adapters/outbox-repository.harness.test.js
// Patch 84 — Outbox Repository DB-test Harness Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Prepare a safe, skipped-by-default harness for future PostgreSQL-backed
//   OutboxRepository and outbox dispatcher behavior tests.
//
// Safety:
//   - no pg dependency
//   - no node-pg-migrate dependency
//   - no database connection
//   - no PgOutboxRepository import
//   - no OutboxRepository runtime implementation import
//   - no OutboxDispatcher runtime import
//   - no EventBus runtime import
//   - no migrations
//   - no SQL execution
//   - no outbox event insertion
//   - no outbox dispatch
//   - no payment import
//   - no ledger writes
//   - no receipt generation
//   - no queue workers
//   - no schedulers
//   - no server/router import
//   - no database service import
//   - no production data mutation
//
// This file is intentionally a harness skeleton only.
// Future adapter behavior tests must replace the skip path only after:
//   1) a database client dependency is approved/installed in a separate patch,
//   2) durable outbox schema is explicitly run against a guarded test DB,
//   3) inactive PgOutboxRepository and dispatcher adapters exist behind runtime-off flags,
//   4) postgresTestDatabaseGuard passes before any test database connection.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import {
  evaluatePostgresTestDatabaseSafety,
  assertPostgresTestDatabaseSafety,
} from '../../server/repositories/postgresTestDatabaseGuard.contract.js';

import {
  listOutboxRepositoryContractNames,
  getOutboxRepositoryContract,
} from '../../server/repositories/outboxRepository.contract.js';

import {
  listTransactionManagerContractNames,
  getTransactionManagerContract,
} from '../../server/repositories/transactionManager.contract.js';

import {
  listPaymentRepositoryContractNames,
  getPaymentRepositoryContract,
} from '../../server/repositories/paymentRepository.contract.js';

const REQUIRED_OUTBOX_BEHAVIOR_CATEGORIES = Object.freeze([
  'schema_smoke',
  'insert',
  'insert_many',
  'idempotent_insert',
  'find_by_id',
  'find_by_idempotency_key',
  'list_by_aggregate',
  'find_pending_for_dispatch',
  'claim_for_processing',
  'claim_limit_ordering',
  'claim_lease_semantics',
  'lease_expiry_recovery',
  'mark_processed',
  'mark_failed',
  'retry_backoff',
  'mark_dead_letter',
  'cancel',
  'payload_redaction',
  'aggregate_filtering',
  'replay_by_aggregate',
  'dispatcher_crash_before_send',
  'dispatcher_crash_after_send',
  'transaction_scoped_insert',
  'payment_workflow_coupling',
  'receipt_workflow_coupling',
  'queue_dispatch_coupling',
  'observability_counts',
  'privacy_payload_exclusion',
]);

const REQUIRED_OUTBOX_CONTRACTS = Object.freeze([
  'OutboxRepository',
  'OutboxDispatcherRegistry',
  'OutboxTransactionManager',
]);

const REQUIRED_OUTBOX_REPOSITORY_METHODS = Object.freeze([
  'insert',
  'insertMany',
  'findById',
  'findByIdempotencyKey',
  'listByAggregate',
  'findPendingForDispatch',
  'claimForProcessing',
  'markProcessed',
  'markFailed',
  'markDeadLetter',
  'cancel',
]);

const REQUIRED_FOUNDATION_FILES = Object.freeze([
  'server/repositories/outboxRepository.contract.js',
  'server/repositories/postgresTestDatabaseGuard.contract.js',
  'server/repositories/transactionManager.contract.js',
  'server/repositories/paymentRepository.contract.js',
  'docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md',
  'docs/architecture/PAYMENT_OUTBOX_COUPLING_BEHAVIOR_MATRIX.md',
  'docs/architecture/PAYMENT_WORKFLOW_TRANSACTION_BOUNDARY_MATRIX.md',
  'tests/docs/payment-outbox-coupling-behavior-matrix.test.js',
  'tests/docs/payment-workflow-transaction-boundary-matrix.test.js',
  'tests/adapters/payment-ledger-repository.harness.test.js',
  'tests/adapters/transaction-manager.harness.test.js',
  'tests/adapters/receipt-repository.harness.test.js',
  'tests/adapters/pg-queue-repository.harness.test.js',
]);

function safeTestEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: '',
    YAWMIA_TEST_DATABASE_URL: '',
    ...overrides,
  };
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

test('OutboxRepository DB harness is blocked by default before any DB work', (t) => {
  const safety = evaluatePostgresTestDatabaseSafety(process.env);

  if (!safety.allowed) {
    assert.equal(safety.ok, false);
    assert.equal(safety.allowed, false);
    assert.ok(Array.isArray(safety.blockers));

    const codes = safety.blockers.map(b => b.code);
    assert.ok(
      codes.includes('DB_TESTS_NOT_EXPLICITLY_ALLOWED') ||
      codes.includes('TEST_DATABASE_URL_REQUIRED') ||
      codes.includes('NODE_ENV_PRODUCTION_BLOCKED') ||
      codes.includes('FORBIDDEN_DATABASE_NAME') ||
      codes.includes('DATABASE_NAME_NOT_CLEARLY_TEST') ||
      codes.includes('PRODUCTION_LIKE_DATABASE_HOST'),
      'default OutboxRepository DB harness must be blocked by guard policy'
    );

    return;
  }

  t.skip('DB env is explicitly enabled, but OutboxRepository adapter is intentionally not implemented in this harness skeleton.');
});

test('OutboxRepository harness requires postgres test database guard before future DB connection', () => {
  assert.throws(
    () => assertPostgresTestDatabaseSafety(safeTestEnv()),
    (err) => {
      assert.equal(err.code, 'POSTGRES_TEST_DATABASE_UNSAFE');
      assert.ok(Array.isArray(err.blockers));
      assert.ok(err.blockers.some(b => b.code === 'DB_TESTS_NOT_EXPLICITLY_ALLOWED'));
      assert.ok(err.blockers.some(b => b.code === 'TEST_DATABASE_URL_REQUIRED'));
      return true;
    }
  );

  assert.equal(
    assertPostgresTestDatabaseSafety(safeTestEnv({
      YAWMIA_ALLOW_DB_TESTS: 'true',
      YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_test',
    })),
    true
  );
});

test('OutboxRepository harness rejects production-like database targets through guard policy', () => {
  const unsafeCases = [
    {
      label: 'production NODE_ENV',
      env: {
        NODE_ENV: 'production',
        YAWMIA_ALLOW_DB_TESTS: 'true',
        YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_test',
      },
      expectedCode: 'NODE_ENV_PRODUCTION_BLOCKED',
    },
    {
      label: 'production-like database name',
      env: {
        NODE_ENV: 'test',
        YAWMIA_ALLOW_DB_TESTS: 'true',
        YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_prod',
      },
      expectedCode: 'FORBIDDEN_DATABASE_NAME',
    },
    {
      label: 'database name not clearly test/dev/ci',
      env: {
        NODE_ENV: 'test',
        YAWMIA_ALLOW_DB_TESTS: 'true',
        YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia',
      },
      expectedCode: 'DATABASE_NAME_NOT_CLEARLY_TEST',
    },
    {
      label: 'production-like host',
      env: {
        NODE_ENV: 'test',
        YAWMIA_ALLOW_DB_TESTS: 'true',
        YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@primary-db.internal:5432/yawmia_test',
      },
      expectedCode: 'PRODUCTION_LIKE_DATABASE_HOST',
    },
  ];

  for (const item of unsafeCases) {
    const result = evaluatePostgresTestDatabaseSafety(item.env);

    assert.equal(result.ok, false, item.label);
    assert.ok(
      result.blockers.some(b => b.code === item.expectedCode),
      `${item.label} should include blocker ${item.expectedCode}`
    );
  }
});

test('OutboxRepository harness tracks required outbox repository contracts structurally', () => {
  const names = listOutboxRepositoryContractNames();

  for (const contractName of REQUIRED_OUTBOX_CONTRACTS) {
    assert.ok(names.includes(contractName), `missing outbox contract: ${contractName}`);

    const methods = getOutboxRepositoryContract(contractName);
    assert.ok(Array.isArray(methods));
    assert.ok(methods.length > 0, `${contractName} must have required methods`);
  }

  const outboxMethods = getOutboxRepositoryContract('OutboxRepository');
  for (const methodName of REQUIRED_OUTBOX_REPOSITORY_METHODS) {
    assert.ok(
      outboxMethods.includes(methodName),
      `OutboxRepository contract missing method: ${methodName}`
    );
  }

  assert.ok(getOutboxRepositoryContract('OutboxDispatcherRegistry').includes('registerHandler'));
  assert.ok(getOutboxRepositoryContract('OutboxDispatcherRegistry').includes('getHandler'));
  assert.ok(getOutboxRepositoryContract('OutboxDispatcherRegistry').includes('listHandlers'));

  assert.ok(getOutboxRepositoryContract('OutboxTransactionManager').includes('withTransaction'));
});

test('OutboxRepository harness tracks transaction and payment contracts needed for future coupling', () => {
  const transactionNames = listTransactionManagerContractNames();

  assert.ok(transactionNames.includes('TransactionManager'));
  assert.ok(transactionNames.includes('TransactionContext'));
  assert.ok(transactionNames.includes('TransactionResult'));

  assert.ok(getTransactionManagerContract('TransactionManager').includes('withTransaction'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('registerAfterCommit'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('registerAfterRollback'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('markRollbackOnly'));

  const paymentNames = listPaymentRepositoryContractNames();

  const requiredPaymentSideContracts = [
    'PaymentRepository',
    'PaymentLedgerRepository',
    'ReceiptRepository',
    'OutboxRepository',
    'AuditRepository',
    'TransactionManager',
  ];

  for (const contractName of requiredPaymentSideContracts) {
    assert.ok(
      paymentNames.includes(contractName),
      `missing payment-side contract for outbox coupling: ${contractName}`
    );
  }

  assert.ok(getPaymentRepositoryContract('PaymentRepository').includes('findForUpdate'));
  assert.ok(getPaymentRepositoryContract('PaymentLedgerRepository').includes('append'));
  assert.ok(getPaymentRepositoryContract('ReceiptRepository').includes('issue'));
  assert.ok(getPaymentRepositoryContract('TransactionManager').includes('withTransaction'));
});

test('OutboxRepository behavior harness enumerates future behavior categories without executing them', () => {
  const required = [
    'schema_smoke',
    'insert',
    'insert_many',
    'idempotent_insert',
    'find_by_id',
    'find_by_idempotency_key',
    'list_by_aggregate',
    'find_pending_for_dispatch',
    'claim_for_processing',
    'claim_limit_ordering',
    'claim_lease_semantics',
    'lease_expiry_recovery',
    'mark_processed',
    'mark_failed',
    'retry_backoff',
    'mark_dead_letter',
    'cancel',
    'payload_redaction',
    'aggregate_filtering',
    'replay_by_aggregate',
    'dispatcher_crash_before_send',
    'dispatcher_crash_after_send',
    'transaction_scoped_insert',
    'payment_workflow_coupling',
    'receipt_workflow_coupling',
    'queue_dispatch_coupling',
    'observability_counts',
    'privacy_payload_exclusion',
  ];

  for (const category of required) {
    assert.ok(
      REQUIRED_OUTBOX_BEHAVIOR_CATEGORIES.includes(category),
      `missing outbox behavior category: ${category}`
    );
  }

  assert.equal(Object.isFrozen(REQUIRED_OUTBOX_BEHAVIOR_CATEGORIES), true);
});

test('OutboxRepository harness confirms required static outbox foundation files exist', async () => {
  for (const path of REQUIRED_FOUNDATION_FILES) {
    assert.equal(await fileExists(path), true, `required outbox foundation file missing: ${path}`);
  }

  const minimumDesign = await readFile('docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md', 'utf-8');
  const couplingMatrix = await readFile('docs/architecture/PAYMENT_OUTBOX_COUPLING_BEHAVIOR_MATRIX.md', 'utf-8');
  const couplingMatrixTest = await readFile('tests/docs/payment-outbox-coupling-behavior-matrix.test.js', 'utf-8');

  assert.ok(minimumDesign.includes('Durable Outbox'));
  assert.ok(minimumDesign.includes('Status: Design / contract target') || minimumDesign.includes('Runtime status: Not implemented'));

  assert.ok(couplingMatrix.includes('Payment Outbox Coupling Behavior Matrix'));
  assert.ok(couplingMatrix.includes('Runtime status: Not implemented'));
  assert.ok(couplingMatrix.includes('Outbox posture: No outbox runtime, no dispatcher runtime'));
  assert.ok(couplingMatrix.includes('Future payment workflow events must be inserted into a durable outbox in the same transaction'));
  assert.ok(couplingMatrix.includes('EventBus is not financial event truth'));
  assert.ok(couplingMatrix.includes('Dispatcher Behavior Matrix'));
  assert.ok(couplingMatrix.includes('Runtime Activation Gate'));
  assert.ok(couplingMatrix.includes('Forbidden Shortcuts'));

  assert.ok(couplingMatrixTest.includes('payment outbox coupling matrix document exists and states non-runtime posture'));
  assert.ok(couplingMatrixTest.includes('payment outbox coupling matrix preserves runtime activation gate and forbidden shortcuts'));
});

test('OutboxRepository harness confirms runtime still has no PostgreSQL migration dependencies', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'pg'),
    false,
    'pg must not be installed by OutboxRepository harness skeleton'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'),
    false,
    'node-pg-migrate must not be installed by OutboxRepository harness skeleton'
  );
});

test('OutboxRepository harness source remains runtime-neutral and does not import DB/runtime/server services', async () => {
  const source = await readFile(
    new URL('./outbox-repository.harness.test.js', import.meta.url),
    'utf-8'
  );

  const forbiddenPatterns = [
    {
      label: 'static database client import',
      pattern: /from\s+['"]pg['"]/,
    },
    {
      label: 'dynamic database client import',
      pattern: /import\s*\(\s*['"]pg['"]\s*\)/,
    },
    {
      label: 'node-pg-migrate import',
      pattern: /from\s+['"]node-pg-migrate['"]/,
    },
    {
      label: 'dynamic node-pg-migrate import',
      pattern: /import\s*\(\s*['"]node-pg-migrate['"]\s*\)/,
    },
    {
      label: 'PgOutboxRepository import',
      pattern: /from\s+['"].*pgOutboxRepository\.js['"]/i,
    },
    {
      label: 'OutboxRepository runtime implementation import',
      pattern: /from\s+['"].*outboxRepository\.js['"]/i,
    },
    {
      label: 'OutboxDispatcher runtime import',
      pattern: /from\s+['"].*outboxDispatcher\.js['"]/i,
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
      label: 'application runtime service import',
      pattern: /from\s+['"].*server\/services\/applications\.js['"]/,
    },
    {
      label: 'direct offer runtime service import',
      pattern: /from\s+['"].*server\/services\/directOffer\.js['"]/,
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
      label: 'opsQueue runtime import',
      pattern: /from\s+['"].*opsQueue\.js['"]/,
    },
    {
      label: 'queue worker import',
      pattern: /from\s+['"].*queueWorkers\.js['"]/,
    },
    {
      label: 'scheduler registry import',
      pattern: /from\s+['"].*schedulerRegistry\.js['"]/,
    },
    {
      label: 'database service import',
      pattern: /from\s+['"].*server\/services\/database\.js['"]/,
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
      `OutboxRepository harness must remain runtime-neutral: ${item.label}`
    );
  }

  assert.equal(source.includes('evaluatePostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('assertPostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('t.skip'), true);
});

test('OutboxRepository harness does not claim adapter implementation or runtime activation', async () => {
  const source = await readFile(
    new URL('./outbox-repository.harness.test.js', import.meta.url),
    'utf-8'
  );

  const requiredSafetyPhrases = [
    'no pg dependency',
    'no node-pg-migrate dependency',
    'no database connection',
    'no PgOutboxRepository import',
    'no OutboxRepository runtime implementation import',
    'no OutboxDispatcher runtime import',
    'no EventBus runtime import',
    'no migrations',
    'no SQL execution',
    'no outbox event insertion',
    'no outbox dispatch',
    'no payment import',
    'no ledger writes',
    'no receipt generation',
    'no queue workers',
    'no schedulers',
    'no server/router import',
    'no database service import',
    'no production data mutation',
    'harness skeleton only',
  ];

  for (const phrase of requiredSafetyPhrases) {
    assert.ok(
      source.includes(phrase),
      `OutboxRepository harness must document safety phrase: ${phrase}`
    );
  }

  const forbiddenClaims = [
    ['PgOutboxRepository', 'is implemented'].join(' '),
    ['OutboxRepository runtime', 'is implemented'].join(' '),
    ['OutboxDispatcher runtime', 'is implemented'].join(' '),
    ['durable outbox runtime', 'is active'].join(' '),
    ['payment event durability', 'is active'].join(' '),
    ['EventBus replacement', 'is implemented'].join(' '),
    ['outbox', 'ready'].join('-'),
    ['dispatcher', 'ready'].join('-'),
    ['runtime', 'ready'].join('-'),
    ['adapter', 'ready'].join('-'),
    ['finance', 'ready'].join('-'),
    ['production', 'ready'].join('-'),
  ];

  for (const claim of forbiddenClaims) {
    assert.equal(
      source.includes(claim),
      false,
      `OutboxRepository harness must not claim readiness: ${claim}`
    );
  }
});
