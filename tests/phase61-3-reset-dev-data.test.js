import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SCRIPT = join(ROOT, 'scripts', 'reset-dev-data.js');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-reset-'));

  const dirs = [
    'data',
    'logs',
    'backups',
    'test-backups',
    'migration-snapshots',
    'frontend',
    'scripts',
    'tests',
    'docs',
  ];

  for (const d of dirs) {
    await mkdir(join(dir, d), { recursive: true });
    await writeFile(join(dir, d, 'keep.txt'), 'x');
  }

  await writeFile(join(dir, 'package.json'), '{"private":true}');
  await writeFile(join(dir, 'config.js'), 'export default {};');
  await writeFile(join(dir, '.env.example'), 'PORT=3002');

  return dir;
}

function runReset(cwd, args = [], env = {}) {
  const proc = spawnSync(process.execPath, [SCRIPT, '--json', ...args], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ...env,
    },
    encoding: 'utf-8',
  });

  let parsed = null;
  try {
    parsed = JSON.parse(proc.stdout);
  } catch (_) {}

  return {
    status: proc.status,
    stdout: proc.stdout,
    stderr: proc.stderr,
    parsed,
  };
}

test('reset-dev-data dry-run lists targets and does not delete anything', async () => {
  const cwd = await makeFixture();

  const result = runReset(cwd, ['--dry-run']);

  assert.equal(result.status, 0);
  assert.equal(result.parsed.ok, true);
  assert.equal(result.parsed.dryRun, true);
  assert.equal(result.parsed.mutationPerformed, false);

  assert.equal(await exists(join(cwd, 'data')), true);
  assert.equal(await exists(join(cwd, 'test-backups')), true);
  assert.equal(await exists(join(cwd, 'migration-snapshots')), true);
  assert.equal(await exists(join(cwd, 'logs')), true);
  assert.equal(await exists(join(cwd, 'backups')), true);
  assert.equal(await exists(join(cwd, 'frontend')), true);
  assert.equal(await exists(join(cwd, 'docs')), true);

  const plannedKeys = result.parsed.planned.map(t => t.key).sort();
  assert.deepEqual(plannedKeys, ['data', 'migration-snapshots', 'test-backups']);
});

test('reset-dev-data --confirm deletes default experimental targets only', async () => {
  const cwd = await makeFixture();

  const result = runReset(cwd, ['--confirm']);

  assert.equal(result.status, 0);
  assert.equal(result.parsed.ok, true);
  assert.equal(result.parsed.dryRun, false);
  assert.equal(result.parsed.mutationPerformed, true);

  assert.equal(await exists(join(cwd, 'data')), false);
  assert.equal(await exists(join(cwd, 'test-backups')), false);
  assert.equal(await exists(join(cwd, 'migration-snapshots')), false);

  assert.equal(await exists(join(cwd, 'logs')), true);
  assert.equal(await exists(join(cwd, 'backups')), true);

  assert.equal(await exists(join(cwd, 'frontend')), true);
  assert.equal(await exists(join(cwd, 'scripts')), true);
  assert.equal(await exists(join(cwd, 'tests')), true);
  assert.equal(await exists(join(cwd, 'docs')), true);
  assert.equal(await exists(join(cwd, 'package.json')), true);
  assert.equal(await exists(join(cwd, 'config.js')), true);
  assert.equal(await exists(join(cwd, '.env.example')), true);
});

test('reset-dev-data requires explicit include flags for backups and logs', async () => {
  const cwd = await makeFixture();

  const result = runReset(cwd, ['--confirm', '--include-logs', '--include-backups']);

  assert.equal(result.status, 0);
  assert.equal(result.parsed.ok, true);

  assert.equal(await exists(join(cwd, 'logs')), false);
  assert.equal(await exists(join(cwd, 'backups')), false);

  assert.equal(await exists(join(cwd, 'frontend')), true);
  assert.equal(await exists(join(cwd, 'docs')), true);
});

test('reset-dev-data blocks production mutation by default', async () => {
  const cwd = await makeFixture();

  const result = runReset(cwd, ['--confirm'], { NODE_ENV: 'production' });

  assert.notEqual(result.status, 0);
  assert.equal(result.parsed.ok, false);
  assert.equal(result.parsed.mutationPerformed, false);
  assert.ok(result.parsed.blockers.some(b => b.code === 'PRODUCTION_RESET_BLOCKED'));

  assert.equal(await exists(join(cwd, 'data')), true);
  assert.equal(await exists(join(cwd, 'test-backups')), true);
  assert.equal(await exists(join(cwd, 'migration-snapshots')), true);
});
