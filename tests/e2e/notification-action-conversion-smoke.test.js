// ═══════════════════════════════════════════════════════════════
// tests/e2e/notification-action-conversion-smoke.test.js
// Patch 36 — Notification Action Conversion Smoke
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for notification action ownership and
// product-intelligence click telemetry.
//
// Covers:
//   - owner can record notification action click
//   - non-owner cannot record notification action click
//   - missing notification is rejected
//   - conversion metrics aggregate shape updates under temp data
//   - safe actionable notification metadata remains stable
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no ./data mutation
//   - no server.js import
//   - no queue workers
//   - no schedulers
//   - no OTP weakening
//   - no --confirm
//   - no external services
//   - no dependencies
//   - no backend runtime change
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

async function setupTempDataPath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-notification-action-conversion-smoke-'));

  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.YAWMIA_DATA_PATH = dir;

  t.after(async () => {
    // Safe: removes only this test-created temp directory under os.tmpdir().
    // Never touches ./data.
    await rm(dir, { recursive: true, force: true });
  });

  return dir;
}

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  return await import(url.href);
}

async function loadCoreModules() {
  const [
    database,
    users,
    notifications,
    notificationActions,
    notificationConversionMetrics,
    notificationsHandler,
  ] = await Promise.all([
    importFresh('../../server/services/database.js'),
    importFresh('../../server/services/users.js'),
    importFresh('../../server/services/notifications.js'),
    importFresh('../../server/services/notificationActions.js'),
    importFresh('../../server/services/notificationConversionMetrics.js'),
    importFresh('../../server/handlers/notificationsHandler.js'),
  ]);

  await database.initDatabase();

  return {
    database,
    users,
    notifications,
    notificationActions,
    notificationConversionMetrics,
    notificationsHandler,
  };
}

async function createProfiledUser(users, phone, role, fields = {}) {
  const user = await users.create(phone, role);

  const updated = await users.update(user.id, {
    name: fields.name || (role === 'employer' ? 'صاحب عمل إشعارات' : 'عامل إشعارات'),
    governorate: fields.governorate || 'cairo',
    categories: role === 'worker' ? (fields.categories || ['construction']) : [],
    lat: typeof fields.lat === 'number' ? fields.lat : 30.0444,
    lng: typeof fields.lng === 'number' ? fields.lng : 31.2357,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: fields.verificationStatus || 'verified',
  });

  return updated || user;
}

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    rawBody: '',
    body: null,
    writableEnded: false,

    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },

    end(payload = '') {
      this.rawBody = typeof payload === 'string' ? payload : String(payload);
      this.writableEnded = true;

      try {
        this.body = this.rawBody ? JSON.parse(this.rawBody) : null;
      } catch (_) {
        this.body = null;
      }
    },
  };

  return res;
}

async function callNotificationActionClick(handleNotificationActionClick, notificationId, user) {
  const req = {
    params: { id: notificationId },
    query: {},
    body: {},
    user,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };

  const res = createMockRes();

  await handleNotificationActionClick(req, res);

  assert.equal(res.writableEnded, true, 'handler should end response');
  assert.ok(res.statusCode, 'handler should set statusCode');

  return res;
}

function assertSafeRelativeActionUrl(url) {
  assert.equal(typeof url, 'string');
  assert.ok(url.startsWith('/'), 'action URL should be root-relative');

  const lower = url.toLowerCase();

  assert.equal(lower.startsWith('http://'), false);
  assert.equal(lower.startsWith('https://'), false);
  assert.equal(lower.startsWith('//'), false);
  assert.equal(lower.startsWith('javascript:'), false);
  assert.equal(lower.startsWith('data:'), false);
  assert.equal(lower.startsWith('vbscript:'), false);
  assert.equal(url.includes('..'), false);
  assert.equal(url.includes('\\'), false);

  const decoded = decodeURIComponent(url);
  assert.equal(decoded.includes('..'), false);
  assert.equal(decoded.includes('\\'), false);
}

