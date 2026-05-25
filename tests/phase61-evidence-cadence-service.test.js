import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 61 evidence cadence reports missing evidence without heavy scans', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p61-evidence-'));
  const old = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js?phase61ev=' + Date.now());
    await db.initDatabase();

    const svc = await import('../server/services/phase61EvidenceCadence.js?phase61ev=' + Date.now());
    const report = await svc.getEvidenceCadenceStatus();

    assert.equal(report.enabled, true);
    assert.equal(report.phase, 61);
    assert.equal(report.status, 'missing');
    assert.equal(Array.isArray(report.warnings), true);
    assert.equal(Array.isArray(report.blockers), true);
    assert.equal(Array.isArray(report.recommendations), true);
    assert.equal(report.latest.storagePressure, null);
    assert.equal(report.latest.benchmark, null);
  } finally {
    if (old === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = old;
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 61 evidence freshness marks stale artifacts', async () => {
  const svc = await import('../server/services/phase61EvidenceCadence.js?fresh=' + Date.now());

  const oldIso = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const result = svc.evaluateEvidenceFreshness({
    benchmark: {
      kind: 'benchmark',
      id: 'bmk_old',
      status: 'ok',
      timestamp: oldIso,
      ageDays: 40,
    },
  });

  assert.equal(result.status, 'critical');
  assert.ok(result.blockers.some(b => b.code === 'benchmark_critical_stale'));
});
