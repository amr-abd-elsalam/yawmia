import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupBackupTree(root) {
  await mkdir(join(root, 'users'), { recursive: true });
  await mkdir(join(root, 'jobs'), { recursive: true });
  await mkdir(join(root, 'applications'), { recursive: true });
  await mkdir(join(root, 'notifications'), { recursive: true });
  await mkdir(join(root, 'audit'), { recursive: true });
  await mkdir(join(root, 'ops_queue'), { recursive: true });

  await writeFile(join(root, 'users', 'phone-index.json'), JSON.stringify({ '01012345678': 'usr_test' }, null, 2));
  await writeFile(join(root, 'jobs', 'index.json'), JSON.stringify({ job_test: { id: 'job_test', status: 'open' } }, null, 2));
  await writeFile(join(root, 'migration.json'), JSON.stringify({ version: 14, appliedAt: new Date().toISOString(), migrations: [] }, null, 2));
  await writeFile(join(root, 'users', 'usr_test.json'), JSON.stringify({ id: 'usr_test', phone: '01012345678', role: 'worker' }, null, 2));
}

test('backup restore drill passes on valid backup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-brd-'));
  process.env.YAWMIA_DATA_PATH = join(dir, 'data');

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const backupPath = join(dir, 'backup-valid');
    await setupBackupTree(backupPath);

    const drill = await import(`../server/services/backupRestoreDrill.js?brd=${Date.now()}`);
    const result = await drill.runBackupRestoreDrill({
      backupPath,
      restoreTargetDir: join(dir, 'restore'),
    });

    assert.equal(result.ok, true);
    assert.equal(result.drill.status, 'passed');
    assert.equal(result.drill.checks.jsonParse, true);
    assert.equal(result.drill.checks.criticalIndexes, true);
    assert.equal(result.drill.checks.migrationState, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});

test('backup restore drill fails on corrupted JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-brd-bad-'));
  process.env.YAWMIA_DATA_PATH = join(dir, 'data');

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const backupPath = join(dir, 'backup-corrupt');
    await setupBackupTree(backupPath);

    await writeFile(join(backupPath, 'users', 'usr_bad.json'), '{ broken json');

    const drill = await import(`../server/services/backupRestoreDrill.js?brd=${Date.now()}`);
    const result = await drill.runBackupRestoreDrill({
      backupPath,
      restoreTargetDir: join(dir, 'restore'),
    });

    assert.equal(result.ok, false);
    assert.equal(result.drill.status, 'failed');
    assert.ok(result.drill.errors.some(e => e.check === 'jsonParse'));
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
