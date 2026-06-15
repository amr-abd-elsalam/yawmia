// ═══════════════════════════════════════════════════════════════
// tests/adapters/receipt-repository.harness.test.js
// Patch 81 — Receipt Repository DB-test Harness Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Prepare a safe, skipped-by-default harness for future PostgreSQL-backed
//   ReceiptRepository adapter behavior tests.
//
// Safety:
//   - no pg dependency
//   - no database connection
//   - no PgReceiptRepository import
//   - no ReceiptRepository runtime import
//   - no PgTransactionManager import
//   - no TransactionManager runtime import
//   - no PaymentLedgerRepository runtime import
//   - no migrations
//   - no SQL execution
//   - no payment import
//   - no ledger writes
//   - no receipt generation
//   - no receipt number allocation
//   - no queue workers
//   - no schedulers
//   - no server/router import
//   - no production data mutation
//
// This file is intentionally a harness skeleton only.
// Future adapter behavior tests must replace the skip path only after:
//   1) a database client dependency is approved/installed in a separate patch,
//   2) payment/receipt schemas are explicitly run against a guarded test DB,
//   3) inactive ReceiptRepository and TransactionManager adapters exist behind runtime-off flags,
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

const REQUIRED_RECEIPT_BEHAVIOR_CATEGORIES = Object.freeze([
  'schema_smoke',
  'receipt_sequence_allocation',
  'receipt_number_format',
  'receipt_issue',
  'find_by_payment',
  'find_by_receipt_number',
  'receipt_idempotency',
  'receipt_uniqueness',
  'concurrent_receipt_issue',
  'rollback_does_not_orphan_receipt',
  'receipt_ledger_coupling',
  'receipt_outbox_coupling',
  'retroactive_receipt_policy',
  'backfill_receipt_disabled_by_default',
  'failure_mode_rollback',
]);

const REQUIRED_RECEIPT_CONTRACT_METHODS = Object.freeze([
  'findByPayment',
  'findByReceiptNumber',
  'allocateReceiptNumber',
  'issue',
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

test('ReceiptRepository DB harness is blocked by default before any DB work', (t) => {
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
      'default ReceiptRepository DB harness must be blocked by guard policy'
    );

    return;
  }

  t.skip('DB env is explicitly enabled, but ReceiptRepository adapter is intentionally not implemented in this harness skeleton.');
});

