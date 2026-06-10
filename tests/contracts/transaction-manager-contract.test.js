// ═══════════════════════════════════════════════════════════════
// tests/contracts/transaction-manager-contract.test.js
// Patch 56 — Core Transaction Manager Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify the transaction manager contract skeleton is stable,
//   dependency-free, and suitable as a future PostgreSQL migration seam.
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
  transactionManagerContracts,
  listTransactionManagerContractNames,
  getTransactionManagerContract,
  validateTransactionManagerContract,
  assertTransactionManagerContract,
} from '../../server/repositories/transactionManager.contract.js';

function fakeImplementation(methods) {
  const impl = {};
  for (const methodName of methods) {
    impl[methodName] = async () => null;
  }
  return impl;
}

test('transaction manager contract names match the core transaction boundary plan', () => {
  assert.deepEqual(
    listTransactionManagerContractNames().sort(),
    [
      'TransactionContext',
      'TransactionManager',
      'TransactionResult',
    ].sort()
  );
});

test('TransactionManager contract exposes read-write and read-only transaction boundaries', () => {
  assert.deepEqual(
    getTransactionManagerContract('TransactionManager'),
    [
      'withTransaction',
      'withReadOnlyTransaction',
    ]
  );
});

test('TransactionContext contract exposes transaction identity and post-commit hooks', () => {
  assert.deepEqual(
    getTransactionManagerContract('TransactionContext'),
    [
      'getTransactionId',
      'registerAfterCommit',
      'registerAfterRollback',
      'markRollbackOnly',
      'isRollbackOnly',
    ]
  );
});

test('TransactionResult contract exposes commit/rollback status without storage details', () => {
  assert.deepEqual(
    getTransactionManagerContract('TransactionResult'),
    [
      'isCommitted',
      'isRolledBack',
      'getTransactionId',
    ]
  );
});

test('all declared transaction manager contracts can be satisfied structurally by fake adapters', () => {
  for (const contractName of listTransactionManagerContractNames()) {
    const methods = getTransactionManagerContract(contractName);
    const impl = fakeImplementation(methods);

    const result = validateTransactionManagerContract(contractName, impl);

    assert.equal(result.ok, true, `${contractName} should validate`);
    assert.deepEqual(result.missingMethods, []);
    assert.deepEqual(result.invalidMethods, []);
    assert.equal(assertTransactionManagerContract(contractName, impl), true);
  }
});

test('contract validation reports missing and invalid methods without executing adapter methods', () => {
  const result = validateTransactionManagerContract('TransactionContext', {
    getTransactionId: async () => {
      throw new Error('must not execute during contract validation');
    },
    registerAfterCommit: 'not-a-function',
  });

  assert.equal(result.ok, false);

  assert.deepEqual(
    result.invalidMethods,
    ['registerAfterCommit']
  );

  assert.ok(
    result.missingMethods.includes('registerAfterRollback'),
    'registerAfterRollback should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('markRollbackOnly'),
    'markRollbackOnly should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('isRollbackOnly'),
    'isRollbackOnly should be reported as missing'
  );
});

test('unknown transaction manager contract is rejected explicitly', () => {
  const result = validateTransactionManagerContract('UnknownContract', {});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_TRANSACTION_MANAGER_CONTRACT');
  assert.deepEqual(result.requiredMethods, []);
});

test('assertTransactionManagerContract throws useful metadata on failure', () => {
  assert.throws(
    () => assertTransactionManagerContract('TransactionManager', {
      withTransaction: async () => null,
    }),
    (err) => {
      assert.equal(err.code, 'TRANSACTION_MANAGER_CONTRACT_UNSATISFIED');
      assert.equal(err.contractName, 'TransactionManager');
      assert.ok(err.missingMethods.includes('withReadOnlyTransaction'));
      return true;
    }
  );
});

test('transaction manager contract skeleton remains runtime-neutral and dependency-free', async () => {
  const source = await readFile(
    new URL('../../server/repositories/transactionManager.contract.js', import.meta.url),
    'utf-8'
  );

  const forbiddenSnippets = [
    "from 'node:fs",
    'from "node:fs',
    "from '../services/database.js'",
    "from './database.js'",
    "from '../services/resourceLock.js'",
    "from './resourceLock.js'",
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

test('transactionManagerContracts export is frozen at top level', () => {
  assert.equal(Object.isFrozen(transactionManagerContracts), true);
  assert.equal(Object.isFrozen(transactionManagerContracts.TransactionManager), true);
  assert.equal(Object.isFrozen(transactionManagerContracts.TransactionContext), true);
  assert.equal(Object.isFrozen(transactionManagerContracts.TransactionResult), true);
});
