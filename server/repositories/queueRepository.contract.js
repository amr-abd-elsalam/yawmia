// ═══════════════════════════════════════════════════════════════
// server/repositories/queueRepository.contract.js
// Patch 61 — Queue Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Defines repository boundary contracts for the future DB-backed
//   operational queue migration.
//
// Important:
//   - No database imports
//   - No file-system imports
//   - No runtime adapter activation
//   - No queue worker activation
//   - No data mutation
//   - No application entrypoint import
//
// This file is a migration-preparation seam only.
// Current runtime still uses server/services/opsQueue.js and
// server/services/queueWorkers.js.
// ═══════════════════════════════════════════════════════════════

const QUEUE_REPOSITORY_CONTRACTS = Object.freeze({
  QueueRepository: Object.freeze([
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
  ]),

  QueueAttemptRepository: Object.freeze([
    'startAttempt',
    'completeAttempt',
    'failAttempt',
    'markDeadLettered',
    'listAttemptsByJob',
  ]),

  QueueIdempotencyRepository: Object.freeze([
    'create',
    'findByKey',
    'findByJobId',
    'expire',
    'cleanupExpired',
  ]),

  QueueWorkerRegistry: Object.freeze([
    'registerWorker',
    'heartbeat',
    'markStopped',
    'listActiveWorkers',
  ]),

  QueueTransactionManager: Object.freeze([
    'withTransaction',
    'withReadOnlyTransaction',
  ]),
});

function cloneArray(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * List all known queue repository contract names.
 *
 * @returns {string[]}
 */
export function listQueueRepositoryContractNames() {
  return Object.keys(QUEUE_REPOSITORY_CONTRACTS);
}

/**
 * Get required method names for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
export function getQueueRepositoryContract(contractName) {
  return cloneArray(QUEUE_REPOSITORY_CONTRACTS[contractName]);
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
export function validateQueueRepositoryContract(contractName, implementation) {
  const requiredMethods = getQueueRepositoryContract(contractName);

  if (requiredMethods.length === 0) {
    return {
      ok: false,
      contractName,
      requiredMethods: [],
      missingMethods: [],
      invalidMethods: [],
      code: 'UNKNOWN_QUEUE_REPOSITORY_CONTRACT',
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
export function assertQueueRepositoryContract(contractName, implementation) {
  const result = validateQueueRepositoryContract(contractName, implementation);

  if (!result.ok) {
    const err = new Error(
      `Queue repository contract "${contractName}" is not satisfied`
    );
    err.code = result.code || 'QUEUE_REPOSITORY_CONTRACT_UNSATISFIED';
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
export const queueRepositoryContracts = QUEUE_REPOSITORY_CONTRACTS;
