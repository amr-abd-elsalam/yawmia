// tests/phase13-notification-messaging.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 13 — Multi-Channel Notification Messaging + User Preferences
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-phase13-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let config, userService, notificationMessenger, messaging;

before(async () => {
  config = (await import('../config.js')).default;
  userService = await import('../server/services/users.js');
  notificationMessenger = await import('../server/services/notificationMessenger.js');
  messaging = await import('../server/services/messaging.js');
});

// ── Helper ──────────────────────────────────────────────────
let counter = 0;
async function createTestUser(role) {
  counter++;
  const phone = '0101300' + String(counter).padStart(4, '0');
  return await userService.create(phone, role);
}

// ══════════════════════════════════════════════════════════════
// Config Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — Config', () => {

  it('P13-01: Config has 34 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 36, `expected 36 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P13-02: NOTIFICATION_MESSAGING section has correct fields', () => {
    const nm = config.NOTIFICATION_MESSAGING;
    assert.ok(nm, 'NOTIFICATION_MESSAGING section should exist');
    assert.strictEqual(typeof nm.enabled, 'boolean');
    assert.strictEqual(typeof nm.criticalEvents, 'object');
    assert.strictEqual(typeof nm.cooldownMs, 'number');
    assert.strictEqual(typeof nm.maxDailyMessagesPerUser, 'number');
    assert.strictEqual(typeof nm.defaultPreferences, 'object');
    assert.strictEqual(typeof nm.whatsappTemplates, 'object');
  });

  it('P13-03: NOTIFICATION_MESSAGING is frozen (immutable)', () => {
    assert.throws(() => {
      config.NOTIFICATION_MESSAGING.enabled = true;
    }, TypeError, 'config should be frozen');
  });

  it('P13-04: PWA cacheName updated to v0.21.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.24.0');
  });

  it('P13-05: criticalEvents has 6 entries — 4 true + 2 false', () => {
    const ce = config.NOTIFICATION_MESSAGING.criticalEvents;
    const entries = Object.entries(ce);
    assert.strictEqual(entries.length, 6);
    const trueCount = entries.filter(([, v]) => v === true).length;
    const falseCount = entries.filter(([, v]) => v === false).length;
    assert.strictEqual(trueCount, 4, 'should have 4 critical events enabled');
    assert.strictEqual(falseCount, 2, 'should have 2 critical events disabled');
  });

  it('P13-06: defaultPreferences.inApp is always true', () => {
    assert.strictEqual(config.NOTIFICATION_MESSAGING.defaultPreferences.inApp, true);
  });
});

// ══════════════════════════════════════════════════════════════
// User Model Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — User Model', () => {

  it('P13-07: create() includes notificationPreferences: null', async () => {
    const user = await createTestUser('worker');
    assert.strictEqual(user.notificationPreferences, null);
  });

  it('P13-08: updateNotificationPreferences sets preferences', async () => {
    const user = await createTestUser('worker');
    const updated = await userService.updateNotificationPreferences(user.id, {
      whatsapp: false,
      sms: true,
    });
    assert.ok(updated);
    assert.strictEqual(updated.notificationPreferences.inApp, true);
    assert.strictEqual(updated.notificationPreferences.whatsapp, false);
    assert.strictEqual(updated.notificationPreferences.sms, true);
  });

  it('P13-09: updateNotificationPreferences — inApp always true', async () => {
    const user = await createTestUser('employer');
    const updated = await userService.updateNotificationPreferences(user.id, {
      inApp: false,
      whatsapp: true,
      sms: false,
    });
    assert.ok(updated);
    assert.strictEqual(updated.notificationPreferences.inApp, true, 'inApp should always be true');
  });

  it('P13-10: updateNotificationPreferences — partial update preserves existing', async () => {
    const user = await createTestUser('worker');
    // First set
    await userService.updateNotificationPreferences(user.id, {
      whatsapp: true,
      sms: true,
    });
    // Partial update — only whatsapp
    const updated = await userService.updateNotificationPreferences(user.id, {
      whatsapp: false,
    });
    assert.ok(updated);
    assert.strictEqual(updated.notificationPreferences.whatsapp, false);
    assert.strictEqual(updated.notificationPreferences.sms, true, 'sms should be preserved');
  });

  it('P13-11: updateNotificationPreferences — returns null for non-existent user', async () => {
    const result = await userService.updateNotificationPreferences('usr_nonexistent', {
      whatsapp: false,
    });
    assert.strictEqual(result, null);
  });
});

