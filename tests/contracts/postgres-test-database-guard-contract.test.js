// ═══════════════════════════════════════════════════════════════
// tests/contracts/postgres-test-database-guard-contract.test.js
// Patch 65 — PostgreSQL Test Database Safety Guard Contract
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify future PostgreSQL adapter tests have a dependency-free,
//   no-connection safety guard before any PgQueueRepository work.
//
// Safety:
//   - no database connection
//   - no pg dependency
//   - no data mutation
//   - no server.js import
//   - no queue workers
//   - no schedulers
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  postgresTestDatabaseGuardContracts,
  postgresTestDatabaseSafetyPolicy,
  listPostgresTestDatabaseGuardContractNames,
  getPostgresTestDatabaseGuardContract,
  validatePostgresTestDatabaseGuardContract,
  assertPostgresTestDatabaseGuardContract,
  parseDatabaseName,
  isAllowedDatabaseName,
  isForbiddenDatabaseName,
  isProductionLikeHost,
  redactDatabaseUrl,
  evaluatePostgresTestDatabaseSafety,
  assertPostgresTestDatabaseSafety,
} from '../../server/repositories/postgresTestDatabaseGuard.contract.js';

function fakeImplementation(methods) {
  const impl = {};
  for (const methodName of methods) {
    impl[methodName] = () => null;
  }
  return impl;
}

test('postgres test database guard contract map is frozen', () => {
  assert.equal(Object.isFrozen(postgresTestDatabaseGuardContracts), true);

  for (const methods of Object.values(postgresTestDatabaseGuardContracts)) {
    assert.equal(Object.isFrozen(methods), true);
  }

  assert.equal(Object.isFrozen(postgresTestDatabaseSafetyPolicy), true);
});

test('postgres test database guard contract names match adapter spike policy boundary', () => {
  assert.deepEqual(
    listPostgresTestDatabaseGuardContractNames().sort(),
    [
      'PostgresTestDatabaseGuard',
      'PostgresTestDatabasePolicy',
    ].sort()
  );
});

test('PostgresTestDatabaseGuard contract includes environment evaluation and redaction methods', () => {
  assert.deepEqual(
    getPostgresTestDatabaseGuardContract('PostgresTestDatabaseGuard'),
    [
      'evaluateEnvironment',
      'assertSafeEnvironment',
      'redactDatabaseUrl',
    ]
  );
});

test('PostgresTestDatabasePolicy contract includes URL/name/host policy methods', () => {
  assert.deepEqual(
    getPostgresTestDatabaseGuardContract('PostgresTestDatabasePolicy'),
    [
      'parseDatabaseName',
      'isAllowedDatabaseName',
      'isForbiddenDatabaseName',
      'isProductionLikeHost',
    ]
  );
});

test('all declared postgres test database guard contracts can be satisfied structurally by fake adapters', () => {
  for (const contractName of listPostgresTestDatabaseGuardContractNames()) {
    const methods = getPostgresTestDatabaseGuardContract(contractName);
    const impl = fakeImplementation(methods);

    const result = validatePostgresTestDatabaseGuardContract(contractName, impl);

    assert.equal(result.ok, true, `${contractName} should validate`);
    assert.deepEqual(result.missingMethods, []);
    assert.deepEqual(result.invalidMethods, []);
    assert.equal(assertPostgresTestDatabaseGuardContract(contractName, impl), true);
  }
});

