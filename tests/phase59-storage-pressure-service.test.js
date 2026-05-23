import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('storagePressure shallow scan counts flat and sharded files without PII output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-storage-'));
  const oldPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js');
    await db.initDatabase();

    await writeFile(join(dir, 'users', 'usr_test.json'), JSON.stringify({
      id: 'usr_test',
      phone: '01000000000',
      name: 'Secret Name',
    }), 'utf-8');

    await mkdir(join(dir, 'jobs', '2026-05'), { recursive: true });
    await writeFile(join(dir, 'jobs', '2026-05', 'job_test.json'), JSON.stringify({
      id: 'job_test',
      title: 'Job',
    }), 'utf-8');

    await writeFile(join(dir, 'jobs', 'old.tmp'), '{}', 'utf-8');

    const storage = await import('../server/services/storagePressure.js');
    const stats = await storage.getCollectionStorageStats('jobs');

    assert.equal(stats.collection, 'jobs');
    assert.equal(stats.fileCount, 1);
    assert.ok(stats.shards['2026-05']);
    assert.equal(stats.shards['2026-05'].fileCount, 1);
    assert.equal(stats.tmpFileCount, 1);

    const users = await storage.getCollectionStorageStats('users');
    assert.equal(users.fileCount, 1);

    const snapshot = await storage.getStoragePressure({
      force: true,
      persist: false,
      collection: 'users',
    });

    const serialized = JSON.stringify(snapshot);
    assert.ok(!serialized.includes('01000000000'), 'pressure output must not include phone');
    assert.ok(!serialized.includes('Secret Name'), 'pressure output must not include names');
  } finally {
    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test('storagePressure can persist and list snapshots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-snapshots-'));
  const oldPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js');
    await db.initDatabase();

    const storage = await import('../server/services/storagePressure.js');
    const snapshot = await storage.captureStoragePressureSnapshot({
      collection: 'users',
    });

    assert.ok(snapshot.id.startsWith('sp_'));

    const listed = await storage.listStoragePressureSnapshots({ limit: 5 });
    assert.ok(listed.total >= 1);
    assert.ok(listed.snapshots.some(s => s.id === snapshot.id));
  } finally {
    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});
