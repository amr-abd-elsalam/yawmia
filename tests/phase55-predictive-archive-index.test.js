import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-predictive-index-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const idx = await import(`../server/services/predictiveArchiveIndex.js?x=${Date.now()}`);

  return { dir, database, idx };
}

test('Phase 55: predictive archive index rebuild and query by riskType', async () => {
  const { dir, database, idx } = await setup();

  try {
    await database.atomicWrite(database.getRecordPath('predictive_signal_archives', '2026-05'), {
      month: '2026-05',
      kind: 'predictive_signals',
      entries: {
        sig_a: {
          id: 'sig_a',
          riskType: 'employer_decline_spike',
          status: 'confirmed',
          severity: 'high',
          entityType: 'employer',
          entityId: 'usr_emp',
          riskScore: 0.9,
          createdAt: '2026-05-10T10:00:00.000Z',
          updatedAt: '2026-05-11T10:00:00.000Z',
          archivedAt: '2026-05-12T10:00:00.000Z',
        },
      },
      archivedAt: '2026-05-12T10:00:00.000Z',
    });

    const rebuild = await idx.rebuildPredictiveArchiveIndex();

    assert.equal(rebuild.ok, true);
    assert.equal(rebuild.archivedSignals, 1);

    const result = await idx.queryPredictiveArchiveIndex({
      riskType: 'employer_decline_spike',
    });

    assert.equal(result.total, 1);
    assert.equal(result.signals[0].id, 'sig_a');
    assert.equal(result.indexed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
