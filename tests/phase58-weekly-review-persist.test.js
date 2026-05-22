import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('ops-weekly-review.js --persist creates weekly_ops_review record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-weekly-'));

  try {
    const proc = spawnSync(process.execPath, ['scripts/ops-weekly-review.js', '--persist'], {
      env: {
        ...process.env,
        YAWMIA_DATA_PATH: dir,
        ADMIN_TOKEN: 'test-token',
        NODE_ENV: 'development',
      },
      encoding: 'utf-8',
      timeout: 20000,
    });

    assert.equal(proc.status, 0, proc.stderr);

    const reviewsDir = join(dir, 'ops', 'reviews');
    const files = await readdir(reviewsDir);
    const reviewFiles = files.filter(f => f.startsWith('orv_') && f.endsWith('.json'));

    assert.ok(reviewFiles.length >= 1);

    const raw = await readFile(join(reviewsDir, reviewFiles[0]), 'utf-8');
    const review = JSON.parse(raw);

    assert.equal(review.type, 'weekly_ops_review');
    assert.equal(review.status, 'completed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
