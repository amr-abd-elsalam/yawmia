import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 61.1: listJSON strict throws on corrupt JSON, tolerant mode skips it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p611-json-'));
  const previous = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const mod = await import('../server/services/database.js?' + Date.now());
    await mod.initDatabase();

    const jobsDir = mod.getCollectionPath('jobs');
    await mkdir(jobsDir, { recursive: true });

    await writeFile(join(jobsDir, 'job_good.json'), JSON.stringify({
      id: 'job_good',
      status: 'open',
      title: 'Good job',
      createdAt: new Date().toISOString(),
    }));

    await writeFile(join(jobsDir, 'job_bad.json'), '{ bad json');

    await assert.rejects(
      () => mod.listJSON(jobsDir),
      /JSON|Unexpected|position|token/i
    );

    const warnings = [];
    const items = await mod.listJSON(jobsDir, {
      tolerateCorrupt: true,
      onCorrupt: (w) => warnings.push(w),
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'job_good');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].filePath, /job_bad\.json$/);

    const safe = await mod.safeListJSON(jobsDir);
    assert.equal(safe.items.length, 1);
    assert.equal(safe.warnings.length, 1);
  } finally {
    if (previous === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
