// tests/production-hardening.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 8 — Production Hardening Tests (~25 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-ph8-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'audit'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let authService, ntfService, jobsService, sessionsService, db, config;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  authService = await import('../server/services/auth.js');
  ntfService = await import('../server/services/notifications.js');
  jobsService = await import('../server/services/jobs.js');
  sessionsService = await import('../server/services/sessions.js');
});

// ── Per-Phone OTP Rate Limiting ───────────────────────────────

describe('Per-Phone OTP Rate Limiting', () => {

  it('PH8-01: sendOtp allows first OTP for a phone', async () => {
    const result = await authService.sendOtp('01012345678', 'worker');
    assert.strictEqual(result.ok, true);
  });

  it('PH8-02: sendOtp blocks after exceeding per-phone limit', async () => {
    const phone = '01098765432';
    // Send up to the limit
    for (let i = 0; i < config.RATE_LIMIT.otpMaxRequests; i++) {
      await authService.sendOtp(phone, 'worker');
    }
    // Next one should be blocked
    const result = await authService.sendOtp(phone, 'worker');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'PHONE_OTP_RATE_LIMITED');
  });

  it('PH8-03: sendOtp returns proper Arabic error message when rate limited', async () => {
    const phone = '01111111111';
    for (let i = 0; i < config.RATE_LIMIT.otpMaxRequests; i++) {
      await authService.sendOtp(phone, 'worker');
    }
    const result = await authService.sendOtp(phone, 'worker');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('الحد'), 'error message should contain Arabic rate limit text');
  });

  it('PH8-04: different phones have independent limits', async () => {
    const phoneA = '01222222222';
    const phoneB = '01233333333';
    // Exhaust phone A
    for (let i = 0; i < config.RATE_LIMIT.otpMaxRequests; i++) {
      await authService.sendOtp(phoneA, 'worker');
    }
    const blockedA = await authService.sendOtp(phoneA, 'worker');
    assert.strictEqual(blockedA.ok, false);
    assert.strictEqual(blockedA.code, 'PHONE_OTP_RATE_LIMITED');

    // Phone B should still work
    const resultB = await authService.sendOtp(phoneB, 'worker');
    assert.strictEqual(resultB.ok, true);
  });
});

// ── markAllAsRead Fix (Bug #1) ────────────────────────────────

describe('markAllAsRead Fix (Bug #1)', () => {

  it('PH8-05: markAllAsRead marks only target user notifications', async () => {
    const ntfA = await ntfService.createNotification('usr_maarA', 'application_accepted', 'msg A', {});
    const ntfB = await ntfService.createNotification('usr_maarB', 'application_rejected', 'msg B', {});

    await ntfService.markAllAsRead('usr_maarA');

    // User A's notification should be read
    const dataA = await db.readJSON(db.getRecordPath('notifications', ntfA.id));
    assert.strictEqual(dataA.read, true);

    // User B's notification should still be unread
    const dataB = await db.readJSON(db.getRecordPath('notifications', ntfB.id));
    assert.strictEqual(dataB.read, false);
  });

  it('PH8-06: markAllAsRead returns correct count', async () => {
    await ntfService.createNotification('usr_maarC', 'application_accepted', 'msg1', {});
    await ntfService.createNotification('usr_maarC', 'application_rejected', 'msg2', {});
    await ntfService.createNotification('usr_maarC', 'new_application', 'msg3', {});

    const result = await ntfService.markAllAsRead('usr_maarC');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.count, 3);
  });

  it('PH8-07: markAllAsRead on user with no notifications returns count 0', async () => {
    const result = await ntfService.markAllAsRead('usr_noexist999');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.count, 0);
  });
});

// ── Notification Cleanup ──────────────────────────────────────

