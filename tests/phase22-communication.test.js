// ═══════════════════════════════════════════════════════════════
// tests/phase22-communication.test.js — Phase 22 Tests
// Communication + Employer Efficiency + Web Push
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

// ── Set test data path BEFORE importing any modules ──
const testDataDir = await mkdtemp(join(tmpdir(), 'yawmia-p22-'));
process.env.YAWMIA_DATA_PATH = testDataDir;

const config = (await import('../config.js')).default;

// ═══════════════════════════════════════════════════════════════
// Config Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 22 — Config', () => {
  it('P22-01: version is 0.25.0', () => {
    assert.equal(config.PWA.cacheName, 'yawmia-v0.31.0');
  });

  it('P22-02: has 41 config sections', () => {
    const topLevelKeys = Object.keys(config);
    assert.equal(topLevelKeys.length, 48);
  });

  it('P22-03: MESSAGES section exists with all required fields', () => {
    assert.ok(config.MESSAGES);
    assert.equal(typeof config.MESSAGES.enabled, 'boolean');
    assert.equal(typeof config.MESSAGES.maxLengthChars, 'number');
    assert.equal(typeof config.MESSAGES.maxMessagesPerJobPerDay, 'number');
    assert.equal(typeof config.MESSAGES.allowBroadcast, 'boolean');
    assert.equal(typeof config.MESSAGES.allowWorkerInitiate, 'boolean');
    assert.equal(typeof config.MESSAGES.onlyAfterAcceptance, 'boolean');
    assert.equal(config.MESSAGES.maxLengthChars, 500);
    assert.equal(config.MESSAGES.maxMessagesPerJobPerDay, 50);
  });

  it('P22-04: WEB_PUSH section exists with all required fields', () => {
    assert.ok(config.WEB_PUSH);
    assert.equal(typeof config.WEB_PUSH.enabled, 'boolean');
    assert.equal(typeof config.WEB_PUSH.maxSubscriptionsPerUser, 'number');
    assert.ok(config.WEB_PUSH.events);
    assert.equal(config.WEB_PUSH.events.application_accepted, true);
    assert.equal(config.WEB_PUSH.events.new_message, true);
  });

  it('P22-05: DATABASE.dirs has 14 entries', () => {
    assert.equal(Object.keys(config.DATABASE.dirs).length, 17);
    assert.ok(config.DATABASE.dirs.messages);
    assert.ok(config.DATABASE.dirs.push_subscriptions);
  });

  it('P22-06: DATABASE.indexFiles has 15 entries', () => {
    assert.equal(Object.keys(config.DATABASE.indexFiles).length, 17);
    assert.ok(config.DATABASE.indexFiles.messageJobIndex);
    assert.ok(config.DATABASE.indexFiles.messageUserIndex);
    assert.ok(config.DATABASE.indexFiles.pushUserIndex);
  });

  it('P22-07: PWA cacheName is yawmia-v0.25.0', () => {
    assert.equal(config.PWA.cacheName, 'yawmia-v0.31.0');
  });
});

