import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
let db;
let rollups;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-rollups-'));
  process.env.YAWMIA_DATA_PATH = dir;

  db = await import('../server/services/database.js');
  await db.initDatabase();

  rollups = await import('../server/services/metricsRollups.js');
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
});

test('ops rollup captures queue/alert/scheduler/lock shape', async () => {
  const result = await rollups.captureOpsRollup({ hourKey: '2026-05-15T10' });

  assert.equal(result.id, 'or_2026-05-15T10');
  assert.ok(result.queue);
  assert.ok(result.alerts);
  assert.ok(result.schedulers);
  assert.ok(result.locks);
  assert.ok(Array.isArray(result.sloViolations));

  const latest = await rollups.getLatestOpsRollup();
  assert.ok(latest);
  assert.equal(latest.id, result.id);
});

test('ops rollup detects queue dead-letter SLO violation', async () => {
  for (let i = 0; i < 5; i++) {
    const job = {
      id: `q_test_dlq_${i}`,
      type: 'unit_test',
      status: 'dead-letter',
      priority: 'normal',
      priorityWeight: 50,
      attempts: 5,
      maxAttempts: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadLetteredAt: new Date().toISOString(),
    };

    await db.atomicWrite(db.getRecordPath('ops_queue_dead_letter', job.id), job);
  }

  const result = await rollups.captureOpsRollup({ hourKey: '2026-05-15T11' });

  assert.equal(result.queue.deadLetter, 5);
  assert.ok(result.sloViolations.some(v => v.metric === 'queue.deadLetter'));

  const slo = await rollups.computeOpsSlo({ rollup: result });
  assert.equal(slo.ok, false);
  assert.equal(slo.status, 'violations');
});
