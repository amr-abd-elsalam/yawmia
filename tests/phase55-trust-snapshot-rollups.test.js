import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-trust-rollup-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const rollups = await import(`../server/services/trustSnapshotRollups.js?x=${Date.now()}`);

  return { dir, database, rollups };
}

test('Phase 55: trust snapshot monthly rollup is generated', async () => {
  const { dir, database, rollups } = await setup();

  try {
    const month = '2026-05';

    await database.atomicWrite(join(dir, 'metrics', 'trust-v2-snapshots', month, 'tsv2_usr_a_2026-05-16.json'), {
      id: 'tsv2_usr_a_2026-05-16',
      userId: 'usr_a',
      role: 'worker',
      score: 0.8,
      score100: 80,
      grade: 'A',
      createdAt: '2026-05-16T10:00:00.000Z',
    });

    await database.atomicWrite(join(dir, 'metrics', 'trust-v2-snapshots', month, 'tsv2_usr_b_2026-05-16.json'), {
      id: 'tsv2_usr_b_2026-05-16',
      userId: 'usr_b',
      role: 'employer',
      score: 0.6,
      score100: 60,
      grade: 'B',
      createdAt: '2026-05-16T10:00:00.000Z',
    });

    const result = await rollups.createTrustSnapshotRollup({ month });

    assert.equal(result.ok, true);
    assert.equal(result.rollup.snapshotCount, 2);
    assert.equal(result.rollup.avgScore, 0.7);
    assert.equal(result.rollup.byRole.worker.count, 1);
    assert.equal(result.rollup.byRole.employer.count, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
