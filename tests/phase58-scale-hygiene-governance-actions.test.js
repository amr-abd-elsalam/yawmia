import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-scale-'));
  process.env.YAWMIA_DATA_PATH = dir;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  const db = await import(`../server/services/database.js?scale=${Date.now()}`);
  await db.initDatabase();

  return { dir };
}

test('scale hygiene includes governance object', async () => {
  const { dir } = await setupTempDb();

  try {
    const scale = await import(`../server/services/scaleHygiene.js?scale=${Date.now()}`);
    const overview = await scale.getScaleHygieneOverview();

    assert.equal(overview.enabled, true);
    assert.ok(overview.governance);
    assert.ok(overview.governance.rbac);
    assert.ok(overview.governance.privacy);
    assert.ok(overview.governance.reviews);
    assert.ok(overview.governance.postmortems);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scale hygiene recommends weekly ops review when stale or missing', async () => {
  const { dir } = await setupTempDb();

  try {
    const scale = await import(`../server/services/scaleHygiene.js?scale2=${Date.now()}`);
    const overview = await scale.getScaleHygieneOverview();

    const actions = overview.recommendedActions || [];
    assert.ok(actions.some(a => a.id === 'weekly_ops_review_persist'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
