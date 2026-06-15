// ═══════════════════════════════════════════════════════════════
// tests/contracts/postgres-outbox-schema-static.test.js
// Patch 85 — PostgreSQL Durable Outbox Schema Static Scaffold Tests
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify static PostgreSQL durable outbox schema scaffold exists and remains
//   tightly scoped, non-runtime, and not execution-bound.
//
// Safety:
//   - no pg import
//   - no node-pg-migrate import
//   - no database connection
//   - no migration execution
//   - no PgOutboxRepository import
//   - no OutboxDispatcher import
//   - no EventBus import
//   - no payment import
//   - no ledger writes
//   - no receipt generation
//   - no runtime activation
//   - no production data mutation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUTBOX_MIGRATION_DIR = join(ROOT, 'migrations', 'postgres', 'outbox');
const OUTBOX_SCHEMA_README = join(OUTBOX_MIGRATION_DIR, 'README.md');
const OUTBOX_SCHEMA_SQL = join(OUTBOX_MIGRATION_DIR, '001_create_outbox_tables.sql');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');

async function read(path) {
  return await readFile(path, 'utf-8');
}

function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

test('PostgreSQL durable outbox schema scaffold files exist', async () => {
  const files = await readdir(OUTBOX_MIGRATION_DIR);

  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('001_create_outbox_tables.sql'));

  const readme = await read(OUTBOX_SCHEMA_README);
  const sql = await read(OUTBOX_SCHEMA_SQL);

  assert.ok(readme.includes('# PostgreSQL Durable Outbox Migration Scaffold'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS outbox_events'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS outbox_dispatch_attempts'));
});

