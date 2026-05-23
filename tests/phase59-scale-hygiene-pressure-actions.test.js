import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('scale hygiene overview includes storagePressure additive section', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-scale-hygiene-'));
  const oldPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const { initDatabase } = await import('../server/services/database.js');
    await initDatabase();

    await writeFile(join(dir, 'users', 'usr_scale.json'), JSON.stringify({
      id: 'usr_scale',
      role: 'worker',
      status: 'active',
      createdAt: new Date().toISOString(),
    }), 'utf-8');

    const { getScaleHygieneOverview } = await import('../server/services/scaleHygiene.js');
    const overview = await getScaleHygieneOverview();

    assert.equal(overview.enabled, true);
    assert.ok(overview.storagePressure);
    assert.ok(overview.storagePressure.collections || overview.storagePressure.summary || overview.storagePressure.status);
    assert.ok(Array.isArray(overview.recommendedActions));
    assert.ok(Array.isArray(overview.warnings));
  } finally {
    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});
