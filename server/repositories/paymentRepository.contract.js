// ═══════════════════════════════════════════════════════════════
// server/repositories/paymentRepository.contract.js
// Patch 45 — Payment Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Defines repository boundary contracts for the future payment ledger
//   migration without switching runtime storage.
//
// Important:
//   - No database imports
//   - No file-system imports
//   - No PostgreSQL dependency
//   - No runtime adapter activation
//   - No data mutation
//
// This file is a migration-preparation seam only.
// Current production runtime still uses server/services/payments.js.
// ═══════════════════════════════════════════════════════════════

const PAYMENT_REPOSITORY_CONTRACTS = Object.freeze({
  PaymentRepository: Object.freeze([
    'createProjection',
    'findById',
    'findForUpdate',
    'findByJob',
    'listByEmployer',
    'updateProjection',
    'getFinancialSummary',
  ]),

  PaymentLedgerRepository: Object.freeze([
    'append',
    'findById',
    'listByPayment',
    'listByJob',
    'findByIdempotencyKey',
  ]),

  PaymentDisputeRepository: Object.freeze([
    'open',
    'findOpenByPayment',
    'findByPayment',
    'resolve',
    'listByStatus',
  ]),

  ReceiptRepository: Object.freeze([
    'findByPayment',
    'findByReceiptNumber',
    'allocateReceiptNumber',
    'issue',
  ]),

  OutboxRepository: Object.freeze([
    'insert',
    'findPendingForDispatch',
    'markProcessing',
    'markProcessed',
    'markFailed',
  ]),

  AuditRepository: Object.freeze([
    'insert',
    'listByTarget',
  ]),

  TransactionManager: Object.freeze([
    'withTransaction',
  ]),
});

function cloneArray(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * List all known payment repository contract names.
 *
 * @returns {string[]}
 */
export function listPaymentRepositoryContractNames() {
  return Object.keys(PAYMENT_REPOSITORY_CONTRACTS);
}

/**
 * Get required method names for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
export function getPaymentRepositoryContract(contractName) {
  return cloneArray(PAYMENT_REPOSITORY_CONTRACTS[contractName]);
}

/**
 * Validate that an implementation object satisfies a named contract.
 *
 * This is intentionally structural and dependency-free.
 * It does not execute the implementation methods.
 *
 * @param {string} contractName
 * @param {object} implementation
 * @returns {{
 *   ok: boolean,
 *   contractName: string,
 *   requiredMethods: string[],
 *   missingMethods: string[],
 *   invalidMethods: string[],
 *   code?: string
 * }}
 */
export function validatePaymentRepositoryContract(contractName, implementation) {
  const requiredMethods = getPaymentRepositoryContract(contractName);

  if (requiredMethods.length === 0) {
    return {
      ok: false,
      contractName,
      requiredMethods: [],
      missingMethods: [],
      invalidMethods: [],
      code: 'UNKNOWN_PAYMENT_REPOSITORY_CONTRACT',
    };
  }

  const impl = implementation && typeof implementation === 'object'
    ? implementation
    : {};

  const missingMethods = [];
  const invalidMethods = [];

  for (const methodName of requiredMethods) {
    if (!(methodName in impl)) {
      missingMethods.push(methodName);
      continue;
    }

    if (typeof impl[methodName] !== 'function') {
      invalidMethods.push(methodName);
    }
  }

  return {
    ok: missingMethods.length === 0 && invalidMethods.length === 0,
    contractName,
    requiredMethods,
    missingMethods,
    invalidMethods,
  };
}

/**
 * Assert that an implementation satisfies a named contract.
 *
 * @param {string} contractName
 * @param {object} implementation
 * @returns {true}
 * @throws {Error}
 */
export function assertPaymentRepositoryContract(contractName, implementation) {
  const result = validatePaymentRepositoryContract(contractName, implementation);

  if (!result.ok) {
    const err = new Error(
      `Payment repository contract "${contractName}" is not satisfied`
    );
    err.code = result.code || 'PAYMENT_REPOSITORY_CONTRACT_UNSATISFIED';
    err.contractName = contractName;
    err.missingMethods = result.missingMethods;
    err.invalidMethods = result.invalidMethods;
    throw err;
  }

  return true;
}

/**
 * Export frozen contract map for documentation/tests.
 * Consumers must not mutate this object.
 */
export const paymentRepositoryContracts = PAYMENT_REPOSITORY_CONTRACTS;
