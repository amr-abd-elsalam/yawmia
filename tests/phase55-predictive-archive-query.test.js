import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-predictive-query-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const idx = await import(`../server/services/predictiveArchiveIndex.js?x=${Date.now()}`);

  return { dir, database, idx };
}

test('Phase 55: predictive archive query falls back safely without index', async () => {
  const { dir, database, idx } = await setup();

  try {
    await database.atomicWrite(database.getRecordPath('predictive_signal_archives', '2026-05'), {
      month: '2026-05',
      kind: 'predictive_signals',
      entries: {
        sig_b: {
          id: 'sig_b',
          riskType: 'worker_offer_bombing_probability',
          status: 'false_positive',
          severity: 'medium',
          entityType: 'worker',
          entityId: 'usr_worker',
          riskScore: 0.6,
          archivedAt: '2026-05-12T10:00:00.000Z',
          createdAt: '2026-05-10T10:00:00.000Z',
        },
      },
    });

    const result = await idx.queryPredictiveArchiveIndex({
      status: 'false_positive',
    });

    assert.equal(result.total, 1);
    assert.equal(result.signals[0].id, 'sig_b');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
