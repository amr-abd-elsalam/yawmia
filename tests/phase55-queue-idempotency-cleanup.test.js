import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-idem-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const compaction = await import(`../server/services/queueCompaction.js?x=${Date.now()}`);

  return { dir, database, compaction };
}

test('Phase 55: expired idempotency records are cleaned', async () => {
  const { dir, database, compaction } = await setup();

  try {
    const rec = {
      keyHash: 'a'.repeat(64),
      idempotencyKey: 'test-expired',
      jobId: 'q_missing',
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    };

    await database.atomicWrite(database.getRecordPath('ops_queue_idempotency', rec.keyHash), rec);

    const result = await compaction.cleanupIdempotencyRecords();

    assert.equal(result.cleaned, 1);

    const filePath = join(dir, 'ops_queue', 'idempotency', rec.keyHash + '.json');
    const exists = await stat(filePath).then(() => true).catch(() => false);
    assert.equal(exists, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