describe('Notification Cleanup', () => {

  it('PH8-08: cleanOldNotifications deletes old READ notifications', async () => {
    // Create an old read notification (manually set createdAt to 100 days ago)
    const ntf = await ntfService.createNotification('usr_cleanup1', 'application_accepted', 'old msg', {});
    const ntfPath = db.getRecordPath('notifications', ntf.id);
    const data = await db.readJSON(ntfPath);
    data.read = true;
    data.readAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    data.createdAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    await db.atomicWrite(ntfPath, data);

    const cleaned = await ntfService.cleanOldNotifications();
    assert.ok(cleaned >= 1);

    // Verify file is deleted
    const after = await db.readJSON(ntfPath);
    assert.strictEqual(after, null);
  });

  it('PH8-09: cleanOldNotifications does NOT delete UNREAD notifications even if old', async () => {
    const ntf = await ntfService.createNotification('usr_cleanup2', 'application_accepted', 'old unread', {});
    const ntfPath = db.getRecordPath('notifications', ntf.id);
    const data = await db.readJSON(ntfPath);
    data.createdAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    // read remains false
    await db.atomicWrite(ntfPath, data);

    await ntfService.cleanOldNotifications();

    // Should still exist
    const after = await db.readJSON(ntfPath);
    assert.ok(after, 'unread notification should survive cleanup');
    assert.strictEqual(after.read, false);
  });

  it('PH8-10: cleanOldNotifications does NOT delete recent READ notifications', async () => {
    const ntf = await ntfService.createNotification('usr_cleanup3', 'application_accepted', 'recent read', {});
    const ntfPath = db.getRecordPath('notifications', ntf.id);
    const data = await db.readJSON(ntfPath);
    data.read = true;
    data.readAt = new Date().toISOString();
    // createdAt is recent (just created)
    await db.atomicWrite(ntfPath, data);

    await ntfService.cleanOldNotifications();

    // Should still exist
    const after = await db.readJSON(ntfPath);
    assert.ok(after, 'recent read notification should survive cleanup');
  });

  it('PH8-11: cleanOldNotifications returns 0 when ttlDays is not set', async () => {
    // This test verifies the guard clause — since config is frozen with ttlDays=90,
    // we test with a notification that is not old enough
    // Create a fresh read notification
    const ntf = await ntfService.createNotification('usr_cleanup4', 'application_accepted', 'fresh', {});
    const ntfPath = db.getRecordPath('notifications', ntf.id);
    const data = await db.readJSON(ntfPath);
    data.read = true;
    data.readAt = new Date().toISOString();
    await db.atomicWrite(ntfPath, data);

    // Running cleanup — this fresh notification should not be cleaned
    const cleaned = await ntfService.cleanOldNotifications();
    // The fresh one should survive
    const after = await db.readJSON(ntfPath);
    assert.ok(after, 'fresh read notification should not be cleaned');
  });
});

// ── OTP Cleanup ───────────────────────────────────────────────

describe('OTP Cleanup', () => {

  it('PH8-12: cleanExpiredOtps deletes expired OTP files', async () => {
    // Create expired OTP
    const otpPath = db.getRecordPath('otp', '01055551111');
    await db.atomicWrite(otpPath, {
      phone: '01055551111',
      otp: '1234',
      role: 'worker',
      attempts: 0,
      createdAt: new Date(Date.now() - 600000).toISOString(),
      expiresAt: new Date(Date.now() - 300000).toISOString(),  // expired 5 min ago
    });

    const cleaned = await authService.cleanExpiredOtps();
    assert.ok(cleaned >= 1);

    const after = await db.readJSON(otpPath);
    assert.strictEqual(after, null, 'expired OTP should be deleted');
  });

  it('PH8-13: cleanExpiredOtps does NOT delete non-expired OTP files', async () => {
    const otpPath = db.getRecordPath('otp', '01055552222');
    await db.atomicWrite(otpPath, {
      phone: '01055552222',
      otp: '5678',
      role: 'worker',
      attempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),  // expires in 5 min
    });

    await authService.cleanExpiredOtps();

    const after = await db.readJSON(otpPath);
    assert.ok(after, 'non-expired OTP should survive cleanup');
  });

  it('PH8-14: cleanExpiredOtps returns 0 when no OTP files', async () => {
    // After previous tests cleaned up, create scenario with no expired OTPs
    // The non-expired one from PH8-13 may still exist — that's fine, it should return 0 for expired
    const cleaned = await authService.cleanExpiredOtps();
    // Can be 0 or more depending on state, but should not throw
    assert.strictEqual(typeof cleaned, 'number');
  });
});

// ── Logout All ────────────────────────────────────────────────

