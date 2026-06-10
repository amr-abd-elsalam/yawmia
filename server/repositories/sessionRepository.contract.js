// ═══════════════════════════════════════════════════════════════
// server/repositories/sessionRepository.contract.js
// Patch 59 — Session Repository Contract Skeleton
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Defines repository boundary contracts for the future DB-backed
//   session persistence migration.
//
// Important:
//   - No database imports
//   - No file-system imports
//   - No PostgreSQL dependency
//   - No runtime adapter activation
//   - No data mutation
//   - No server.js import
//
// This file is a migration-preparation seam only.
// Current runtime still uses server/services/sessions.js.
// Patch 51 already hashes new session tokens at rest, but sessions remain
// file-backed with a temporary legacy plaintext read path.
// ═══════════════════════════════════════════════════════════════

const SESSION_REPOSITORY_CONTRACTS = Object.freeze({
  SessionRepository: Object.freeze([
    'create',
    'findById',
    'findByTokenHash',
    'findByUser',
    'destroyById',
    'destroyByTokenHash',
    'destroyAllByUser',
    'cleanExpired',
  ]),

  SessionTokenHasher: Object.freeze([
    'hashToken',
    'recordIdForToken',
  ]),

  SessionMigrationRepository: Object.freeze([
    'findLegacyPlaintextByToken',
    'migrateLegacyPlaintextSession',
    'listLegacyPlaintextSessions',
  ]),

  SessionTransactionManager: Object.freeze([
    'withTransaction',
    'withReadOnlyTransaction',
  ]),
});

function cloneArray(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * List all known session repository contract names.
 *
 * @returns {string[]}
 */
export function listSessionRepositoryContractNames() {
  return Object.keys(SESSION_REPOSITORY_CONTRACTS);
}

/**
 * Get required method names for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
export function getSessionRepositoryContract(contractName) {
  return cloneArray(SESSION_REPOSITORY_CONTRACTS[contractName]);
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
export function validateSessionRepositoryContract(contractName, implementation) {
  const requiredMethods = getSessionRepositoryContract(contractName);

  if (requiredMethods.length === 0) {
    return {
      ok: false,
      contractName,
      requiredMethods: [],
      missingMethods: [],
      invalidMethods: [],
      code: 'UNKNOWN_SESSION_REPOSITORY_CONTRACT',
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
export function assertSessionRepositoryContract(contractName, implementation) {
  const result = validateSessionRepositoryContract(contractName, implementation);

  if (!result.ok) {
    const err = new Error(
      `Session repository contract "${contractName}" is not satisfied`
    );
    err.code = result.code || 'SESSION_REPOSITORY_CONTRACT_UNSATISFIED';
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
export const sessionRepositoryContracts = SESSION_REPOSITORY_CONTRACTS;