test('ReceiptRepository harness requires postgres test database guard before future DB connection', () => {
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

test('ReceiptRepository harness rejects production-like database targets through guard policy', () => {
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

test('ReceiptRepository harness tracks required receipt repository contract structurally', () => {
  const names = listPaymentRepositoryContractNames();

  assert.ok(names.includes('ReceiptRepository'), 'missing ReceiptRepository contract');

  const methods = getPaymentRepositoryContract('ReceiptRepository');
  assert.ok(Array.isArray(methods));
  assert.ok(methods.length > 0, 'ReceiptRepository must have required methods');

  for (const methodName of REQUIRED_RECEIPT_CONTRACT_METHODS) {
    assert.ok(
      methods.includes(methodName),
      `ReceiptRepository contract missing method: ${methodName}`
    );
  }

  assert.ok(names.includes('PaymentRepository'), 'PaymentRepository must exist for receipt/payment coupling');
  assert.ok(names.includes('PaymentLedgerRepository'), 'PaymentLedgerRepository must exist for receipt_issued ledger coupling');
  assert.ok(names.includes('OutboxRepository'), 'OutboxRepository must exist for receipt outbox coupling');
  assert.ok(names.includes('TransactionManager'), 'TransactionManager contract marker must exist in payment repository contracts');
});

test('ReceiptRepository harness tracks transaction contracts required for future receipt issuance', () => {
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

test('ReceiptRepository behavior harness enumerates future behavior categories without executing them', () => {
  const required = [
    'schema_smoke',
    'receipt_sequence_allocation',
    'receipt_number_format',
    'receipt_issue',
    'find_by_payment',
    'find_by_receipt_number',
    'receipt_idempotency',
    'receipt_uniqueness',
    'concurrent_receipt_issue',
    'rollback_does_not_orphan_receipt',
    'receipt_ledger_coupling',
    'receipt_outbox_coupling',
    'retroactive_receipt_policy',
    'backfill_receipt_disabled_by_default',
    'failure_mode_rollback',
  ];

  for (const category of required) {
    assert.ok(
      REQUIRED_RECEIPT_BEHAVIOR_CATEGORIES.includes(category),
      `missing receipt behavior category: ${category}`
    );
  }

  assert.equal(Object.isFrozen(REQUIRED_RECEIPT_BEHAVIOR_CATEGORIES), true);
});

test('ReceiptRepository harness confirms required static receipt schema primitives exist', async () => {
  const staticSql = await readFile('migrations/postgres/payments/001_create_payment_ledger_tables.sql', 'utf-8');
  const schemaTest = await readFile('tests/contracts/postgres-payment-ledger-schema-static.test.js', 'utf-8');
  const behaviorMatrix = await readFile('docs/architecture/PAYMENT_LEDGER_ADAPTER_BEHAVIOR_TEST_MATRIX.md', 'utf-8');
  const migrationPlan = await readFile('docs/architecture/PAYMENT_LEDGER_RUNTIME_MIGRATION_PLAN.md', 'utf-8');
  const dryRunDesign = await readFile('docs/architecture/PAYMENT_BACKFILL_DRY_RUN_DESIGN.md', 'utf-8');

  const requiredSqlSnippets = [
    'CREATE TABLE IF NOT EXISTS receipt_sequences',
    'receipt_date DATE PRIMARY KEY',
    'CHECK (next_sequence >= 1)',
    'CREATE TABLE IF NOT EXISTS receipts',
    'receipt_number TEXT NOT NULL UNIQUE',
    'payment_id TEXT NOT NULL REFERENCES payments(id)',
    'CHECK (subtotal = platform_fee + worker_payout)',
    "CHECK (issued_by_role IN ('admin', 'system', 'employer'))",
    'receipts_payment_id_once_idx',
    'receipts_issued_at_idx',
    'retroactive_policy_approval_id',
    'FOR UPDATE',
    'RETURNING next_sequence - 1 AS allocated_sequence',
    "entry_type = 'receipt_issued'",
    'one transaction',
  ];

  for (const snippet of requiredSqlSnippets) {
    assert.ok(
      staticSql.includes(snippet),
      `static payment SQL must include receipt primitive: ${snippet}`
    );
  }

  assert.ok(schemaTest.includes('payment ledger schema scaffold includes dispute and receipt persistence primitives'));
  assert.ok(schemaTest.includes('payment ledger schema scaffold documents transactional receipt sequence allocation'));

  assert.ok(behaviorMatrix.includes('ReceiptRepository Behavior'));
  assert.ok(behaviorMatrix.includes('allocateReceiptNumber'));
  assert.ok(behaviorMatrix.includes('concurrent allocations for same date are unique'));
  assert.ok(behaviorMatrix.includes('issue'));
  assert.ok(behaviorMatrix.includes('findByPayment'));
  assert.ok(behaviorMatrix.includes('findByReceiptNumber'));

  assert.ok(migrationPlan.includes('Persisted Receipt Issuance'));
  assert.ok(migrationPlan.includes('Receipt issuance transaction'));
  assert.ok(migrationPlan.includes('receipt_issued'));

  assert.ok(dryRunDesign.includes('Receipt Gap Policy'));
  assert.ok(dryRunDesign.includes('must not'));
  assert.ok(dryRunDesign.includes('generate receipt numbers'));
  assert.ok(dryRunDesign.includes('persist receipts'));
});

test('ReceiptRepository harness confirms runtime still has no PostgreSQL dependency', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'pg'),
    false,
    'pg must not be installed by ReceiptRepository harness skeleton'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'),
    false,
    'node-pg-migrate must not be installed by ReceiptRepository harness skeleton'
  );
});

test('ReceiptRepository harness source remains runtime-neutral and does not import DB/runtime/server services', async () => {
  const source = await readFile(
    new URL('./receipt-repository.harness.test.js', import.meta.url),
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
      label: 'PgReceiptRepository import',
      pattern: /from\s+['"].*pgReceiptRepository\.js['"]/i,
    },
    {
      label: 'ReceiptRepository runtime implementation import',
      pattern: /from\s+['"].*receiptRepository\.js['"]/i,
    },
    {
      label: 'PgTransactionManager import',
      pattern: /from\s+['"].*pgTransactionManager\.js['"]/i,
    },
    {
      label: 'TransactionManager runtime implementation import',
      pattern: /from\s+['"].*transactionManager\.js['"]/i,
    },
    {
      label: 'payment ledger runtime import',
      pattern: /from\s+['"].*paymentLedgerRepository\.js['"]/i,
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
    {
      label: 'on-demand receipt generator call',
      pattern: new RegExp(['generate', 'Receipt'].join('')),
    },
  ];

  for (const item of forbiddenPatterns) {
    assert.equal(
      item.pattern.test(source),
      false,
      `ReceiptRepository harness must remain runtime-neutral: ${item.label}`
    );
  }

  assert.equal(source.includes('evaluatePostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('assertPostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('t.skip'), true);
});

test('ReceiptRepository harness does not claim adapter implementation or runtime activation', async () => {
  const source = await readFile(
    new URL('./receipt-repository.harness.test.js', import.meta.url),
    'utf-8'
  );

  const requiredSafetyPhrases = [
    'no pg dependency',
    'no database connection',
    'no PgReceiptRepository import',
    'no ReceiptRepository runtime import',
    'no PgTransactionManager import',
    'no TransactionManager runtime import',
    'no PaymentLedgerRepository runtime import',
    'no migrations',
    'no SQL execution',
    'no payment import',
    'no ledger writes',
    'no receipt generation',
    'no receipt number allocation',
    'no queue workers',
    'no schedulers',
    'no server/router import',
    'no production data mutation',
    'harness skeleton only',
  ];

  for (const phrase of requiredSafetyPhrases) {
    assert.ok(
      source.includes(phrase),
      `ReceiptRepository harness must document safety phrase: ${phrase}`
    );
  }

  const forbiddenClaims = [
    ['PgReceiptRepository', 'is implemented'].join(' '),
    ['ReceiptRepository runtime', 'is implemented'].join(' '),
    ['receipt persistence runtime', 'is active'].join(' '),
    ['receipt sequence allocation', 'is active'].join(' '),
    ['persisted receipts', 'are active'].join(' '),
    ['receipt generation', 'is implemented'].join(' '),
    ['receipt', 'ready'].join('-'),
    ['ledger', 'ready'].join('-'),
    ['finance', 'ready'].join('-'),
    ['production', 'ready'].join('-'),
  ];

  for (const claim of forbiddenClaims) {
    assert.equal(
      source.includes(claim),
      false,
      `ReceiptRepository harness must not claim readiness: ${claim}`
    );
  }
});
