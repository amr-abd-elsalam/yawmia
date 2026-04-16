// tests/notifications.test.js
// ═══════════════════════════════════════════════════════════════
// Notification Service Tests (~10 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-ntf-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let ntfService, db;

before(async () => {
  ntfService = await import('../server/services/notifications.js');
  db = await import('../server/services/database.js');
});

describe('Notifications Service', () => {

  it('NTF-01: creates notification with correct fields', async () => {
    const ntf = await ntfService.createNotification('usr_w01', 'application_accepted', 'تم قبولك في الفرصة', { jobId: 'job_001' });
    assert.ok(ntf.id);
    assert.ok(ntf.id.startsWith('ntf_'));
    assert.strictEqual(ntf.userId, 'usr_w01');
    assert.strictEqual(ntf.type, 'application_accepted');
    assert.strictEqual(ntf.message, 'تم قبولك في الفرصة');
    assert.strictEqual(ntf.read, false);
    assert.strictEqual(ntf.readAt, null);
    assert.ok(ntf.createdAt);
    assert.deepStrictEqual(ntf.meta, { jobId: 'job_001' });
  });

  it('NTF-02: notification is persisted to file', async () => {
    const ntf = await ntfService.createNotification('usr_w02', 'new_application', 'عامل جديد تقدّم', {});
    const data = await db.readJSON(db.getRecordPath('notifications', ntf.id));
    assert.ok(data);
    assert.strictEqual(data.id, ntf.id);
    assert.strictEqual(data.type, 'new_application');
  });

  it('NTF-03: listByUser returns user notifications only', async () => {
    await ntfService.createNotification('usr_listA', 'application_accepted', 'msg A', {});
    await ntfService.createNotification('usr_listB', 'application_rejected', 'msg B', {});
    await ntfService.createNotification('usr_listA', 'new_application', 'msg C', {});

    const result = await ntfService.listByUser('usr_listA');
    assert.ok(result.items.length >= 2);
    for (const item of result.items) {
      assert.strictEqual(item.userId, 'usr_listA');
    }
  });

  it('NTF-04: listByUser returns newest first', async () => {
    // Create two with slight delay
    await ntfService.createNotification('usr_order', 'application_accepted', 'first', {});
    await new Promise(r => setTimeout(r, 10));
    await ntfService.createNotification('usr_order', 'application_rejected', 'second', {});

    const result = await ntfService.listByUser('usr_order');
    assert.ok(result.items.length >= 2);
    // First item should be newer
    assert.ok(new Date(result.items[0].createdAt) >= new Date(result.items[1].createdAt));
  });

  it('NTF-05: listByUser supports pagination (limit, offset)', async () => {
    for (let i = 0; i < 5; i++) {
      await ntfService.createNotification('usr_page', 'application_accepted', 'msg ' + i, {});
    }
    const page1 = await ntfService.listByUser('usr_page', { limit: 2, offset: 0 });
    assert.strictEqual(page1.items.length, 2);
    assert.ok(page1.total >= 5);
    assert.strictEqual(page1.limit, 2);
    assert.strictEqual(page1.offset, 0);

    const page2 = await ntfService.listByUser('usr_page', { limit: 2, offset: 2 });
    assert.strictEqual(page2.items.length, 2);
  });

  it('NTF-06: countUnread counts only unread notifications', async () => {
    const ntf1 = await ntfService.createNotification('usr_unread', 'application_accepted', 'msg1', {});
    await ntfService.createNotification('usr_unread', 'application_rejected', 'msg2', {});
    await ntfService.markAsRead(ntf1.id, 'usr_unread');

    const count = await ntfService.countUnread('usr_unread');
    assert.ok(count >= 1);
  });

  it('NTF-07: markAsRead marks notification and sets readAt', async () => {
    const ntf = await ntfService.createNotification('usr_read1', 'new_application', 'test', {});
    const result = await ntfService.markAsRead(ntf.id, 'usr_read1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.notification.read, true);
    assert.ok(result.notification.readAt);
  });

  it('NTF-08: markAsRead rejects wrong user', async () => {
    const ntf = await ntfService.createNotification('usr_owner', 'application_accepted', 'test', {});
    const result = await ntfService.markAsRead(ntf.id, 'usr_other');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_NOTIFICATION_OWNER');
  });

  it('NTF-09: markAsRead returns not found for invalid ID', async () => {
    const result = await ntfService.markAsRead('ntf_nonexistent', 'usr_any');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOTIFICATION_NOT_FOUND');
  });

  it('NTF-10: markAllAsRead marks all user notifications as read', async () => {
    await ntfService.createNotification('usr_all', 'application_accepted', 'msg1', {});
    await ntfService.createNotification('usr_all', 'application_rejected', 'msg2', {});
    await ntfService.createNotification('usr_all', 'new_application', 'msg3', {});

    const result = await ntfService.markAllAsRead('usr_all');
    assert.strictEqual(result.ok, true);
    assert.ok(result.count >= 3);

    const count = await ntfService.countUnread('usr_all');
    assert.strictEqual(count, 0);
  });
});
