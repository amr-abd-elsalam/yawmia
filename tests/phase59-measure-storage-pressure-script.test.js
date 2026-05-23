import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function runNode(args, env) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 60000,
  });
}

test('measure-storage-pressure.js --json outputs valid JSON and respects YAWMIA_DATA_PATH', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-measure-script-'));

  try {
    const { initDatabase } = await import('../server/services/database.js');
    const oldPath = process.env.YAWMIA_DATA_PATH;
    process.env.YAWMIA_DATA_PATH = dir;
    await initDatabase();
    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;

    await writeFile(join(dir, 'users', 'usr_script.json'), JSON.stringify({
      id: 'usr_script',
      phone: '01000000000',
      name: 'Should Not Leak',
    }), 'utf-8');

    const proc = runNode(['scripts/measure-storage-pressure.js', '--json', '--collection=users'], {
      YAWMIA_DATA_PATH: dir,
    });

    assert.equal(proc.status, 0, proc.stderr || proc.stdout);

    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.storagePressure);
    assert.equal(parsed.storagePressure.collections.users.fileCount, 1);

    const serialized = JSON.stringify(parsed);
    assert.ok(!serialized.includes('01000000000'));
    assert.ok(!serialized.includes('Should Not Leak'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('measure-storage-pressure.js human output succeeds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-measure-human-'));

  try {
    const proc = runNode(['scripts/measure-storage-pressure.js', '--collection=users', '--no-persist'], {
      YAWMIA_DATA_PATH: dir,
    });

    assert.equal(proc.status, 0, proc.stderr || proc.stdout);
    assert.match(proc.stdout, /Storage Pressure|ضغط التخزين|يوميّة/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
