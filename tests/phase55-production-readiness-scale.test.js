import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 55: production readiness includes scale hygiene and domain consistency checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-readiness-'));
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const database = await import(`../server/services/database.js?x=${Date.now()}`);
    await database.initDatabase();

    const readiness = await import(`../server/services/productionReadiness.js?x=${Date.now()}`);
    const result = await readiness.getProductionReadiness();

    const ids = (result.checks || []).map(c => c.id);

    assert.equal(ids.includes('scale_hygiene'), true);
    assert.equal(ids.includes('domain_consistency'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
