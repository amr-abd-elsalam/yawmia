// ═══════════════════════════════════════════════════════════════
// server/repositories/privacyActionLogRepository.contract.js
// Patch 54 — Privacy Action Log Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Defines repository boundary contracts for the future privacy action log
//   and transaction-backed privacy/anonymization workflow.
//
// Important:
//   - No database imports
//   - No file-system imports
//   - No PostgreSQL dependency
//   - No runtime adapter activation
//   - No data mutation
//
// This file is a migration-preparation seam only.
// Current production runtime still uses server/services/privacyRequests.js
// and server/services/userAnonymization.js.
// ═══════════════════════════════════════════════════════════════

const PRIVACY_ACTION_LOG_REPOSITORY_CONTRACTS = Object.freeze({
  PrivacyActionLogRepository: Object.freeze([
    'append',
    'markStarted',
    'markCompleted',
    'markFailed',
    'findById',
    'findByIdempotencyKey',
    'listByRequest',
    'listByUser',
  ]),

  PrivacyRequestRepository: Object.freeze([
    'create',
    'findById',
    'findForUpdate',
    'updateStatus',
    'listByUser',
    'listByStatus',
  ]),

  PrivacyApprovalRepository: Object.freeze([
    'validateForAction',
    'consume',
  ]),

  PrivacyOutboxRepository: Object.freeze([
    'insert',
  ]),

  TransactionManager: Object.freeze([
    'withTransaction',
  ]),
});

function cloneArray(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * List all known privacy action log repository contract names.
 *
 * @returns {string[]}
 */
export function listPrivacyActionLogRepositoryContractNames() {
  return Object.keys(PRIVACY_ACTION_LOG_REPOSITORY_CONTRACTS);
}

/**
 * Get required method names for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
export function getPrivacyActionLogRepositoryContract(contractName) {
  return cloneArray(PRIVACY_ACTION_LOG_REPOSITORY_CONTRACTS[contractName]);
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
export function validatePrivacyActionLogRepositoryContract(contractName, implementation) {
  const requiredMethods = getPrivacyActionLogRepositoryContract(contractName);

  if (requiredMethods.length === 0) {
    return {
      ok: false,
      contractName,
      requiredMethods: [],
      missingMethods: [],
      invalidMethods: [],
      code: 'UNKNOWN_PRIVACY_ACTION_LOG_REPOSITORY_CONTRACT',
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
export function assertPrivacyActionLogRepositoryContract(contractName, implementation) {
  const result = validatePrivacyActionLogRepositoryContract(contractName, implementation);

  if (!result.ok) {
    const err = new Error(
      `Privacy action log repository contract "${contractName}" is not satisfied`
    );
    err.code = result.code || 'PRIVACY_ACTION_LOG_REPOSITORY_CONTRACT_UNSATISFIED';
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
export const privacyActionLogRepositoryContracts = PRIVACY_ACTION_LOG_REPOSITORY_CONTRACTS;
