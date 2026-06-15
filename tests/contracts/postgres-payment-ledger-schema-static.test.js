// ═══════════════════════════════════════════════════════════════
// tests/contracts/postgres-payment-ledger-schema-static.test.js
// Patch 76 — PostgreSQL Payment Ledger Schema Static Scaffold Tests
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Verify static PostgreSQL payment ledger schema scaffold exists and remains
//   tightly scoped, non-runtime, and not execution-bound.
//
// Safety:
//   - no pg import
//   - no database connection
//   - no migration execution
//   - no PaymentLedgerRepository import
//   - no PgPaymentRepository import
//   - no payment import
//   - no receipt generation
//   - no runtime activation
//   - no production data mutation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const PAYMENT_MIGRATION_DIR = join(ROOT, 'migrations', 'postgres', 'payments');
const PAYMENT_SCHEMA_README = join(PAYMENT_MIGRATION_DIR, 'README.md');
const PAYMENT_SCHEMA_SQL = join(PAYMENT_MIGRATION_DIR, '001_create_payment_ledger_tables.sql');
const PACKAGE_JSON_PATH = join(ROOT, 'package.json');

async function read(path) {
  return await readFile(path, 'utf-8');
}

function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

test('PostgreSQL payment ledger schema scaffold files exist', async () => {
  const files = await readdir(PAYMENT_MIGRATION_DIR);

  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('001_create_payment_ledger_tables.sql'));

  const readme = await read(PAYMENT_SCHEMA_README);
  const sql = await read(PAYMENT_SCHEMA_SQL);

  assert.ok(readme.includes('# PostgreSQL Payment Ledger Migration Scaffold'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS payments'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS payment_ledger_entries'));
});

