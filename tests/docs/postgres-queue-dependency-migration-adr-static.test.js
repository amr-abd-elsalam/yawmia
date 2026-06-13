import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

const ADR_PATH = join(
  ROOT,
  'docs',
  'architecture',
  'POSTGRESQL_QUEUE_DEPENDENCY_MIGRATION_ADR.md'
);

const DOCS_README_PATH = join(ROOT, 'docs', 'README.md');
const DOCS_REALITY_CHECK_PATH = join(ROOT, 'docs', 'operations', 'DOCS_REALITY_CHECK.md');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');
const SERVER_JS_PATH = join(ROOT, 'server.js');
const ROUTER_PATH = join(ROOT, 'server', 'router.js');
const QUEUE_WORKERS_PATH = join(ROOT, 'server', 'services', 'queueWorkers.js');
const QUEUE_DRY_RUN_PATH = join(ROOT, 'scripts', 'queue-backfill-dry-run.js');
const POSTGRES_GUARD_PATH = join(
  ROOT,
  'server',
  'repositories',
  'postgresTestDatabaseGuard.contract.js'
);

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('PostgreSQL queue dependency and migration ADR exists and is indexed', async () => {
  const [adr, readme, realityCheck] = await Promise.all([
    read(ADR_PATH),
    read(DOCS_README_PATH),
    read(DOCS_REALITY_CHECK_PATH),
  ]);

  assert.ok(
    adr.includes('# PostgreSQL Queue Dependency / Migration Tool ADR'),
    'ADR must have canonical title'
  );

  assert.ok(
    readme.includes('docs/architecture/POSTGRESQL_QUEUE_DEPENDENCY_MIGRATION_ADR.md'),
    'docs/README.md must reference the PostgreSQL queue dependency/migration ADR'
  );

  assert.ok(
    realityCheck.includes('`docs/architecture/POSTGRESQL_QUEUE_DEPENDENCY_MIGRATION_ADR.md`'),
    'DOCS_REALITY_CHECK.md must catalog the PostgreSQL queue dependency/migration ADR'
  );
});

test('ADR records dependency and migration-tool decision without claiming runtime implementation', async () => {
  const adr = await read(ADR_PATH);

  const requiredPhrases = [
    'PostgreSQL client: pg',
    'Migration tool: node-pg-migrate',
    'Patch 67 does not install these dependencies.',
    'No `pg` dependency installation in this patch',
    'No migration tool dependency installation in this patch',
    'No PostgreSQL connection in this patch',
    'No schema migration execution',
    'No `PgQueueRepository` implementation',
    'No queue import execution',
    'No queue worker replacement',
    'No runtime queue adapter activation',
    'No production data mutation',
    'test DB guard before any DB connection',
    'behavior tests before adapter acceptance',
    'dry-run before import',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(adr.includes(phrase), `ADR missing required phrase: ${phrase}`);
  }
});

test('package.json remains free of PostgreSQL dependencies for ADR-only patch', async () => {
  const raw = await read(PACKAGE_JSON_PATH);
  const pkg = JSON.parse(raw);

  const dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  assert.equal(
    Object.prototype.hasOwnProperty.call(dependencies, 'pg'),
    false,
    'Patch 67 must not install pg'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(dependencies, 'node-pg-migrate'),
    false,
    'Patch 67 must not install node-pg-migrate'
  );
});

test('runtime entrypoints and queue workers do not import PgQueueRepository or PostgreSQL client', async () => {
  const [server, router, queueWorkers] = await Promise.all([
    read(SERVER_JS_PATH),
    read(ROUTER_PATH),
    read(QUEUE_WORKERS_PATH),
  ]);

  const runtimeSources = [
    ['server.js', server],
    ['server/router.js', router],
    ['server/services/queueWorkers.js', queueWorkers],
  ];

  const forbiddenSnippets = [
    'PgQueueRepository',
    'pgQueueRepository',
    "from 'pg'",
    'from "pg"',
    "import('pg')",
    'import("pg")',
    'node-pg-migrate',
    'QUEUE_ADAPTER',
    'QUEUE_POSTGRES_ENABLED',
  ];

  for (const [name, source] of runtimeSources) {
    for (const snippet of forbiddenSnippets) {
      assert.equal(
        source.includes(snippet),
        false,
        `${name} must not contain runtime PostgreSQL queue activation snippet: ${snippet}`
      );
    }
  }
});

test('queue backfill dry-run remains no-mutation and rejects confirm', async () => {
  const source = await read(QUEUE_DRY_RUN_PATH);

  const requiredSnippets = [
    'dry-run only',
    'no --confirm support',
    'no queue worker execution',
    'no scheduler execution',
    'no DB writes',
    'no repair/drain/retry/cancel/complete/import',
    '--confirm',
    'FORBIDDEN_MUTATION_FLAG',
    'mutationPerformed: false',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(
      source.includes(snippet),
      `queue backfill dry-run must preserve safety snippet: ${snippet}`
    );
  }

  const forbiddenRuntimeSnippets = [
    '../server.js',
    '../server/router.js',
    '../server/services/queueWorkers.js',
    '../server/services/schedulerRegistry.js',
    '../server/services/opsQueue.js',
    '../server/services/database.js',
    'enqueueJob',
    'startQueueWorkers',
    'atomicWrite',
  ];

  for (const snippet of forbiddenRuntimeSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `queue backfill dry-run must not include runtime or mutation snippet: ${snippet}`
    );
  }
});

test('PostgreSQL test database guard remains dependency-free and connection-free', async () => {
  const source = await read(POSTGRES_GUARD_PATH);

  const requiredSnippets = [
    'No pg import',
    'No database connection',
    'YAWMIA_ALLOW_DB_TESTS=true',
    'YAWMIA_TEST_DATABASE_URL',
    'NODE_ENV_PRODUCTION_BLOCKED',
    'DB_TESTS_NOT_EXPLICITLY_ALLOWED',
    'TEST_DATABASE_URL_REQUIRED',
    'FORBIDDEN_DATABASE_NAME',
    'DATABASE_NAME_NOT_CLEARLY_TEST',
    'PRODUCTION_LIKE_DATABASE_HOST',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(
      source.includes(snippet),
      `postgres test database guard must preserve policy snippet: ${snippet}`
    );
  }

  const forbiddenSnippets = [
    "from 'pg'",
    'from "pg"',
    "import('pg')",
    'import("pg")',
    'new Client',
    'Pool(',
    'connect(',
    'query(',
    'node:fs',
    'node:fs/promises',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `postgres test database guard must remain dependency-free: ${snippet}`
    );
  }
});
