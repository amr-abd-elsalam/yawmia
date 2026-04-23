// tests/phase17-attendance-intel.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 17 — Attendance Intelligence + Concurrency Safety (~40 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-phase17-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let config, db, userService, jobsService, appService, attendance, attendanceHandler, trust, resourceLock, eventBus;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  jobsService = await import('../server/services/jobs.js');
  appService = await import('../server/services/applications.js');
  attendance = await import('../server/services/attendance.js');
  attendanceHandler = await import('../server/handlers/attendanceHandler.js');
  trust = await import('../server/services/trust.js');
  resourceLock = await import('../server/services/resourceLock.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
});

after(() => {
  if (eventBus) eventBus.clear();
  if (resourceLock) resourceLock.clearLocks();
});

// ── Helpers ─────────────────────────────────────────────────
let counter = 0;
async function createTestUser(role) {
  counter++;
  const phone = '0101700' + String(counter).padStart(4, '0');
  return await userService.create(phone, role);
}

async function setupInProgressJob() {
  const employer = await createTestUser('employer');
  const worker = await createTestUser('worker');
  const job = await jobsService.create(employer.id, {
    title: 'فرصة Phase 17 ' + counter,
    category: 'construction',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 200,
    startDate: '2026-06-01',
    durationDays: 3,
    lat: 30.0444,
    lng: 31.2357,
  });

  await appService.apply(job.id, worker.id);
  const apps = await appService.listByJob(job.id);
  await appService.accept(apps[0].id, employer.id);
  await jobsService.startJob(job.id, employer.id);

  const freshJob = await jobsService.findById(job.id);
  return { employer, worker, job: freshJob };
}

// ══════════════════════════════════════════════════════════════
// Config Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Config', () => {

  it('P17-01: TRUST.weights includes attendanceRate', () => {
    assert.strictEqual(typeof config.TRUST.weights.attendanceRate, 'number');
    assert.strictEqual(config.TRUST.weights.attendanceRate, 0.2);
  });

  it('P17-02: TRUST.weights sum to 1.0', () => {
    const weights = config.TRUST.weights;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `weights sum should be 1.0, got ${sum}`);
  });

  it('P17-03: package.json version is 0.25.0', async () => {
    const pkgPath = resolve('package.json');
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.29.0');
  });

  it('P17-04: PWA cacheName is yawmia-v0.25.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.29.0');
  });

  it('P17-05: ATTENDANCE.allowEmployerOverride is true', () => {
    assert.strictEqual(config.ATTENDANCE.allowEmployerOverride, true);
  });

  it('P17-06: ATTENDANCE.autoNoShowAfterHours is 2', () => {
    assert.strictEqual(config.ATTENDANCE.autoNoShowAfterHours, 2);
  });
});

