import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT_PATH = join(ROOT, 'scripts', 'repair-indexes.js');
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

async function readScript() {
  return await readFile(SCRIPT_PATH, 'utf-8');
}

test('repair-indexes supports json/dry-run/confirm safety flags', async () => {
  const source = await readScript();

  assert.match(source, /--json/, 'repair-indexes.js must support --json');
  assert.match(source, /--dry-run/, 'repair-indexes.js must support --dry-run');
  assert.match(source, /--confirm/, 'repair-indexes.js must support --confirm');

  assert.match(
    source,
    /const DRY_RUN = !CONFIRM \|\| process\.argv\.includes\('--dry-run'\)/,
    'repair-indexes.js must default to dry-run when --confirm is absent'
  );

  assert.match(source, /JSON_OUTPUT/, 'repair-indexes.js must have JSON output mode');
  assert.match(source, /mutationPerformed/, 'repair-indexes.js must emit mutationPerformed');
  assert.match(source, /sourceDataMutated:\s*false/, 'repair-indexes.js must declare sourceDataMutated=false');
  assert.match(source, /derivedArtifactsMutated/, 'repair-indexes.js must emit derivedArtifactsMutated');
  assert.match(source, /confirmCommand/, 'repair-indexes.js must emit confirmCommand guidance');
  assert.match(source, /plannedActions/, 'repair-indexes.js must emit plannedActions');
  assert.match(source, /repairedIndexes/, 'repair-indexes.js must emit repairedIndexes');
  assert.match(source, /changedIndexes/, 'repair-indexes.js must emit changedIndexes');
  assert.match(source, /unchangedIndexes/, 'repair-indexes.js must emit unchangedIndexes');
});

test('repair-indexes keeps atomic unique temp-file writes and avoids destructive deletes', async () => {
  const source = await readScript();

  assert.match(source, /atomicWrite/, 'repair-indexes.js must use atomicWrite');
  assert.match(
    source,
    /\$\{filePath\}\.\$\{process\.pid\}\.\$\{Date\.now\(\)\}\.\$\{Math\.random\(\)\.toString\(36\)\.slice\(2\)\}\.tmp/,
    'repair-indexes.js must keep unique temp-file atomic writes'
  );
  assert.match(source, /rename\(tmpPath,\s*filePath\)/, 'repair-indexes.js must atomically rename tmp file to target');

  assert.doesNotMatch(source, /\brm\(/, 'repair-indexes.js must not call rm()');
  assert.doesNotMatch(source, /\bunlink\(/, 'repair-indexes.js must not call unlink()');
  assert.doesNotMatch(source, /\bdeleteJSON\(/, 'repair-indexes.js must not call deleteJSON()');
});

test('repair-indexes --dry-run --json emits parseable operational evidence without mutation', async () => {
  const tempDataDir = await mkdtemp(join(tmpdir(), 'yawmia-repair-indexes-dry-run-'));

  const result = spawnSync(
    process.execPath,
    ['scripts/repair-indexes.js', '--dry-run', '--json'],
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
  assert.equal(parsed.script, 'scripts/repair-indexes.js');
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.confirm, false);
  assert.equal(parsed.mutationPerformed, false);
  assert.equal(parsed.sourceDataMutated, false);
  assert.equal(parsed.derivedArtifactsMutated, false);
  assert.equal(parsed.dataDir, tempDataDir);
  assert.equal(typeof parsed.totalIndexesChecked, 'number');
  assert.equal(typeof parsed.changedIndexes, 'number');
  assert.equal(typeof parsed.unchangedIndexes, 'number');
  assert.ok(Array.isArray(parsed.plannedActions), 'plannedActions must be an array');
  assert.ok(Array.isArray(parsed.repairedIndexes), 'repairedIndexes must be an array');
  assert.ok(Array.isArray(parsed.warnings), 'warnings must be an array');
  assert.equal(parsed.confirmCommand, 'node scripts/repair-indexes.js --confirm --json');
  assert.match(parsed.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('SCRIPTS_CATALOG documents repair-indexes as hardened after Patch 14', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const idx = catalog.indexOf('`scripts/repair-indexes.js`');
  assert.notEqual(idx, -1, 'repair-indexes.js must be present in scripts catalog');

  const nearby = catalog.slice(Math.max(0, idx - 1000), idx + 3000);

  const required = [
    'Hardened',
    'dry-run default',
    'confirm',
    'json',
    'mutationPerformed',
    'sourceDataMutated:false',
    'derivedArtifactsMutated',
    'confirmCommand',
  ];

  for (const phrase of required) {
    assert.match(
      nearby,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `catalog nearby repair-indexes.js must document: ${phrase}`
    );
  }

  assert.ok(
    catalog.includes('repair-indexes.js` was hardened in Patch 14'),
    'catalog must replace old hardening gap with Patch 14 completion note'
  );

  assert.doesNotMatch(
    catalog,
    /repair-indexes\.js` should gain `--json`/,
    'catalog must no longer say repair-indexes.js should gain --json'
  );

  assert.doesNotMatch(
    catalog,
    /repair-indexes\.js` \| Dry-run default, confirm required, no `--json`/,
    'final backlog must no longer describe repair-indexes.js as lacking --json'
  );
});