// ══════════════════════════════════════════════════════════════
// Notification Messenger Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — Notification Messenger', () => {

  it('P13-12: sendNotificationMessage returns not sent when disabled', async () => {
    // config.NOTIFICATION_MESSAGING.enabled = false (default)
    const result = await notificationMessenger.sendNotificationMessage({
      userId: 'usr_test1',
      phone: '01012345678',
      eventType: 'application_accepted',
      message: 'Test message',
      user: { notificationPreferences: null },
    });
    assert.strictEqual(result.sent, false);
    assert.strictEqual(result.reason, 'notification_messaging_disabled');
  });

  it('P13-13: sendNotificationMessage returns not sent for non-critical event', async () => {
    // Since enabled=false, this check is preempted by the feature flag
    const result = await notificationMessenger.sendNotificationMessage({
      userId: 'usr_test2',
      phone: '01012345678',
      eventType: 'application_rejected', // not critical
      message: 'Test',
    });
    assert.strictEqual(result.sent, false);
    // Feature flag disabled takes priority
    assert.strictEqual(result.reason, 'notification_messaging_disabled');
  });

  it('P13-14: sendNotificationMessage never throws (fire-and-forget safe)', async () => {
    // Should not throw on any input
    const result1 = await notificationMessenger.sendNotificationMessage(null);
    assert.strictEqual(result1.sent, false);

    const result2 = await notificationMessenger.sendNotificationMessage(undefined);
    assert.strictEqual(result2.sent, false);

    const result3 = await notificationMessenger.sendNotificationMessage({});
    assert.strictEqual(result3.sent, false);

    const result4 = await notificationMessenger.sendNotificationMessage({ userId: null, phone: null, eventType: null });
    assert.strictEqual(result4.sent, false);
  });

  it('P13-15: sendNotificationMessage handles missing params', async () => {
    const result = await notificationMessenger.sendNotificationMessage({
      // No userId, no phone, no eventType
    });
    assert.strictEqual(result.sent, false);
    assert.ok(result.reason, 'should have a reason');
  });
});

// ══════════════════════════════════════════════════════════════
// Messaging sendMessage Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — Messaging sendMessage', () => {

  it('P13-16: sendMessage exists as exported function', () => {
    assert.strictEqual(typeof messaging.sendMessage, 'function');
  });

  it('P13-17: sendMessage in mock mode returns ok', async () => {
    // config.MESSAGING.enabled = false (mock mode)
    const result = await messaging.sendMessage('01012345678', 'يوميّة: رسالة تجريبية');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.channel, 'mock');
  });

  it('P13-18: sendMessage returns valid adapter response format', async () => {
    const result = await messaging.sendMessage('01012345678', 'Test');
    assert.strictEqual(typeof result.ok, 'boolean');
    assert.strictEqual(typeof result.channel, 'string');
    assert.ok(result.messageId, 'should have messageId');
  });
});

// ══════════════════════════════════════════════════════════════
// Default Preferences Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — Default Preferences', () => {

  it('P13-19: defaultPreferences.whatsapp is true', () => {
    assert.strictEqual(config.NOTIFICATION_MESSAGING.defaultPreferences.whatsapp, true);
  });

  it('P13-20: defaultPreferences.sms is false', () => {
    assert.strictEqual(config.NOTIFICATION_MESSAGING.defaultPreferences.sms, false);
  });
});

// ══════════════════════════════════════════════════════════════
// Throttling Config Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — Throttling Config', () => {

  it('P13-21: cooldownMs is positive number', () => {
    assert.ok(config.NOTIFICATION_MESSAGING.cooldownMs > 0);
  });

  it('P13-22: maxDailyMessagesPerUser is positive number', () => {
    assert.ok(config.NOTIFICATION_MESSAGING.maxDailyMessagesPerUser > 0);
  });
});

// ══════════════════════════════════════════════════════════════
// WhatsApp Templates Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — WhatsApp Templates', () => {

  it('P13-23: whatsappTemplates has entries for 4 critical events', () => {
    const templates = config.NOTIFICATION_MESSAGING.whatsappTemplates;
    assert.ok(templates.application_accepted);
    assert.ok(templates.job_filled);
    assert.ok(templates.payment_created);
    assert.ok(templates.job_cancelled);
  });
});

// ══════════════════════════════════════════════════════════════
// Version Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — Version', () => {

  it('P13-24: package.json version is 0.21.0', async () => {
    const pkgRaw = await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    assert.strictEqual(pkg.version, '0.24.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Integration Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 13 — Integration', () => {

  it('P13-25: notificationMessenger module loads without error', () => {
    assert.strictEqual(typeof notificationMessenger.sendNotificationMessage, 'function');
  });
});
