import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCRIPTS_DIR = join(ROOT, 'scripts');
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

const HIGH_RISK_SCRIPTS = [
  'scripts/anonymize-user-data.js',
  'scripts/cleanup-attachments.js',
  'scripts/cleanup-notification-flood.js',
  'scripts/compact-counters.js',
  'scripts/compact-predictive-signals.js',
  'scripts/compact-queue.js',
  'scripts/compact-workrooms.js',
  'scripts/export-migration-snapshot.js',
  'scripts/migrate.js',
  'scripts/quarantine-corrupt-json.js',
  'scripts/queue-drain.js',
  'scripts/queue-retry-dlq.js',
  'scripts/rebuild-audit-index.js',
  'scripts/rebuild-counters.js',
  'scripts/rebuild-predictive-archive-index.js',
  'scripts/rebuild-search-relevance.js',
  'scripts/rebuild-workroom-search.js',
  'scripts/recover-stale-running-jobs.js',
  'scripts/repair-indexes.js',
  'scripts/repair-queue.js',
  'scripts/reset-dev-data.js',
];

const CRITICAL_SCRIPTS = [
  'scripts/anonymize-user-data.js',
  'scripts/queue-drain.js',
  'scripts/reset-dev-data.js',
];

async function listScriptFiles() {
  const entries = await readdir(SCRIPTS_DIR, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => `scripts/${entry.name}`)
    .sort();
}

test('SCRIPTS_CATALOG.md exists and mentions every scripts/*.js file', async () => {
  const [scripts, catalog] = await Promise.all([
    listScriptFiles(),
    readFile(CATALOG_PATH, 'utf-8'),
  ]);

  assert.ok(scripts.length > 0, 'expected scripts/*.js to exist');

  const missing = scripts.filter(scriptPath => !catalog.includes(`\`${scriptPath}\``));

  assert.deepEqual(
    missing,
    [],
    `Every script must be cataloged in docs/operations/SCRIPTS_CATALOG.md. Missing: ${missing.join(', ')}`
  );
});

test('SCRIPTS_CATALOG.md marks high-risk scripts with risk language', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  for (const scriptPath of HIGH_RISK_SCRIPTS) {
    assert.ok(
      catalog.includes(`\`${scriptPath}\``),
      `${scriptPath} must be cataloged`
    );

    const idx = catalog.indexOf(`\`${scriptPath}\``);
    const nearby = catalog.slice(Math.max(0, idx - 500), idx + 1200);

    assert.match(
      nearby,
      /High|Critical|Approval Required|Emergency Only|Dev Only|Never Production/i,
      `${scriptPath} must be visibly classified as High/Critical/Approval/Emergency/Dev-only`
    );
  }
});

test('SCRIPTS_CATALOG.md marks critical scripts as not normal production tools', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  for (const scriptPath of CRITICAL_SCRIPTS) {
    const idx = catalog.indexOf(`\`${scriptPath}\``);
    assert.notEqual(idx, -1, `${scriptPath} must be cataloged`);

    const nearby = catalog.slice(Math.max(0, idx - 800), idx + 1400);

    assert.match(
      nearby,
      /Critical|Never Production|Approval Required|Emergency Only|Dev Only/i,
      `${scriptPath} must be clearly marked critical/non-normal-production`
    );
  }
});

test('SCRIPTS_CATALOG.md includes governance policy sections', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredSections = [
    '## Dry-Run / Confirm Policy',
    '## Approval Rules',
    '## Commands That Must Not Be Run Without Explicit Incident Procedure',
    '## Maintenance Rules',
    '## Full Inventory Table',
  ];

  for (const section of requiredSections) {
    assert.ok(catalog.includes(section), `Missing catalog section: ${section}`);
  }
});
