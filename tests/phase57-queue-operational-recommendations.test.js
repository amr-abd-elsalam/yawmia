import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('queue recommendations include repair for summary mismatches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-queue-rec-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const mod = await import('../server/services/queueHealthVerify.js');
  const actions = await mod.getQueueOperationalRecommendations({
    health: {
      details: {
        summaryMismatches: [{ status: 'pending', summaryCount: 0, scanCount: 1 }],
        staleRunningJobs: [],
        expiredIdempotency: [],
      },
      warnings: ['summary mismatches: 1'],
      errors: [],
    },
  });

  assert.ok(actions.some(a => a.id === 'queue_summary_repair'));
  assert.ok(actions.some(a => a.command === 'node scripts/repair-queue.js'));

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});

test('queue recommendations include stale running recovery action', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-queue-rec-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const mod = await import('../server/services/queueHealthVerify.js');
  const actions = await mod.getQueueOperationalRecommendations({
    health: {
      details: {
        summaryMismatches: [],
        staleRunningJobs: [{ jobId: 'q_test' }],
        expiredIdempotency: [],
      },
      warnings: ['stale running jobs: 1'],
      errors: [],
    },
  });

  assert.ok(actions.some(a => a.id === 'queue_stale_running_recover'));
  assert.ok(actions.some(a => a.severity === 'critical'));

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});
