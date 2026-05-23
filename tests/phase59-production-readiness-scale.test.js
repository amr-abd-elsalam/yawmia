import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('production readiness includes Phase 59 scale/storage/externalization checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-readiness-'));
  const oldPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const { initDatabase } = await import('../server/services/database.js');
    await initDatabase();

    const { getProductionReadiness } = await import('../server/services/productionReadiness.js');
    const readiness = await getProductionReadiness();

    const ids = (readiness.checks || []).map(c => c.id);

    assert.ok(ids.includes('scale_thresholds_configured'));
    assert.ok(ids.includes('storage_pressure_available'));
    assert.ok(ids.includes('multi_instance_boundary_configured'));
    assert.ok(ids.includes('externalization_readiness_configured'));

    assert.ok(ids.includes('scale_limits_doc_exists'));
    assert.ok(ids.includes('externalization_readiness_doc_exists'));
    assert.ok(ids.includes('multi_instance_boundary_doc_exists'));
    assert.ok(ids.includes('data_migration_formats_doc_exists'));
    assert.ok(ids.includes('storage_pressure_runbook_exists'));
  } finally {
    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});