test('outbox schema scaffold defines only allowed outbox infrastructure tables', async () => {
  const sql = await read(OUTBOX_SCHEMA_SQL);

  const requiredTables = [
    'outbox_events',
    'outbox_dispatch_attempts',
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

test('outbox schema scaffold does not create or alter unrelated domain/runtime tables', async () => {
  const sql = stripSqlComments(await read(OUTBOX_SCHEMA_SQL));

  const forbiddenDomainTablePatterns = [
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?payments\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?payment_ledger_entries\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?payment_disputes\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?receipt_sequences\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?receipts\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?users\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?sessions\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?jobs\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?applications\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?direct_offers\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?messages\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?workrooms\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?notifications\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?privacy_requests\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?privacy_action_log\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?audit\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?ops_queue_jobs\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?ops_queue_attempts\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?ops_queue_idempotency\b/i,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?ops_queue_workers\b/i,

    /\bALTER\s+TABLE\s+payments\b/i,
    /\bALTER\s+TABLE\s+payment_ledger_entries\b/i,
    /\bALTER\s+TABLE\s+payment_disputes\b/i,
    /\bALTER\s+TABLE\s+receipt_sequences\b/i,
    /\bALTER\s+TABLE\s+receipts\b/i,
    /\bALTER\s+TABLE\s+users\b/i,
    /\bALTER\s+TABLE\s+sessions\b/i,
    /\bALTER\s+TABLE\s+jobs\b/i,
    /\bALTER\s+TABLE\s+applications\b/i,
    /\bALTER\s+TABLE\s+direct_offers\b/i,
    /\bALTER\s+TABLE\s+messages\b/i,
    /\bALTER\s+TABLE\s+workrooms\b/i,
    /\bALTER\s+TABLE\s+notifications\b/i,
    /\bALTER\s+TABLE\s+privacy_requests\b/i,
    /\bALTER\s+TABLE\s+privacy_action_log\b/i,
    /\bALTER\s+TABLE\s+audit\b/i,
    /\bALTER\s+TABLE\s+ops_queue_jobs\b/i,
    /\bALTER\s+TABLE\s+ops_queue_attempts\b/i,
    /\bALTER\s+TABLE\s+ops_queue_idempotency\b/i,
    /\bALTER\s+TABLE\s+ops_queue_workers\b/i,
  ];

  for (const pattern of forbiddenDomainTablePatterns) {
    assert.equal(
      pattern.test(sql),
      false,
      `outbox schema scaffold must not create/alter unrelated table: ${pattern}`
    );
  }
});

test('outbox schema scaffold includes required event envelope constraints and idempotency index', async () => {
  const sql = await read(OUTBOX_SCHEMA_SQL);

  const requiredSnippets = [
    'CREATE TABLE IF NOT EXISTS outbox_events',
    'event_type TEXT NOT NULL',
    'aggregate_type TEXT NOT NULL',
    'aggregate_id TEXT NOT NULL',
    'idempotency_key TEXT NOT NULL',
    "payload_json JSONB NOT NULL DEFAULT '{}'::jsonb",
    "CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter', 'cancelled'))",
    "CHECK (priority IN ('low', 'normal', 'high', 'critical'))",
    'CHECK (attempts >= 0)',
    'CHECK (max_attempts >= 1)',
    "CHECK (jsonb_typeof(payload_json) = 'object')",
    'outbox_events_idempotency_key_idx',
    'outbox_events_pending_dispatch_idx',
    'outbox_events_processing_lease_idx',
    'outbox_events_aggregate_replay_idx',
    'outbox_events_event_type_status_idx',
    'outbox_events_status_created_at_idx',
    'outbox_events_dead_letter_review_idx',
    'outbox_events_correlation_id_idx',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing outbox event envelope snippet: ${snippet}`);
  }
});

test('outbox schema scaffold includes dispatch attempt tracking primitives', async () => {
  const sql = await read(OUTBOX_SCHEMA_SQL);

  const requiredSnippets = [
    'CREATE TABLE IF NOT EXISTS outbox_dispatch_attempts',
    'outbox_event_id TEXT NOT NULL REFERENCES outbox_events(id)',
    'attempt_number INTEGER NOT NULL',
    'dispatcher_id TEXT NOT NULL',
    "CHECK (attempt_number >= 1)",
    "CHECK (status IN ('started', 'processed', 'failed', 'dead_lettered', 'cancelled'))",
    'CHECK (duration_ms IS NULL OR duration_ms >= 0)',
    "CHECK (delivery_metadata_json IS NULL OR jsonb_typeof(delivery_metadata_json) = 'object')",
    'outbox_dispatch_attempts_event_attempt_once_idx',
    'outbox_dispatch_attempts_event_id_idx',
    'outbox_dispatch_attempts_dispatcher_id_idx',
    'outbox_dispatch_attempts_status_idx',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing dispatch attempt snippet: ${snippet}`);
  }
});

test('outbox schema scaffold documents SKIP LOCKED claim and dispatcher semantics without executing runtime code', async () => {
  const sql = await read(OUTBOX_SCHEMA_SQL);

  const requiredSnippets = [
    'FOR UPDATE SKIP LOCKED',
    "WHERE status = 'pending'",
    'AND available_at <= now()',
    'ORDER BY',
    'available_at ASC',
    'created_at ASC',
    'transition claimed rows to processing',
    'set lease_until',
    'increment attempts',
    'create outbox_dispatch_attempts rows',
    'processed is set only after downstream delivery succeeds',
    'failed events remain retryable with backoff',
    'dead_letter preserves diagnostic context without secrets',
    'crash before send leaves event recoverable',
    'crash after send before processed mark may cause duplicate delivery',
    'downstream handlers must be idempotent',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing claim/dispatcher semantics snippet: ${snippet}`);
  }
});

test('outbox schema scaffold documents payment workflow transaction coupling without implementing it', async () => {
  const sql = await read(OUTBOX_SCHEMA_SQL);

  const requiredSnippets = [
    'payment / ledger / receipt / audit / approval changes',
    'required outbox event insertion',
    'commit or roll back as one transaction',
    'This scaffold intentionally does not:',
    'implement PgOutboxRepository',
    'implement OutboxDispatcher',
    'insert outbox events',
    'dispatch events',
    'replace EventBus',
    'mutate file-backed runtime data',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing payment/outbox coupling posture snippet: ${snippet}`);
  }
});

test('outbox schema scaffold avoids import and destructive runtime statements', async () => {
  const sql = await read(OUTBOX_SCHEMA_SQL);
  const upper = stripSqlComments(sql).toUpperCase();

  const forbiddenSnippets = [
    'DROP TABLE',
    'DROP DATABASE',
    'DROP SCHEMA',
    'TRUNCATE',
    'DELETE FROM',
    'UPDATE OUTBOX_EVENTS',
    'UPDATE OUTBOX_DISPATCH_ATTEMPTS',
    'INSERT INTO OUTBOX_EVENTS',
    'INSERT INTO OUTBOX_DISPATCH_ATTEMPTS',
    'COPY OUTBOX_EVENTS',
    'COPY OUTBOX_DISPATCH_ATTEMPTS',
    'ALTER TABLE PAYMENTS',
    'ALTER TABLE PAYMENT_LEDGER_ENTRIES',
    'ALTER TABLE RECEIPTS',
    'ALTER TABLE JOBS',
    'ALTER TABLE APPLICATIONS',
    'ALTER TABLE DIRECT_OFFERS',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      upper.includes(snippet),
      false,
      `static outbox scaffold must not contain destructive/import statement: ${snippet}`
    );
  }
});