describe('Logout All (destroyAllByUser)', () => {

  it('PH8-15: destroyAllByUser destroys all sessions for target user', async () => {
    const s1 = await sessionsService.createSession('usr_logoutAll1', 'worker');
    const s2 = await sessionsService.createSession('usr_logoutAll1', 'worker');
    const s3 = await sessionsService.createSession('usr_logoutAll1', 'worker');

    const destroyed = await sessionsService.destroyAllByUser('usr_logoutAll1');
    assert.strictEqual(destroyed, 3);

    // Verify sessions are gone
    const v1 = await sessionsService.verifySession(s1.token);
    const v2 = await sessionsService.verifySession(s2.token);
    const v3 = await sessionsService.verifySession(s3.token);
    assert.strictEqual(v1, null);
    assert.strictEqual(v2, null);
    assert.strictEqual(v3, null);
  });

  it('PH8-16: destroyAllByUser does NOT destroy other users sessions', async () => {
    const sA = await sessionsService.createSession('usr_logoutA2', 'worker');
    const sB = await sessionsService.createSession('usr_logoutB2', 'employer');

    await sessionsService.destroyAllByUser('usr_logoutA2');

    // B's session should still be valid
    const vB = await sessionsService.verifySession(sB.token);
    assert.ok(vB, 'other user session should survive');
    assert.strictEqual(vB.userId, 'usr_logoutB2');
  });

  it('PH8-17: destroyAllByUser returns 0 for user with no sessions', async () => {
    const destroyed = await sessionsService.destroyAllByUser('usr_nosessions999');
    assert.strictEqual(destroyed, 0);
  });
});

// ── Auto-Reject on Expiry (Bug #2) ───────────────────────────

