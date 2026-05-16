import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 55: migration v15 runs without heavy scan and creates configured dirs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-migration-'));
  const prevDataPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const database = await import(`../server/services/database.js?x=${Date.now()}`);
    await database.initDatabase();

    const migration = await import(`../server/services/migration.js?x=${Date.now()}`);
    const result = await migration.runMigrations();

    assert.equal(result.current >= 15, true);

    const expectedDirs = [
      'ops_queue/pending',
      'ops_queue/running',
      'ops_queue/completed',
      'ops_queue/failed',
      'ops_queue/cancelled',
      'ops_queue/archive',
      'scheduler/history',
      'metrics/workroom-hygiene',
      'metrics/trust-calibration/rollups',
      'metrics/predictive-signal-archives/index',
      'metrics/scale-hygiene',
    ];

    for (const rel of expectedDirs) {
      const ok = await stat(join(dir, rel)).then(s => s.isDirectory()).catch(() => false);
      assert.equal(ok, true, `missing dir: ${rel}`);
    }
  } finally {
    if (prevDataPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = prevDataPath;

    await rm(dir, { recursive: true, force: true });
  }
});
