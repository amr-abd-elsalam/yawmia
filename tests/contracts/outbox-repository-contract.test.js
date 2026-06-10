// ═══════════════════════════════════════════════════════════════
// tests/contracts/outbox-repository-contract.test.js
// Patch 55 — Durable Outbox Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify the durable outbox repository contract skeleton is stable,
//   dependency-free, and matches the durable outbox migration direction.
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
  outboxRepositoryContracts,
  listOutboxRepositoryContractNames,
  getOutboxRepositoryContract,
  validateOutboxRepositoryContract,
  assertOutboxRepositoryContract,
} from '../../server/repositories/outboxRepository.contract.js';

function fakeImplementation(methods) {
  const impl = {};
  for (const methodName of methods) {
    impl[methodName] = async () => null;
  }
  return impl;
}

test('outbox repository contract names match the durable outbox boundary plan', () => {
  assert.deepEqual(
    listOutboxRepositoryContractNames().sort(),
    [
      'OutboxDispatcherRegistry',
      'OutboxRepository',
      'OutboxTransactionManager',
    ].sort()
  );
});

test('OutboxRepository contract includes insert, claim, lifecycle, aggregate, and idempotency methods', () => {
  assert.deepEqual(
    getOutboxRepositoryContract('OutboxRepository'),
    [
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
    ]
  );
});

test('OutboxDispatcherRegistry contract includes handler registration and lookup methods only', () => {
  assert.deepEqual(
    getOutboxRepositoryContract('OutboxDispatcherRegistry'),
    [
      'registerHandler',
      'getHandler',
      'listHandlers',
    ]
  );
});

test('OutboxTransactionManager contract includes transaction boundary seam', () => {
  assert.deepEqual(
    getOutboxRepositoryContract('OutboxTransactionManager'),
    [
      'withTransaction',
    ]
  );
});

test('all declared outbox repository contracts can be satisfied structurally by fake adapters', () => {
  for (const contractName of listOutboxRepositoryContractNames()) {
    const methods = getOutboxRepositoryContract(contractName);
    const impl = fakeImplementation(methods);

    const result = validateOutboxRepositoryContract(contractName, impl);

    assert.equal(result.ok, true, `${contractName} should validate`);
    assert.deepEqual(result.missingMethods, []);
    assert.deepEqual(result.invalidMethods, []);
    assert.equal(assertOutboxRepositoryContract(contractName, impl), true);
  }
});

test('contract validation reports missing and invalid methods without executing adapter methods', () => {
  const result = validateOutboxRepositoryContract('OutboxRepository', {
    insert: async () => {
      throw new Error('must not execute during contract validation');
    },
    insertMany: 'not-a-function',
  });

  assert.equal(result.ok, false);

  assert.deepEqual(
    result.invalidMethods,
    ['insertMany']
  );

  assert.ok(
    result.missingMethods.includes('findPendingForDispatch'),
    'findPendingForDispatch should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('claimForProcessing'),
    'claimForProcessing should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('markDeadLetter'),
    'markDeadLetter should be reported as missing'
  );
});

test('unknown outbox repository contract is rejected explicitly', () => {
  const result = validateOutboxRepositoryContract('UnknownRepository', {});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_OUTBOX_REPOSITORY_CONTRACT');
  assert.deepEqual(result.requiredMethods, []);
});

test('assertOutboxRepositoryContract throws useful metadata on failure', () => {
  assert.throws(
    () => assertOutboxRepositoryContract('OutboxRepository', {
      insert: async () => null,
      findById: async () => null,
    }),
    (err) => {
      assert.equal(err.code, 'OUTBOX_REPOSITORY_CONTRACT_UNSATISFIED');
      assert.equal(err.contractName, 'OutboxRepository');
      assert.ok(err.missingMethods.includes('insertMany'));
      assert.ok(err.missingMethods.includes('claimForProcessing'));
      assert.ok(err.missingMethods.includes('markProcessed'));
      return true;
    }
  );
});

test('outbox repository contract skeleton remains runtime-neutral and dependency-free', async () => {
  const source = await readFile(
    new URL('../../server/repositories/outboxRepository.contract.js', import.meta.url),
    'utf-8'
  );

  const forbiddenSnippets = [
    "from 'node:fs",
    'from "node:fs',
    "from '../services/database.js'",
    "from './database.js'",
    "from '../services/eventBus.js'",
    "from './eventBus.js'",
    "from '../services/opsQueue.js'",
    "from './opsQueue.js'",
    "from '../services/queueWorkers.js'",
    "from './queueWorkers.js'",
    "from 'pg'",
    'from "pg"',
    'postgres',
    'PostgresTransactionManager',
    'YAWMIA_DATA_PATH',
    'atomicWrite',
    'readJSON',
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

test('outboxRepositoryContracts export is frozen at top level', () => {
  assert.equal(Object.isFrozen(outboxRepositoryContracts), true);
  assert.equal(Object.isFrozen(outboxRepositoryContracts.OutboxRepository), true);
  assert.equal(Object.isFrozen(outboxRepositoryContracts.OutboxDispatcherRegistry), true);
  assert.equal(Object.isFrozen(outboxRepositoryContracts.OutboxTransactionManager), true);
});
