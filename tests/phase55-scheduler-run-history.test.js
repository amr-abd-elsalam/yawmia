import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-scheduler-history-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const history = await import(`../server/services/schedulerRunHistory.js?x=${Date.now()}`);

  return { dir, history };
}

test('Phase 55: scheduler run history records and lists runs', async () => {
  const { dir, history } = await setup();

  try {
    const record = await history.recordSchedulerRun('predictive_scan', {
      status: 'queued',
      queueJobId: 'q_test',
      createdBy: 'test',
      idempotencyKey: 'test:key',
    });

    assert.equal(record.ok, true);
    assert.equal(record.run.name, 'predictive_scan');

    const list = await history.listSchedulerRuns('predictive_scan');

    assert.equal(list.total, 1);
    assert.equal(list.runs[0].queueJobId, 'q_test');
    assert.equal(list.runs[0].status, 'queued');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
