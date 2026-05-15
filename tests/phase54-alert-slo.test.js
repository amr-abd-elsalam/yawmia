import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-alert-slo-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?db=${Date.now()}`);
  await db.initDatabase();

  const rollups = await import(`../server/services/metricsRollups.js?r=${Date.now()}`);

  return { dir, db, rollups };
}

test('alert delivery SLO computes delivered rate and p95 latency', async () => {
  const { dir, db, rollups } = await setup();

  try {
    const now = Date.now();

    for (let i = 0; i < 10; i++) {
      const createdAt = new Date(now - 60000).toISOString();
      const deliveredAt = new Date(now - 60000 + (i + 1) * 1000).toISOString();

      const record = {
        id: `adl_test_${i}`,
        eventType: 'unit_test',
        severity: 'medium',
        channel: 'webhook',
        status: i < 8 ? 'delivered' : 'failed',
        payload: {},
        attempts: [],
        createdAt,
        updatedAt: deliveredAt,
        deliveredAt: i < 8 ? deliveredAt : null,
        failedAt: i >= 8 ? deliveredAt : null,
      };

      await db.atomicWrite(db.getRecordPath('alert_deliveries', record.id), record);
    }

    const rollup = await rollups.captureOpsRollup({ hourKey: '2026-05-15T12' });

    assert.equal(rollup.alerts.total, 10);
    assert.equal(rollup.alerts.deliveredRate, 80);
    assert.ok(rollup.alerts.p95DeliveryMs > 0);
    assert.ok(rollup.sloViolations.some(v => v.metric === 'alerts.deliveredRate'));
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
