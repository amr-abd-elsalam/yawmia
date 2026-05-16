import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-workroom-receipts-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const hygiene = await import(`../server/services/workroomHygiene.js?x=${Date.now()}`);

  return { dir, database, hygiene };
}

test('Phase 55: receipt compaction removes receipts for missing messages', async () => {
  const { dir, database, hygiene } = await setup();

  try {
    const jobId = 'job_receipts';

    await database.atomicWrite(database.getRecordPath('messages', 'msg_existing'), {
      id: 'msg_existing',
      jobId,
      senderId: 'usr_a',
      senderRole: 'worker',
      recipientId: 'usr_b',
      text: 'hello',
      read: false,
      source: 'workroom',
      createdAt: new Date().toISOString(),
    });

    await database.atomicWrite(database.getRecordPath('workroom_receipts', jobId), {
      jobId,
      messages: {
        msg_existing: { readBy: { usr_b: new Date().toISOString() } },
        msg_missing: { readBy: { usr_b: new Date().toISOString() } },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await hygiene._testHelpers.compactReceipts(jobId);

    assert.equal(result.removed, 1);

    const compacted = await database.readJSON(database.getRecordPath('workroom_receipts', jobId));
    assert.equal(!!compacted.messages.msg_existing, true);
    assert.equal(!!compacted.messages.msg_missing, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
