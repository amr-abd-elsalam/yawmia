import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

const SCAFFOLD_PATH = join(
  ROOT,
  'docs',
  'architecture',
  'POSTGRESQL_QUEUE_MIGRATION_SCAFFOLD.md'
);

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
const OPS_QUEUE_PATH = join(ROOT, 'server', 'services', 'opsQueue.js');
const QUEUE_WORKERS_PATH = join(ROOT, 'server', 'services', 'queueWorkers.js');
const SCHEDULER_REGISTRY_PATH = join(ROOT, 'server', 'services', 'schedulerRegistry.js');
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

test('PostgreSQL queue migration scaffold exists and is indexed', async () => {
  const [scaffold, readme, realityCheck] = await Promise.all([
    read(SCAFFOLD_PATH),
    read(DOCS_README_PATH),
    read(DOCS_REALITY_CHECK_PATH),
  ]);

  assert.ok(
    scaffold.includes('# PostgreSQL Queue Migration Scaffold'),
    'scaffold must have canonical title'
  );

  assert.ok(
    readme.includes('docs/architecture/POSTGRESQL_QUEUE_MIGRATION_SCAFFOLD.md'),
    'docs/README.md must reference the PostgreSQL queue migration scaffold'
  );

  assert.ok(
    realityCheck.includes('`docs/architecture/POSTGRESQL_QUEUE_MIGRATION_SCAFFOLD.md`'),
    'DOCS_REALITY_CHECK.md must catalog the PostgreSQL queue migration scaffold'
  );
});

test('scaffold builds on Patch 67 ADR and preserves no-runtime posture', async () => {
  const scaffold = await read(SCAFFOLD_PATH);

  const requiredPhrases = [
    'Builds on: `docs/architecture/POSTGRESQL_QUEUE_DEPENDENCY_MIGRATION_ADR.md`',
    'No `pg` dependency installation in this patch',
    'No `node-pg-migrate` dependency installation in this patch',
    'No PostgreSQL connection in this patch',
    'No schema migration execution',
    'No `PgQueueRepository` implementation',
    'No queue import execution',
    'No queue worker replacement',
    'No runtime queue adapter activation',
    'No production data mutation',
    'No hidden dual-write',
    'This scaffold does not implement that behavior.',
    'Patch 68 does not add queue import tooling.',
    'The runtime remains file-backed until a later explicitly approved migration/cutover patch.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(scaffold.includes(phrase), `scaffold missing required phrase: ${phrase}`);
  }
});

test('scaffold records queue migration locations and allowed table scope', async () => {
  const scaffold = await read(SCAFFOLD_PATH);

  const requiredPhrases = [
    'migrations/postgres/queue/',
    'ops_queue_jobs',
    'ops_queue_attempts',
    'ops_queue_idempotency',
    'ops_queue_workers',
    'FOR UPDATE SKIP LOCKED',
    'dead-letter -> dead_letter',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(scaffold.includes(phrase), `scaffold missing queue migration detail: ${phrase}`);
  }

  const forbiddenDomainTableClaims = [
    'The first queue schema scaffold may define users',
    'The first queue schema scaffold may define payments',
    'The first queue schema scaffold may define ledger',
    'The first queue schema scaffold may define outbox_events',
  ];

  for (const phrase of forbiddenDomainTableClaims) {
    assert.equal(
      scaffold.includes(phrase),
      false,
      `scaffold must not allow unrelated domain table scope: ${phrase}`
    );
  }
});

test('Patch 67 ADR and Patch 68 scaffold agree on dependency decisions', async () => {
  const [adr, scaffold] = await Promise.all([
    read(ADR_PATH),
    read(SCAFFOLD_PATH),
  ]);

  const sharedRequiredPhrases = [
    'PostgreSQL client: pg',
    'Migration tool: node-pg-migrate',
    'test DB guard before any DB connection',
    'behavior tests before adapter acceptance',
    'dry-run before import',
  ];

  for (const phrase of sharedRequiredPhrases) {
    assert.ok(adr.includes(phrase), `ADR missing shared phrase: ${phrase}`);
    assert.ok(scaffold.includes(phrase), `scaffold missing shared phrase: ${phrase}`);
  }
});

test('package.json remains free of PostgreSQL dependencies during scaffold-only patch', async () => {
  const raw = await read(PACKAGE_JSON_PATH);
  const pkg = JSON.parse(raw);

  const dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  assert.equal(
    Object.prototype.hasOwnProperty.call(dependencies, 'pg'),
    false,
    'Patch 68 scaffold-only work must not install pg'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(dependencies, 'node-pg-migrate'),
    false,
    'Patch 68 scaffold-only work must not install node-pg-migrate'
  );
});

test('runtime queue entrypoints do not import PgQueueRepository, pg, or migration tooling', async () => {
  const files = await Promise.all([
    read(SERVER_JS_PATH).then(source => ['server.js', source]),
    read(ROUTER_PATH).then(source => ['server/router.js', source]),
    read(OPS_QUEUE_PATH).then(source => ['server/services/opsQueue.js', source]),
    read(QUEUE_WORKERS_PATH).then(source => ['server/services/queueWorkers.js', source]),
    read(SCHEDULER_REGISTRY_PATH).then(source => ['server/services/schedulerRegistry.js', source]),
  ]);

  const forbiddenSnippets = [
    'PgQueueRepository',
    'pgQueueRepository',
    "from 'pg'",
    'from "pg"',
    "import('pg')",
    'import("pg")',
    'node-pg-migrate',
    'QUEUE_ADAPTER=postgres',
    'QUEUE_POSTGRES_ENABLED=true',
    'migrations/postgres/queue',
  ];

  for (const [name, source] of files) {
    for (const snippet of forbiddenSnippets) {
      assert.equal(
        source.includes(snippet),
        false,
        `${name} must not contain runtime PostgreSQL queue activation snippet: ${snippet}`
      );
    }
  }
});

test('queue backfill dry-run remains separate from future import and rejects mutation flags', async () => {
  const source = await read(QUEUE_DRY_RUN_PATH);

  const requiredSnippets = [
    'dry-run only',
    'no --confirm support',
    'no queue worker execution',
    'no scheduler execution',
    'no DB writes',
    'no repair/drain/retry/cancel/complete/import',
    '--confirm',
    '--import',
    '--write-db',
    '--delete-legacy',
    'FORBIDDEN_MUTATION_FLAG',
    'mutationPerformed: false',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(
      source.includes(snippet),
      `queue backfill dry-run must preserve no-mutation snippet: ${snippet}`
    );
  }

  const forbiddenSnippets = [
    '../server.js',
    '../server/router.js',
    '../server/services/queueWorkers.js',
    '../server/services/schedulerRegistry.js',
    '../server/services/opsQueue.js',
    '../server/services/database.js',
    'enqueueJob',
    'startQueueWorkers',
    'atomicWrite',
    'writeFile(',
    'appendFile',
    'unlink(',
    'rm(',
    'rename(',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `queue backfill dry-run must not include runtime/mutation snippet: ${snippet}`
    );
  }
});

test('PostgreSQL test database guard remains required and dependency-free', async () => {
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
      `postgres test database guard must preserve safety policy: ${snippet}`
    );
  }

  const forbiddenSnippets = [
    "from 'pg'",
    'from "pg"',
    "import('pg')",
    'import("pg")',
    'new Client',
    'new Pool',
    '.connect(',
    '.query(',
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
