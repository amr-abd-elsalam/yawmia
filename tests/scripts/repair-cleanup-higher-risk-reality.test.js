import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

const PATCH11_SCRIPTS = [
  'scripts/repair-indexes.js',
  'scripts/repair-queue.js',
  'scripts/compact-queue.js',
  'scripts/cleanup-notification-flood.js',
];

test('Patch 11 higher-risk repair/cleanup scripts are cataloged with reality status', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  assert.ok(
    catalog.includes('## Patch 11 Repair / Cleanup Higher-Risk Scripts Reality Check'),
    'catalog must include Patch 11 repair/cleanup reality section'
  );

  assert.ok(
    catalog.includes('## Patch 11 Repair / Cleanup Dependency Map'),
    'catalog must include Patch 11 dependency map'
  );

  for (const scriptPath of PATCH11_SCRIPTS) {
    const idx = catalog.indexOf(`\`${scriptPath}\``);
    assert.notEqual(idx, -1, `${scriptPath} must be cataloged`);

    const nearby = catalog.slice(Math.max(0, idx - 500), idx + 1800);

    assert.match(
      nearby,
      /High|Emergency Only|Approval Required|Confirm Required|confirmed mode|Hardened|Dry-run default|Dry Run Default/i,
      `${scriptPath} must have clear higher-risk safety classification`
    );
  }
});

test('repair-indexes is dry-run by default and confirmed mutation rewrites indexes', async () => {
  const source = await readScript('scripts/repair-indexes.js');

  assert.match(source, /--confirm/, 'repair-indexes.js must support --confirm');
  assert.match(source, /--dry-run/, 'repair-indexes.js must mention/support --dry-run');
  assert.match(
    source,
    /const DRY_RUN = !CONFIRM \|\| process\.argv\.includes\('--dry-run'\)/,
    'repair-indexes.js must default to dry-run when --confirm is absent'
  );

  assert.match(source, /atomicWrite/, 'repair-indexes.js must use atomic writes for index rebuild');
  assert.match(source, /phone-index\.json/, 'repair-indexes.js must rebuild phone index');
  assert.match(source, /jobs\/index\.json/, 'repair-indexes.js must rebuild jobs index');
});

test('repair-queue requires confirm, json, approval id, and quiet-state preflight', async () => {
  const source = await readScript('scripts/repair-queue.js');

  assert.match(source, /--json/, 'repair-queue.js must support --json');
  assert.match(source, /--confirm/, 'repair-queue.js must support --confirm');
  assert.match(source, /--dry-run/, 'repair-queue.js must support --dry-run');
  assert.match(source, /--approval-id=/, 'repair-queue.js must require approval id for confirmed repair');
  assert.match(source, /ACTIVE_YAWMIA_SERVER_PROCESS/, 'repair-queue.js must block active server processes');
  assert.match(source, /PM2_MANAGED_YAWMIA_ACTIVE/, 'repair-queue.js must block active PM2-managed Yawmia');
  assert.match(source, /recover-stale-running-jobs\.js/, 'repair-queue.js must run stale-running dry-run preflight');
  assert.match(source, /mutationPerformed:\s*false/, 'repair-queue.js must emit mutationPerformed=false when confirm preflight blocks');
});

test('compact-queue is dry-run by default and supports json/confirm', async () => {
  const source = await readScript('scripts/compact-queue.js');

  assert.match(source, /--json/, 'compact-queue.js must support --json');
  assert.match(source, /--confirm/, 'compact-queue.js must support --confirm');
  assert.match(source, /--dry-run/, 'compact-queue.js must support --dry-run');
  assert.match(
    source,
    /const DRY_RUN = process\.argv\.includes\('--dry-run'\) \|\| !CONFIRM/,
    'compact-queue.js must default to dry-run when --confirm is absent'
  );
  assert.match(source, /compactQueue/, 'compact-queue.js must delegate compaction to queue service');
});

test('cleanup-notification-flood is dry-run by default, quarantine-only, and never deletes', async () => {
  const source = await readScript('scripts/cleanup-notification-flood.js');

  assert.match(source, /--confirm/, 'cleanup-notification-flood.js must support --confirm');
  assert.match(source, /DRY-RUN/, 'cleanup-notification-flood.js must document dry-run default');
  assert.match(source, /QUARANTINE_ROOT/, 'cleanup-notification-flood.js must quarantine duplicate notifications');
  assert.match(source, /rename/, 'cleanup-notification-flood.js moves files to quarantine');
  assert.match(source, /user-index\.json/, 'cleanup-notification-flood.js updates notifications/user-index.json');

  assert.doesNotMatch(source, /\brm\(/, 'cleanup-notification-flood.js must not call rm()');
  assert.doesNotMatch(source, /\bunlink\(/, 'cleanup-notification-flood.js must not call unlink()');
  assert.doesNotMatch(source, /\bdeleteJSON\(/, 'cleanup-notification-flood.js must not call deleteJSON()');
});

test('catalog documents Patch 11 known hardening gaps and Patch 15 cleanup completion', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const expected = [
    'repair-indexes.js` was hardened in Patch 14',
    'cleanup-notification-flood.js` was hardened in Patch 15',
    'compact-queue.js` should expose or normalize `mutationPerformed`',
    'repair-queue.js` currently requires an approval id shape',
  ];

  for (const phrase of expected) {
    assert.ok(
      catalog.includes(phrase),
      `catalog must document Patch 11/15 hardening status: ${phrase}`
    );
  }

  assert.doesNotMatch(
    catalog,
    /cleanup-notification-flood\.js` should gain explicit `--json`/,
    'catalog must no longer list cleanup-notification-flood.js as lacking --json'
  );
});
