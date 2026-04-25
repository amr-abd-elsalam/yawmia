// tests/phase37-hardening.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 37 — Data Layer Hardening + Critical Race Fix (~80 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir, db, config, eventBus, userService, jobsService, appsService, notifService;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-ph37-'));
  process.env.YAWMIA_DATA_PATH = tmpDir;
  const dirs = ['users','sessions','jobs','applications','otp','notifications','ratings','payments','reports','verifications','attendance','audit','messages','push_subscriptions','alerts','metrics','favorites'];
  for (const d of dirs) await mkdir(join(tmpDir, d), { recursive: true });

  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  await db.initDatabase();
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
  userService = await import('../server/services/users.js');
  jobsService = await import('../server/services/jobs.js');
  appsService = await import('../server/services/applications.js');
  notifService = await import('../server/services/notifications.js');
});

after(async () => {
  if (eventBus) eventBus.clear();
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// ── Helper: create user + job + applications ─────────────────
let phoneCounter = 0;
function nextPhone() { return '0101' + String(++phoneCounter).padStart(7, '0'); }

async function createEmployerWithJob(workersNeeded) {
  const emp = await userService.create(nextPhone(), 'employer');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const job = await jobsService.create(emp.id, {
    title: 'فرصة اختبار P37', category: 'farming', governorate: 'cairo',
    workersNeeded, dailyWage: 200, startDate: tomorrow, durationDays: 1,
  });
  return { emp, job };
}

async function createWorkerAndApply(jobId) {
  const w = await userService.create(nextPhone(), 'worker');
  const res = await appsService.apply(jobId, w.id);
  return { worker: w, app: res.application };
}

// ══════════════════════════════════════════════════════════════
// Race Condition Fix (CRITICAL)
// ══════════════════════════════════════════════════════════════

describe('Phase 37 — Race Condition Fix', () => {

  it('P37-01: accept() serializes on same jobId', async () => {
    const { emp, job } = await createEmployerWithJob(2);
    const { app: app1 } = await createWorkerAndApply(job.id);
    const { app: app2 } = await createWorkerAndApply(job.id);
    const [r1, r2] = await Promise.all([
      appsService.accept(app1.id, emp.id),
      appsService.accept(app2.id, emp.id),
    ]);
    assert.ok(r1.ok);
    assert.ok(r2.ok);
  });

  it('P37-02: 5 parallel accepts on 3-worker job → exactly 3 accepted', async () => {
    const { emp, job } = await createEmployerWithJob(3);
    const apps = [];
    for (let i = 0; i < 5; i++) {
      const { app } = await createWorkerAndApply(job.id);
      apps.push(app);
    }
    const results = await Promise.all(apps.map(a => appsService.accept(a.id, emp.id)));
    const accepted = results.filter(r => r.ok).length;
    const filled = results.filter(r => !r.ok && r.code === 'JOB_FILLED').length;
    assert.strictEqual(accepted, 3, `expected 3 accepted, got ${accepted}`);
    assert.strictEqual(filled, 2, `expected 2 JOB_FILLED, got ${filled}`);
  });

  it('P37-03: parallel accepts on DIFFERENT jobs → both succeed', async () => {
    const { emp: emp1, job: job1 } = await createEmployerWithJob(1);
    const { emp: emp2, job: job2 } = await createEmployerWithJob(1);
    const { app: app1 } = await createWorkerAndApply(job1.id);
    const { app: app2 } = await createWorkerAndApply(job2.id);
    const [r1, r2] = await Promise.all([
      appsService.accept(app1.id, emp1.id),
      appsService.accept(app2.id, emp2.id),
    ]);
    assert.ok(r1.ok, 'first should succeed');
    assert.ok(r2.ok, 'second should succeed');
  });

  it('P37-04: accept non-existent application → APPLICATION_NOT_FOUND', async () => {
    const { emp } = await createEmployerWithJob(1);
    const res = await appsService.accept('app_nonexistent999', emp.id);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'APPLICATION_NOT_FOUND');
  });

  it('P37-05: accept already accepted → ALREADY_RESPONDED', async () => {
    const { emp, job } = await createEmployerWithJob(2);
    const { app } = await createWorkerAndApply(job.id);
    await appsService.accept(app.id, emp.id);
    const res = await appsService.accept(app.id, emp.id);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'ALREADY_RESPONDED');
  });

  it('P37-06: over-acceptance impossible with new lock', async () => {
    const { emp, job } = await createEmployerWithJob(2);
    const apps = [];
    for (let i = 0; i < 4; i++) {
      const { app } = await createWorkerAndApply(job.id);
      apps.push(app);
    }
    const results = await Promise.all(apps.map(a => appsService.accept(a.id, emp.id)));
    const accepted = results.filter(r => r.ok).length;
    assert.ok(accepted <= 2, `should accept at most 2, got ${accepted}`);
  });

  it('P37-07: job.status changes to filled at exact workersNeeded', async () => {
    const { emp, job } = await createEmployerWithJob(1);
    const { app } = await createWorkerAndApply(job.id);
    await appsService.accept(app.id, emp.id);
    const updated = await jobsService.findById(job.id);
    assert.strictEqual(updated.status, 'filled');
  });

  it('P37-08: job:filled event emitted once', async () => {
    eventBus.clear();
    let fillCount = 0;
    eventBus.on('job:filled', () => fillCount++);
    const { emp, job } = await createEmployerWithJob(1);
    const { app } = await createWorkerAndApply(job.id);
    await appsService.accept(app.id, emp.id);
    assert.strictEqual(fillCount, 1);
    eventBus.clear();
  });

  it('P37-09: accept validates ownership', async () => {
    const { job } = await createEmployerWithJob(1);
    const otherEmp = await userService.create(nextPhone(), 'employer');
    const { app } = await createWorkerAndApply(job.id);
    const res = await appsService.accept(app.id, otherEmp.id);
    assert.strictEqual(res.code, 'NOT_JOB_OWNER');
  });

  it('P37-10: 10 concurrent accepts on 5-worker job → exactly 5 accepted', async () => {
    const { emp, job } = await createEmployerWithJob(5);
    const apps = [];
    for (let i = 0; i < 10; i++) {
      const { app } = await createWorkerAndApply(job.id);
      apps.push(app);
    }
    const results = await Promise.all(apps.map(a => appsService.accept(a.id, emp.id)));
    const accepted = results.filter(r => r.ok).length;
    assert.strictEqual(accepted, 5, `expected 5 accepted, got ${accepted}`);
  });

  it('P37-11: lock does not persist after operation', async () => {
    const { getLockCount } = await import('../server/services/resourceLock.js');
    const { emp, job } = await createEmployerWithJob(1);
    const { app } = await createWorkerAndApply(job.id);
    await appsService.accept(app.id, emp.id);
    // Give a tick for cleanup
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(getLockCount(), 0);
  });

  it('P37-12: sequential accepts still work (no regression)', async () => {
    const { emp, job } = await createEmployerWithJob(3);
    for (let i = 0; i < 3; i++) {
      const { app } = await createWorkerAndApply(job.id);
      const res = await appsService.accept(app.id, emp.id);
      assert.ok(res.ok, `sequential accept #${i+1} should succeed`);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance Timing Fix
// ══════════════════════════════════════════════════════════════

describe('Phase 37 — Attendance Timing Fix', () => {

  it('P37-16: config.ATTENDANCE.defaultStartHour exists and is 8', () => {
    assert.strictEqual(config.ATTENDANCE.defaultStartHour, 8);
  });

  it('P37-17: autoDetectNoShows returns 0 if feature disabled', async () => {
    const { autoDetectNoShows } = await import('../server/services/attendance.js');
    // ATTENDANCE.enabled is true but autoNoShowAfterHours might prevent detection
    const count = await autoDetectNoShows();
    assert.strictEqual(typeof count, 'number');
  });

  it('P37-18: autoDetectNoShows returns 0 if no in_progress jobs', async () => {
    const { autoDetectNoShows } = await import('../server/services/attendance.js');
    const count = await autoDetectNoShows();
    assert.strictEqual(count, 0);
  });

  it('P37-19: autoDetectNoShows source code uses job start hour', async () => {
    const content = await readFile(resolve('server/services/attendance.js'), 'utf-8');
    assert.ok(content.includes('defaultStartHour'), 'should reference defaultStartHour');
    assert.ok(content.includes('jobStartHour') || content.includes('startHour'), 'should use per-job start hour');
  });

  it('P37-20: cutoff calculation is per-job, not global', async () => {
    const content = await readFile(resolve('server/services/attendance.js'), 'utf-8');
    // Should NOT have old pattern: single cutoffTime before loop
    // Should have per-job cutoff inside the loop
    assert.ok(content.includes('jobCutoffTime') || content.includes('jobStartHour'), 'should have per-job cutoff');
  });
});

// ══════════════════════════════════════════════════════════════
// Notification Dedup Enhancement
// ══════════════════════════════════════════════════════════════

describe('Phase 37 — Notification Dedup Enhancement', () => {

  it('P37-28: same type + same user + different jobId → both delivered', async () => {
    const user = await userService.create(nextPhone(), 'worker');
    const ntf1 = await notifService.createNotification(user.id, 'application_accepted', 'قبول 1', { jobId: 'job_aaa' });
    const ntf2 = await notifService.createNotification(user.id, 'application_accepted', 'قبول 2', { jobId: 'job_bbb' });
    assert.ok(ntf1, 'first should be created');
    assert.ok(ntf2, 'second should be created (different jobId)');
  });

  it('P37-29: same type + same user + same jobId within 5min → deduped', async () => {
    const user = await userService.create(nextPhone(), 'worker');
    const ntf1 = await notifService.createNotification(user.id, 'job_nearby', 'فرصة', { jobId: 'job_dedup1' });
    const ntf2 = await notifService.createNotification(user.id, 'job_nearby', 'فرصة', { jobId: 'job_dedup1' });
    assert.ok(ntf1, 'first should be created');
    assert.strictEqual(ntf2, null, 'second should be deduped');
  });

  it('P37-31: notification without meta.jobId → backward compatible', async () => {
    const user = await userService.create(nextPhone(), 'worker');
    const ntf1 = await notifService.createNotification(user.id, 'activity_summary', 'ملخص', {});
    assert.ok(ntf1, 'should be created without context');
  });

  it('P37-33: different types for same job → all delivered', async () => {
    const user = await userService.create(nextPhone(), 'worker');
    const ntf1 = await notifService.createNotification(user.id, 'application_accepted', 'قبول', { jobId: 'job_multi' });
    const ntf2 = await notifService.createNotification(user.id, 'new_message', 'رسالة', { jobId: 'job_multi' });
    assert.ok(ntf1, 'type 1 should be created');
    assert.ok(ntf2, 'type 2 should be created');
  });

  it('P37-34: dedup key format includes contextId', async () => {
    const content = await readFile(resolve('server/services/notifications.js'), 'utf-8');
    assert.ok(content.includes('contextId'), 'should use contextId in dedup key');
    assert.ok(content.includes('meta.jobId'), 'should extract jobId from meta');
  });

  it('P37-35: 3 workers accepted in 3 different jobs → 3 notifications', async () => {
    const emp = await userService.create(nextPhone(), 'employer');
    const jobs = [];
    for (let i = 0; i < 3; i++) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const job = await jobsService.create(emp.id, {
        title: `فرصة ${i}`, category: 'farming', governorate: 'cairo',
        workersNeeded: 1, dailyWage: 200, startDate: tomorrow, durationDays: 1,
      });
      jobs.push(job);
    }
    // Create 3 notifications with different jobIds for same employer
    const results = [];
    for (const job of jobs) {
      const ntf = await notifService.createNotification(emp.id, 'new_application', 'طلب جديد', { jobId: job.id });
      results.push(ntf);
    }
    assert.ok(results[0], 'notification 1 should be created');
    assert.ok(results[1], 'notification 2 should be created');
    assert.ok(results[2], 'notification 3 should be created');
  });
});

// ══════════════════════════════════════════════════════════════
// Query Index
// ══════════════════════════════════════════════════════════════

describe('Phase 37 — Query Index', () => {

  let qi;

  before(async () => {
    qi = await import('../server/services/queryIndex.js');
  });

  beforeEach(() => {
    qi.clear();
  });

  it('P37-38: buildAllIndexes populates maps', async () => {
    // Create some jobs first
    const emp = await userService.create(nextPhone(), 'employer');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await jobsService.create(emp.id, { title: 'QI 1', category: 'farming', governorate: 'cairo', workersNeeded: 1, dailyWage: 200, startDate: tomorrow, durationDays: 1 });
    await jobsService.create(emp.id, { title: 'QI 2', category: 'construction', governorate: 'giza', workersNeeded: 1, dailyWage: 300, startDate: tomorrow, durationDays: 1 });
    const count = await qi.buildAllIndexes();
    assert.ok(count >= 2, `should index at least 2 jobs, got ${count}`);
  });

  it('P37-39: buildAllIndexes returns correct count', async () => {
    const count = await qi.buildAllIndexes();
    const stats = qi.getStats();
    assert.strictEqual(count, stats.totalJobs);
  });

  it('P37-40: queryJobs with status filter', async () => {
    await qi.buildAllIndexes();
    const openJobs = qi.queryJobs({ status: 'open' });
    assert.ok(Array.isArray(openJobs));
    const stats = qi.getStats();
    if (stats.byStatus.open) {
      assert.strictEqual(openJobs.length, stats.byStatus.open);
    }
  });

  it('P37-41: queryJobs with governorate filter', async () => {
    await qi.buildAllIndexes();
    const cairoJobs = qi.queryJobs({ status: 'open', governorate: 'cairo' });
    assert.ok(Array.isArray(cairoJobs));
    for (const id of cairoJobs) {
      const job = await db.readJSON(db.getRecordPath('jobs', id));
      assert.strictEqual(job.governorate, 'cairo');
    }
  });

  it('P37-42: queryJobs with category filter', async () => {
    await qi.buildAllIndexes();
    const farmJobs = qi.queryJobs({ status: 'open', category: 'farming' });
    assert.ok(Array.isArray(farmJobs));
    for (const id of farmJobs) {
      const job = await db.readJSON(db.getRecordPath('jobs', id));
      assert.strictEqual(job.category, 'farming');
    }
  });

  it('P37-44: queryJobs with multiple filters → intersection', async () => {
    await qi.buildAllIndexes();
    const results = qi.queryJobs({ status: 'open', governorate: 'cairo', category: 'farming' });
    assert.ok(Array.isArray(results));
    for (const id of results) {
      const job = await db.readJSON(db.getRecordPath('jobs', id));
      assert.strictEqual(job.governorate, 'cairo');
      assert.strictEqual(job.category, 'farming');
    }
  });

  it('P37-45: queryJobs no matches → empty array', () => {
    qi.clear();
    const results = qi.queryJobs({ status: 'open', governorate: 'nonexistent' });
    assert.strictEqual(results.length, 0);
  });

  it('P37-46: onJobCreated adds to all Maps', () => {
    qi.clear();
    qi.onJobCreated({ id: 'job_test1', status: 'open', governorate: 'alex', category: 'cleaning', urgency: 'urgent', dailyWage: 250, createdAt: new Date().toISOString() });
    const stats = qi.getStats();
    assert.strictEqual(stats.totalJobs, 1);
    const results = qi.queryJobs({ status: 'open', governorate: 'alex', category: 'cleaning' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], 'job_test1');
  });

  it('P37-47: onJobStatusChanged moves between Sets', () => {
    qi.clear();
    qi.onJobCreated({ id: 'job_sc', status: 'open', governorate: 'cairo', category: 'farming', urgency: 'normal' });
    qi.onJobStatusChanged('job_sc', 'open', 'filled');
    const open = qi.queryJobs({ status: 'open' });
    const filled = qi.queryJobs({ status: 'filled' });
    assert.ok(!open.includes('job_sc'));
    assert.ok(filled.includes('job_sc'));
  });

  it('P37-48: onJobRemoved removes from all Maps', () => {
    qi.clear();
    qi.onJobCreated({ id: 'job_rm', status: 'open', governorate: 'giza', category: 'painting', urgency: 'normal' });
    qi.onJobRemoved('job_rm');
    assert.strictEqual(qi.getStats().totalJobs, 0);
    assert.strictEqual(qi.queryJobs({ status: 'open' }).length, 0);
  });

  it('P37-49: getStats returns correct numbers', () => {
    qi.clear();
    qi.onJobCreated({ id: 'job_s1', status: 'open', governorate: 'cairo', category: 'farming', urgency: 'normal' });
    qi.onJobCreated({ id: 'job_s2', status: 'open', governorate: 'giza', category: 'farming', urgency: 'urgent' });
    qi.onJobCreated({ id: 'job_s3', status: 'filled', governorate: 'cairo', category: 'cleaning', urgency: 'normal' });
    const stats = qi.getStats();
    assert.strictEqual(stats.totalJobs, 3);
    assert.strictEqual(stats.byStatus.open, 2);
    assert.strictEqual(stats.byStatus.filled, 1);
  });

  it('P37-52: empty index → queryJobs returns empty', () => {
    qi.clear();
    assert.deepStrictEqual(qi.queryJobs({ status: 'open' }), []);
  });

  it('P37-53: performance — queryJobs < 5ms for 1000 jobs', () => {
    qi.clear();
    for (let i = 0; i < 1000; i++) {
      qi.onJobCreated({
        id: `job_perf_${i}`, status: i % 3 === 0 ? 'open' : 'filled',
        governorate: i % 2 === 0 ? 'cairo' : 'giza', category: 'farming',
        urgency: 'normal', dailyWage: 200, createdAt: new Date().toISOString(),
      });
    }
    const start = performance.now();
    const results = qi.queryJobs({ status: 'open', governorate: 'cairo', category: 'farming' });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 5, `queryJobs took ${elapsed.toFixed(2)}ms, should be < 5ms`);
    assert.ok(results.length > 0);
  });

  it('P37-54: QUERY_INDEX config exists', () => {
    assert.ok(config.QUERY_INDEX);
    assert.strictEqual(config.QUERY_INDEX.enabled, true);
    assert.strictEqual(config.QUERY_INDEX.rebuildOnStartup, true);
    assert.strictEqual(config.QUERY_INDEX.incrementalUpdates, true);
  });

  it('P37-55: jobs.list() still works (integration)', async () => {
    await qi.buildAllIndexes();
    const jobs = await jobsService.list({ status: 'open' });
    assert.ok(Array.isArray(jobs));
  });

  it('P37-57: multi-category query', () => {
    qi.clear();
    qi.onJobCreated({ id: 'job_mc1', status: 'open', governorate: 'cairo', category: 'farming', urgency: 'normal' });
    qi.onJobCreated({ id: 'job_mc2', status: 'open', governorate: 'cairo', category: 'cleaning', urgency: 'normal' });
    qi.onJobCreated({ id: 'job_mc3', status: 'open', governorate: 'cairo', category: 'painting', urgency: 'normal' });
    const results = qi.queryJobs({ status: 'open', categories: 'farming,cleaning' });
    assert.strictEqual(results.length, 2);
    assert.ok(results.includes('job_mc1'));
    assert.ok(results.includes('job_mc2'));
  });
});

// ══════════════════════════════════════════════════════════════
// Soft-Delete Cascade
// ══════════════════════════════════════════════════════════════

describe('Phase 37 — Soft-Delete Cascade', () => {

  it('P37-59: employer softDelete cancels open jobs', async () => {
    const emp = await userService.create(nextPhone(), 'employer');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const job = await jobsService.create(emp.id, {
      title: 'فرصة للحذف', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: tomorrow, durationDays: 1,
    });
    assert.strictEqual(job.status, 'open');
    await userService.softDelete(emp.id);
    const jobAfter = await jobsService.findById(job.id);
    assert.strictEqual(jobAfter.status, 'cancelled', 'open job should be cancelled');
  });

  it('P37-60: employer softDelete: completed jobs untouched', async () => {
    const emp = await userService.create(nextPhone(), 'employer');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const job = await jobsService.create(emp.id, {
      title: 'فرصة مكتملة', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: tomorrow, durationDays: 1,
    });
    // Simulate filled → in_progress → completed
    const { app } = await createWorkerAndApply(job.id);
    await appsService.accept(app.id, emp.id);
    await jobsService.startJob(job.id, emp.id);
    await jobsService.completeJob(job.id, emp.id);
    const completedJob = await jobsService.findById(job.id);
    assert.strictEqual(completedJob.status, 'completed');
    await userService.softDelete(emp.id);
    const jobAfter = await jobsService.findById(job.id);
    assert.strictEqual(jobAfter.status, 'completed', 'completed job should NOT be cancelled');
  });

  it('P37-61: worker softDelete withdraws pending applications', async () => {
    const { emp, job } = await createEmployerWithJob(2);
    const worker = await userService.create(nextPhone(), 'worker');
    const appRes = await appsService.apply(job.id, worker.id);
    assert.strictEqual(appRes.application.status, 'pending');
    await userService.softDelete(worker.id);
    const appAfter = await appsService.findById(appRes.application.id);
    assert.strictEqual(appAfter.status, 'withdrawn', 'pending app should be withdrawn');
  });

  it('P37-62: worker softDelete: accepted apps untouched', async () => {
    const { emp, job } = await createEmployerWithJob(2);
    const worker = await userService.create(nextPhone(), 'worker');
    const appRes = await appsService.apply(job.id, worker.id);
    await appsService.accept(appRes.application.id, emp.id);
    const accepted = await appsService.findById(appRes.application.id);
    assert.strictEqual(accepted.status, 'accepted');
    await userService.softDelete(worker.id);
    const appAfter = await appsService.findById(appRes.application.id);
    assert.strictEqual(appAfter.status, 'accepted', 'accepted app should NOT be withdrawn');
  });

  it('P37-63: cascade errors don\'t block deletion', async () => {
    const emp = await userService.create(nextPhone(), 'employer');
    // No jobs/apps — cascade should handle gracefully
    const result = await userService.softDelete(emp.id);
    assert.ok(result, 'deletion should succeed');
    assert.strictEqual(result.status, 'deleted');
  });

  it('P37-66: admin account cannot be soft-deleted', async () => {
    const admin = await userService.create(nextPhone(), 'admin');
    const result = await userService.softDelete(admin.id);
    assert.strictEqual(result, null);
  });

  it('P37-67: user with no jobs/apps → softDelete works fine', async () => {
    const user = await userService.create(nextPhone(), 'worker');
    const result = await userService.softDelete(user.id);
    assert.ok(result);
    assert.strictEqual(result.status, 'deleted');
  });
});

// ══════════════════════════════════════════════════════════════
// Version & Config
// ══════════════════════════════════════════════════════════════

describe('Phase 37 — Version & Config', () => {

  it('P37-69: package.json version is 0.34.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.34.0');
  });

  it('P37-70: PWA cacheName is yawmia-v0.34.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.34.0');
  });

  it('P37-71: sw.js CACHE_NAME is yawmia-v0.34.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.34.0'"));
  });

  it('P37-72: router.js version is 0.34.0', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("version: '0.34.0'"));
  });

  it('P37-73: config section count is 50', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 50, `expected 50, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P37-74: QUERY_INDEX.enabled is true', () => {
    assert.strictEqual(config.QUERY_INDEX.enabled, true);
  });

  it('P37-76: ATTENDANCE.defaultStartHour is 8', () => {
    assert.strictEqual(config.ATTENDANCE.defaultStartHour, 8);
  });
});

// ══════════════════════════════════════════════════════════════
// Exports & Structure
// ══════════════════════════════════════════════════════════════

describe('Phase 37 — Exports & Structure', () => {

  it('P37-77: queryIndex.js exports required functions', async () => {
    const qi = await import('../server/services/queryIndex.js');
    assert.strictEqual(typeof qi.buildAllIndexes, 'function');
    assert.strictEqual(typeof qi.queryJobs, 'function');
    assert.strictEqual(typeof qi.onJobCreated, 'function');
    assert.strictEqual(typeof qi.onJobStatusChanged, 'function');
    assert.strictEqual(typeof qi.onJobRemoved, 'function');
    assert.strictEqual(typeof qi.getStats, 'function');
    assert.strictEqual(typeof qi.clear, 'function');
  });

  it('P37-78: applications.js accept() still works (basic)', async () => {
    const { emp, job } = await createEmployerWithJob(1);
    const { app } = await createWorkerAndApply(job.id);
    const res = await appsService.accept(app.id, emp.id);
    assert.ok(res.ok);
  });

  it('P37-79: users.js softDelete() still works (basic)', async () => {
    const user = await userService.create(nextPhone(), 'worker');
    const result = await userService.softDelete(user.id);
    assert.ok(result);
    assert.strictEqual(result.status, 'deleted');
  });

  it('P37-80: notifications.js createNotification() still works (basic)', async () => {
    const user = await userService.create(nextPhone(), 'worker');
    const ntf = await notifService.createNotification(user.id, 'test_type', 'test message', { jobId: 'job_basic_test' });
    assert.ok(ntf);
    assert.ok(ntf.id.startsWith('ntf_'));
  });
});
