// ═══════════════════════════════════════════════════════════════
// tests/contracts/payment-repository-contract.test.js
// Patch 45 — Payment Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify the repository contract skeleton is stable, dependency-free,
//   and matches the payment ledger migration boundary direction.
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
  paymentRepositoryContracts,
  listPaymentRepositoryContractNames,
  getPaymentRepositoryContract,
  validatePaymentRepositoryContract,
  assertPaymentRepositoryContract,
} from '../../server/repositories/paymentRepository.contract.js';

function fakeImplementation(methods) {
  const impl = {};
  for (const methodName of methods) {
    impl[methodName] = async () => null;
  }
  return impl;
}

test('payment repository contract names match the migration boundary plan', () => {
  assert.deepEqual(
    listPaymentRepositoryContractNames().sort(),
    [
      'AuditRepository',
      'OutboxRepository',
      'PaymentDisputeRepository',
      'PaymentLedgerRepository',
      'PaymentRepository',
      'ReceiptRepository',
      'TransactionManager',
    ].sort()
  );
});

test('PaymentRepository contract includes projection-oriented methods only', () => {
  assert.deepEqual(
    getPaymentRepositoryContract('PaymentRepository'),
    [
      'createProjection',
      'findById',
      'findForUpdate',
      'findByJob',
      'listByEmployer',
      'updateProjection',
      'getFinancialSummary',
    ]
  );
});

test('PaymentLedgerRepository contract is append/read/idempotency focused', () => {
  assert.deepEqual(
    getPaymentRepositoryContract('PaymentLedgerRepository'),
    [
      'append',
      'findById',
      'listByPayment',
      'listByJob',
      'findByIdempotencyKey',
    ]
  );
});

test('ReceiptRepository contract includes transactional receipt allocation seam', () => {
  assert.deepEqual(
    getPaymentRepositoryContract('ReceiptRepository'),
    [
      'findByPayment',
      'findByReceiptNumber',
      'allocateReceiptNumber',
      'issue',
    ]
  );
});

test('all declared payment repository contracts can be satisfied structurally by fake adapters', () => {
  for (const contractName of listPaymentRepositoryContractNames()) {
    const methods = getPaymentRepositoryContract(contractName);
    const impl = fakeImplementation(methods);

    const result = validatePaymentRepositoryContract(contractName, impl);

    assert.equal(result.ok, true, `${contractName} should validate`);
    assert.deepEqual(result.missingMethods, []);
    assert.deepEqual(result.invalidMethods, []);
    assert.equal(assertPaymentRepositoryContract(contractName, impl), true);
  }
});

test('contract validation reports missing and invalid methods without executing adapter methods', () => {
  const result = validatePaymentRepositoryContract('PaymentRepository', {
    createProjection: async () => {
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
    result.missingMethods.includes('findForUpdate'),
    'findForUpdate should be reported as missing'
  );

  assert.ok(
    result.missingMethods.includes('updateProjection'),
    'updateProjection should be reported as missing'
  );
});

test('unknown payment repository contract is rejected explicitly', () => {
  const result = validatePaymentRepositoryContract('UnknownRepository', {});

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_PAYMENT_REPOSITORY_CONTRACT');
  assert.deepEqual(result.requiredMethods, []);
});

test('assertPaymentRepositoryContract throws useful metadata on failure', () => {
  assert.throws(
    () => assertPaymentRepositoryContract('ReceiptRepository', {
      findByPayment: async () => null,
    }),
    (err) => {
      assert.equal(err.code, 'PAYMENT_REPOSITORY_CONTRACT_UNSATISFIED');
      assert.equal(err.contractName, 'ReceiptRepository');
      assert.ok(err.missingMethods.includes('issue'));
      assert.ok(err.missingMethods.includes('allocateReceiptNumber'));
      return true;
    }
  );
});

test('payment repository contract skeleton remains runtime-neutral and dependency-free', async () => {
  const source = await readFile(
    new URL('../../server/repositories/paymentRepository.contract.js', import.meta.url),
    'utf-8'
  );

  const forbiddenSnippets = [
    "from 'node:fs",
    'from "node:fs',
    "from '../services/database.js'",
    "from './database.js'",
    "from '../services/payments.js'",
    "from './payments.js'",
    "from 'pg'",
    'from "pg"',
    'postgres',
    'PostgresTransactionManager',
    'YAWMIA_DATA_PATH',
    'atomicWrite',
    'readJSON',
    'server.js',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `contract skeleton must not include runtime/storage dependency snippet: ${snippet}`
    );
  }
});

test('paymentRepositoryContracts export is frozen at top level', () => {
  assert.equal(Object.isFrozen(paymentRepositoryContracts), true);
  assert.equal(Object.isFrozen(paymentRepositoryContracts.PaymentRepository), true);
});