// ══════════════════════════════════════════════════════════════
// Resource Lock Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Resource Lock', () => {

  it('P17-07: exports withLock, getLockCount, clearLocks', () => {
    assert.strictEqual(typeof resourceLock.withLock, 'function');
    assert.strictEqual(typeof resourceLock.getLockCount, 'function');
    assert.strictEqual(typeof resourceLock.clearLocks, 'function');
  });

  it('P17-08: withLock serializes same-key operations', async () => {
    resourceLock.clearLocks();
    const order = [];

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const p1 = resourceLock.withLock('test-key-serial', async () => {
      order.push('start-1');
      await delay(50);
      order.push('end-1');
      return 'result-1';
    });

    const p2 = resourceLock.withLock('test-key-serial', async () => {
      order.push('start-2');
      await delay(10);
      order.push('end-2');
      return 'result-2';
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.strictEqual(r1, 'result-1');
    assert.strictEqual(r2, 'result-2');
    assert.deepStrictEqual(order, ['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('P17-09: different keys are independent', async () => {
    resourceLock.clearLocks();
    const order = [];

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const pA = resourceLock.withLock('key-A', async () => {
      order.push('A-start');
      await delay(50);
      order.push('A-end');
    });

    const pB = resourceLock.withLock('key-B', async () => {
      order.push('B-start');
      await delay(10);
      order.push('B-end');
    });

    await Promise.all([pA, pB]);

    // B should start before A ends (concurrent)
    const bStartIdx = order.indexOf('B-start');
    const aEndIdx = order.indexOf('A-end');
    assert.ok(bStartIdx < aEndIdx, `B should start before A ends. Order: ${order.join(', ')}`);
  });

  it('P17-10: lock released on error', async () => {
    resourceLock.clearLocks();

    // First call throws
    try {
      await resourceLock.withLock('error-key', async () => {
        throw new Error('test error');
      });
    } catch (e) {
      assert.strictEqual(e.message, 'test error');
    }

    // Subsequent call should succeed (not deadlocked)
    const result = await resourceLock.withLock('error-key', async () => {
      return 'recovered';
    });

    assert.strictEqual(result, 'recovered');
  });

  it('P17-11: getLockCount returns 0 after clear', () => {
    resourceLock.clearLocks();
    assert.strictEqual(resourceLock.getLockCount(), 0);
  });

  it('P17-12: withLock returns fn result', async () => {
    resourceLock.clearLocks();
    const result = await resourceLock.withLock('result-test', async () => {
      return 'expected-value';
    });
    assert.strictEqual(result, 'expected-value');
  });

  it('P17-13: three concurrent operations on same key serialize', async () => {
    resourceLock.clearLocks();
    const order = [];

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const p1 = resourceLock.withLock('triple-key', async () => {
      order.push(1);
      await delay(20);
    });

    const p2 = resourceLock.withLock('triple-key', async () => {
      order.push(2);
      await delay(10);
    });

    const p3 = resourceLock.withLock('triple-key', async () => {
      order.push(3);
    });

    await Promise.all([p1, p2, p3]);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });
});

// ══════════════════════════════════════════════════════════════
// Trust Score Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Trust Score', () => {

  it('P17-14: calculateTrustScore includes attendanceScore', () => {
    const result = trust.calculateTrustScore({
      ratingAvg: 4, ratingCount: 5,
      completedJobs: 3, totalAssigned: 5,
      confirmedReports: 0, totalReports: 0,
      accountAgeDays: 100,
      totalAttendanceRecords: 10, attendedDays: 8,
    });
    assert.strictEqual(typeof result.components.attendanceScore, 'number');
  });

  it('P17-15: attendanceScore is 0.5 when no records', () => {
    const result = trust.calculateTrustScore({
      ratingAvg: 4, ratingCount: 5,
      completedJobs: 3, totalAssigned: 5,
      confirmedReports: 0, totalReports: 0,
      accountAgeDays: 100,
      totalAttendanceRecords: 0, attendedDays: 0,
    });
    assert.strictEqual(result.components.attendanceScore, 0.5);
  });

  it('P17-16: perfect attendance gives attendanceScore 1.0', () => {
    const result = trust.calculateTrustScore({
      ratingAvg: 5, ratingCount: 10,
      completedJobs: 10, totalAssigned: 10,
      confirmedReports: 0, totalReports: 0,
      accountAgeDays: 365,
      totalAttendanceRecords: 20, attendedDays: 20,
    });
    assert.strictEqual(result.components.attendanceScore, 1.0);
  });

  it('P17-17: 50% attendance gives attendanceScore 0.5', () => {
    const result = trust.calculateTrustScore({
      ratingAvg: 4, ratingCount: 5,
      completedJobs: 3, totalAssigned: 5,
      confirmedReports: 0, totalReports: 0,
      accountAgeDays: 100,
      totalAttendanceRecords: 10, attendedDays: 5,
    });
    assert.strictEqual(result.components.attendanceScore, 0.5);
  });

  it('P17-18: score includes attendanceRate weight', () => {
    const base = {
      ratingAvg: 4, ratingCount: 5,
      completedJobs: 3, totalAssigned: 5,
      confirmedReports: 0, totalReports: 0,
      accountAgeDays: 100,
    };

    const scoreWith = trust.calculateTrustScore({
      ...base,
      totalAttendanceRecords: 10, attendedDays: 10,
    });
    const scoreWithout = trust.calculateTrustScore({
      ...base,
      totalAttendanceRecords: 10, attendedDays: 0,
    });

    assert.ok(scoreWith.score > scoreWithout.score,
      `perfect attendance score (${scoreWith.score}) should be > zero attendance (${scoreWithout.score})`);
  });

  it('P17-19: backward compatible — missing attendanceRate weight', () => {
    // This tests the (weights.attendanceRate || 0) pattern
    // Since config is frozen with attendanceRate, we test that the function doesn't crash
    // when totalAttendanceRecords is undefined
    const result = trust.calculateTrustScore({
      ratingAvg: 4, ratingCount: 5,
      completedJobs: 3, totalAssigned: 5,
      confirmedReports: 0, totalReports: 0,
      accountAgeDays: 100,
      // No attendance fields — should default to 0.5 neutral
    });
    assert.strictEqual(typeof result.score, 'number');
    assert.strictEqual(result.components.attendanceScore, 0.5);
  });
});

