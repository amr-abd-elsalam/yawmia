import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT_PATH = join(ROOT, 'scripts', 'cleanup-notification-flood.js');
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

async function readScript() {
  return await readFile(SCRIPT_PATH, 'utf-8');
}

test('cleanup-notification-flood supports json/dry-run/confirm evidence flags', async () => {
  const source = await readScript();

  assert.match(source, /--json/, 'cleanup-notification-flood.js must support --json');
  assert.match(source, /--dry-run/, 'cleanup-notification-flood.js must support explicit --dry-run');
  assert.match(source, /--confirm/, 'cleanup-notification-flood.js must support --confirm');

  assert.match(source, /JSON_OUTPUT/, 'script must have JSON_OUTPUT mode');
  assert.match(source, /const DRY_RUN = !CONFIRM/, 'script must default to dry-run when --confirm is absent');

  assert.match(source, /mutationPerformed/, 'script must emit mutationPerformed');
  assert.match(source, /sourceDataMutated/, 'script must emit sourceDataMutated');
  assert.match(source, /derivedArtifactsMutated/, 'script must emit derivedArtifactsMutated');
  assert.match(source, /quarantineOnly:\s*true/, 'script must emit quarantineOnly:true');
  assert.match(source, /confirmCommand/, 'script must emit confirmCommand guidance');
  assert.match(source, /plannedActions/, 'script must emit plannedActions');
  assert.match(source, /quarantinedFiles/, 'script must emit quarantinedFiles');
  assert.match(source, /updatedIndexes/, 'script must emit updatedIndexes');
});

test('cleanup-notification-flood keeps quarantine-only movement semantics and never deletes', async () => {
  const source = await readScript();

  assert.match(source, /QUARANTINE_ROOT/, 'script must define quarantine root');
  assert.match(source, /moveToQuarantine/, 'script must keep quarantine helper');
  assert.match(source, /rename\(row\.filePath,\s*target\)/, 'script must move notification files by rename');
  assert.match(source, /notification_flood_quarantine_record/, 'script must write quarantine sidecar metadata');
  assert.match(source, /notifications', 'user-index\.json'|notifications\/user-index\.json/, 'script must reference notifications/user-index.json');

  assert.doesNotMatch(source, /\brm\(/, 'script must not call rm()');
  assert.doesNotMatch(source, /\bunlink\(/, 'script must not call unlink()');
  assert.doesNotMatch(source, /\bdeleteJSON\(/, 'script must not call deleteJSON()');
});

test('cleanup-notification-flood updates user-index only after confirmed quarantine path', async () => {
  const source = await readScript();

  const dryRunIdx = source.indexOf('if (DRY_RUN)');
  const readIndexIdx = source.indexOf('const index = await readJSON(USER_INDEX_PATH, {})');
  const writeIndexIdx = source.indexOf('await writeJSONAtomic(USER_INDEX_PATH, nextIndex)');

  assert.ok(dryRunIdx > 0, 'script must have an explicit dry-run branch');
  assert.ok(readIndexIdx > dryRunIdx, 'user index must be read after dry-run returns');
  assert.ok(writeIndexIdx > readIndexIdx, 'user index must be written only in confirmed path');
});

test('cleanup-notification-flood --dry-run --json emits parseable no-mutation evidence', async () => {
  const tempDataDir = await mkdtemp(join(tmpdir(), 'yawmia-notification-flood-dry-run-'));

  const result = spawnSync(
    process.execPath,
    ['scripts/cleanup-notification-flood.js', '--dry-run', '--json'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        YAWMIA_DATA_PATH: tempDataDir,
      },
      encoding: 'utf-8',
    }
  );

  assert.equal(result.status, 0, `dry-run json command must exit 0. stderr=${result.stderr}`);

  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, `stdout must be parseable JSON. stdout=${result.stdout}`);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.script, 'scripts/cleanup-notification-flood.js');
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.confirm, false);
  assert.equal(parsed.mutationPerformed, false);
  assert.equal(parsed.sourceDataMutated, false);
  assert.equal(parsed.derivedArtifactsMutated, false);
  assert.equal(parsed.quarantineOnly, true);
  assert.equal(parsed.dataDir, tempDataDir);
  assert.equal(parsed.duplicatesDetected, 0);
  assert.equal(parsed.duplicateFilesToQuarantine, 0);
  assert.ok(Array.isArray(parsed.plannedActions), 'plannedActions must be an array');
  assert.ok(Array.isArray(parsed.quarantinedFiles), 'quarantinedFiles must be an array');
  assert.ok(Array.isArray(parsed.updatedIndexes), 'updatedIndexes must be an array');
  assert.ok(Array.isArray(parsed.warnings), 'warnings must be an array');
  assert.equal(parsed.confirmCommand, 'node scripts/cleanup-notification-flood.js --confirm --json');
  assert.match(parsed.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('SCRIPTS_CATALOG documents cleanup-notification-flood as hardened after Patch 15', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const idx = catalog.indexOf('`scripts/cleanup-notification-flood.js`');
  assert.notEqual(idx, -1, 'cleanup-notification-flood.js must be present in scripts catalog');

  const nearby = catalog.slice(Math.max(0, idx - 1000), idx + 4000);

  const required = [
    'Hardened after Patch 15',
    'dry-run default',
    '--dry-run',
    '--confirm',
    '--json',
    'mutationPerformed',
    'sourceDataMutated',
    'derivedArtifactsMutated',
    'quarantineOnly:true',
    'confirmCommand',
    'never deletes',
  ];

  for (const phrase of required) {
    assert.match(
      nearby,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `catalog nearby cleanup-notification-flood.js must document: ${phrase}`
    );
  }

  assert.ok(
    catalog.includes('cleanup-notification-flood.js` was hardened in Patch 15'),
    'catalog must include Patch 15 completion note'
  );

  assert.doesNotMatch(
    catalog,
    /cleanup-notification-flood\.js` should gain explicit `--json`/,
    'catalog must no longer say cleanup-notification-flood.js should gain --json'
  );

  assert.doesNotMatch(
    catalog,
    /no explicit `--json`/,
    'catalog must no longer describe cleanup-notification-flood.js as lacking --json'
  );
});
