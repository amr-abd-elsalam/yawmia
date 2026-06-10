// ═══════════════════════════════════════════════════════════════
// server/repositories/outboxRepository.contract.js
// Patch 55 — Durable Outbox Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Defines repository boundary contracts for the future durable outbox
//   and dispatcher workflow.
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
// Current production runtime still uses server/services/eventBus.js
// for in-memory fanout.
// ═══════════════════════════════════════════════════════════════

const OUTBOX_REPOSITORY_CONTRACTS = Object.freeze({
  OutboxRepository: Object.freeze([
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
  ]),

  OutboxDispatcherRegistry: Object.freeze([
    'registerHandler',
    'getHandler',
    'listHandlers',
  ]),

  OutboxTransactionManager: Object.freeze([
    'withTransaction',
  ]),
});

function cloneArray(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * List all known outbox repository contract names.
 *
 * @returns {string[]}
 */
export function listOutboxRepositoryContractNames() {
  return Object.keys(OUTBOX_REPOSITORY_CONTRACTS);
}

/**
 * Get required method names for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
export function getOutboxRepositoryContract(contractName) {
  return cloneArray(OUTBOX_REPOSITORY_CONTRACTS[contractName]);
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
export function validateOutboxRepositoryContract(contractName, implementation) {
  const requiredMethods = getOutboxRepositoryContract(contractName);

  if (requiredMethods.length === 0) {
    return {
      ok: false,
      contractName,
      requiredMethods: [],
      missingMethods: [],
      invalidMethods: [],
      code: 'UNKNOWN_OUTBOX_REPOSITORY_CONTRACT',
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
export function assertOutboxRepositoryContract(contractName, implementation) {
  const result = validateOutboxRepositoryContract(contractName, implementation);

  if (!result.ok) {
    const err = new Error(
      `Outbox repository contract "${contractName}" is not satisfied`
    );
    err.code = result.code || 'OUTBOX_REPOSITORY_CONTRACT_UNSATISFIED';
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
export const outboxRepositoryContracts = OUTBOX_REPOSITORY_CONTRACTS;
