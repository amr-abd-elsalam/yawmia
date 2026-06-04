import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

test('SCRIPTS_CATALOG.md includes final Patch 13 governance summary', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  assert.ok(
    catalog.includes('## Final Scripts Governance Summary — Patch 13'),
    'catalog must include final Patch 13 governance summary'
  );

  assert.ok(
    catalog.includes('The project does **not** have a script-count problem by itself.'),
    'catalog must preserve script-count-risk framing'
  );

  assert.ok(
    catalog.includes('The real operational risk is:'),
    'catalog must explain the real scripts governance risk'
  );
});

test('final governance summary preserves script retention policy', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'A script should be kept if:',
    'A script should be archived or merged later only if:',
    'No script is approved for deletion in the current governance pass.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `catalog must include retention policy phrase: ${phrase}`
    );
  }
});

test('final governance summary documents current hardening backlog', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const backlogScripts = [
    'scripts/repair-indexes.js',
    'scripts/cleanup-notification-flood.js',
    'scripts/compact-queue.js',
    'scripts/repair-queue.js',
    'scripts/migrate.js',
    'scripts/backup.js',
    'scripts/ops-weekly-review.js',
    'scripts/verify-marketplace-intelligence.js',
    'scripts/scheduler-cadence-report.js',
    'scripts/benchmark-file-paths.js',
  ];

  for (const scriptPath of backlogScripts) {
    const idx = catalog.indexOf(`\`${scriptPath}\``);
    assert.notEqual(idx, -1, `${scriptPath} must be present in final hardening backlog`);
  }

  const requiredHardeningTerms = [
    'mutationPerformed',
    'confirmCommand',
    '--json',
    '--dry-run',
    '--no-register',
    'manifest',
    'checksums',
  ];

  for (const term of requiredHardeningTerms) {
    assert.ok(
      catalog.includes(term),
      `final hardening backlog must mention ${term}`
    );
  }
});

test('final governance summary preserves no-action safety decisions', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredNoActionLines = [
    'No deletion now.',
    'No archival now.',
    'No reset.',
    'No confirmed mutation required.',
    'No production queue mutation required.',
    'No index repair execution required.',
    'No notification quarantine execution required.',
    'No migration execution required.',
    'No snapshot export execution required.',
    'No externalization.',
    'No PostgreSQL.',
    'No Redis.',
    'No external queue.',
    'No external search.',
    'No new dependencies.',
  ];

  for (const line of requiredNoActionLines) {
    assert.ok(
      catalog.includes(line),
      `catalog must preserve no-action decision: ${line}`
    );
  }
});

test('final governance workflow keeps confirm commands out of catalog review', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredWorkflowLines = [
    'Read script source first.',
    'Classify production use and mutation risk.',
    'Update this catalog in the same PR.',
    'Add or update static safety tests for High/Critical scripts.',
    'Keep default behavior safe.',
    'Require --confirm for mutation.',
    'Prefer --json for automation evidence.',
    'Preserve dry-run output for incident review.',
    'Never run confirmed mutation during catalog review.',
  ];

  for (const line of requiredWorkflowLines) {
    assert.ok(
      catalog.includes(line),
      `catalog must preserve governance workflow rule: ${line}`
    );
  }
});