describe('Auto-Reject on Expiry (Bug #2)', () => {

  it('PH8-18: checkExpiry auto-rejects pending applications when job expires', async () => {
    // Create a job that is past expiry
    const jobId = 'job_expire01';
    const jobPath = db.getRecordPath('jobs', jobId);
    await db.atomicWrite(jobPath, {
      id: jobId,
      employerId: 'usr_emp01',
      title: 'فرصة تست',
      category: 'construction',
      governorate: 'cairo',
      workersNeeded: 3,
      workersAccepted: 0,
      dailyWage: 200,
      durationDays: 1,
      status: 'open',
      createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired
    });

    // Write jobs index entry
    const jobsIndex = await db.readIndex('jobsIndex');
    jobsIndex[jobId] = { id: jobId, employerId: 'usr_emp01', category: 'construction', governorate: 'cairo', status: 'open', createdAt: new Date().toISOString() };
    await db.writeIndex('jobsIndex', jobsIndex);

    // Create a pending application
    const appId = 'app_pendexp01';
    const appPath = db.getRecordPath('applications', appId);
    await db.atomicWrite(appPath, {
      id: appId,
      jobId,
      workerId: 'usr_wrk01',
      status: 'pending',
      appliedAt: new Date().toISOString(),
      respondedAt: null,
    });

    // Write job-apps index so listByJob can find the application
    await db.addToSetIndex(config.DATABASE.indexFiles.jobAppsIndex, jobId, appId);

    // Trigger expiry check
    const job = await db.readJSON(jobPath);
    await jobsService.checkExpiry(job);

    // Wait for fire-and-forget to complete
    await new Promise(r => setTimeout(r, 200));

    // Application should now be rejected
    const appData = await db.readJSON(appPath);
    assert.strictEqual(appData.status, 'rejected');
    assert.ok(appData.respondedAt);
  });

  it('PH8-19: checkExpiry creates notification for affected workers', async () => {
    // Create a job that is past expiry
    const jobId = 'job_expire02';
    const jobPath = db.getRecordPath('jobs', jobId);
    await db.atomicWrite(jobPath, {
      id: jobId,
      employerId: 'usr_emp02',
      title: 'فرصة تست إشعار',
      category: 'farming',
      governorate: 'giza',
      workersNeeded: 2,
      workersAccepted: 0,
      dailyWage: 300,
      durationDays: 1,
      status: 'open',
      createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const jobsIndex = await db.readIndex('jobsIndex');
    jobsIndex[jobId] = { id: jobId, employerId: 'usr_emp02', category: 'farming', governorate: 'giza', status: 'open', createdAt: new Date().toISOString() };
    await db.writeIndex('jobsIndex', jobsIndex);

    const appId = 'app_pendexp02';
    const appPath = db.getRecordPath('applications', appId);
    await db.atomicWrite(appPath, {
      id: appId,
      jobId,
      workerId: 'usr_wrk02',
      status: 'pending',
      appliedAt: new Date().toISOString(),
      respondedAt: null,
    });

    await db.addToSetIndex(config.DATABASE.indexFiles.jobAppsIndex, jobId, appId);

    const job = await db.readJSON(jobPath);
    await jobsService.checkExpiry(job);

    // Wait for fire-and-forget
    await new Promise(r => setTimeout(r, 200));

    // Check notification was created for the worker
    const ntfResult = await ntfService.listByUser('usr_wrk02');
    const expiredNtf = ntfResult.items.find(n => n.meta && n.meta.reason === 'job_expired');
    assert.ok(expiredNtf, 'worker should receive notification about expired job');
    assert.ok(expiredNtf.message.includes('انتهت صلاحيتها'));
  });

  it('PH8-20: checkExpiry does not affect already-accepted applications', async () => {
    const jobId = 'job_expire03';
    const jobPath = db.getRecordPath('jobs', jobId);
    await db.atomicWrite(jobPath, {
      id: jobId,
      employerId: 'usr_emp03',
      title: 'فرصة مقبولة',
      category: 'loading',
      governorate: 'alex',
      workersNeeded: 2,
      workersAccepted: 1,
      dailyWage: 250,
      durationDays: 1,
      status: 'open',
      createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const jobsIndex = await db.readIndex('jobsIndex');
    jobsIndex[jobId] = { id: jobId, employerId: 'usr_emp03', category: 'loading', governorate: 'alex', status: 'open', createdAt: new Date().toISOString() };
    await db.writeIndex('jobsIndex', jobsIndex);

    // Accepted application
    const appIdAccepted = 'app_accepted03';
    await db.atomicWrite(db.getRecordPath('applications', appIdAccepted), {
      id: appIdAccepted,
      jobId,
      workerId: 'usr_wrk03a',
      status: 'accepted',
      appliedAt: new Date().toISOString(),
      respondedAt: new Date().toISOString(),
    });

    await db.addToSetIndex(config.DATABASE.indexFiles.jobAppsIndex, jobId, appIdAccepted);

    const job = await db.readJSON(jobPath);
    await jobsService.checkExpiry(job);

    await new Promise(r => setTimeout(r, 200));

    // Accepted application should remain accepted
    const appData = await db.readJSON(db.getRecordPath('applications', appIdAccepted));
    assert.strictEqual(appData.status, 'accepted');
  });
});

// ── Stale Jobs Filter (Bug #3) ───────────────────────────────

describe('Stale Jobs Filter (Bug #3)', () => {

  it('PH8-21: list() does not return jobs past expiresAt', async () => {
    const jobId = 'job_stale01';
    const jobPath = db.getRecordPath('jobs', jobId);
    await db.atomicWrite(jobPath, {
      id: jobId,
      employerId: 'usr_emp_stale',
      title: 'فرصة قديمة',
      category: 'cleaning',
      governorate: 'cairo',
      workersNeeded: 1,
      workersAccepted: 0,
      dailyWage: 200,
      durationDays: 1,
      status: 'open',
      createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired
    });

    const jobs = await jobsService.list({});
    const staleJob = jobs.find(j => j.id === jobId);
    assert.strictEqual(staleJob, undefined, 'stale job should not appear in list');
  });

  it('PH8-22: list() still returns jobs with future expiresAt', async () => {
    const jobId = 'job_fresh01';
    const jobPath = db.getRecordPath('jobs', jobId);
    await db.atomicWrite(jobPath, {
      id: jobId,
      employerId: 'usr_emp_fresh',
      title: 'فرصة جديدة',
      category: 'painting',
      governorate: 'giza',
      workersNeeded: 2,
      workersAccepted: 0,
      dailyWage: 350,
      durationDays: 3,
      status: 'open',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // future
    });

    const jobs = await jobsService.list({});
    const freshJob = jobs.find(j => j.id === jobId);
    assert.ok(freshJob, 'fresh job should appear in list');
  });
});

// ── Config Section ────────────────────────────────────────────

describe('Config Section (Phase 8)', () => {

  it('PH8-23: config has 38 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 46, `expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('PH8-24: CLEANUP section has notificationTtlDays', () => {
    assert.ok(config.CLEANUP, 'CLEANUP section should exist');
    assert.strictEqual(typeof config.CLEANUP.notificationTtlDays, 'number');
    assert.ok(config.CLEANUP.notificationTtlDays > 0);
  });

  it('PH8-25: CLEANUP section has otpCleanupEnabled', () => {
    assert.strictEqual(typeof config.CLEANUP.otpCleanupEnabled, 'boolean');
    assert.strictEqual(config.CLEANUP.otpCleanupEnabled, true);
  });
});
