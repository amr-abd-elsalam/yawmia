// ═══════════════════════════════════════════════════════════════
// tests/contracts/postgres-queue-schema-static.test.js
// Patch 71 — PostgreSQL Queue Schema Static Scaffold Tests
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify static PostgreSQL queue schema scaffold exists and remains
//   tightly scoped, non-runtime, and not execution-bound.
//
// Safety:
//   - no pg import
//   - no database connection
//   - no migration execution
//   - no PgQueueRepository import
//   - no queue import
//   - no runtime activation
//   - no production data mutation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const QUEUE_MIGRATION_DIR = join(ROOT, 'migrations', 'postgres', 'queue');
const QUEUE_SCHEMA_README = join(QUEUE_MIGRATION_DIR, 'README.md');
const QUEUE_SCHEMA_SQL = join(QUEUE_MIGRATION_DIR, '001_create_ops_queue_tables.sql');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('PostgreSQL queue schema scaffold files exist', async () => {
  const files = await readdir(QUEUE_MIGRATION_DIR);

  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('001_create_ops_queue_tables.sql'));

  const readme = await read(QUEUE_SCHEMA_README);
  const sql = await read(QUEUE_SCHEMA_SQL);

  assert.ok(readme.includes('# PostgreSQL Queue Migration Scaffold'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS ops_queue_jobs'));
});

test('queue schema scaffold defines only allowed queue infrastructure tables', async () => {
  const sql = await read(QUEUE_SCHEMA_SQL);

  const requiredTables = [
    'ops_queue_jobs',
    'ops_queue_attempts',
    'ops_queue_idempotency',
    'ops_queue_workers',
  ];

  for (const table of requiredTables) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
      `missing table scaffold: ${table}`
    );
  }

  const createTableMatches = Array.from(sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g))
    .map(match => match[1])
    .sort();

  assert.deepEqual(createTableMatches, requiredTables.slice().sort());
});

test('queue schema scaffold does not create or alter domain tables', async () => {
  const sql = await read(QUEUE_SCHEMA_SQL);

  const forbiddenDomainTablePatterns = [
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?users\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?sessions\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?jobs\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?applications\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?direct_offers\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?payments\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?ledger\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?receipts\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?messages\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?workrooms\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?notifications\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?privacy_requests\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?privacy_action_log\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?outbox_events\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?audit\b/i,

    /\bALTER\s+TABLE\s+users\b/i,
    /\bALTER\s+TABLE\s+sessions\b/i,
    /\bALTER\s+TABLE\s+jobs\b/i,
    /\bALTER\s+TABLE\s+applications\b/i,
    /\bALTER\s+TABLE\s+direct_offers\b/i,
    /\bALTER\s+TABLE\s+payments\b/i,
    /\bALTER\s+TABLE\s+ledger\b/i,
    /\bALTER\s+TABLE\s+receipts\b/i,
    /\bALTER\s+TABLE\s+messages\b/i,
    /\bALTER\s+TABLE\s+workrooms\b/i,
    /\bALTER\s+TABLE\s+notifications\b/i,
    /\bALTER\s+TABLE\s+privacy_requests\b/i,
    /\bALTER\s+TABLE\s+privacy_action_log\b/i,
    /\bALTER\s+TABLE\s+outbox_events\b/i,
    /\bALTER\s+TABLE\s+audit\b/i,
  ];

  for (const pattern of forbiddenDomainTablePatterns) {
    assert.equal(
      pattern.test(sql),
      false,
      `queue schema scaffold must not create/alter domain table: ${pattern}`
    );
  }
});

test('queue schema scaffold includes required constraints and indexes', async () => {
  const sql = await read(QUEUE_SCHEMA_SQL);

  const requiredSnippets = [
    "CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'dead_letter'))",
    "CHECK (priority IN ('low', 'normal', 'high', 'critical'))",
    'CHECK (attempts >= 0)',
    'CHECK (max_attempts >= 1)',
    "CHECK (jsonb_typeof(payload_json) = 'object')",
    "CHECK (status IN ('started', 'completed', 'failed', 'cancelled', 'dead_lettered'))",
    'UNIQUE (job_id, attempt_number)',
    'ops_queue_jobs_claim_idx',
    'ops_queue_jobs_type_status_idx',
    'ops_queue_jobs_running_lease_idx',
    'ops_queue_attempts_job_id_idx',
    'ops_queue_idempotency_expires_at_idx',
    'ops_queue_workers_heartbeat_idx',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing schema constraint/index snippet: ${snippet}`);
  }
});

test('queue schema scaffold documents SKIP LOCKED claim semantics without executing runtime code', async () => {
  const sql = await read(QUEUE_SCHEMA_SQL);

  const requiredSnippets = [
    'FOR UPDATE SKIP LOCKED',
    "WHERE status = 'pending'",
    'AND cancel_requested = false',
    'AND next_run_at <= now()',
    'ORDER BY priority_weight DESC, next_run_at ASC, created_at ASC',
    'The adapter must claim and transition rows in one transaction.',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing claim semantics snippet: ${snippet}`);
  }
});

test('queue schema scaffold avoids destructive migration statements', async () => {
  const sql = await read(QUEUE_SCHEMA_SQL);

  const forbiddenSnippets = [
    'DROP TABLE',
    'DROP DATABASE',
    'TRUNCATE',
    'DELETE FROM',
    'UPDATE ops_queue_jobs',
    'INSERT INTO ops_queue_jobs',
    'COPY ops_queue_jobs',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      sql.toUpperCase().includes(snippet),
      false,
      `static scaffold must not contain destructive/import statement: ${snippet}`
    );
  }
});

test('queue schema README preserves static scaffold non-runtime posture', async () => {
  const readme = await read(QUEUE_SCHEMA_README);

  const requiredPhrases = [
    'Static SQL scaffold only',
    'not executed',
    'PgQueueRepository not implemented',
    'still file-backed',
    'install pg',
    'install node-pg-migrate',
    'open a database connection',
    'execute migrations',
    'activate DB-backed queue runtime',
    'import file-backed queue data',
    'assertPostgresTestDatabaseSafety',
    'YAWMIA_ALLOW_DB_TESTS=true',
    'YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(readme.includes(phrase), `README missing required safety phrase: ${phrase}`);
  }
});

test('package.json remains free of PostgreSQL dependencies for static schema scaffold patch', async () => {
  const raw = await read(PACKAGE_JSON_PATH);
  const pkg = JSON.parse(raw);

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'pg'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'), false);
});

test('queue schema static test does not import pg or runtime queue services', async () => {
  const source = await readFile(
    new URL('./postgres-queue-schema-static.test.js', import.meta.url),
    'utf-8'
  );

  const forbiddenPatterns = [
    /from\s+['"]pg['"]/,
    /import\s*\(\s*['"]pg['"]\s*\)/,
    /PgQueueRepository/,
    /queueWorkers\.js/,
    /opsQueue\.js/,
    /schedulerRegistry\.js/,
    /server\.js/,
    /server\/router\.js/,
    /node:child_process/,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(source),
      false,
      `static schema test must not import runtime/DB dependency: ${pattern}`
    );
  }
});
