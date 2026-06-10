// ═══════════════════════════════════════════════════════════════
// tests/contracts/session-repository-contract.test.js
// Patch 59 — Session Repository Contract Skeleton Tests
// ═══════════════════════════════════════════════════════════════
// These tests validate the runtime-neutral session repository contract.
// They intentionally do not import server.js, database.js, fs, or PostgreSQL.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sessionRepositoryContracts,
  listSessionRepositoryContractNames,
  getSessionRepositoryContract,
  validateSessionRepositoryContract,
  assertSessionRepositoryContract,
} from '../../server/repositories/sessionRepository.contract.js';

test('session repository contract map is frozen', () => {
  assert.equal(Object.isFrozen(sessionRepositoryContracts), true);

  for (const methods of Object.values(sessionRepositoryContracts)) {
    assert.equal(Object.isFrozen(methods), true);
  }
});

test('lists known session repository contracts', () => {
  assert.deepEqual(
    listSessionRepositoryContractNames().sort(),
    [
      'SessionMigrationRepository',
      'SessionRepository',
      'SessionTokenHasher',
      'SessionTransactionManager',
    ].sort()
  );
});

test('SessionRepository contract includes required runtime migration methods', () => {
  assert.deepEqual(
    getSessionRepositoryContract('SessionRepository'),
    [
      'create',
      'findById',
      'findByTokenHash',
      'findByUser',
      'destroyById',
      'destroyByTokenHash',
      'destroyAllByUser',
      'cleanExpired',
    ]
  );
});

test('SessionTokenHasher contract preserves Patch 51 hashing posture', () => {
  assert.deepEqual(
    getSessionRepositoryContract('SessionTokenHasher'),
    [
      'hashToken',
      'recordIdForToken',
    ]
  );
});

test('SessionMigrationRepository contract includes legacy plaintext migration seam', () => {
  assert.deepEqual(
    getSessionRepositoryContract('SessionMigrationRepository'),
    [
      'findLegacyPlaintextByToken',
      'migrateLegacyPlaintextSession',
      'listLegacyPlaintextSessions',
    ]
  );
});

test('unknown session contract returns explicit error result', () => {
  const result = validateSessionRepositoryContract('NopeRepository', {});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_SESSION_REPOSITORY_CONTRACT');
  assert.deepEqual(result.requiredMethods, []);
});

test('validates missing and invalid methods structurally', () => {
  const result = validateSessionRepositoryContract('SessionRepository', {
    create() {},
    findById() {},
    findByTokenHash: 'not-a-function',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalidMethods, ['findByTokenHash']);
  assert.deepEqual(
    result.missingMethods,
    [
      'findByUser',
      'destroyById',
      'destroyByTokenHash',
      'destroyAllByUser',
      'cleanExpired',
    ]
  );
});

test('assertSessionRepositoryContract returns true for complete implementation', () => {
  const impl = {
    create() {},
    findById() {},
    findByTokenHash() {},
    findByUser() {},
    destroyById() {},
    destroyByTokenHash() {},
    destroyAllByUser() {},
    cleanExpired() {},
  };

  assert.equal(assertSessionRepositoryContract('SessionRepository', impl), true);
});

test('assertSessionRepositoryContract throws structured error for incomplete implementation', () => {
  assert.throws(
    () => assertSessionRepositoryContract('SessionTokenHasher', {
      hashToken() {},
    }),
    (err) => {
      assert.equal(err.code, 'SESSION_REPOSITORY_CONTRACT_UNSATISFIED');
      assert.equal(err.contractName, 'SessionTokenHasher');
      assert.deepEqual(err.missingMethods, ['recordIdForToken']);
      assert.deepEqual(err.invalidMethods, []);
      return true;
    }
  );
});

test('contract file is runtime-neutral and exposes no adapter mode', () => {
  const names = listSessionRepositoryContractNames();

  assert.equal(names.includes('PostgresSessionRepository'), false);
  assert.equal(names.includes('FileSessionRepository'), false);
  assert.equal(names.includes('RuntimeSessionAdapter'), false);
});
