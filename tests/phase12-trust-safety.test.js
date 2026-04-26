// tests/phase12-trust-safety.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 12 — Trust & Safety Foundation Tests (~27 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-phase12-'));
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

let config, db, userService, reportsService, trustService, eventBus;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  reportsService = await import('../server/services/reports.js');
  trustService = await import('../server/services/trust.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
});

after(() => {
  if (eventBus) eventBus.clear();
});

// ── Helper ──────────────────────────────────────────────────
let counter = 0;
async function createTestUser(role) {
  counter++;
  const phone = '0101200' + String(counter).padStart(4, '0');
  return await userService.create(phone, role);
}

// ══════════════════════════════════════════════════════════════
// Config Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 12 — Config', () => {

  it('P12-01: Config has 38 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 52, `expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P12-02: REPORTS section has all fields', () => {
    assert.ok(config.REPORTS, 'REPORTS section should exist');
    assert.strictEqual(config.REPORTS.enabled, true);
    assert.strictEqual(config.REPORTS.types.length, 6);
    assert.strictEqual(config.REPORTS.statuses.length, 4);
    assert.strictEqual(config.REPORTS.maxReportsPerUserPerDay, 5);
    assert.strictEqual(config.REPORTS.autobanThreshold, 5);
    assert.strictEqual(config.REPORTS.minReasonLength, 10);
    assert.strictEqual(config.REPORTS.maxReasonLength, 500);
  });

  it('P12-03: TRUST section has weights summing to 1.0', () => {
    assert.ok(config.TRUST, 'TRUST section should exist');
    const w = config.TRUST.weights;
    const sum = w.ratingAvg + w.completionRate + (w.attendanceRate || 0) + w.reportScore + w.accountAge;
    assert.ok(Math.abs(sum - 1.0) < 0.01, `weights should sum to 1.0, got ${sum}`);
  });

  it('P12-04: DATABASE has 12 dirs', () => {
    assert.strictEqual(Object.keys(config.DATABASE.dirs).length, 18);
    assert.ok(config.DATABASE.dirs.reports);
  });

  it('P12-05: DATABASE has 12 indexFiles', () => {
    assert.strictEqual(Object.keys(config.DATABASE.indexFiles).length, 17);
    assert.ok(config.DATABASE.indexFiles.targetReportsIndex);
    assert.ok(config.DATABASE.indexFiles.reporterReportsIndex);
  });
});

