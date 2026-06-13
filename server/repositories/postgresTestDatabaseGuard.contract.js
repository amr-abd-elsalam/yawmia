// ═══════════════════════════════════════════════════════════════
// server/repositories/postgresTestDatabaseGuard.contract.js
// Patch 65 — PostgreSQL Test Database Safety Guard Contract
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Defines a runtime-neutral, dependency-free safety guard for future
//   PostgreSQL adapter tests.
//
// Important:
//   - No pg import
//   - No database connection
//   - No filesystem import
//   - No runtime adapter activation
//   - No queue worker activation
//   - No server/router import
//   - No production data mutation
//
// This file is a migration-preparation seam only.
// Future PgQueueRepository adapter tests may use these pure helpers before
// connecting to any test database.
// ═══════════════════════════════════════════════════════════════

const POSTGRES_TEST_DATABASE_GUARD_CONTRACTS = Object.freeze({
  PostgresTestDatabaseGuard: Object.freeze([
    'evaluateEnvironment',
    'assertSafeEnvironment',
    'redactDatabaseUrl',
  ]),

  PostgresTestDatabasePolicy: Object.freeze([
    'parseDatabaseName',
    'isAllowedDatabaseName',
    'isForbiddenDatabaseName',
    'isProductionLikeHost',
  ]),
});

const FORBIDDEN_DATABASE_NAME_TOKENS = Object.freeze([
  'prod',
  'production',
  'main',
  'primary',
  'live',
]);

const REQUIRED_DATABASE_NAME_TOKENS = Object.freeze([
  'test',
  'dev',
  'ci',
]);

function cloneArray(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * List all known PostgreSQL test database guard contract names.
 *
 * @returns {string[]}
 */
export function listPostgresTestDatabaseGuardContractNames() {
  return Object.keys(POSTGRES_TEST_DATABASE_GUARD_CONTRACTS);
}

/**
 * Get required method names for a contract.
 *
 * @param {string} contractName
 * @returns {string[]}
 */
export function getPostgresTestDatabaseGuardContract(contractName) {
  return cloneArray(POSTGRES_TEST_DATABASE_GUARD_CONTRACTS[contractName]);
}

/**
 * Validate that an implementation object satisfies a named contract.
 *
 * This is intentionally structural and dependency-free.
 * It does not execute implementation methods.
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
export function validatePostgresTestDatabaseGuardContract(contractName, implementation) {
  const requiredMethods = getPostgresTestDatabaseGuardContract(contractName);

  if (requiredMethods.length === 0) {
    return {
      ok: false,
      contractName,
      requiredMethods: [],
      missingMethods: [],
      invalidMethods: [],
      code: 'UNKNOWN_POSTGRES_TEST_DATABASE_GUARD_CONTRACT',
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
export function assertPostgresTestDatabaseGuardContract(contractName, implementation) {
  const result = validatePostgresTestDatabaseGuardContract(contractName, implementation);

  if (!result.ok) {
    const err = new Error(
      `PostgreSQL test database guard contract "${contractName}" is not satisfied`
    );
    err.code = result.code || 'POSTGRES_TEST_DATABASE_GUARD_CONTRACT_UNSATISFIED';
    err.contractName = contractName;
    err.missingMethods = result.missingMethods;
    err.invalidMethods = result.invalidMethods;
    throw err;
  }

  return true;
}

/**
 * Parse database name from a PostgreSQL connection URL.
 *
 * @param {string} databaseUrl
 * @returns {{ ok: boolean, databaseName: string|null, host: string|null, protocol: string|null, error?: string }}
 */
export function parseDatabaseName(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== 'string') {
    return {
      ok: false,
      databaseName: null,
      host: null,
      protocol: null,
      error: 'DATABASE_URL_REQUIRED',
    };
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (err) {
    return {
      ok: false,
      databaseName: null,
      host: null,
      protocol: null,
      error: 'DATABASE_URL_INVALID',
    };
  }

  const protocol = parsed.protocol || null;
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    return {
      ok: false,
      databaseName: null,
      host: parsed.hostname || null,
      protocol,
      error: 'DATABASE_URL_PROTOCOL_INVALID',
    };
  }

  const databaseName = decodeURIComponent((parsed.pathname || '').replace(/^\//, ''));

  if (!databaseName) {
    return {
      ok: false,
      databaseName: null,
      host: parsed.hostname || null,
      protocol,
      error: 'DATABASE_NAME_MISSING',
    };
  }

  return {
    ok: true,
    databaseName,
    host: parsed.hostname || null,
    protocol,
  };
}

/**
 * Tokenize a database/host name for safety checks.
 *
 * @param {string} value
 * @returns {string[]}
 */
function tokenizeName(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(Boolean);
}

/**
 * Check whether a database name contains a forbidden production-like token.
 *
 * @param {string} databaseName
 * @returns {boolean}
 */
export function isForbiddenDatabaseName(databaseName) {
  const tokens = tokenizeName(databaseName);
  return tokens.some(token => FORBIDDEN_DATABASE_NAME_TOKENS.includes(token));
}

/**
 * Check whether a database name clearly indicates test/dev/ci.
 *
 * @param {string} databaseName
 * @returns {boolean}
 */
export function isAllowedDatabaseName(databaseName) {
  const tokens = tokenizeName(databaseName);
  return tokens.some(token => REQUIRED_DATABASE_NAME_TOKENS.includes(token));
}

/**
 * Check whether a database host looks production-like.
 *
 * @param {string} host
 * @returns {boolean}
 */
export function isProductionLikeHost(host) {
  const tokens = tokenizeName(host);
  return tokens.some(token => FORBIDDEN_DATABASE_NAME_TOKENS.includes(token));
}

/**
 * Redact sensitive URL parts for reports/errors.
 *
 * @param {string} databaseUrl
 * @returns {string|null}
 */
export function redactDatabaseUrl(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== 'string') return null;

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) parsed.password = '[redacted]';
    if (parsed.username) parsed.username = parsed.username ? '[user]' : '';
    parsed.search = '';
    return parsed.toString()
      .replace('%5Bredacted%5D', '[redacted]')
      .replace('%5Buser%5D', '[user]');
  } catch (_) {
    return '[invalid-url]';
  }
}