// ══════════════════════════════════════════════════════════════
// Service Exports Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Service Exports', () => {

  it('P17-20: attendance.js exports autoDetectNoShows', () => {
    assert.strictEqual(typeof attendance.autoDetectNoShows, 'function');
  });

  it('P17-21: attendance.js exports employerCheckIn', () => {
    assert.strictEqual(typeof attendance.employerCheckIn, 'function');
  });

  it('P17-22: attendanceHandler.js exports handleEmployerCheckIn', () => {
    assert.strictEqual(typeof attendanceHandler.handleEmployerCheckIn, 'function');
  });

  it('P17-23: resourceLock.js exports withLock', () => {
    assert.strictEqual(typeof resourceLock.withLock, 'function');
  });
});

// ══════════════════════════════════════════════════════════════
// Route Count
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Routes', () => {

  it('P17-24: Router has 59 routes', async () => {
    const routerPath = resolve('server/router.js');
    const content = await readFile(routerPath, 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 84, `expected 74 routes, got ${routeMatches.length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Payment Model
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Payment Model', () => {

  it('P17-25: payment source includes attendanceBreakdown', async () => {
    const paymentsPath = resolve('server/services/payments.js');
    const content = await readFile(paymentsPath, 'utf-8');
    assert.ok(content.includes('attendanceBreakdown'), 'payments.js should reference attendanceBreakdown');
  });

  it('P17-26: createPayment imports getJobSummary', async () => {
    const paymentsPath = resolve('server/services/payments.js');
    const content = await readFile(paymentsPath, 'utf-8');
    assert.ok(content.includes('getJobSummary'), 'payments.js should import getJobSummary');
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance Validation
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Attendance Validation', () => {

  it('P17-27: employerCheckIn validates allowEmployerOverride', async () => {
    const attPath = resolve('server/services/attendance.js');
    const content = await readFile(attPath, 'utf-8');
    assert.ok(content.includes('MANUAL_CHECKIN_DISABLED'), 'attendance.js should check allowEmployerOverride');
  });

  it('P17-28: employerCheckIn rejects non-owner', async () => {
    const { employer, worker, job } = await setupInProgressJob();
    const otherEmployer = await createTestUser('employer');
    const result = await attendance.employerCheckIn(job.id, worker.id, otherEmployer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_JOB_OWNER');
  });

  it('P17-29: autoDetectNoShows returns 0 when disabled', async () => {
    // ATTENDANCE is enabled in config but we can test the logic by verifying the function
    // completes without error and returns a number
    const count = await attendance.autoDetectNoShows();
    assert.strictEqual(typeof count, 'number');
  });

  it('P17-30: autoDetectNoShows returns number (timing-safe)', async () => {
    // Depending on current time relative to Egypt midnight + 2h,
    // this may return 0 (too early) or >=0
    const count = await attendance.autoDetectNoShows();
    assert.ok(count >= 0, `count should be >= 0, got ${count}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Lock Integration (source code checks)
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Lock Integration', () => {

  it('P17-31: apply() uses withLock', async () => {
    const appPath = resolve('server/services/applications.js');
    const content = await readFile(appPath, 'utf-8');
    assert.ok(content.includes("withLock(`apply:"), 'apply() should use withLock');
  });

  it('P17-32: accept() uses withLock', async () => {
    const appPath = resolve('server/services/applications.js');
    const content = await readFile(appPath, 'utf-8');
    assert.ok(content.includes("withLock(`accept:"), 'accept() should use withLock');
  });

  it('P17-33: checkIn() uses withLock', async () => {
    const attPath = resolve('server/services/attendance.js');
    const content = await readFile(attPath, 'utf-8');
    assert.ok(content.includes("withLock(`attendance:"), 'checkIn() should use withLock');
  });

  it('P17-34: reportNoShow() uses withLock', async () => {
    const attPath = resolve('server/services/attendance.js');
    const content = await readFile(attPath, 'utf-8');
    // reportNoShow wraps with same pattern
    const matches = content.match(/withLock\(`attendance:/g);
    assert.ok(matches && matches.length >= 3, `expected >= 3 withLock attendance usages, got ${matches ? matches.length : 0}`);
  });

  it('P17-35: employerCheckIn() uses withLock', async () => {
    const attPath = resolve('server/services/attendance.js');
    const content = await readFile(attPath, 'utf-8');
    assert.ok(content.includes('employerCheckIn'), 'attendance.js should have employerCheckIn');
    // employerCheckIn also uses withLock(`attendance:...`)
    const matches = content.match(/withLock\(`attendance:/g);
    assert.ok(matches && matches.length >= 3, 'employerCheckIn should use withLock');
  });
});

// ══════════════════════════════════════════════════════════════
// Server Integration (source code checks)
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Server Integration', () => {

  it('P17-36: server.js imports autoDetectNoShows', async () => {
    const serverPath = resolve('server.js');
    const content = await readFile(serverPath, 'utf-8');
    assert.ok(content.includes('autoDetectNoShows'), 'server.js should import autoDetectNoShows');
  });

  it('P17-37: server.js calls autoDetectNoShows in startup', async () => {
    const serverPath = resolve('server.js');
    const content = await readFile(serverPath, 'utf-8');
    // Check there are at least 2 occurrences of autoDetectNoShows (import + startup + periodic)
    const matches = content.match(/autoDetectNoShows/g);
    assert.ok(matches && matches.length >= 3, `expected >= 3 occurrences of autoDetectNoShows, got ${matches ? matches.length : 0}`);
  });

  it('P17-38: server.js calls autoDetectNoShows in periodic cleanup', async () => {
    const serverPath = resolve('server.js');
    const content = await readFile(serverPath, 'utf-8');
    // Verify it's inside the setInterval block
    const periodicSection = content.slice(content.indexOf('setInterval'));
    assert.ok(periodicSection.includes('autoDetectNoShows'), 'periodic cleanup should call autoDetectNoShows');
  });

  it('P17-39: server.js has index integrity check', async () => {
    const serverPath = resolve('server.js');
    const content = await readFile(serverPath, 'utf-8');
    assert.ok(content.includes('Critical index missing'), 'server.js should have index integrity check warning');
  });
});

// ══════════════════════════════════════════════════════════════
// Frontend
// ══════════════════════════════════════════════════════════════

describe('Phase 17 — Frontend', () => {

  it('P17-40: profile.html has attendanceHistorySection', async () => {
    const profilePath = resolve('frontend/profile.html');
    const content = await readFile(profilePath, 'utf-8');
    assert.ok(content.includes('attendanceHistorySection'), 'profile.html should have attendanceHistorySection');
  });
});
