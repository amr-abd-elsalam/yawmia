import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 61.1: listQueueRecords skips corrupt queue JSON instead of crashing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p611-qcorrupt-'));
  const previous = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js?' + Date.now());
    await db.initDatabase();

    const storage = await import('../server/services/queueStorageIndex.js?' + Date.now());

    const pendingRoot = db.getCollectionPath('queue_pending');
    const month = new Date().toISOString().slice(0, 7);
    const pendingMonth = join(pendingRoot, month);
    await mkdir(pendingMonth, { recursive: true });

    await writeFile(join(pendingMonth, 'q_good.json'), JSON.stringify({
      id: 'q_good',
      type: 'test',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await writeFile(join(pendingMonth, 'q_bad.json'), '{ bad json');

    const rows = await storage.listQueueRecords({ status: 'pending', maxMonths: 12 });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'q_good');
  } finally {
    if (previous === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
