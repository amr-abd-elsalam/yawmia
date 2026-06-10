// ═══════════════════════════════════════════════════════════════
// tests/contracts/privacy-action-log-repository-contract.test.js
// Patch 54 — Privacy Action Log Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify the privacy action log repository contract skeleton is stable,
//   dependency-free, and matches the privacy action log migration direction.
//
// Safety:
//   - no data mutation
//   - no server.js import
//   - no queue workers
//   - no schedulers
//   - no database dependency
//   - no PostgreSQL dependency
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  privacyActionLogRepositoryContracts,
  listPrivacyActionLogRepositoryContractNames,
  getPrivacyActionLogRepositoryContract,
  validatePrivacyActionLogRepositoryContract,
  assertPrivacyActionLogRepositoryContract,
} from '../../server/repositories/privacyActionLogRepository.contract.js';

function fakeImplementation(methods) {
  const impl = {};
  for (const methodName of methods) {
    impl[methodName] = async () => null;
  }
  return impl;
}

test('privacy action log repository contract names match the migration boundary plan', () => {
  assert.deepEqual(
    listPrivacyActionLogRepositoryContractNames().sort(),
    [
      'PrivacyActionLogRepository',
      'PrivacyApprovalRepository',
      'PrivacyOutboxRepository',
      'PrivacyRequestRepository',
      'TransactionManager',
    ].sort()
  );
});

test('PrivacyActionLogRepository contract includes append, lifecycle, read, and idempotency methods', () => {
  assert.deepEqual(
    getPrivacyActionLogRepositoryContract('PrivacyActionLogRepository'),
    [
      'append',
      'markStarted',
      'markCompleted',
      'markFailed',
      'findById',
      'findByIdempotencyKey',
      'listByRequest',
      'listByUser',
    ]
  );
});

test('PrivacyRequestRepository contract includes transaction-oriented request methods', () => {
  assert.deepEqual(
    getPrivacyActionLogRepositoryContract('PrivacyRequestRepository'),
    [
      'create',
      'findById',
      'findForUpdate',
      'updateStatus',
      'listByUser',
      'listByStatus',
    ]
  );
});

test('PrivacyApprovalRepository contract includes validation and one-time consumption seams', () => {
  assert.deepEqual(
    getPrivacyActionLogRepositoryContract('PrivacyApprovalRepository'),
    [
      'validateForAction',
      'consume',
    ]
  );
});

test('PrivacyOutboxRepository contract is intentionally minimal and insert-only for transaction coupling', () => {
  assert.deepEqual(
    getPrivacyActionLogRepositoryContract('PrivacyOutboxRepository'),
    [
      'insert',
    ]
  );
});

test('all declared privacy action log repository contracts can be satisfied structurally by fake adapters', () => {
  for (const contractName of listPrivacyActionLogRepositoryContractNames()) {
    const methods = getPrivacyActionLogRepositoryContract(contractName);
    const impl = fakeImplementation(methods);

    const result = validatePrivacyActionLogRepositoryContract(contractName, impl);

    assert.equal(result.ok, true, `${contractName} should validate`);
    assert.deepEqual(result.missingMethods, []);
    assert.deepEqual(result.invalidMethods, []);
    assert.equal(assertPrivacyActionLogRepositoryContract(contractName, impl), true);
  }
});

test('contract validation reports missing and invalid methods without executing adapter methods', () => {
  const result = validatePrivacyActionLogRepositoryContract('PrivacyActionLogRepository', {
    append: async () => {
      throw new Error('must not execute during contract validation');
    },
    markStarted: 'not-a-function',
  });

  assert.equal(result.ok, false);

  assert.deepEqual(
    result.invalidMethods,
    ['markStarted']
  );

  assert.ok(
    result.missingMethods.includes('markCompleted'),
    'markCompleted should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('findByIdempotencyKey'),
    'findByIdempotencyKey should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('listByRequest'),
    'listByRequest should be reported as missing'
  );
});

test('unknown privacy action log repository contract is rejected explicitly', () => {
  const result = validatePrivacyActionLogRepositoryContract('UnknownRepository', {});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_PRIVACY_ACTION_LOG_REPOSITORY_CONTRACT');
  assert.deepEqual(result.requiredMethods, []);
});

test('assertPrivacyActionLogRepositoryContract throws useful metadata on failure', () => {
  assert.throws(
    () => assertPrivacyActionLogRepositoryContract('PrivacyRequestRepository', {
      create: async () => null,
      findById: async () => null,
    }),
    (err) => {
      assert.equal(err.code, 'PRIVACY_ACTION_LOG_REPOSITORY_CONTRACT_UNSATISFIED');
      assert.equal(err.contractName, 'PrivacyRequestRepository');
      assert.ok(err.missingMethods.includes('findForUpdate'));
      assert.ok(err.missingMethods.includes('updateStatus'));
      return true;
    }
  );
});

test('privacy action log repository contract skeleton remains runtime-neutral and dependency-free', async () => {
  const source = await readFile(
    new URL('../../server/repositories/privacyActionLogRepository.contract.js', import.meta.url),
    'utf-8'
  );

  const forbiddenSnippets = [
    "from 'node:fs",
    'from "node:fs',
    "from '../services/database.js'",
    "from './database.js'",
    "from '../services/privacyRequests.js'",
    "from './privacyRequests.js'",
    "from '../services/userAnonymization.js'",
    "from './userAnonymization.js'",
    "from '../services/adminApprovals.js'",
    "from './adminApprovals.js'",
    "from 'pg'",
    'from "pg"',
    'postgres',
    'PostgresTransactionManager',
    'YAWMIA_DATA_PATH',
    'atomicWrite',
    'readJSON',
    'server.js',
    'queueWorkers.js',
    'opsQueue.js',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `contract skeleton must not include runtime/storage dependency snippet: ${snippet}`
    );
  }
});

test('privacyActionLogRepositoryContracts export is frozen at top level', () => {
  assert.equal(Object.isFrozen(privacyActionLogRepositoryContracts), true);
  assert.equal(Object.isFrozen(privacyActionLogRepositoryContracts.PrivacyActionLogRepository), true);
  assert.equal(Object.isFrozen(privacyActionLogRepositoryContracts.PrivacyRequestRepository), true);
});