test('payment ledger schema scaffold defines only allowed payment infrastructure tables', async () => {
  const sql = await read(PAYMENT_SCHEMA_SQL);

  const requiredTables = [
    'payments',
    'payment_ledger_entries',
    'payment_disputes',
    'receipt_sequences',
    'receipts',
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

test('payment ledger schema scaffold does not create or alter unrelated domain/runtime tables', async () => {
  const sql = await read(PAYMENT_SCHEMA_SQL);

  const forbiddenDomainTablePatterns = [
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
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?outbox_events\b/i,

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
    /\bALTER\s+TABLE\s+outbox_events\b/i,
  ];

  for (const pattern of forbiddenDomainTablePatterns) {
    assert.equal(
      pattern.test(sql),
      false,
      `payment ledger schema scaffold must not create/alter unrelated table: ${pattern}`
    );
  }
});

test('payment ledger schema scaffold includes required payment projection constraints and indexes', async () => {
  const sql = await read(PAYMENT_SCHEMA_SQL);

  const requiredSnippets = [
    "CHECK (status IN ('pending', 'employer_confirmed', 'disputed', 'completed', 'cancelled', 'refunded', 'adjusted'))",
    "CHECK (currency = 'EGP')",
    'CHECK (amount >= 0)',
    'CHECK (platform_fee >= 0)',
    'CHECK (worker_payout >= 0)',
    'CHECK (amount = platform_fee + worker_payout)',
    "CHECK (method IN ('cash', 'wallet', 'instapay'))",
    'CHECK (workers_accepted >= 0)',
    'CHECK (daily_wage >= 0)',
    'CHECK (duration_days >= 1)',
    'payments_job_id_once_idx',
    'payments_employer_id_idx',
    'payments_status_idx',
    'payments_created_at_idx',
    'payments_imported_from_file_json_idx',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing payment projection snippet: ${snippet}`);
  }
});

test('payment ledger schema scaffold includes immutable ledger constraints and idempotency index', async () => {
  const sql = await read(PAYMENT_SCHEMA_SQL);

  const requiredSnippets = [
    'CREATE TABLE IF NOT EXISTS payment_ledger_entries',
    "CHECK (actor_role IS NULL OR actor_role IN ('worker', 'employer', 'admin', 'system'))",
    "CHECK (entry_type IN (",
    "'payment_created'",
    "'platform_fee_accrual'",
    "'worker_payout_payable'",
    "'employer_confirmed'",
    "'worker_disputed'",
    "'employer_disputed'",
    "'admin_resolved'",
    "'payment_completed'",
    "'payment_adjusted'",
    "'receipt_issued'",
    "'manual_admin_correction'",
    'CHECK (amount_delta = platform_fee_delta + worker_payout_delta)',
    'payment_ledger_payment_id_idx',
    'payment_ledger_job_id_idx',
    'payment_ledger_entry_type_idx',
    'payment_ledger_actor_idx',
    'payment_ledger_idempotency_key_idx',
    'prevent_payment_ledger_mutation',
    'trg_prevent_payment_ledger_update',
    'trg_prevent_payment_ledger_delete',
    'payment_ledger_entries is append-only',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing ledger snippet: ${snippet}`);
  }
});

test('payment ledger schema scaffold includes dispute and receipt persistence primitives', async () => {
  const sql = await read(PAYMENT_SCHEMA_SQL);

  const requiredSnippets = [
    'CREATE TABLE IF NOT EXISTS payment_disputes',
    "CHECK (opened_by_role IN ('worker', 'employer'))",
    "CHECK (status IN ('open', 'under_review', 'resolved_employer', 'resolved_worker', 'resolved_adjusted', 'dismissed'))",
    'payment_disputes_one_open_per_payment_idx',

    'CREATE TABLE IF NOT EXISTS receipt_sequences',
    'CHECK (next_sequence >= 1)',

    'CREATE TABLE IF NOT EXISTS receipts',
    'receipt_number TEXT NOT NULL UNIQUE',
    'payment_id TEXT NOT NULL REFERENCES payments(id)',
    'CHECK (subtotal = platform_fee + worker_payout)',
    "CHECK (issued_by_role IN ('admin', 'system', 'employer'))",
    'receipts_payment_id_once_idx',
    'receipts_issued_at_idx',
    'retroactive_policy_approval_id',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing dispute/receipt snippet: ${snippet}`);
  }
});

test('payment ledger schema scaffold documents transactional receipt sequence allocation', async () => {
  const sql = await read(PAYMENT_SCHEMA_SQL);

  const requiredSnippets = [
    'Future receipt allocation behavior must be equivalent to:',
    'FOR UPDATE',
    'INSERT INTO receipt_sequences',
    'ON CONFLICT (receipt_date) DO UPDATE',
    'RETURNING next_sequence - 1 AS allocated_sequence',
    'INSERT INTO receipts',
    "entry_type = 'receipt_issued'",
    'one transaction',
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing receipt transaction semantics snippet: ${snippet}`);
  }
});

test('payment ledger schema scaffold avoids import and destructive runtime statements', async () => {
  const sql = await read(PAYMENT_SCHEMA_SQL);
  const upper = stripSqlComments(sql).toUpperCase();

  const forbiddenSnippets = [
    'DROP TABLE',
    'DROP DATABASE',
    'TRUNCATE',
    'DELETE FROM',
    'UPDATE PAYMENTS',
    'UPDATE PAYMENT_LEDGER_ENTRIES',
    'UPDATE PAYMENT_DISPUTES',
    'UPDATE RECEIPTS',
    'INSERT INTO PAYMENTS',
    'INSERT INTO PAYMENT_LEDGER_ENTRIES',
    'INSERT INTO PAYMENT_DISPUTES',
    'COPY PAYMENTS',
    'COPY PAYMENT_LEDGER_ENTRIES',
    'COPY RECEIPTS',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(
      upper.includes(snippet),
      false,
      `static scaffold must not contain destructive/import statement: ${snippet}`
    );
  }
});

test('payment ledger schema README preserves static scaffold non-runtime posture', async () => {
  const readme = await read(PAYMENT_SCHEMA_README);

  const requiredPhrases = [
    'Static SQL scaffold only',
    'not executed',
    'PgPaymentRepository',
    'PaymentLedgerRepository runtime',
    'ReceiptRepository runtime',
    'still file-backed',
    'on-demand, not persisted transactionally',
    'install pg',
    'install node-pg-migrate',
    'open a database connection',
    'execute migrations',
    'activate PostgreSQL payment runtime',
    'import file-backed payments',
    'backfill ledger entries',
    'generate receipts',
    'assertPostgresTestDatabaseSafety',
    'YAWMIA_ALLOW_DB_TESTS=true',
    'YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test',
    'payment-backfill-dry-run.js --json --include-previews',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(readme.includes(phrase), `README missing required safety phrase: ${phrase}`);
  }
});

test('package.json remains free of PostgreSQL dependencies for static payment schema scaffold patch', async () => {
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

test('payment schema static test does not import pg or runtime payment services', async () => {
  const source = await readFile(
    new URL('./postgres-payment-ledger-schema-static.test.js', import.meta.url),
    'utf-8'
  );

  const forbiddenPatterns = [
    /from\s+['"]pg['"]/,
    /import\s*\(\s*['"]pg['"]\s*\)/,
    /from\s+['"].*PgPaymentRepository.*['"]/i,
    /import\s*\(\s*['"].*PgPaymentRepository.*['"]\s*\)/i,
    /from\s+['"].*PaymentLedgerRepository.*['"]/i,
    /import\s*\(\s*['"].*PaymentLedgerRepository.*['"]\s*\)/i,
    /payments\.js/,
    /financialExport\.js/,
    /jobs\.js/,
    /server\.js/,
    /server\/router\.js/,
    new RegExp(['node:child', 'process'].join('_')),
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(source),
      false,
      `static schema test must not import runtime/DB dependency: ${pattern}`
    );
  }
});
