// ═══════════════════════════════════════════════════════════════
// tests/adapters/payment-ledger-repository.harness.test.js
// Patch 79 — Payment Ledger Repository DB-test Harness Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Prepare a safe, skipped-by-default harness for future PostgreSQL payment
//   ledger adapter behavior tests.
//
// Safety:
//   - no pg dependency
//   - no database connection
//   - no PgPaymentRepository import
//   - no PaymentLedgerRepository runtime import
//   - no ReceiptRepository runtime import
//   - no TransactionManager runtime import
//   - no migrations
//   - no SQL execution
//   - no payment import
//   - no ledger writes
//   - no receipt generation
//   - no queue workers
//   - no schedulers
//   - no server/router import
//   - no production data mutation
//
// This file is intentionally a harness skeleton only.
// Future adapter behavior tests must replace the skip path only after:
//   1) a database client dependency is approved/installed in a separate patch,
//   2) payment ledger schema migration is explicitly run against a guarded test DB,
//   3) inactive payment/ledger/receipt adapters exist behind runtime-off flags,
//   4) postgresTestDatabaseGuard passes before any test database connection.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  evaluatePostgresTestDatabaseSafety,
  assertPostgresTestDatabaseSafety,
} from '../../server/repositories/postgresTestDatabaseGuard.contract.js';

import {
  listPaymentRepositoryContractNames,
  getPaymentRepositoryContract,
} from '../../server/repositories/paymentRepository.contract.js';

import {
  listTransactionManagerContractNames,
  getTransactionManagerContract,
} from '../../server/repositories/transactionManager.contract.js';

const REQUIRED_BEHAVIOR_CATEGORIES = Object.freeze([
  'schema_smoke',
  'payment_projection_create_read_update',
  'ledger_append',
  'ledger_append_only_update_delete_prevention',
  'ledger_idempotency',
  'payment_job_consistency',
  'dispute_lifecycle',
  'receipt_sequence_allocation',
  'receipt_issue_idempotency',
  'receipt_uniqueness',
  'transaction_rollback',
  'outbox_coupling',
  'backfill_compatibility',
  'dry_run_reconciliation_compatibility',
  'approval_audit_coupling',
  'failure_mode_rollback',
  'concurrent_ledger_receipt_behavior',
]);

const REQUIRED_PAYMENT_CONTRACTS = Object.freeze([
  'PaymentRepository',
  'PaymentLedgerRepository',
  'PaymentDisputeRepository',
  'ReceiptRepository',
  'OutboxRepository',
  'AuditRepository',
  'TransactionManager',
]);

const REQUIRED_TRANSACTION_CONTRACTS = Object.freeze([
  'TransactionManager',
  'TransactionContext',
  'TransactionResult',
]);

function safeTestEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: '',
    YAWMIA_TEST_DATABASE_URL: '',
    ...overrides,
  };
}

test('Payment ledger DB harness is blocked by default before any DB work', (t) => {
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
      'default payment ledger DB harness must be blocked by guard policy'
    );

    return;
  }

  t.skip('DB env is explicitly enabled, but payment ledger adapters are intentionally not implemented in this harness skeleton.');
});

