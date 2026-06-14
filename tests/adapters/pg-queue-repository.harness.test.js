// ═══════════════════════════════════════════════════════════════
// tests/adapters/pg-queue-repository.harness.test.js
// Patch 70 — PgQueueRepository DB-test Harness Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Prepare a safe, skipped-by-default harness for future PostgreSQL queue
//   adapter behavior tests.
//
// Safety:
//   - no pg dependency
//   - no database connection
//   - no PgQueueRepository import
//   - no migrations
//   - no queue import
//   - no queue workers
//   - no schedulers
//   - no server/router import
//   - no production data mutation
//
// This file is intentionally a harness skeleton only.
// Future adapter behavior tests must replace the skip path only after:
//   1) pg dependency is approved/installed in a separate patch,
//   2) queue schema migration exists and is explicitly run against test DB,
//   3) PgQueueRepository adapter exists behind inactive runtime flags,
//   4) postgresTestDatabaseGuard passes before any DB connection.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  evaluatePostgresTestDatabaseSafety,
  assertPostgresTestDatabaseSafety,
} from '../../server/repositories/postgresTestDatabaseGuard.contract.js';

import {
  listQueueRepositoryContractNames,
  getQueueRepositoryContract,
} from '../../server/repositories/queueRepository.contract.js';

const REQUIRED_BEHAVIOR_CATEGORIES = Object.freeze([
  'schema_smoke',
  'enqueue',
  'idempotent_enqueue',
  'find',
  'list',
  'claimDue',
  'concurrent_claim',
  'markRunning',
  'markCompleted',
  'markFailed',
  'retry_backoff',
  'dead_letter',
  'cancel',
  'recoverExpiredLeases',
  'attempt_lifecycle',
  'idempotency_lifecycle',
  'worker_registry',
  'transaction_scoped_enqueue',
  'read_only_transaction',
  'stats',
  'cleanup',
  'backfill_compatibility',
  'failure_modes',
]);

const REQUIRED_QUEUE_CONTRACTS = Object.freeze([
  'QueueRepository',
  'QueueAttemptRepository',
  'QueueIdempotencyRepository',
  'QueueWorkerRegistry',
  'QueueTransactionManager',
]);

function safeTestEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: '',
    YAWMIA_TEST_DATABASE_URL: '',
    ...overrides,
  };
}

test('PgQueueRepository DB harness is blocked by default before any DB work', (t) => {
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
      'default DB harness must be blocked by guard policy'
    );

    return;
  }

  t.skip('DB env is explicitly enabled, but PgQueueRepository adapter is intentionally not implemented in this harness skeleton.');
});

test('PgQueueRepository harness requires postgres test database guard before future DB connection', () => {
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

test('PgQueueRepository harness rejects production-like database targets through guard policy', () => {
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

test('PgQueueRepository harness tracks required queue repository contracts structurally', () => {
  const names = listQueueRepositoryContractNames();

  for (const contractName of REQUIRED_QUEUE_CONTRACTS) {
    assert.ok(names.includes(contractName), `missing queue contract: ${contractName}`);

    const methods = getQueueRepositoryContract(contractName);
    assert.ok(Array.isArray(methods));
    assert.ok(methods.length > 0, `${contractName} must have required methods`);
  }

  assert.ok(getQueueRepositoryContract('QueueRepository').includes('claimDue'));
  assert.ok(getQueueRepositoryContract('QueueRepository').includes('recoverExpiredLeases'));
  assert.ok(getQueueRepositoryContract('QueueAttemptRepository').includes('startAttempt'));
  assert.ok(getQueueRepositoryContract('QueueIdempotencyRepository').includes('cleanupExpired'));
  assert.ok(getQueueRepositoryContract('QueueWorkerRegistry').includes('heartbeat'));
  assert.ok(getQueueRepositoryContract('QueueTransactionManager').includes('withTransaction'));
});

test('PgQueueRepository behavior harness enumerates future behavior categories without executing them', () => {
  const required = [
    'schema_smoke',
    'enqueue',
    'idempotent_enqueue',
    'claimDue',
    'concurrent_claim',
    'markCompleted',
    'markFailed',
    'dead_letter',
    'recoverExpiredLeases',
    'attempt_lifecycle',
    'idempotency_lifecycle',
    'transaction_scoped_enqueue',
    'backfill_compatibility',
    'failure_modes',
  ];

  for (const category of required) {
    assert.ok(
      REQUIRED_BEHAVIOR_CATEGORIES.includes(category),
      `missing behavior category: ${category}`
    );
  }

  assert.equal(Object.isFrozen(REQUIRED_BEHAVIOR_CATEGORIES), true);
});

test('PgQueueRepository harness source remains runtime-neutral and does not import pg/runtime queue/server', async () => {
  const source = await readFile(
    new URL('./pg-queue-repository.harness.test.js', import.meta.url),
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
      label: 'PgQueueRepository import',
      pattern: /from\s+['"].*pgQueueRepository\.js['"]/i,
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
      label: 'queue worker import',
      pattern: /from\s+['"].*queueWorkers\.js['"]/,
    },
    {
      label: 'scheduler registry import',
      pattern: /from\s+['"].*schedulerRegistry\.js['"]/,
    },
    {
      label: 'opsQueue runtime import',
      pattern: /from\s+['"].*opsQueue\.js['"]/,
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
      `harness must remain runtime-neutral: ${item.label}`
    );
  }

  assert.equal(source.includes('evaluatePostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('assertPostgresTestDatabaseSafety'), true);
  assert.equal(source.includes('t.skip'), true);
});

test('PgQueueRepository harness does not claim adapter implementation or runtime activation', async () => {
  const source = await readFile(
    new URL('./pg-queue-repository.harness.test.js', import.meta.url),
    'utf-8'
  );

  const requiredSafetyPhrases = [
    'no pg dependency',
    'no database connection',
    'no PgQueueRepository import',
    'no migrations',
    'no queue import',
    'no queue workers',
    'no schedulers',
    'no server/router import',
    'no production data mutation',
    'harness skeleton only',
  ];

  for (const phrase of requiredSafetyPhrases) {
    assert.ok(
      source.includes(phrase),
      `harness must document safety phrase: ${phrase}`
    );
  }

  const forbiddenClaims = [
    ['PgQueueRepository', 'is implemented'].join(' '),
    ['DB-backed queue runtime', 'is active'].join(' '),
    ['queue import', 'is implemented'].join(' '),
    ['PostgreSQL queue', 'is production-ready'].join(' '),
  ];

  for (const claim of forbiddenClaims) {
    assert.equal(
      source.includes(claim),
      false,
      `harness must not claim readiness: ${claim}`
    );
  }
});
