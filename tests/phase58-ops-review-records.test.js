import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-reviews-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?reviews=${Date.now()}`);
  await db.initDatabase();

  return { dir };
}

test('ops review record create complete latest freshness', async () => {
  const { dir } = await setupTempDb();

  try {
    const svc = await import(`../server/services/opsReviewRecords.js?reviews=${Date.now()}`);

    const created = await svc.createReviewRecord({
      type: 'weekly_ops_review',
      title: 'Weekly Review',
      summary: 'Initial draft',
      findings: ['Queue healthy'],
      actions: [{ title: 'Continue monitoring', owner: 'ops' }],
      createdBy: 'adm_1',
    });

    assert.equal(created.ok, true);
    assert.equal(created.review.status, 'draft');

    const completed = await svc.completeReviewRecord(created.review.id, {
      summary: 'Completed review',
      completedBy: 'adm_2',
    });

    assert.equal(completed.ok, true);
    assert.equal(completed.review.status, 'completed');

    const latest = await svc.getLatestReviewByType('weekly_ops_review');
    assert.equal(latest.id, created.review.id);

    const freshness = await svc.getReviewFreshness('weekly_ops_review', 7);
    assert.equal(freshness.fresh, true);
    assert.equal(freshness.status, 'fresh');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
