// ═══════════════════════════════════════════════════════════════
// tests/adapters/transaction-manager.harness.test.js
// Patch 80 — TransactionManager DB-test Harness Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Prepare a safe, skipped-by-default harness for future PostgreSQL-backed
//   TransactionManager adapter behavior tests.
//
// Safety:
//   - no pg dependency
//   - no database connection
//   - no PgTransactionManager import
//   - no TransactionManager runtime import
//   - no repository runtime adapter imports
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
//   2) required PostgreSQL schemas are explicitly run against a guarded test DB,
//   3) inactive repository adapters exist behind runtime-off flags,
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
  listTransactionManagerContractNames,
  getTransactionManagerContract,
} from '../../server/repositories/transactionManager.contract.js';

import {
  listPaymentRepositoryContractNames,
  getPaymentRepositoryContract,
} from '../../server/repositories/paymentRepository.contract.js';

const REQUIRED_TRANSACTION_BEHAVIOR_CATEGORIES = Object.freeze([
  'schema_smoke',
  'begin_commit',
  'rollback',
  'callback_return_value',
  'callback_throw_rollback',
  'mark_rollback_only',
  'after_commit_hooks',
  'after_rollback_hooks',
  'read_only_transaction_rejects_writes',
  'nested_transaction_policy',
  'transaction_id_stability',
  'concurrent_transaction_isolation',
  'outbox_after_commit_coupling',
  'repository_write_rollback',
  'failure_mode_cleanup',
]);

const REQUIRED_TRANSACTION_CONTRACTS = Object.freeze([
  'TransactionManager',
  'TransactionContext',
  'TransactionResult',
]);

const PAYMENT_CONTRACTS_REQUIRING_TRANSACTION_BOUNDARIES = Object.freeze([
  'PaymentRepository',
  'PaymentLedgerRepository',
  'PaymentDisputeRepository',
  'ReceiptRepository',
  'OutboxRepository',
  'AuditRepository',
]);

function safeTestEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: '',
    YAWMIA_TEST_DATABASE_URL: '',
    ...overrides,
  };
}

test('TransactionManager DB harness is blocked by default before any DB work', (t) => {
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
      'default TransactionManager DB harness must be blocked by guard policy'
    );

    return;
  }

  t.skip('DB env is explicitly enabled, but TransactionManager adapter is intentionally not implemented in this harness skeleton.');
});