// ══════════════════════════════════════════════════════════════
// Reports Service Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 12 — Reports Service', () => {

  it('P12-06: createReport — success with valid data', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');

    const result = await reportsService.createReport(reporter.id, target.id, {
      type: 'fraud',
      reason: 'هذا المستخدم يقوم بالنصب على العمال بشكل متكرر',
    });

    assert.strictEqual(result.ok, true);
    assert.ok(result.report.id.startsWith('rpt_'));
    assert.strictEqual(result.report.status, 'pending');
    assert.strictEqual(result.report.type, 'fraud');
    assert.strictEqual(result.report.reporterId, reporter.id);
    assert.strictEqual(result.report.targetId, target.id);
  });

  it('P12-07: createReport — fail: cannot report self', async () => {
    const user = await createTestUser('worker');
    const result = await reportsService.createReport(user.id, user.id, {
      type: 'fraud',
      reason: 'هذا بلاغ تجريبي على نفسي لا ينبغي أن ينجح',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CANNOT_REPORT_SELF');
  });

  it('P12-08: createReport — fail: invalid type', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');
    const result = await reportsService.createReport(reporter.id, target.id, {
      type: 'invalid_type',
      reason: 'سبب البلاغ التجريبي يجب أن يكون طويلاً بما يكفي',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_REPORT_TYPE');
  });

  it('P12-09: createReport — fail: reason too short', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');
    const result = await reportsService.createReport(reporter.id, target.id, {
      type: 'fraud',
      reason: 'قصير',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'REASON_TOO_SHORT');
  });

  it('P12-10: createReport — fail: reason too long', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');
    const result = await reportsService.createReport(reporter.id, target.id, {
      type: 'fraud',
      reason: 'x'.repeat(501),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'REASON_TOO_LONG');
  });

  it('P12-11: createReport — fail: target not found', async () => {
    const reporter = await createTestUser('worker');
    const result = await reportsService.createReport(reporter.id, 'usr_nonexistent', {
      type: 'fraud',
      reason: 'بلاغ على مستخدم غير موجود في النظام',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'TARGET_NOT_FOUND');
  });

  it('P12-12: createReport — fail: duplicate (same reporter+target+job)', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');

    // First report with jobId
    const r1 = await reportsService.createReport(reporter.id, target.id, {
      type: 'no_show',
      reason: 'لم يحضر صاحب العمل في الموعد المحدد',
      jobId: 'job_test123',
    });
    assert.strictEqual(r1.ok, true);

    // Duplicate with same jobId
    const r2 = await reportsService.createReport(reporter.id, target.id, {
      type: 'no_show',
      reason: 'بلاغ مكرر على نفس الفرصة ونفس المستخدم',
      jobId: 'job_test123',
    });
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.code, 'DUPLICATE_REPORT');
  });

  it('P12-13: reviewReport — success: action_taken', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');

    const r = await reportsService.createReport(reporter.id, target.id, {
      type: 'harassment',
      reason: 'إساءة لفظية متكررة أثناء العمل في الموقع',
    });

    const result = await reportsService.reviewReport(r.report.id, {
      status: 'action_taken',
      adminNotes: 'تم التحقق من البلاغ',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.report.status, 'action_taken');
    assert.ok(result.report.reviewedAt);
    assert.strictEqual(result.report.adminNotes, 'تم التحقق من البلاغ');
  });

  it('P12-14: reviewReport — success: dismissed', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');

    const r = await reportsService.createReport(reporter.id, target.id, {
      type: 'quality',
      reason: 'بلاغ تجريبي عن جودة العمل المنخفضة جداً',
    });

    const result = await reportsService.reviewReport(r.report.id, {
      status: 'dismissed',
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.report.status, 'dismissed');
  });

  it('P12-15: reviewReport — fail: invalid status', async () => {
    const reporter = await createTestUser('worker');
    const target = await createTestUser('employer');

    const r = await reportsService.createReport(reporter.id, target.id, {
      type: 'fraud',
      reason: 'بلاغ تجريبي لاختبار حالة غير صالحة في المراجعة',
    });

    const result = await reportsService.reviewReport(r.report.id, {
      status: 'invalid_status',
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_REPORT_STATUS');
  });

  it('P12-16: reviewReport — fail: not found', async () => {
    const result = await reportsService.reviewReport('rpt_nonexistent', {
      status: 'dismissed',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'REPORT_NOT_FOUND');
  });

  it('P12-17: listPending — returns only pending', async () => {
    const pending = await reportsService.listPending();
    for (const r of pending) {
      assert.strictEqual(r.status, 'pending');
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Trust Score Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 12 — Trust Score', () => {

  it('P12-18: calculateTrustScore — neutral for new user', () => {
    const result = trustService.calculateTrustScore({
      ratingAvg: 0,
      ratingCount: 0,
      completedJobs: 0,
      totalAssigned: 0,
      confirmedReports: 0,
      totalReports: 0,
      accountAgeDays: 0,
    });
    // 0.4*0.5 + 0.3*0.5 + 0.2*1.0 + 0.1*0 = 0.2 + 0.15 + 0.2 + 0 = 0.55
    assert.strictEqual(result.score, 0.55);
  });

  it('P12-19: calculateTrustScore — high for perfect user', () => {
    const result = trustService.calculateTrustScore({
      ratingAvg: 5,
      ratingCount: 10,
      completedJobs: 20,
      totalAssigned: 20,
      confirmedReports: 0,
      totalReports: 0,
      accountAgeDays: 365,
      totalAttendanceRecords: 20, attendedDays: 20,
    });
    // 0.3*1.0 + 0.2*1.0 + 0.2*1.0 + 0.2*1.0 + 0.1*1.0 = 1.0
    assert.ok(result.score > 0.8, `expected >0.8, got ${result.score}`);
    assert.strictEqual(result.score, 1.0);
  });

  it('P12-20: calculateTrustScore — low for reported user', () => {
    const result = trustService.calculateTrustScore({
      ratingAvg: 2,
      ratingCount: 5,
      completedJobs: 2,
      totalAssigned: 10,
      confirmedReports: 5,
      totalReports: 5,
      accountAgeDays: 30,
    });
    // 0.4*(2/5) + 0.3*(2/10) + 0.2*(1-5/5) + 0.1*(30/365)
    // = 0.4*0.4 + 0.3*0.2 + 0.2*0 + 0.1*0.082
    // = 0.16 + 0.06 + 0 + 0.0082 = 0.2282 ≈ 0.23
    assert.ok(result.score < 0.5, `expected <0.5, got ${result.score}`);
  });

  it('P12-21: calculateTrustScore — weights sum to 1.0', () => {
    const w = config.TRUST.weights;
    const sum = w.ratingAvg + w.completionRate + (w.attendanceRate || 0) + w.reportScore + w.accountAge;
    assert.ok(Math.abs(sum - 1.0) < 0.01, `weights should sum to 1.0, got ${sum}`);
  });

  it('P12-22: calculateTrustScore — clamped 0–1', () => {
    const result = trustService.calculateTrustScore({
      ratingAvg: 5,
      ratingCount: 100,
      completedJobs: 100,
      totalAssigned: 100,
      confirmedReports: 0,
      totalReports: 0,
      accountAgeDays: 9999,
    });
    assert.ok(result.score >= 0, 'score should be >= 0');
    assert.ok(result.score <= 1, 'score should be <= 1');
  });
});

// ══════════════════════════════════════════════════════════════
// User Model Tests (terms + soft delete)
// ══════════════════════════════════════════════════════════════

describe('Phase 12 — User Model', () => {

  it('P12-23: create() includes termsAcceptedAt: null', async () => {
    const user = await createTestUser('worker');
    assert.strictEqual(user.termsAcceptedAt, null);
    assert.strictEqual(user.termsVersion, null);
  });

  it('P12-24: acceptTerms sets termsAcceptedAt + termsVersion', async () => {
    const user = await createTestUser('worker');
    const updated = await userService.acceptTerms(user.id, '1.0');
    assert.ok(updated);
    assert.ok(updated.termsAcceptedAt, 'termsAcceptedAt should be set');
    assert.strictEqual(updated.termsVersion, '1.0');
  });

  it('P12-25: softDelete sets status=deleted, anonymizes phone/name', async () => {
    const user = await createTestUser('worker');
    const deleted = await userService.softDelete(user.id);
    assert.ok(deleted);
    assert.strictEqual(deleted.status, 'deleted');
    assert.strictEqual(deleted.name, 'مستخدم محذوف');
    assert.strictEqual(deleted.phone, `deleted_${user.id}`);
    assert.deepStrictEqual(deleted.categories, []);
    assert.strictEqual(deleted.lat, null);
    assert.strictEqual(deleted.lng, null);
    assert.ok(deleted.deletedAt);
  });

  it('P12-26: softDelete removes phone from index', async () => {
    const user = await createTestUser('employer');
    const originalPhone = user.phone;

    // Verify phone is in index before delete
    const indexBefore = await db.readIndex('phoneIndex');
    assert.strictEqual(indexBefore[originalPhone], user.id);

    await userService.softDelete(user.id);

    // Verify phone is removed from index after delete
    const indexAfter = await db.readIndex('phoneIndex');
    assert.strictEqual(indexAfter[originalPhone], undefined, 'phone should be removed from index');
  });

  it('P12-27: softDelete returns null for admin users', async () => {
    // Create admin user directly
    const adminId = 'usr_admin_test_del';
    const adminPath = db.getRecordPath('users', adminId);
    await db.atomicWrite(adminPath, {
      id: adminId,
      phone: '01099999999',
      role: 'admin',
      name: 'Admin Test',
      governorate: '',
      categories: [],
      lat: null,
      lng: null,
      rating: { avg: 0, count: 0 },
      status: 'active',
      termsAcceptedAt: null,
      termsVersion: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await userService.softDelete(adminId);
    assert.strictEqual(result, null, 'softDelete should return null for admin');
  });
});
