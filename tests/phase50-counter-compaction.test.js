import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir;
let db;
let counters;
let compaction;

function oldIso(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function oldHourKey(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString().slice(0, 13);
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-counter-'));
  process.env.YAWMIA_DATA_PATH = tempDir;

  db = await import('../server/services/database.js?phase50counterdb=' + Date.now());
  await db.initDatabase();

  counters = await import('../server/services/directOfferCounters.js?phase50countercounters=' + Date.now());
  compaction = await import('../server/services/counterCompaction.js?phase50countercompaction=' + Date.now());
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
});

test('Phase 50: counter compaction prunes stale buckets and preserves platform totals', async () => {
  const platform = {
    total: 10,
    pending: 2,
    accepted: 3,
    declined: 3,
    expired: 1,
    withdrawn: 1,
    totalResponseMs: 1000,
    responseCount: 2,
    declineReasons: { busy: 1 },
  };

  await counters.writeCounters({
    version: 1,
    lastUpdatedAt: new Date().toISOString(),
    lastRebuildAt: new Date().toISOString(),
    platform: { ...platform },
    aging: {
      totalTimeToFirstViewMs: 0,
      viewCount: 0,
      totalTimeToDecisionMs: 1000,
      decisionCount: 2,
      decisionTimes: [400, 600],
    },
    hourlyBuckets: {
      [oldHourKey(100)]: { created: 5, accepted: 1, declined: 1, expired: 0, withdrawn: 0 },
      [oldHourKey(1)]: { created: 1, accepted: 0, declined: 0, expired: 0, withdrawn: 0 },
    },
    byEmployer: {
      emp_active: {
        total: 5,
        accepted: 2,
        declined: 1,
        expired: 0,
        withdrawn: 0,
        totalResponseMs: 500,
        responseCount: 1,
        lastOfferAt: new Date().toISOString(),
        hourlyBuckets: {
          [oldHourKey(100)]: { created: 3, accepted: 1, declined: 0, expired: 0, withdrawn: 0 },
          [oldHourKey(1)]: { created: 1, accepted: 0, declined: 0, expired: 0, withdrawn: 0 },
        },
      },
    },
    byWorker: {
      wrk_active: {
        total: 5,
        accepted: 2,
        declined: 1,
        expired: 0,
        withdrawn: 0,
        totalResponseMs: 500,
        responseCount: 1,
        lastOfferAt: new Date().toISOString(),
        hourlyBuckets: {
          [oldHourKey(100)]: { created: 3, accepted: 1, declined: 0, expired: 0, withdrawn: 0 },
          [oldHourKey(1)]: { created: 1, accepted: 0, declined: 0, expired: 0, withdrawn: 0 },
        },
      },
    },
  });

  const result = await compaction.compactCounters();
  assert.ok(result.beforeSizeBytes >= result.afterSizeBytes);
  assert.ok(result.removedPlatformBuckets >= 1);
  assert.ok(result.removedEmployerBuckets >= 1);
  assert.ok(result.removedWorkerBuckets >= 1);

  const after = await counters.readCounters();

  assert.deepEqual(after.platform, platform);
  assert.equal(Object.keys(after.hourlyBuckets).length, 1);
  assert.equal(Object.keys(after.byEmployer.emp_active.hourlyBuckets).length, 1);
  assert.equal(Object.keys(after.byWorker.wrk_active.hourlyBuckets).length, 1);
});

test('Phase 50: counter compaction archives inactive entities idempotently', async () => {
  const platform = {
    total: 2,
    pending: 0,
    accepted: 1,
    declined: 1,
    expired: 0,
    withdrawn: 0,
    totalResponseMs: 200,
    responseCount: 1,
    declineReasons: {},
  };

  await counters.writeCounters({
    version: 1,
    lastUpdatedAt: new Date().toISOString(),
    lastRebuildAt: new Date().toISOString(),
    platform: { ...platform },
    aging: {
      totalTimeToFirstViewMs: 0,
      viewCount: 0,
      totalTimeToDecisionMs: 200,
      decisionCount: 1,
      decisionTimes: [200],
    },
    hourlyBuckets: {},
    byEmployer: {
      emp_old: {
        total: 1,
        accepted: 1,
        declined: 0,
        expired: 0,
        withdrawn: 0,
        totalResponseMs: 200,
        responseCount: 1,
        lastOfferAt: oldIso(120),
      },
    },
    byWorker: {
      wrk_old: {
        total: 1,
        accepted: 1,
        declined: 0,
        expired: 0,
        withdrawn: 0,
        totalResponseMs: 200,
        responseCount: 1,
        lastOfferAt: oldIso(120),
      },
    },
  });

  const first = await compaction.compactCounters();
  assert.equal(first.archivedEmployers, 1);
  assert.equal(first.archivedWorkers, 1);

  const afterFirst = await counters.readCounters();
  assert.deepEqual(afterFirst.platform, platform);
  assert.equal(afterFirst.byEmployer.emp_old, undefined);
  assert.equal(afterFirst.byWorker.wrk_old, undefined);

  const second = await compaction.compactCounters();
  assert.equal(second.archivedEmployers, 0);
  assert.equal(second.archivedWorkers, 0);
});
