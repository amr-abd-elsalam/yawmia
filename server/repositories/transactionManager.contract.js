// ═══════════════════════════════════════════════════════════════
// server/repositories/transactionManager.contract.js
// Patch 56 — Core Transaction Manager Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Defines a runtime-neutral transaction boundary contract for the
//   future PostgreSQL-backed modular monolith migration.
//
// Important:
//   - No database imports
//   - No file-system imports
//   - No PostgreSQL dependency
//   - No runtime adapter activation
//   - No queue worker activation
//   - No data mutation
//
// This file is a migration-preparation seam only.
// Current production runtime still uses file-backed JSON writes and
// process-local locks.
// ═══════════════════════════════════════════════════════════════

const TRANSACTION_MANAGER_CONTRACTS = Object.freeze({
  TransactionManager: Object.freeze([
    'withTransaction',
    'withReadOnlyTransaction',
  ]),

  TransactionContext: Object.freeze([
    'getTransactionId',
    'registerAfterCommit',
    'registerAfterRollback',
    'markRollbackOnly',
    'isRollbackOnly',
  ]),

  TransactionResult: Object.freeze([
    'isCommitted',
    'isRolledBack',
    'getTransactionId',
  ]),
});

function cloneArray(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * List all known transaction manager contract names.
 *
 * @returns {string[]}
 */
export function listTransactionManagerContractNames() {
  return Object.keys(TRANSACTION_MANAGER_CONTRACTS);
}

/**
 * Get required method names for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
export function getTransactionManagerContract(contractName) {
  return cloneArray(TRANSACTION_MANAGER_CONTRACTS[contractName]);
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
export function validateTransactionManagerContract(contractName, implementation) {
  const requiredMethods = getTransactionManagerContract(contractName);

  if (requiredMethods.length === 0) {
    return {
      ok: false,
      contractName,
      requiredMethods: [],
      missingMethods: [],
      invalidMethods: [],
      code: 'UNKNOWN_TRANSACTION_MANAGER_CONTRACT',
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
export function assertTransactionManagerContract(contractName, implementation) {
  const result = validateTransactionManagerContract(contractName, implementation);

  if (!result.ok) {
    const err = new Error(
      `Transaction manager contract "${contractName}" is not satisfied`
    );
    err.code = result.code || 'TRANSACTION_MANAGER_CONTRACT_UNSATISFIED';
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
export const transactionManagerContracts = TRANSACTION_MANAGER_CONTRACTS;
