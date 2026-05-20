import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('scheduler cadence report includes default scheduler jobs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-sch-cadence-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const sched = await import('../server/services/schedulerRegistry.js');
  await sched.registerDefaultSchedulerJobs();

  const report = await sched.getSchedulerCadenceReport();

  assert.equal(report.enabled, true);
  assert.ok(report.total > 0);
  assert.ok(report.schedulers.some(s => s.name === 'marketplace_intelligence_daily'));
  assert.ok(report.schedulers.some(s => s.name === 'predictive_scan'));

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});

test('disabled scheduler is not reported stale', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-sch-cadence-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const sched = await import('../server/services/schedulerRegistry.js');
  await sched.registerDefaultSchedulerJobs();
  await sched.enableSchedulerJob('predictive_scan', false);

  const stale = await sched.listStaleSchedulers({ staleMs: 1 });

  assert.equal(stale.some(s => s.name === 'predictive_scan'), false);

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});
