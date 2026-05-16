import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-workroom-search-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const search = await import(`../server/services/workroomSearch.js?x=${Date.now()}`);
  const health = await import(`../server/services/workroomIndexHealth.js?x=${Date.now()}`);

  return { dir, database, search, health };
}

test('Phase 55: workroom search verify detects missing index', async () => {
  const { dir, database, health } = await setup();

  try {
    const jobId = 'job_search_missing';

    await database.atomicWrite(database.getRecordPath('messages', 'msg_search_missing'), {
      id: 'msg_search_missing',
      jobId,
      senderId: 'usr_a',
      senderRole: 'worker',
      recipientId: 'usr_b',
      text: 'أنا في الطريق',
      source: 'workroom',
      createdAt: new Date().toISOString(),
    });

    const result = await health.verifyWorkroomSearchIndex(jobId);

    assert.equal(result.status, 'warnings');
    assert.equal(result.missing, true);
    assert.equal(result.warnings.length > 0, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: workroom search verify passes after rebuild', async () => {
  const { dir, database, search, health } = await setup();

  try {
    const jobId = 'job_search_ok';

    await database.atomicWrite(database.getRecordPath('messages', 'msg_search_ok'), {
      id: 'msg_search_ok',
      jobId,
      senderId: 'usr_a',
      senderRole: 'worker',
      recipientId: 'usr_b',
      text: 'وصلت للموقع',
      source: 'workroom',
      createdAt: new Date().toISOString(),
    });

    const rebuild = await search.rebuildWorkroomSearchIndex(jobId);
    assert.equal(rebuild.rebuilt, true);

    const result = await health.verifyWorkroomSearchIndex(jobId);

    assert.equal(result.ok, true);
    assert.equal(result.status, 'healthy');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