test('contract validation reports missing and invalid methods without executing adapter methods', () => {
  const result = validatePostgresTestDatabaseGuardContract('PostgresTestDatabaseGuard', {
    evaluateEnvironment: () => {
      throw new Error('must not execute during structural validation');
    },
    assertSafeEnvironment: 'not-a-function',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalidMethods, ['assertSafeEnvironment']);
  assert.ok(result.missingMethods.includes('redactDatabaseUrl'));
});

test('unknown postgres test database guard contract is rejected explicitly', () => {
  const result = validatePostgresTestDatabaseGuardContract('UnknownPostgresGuard', {});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_POSTGRES_TEST_DATABASE_GUARD_CONTRACT');
  assert.deepEqual(result.requiredMethods, []);
});

test('assertPostgresTestDatabaseGuardContract throws useful metadata on failure', () => {
  assert.throws(
    () => assertPostgresTestDatabaseGuardContract('PostgresTestDatabasePolicy', {
      parseDatabaseName: () => null,
    }),
    (err) => {
      assert.equal(err.code, 'POSTGRES_TEST_DATABASE_GUARD_CONTRACT_UNSATISFIED');
      assert.equal(err.contractName, 'PostgresTestDatabasePolicy');
      assert.ok(err.missingMethods.includes('isAllowedDatabaseName'));
      assert.ok(err.missingMethods.includes('isForbiddenDatabaseName'));
      assert.ok(err.missingMethods.includes('isProductionLikeHost'));
      return true;
    }
  );
});

test('parseDatabaseName accepts postgres and postgresql protocols and extracts database name', () => {
  assert.deepEqual(
    parseDatabaseName('postgres://user:pass@localhost:5432/yawmia_test'),
    {
      ok: true,
      databaseName: 'yawmia_test',
      host: 'localhost',
      protocol: 'postgres:',
    }
  );

  assert.deepEqual(
    parseDatabaseName('postgresql://user:pass@127.0.0.1:5432/yawmia_ci'),
    {
      ok: true,
      databaseName: 'yawmia_ci',
      host: '127.0.0.1',
      protocol: 'postgresql:',
    }
  );
});

test('parseDatabaseName rejects invalid or non-postgres URLs', () => {
  assert.equal(parseDatabaseName('').ok, false);
  assert.equal(parseDatabaseName('not-a-url').ok, false);

  const nonPg = parseDatabaseName('mysql://localhost/yawmia_test');
  assert.equal(nonPg.ok, false);
  assert.equal(nonPg.error, 'DATABASE_URL_PROTOCOL_INVALID');

  const missingName = parseDatabaseName('postgres://localhost');
  assert.equal(missingName.ok, false);
  assert.equal(missingName.error, 'DATABASE_NAME_MISSING');
});

test('database name policy requires test/dev/ci and rejects production-like names', () => {
  assert.equal(isAllowedDatabaseName('yawmia_test'), true);
  assert.equal(isAllowedDatabaseName('yawmia_dev'), true);
  assert.equal(isAllowedDatabaseName('yawmia_ci'), true);

  assert.equal(isAllowedDatabaseName('yawmia'), false);
  assert.equal(isAllowedDatabaseName('contest'), false);

  assert.equal(isForbiddenDatabaseName('yawmia_prod'), true);
  assert.equal(isForbiddenDatabaseName('production'), true);
  assert.equal(isForbiddenDatabaseName('yawmia_main'), true);
  assert.equal(isForbiddenDatabaseName('primary'), true);
  assert.equal(isForbiddenDatabaseName('live'), true);

  assert.equal(isForbiddenDatabaseName('yawmia_test'), false);
});

test('host policy rejects production-like host tokens', () => {
  assert.equal(isProductionLikeHost('prod-db.internal'), true);
  assert.equal(isProductionLikeHost('primary.postgres.local'), true);
  assert.equal(isProductionLikeHost('live-db.local'), true);
  assert.equal(isProductionLikeHost('localhost'), false);
  assert.equal(isProductionLikeHost('127.0.0.1'), false);
});

test('redactDatabaseUrl removes password and query string', () => {
  const redacted = redactDatabaseUrl('postgres://amr:secret@localhost:5432/yawmia_test?sslmode=require');

  assert.equal(redacted.includes('secret'), false);
  assert.equal(redacted.includes('sslmode'), false);
  assert.equal(redacted.includes('[redacted]'), true);
  assert.equal(redacted.includes('[user]'), true);
  assert.equal(redacted.includes('yawmia_test'), true);
});

test('evaluatePostgresTestDatabaseSafety blocks by default', () => {
  const result = evaluatePostgresTestDatabaseSafety({});

  assert.equal(result.ok, false);
  assert.equal(result.allowed, false);

  const codes = result.blockers.map(b => b.code);
  assert.ok(codes.includes('DB_TESTS_NOT_EXPLICITLY_ALLOWED'));
  assert.ok(codes.includes('TEST_DATABASE_URL_REQUIRED'));
  assert.equal(result.database.url, null);
});

test('evaluatePostgresTestDatabaseSafety allows explicit local test database', () => {
  const result = evaluatePostgresTestDatabaseSafety({
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: 'true',
    YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_test',
  });

  assert.equal(result.ok, true);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.database.databaseName, 'yawmia_test');
  assert.equal(result.database.host, 'localhost');
});

