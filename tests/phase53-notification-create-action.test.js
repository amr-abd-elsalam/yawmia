import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 53 notifications: createNotification stores action metadata', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'yawmia-phase53-ntf-'));
  const previous = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dataDir;

  try {
    const db = await import('../server/services/database.js?phase53_ntf_db=' + Date.now());
    await db.initDatabase();

    const notifications = await import('../server/services/notifications.js?phase53_ntf=' + Date.now());

    const ntf = await notifications.createNotification(
      'usr_test',
      'new_message',
      'رسالة جديدة',
      { jobId: 'job_test', messageId: 'msg_test' }
    );

    assert.ok(ntf);
    assert.equal(ntf.type, 'new_message');
    assert.ok(ntf.action);
    assert.equal(ntf.action.url, '/job.html?id=job_test#workroom-messages');
    assert.equal(ntf.action.entityType, 'job');
    assert.equal(ntf.action.entityId, 'job_test');

    const stored = await db.readJSON(db.getRecordPath('notifications', ntf.id));
    assert.ok(stored);
    assert.equal(stored.action.url, '/job.html?id=job_test#workroom-messages');
  } finally {
    if (previous === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = previous;

    await rm(dataDir, { recursive: true, force: true });
  }
});