test('Patch 36: owner can record notification action click and metrics update', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const owner = await createProfiledUser(mods.users, '01093600001', 'worker', {
    name: 'عامل Notification Action Owner',
    governorate: 'cairo',
    categories: ['construction'],
  });

  const notification = await mods.notifications.createNotification(
    owner.id,
    'application_accepted',
    'تم قبولك في فرصة smoke',
    { jobId: 'job_notification_action_smoke_001' },
    { userRole: owner.role }
  );

  assert.ok(notification, 'notification should be created');
  assert.equal(notification.userId, owner.id);
  assert.equal(notification.type, 'application_accepted');
  assert.ok(notification.action, 'notification should include action metadata');
  assert.equal(notification.action.type, 'job_workroom');
  assertSafeRelativeActionUrl(notification.action.url);

  const before = await mods.notificationConversionMetrics.getNotificationConversionMetrics();
  const beforeClicks = before.totals?.clicks || 0;

  const res = await callNotificationActionClick(
    mods.notificationsHandler.handleNotificationActionClick,
    notification.id,
    owner
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);

  const after = await mods.notificationConversionMetrics.getNotificationConversionMetrics();

  assert.equal((after.totals?.clicks || 0), beforeClicks + 1);

  assert.ok(after.byType.application_accepted, 'byType should include application_accepted');
  assert.equal(after.byType.application_accepted.clicks, 1);

  assert.ok(after.byAction.job_workroom, 'byAction should include job_workroom');
  assert.equal(after.byAction.job_workroom.clicks, 1);

  const matchingRow = (after.rows || []).find(row =>
    row.type === 'application_accepted' &&
    row.actionType === 'job_workroom'
  );

  assert.ok(matchingRow, 'metrics rows should include notification type/action matrix row');
  assert.equal(matchingRow.clicks, 1);
  assert.equal(typeof matchingRow.conversionRate, 'number');
});

test('Patch 36: non-owner cannot record notification action click', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const owner = await createProfiledUser(mods.users, '01093600002', 'worker', {
    name: 'عامل Notification Action Owner 2',
    governorate: 'cairo',
    categories: ['construction'],
  });

  const other = await createProfiledUser(mods.users, '01193600002', 'worker', {
    name: 'عامل Notification Action Non Owner',
    governorate: 'giza',
    categories: ['cleaning'],
  });

  const notification = await mods.notifications.createNotification(
    owner.id,
    'payment_created',
    'تم إنشاء سجل دفع smoke',
    { jobId: 'job_notification_action_smoke_002', paymentId: 'pay_notification_action_smoke_002' },
    { userRole: owner.role }
  );

  assert.ok(notification);
  assert.equal(notification.userId, owner.id);
  assert.ok(notification.action);

  const before = await mods.notificationConversionMetrics.getNotificationConversionMetrics();
  const beforeClicks = before.totals?.clicks || 0;

  const res = await callNotificationActionClick(
    mods.notificationsHandler.handleNotificationActionClick,
    notification.id,
    other
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'NOT_NOTIFICATION_OWNER');
  assert.equal(typeof res.body.error, 'string');

  const after = await mods.notificationConversionMetrics.getNotificationConversionMetrics();
  assert.equal((after.totals?.clicks || 0), beforeClicks);
});

test('Patch 36: missing notification action click is rejected', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const user = await createProfiledUser(mods.users, '01093600003', 'worker', {
    name: 'عامل Notification Missing',
    governorate: 'cairo',
    categories: ['construction'],
  });

  const res = await callNotificationActionClick(
    mods.notificationsHandler.handleNotificationActionClick,
    'ntf_missing_action_click_smoke',
    user
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOTIFICATION_NOT_FOUND');
  assert.equal(typeof res.body.error, 'string');
});

test('Patch 36: actionable notification metadata remains safe and stable', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const user = await createProfiledUser(mods.users, '01093600004', 'worker', {
    name: 'عامل Notification Action Metadata',
    governorate: 'cairo',
    categories: ['construction'],
  });

  const notification = await mods.notifications.createNotification(
    user.id,
    'application_accepted',
    'تم قبولك — افتح مساحة العمل',
    { jobId: 'job_notification_action_smoke_004' },
    { userRole: user.role }
  );

  assert.ok(notification);
  assert.ok(notification.action, 'notification.action should exist');

  assert.equal(notification.action.type, 'job_workroom');
  assert.equal(notification.action.entityType, 'job');
  assert.equal(notification.action.entityId, 'job_notification_action_smoke_004');

  assert.ok(
    notification.action.url.startsWith('/job.html?id=job_notification_action_smoke_004'),
    'application_accepted action URL should point to job detail'
  );
  assert.ok(
    notification.action.url.includes('#workroom'),
    'application_accepted action URL should preserve workroom anchor'
  );

  assertSafeRelativeActionUrl(notification.action.url);
  assert.equal(mods.notificationActions.isAllowedActionUrl(notification.action.url), true);
});
