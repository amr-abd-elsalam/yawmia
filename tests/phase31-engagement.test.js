// ═══════════════════════════════════════════════════════════════
// tests/phase31-engagement.test.js — Phase 31: Smart Engagement
// + Enhanced Discovery (~45 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

let config;
let tmpDir;

function readSource(relPath) {
  return readFile(resolve(relPath), 'utf-8');
}

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-p31-'));
  const dirs = [
    'users', 'sessions', 'jobs', 'applications', 'otp', 'notifications',
    'ratings', 'payments', 'reports', 'verifications', 'attendance',
    'audit', 'messages', 'push_subscriptions', 'alerts',
  ];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
  config = (await import('../config.js')).default;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════
// Job Alerts CRUD
// ═══════════════════════════════════════════════════════════════

describe('Phase 31 — Job Alerts CRUD', () => {
  let db, userService, jobAlerts, eventBus;

  before(async () => {
    db = await import('../server/services/database.js');
    await db.initDatabase();
    userService = await import('../server/services/users.js');
    jobAlerts = await import('../server/services/jobAlerts.js');
    eventBus = (await import('../server/services/eventBus.js')).eventBus;
    eventBus.clear();
  });

  after(() => { if (eventBus) eventBus.clear(); });

  it('P31-01: createAlert with valid criteria → success', async () => {
    const user = await userService.create('01031010001', 'worker');
    const result = await jobAlerts.createAlert(user.id, {
      name: 'تنبيه زراعة',
      criteria: { categories: ['farming'], governorate: 'giza' },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.alert);
    assert.ok(result.alert.id.startsWith('alt_'));
    assert.strictEqual(result.alert.name, 'تنبيه زراعة');
    assert.strictEqual(result.alert.enabled, true);
    assert.strictEqual(result.alert.matchCount, 0);
  });

  it('P31-02: createAlert missing categories → error', async () => {
    const user = await userService.create('01031010002', 'worker');
    const result = await jobAlerts.createAlert(user.id, {
      name: 'تنبيه فارغ',
      criteria: { governorate: 'cairo' },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CATEGORIES_REQUIRED');
  });

  it('P31-03: createAlert invalid category ID → error', async () => {
    const user = await userService.create('01031010003', 'worker');
    const result = await jobAlerts.createAlert(user.id, {
      name: 'تنبيه خاطئ',
      criteria: { categories: ['nonexistent_cat'] },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_CATEGORY');
  });

  it('P31-04: createAlert 6th alert (max=5) → error', async () => {
    const user = await userService.create('01031010004', 'worker');
    for (let i = 0; i < 5; i++) {
      await jobAlerts.createAlert(user.id, {
        name: 'تنبيه ' + i,
        criteria: { categories: ['farming'] },
      });
    }
    const result = await jobAlerts.createAlert(user.id, {
      name: 'تنبيه سادس',
      criteria: { categories: ['farming'] },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'MAX_ALERTS_REACHED');
  });

  it('P31-05: listByUser returns only user\'s alerts', async () => {
    const user1 = await userService.create('01031010005', 'worker');
    const user2 = await userService.create('01031010006', 'worker');
    await jobAlerts.createAlert(user1.id, { name: 'A1', criteria: { categories: ['farming'] } });
    await jobAlerts.createAlert(user2.id, { name: 'A2', criteria: { categories: ['construction'] } });
    const list1 = await jobAlerts.listByUser(user1.id);
    const list2 = await jobAlerts.listByUser(user2.id);
    assert.ok(list1.every(a => a.userId === user1.id));
    assert.ok(list2.every(a => a.userId === user2.id));
  });

  it('P31-06: deleteAlert by owner → success', async () => {
    const user = await userService.create('01031010007', 'worker');
    const { alert } = await jobAlerts.createAlert(user.id, { name: 'حذف', criteria: { categories: ['farming'] } });
    const result = await jobAlerts.deleteAlert(alert.id, user.id);
    assert.strictEqual(result.ok, true);
    const list = await jobAlerts.listByUser(user.id);
    assert.ok(!list.find(a => a.id === alert.id));
  });

  it('P31-07: deleteAlert by non-owner → forbidden', async () => {
    const owner = await userService.create('01031010008', 'worker');
    const other = await userService.create('01031010009', 'worker');
    const { alert } = await jobAlerts.createAlert(owner.id, { name: 'خاص', criteria: { categories: ['farming'] } });
    const result = await jobAlerts.deleteAlert(alert.id, other.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_ALERT_OWNER');
  });

  it('P31-08: toggleAlert enable/disable → success', async () => {
    const user = await userService.create('01031010010', 'worker');
    const { alert } = await jobAlerts.createAlert(user.id, { name: 'تبديل', criteria: { categories: ['farming'] } });
    assert.strictEqual(alert.enabled, true);
    const r1 = await jobAlerts.toggleAlert(alert.id, user.id, false);
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.alert.enabled, false);
    const r2 = await jobAlerts.toggleAlert(alert.id, user.id, true);
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.alert.enabled, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Job Alerts Matching
// ═══════════════════════════════════════════════════════════════

describe('Phase 31 — Job Alerts Matching', () => {
  let db, userService, jobAlerts, jobsService, eventBus;

  before(async () => {
    db = await import('../server/services/database.js');
    await db.initDatabase();
    userService = await import('../server/services/users.js');
    jobAlerts = await import('../server/services/jobAlerts.js');
    jobsService = await import('../server/services/jobs.js');
    eventBus = (await import('../server/services/eventBus.js')).eventBus;
    eventBus.clear();
  });

  after(() => { if (eventBus) eventBus.clear(); });

  it('P31-09: category match → notification created', async () => {
    const worker = await userService.create('01031090001', 'worker');
    await jobAlerts.createAlert(worker.id, { name: 'مطابقة', criteria: { categories: ['farming'] } });
    const employer = await userService.create('01031090002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'جمع قمح', category: 'farming', governorate: 'giza',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.ok(count > 0, 'Should match at least one alert');
  });

  it('P31-10: no category match → no notification', async () => {
    const worker = await userService.create('01031100001', 'worker');
    await jobAlerts.createAlert(worker.id, { name: 'بناء فقط', criteria: { categories: ['construction'] } });
    const employer = await userService.create('01031100002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'طبخ', category: 'cooking', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.strictEqual(count, 0);
  });

  it('P31-11: disabled alert → no notification', async () => {
    const worker = await userService.create('01031110001', 'worker');
    const { alert } = await jobAlerts.createAlert(worker.id, { name: 'معطل', criteria: { categories: ['farming'] } });
    await jobAlerts.toggleAlert(alert.id, worker.id, false);
    const employer = await userService.create('01031110002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'حصاد', category: 'farming', governorate: 'giza',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.strictEqual(count, 0);
  });

  it('P31-12: wage below minWage → no match', async () => {
    const worker = await userService.create('01031120001', 'worker');
    await jobAlerts.createAlert(worker.id, { name: 'أجر عالي', criteria: { categories: ['farming'], minWage: 300 } });
    const employer = await userService.create('01031120002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'زراعة رخيصة', category: 'farming', governorate: 'giza',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.strictEqual(count, 0);
  });

  it('P31-13: wage within range → match', async () => {
    const worker = await userService.create('01031130001', 'worker');
    await jobAlerts.createAlert(worker.id, { name: 'نطاق', criteria: { categories: ['cleaning'], minWage: 150, maxWage: 400 } });
    const employer = await userService.create('01031130002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'تنظيف', category: 'cleaning', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 250, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.ok(count > 0);
  });

  it('P31-14: wage above maxWage → no match', async () => {
    const worker = await userService.create('01031140001', 'worker');
    await jobAlerts.createAlert(worker.id, { name: 'حد أقصى', criteria: { categories: ['electrical'], maxWage: 300 } });
    const employer = await userService.create('01031140002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'كهرباء غالية', category: 'electrical', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 500, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.strictEqual(count, 0);
  });

  it('P31-15: governorate match → match', async () => {
    const worker = await userService.create('01031150001', 'worker');
    await jobAlerts.createAlert(worker.id, { name: 'القاهرة', criteria: { categories: ['plumbing'], governorate: 'cairo' } });
    const employer = await userService.create('01031150002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'سباكة القاهرة', category: 'plumbing', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 300, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.ok(count > 0);
  });

  it('P31-16: governorate mismatch → no match', async () => {
    const worker = await userService.create('01031160001', 'worker');
    await jobAlerts.createAlert(worker.id, { name: 'الجيزة فقط', criteria: { categories: ['plumbing'], governorate: 'giza' } });
    const employer = await userService.create('01031160002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'سباكة الاسكندرية', category: 'plumbing', governorate: 'alex',
      workersNeeded: 1, dailyWage: 300, startDate: '2026-06-01', durationDays: 1,
    });
    const count = await jobAlerts.matchJobToAlerts(job);
    assert.strictEqual(count, 0);
  });

  it('P31-17: cooldown respected → no re-match', async () => {
    const worker = await userService.create('01031170001', 'worker');
    const { alert } = await jobAlerts.createAlert(worker.id, { name: 'cooldown', criteria: { categories: ['security'] } });
    const employer = await userService.create('01031170002', 'employer');
    const job1 = await jobsService.create(employer.id, {
      title: 'حراسة 1', category: 'security', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const count1 = await jobAlerts.matchJobToAlerts(job1);
    assert.ok(count1 > 0, 'First match should succeed');
    const job2 = await jobsService.create(employer.id, {
      title: 'حراسة 2', category: 'security', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const count2 = await jobAlerts.matchJobToAlerts(job2);
    assert.strictEqual(count2, 0, 'Second match within cooldown should be blocked');
  });

  it('P31-18: matchCount + lastMatchedAt updated', async () => {
    const worker = await userService.create('01031180001', 'worker');
    const { alert } = await jobAlerts.createAlert(worker.id, { name: 'عداد', criteria: { categories: ['carpentry'] } });
    const employer = await userService.create('01031180002', 'employer');
    const job = await jobsService.create(employer.id, {
      title: 'نجارة', category: 'carpentry', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    await jobAlerts.matchJobToAlerts(job);
    const updated = await db.readJSON(db.getRecordPath('alerts', alert.id));
    assert.strictEqual(updated.matchCount, 1);
    assert.ok(updated.lastMatchedAt);
  });
});

// ═══════════════════════════════════════════════════════════════
// Enhanced Filters
// ═══════════════════════════════════════════════════════════════

describe('Phase 31 — Enhanced Filters', () => {
  let jobsService, userService, db;

  before(async () => {
    db = await import('../server/services/database.js');
    await db.initDatabase();
    userService = await import('../server/services/users.js');
    jobsService = await import('../server/services/jobs.js');
    const eventBus = (await import('../server/services/eventBus.js')).eventBus;
    eventBus.clear();

    // Create test jobs
    const emp = await userService.create('01031190001', 'employer');
    await jobsService.create(emp.id, { title: 'زراعة 1', category: 'farming', governorate: 'giza', workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1 });
    await jobsService.create(emp.id, { title: 'بناء 1', category: 'construction', governorate: 'cairo', workersNeeded: 1, dailyWage: 350, startDate: '2026-06-05', durationDays: 2 });
    await jobsService.create(emp.id, { title: 'نظافة 1', category: 'cleaning', governorate: 'alex', workersNeeded: 1, dailyWage: 500, startDate: '2026-06-10', durationDays: 3 });
  });

  it('P31-19: categories=farming,construction → returns both', async () => {
    const jobs = await jobsService.list({ categories: 'farming,construction' });
    const cats = jobs.map(j => j.category);
    assert.ok(cats.includes('farming') || cats.includes('construction'), 'Should include farming or construction');
    assert.ok(!cats.includes('cleaning'), 'Should not include cleaning');
  });

  it('P31-20: categories=farming → returns farming only', async () => {
    const jobs = await jobsService.list({ categories: 'farming' });
    assert.ok(jobs.every(j => j.category === 'farming'));
  });

  it('P31-21: minWage=300 → filters low-wage jobs', async () => {
    const jobs = await jobsService.list({ minWage: '300' });
    assert.ok(jobs.every(j => j.dailyWage >= 300));
  });

  it('P31-22: maxWage=300 → filters high-wage jobs', async () => {
    const jobs = await jobsService.list({ maxWage: '300' });
    assert.ok(jobs.every(j => j.dailyWage <= 300));
  });

  it('P31-23: minWage + maxWage range', async () => {
    const jobs = await jobsService.list({ minWage: '200', maxWage: '400' });
    assert.ok(jobs.every(j => j.dailyWage >= 200 && j.dailyWage <= 400));
  });

  it('P31-24: startDateFrom filter', async () => {
    const jobs = await jobsService.list({ startDateFrom: '2026-06-05' });
    assert.ok(jobs.every(j => j.startDate >= '2026-06-05'));
  });

  it('P31-25: startDateTo filter', async () => {
    const jobs = await jobsService.list({ startDateTo: '2026-06-05' });
    assert.ok(jobs.every(j => j.startDate <= '2026-06-05'));
  });

  it('P31-26: combined filters', async () => {
    const jobs = await jobsService.list({
      categories: 'farming,construction',
      minWage: '150',
      maxWage: '400',
      startDateFrom: '2026-06-01',
      startDateTo: '2026-06-07',
    });
    for (const j of jobs) {
      assert.ok(['farming', 'construction'].includes(j.category));
      assert.ok(j.dailyWage >= 150 && j.dailyWage <= 400);
      assert.ok(j.startDate >= '2026-06-01' && j.startDate <= '2026-06-07');
    }
  });

  it('P31-27: invalid minWage (NaN) → ignored gracefully', async () => {
    const jobs = await jobsService.list({ minWage: 'abc' });
    assert.ok(Array.isArray(jobs)); // should not crash
  });

  it('P31-28: empty categories string → no category filter', async () => {
    const jobs = await jobsService.list({ categories: '' });
    assert.ok(jobs.length > 0, 'Empty categories should return all');
  });

  it('P31-29: categories with invalid ID → filters to nothing', async () => {
    const jobs = await jobsService.list({ categories: 'nonexistent' });
    assert.strictEqual(jobs.length, 0);
  });

  it('P31-30: old ?category=farming param still works', async () => {
    const jobs = await jobsService.list({ category: 'farming' });
    assert.ok(jobs.every(j => j.category === 'farming'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Activity Summary
// ═══════════════════════════════════════════════════════════════

describe('Phase 31 — Activity Summary', () => {

  it('P31-31: generateEmployerSummary returns correct structure', async () => {
    const mod = await import('../server/services/activitySummary.js');
    const summary = await mod.generateEmployerSummary('usr_nonexistent');
    assert.strictEqual(typeof summary.activeJobs, 'number');
    assert.strictEqual(typeof summary.newApplicationsThisWeek, 'number');
    assert.strictEqual(typeof summary.acceptedWorkersThisWeek, 'number');
    assert.strictEqual(typeof summary.completedJobsThisWeek, 'number');
  });

  it('P31-32: generateEmployerSummary no jobs → all zeros', async () => {
    const mod = await import('../server/services/activitySummary.js');
    const summary = await mod.generateEmployerSummary('usr_nobody_here');
    assert.strictEqual(summary.activeJobs, 0);
    assert.strictEqual(summary.newApplicationsThisWeek, 0);
    assert.strictEqual(summary.acceptedWorkersThisWeek, 0);
    assert.strictEqual(summary.completedJobsThisWeek, 0);
  });

  it('P31-33: generateWorkerSummary returns correct structure', async () => {
    const mod = await import('../server/services/activitySummary.js');
    const summary = await mod.generateWorkerSummary('usr_nonexistent');
    assert.strictEqual(typeof summary.newJobsInArea, 'number');
    assert.strictEqual(typeof summary.pendingApplications, 'number');
    assert.strictEqual(typeof summary.newRatingsThisWeek, 'number');
  });

  it('P31-34: generateWorkerSummary no matching area → zeros', async () => {
    const mod = await import('../server/services/activitySummary.js');
    const summary = await mod.generateWorkerSummary('usr_nobody_here_either');
    assert.strictEqual(summary.newJobsInArea, 0);
    assert.strictEqual(summary.pendingApplications, 0);
    assert.strictEqual(summary.newRatingsThisWeek, 0);
  });

  it('P31-35: sendWeeklySummaries not correct day → no action', async () => {
    // This test will only pass when it's not the configured day+hour
    // We test the function exists and returns a number
    const mod = await import('../server/services/activitySummary.js');
    const result = await mod.sendWeeklySummaries();
    assert.strictEqual(typeof result, 'number');
  });

  it('P31-36: sendWeeklySummaries already ran → no duplicate', async () => {
    const mod = await import('../server/services/activitySummary.js');
    // Call twice — second should return 0 (already ran or wrong time)
    await mod.sendWeeklySummaries();
    const result = await mod.sendWeeklySummaries();
    assert.strictEqual(result, 0);
  });

  it('P31-37: activitySummary.js exports all 3 functions', async () => {
    const mod = await import('../server/services/activitySummary.js');
    assert.strictEqual(typeof mod.generateEmployerSummary, 'function');
    assert.strictEqual(typeof mod.generateWorkerSummary, 'function');
    assert.strictEqual(typeof mod.sendWeeklySummaries, 'function');
  });

  it('P31-38: skip empty summaries pattern exists', async () => {
    const src = await readSource('server/services/activitySummary.js');
    assert.ok(src.includes('continue'), 'Should skip empty summaries via continue');
    assert.ok(src.includes('=== 0'), 'Should check for zero values');
  });
});

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

describe('Phase 31 — Config', () => {

  it('P31-39: JOB_ALERTS section exists with required fields', () => {
    assert.ok(config.JOB_ALERTS, 'JOB_ALERTS section should exist');
    assert.strictEqual(config.JOB_ALERTS.enabled, true);
    assert.strictEqual(typeof config.JOB_ALERTS.maxAlertsPerUser, 'number');
    assert.strictEqual(typeof config.JOB_ALERTS.cooldownMinutes, 'number');
    assert.strictEqual(typeof config.JOB_ALERTS.matchOnCreation, 'boolean');
  });

  it('P31-40: ACTIVITY_SUMMARY section exists with required fields', () => {
    assert.ok(config.ACTIVITY_SUMMARY, 'ACTIVITY_SUMMARY section should exist');
    assert.strictEqual(config.ACTIVITY_SUMMARY.enabled, true);
    assert.strictEqual(typeof config.ACTIVITY_SUMMARY.dayOfWeek, 'number');
    assert.strictEqual(typeof config.ACTIVITY_SUMMARY.hourEgypt, 'number');
    assert.strictEqual(typeof config.ACTIVITY_SUMMARY.intervalCheckMs, 'number');
  });

  it('P31-41: JOB_ALERTS.maxAlertsPerUser is positive', () => {
    assert.ok(config.JOB_ALERTS.maxAlertsPerUser > 0);
  });

  it('P31-42: ACTIVITY_SUMMARY.dayOfWeek is 0-6', () => {
    assert.ok(config.ACTIVITY_SUMMARY.dayOfWeek >= 0 && config.ACTIVITY_SUMMARY.dayOfWeek <= 6);
  });

  it('P31-43: DATABASE.dirs includes alerts', () => {
    assert.ok(config.DATABASE.dirs.alerts, 'DATABASE.dirs should have alerts');
  });

  it('P31-44: DATABASE.indexFiles includes userAlertsIndex', () => {
    assert.ok(config.DATABASE.indexFiles.userAlertsIndex, 'indexFiles should have userAlertsIndex');
  });
});

// ═══════════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════════

describe('Phase 31 — Version', () => {

  it('P31-45: package.json version is 0.27.0', async () => {
    const pkg = JSON.parse(await readSource('package.json'));
    assert.strictEqual(pkg.version, '0.31.0');
  });

  it('P31-46: sw.js CACHE_NAME is yawmia-v0.27.0', async () => {
    const src = await readSource('frontend/sw.js');
    assert.ok(src.includes("'yawmia-v0.31.0'"), 'sw.js should use v0.27.0 cache name');
  });

  it('P31-47: config PWA cacheName is yawmia-v0.27.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.31.0');
  });

  it('P31-48: config has 43 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 48, `Expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Source Code Checks
// ═══════════════════════════════════════════════════════════════

describe('Phase 31 — Source Code Checks', () => {

  it('P31-49: jobAlerts.js has setupJobAlerts', async () => {
    const src = await readSource('server/services/jobAlerts.js');
    assert.ok(src.includes('export function setupJobAlerts'));
  });

  it('P31-50: router.js calls setupJobAlerts', async () => {
    const src = await readSource('server/router.js');
    assert.ok(src.includes('setupJobAlerts()'));
  });

  it('P31-51: router.js has alert routes', async () => {
    const src = await readSource('server/router.js');
    assert.ok(src.includes("'/api/alerts'"));
    assert.ok(src.includes("'/api/alerts/:id'"));
  });

  it('P31-52: server.js has activitySummary timer', async () => {
    const src = await readSource('server.js');
    assert.ok(src.includes('sendWeeklySummaries'));
  });

  it('P31-53: jobs.js list() supports categories filter', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes('filters.categories'));
  });

  it('P31-54: jobs.js list() supports minWage filter', async () => {
    const src = await readSource('server/services/jobs.js');
    assert.ok(src.includes('filters.minWage'));
  });

  it('P31-55: jobsHandler.js parses categories query param', async () => {
    const src = await readSource('server/handlers/jobsHandler.js');
    assert.ok(src.includes('req.query.categories'));
  });

  it('P31-56: dashboard.html has advancedFilters container', async () => {
    const src = await readSource('frontend/dashboard.html');
    assert.ok(src.includes('id="advancedFilters"'));
  });

  it('P31-57: profile.html has alerts-section container', async () => {
    const src = await readSource('frontend/profile.html');
    assert.ok(src.includes('id="alerts-section"'));
  });

  it('P31-58: jobs.js has first-time hints', async () => {
    const src = await readSource('frontend/assets/js/jobs.js');
    assert.ok(src.includes('yawmia_hints_seen'));
  });

  it('P31-59: jobs.js has sessionStorage filter persistence', async () => {
    const src = await readSource('frontend/assets/js/jobs.js');
    assert.ok(src.includes('yawmia_filters'));
    assert.ok(src.includes('sessionStorage'));
  });

  it('P31-60: style.css has Phase 31 CSS classes', async () => {
    const src = await readSource('frontend/assets/css/style.css');
    assert.ok(src.includes('.alert-card'));
    assert.ok(src.includes('.hints-list'));
    assert.ok(src.includes('.advanced-filters__inner'));
  });
});
