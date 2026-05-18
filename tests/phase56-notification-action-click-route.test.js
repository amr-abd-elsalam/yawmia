import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 56 notification action click can be recorded without raw PII', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-ntf-click-'));
  const oldData = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const { initDatabase } = await import('../server/services/database.js?' + Date.now());
    await initDatabase();

    const metrics = await import('../server/services/notificationConversionMetrics.js?' + Date.now());

    await metrics.recordNotificationActionClick({
      notificationType: 'job_match',
      actionType: 'job_detail',
      timestamp: '2026-05-18T10:00:00.000Z',
    });

    const result = await metrics.getNotificationConversionMetrics({
      month: '2026-05',
    });

    assert.equal(result.enabled, true);
    assert.equal(result.totals.clicks, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].type, 'job_match');
    assert.equal(result.rows[0].actionType, 'job_detail');

    const raw = JSON.stringify(result);
    assert.equal(raw.includes('010'), false);
    assert.equal(raw.includes('phone'), false);
  } finally {
    if (oldData === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldData;
    await rm(dir, { recursive: true, force: true });
  }
});
