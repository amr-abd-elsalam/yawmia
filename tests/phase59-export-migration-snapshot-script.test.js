import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function runNode(args, env) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 120000,
  });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

test('export-migration-snapshot.js --dry-run outputs JSON and writes nothing', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'yawmia-p59-snapshot-data-'));
  const outDir = await mkdtemp(join(tmpdir(), 'yawmia-p59-snapshot-out-'));
  const target = join(outDir, 'dry-run-target');

  try {
    const { initDatabase } = await import('../server/services/database.js');
    const oldPath = process.env.YAWMIA_DATA_PATH;
    process.env.YAWMIA_DATA_PATH = dataDir;
    await initDatabase();

    await writeFile(join(dataDir, 'users', 'usr_export.json'), JSON.stringify({
      id: 'usr_export',
      phone: '01022222222',
      name: 'Export User',
      token: 'raw-token-should-not-export',
    }), 'utf-8');

    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;

    const proc = runNode([
      'scripts/export-migration-snapshot.js',
      '--dry-run',
      '--json',
      `--out=${target}`,
      '--collections=users',
    ], {
      YAWMIA_DATA_PATH: dataDir,
    });

    assert.equal(proc.status, 0, proc.stderr || proc.stdout);

    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dryRun, true);
    assert.equal(await exists(target), false, 'dry-run should not create target dir');

    const serialized = JSON.stringify(parsed);
    assert.ok(!serialized.includes('raw-token-should-not-export'));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }
});

test('export-migration-snapshot.js --confirm writes manifest and NDJSON with redaction', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'yawmia-p59-snapshot-data2-'));
  const outBase = await mkdtemp(join(tmpdir(), 'yawmia-p59-snapshot-out2-'));
  const target = join(outBase, 'snapshot');

  try {
    const { initDatabase } = await import('../server/services/database.js');
    const oldPath = process.env.YAWMIA_DATA_PATH;
    process.env.YAWMIA_DATA_PATH = dataDir;
    await initDatabase();

    await writeFile(join(dataDir, 'users', 'usr_export2.json'), JSON.stringify({
      id: 'usr_export2',
      phone: '01033333333',
      name: 'Export User 2',
      token: 'raw-token-should-not-export',
      secretValue: 'secret-should-redact',
    }), 'utf-8');

    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;

    const proc = runNode([
      'scripts/export-migration-snapshot.js',
      '--confirm',
      '--json',
      '--overwrite',
      `--out=${target}`,
      '--collections=users',
    ], {
      YAWMIA_DATA_PATH: dataDir,
    });

    assert.equal(proc.status, 0, proc.stderr || proc.stdout);

    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dryRun, false);

    const manifestPath = join(target, 'manifest.json');
    const usersPath = join(target, 'users.ndjson');

    assert.equal(await exists(manifestPath), true);
    assert.equal(await exists(usersPath), true);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    assert.equal(manifest.collections.users.count, 1);
    assert.ok(manifest.collections.users.sha256);

    const ndjson = await readFile(usersPath, 'utf-8');
    assert.ok(ndjson.includes('usr_export2'));
    assert.ok(ndjson.includes('[redacted]'));
    assert.ok(!ndjson.includes('raw-token-should-not-export'));
    assert.ok(!ndjson.includes('secret-should-redact'));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(outBase, { recursive: true, force: true });
  }
});