test('evaluatePostgresTestDatabaseSafety rejects production NODE_ENV', () => {
  const result = evaluatePostgresTestDatabaseSafety({
    NODE_ENV: 'production',
    YAWMIA_ALLOW_DB_TESTS: 'true',
    YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_test',
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some(b => b.code === 'NODE_ENV_PRODUCTION_BLOCKED'));
});

test('evaluatePostgresTestDatabaseSafety rejects production-like database name even with allow flag', () => {
  const result = evaluatePostgresTestDatabaseSafety({
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: 'true',
    YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_prod',
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some(b => b.code === 'FORBIDDEN_DATABASE_NAME'));
});

test('evaluatePostgresTestDatabaseSafety rejects database name that is not clearly test/dev/ci', () => {
  const result = evaluatePostgresTestDatabaseSafety({
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: 'true',
    YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia',
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some(b => b.code === 'DATABASE_NAME_NOT_CLEARLY_TEST'));
});

test('evaluatePostgresTestDatabaseSafety rejects production-like hosts and warns on non-local safe hosts', () => {
  const prodHost = evaluatePostgresTestDatabaseSafety({
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: 'true',
    YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@prod-db.internal:5432/yawmia_test',
  });

  assert.equal(prodHost.ok, false);
  assert.ok(prodHost.blockers.some(b => b.code === 'PRODUCTION_LIKE_DATABASE_HOST'));

  const remoteSafeHost = evaluatePostgresTestDatabaseSafety({
    NODE_ENV: 'test',
    YAWMIA_ALLOW_DB_TESTS: 'true',
    YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@db-ci.internal:5432/yawmia_test',
  });

  assert.equal(remoteSafeHost.ok, true);
  assert.ok(remoteSafeHost.warnings.some(w => w.code === 'NON_LOCAL_TEST_DATABASE_HOST'));
});

test('assertPostgresTestDatabaseSafety returns true for safe env and throws structured error for unsafe env', () => {
  assert.equal(
    assertPostgresTestDatabaseSafety({
      NODE_ENV: 'test',
      YAWMIA_ALLOW_DB_TESTS: 'true',
      YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_test',
    }),
    true
  );

  assert.throws(
    () => assertPostgresTestDatabaseSafety({
      NODE_ENV: 'production',
      YAWMIA_ALLOW_DB_TESTS: 'true',
      YAWMIA_TEST_DATABASE_URL: 'postgres://user:pass@localhost:5432/yawmia_test',
    }),
    (err) => {
      assert.equal(err.code, 'POSTGRES_TEST_DATABASE_UNSAFE');
      assert.ok(Array.isArray(err.blockers));
      assert.ok(err.blockers.some(b => b.code === 'NODE_ENV_PRODUCTION_BLOCKED'));
      return true;
    }
  );
});

test('postgres test database guard contract skeleton remains runtime-neutral and dependency-free', async () => {
  const source = await readFile(
    new URL('../../server/repositories/postgresTestDatabaseGuard.contract.js', import.meta.url),
    'utf-8'
  );

  const forbiddenSnippets = [
    "from 'node:fs",
    'from "node:fs',
    "from 'pg'",
    'from "pg"',
    "from '../services/database.js'",
    "from './database.js'",
    "from '../services/opsQueue.js'",
    "from './opsQueue.js'",
    "from '../services/queueWorkers.js'",
    "from './queueWorkers.js'",
    "from '../services/schedulerRegistry.js'",
    "from './schedulerRegistry.js'",
    "from '../services/processLock.js'",
    "from './processLock.js'",
    "from '../services/resourceLock.js'",
    "from './resourceLock.js'",
    "from '../services/eventBus.js'",
    "from './eventBus.js'",
    'server.js',
    'router.js',
    'QUEUE_ADAPTER',
    'QUEUE_POSTGRES_ENABLED',
    'connect(',
    'Pool(',
    'Client(',
    'process.env',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `guard contract must not include runtime/storage/adapter snippet: ${snippet}`
    );
  }
});
