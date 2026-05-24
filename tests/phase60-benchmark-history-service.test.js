import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('benchmark history persists and lists artifacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p60-bench-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const mod = await import('../server/services/benchmarkHistory.js');

  const result = await mod.persistBenchmarkResult({
    id: 'bmk_test',
    timestamp: new Date().toISOString(),
    summary: {},
    results: [
      { label: 'queue list pending', p95Ms: 1200 },
      { label: 'read user by id', p95Ms: 10 },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.benchmark.status, 'warning');

  const list = await mod.listBenchmarkResults({ limit: 10 });
  assert.equal(list.total, 1);
  assert.equal(list.benchmarks[0].id, 'bmk_test');

  const latest = await mod.getLatestBenchmarkResult();
  assert.equal(latest.id, 'bmk_test');
});

test('benchmark thresholds classify critical p95', async () => {
  const mod = await import('../server/services/benchmarkHistory.js');

  const evalResult = mod.evaluateBenchmarkThresholds({
    results: [
      { label: 'audit indexed search', p95Ms: 3500 },
    ],
  });

  assert.equal(evalResult.status, 'critical');
  assert.equal(evalResult.criticalCount, 1);
});
