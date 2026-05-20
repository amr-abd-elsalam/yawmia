import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('scale hygiene returns recommendedActions array', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-scale-actions-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const mod = await import('../server/services/scaleHygiene.js');
  const overview = await mod.getScaleHygieneOverview();

  assert.equal(overview.enabled, true);
  assert.ok(Array.isArray(overview.recommendedActions));

  // Missing marketplace rollup / restore drill can produce actions,
  // but test only requires shape stability.
  for (const action of overview.recommendedActions) {
    assert.ok(action.id);
    assert.ok(action.label);
    assert.ok(action.severity);
  }

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});