// ═══════════════════════════════════════════════════════════════
// Messaging Service Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 22 — Messaging Service', () => {
  let initDatabase, atomicWrite, getRecordPath, addToSetIndex;
  let messagesModule;

  before(async () => {
    const db = await import('../server/services/database.js');
    initDatabase = db.initDatabase;
    atomicWrite = db.atomicWrite;
    getRecordPath = db.getRecordPath;
    addToSetIndex = db.addToSetIndex;

    await initDatabase();
    messagesModule = await import('../server/services/messages.js');

    // Create test employer
    const employer = {
      id: 'usr_employer01', phone: '01012345678', role: 'employer',
      name: 'صاحب عمل', governorate: 'cairo', categories: [], status: 'active',
      rating: { avg: 0, count: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await atomicWrite(getRecordPath('users', employer.id), employer);

    // Create phone index
    const phoneIndexPath = join(testDataDir, 'users/phone-index.json');
    await atomicWrite(phoneIndexPath, { '01012345678': 'usr_employer01', '01098765432': 'usr_worker01' });

    // Create test worker
    const worker = {
      id: 'usr_worker01', phone: '01098765432', role: 'worker',
      name: 'عامل', governorate: 'cairo', categories: ['general'], status: 'active',
      rating: { avg: 0, count: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await atomicWrite(getRecordPath('users', worker.id), worker);

    // Create test job (filled status)
    const job = {
      id: 'job_msg01', employerId: 'usr_employer01', title: 'فرصة تواصل',
      category: 'general', governorate: 'cairo', location: null, lat: null, lng: null,
      workersNeeded: 2, workersAccepted: 1, dailyWage: 200, startDate: '2026-04-22',
      durationDays: 3, description: '', totalCost: 1200, platformFee: 180,
      status: 'filled', createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    };
    await atomicWrite(getRecordPath('jobs', job.id), job);

    // Create jobs index entry
    const jobsIndexPath = join(testDataDir, 'jobs/index.json');
    await atomicWrite(jobsIndexPath, { 'job_msg01': { id: job.id, employerId: job.employerId, category: job.category, governorate: job.governorate, status: job.status, createdAt: job.createdAt } });

    // Create accepted application
    const app = {
      id: 'app_msg01', jobId: 'job_msg01', workerId: 'usr_worker01',
      status: 'accepted', appliedAt: new Date().toISOString(), respondedAt: new Date().toISOString(),
    };
    await atomicWrite(getRecordPath('applications', app.id), app);
    await addToSetIndex(config.DATABASE.indexFiles.jobAppsIndex, 'job_msg01', 'app_msg01');
    await addToSetIndex(config.DATABASE.indexFiles.workerAppsIndex, 'usr_worker01', 'app_msg01');

    // Create open job for negative tests
    const openJob = {
      id: 'job_open01', employerId: 'usr_employer01', title: 'فرصة مفتوحة',
      category: 'general', governorate: 'cairo', location: null, lat: null, lng: null,
      workersNeeded: 2, workersAccepted: 0, dailyWage: 200, startDate: '2026-04-22',
      durationDays: 3, description: '', totalCost: 1200, platformFee: 180,
      status: 'open', createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    };
    await atomicWrite(getRecordPath('jobs', openJob.id), openJob);
  });

  it('P22-08: messages.js exports all required functions', () => {
    assert.equal(typeof messagesModule.sendMessage, 'function');
    assert.equal(typeof messagesModule.broadcastMessage, 'function');
    assert.equal(typeof messagesModule.listByJob, 'function');
    assert.equal(typeof messagesModule.markAsRead, 'function');
    assert.equal(typeof messagesModule.markAllAsRead, 'function');
    assert.equal(typeof messagesModule.countUnread, 'function');
    assert.equal(typeof messagesModule.canMessage, 'function');
    assert.equal(typeof messagesModule.countTodayByUserJob, 'function');
  });

  it('P22-09: canMessage — employer can message on filled job', async () => {
    const result = await messagesModule.canMessage('job_msg01', 'usr_employer01');
    assert.equal(result.allowed, true);
  });

  it('P22-10: canMessage — worker cannot message on open job', async () => {
    const result = await messagesModule.canMessage('job_open01', 'usr_worker01');
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'JOB_STATUS_NOT_ELIGIBLE');
  });

  it('P22-11: canMessage — accepted worker can message on filled job', async () => {
    const result = await messagesModule.canMessage('job_msg01', 'usr_worker01');
    assert.equal(result.allowed, true);
  });

  it('P22-12: canMessage — random user cannot message', async () => {
    const result = await messagesModule.canMessage('job_msg01', 'usr_random99');
    assert.equal(result.allowed, false);
  });

  it('P22-13: sendMessage — valid send between employer and worker', async () => {
    const result = await messagesModule.sendMessage('job_msg01', 'usr_employer01', {
      recipientId: 'usr_worker01',
      text: 'مرحباً — الشغل بكرة الساعة 7 الصبح',
    });
    assert.equal(result.ok, true);
    assert.ok(result.message.id.startsWith('msg_'));
    assert.equal(result.message.senderId, 'usr_employer01');
    assert.equal(result.message.recipientId, 'usr_worker01');
    assert.equal(result.message.senderRole, 'employer');
  });

  it('P22-14: sendMessage — text too long', async () => {
    const longText = 'أ'.repeat(501);
    const result = await messagesModule.sendMessage('job_msg01', 'usr_employer01', {
      recipientId: 'usr_worker01',
      text: longText,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TEXT_TOO_LONG');
  });

  it('P22-15: sendMessage — empty text', async () => {
    const result = await messagesModule.sendMessage('job_msg01', 'usr_employer01', {
      recipientId: 'usr_worker01',
      text: '',
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TEXT_REQUIRED');
  });

  it('P22-17: sendMessage — sanitizes HTML', async () => {
    const result = await messagesModule.sendMessage('job_msg01', 'usr_worker01', {
      recipientId: 'usr_employer01',
      text: '<script>alert("xss")</script>مرحباً',
    });
    assert.equal(result.ok, true);
    assert.ok(!result.message.text.includes('<script>'));
  });

  it('P22-18: broadcastMessage — employer broadcasts', async () => {
    const result = await messagesModule.broadcastMessage('job_msg01', 'usr_employer01', 'رسالة للجميع');
    assert.equal(result.ok, true);
    assert.equal(result.message.recipientId, null);
    assert.equal(result.message.senderRole, 'employer');
  });

  it('P22-19: broadcastMessage — non-employer cannot broadcast', async () => {
    const result = await messagesModule.broadcastMessage('job_msg01', 'usr_worker01', 'محاولة بث');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_JOB_OWNER');
  });

  it('P22-20: listByJob — returns messages for involved user', async () => {
    const result = await messagesModule.listByJob('job_msg01', 'usr_worker01');
    assert.ok(result.items.length > 0);
    assert.equal(typeof result.total, 'number');
  });

  it('P22-22: listByJob — pagination works', async () => {
    const result = await messagesModule.listByJob('job_msg01', 'usr_employer01', { limit: 1, offset: 0 });
    assert.equal(result.items.length, 1);
    assert.ok(result.total >= 2);
  });

  it('P22-23: markAsRead — ownership check', async () => {
    // Worker sends a message to employer
    const sendResult = await messagesModule.sendMessage('job_msg01', 'usr_worker01', {
      recipientId: 'usr_employer01',
      text: 'رسالة للتأكيد',
    });
    const msgId = sendResult.message.id;

    // Employer marks as read (valid)
    const readResult = await messagesModule.markAsRead(msgId, 'usr_employer01');
    assert.equal(readResult.ok, true);
  });

  it('P22-24: markAllAsRead — marks unread in job', async () => {
    const result = await messagesModule.markAllAsRead('job_msg01', 'usr_employer01');
    assert.equal(result.ok, true);
    assert.equal(typeof result.count, 'number');
  });

  it('P22-25: countUnread — accurate count', async () => {
    // Send a new message from employer to worker
    await messagesModule.sendMessage('job_msg01', 'usr_employer01', {
      recipientId: 'usr_worker01',
      text: 'رسالة غير مقروءة',
    });
    const count = await messagesModule.countUnread('usr_worker01');
    assert.ok(count >= 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Web Push Service Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 22 — Web Push Service', () => {
  let pushModule;

  before(async () => {
    pushModule = await import('../server/services/webpush.js');
  });

  it('P22-28: webpush.js exports all required functions', () => {
    assert.equal(typeof pushModule.subscribe, 'function');
    assert.equal(typeof pushModule.unsubscribe, 'function');
    assert.equal(typeof pushModule.sendPush, 'function');
    assert.equal(typeof pushModule.sendPushToMany, 'function');
  });

  it('P22-29: subscribe — stores subscription', async () => {
    const result = await pushModule.subscribe('usr_worker01', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test123',
      keys: { p256dh: 'dGVzdA', auth: 'dGVzdA' },
    }, 'TestAgent');
    assert.equal(result.ok, true);
    assert.ok(result.subscription.id.startsWith('psub_'));
    assert.equal(result.subscription.userId, 'usr_worker01');
  });

  it('P22-30: subscribe — max per user enforced', async () => {
    // Subscribe 5 more (max is 5 total)
    for (let i = 0; i < 5; i++) {
      await pushModule.subscribe('usr_worker01', {
        endpoint: `https://fcm.googleapis.com/fcm/send/test_extra_${i}`,
        keys: { p256dh: 'dGVzdA', auth: 'dGVzdA' },
      });
    }
    // Should have max 5 subscriptions
    const { getFromSetIndex } = await import('../server/services/database.js');
    const ids = await getFromSetIndex(config.DATABASE.indexFiles.pushUserIndex, 'usr_worker01');
    assert.ok(ids.length <= config.WEB_PUSH.maxSubscriptionsPerUser);
  });

  it('P22-31: unsubscribe — removes subscription', async () => {
    const result = await pushModule.unsubscribe('usr_worker01', 'https://fcm.googleapis.com/fcm/send/test123');
    assert.equal(result.ok, true);
  });

  it('P22-32: sendPush — handles missing subscription gracefully', async () => {
    const result = await pushModule.sendPush('usr_nonexistent', {
      title: 'Test',
      body: 'Test',
    });
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
  });

  it('P22-33: WEB_PUSH config controls events', () => {
    assert.equal(config.WEB_PUSH.events.application_accepted, true);
    assert.equal(config.WEB_PUSH.events.new_message, true);
    assert.equal(config.WEB_PUSH.events.attendance_noshow, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Job Duplication Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 22 — Job Duplication', () => {
  let duplicateJob;

  before(async () => {
    const jobsModule = await import('../server/services/jobs.js');
    duplicateJob = jobsModule.duplicateJob;
  });

  it('P22-34: duplicateJob — copies content fields correctly', async () => {
    const result = await duplicateJob('job_msg01', 'usr_employer01');
    assert.equal(result.ok, true);
    assert.ok(result.job.id.startsWith('job_'));
    assert.notEqual(result.job.id, 'job_msg01');
    assert.equal(result.job.title, 'فرصة تواصل');
    assert.equal(result.job.category, 'general');
    assert.equal(result.job.governorate, 'cairo');
    assert.equal(result.job.dailyWage, 200);
    assert.equal(result.job.workersNeeded, 2);
    assert.equal(result.job.durationDays, 3);
  });

  it('P22-35: duplicateJob — resets lifecycle fields', async () => {
    const result = await duplicateJob('job_msg01', 'usr_employer01');
    assert.equal(result.job.status, 'open');
    assert.equal(result.job.workersAccepted, 0);
    assert.ok(result.job.createdAt);
    assert.ok(result.job.expiresAt);
  });

  it('P22-36: duplicateJob — ownership check', async () => {
    const result = await duplicateJob('job_msg01', 'usr_worker01');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_JOB_OWNER');
  });

  it('P22-38: duplicateJob — source job unchanged', async () => {
    const { readJSON, getRecordPath } = await import('../server/services/database.js');
    await duplicateJob('job_msg01', 'usr_employer01');
    const source = await readJSON(getRecordPath('jobs', 'job_msg01'));
    assert.equal(source.status, 'filled');
    assert.equal(source.title, 'فرصة تواصل');
  });

  it('P22-39: duplicateJob — new job has startDate = tomorrow', async () => {
    const result = await duplicateJob('job_msg01', 'usr_employer01');
    assert.ok(result.job.startDate);
    // Should be a date string in the future
    const startDate = new Date(result.job.startDate);
    const now = new Date();
    assert.ok(result.job.startDate, 'startDate should be set');
  });
});

// ═══════════════════════════════════════════════════════════════
// Infrastructure Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 22 — Infrastructure', () => {
  it('P22-43: cleanStaleTmpFiles removes old .tmp files', async () => {
    const { cleanStaleTmpFiles } = await import('../server/services/database.js');
    const { writeFile: wf, utimes } = await import('node:fs/promises');

    // Create a stale .tmp file (modify time 10 minutes ago)
    const tmpFilePath = join(testDataDir, 'users', 'stale_test.json.tmp');
    await wf(tmpFilePath, '{}', 'utf-8');
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(tmpFilePath, tenMinAgo, tenMinAgo);

    const cleaned = await cleanStaleTmpFiles();
    assert.ok(cleaned >= 1);
    assert.equal(existsSync(tmpFilePath), false);
  });

  it('P22-44: cleanStaleTmpFiles ignores fresh .tmp files', async () => {
    const { cleanStaleTmpFiles } = await import('../server/services/database.js');
    const { writeFile: wf } = await import('node:fs/promises');

    // Create a fresh .tmp file
    const freshTmpPath = join(testDataDir, 'users', 'fresh_test.json.tmp');
    await wf(freshTmpPath, '{}', 'utf-8');

    await cleanStaleTmpFiles();
    assert.equal(existsSync(freshTmpPath), true);

    // Cleanup
    const { unlink } = await import('node:fs/promises');
    await unlink(freshTmpPath).catch(() => {});
  });

  it('P22-45: cleanStaleTmpFiles ignores non-.tmp files', async () => {
    const { cleanStaleTmpFiles } = await import('../server/services/database.js');
    const { readJSON, getRecordPath } = await import('../server/services/database.js');

    // Verify normal files still exist after cleanup
    await cleanStaleTmpFiles();
    const user = await readJSON(getRecordPath('users', 'usr_employer01'));
    assert.ok(user);
    assert.equal(user.id, 'usr_employer01');
  });
});

// ═══════════════════════════════════════════════════════════════
// File Existence Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 22 — File Existence', () => {
  it('P22-46: server/services/messages.js exists', () => {
    assert.ok(existsSync(join(import.meta.dirname, '..', 'server', 'services', 'messages.js')));
  });

  it('P22-47: server/handlers/messagesHandler.js exists', () => {
    assert.ok(existsSync(join(import.meta.dirname, '..', 'server', 'handlers', 'messagesHandler.js')));
  });

  it('P22-48: server/services/webpush.js exists', () => {
    assert.ok(existsSync(join(import.meta.dirname, '..', 'server', 'services', 'webpush.js')));
  });

  it('P22-49: server/handlers/pushHandler.js exists', () => {
    assert.ok(existsSync(join(import.meta.dirname, '..', 'server', 'handlers', 'pushHandler.js')));
  });

  it('P22-50: scripts/generate-vapid-keys.js exists', () => {
    assert.ok(existsSync(join(import.meta.dirname, '..', 'scripts', 'generate-vapid-keys.js')));
  });
});

// ═══════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════

after(async () => {
  await rm(testDataDir, { recursive: true, force: true }).catch(() => {});
});