test('Payment ledger harness requires postgres test database guard before future DB connection', () => {
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

test('Payment ledger harness rejects production-like database targets through guard policy', () => {
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

test('Payment ledger harness tracks required payment repository contracts structurally', () => {
  const names = listPaymentRepositoryContractNames();

  for (const contractName of REQUIRED_PAYMENT_CONTRACTS) {
    assert.ok(names.includes(contractName), `missing payment contract: ${contractName}`);

    const methods = getPaymentRepositoryContract(contractName);
    assert.ok(Array.isArray(methods));
    assert.ok(methods.length > 0, `${contractName} must have required methods`);
  }

  assert.ok(getPaymentRepositoryContract('PaymentRepository').includes('createProjection'));
  assert.ok(getPaymentRepositoryContract('PaymentRepository').includes('findForUpdate'));
  assert.ok(getPaymentRepositoryContract('PaymentLedgerRepository').includes('append'));
  assert.ok(getPaymentRepositoryContract('PaymentLedgerRepository').includes('findByIdempotencyKey'));
  assert.ok(getPaymentRepositoryContract('PaymentDisputeRepository').includes('open'));
  assert.ok(getPaymentRepositoryContract('ReceiptRepository').includes('allocateReceiptNumber'));
  assert.ok(getPaymentRepositoryContract('ReceiptRepository').includes('issue'));
  assert.ok(getPaymentRepositoryContract('OutboxRepository').includes('insert'));
  assert.ok(getPaymentRepositoryContract('AuditRepository').includes('insert'));
  assert.ok(getPaymentRepositoryContract('TransactionManager').includes('withTransaction'));
});

test('Payment ledger harness tracks transaction manager contracts structurally', () => {
  const names = listTransactionManagerContractNames();

  for (const contractName of REQUIRED_TRANSACTION_CONTRACTS) {
    assert.ok(names.includes(contractName), `missing transaction contract: ${contractName}`);

    const methods = getTransactionManagerContract(contractName);
    assert.ok(Array.isArray(methods));
    assert.ok(methods.length > 0, `${contractName} must have required methods`);
  }

  assert.ok(getTransactionManagerContract('TransactionManager').includes('withTransaction'));
  assert.ok(getTransactionManagerContract('TransactionManager').includes('withReadOnlyTransaction'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('registerAfterCommit'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('registerAfterRollback'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('markRollbackOnly'));
  assert.ok(getTransactionManagerContract('TransactionResult').includes('isCommitted'));
  assert.ok(getTransactionManagerContract('TransactionResult').includes('isRolledBack'));
});

test('Payment ledger behavior harness enumerates future behavior categories without executing them', () => {
  const required = [
    'schema_smoke',
    'payment_projection_create_read_update',
    'ledger_append',
    'ledger_append_only_update_delete_prevention',
    'ledger_idempotency',
    'payment_job_consistency',
    'dispute_lifecycle',
    'receipt_sequence_allocation',
    'receipt_issue_idempotency',
    'receipt_uniqueness',
    'transaction_rollback',
    'outbox_coupling',
    'backfill_compatibility',
    'dry_run_reconciliation_compatibility',
    'approval_audit_coupling',
    'failure_mode_rollback',
    'concurrent_ledger_receipt_behavior',
  ];

  for (const category of required) {
    assert.ok(
      REQUIRED_BEHAVIOR_CATEGORIES.includes(category),
      `missing behavior category: ${category}`
    );
  }

  assert.equal(Object.isFrozen(REQUIRED_BEHAVIOR_CATEGORIES), true);
});

test('Payment ledger harness confirms required static payment ledger foundation exists', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'pg'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'), false);

  const staticSql = await readFile('migrations/postgres/payments/001_create_payment_ledger_tables.sql', 'utf-8');
  const schemaTest = await readFile('tests/contracts/postgres-payment-ledger-schema-static.test.js', 'utf-8');
  const staticPolicyTest = await readFile('tests/contracts/payment-ledger-migration-static-policy.test.js', 'utf-8');
  const behaviorMatrix = await readFile('docs/architecture/PAYMENT_LEDGER_ADAPTER_BEHAVIOR_TEST_MATRIX.md', 'utf-8');
  const migrationPlan = await readFile('docs/architecture/PAYMENT_LEDGER_RUNTIME_MIGRATION_PLAN.md', 'utf-8');
  const dryRunScript = await readFile('scripts/payment-backfill-dry-run.js', 'utf-8');

  assert.ok(staticSql.includes('CREATE TABLE IF NOT EXISTS payments'));
  assert.ok(staticSql.includes('CREATE TABLE IF NOT EXISTS payment_ledger_entries'));
  assert.ok(staticSql.includes('CREATE TABLE IF NOT EXISTS payment_disputes'));
  assert.ok(staticSql.includes('CREATE TABLE IF NOT EXISTS receipt_sequences'));
  assert.ok(staticSql.includes('CREATE TABLE IF NOT EXISTS receipts'));
  assert.ok(staticSql.includes('prevent_payment_ledger_mutation'));

  assert.ok(schemaTest.includes('PostgreSQL payment ledger schema scaffold files exist'));
  assert.ok(staticPolicyTest.includes('payment ledger migration static policy'));
  assert.ok(behaviorMatrix.includes('Payment Ledger Adapter Behavior Test Matrix'));
  assert.ok(migrationPlan.includes('Runtime status: Not implemented'));
  assert.ok(dryRunScript.includes("mode: 'dry-run'"));
  assert.ok(dryRunScript.includes('mutationPerformed: false'));
  assert.ok(dryRunScript.includes('FORBIDDEN_MUTATION_FLAG'));
});

test('Payment ledger harness source remains runtime-neutral and does not import DB/runtime/server services', async () => {
  const source = await readFile(
    new URL('./payment-ledger-repository.harness.test.js', import.meta.url),
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
      label: 'PgPaymentRepository import',
      pattern: /from\s+['"].*pgPaymentRepository\.js['"]/i,
    },
    {
      label: 'PgPaymentLedgerRepository import',
      pattern: /from\s+['"].*pgPaymentLedgerRepository\.js['"]/i,
    },
    {
      label: 'payment ledger runtime import',
      pattern: /from\s+['"].*paymentLedgerRepository\.js['"]/i,
    },
    {
      label: 'receipt repository runtime import',
      pattern: /from\s+['"].*receiptRepository\.js['"]/i,
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
      `payment ledger harness must remain runtime-neutral: ${item.label}`
    );
  }

  assert.equal(source.includes('evaluatePostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('assertPostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('t.skip'), true);
});

test('Payment ledger harness does not claim adapter implementation or runtime activation', async () => {
  const source = await readFile(
    new URL('./payment-ledger-repository.harness.test.js', import.meta.url),
    'utf-8'
  );

  const requiredSafetyPhrases = [
    'no pg dependency',
    'no database connection',
    'no PgPaymentRepository import',
    'no PaymentLedgerRepository runtime import',
    'no ReceiptRepository runtime import',
    'no TransactionManager runtime import',
    'no migrations',
    'no SQL execution',
    'no payment import',
    'no ledger writes',
    'no receipt generation',
    'no queue workers',
    'no schedulers',
    'no server/router import',
    'no production data mutation',
    'harness skeleton only',
  ];

  for (const phrase of requiredSafetyPhrases) {
    assert.ok(
      source.includes(phrase),
      `payment ledger harness must document safety phrase: ${phrase}`
    );
  }

  const forbiddenClaims = [
    ['PgPaymentRepository', 'is implemented'].join(' '),
    ['PaymentLedgerRepository', 'is implemented'].join(' '),
    ['ReceiptRepository', 'is implemented'].join(' '),
    ['TransactionManager runtime', 'is implemented'].join(' '),
    ['DB-backed payment runtime', 'is active'].join(' '),
    ['payment ledger runtime', 'is active'].join(' '),
    ['receipt persistence', 'is active'].join(' '),
    ['payment import', 'is implemented'].join(' '),
    ['PostgreSQL payment', 'is production-ready'].join(' '),
    ['finance', 'ready'].join('-'),
    ['ledger', 'ready'].join('-'),
    ['receipt', 'ready'].join('-'),
  ];

  for (const claim of forbiddenClaims) {
    assert.equal(
      source.includes(claim),
      false,
      `payment ledger harness must not claim readiness: ${claim}`
    );
  }
});
