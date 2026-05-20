import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('marketplace rollup freshness reports missing as stale', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-mpi-fresh-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const mod = await import('../server/services/marketplaceIntelligenceRollups.js');
  const freshness = await mod.getMarketplaceRollupFreshness({ thresholdHours: 48 });

  assert.equal(freshness.enabled, true);
  assert.equal(freshness.stale, true);
  assert.equal(freshness.status, 'missing');

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});

test('marketplace rollup freshness reports recent rollup as fresh', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-mpi-fresh-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const today = new Date().toISOString().slice(0, 10);
  await db.atomicWrite(db.getRecordPath('product_intelligence', `mpi_${today}`), {
    id: `mpi_${today}`,
    kind: 'marketplace_intelligence',
    day: today,
    generatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    health: { warningCount: 0, warnings: [] },
  });

  const mod = await import('../server/services/marketplaceIntelligenceRollups.js');
  const freshness = await mod.getMarketplaceRollupFreshness({ thresholdHours: 48 });

  assert.equal(freshness.enabled, true);
  assert.equal(freshness.stale, false);
  assert.equal(freshness.status, 'fresh');

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});