test('TransactionManager harness requires postgres test database guard before future DB connection', () => {
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

test('TransactionManager harness rejects production-like database targets through guard policy', () => {
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

test('TransactionManager harness tracks required transaction manager contracts structurally', () => {
  const names = listTransactionManagerContractNames();

  for (const contractName of REQUIRED_TRANSACTION_CONTRACTS) {
    assert.ok(names.includes(contractName), `missing transaction contract: ${contractName}`);

    const methods = getTransactionManagerContract(contractName);
    assert.ok(Array.isArray(methods));
    assert.ok(methods.length > 0, `${contractName} must have required methods`);
  }

  assert.ok(getTransactionManagerContract('TransactionManager').includes('withTransaction'));
  assert.ok(getTransactionManagerContract('TransactionManager').includes('withReadOnlyTransaction'));

  assert.ok(getTransactionManagerContract('TransactionContext').includes('getTransactionId'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('registerAfterCommit'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('registerAfterRollback'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('markRollbackOnly'));
  assert.ok(getTransactionManagerContract('TransactionContext').includes('isRollbackOnly'));

  assert.ok(getTransactionManagerContract('TransactionResult').includes('isCommitted'));
  assert.ok(getTransactionManagerContract('TransactionResult').includes('isRolledBack'));
  assert.ok(getTransactionManagerContract('TransactionResult').includes('getTransactionId'));
});

test('TransactionManager harness tracks payment contracts that require transaction boundaries', () => {
  const paymentContractNames = listPaymentRepositoryContractNames();

  for (const contractName of PAYMENT_CONTRACTS_REQUIRING_TRANSACTION_BOUNDARIES) {
    assert.ok(
      paymentContractNames.includes(contractName),
      `missing payment-side contract that will need transaction integration: ${contractName}`
    );

    const methods = getPaymentRepositoryContract(contractName);
    assert.ok(Array.isArray(methods));
    assert.ok(methods.length > 0, `${contractName} must have methods before transaction-bound adapter tests`);
  }

  assert.ok(getPaymentRepositoryContract('PaymentRepository').includes('findForUpdate'));
  assert.ok(getPaymentRepositoryContract('PaymentLedgerRepository').includes('append'));
  assert.ok(getPaymentRepositoryContract('ReceiptRepository').includes('allocateReceiptNumber'));
  assert.ok(getPaymentRepositoryContract('ReceiptRepository').includes('issue'));
  assert.ok(getPaymentRepositoryContract('OutboxRepository').includes('insert'));
  assert.ok(getPaymentRepositoryContract('AuditRepository').includes('insert'));
});

test('TransactionManager behavior harness enumerates future behavior categories without executing them', () => {
  const required = [
    'schema_smoke',
    'begin_commit',
    'rollback',
    'callback_return_value',
    'callback_throw_rollback',
    'mark_rollback_only',
    'after_commit_hooks',
    'after_rollback_hooks',
    'read_only_transaction_rejects_writes',
    'nested_transaction_policy',
    'transaction_id_stability',
    'concurrent_transaction_isolation',
    'outbox_after_commit_coupling',
    'repository_write_rollback',
    'failure_mode_cleanup',
  ];

  for (const category of required) {
    assert.ok(
      REQUIRED_TRANSACTION_BEHAVIOR_CATEGORIES.includes(category),
      `missing transaction behavior category: ${category}`
    );
  }

  assert.equal(Object.isFrozen(REQUIRED_TRANSACTION_BEHAVIOR_CATEGORIES), true);
});

test('TransactionManager harness confirms runtime still has no PostgreSQL dependency', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'pg'),
    false,
    'pg must not be installed by TransactionManager harness skeleton'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'),
    false,
    'node-pg-migrate must not be installed by TransactionManager harness skeleton'
  );
});

test('TransactionManager harness source remains runtime-neutral and does not import DB/runtime/server services', async () => {
  const source = await readFile(
    new URL('./transaction-manager.harness.test.js', import.meta.url),
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
      label: 'PgTransactionManager import',
      pattern: /from\s+['"].*pgTransactionManager\.js['"]/i,
    },
    {
      label: 'TransactionManager runtime implementation import',
      pattern: /from\s+['"].*transactionManager\.js['"]/i,
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
      `TransactionManager harness must remain runtime-neutral: ${item.label}`
    );
  }

  assert.equal(source.includes('evaluatePostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('assertPostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('t.skip'), true);
});

test('TransactionManager harness does not claim adapter implementation or runtime activation', async () => {
  const source = await readFile(
    new URL('./transaction-manager.harness.test.js', import.meta.url),
    'utf-8'
  );

  const requiredSafetyPhrases = [
    'no pg dependency',
    'no database connection',
    'no PgTransactionManager import',
    'no TransactionManager runtime import',
    'no repository runtime adapter imports',
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
      `TransactionManager harness must document safety phrase: ${phrase}`
    );
  }

  const forbiddenClaims = [
    ['PgTransactionManager', 'is implemented'].join(' '),
    ['TransactionManager runtime', 'is implemented'].join(' '),
    ['DB-backed transaction runtime', 'is active'].join(' '),
    ['payment workflow transactions', 'are active'].join(' '),
    ['outbox transaction coupling', 'is active'].join(' '),
    ['transaction', 'ready'].join('-'),
    ['ledger', 'ready'].join('-'),
    ['receipt', 'ready'].join('-'),
    ['finance', 'ready'].join('-'),
    ['production', 'ready'].join('-'),
  ];

  for (const claim of forbiddenClaims) {
    assert.equal(
      source.includes(claim),
      false,
      `TransactionManager harness must not claim readiness: ${claim}`
    );
  }
});
