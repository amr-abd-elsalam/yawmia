import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 56 notification conversion recording does not recursively emit same event', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-ntf-conv-'));
  const oldData = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const { initDatabase } = await import('../server/services/database.js?' + Date.now());
    await initDatabase();

    const metrics = await import('../server/services/notificationConversionMetrics.js?' + Date.now());
    const { eventBus } = await import('../server/services/eventBus.js');

    let internalEvents = 0;
    const unsubscribe = eventBus.on('notification:conversion_metric_recorded', () => {
      internalEvents++;
    });

    await metrics.recordNotificationConversion({
      notificationType: 'application_accepted',
      actionType: 'job_workroom',
      conversionType: 'workroom_opened',
      timestamp: '2026-05-18T10:00:00.000Z',
    });

    const result = await metrics.getNotificationConversionMetrics({ month: '2026-05' });

    assert.equal(result.totals.conversions, 1);
    assert.equal(internalEvents, 1);

    unsubscribe();
  } finally {
    if (oldData === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldData;
    await rm(dir, { recursive: true, force: true });
  }
});