/**
 * Evaluate whether environment variables allow PostgreSQL adapter tests.
 *
 * This function does not connect to any database.
 *
 * Required:
 *   YAWMIA_ALLOW_DB_TESTS=true
 *   YAWMIA_TEST_DATABASE_URL=postgres://.../<test|dev|ci db>
 *
 * @param {object} env
 * @returns {{
 *   ok: boolean,
 *   allowed: boolean,
 *   blockers: object[],
 *   warnings: object[],
 *   database: object,
 *   requiredEnv: string[],
 *   generatedAt: string
 * }}
 */
export function evaluatePostgresTestDatabaseSafety(env = {}) {
  const blockers = [];
  const warnings = [];

  const nodeEnv = env.NODE_ENV || '';
  const allowDbTests = env.YAWMIA_ALLOW_DB_TESTS || '';
  const databaseUrl = env.YAWMIA_TEST_DATABASE_URL || '';

  if (nodeEnv === 'production') {
    blockers.push({
      code: 'NODE_ENV_PRODUCTION_BLOCKED',
      message: 'PostgreSQL adapter tests must not run with NODE_ENV=production.',
    });
  }

  if (allowDbTests !== 'true') {
    blockers.push({
      code: 'DB_TESTS_NOT_EXPLICITLY_ALLOWED',
      message: 'Set YAWMIA_ALLOW_DB_TESTS=true to run PostgreSQL adapter tests.',
    });
  }

  if (!databaseUrl) {
    blockers.push({
      code: 'TEST_DATABASE_URL_REQUIRED',
      message: 'Set YAWMIA_TEST_DATABASE_URL to a safe test/dev/ci PostgreSQL database.',
    });
  }

  const parsed = parseDatabaseName(databaseUrl);

  if (databaseUrl && !parsed.ok) {
    blockers.push({
      code: parsed.error || 'TEST_DATABASE_URL_INVALID',
      message: 'YAWMIA_TEST_DATABASE_URL is invalid or not a PostgreSQL URL.',
      url: redactDatabaseUrl(databaseUrl),
    });
  }

  if (parsed.ok) {
    if (isForbiddenDatabaseName(parsed.databaseName)) {
      blockers.push({
        code: 'FORBIDDEN_DATABASE_NAME',
        message: 'Database name contains a production-like token.',
        databaseName: parsed.databaseName,
      });
    }

    if (!isAllowedDatabaseName(parsed.databaseName)) {
      blockers.push({
        code: 'DATABASE_NAME_NOT_CLEARLY_TEST',
        message: 'Database name must clearly include test, dev, or ci.',
        databaseName: parsed.databaseName,
      });
    }

    if (isProductionLikeHost(parsed.host)) {
      blockers.push({
        code: 'PRODUCTION_LIKE_DATABASE_HOST',
        message: 'Database host contains a production-like token.',
        host: parsed.host,
      });
    }

    const localhostLike = parsed.host === 'localhost' ||
      parsed.host === '127.0.0.1' ||
      parsed.host === '::1';

    if (!localhostLike) {
      warnings.push({
        code: 'NON_LOCAL_TEST_DATABASE_HOST',
        message: 'Non-local test database host detected; verify it is isolated and disposable.',
        host: parsed.host,
      });
    }
  }

  return {
    ok: blockers.length === 0,
    allowed: blockers.length === 0,
    blockers,
    warnings,
    database: {
      url: databaseUrl ? redactDatabaseUrl(databaseUrl) : null,
      databaseName: parsed.ok ? parsed.databaseName : null,
      host: parsed.host || null,
      protocol: parsed.protocol || null,
    },
    requiredEnv: [
      'YAWMIA_ALLOW_DB_TESTS=true',
      'YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test',
    ],
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Assert that an environment is safe for PostgreSQL adapter tests.
 *
 * @param {object} env
 * @returns {true}
 * @throws {Error}
 */
export function assertPostgresTestDatabaseSafety(env = {}) {
  const result = evaluatePostgresTestDatabaseSafety(env);

  if (!result.ok) {
    const err = new Error('PostgreSQL test database safety check failed');
    err.code = 'POSTGRES_TEST_DATABASE_UNSAFE';
    err.blockers = result.blockers;
    err.warnings = result.warnings;
    err.database = result.database;
    throw err;
  }

  return true;
}

/**
 * Export frozen contract map for documentation/tests.
 */
export const postgresTestDatabaseGuardContracts = POSTGRES_TEST_DATABASE_GUARD_CONTRACTS;

export const postgresTestDatabaseSafetyPolicy = Object.freeze({
  forbiddenDatabaseNameTokens: cloneArray(FORBIDDEN_DATABASE_NAME_TOKENS),
  requiredDatabaseNameTokens: cloneArray(REQUIRED_DATABASE_NAME_TOKENS),
});
