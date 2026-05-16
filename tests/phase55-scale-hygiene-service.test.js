import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-scale-hygiene-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const scale = await import(`../server/services/scaleHygiene.js?x=${Date.now()}`);

  return { dir, scale };
}

test('Phase 55: scale hygiene overview returns additive sections', async () => {
  const { dir, scale } = await setup();

  try {
    const overview = await scale.getScaleHygieneOverview();

    assert.equal(overview.enabled, true);
    assert.ok(overview.queue);
    assert.ok(overview.audit);
    assert.ok(overview.workrooms);
    assert.ok(overview.trust);
    assert.ok(overview.predictiveArchive);
    assert.ok(overview.schedulerHistory);
    assert.equal(Array.isArray(overview.warnings), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
