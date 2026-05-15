import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-scheduler-'));
  process.env.YAWMIA_DATA_PATH = dir;
  process.env.INSTANCE_MODE = 'single_writer';

  const db = await import(`../server/services/database.js?db=${Date.now()}`);
  await db.initDatabase();

  const sched = await import(`../server/services/schedulerRegistry.js?s=${Date.now()}`);

  return { dir, sched };
}

test('scheduler registry registers, lists, enables, disables and leases jobs', async () => {
  const { dir, sched } = await setup();

  try {
    const reg = await sched.registerSchedulerJob({
      name: 'test_scheduler_job',
      queueType: 'production_readiness_check',
      intervalMs: 1000,
      priority: 'low',
      payload: {},
      enabled: true,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
      idempotencyKeyFn: bucket => `test_scheduler_job:${bucket}`,
    });

    assert.equal(reg.ok, true);

    const list = await sched.listSchedulerJobs();
    assert.equal(list.some(j => j.name === 'test_scheduler_job'), true);

    const lease1 = await sched.acquireSchedulerLease('test_scheduler_job', 'owner_a');
    assert.equal(lease1.ok, true);

    const lease2 = await sched.acquireSchedulerLease('test_scheduler_job', 'owner_b');
    assert.equal(lease2.ok, false);
    assert.equal(lease2.code, 'LEASE_HELD');

    const release = await sched.releaseSchedulerLease('test_scheduler_job', 'owner_a');
    assert.equal(release.ok, true);

    const disabled = await sched.enableSchedulerJob('test_scheduler_job', false);
    assert.equal(disabled.ok, true);
    assert.equal(disabled.record.enabled, false);

    const enabled = await sched.enableSchedulerJob('test_scheduler_job', true);
    assert.equal(enabled.ok, true);
    assert.equal(enabled.record.enabled, true);
  } finally {
    sched.stopSchedulerRegistry();
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
    delete process.env.INSTANCE_MODE;
  }
});

test('scheduler manual run enqueues queue job', async () => {
  const { dir, sched } = await setup();

  try {
    await sched.registerSchedulerJob({
      name: 'manual_scheduler_job',
      queueType: 'production_readiness_check',
      intervalMs: 1000,
      priority: 'low',
      payload: {},
      enabled: true,
      idempotencyKeyFn: bucket => `manual_scheduler_job:${bucket}`,
    });

    const result = await sched.runSchedulerJobNow('manual_scheduler_job', {
      createdBy: 'test',
      bucket: 'unit',
    });

    assert.equal(result.ok, true);
    assert.equal(result.queued, true);
    assert.ok(result.queueJob);
    assert.equal(result.queueJob.type, 'production_readiness_check');
  } finally {
    sched.stopSchedulerRegistry();
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
    delete process.env.INSTANCE_MODE;
  }
});
