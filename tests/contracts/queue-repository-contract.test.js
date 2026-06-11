// ═══════════════════════════════════════════════════════════════
// tests/contracts/queue-repository-contract.test.js
// Patch 61 — Queue Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify the queue repository contract skeleton is stable,
//   dependency-free, and matches the DB-backed queue migration direction.
//
// Safety:
//   - no data mutation
//   - no server.js import
//   - no queue workers
//   - no schedulers
//   - no database dependency
//   - no runtime queue dependency
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  queueRepositoryContracts,
  listQueueRepositoryContractNames,
  getQueueRepositoryContract,
  validateQueueRepositoryContract,
  assertQueueRepositoryContract,
} from '../../server/repositories/queueRepository.contract.js';

function fakeImplementation(methods) {
  const impl = {};
  for (const methodName of methods) {
    impl[methodName] = async () => null;
  }
  return impl;
}

test('queue repository contract map is frozen', () => {
  assert.equal(Object.isFrozen(queueRepositoryContracts), true);

  for (const methods of Object.values(queueRepositoryContracts)) {
    assert.equal(Object.isFrozen(methods), true);
  }
});

test('queue repository contract names match the DB-backed queue boundary plan', () => {
  assert.deepEqual(
    listQueueRepositoryContractNames().sort(),
    [
      'QueueAttemptRepository',
      'QueueIdempotencyRepository',
      'QueueRepository',
      'QueueTransactionManager',
      'QueueWorkerRegistry',
    ].sort()
  );
});

test('QueueRepository contract includes enqueue, claim, lifecycle, lease recovery, and stats methods', () => {
  assert.deepEqual(
    getQueueRepositoryContract('QueueRepository'),
    [
      'enqueue',
      'findById',
      'findByIdempotencyKey',
      'listByStatus',
      'claimDue',
      'markRunning',
      'markCompleted',
      'markFailed',
      'markDeadLetter',
      'cancel',
      'retry',
      'recoverExpiredLeases',
      'getStats',
    ]
  );
});

test('QueueAttemptRepository contract includes durable attempt lifecycle methods', () => {
  assert.deepEqual(
    getQueueRepositoryContract('QueueAttemptRepository'),
    [
      'startAttempt',
      'completeAttempt',
      'failAttempt',
      'markDeadLettered',
      'listAttemptsByJob',
    ]
  );
});

test('QueueIdempotencyRepository contract includes enqueue idempotency lifecycle methods', () => {
  assert.deepEqual(
    getQueueRepositoryContract('QueueIdempotencyRepository'),
    [
      'create',
      'findByKey',
      'findByJobId',
      'expire',
      'cleanupExpired',
    ]
  );
});

test('QueueWorkerRegistry contract includes worker visibility methods only', () => {
  assert.deepEqual(
    getQueueRepositoryContract('QueueWorkerRegistry'),
    [
      'registerWorker',
      'heartbeat',
      'markStopped',
      'listActiveWorkers',
    ]
  );
});

test('QueueTransactionManager contract exposes read-write and read-only transaction seams', () => {
  assert.deepEqual(
    getQueueRepositoryContract('QueueTransactionManager'),
    [
      'withTransaction',
      'withReadOnlyTransaction',
    ]
  );
});

test('all declared queue repository contracts can be satisfied structurally by fake adapters', () => {
  for (const contractName of listQueueRepositoryContractNames()) {
    const methods = getQueueRepositoryContract(contractName);
    const impl = fakeImplementation(methods);

    const result = validateQueueRepositoryContract(contractName, impl);

    assert.equal(result.ok, true, `${contractName} should validate`);
    assert.deepEqual(result.missingMethods, []);
    assert.deepEqual(result.invalidMethods, []);
    assert.equal(assertQueueRepositoryContract(contractName, impl), true);
  }
});

test('contract validation reports missing and invalid methods without executing adapter methods', () => {
  const result = validateQueueRepositoryContract('QueueRepository', {
    enqueue: async () => {
      throw new Error('must not execute during contract validation');
    },
    findById: 'not-a-function',
  });

  assert.equal(result.ok, false);

  assert.deepEqual(
    result.invalidMethods,
    ['findById']
  );

  assert.ok(
    result.missingMethods.includes('claimDue'),
    'claimDue should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('recoverExpiredLeases'),
    'recoverExpiredLeases should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('markDeadLetter'),
    'markDeadLetter should be reported as missing'
  );
});

test('unknown queue repository contract is rejected explicitly', () => {
  const result = validateQueueRepositoryContract('UnknownQueueRepository', {});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_QUEUE_REPOSITORY_CONTRACT');
  assert.deepEqual(result.requiredMethods, []);
});

test('assertQueueRepositoryContract throws useful metadata on failure', () => {
  assert.throws(
    () => assertQueueRepositoryContract('QueueAttemptRepository', {
      startAttempt: async () => null,
      completeAttempt: async () => null,
    }),
    (err) => {
      assert.equal(err.code, 'QUEUE_REPOSITORY_CONTRACT_UNSATISFIED');
      assert.equal(err.contractName, 'QueueAttemptRepository');
      assert.ok(err.missingMethods.includes('failAttempt'));
      assert.ok(err.missingMethods.includes('markDeadLettered'));
      assert.ok(err.missingMethods.includes('listAttemptsByJob'));
      return true;
    }
  );
});

test('queue repository contract skeleton remains runtime-neutral and dependency-free', async () => {
  const source = await readFile(
    new URL('../../server/repositories/queueRepository.contract.js', import.meta.url),
    'utf-8'
  );

  const forbiddenSnippets = [
    "from 'node:fs",
    'from "node:fs',
    "from '../services/database.js'",
    "from './database.js'",
    "from '../services/opsQueue.js'",
    "from './opsQueue.js'",
    "from '../services/queueWorkers.js'",
    "from './queueWorkers.js'",
    "from '../services/queueStorageIndex.js'",
    "from './queueStorageIndex.js'",
    "from '../services/processLock.js'",
    "from './processLock.js'",
    "from '../services/resourceLock.js'",
    "from './resourceLock.js'",
    "from '../services/eventBus.js'",
    "from './eventBus.js'",
    "from 'pg'",
    'from "pg"',
    'postgres',
    'PostgresQueueRepository',
    'PgQueueRepository',
    'FileQueueRepository',
    'RuntimeQueueAdapter',
    'YAWMIA_DATA_PATH',
    'atomicWrite',
    'readJSON',
    'writeQueueRecord',
    'claimNextJobs',
    'startQueueWorkers',
    'server.js',
    'router.js',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `contract skeleton must not include runtime/storage dependency snippet: ${snippet}`
    );
  }
});

test('queueRepositoryContracts export is frozen at top level', () => {
  assert.equal(Object.isFrozen(queueRepositoryContracts), true);
  assert.equal(Object.isFrozen(queueRepositoryContracts.QueueRepository), true);
  assert.equal(Object.isFrozen(queueRepositoryContracts.QueueAttemptRepository), true);
  assert.equal(Object.isFrozen(queueRepositoryContracts.QueueIdempotencyRepository), true);
  assert.equal(Object.isFrozen(queueRepositoryContracts.QueueWorkerRegistry), true);
  assert.equal(Object.isFrozen(queueRepositoryContracts.QueueTransactionManager), true);
});
