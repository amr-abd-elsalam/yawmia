// ═══════════════════════════════════════════════════════════════
// tests/contracts/payment-ledger-migration-static-policy.test.js
// Patch 75 — Payment Ledger Migration Static Policy Enforcement
// ═══════════════════════════════════════════════════════════════
// Purpose:
//   Static guardrail to ensure payment dry-run evidence does not silently become
//   payment import, ledger runtime, receipt generation, DB migration execution,
//   or hidden dual-write.
//
// Safety:
//   - no DB connection
//   - no ./data mutation
//   - no server runtime import
//   - no payment import execution
//   - no ledger writes
//   - no receipt generation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch (_) {
    return '';
  }
}

async function listScripts() {
  let entries = [];
  try {
    entries = await readdir('scripts', { withFileTypes: true });
  } catch (_) {
    return [];
  }

  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => `scripts/${entry.name}`)
    .sort();
}

test('payment ledger migration static policy: dependencies are not installed implicitly', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'pg'),
    false,
    'pg must not be installed until an explicit dependency patch with DB-test guard and migration plan'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(deps, 'node-pg-migrate'),
    false,
    'node-pg-migrate must not be installed until an explicit migration-tool patch'
  );
});

test('payment ledger migration static policy: runtime payment paths do not import postgres ledger adapters', async () => {
  const runtimeFiles = [
    'server.js',
    'server/router.js',
    'server/services/payments.js',
    'server/services/jobs.js',
    'server/handlers/paymentsHandler.js',
    'server/handlers/analyticsHandler.js',
  ];

  const forbiddenSnippets = [
    "from 'pg'",
    'from "pg"',
    "import pg",
    'node-pg-migrate',
    'PgPaymentRepository',
    'PgPaymentLedgerRepository',
    'PgReceiptRepository',
    'PaymentLedgerRepository',
    'PAYMENT_REPOSITORY_MODE=postgres',
    'PAYMENT_LEDGER_ENABLED=true',
    'RECEIPT_PERSISTENCE_ENABLED=true',
  ];

  for (const file of runtimeFiles) {
    const source = await readIfExists(file);

    for (const snippet of forbiddenSnippets) {
      assert.equal(
        source.includes(snippet),
        false,
        `${file} must not include payment ledger runtime activation/import snippet: ${snippet}`
      );
    }
  }
});

test('payment ledger migration static policy: no payment or ledger import execution script exists yet', async () => {
  const scripts = await listScripts();

  const forbiddenScriptNames = [
    'scripts/payment-import.js',
    'scripts/import-payments.js',
    'scripts/import-payment-ledger.js',
    'scripts/ledger-import.js',
    'scripts/payment-ledger-import.js',
    'scripts/backfill-payment-ledger.js',
    'scripts/generate-receipts.js',
    'scripts/issue-receipts.js',
    'scripts/payment-reconcile-confirm.js',
    'scripts/payment-repair.js',
  ];

  for (const script of forbiddenScriptNames) {
    assert.equal(
      scripts.includes(script),
      false,
      `${script} must not exist until an explicit approved import/reconciliation/runtime patch`
    );
  }
});

test('payment ledger migration static policy: payment dry-run remains no-mutation evidence only', async () => {
  const source = await readFile('scripts/payment-backfill-dry-run.js', 'utf-8');

  const requiredEvidenceSnippets = [
    "mode: 'dry-run'",
    'mutationPerformed: false',
    'reportVersion',
    'severity',
    'importGate',
    'importBlockerCount',
    'financeRisk',
    'receiptRisk',
    'reconciliation',
    'wouldInsertLedgerEntryCount',
    'wouldInsertReceiptCount',
    'receiptNumberNonTransactionalRisk',
    'FORBIDDEN_MUTATION_FLAG',
    '--confirm',
    '--ledger-write',
    '--generate-receipts',
    '--mutate-payments',
    '--import',
  ];

  for (const snippet of requiredEvidenceSnippets) {
    assert.ok(
      source.includes(snippet),
      `payment dry-run script must preserve evidence/no-mutation snippet: ${snippet}`
    );
  }

  const forbiddenRuntimeSnippets = [
    '../server.js',
    '../server/router.js',
    '../server/services/payments.js',
    '../server/services/jobs.js',
    '../server/services/financialExport.js',
    '../server/services/database.js',
    '../server/services/eventBus.js',
    '../server/services/opsQueue.js',
    '../server/services/queueWorkers.js',
    '../server/services/schedulerRegistry.js',
    '../server/repositories',
    'atomicWrite',
    'writeFile(',
    'appendFile',
    'unlink(',
    'rm(',
    'rename(',
    'mkdir(',
    'eventBus.emit',
    'generateReceipt',
    'createPayment',
    'completePayment',
    'disputePayment',
    "from 'pg'",
    'from "pg"',
    'node-pg-migrate',
  ];

  for (const snippet of forbiddenRuntimeSnippets) {
    assert.equal(
      source.includes(snippet),
      false,
      `payment dry-run script must not include runtime/mutation snippet: ${snippet}`
    );
  }
});

test('payment ledger migration static policy: planning docs explicitly say not implemented / no mutation', async () => {
  const docs = [
    'docs/architecture/PAYMENT_BACKFILL_DRY_RUN_DESIGN.md',
    'docs/architecture/PAYMENT_LEDGER_RUNTIME_MIGRATION_PLAN.md',
  ];

  for (const docPath of docs) {
    assert.equal(
      await fileExists(docPath),
      true,
      `${docPath} must exist`
    );

    const doc = await readFile(docPath, 'utf-8');

    assert.match(
      doc,
      /Runtime status:\s*Not implemented|does not implement|No ledger writes|No receipt generation|No DB writes|planning document/i,
      `${docPath} must preserve no-runtime-readiness language`
    );
  }
});

test('payment ledger migration static policy: payment dry-run is cataloged as safe read-only evidence tooling', async () => {
  const catalog = await readFile('docs/operations/SCRIPTS_CATALOG.md', 'utf-8');
  const script = '`scripts/payment-backfill-dry-run.js`';

  const idx = catalog.indexOf(script);
  assert.notEqual(idx, -1, 'payment-backfill-dry-run.js must be cataloged');

  const nearby = catalog.slice(Math.max(0, idx - 800), idx + 1600);

  const requiredCatalogLanguage = [
    /Safe Read-Only/i,
    /No mutation/i,
    /no ledger writes/i,
    /no receipt generation/i,
    /no DB writes/i,
    /required before.*ledger backfill/i,
  ];

  for (const rx of requiredCatalogLanguage) {
    assert.match(
      nearby,
      rx,
      `SCRIPTS_CATALOG.md payment dry-run entry must include policy language: ${rx}`
    );
  }
});