test('outbox schema README preserves static scaffold non-runtime posture', async () => {
  const readme = await read(OUTBOX_SCHEMA_README);

  const requiredPhrases = [
    'Static SQL scaffold only',
    'not executed',
    'PgOutboxRepository not implemented',
    'OutboxDispatcher runtime not implemented',
    'EventBus remains in-memory',
    'still file-backed',
    'install pg',
    'install node-pg-migrate',
    'open a database connection',
    'execute migrations',
    'activate durable outbox runtime',
    'replace EventBus',
    'insert outbox events',
    'dispatch outbox events',
    'assertPostgresTestDatabaseSafety',
    'YAWMIA_ALLOW_DB_TESTS=true',
    'YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test',
    'tests/adapters/outbox-repository.harness.test.js',
    'EventBus is not financial event truth',
    'This scaffold does not implement dispatcher runtime',
    'This scaffold does not implement that invariant today',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(readme.includes(phrase), `README missing required safety phrase: ${phrase}`);
  }
});

test('package.json remains free of PostgreSQL dependencies for static outbox schema scaffold patch', async () => {
  const raw = await read(PACKAGE_JSON_PATH);
  const pkg = JSON.parse(raw);

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'pg'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'), false);
});

test('outbox schema static test does not import pg or runtime outbox/server services', async () => {
  const source = await readFile(
    new URL('./postgres-outbox-schema-static.test.js', import.meta.url),
    'utf-8'
  );

  const forbiddenPatterns = [
    /from\s+['"]pg['"]/,
    /import\s*\(\s*['"]pg['"]\s*\)/,
    /from\s+['"]node-pg-migrate['"]/,
    /import\s*\(\s*['"]node-pg-migrate['"]\s*\)/,
    /from\s+['"].*PgOutboxRepository.*['"]/i,
    /import\s*\(\s*['"].*PgOutboxRepository.*['"]\s*\)/i,
    /from\s+['"].*outboxRepository\.js['"]/i,
    /import\s*\(\s*['"].*outboxRepository\.js['"]\s*\)/i,
    /from\s+['"].*outboxDispatcher\.js['"]/i,
    /import\s*\(\s*['"].*outboxDispatcher\.js['"]\s*\)/i,
    /payments\.js/,
    /financialExport\.js/,
    /jobs\.js/,
    /applications\.js/,
    /directOffer\.js/,
    /eventBus\.js/,
    /opsQueue\.js/,
    /queueWorkers\.js/,
    /schedulerRegistry\.js/,
    /database\.js/,
    /server\.js/,
    /server\/router\.js/,
    new RegExp(['node:child', 'process'].join('_')),
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(source),
      false,
      `static outbox schema test must not import runtime/DB dependency: ${pattern}`
    );
  }
});
