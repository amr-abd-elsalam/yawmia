// tests/phase16-attendance.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 16 — Worker Attendance & Check-in System (~37 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-phase16-'));
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

let config, db, userService, jobsService, appService, attendance, attendanceHandler, eventBus;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  jobsService = await import('../server/services/jobs.js');
  appService = await import('../server/services/applications.js');
  attendance = await import('../server/services/attendance.js');
  attendanceHandler = await import('../server/handlers/attendanceHandler.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
});

after(() => {
  if (eventBus) eventBus.clear();
});

// ── Helpers ─────────────────────────────────────────────────
let counter = 0;
async function createTestUser(role) {
  counter++;
  const phone = '0101600' + String(counter).padStart(4, '0');
  return await userService.create(phone, role);
}

/**
 * Create an in_progress job with one accepted worker
 */
async function setupInProgressJob() {
  const employer = await createTestUser('employer');
  const worker = await createTestUser('worker');
  const job = await jobsService.create(employer.id, {
    title: 'فرصة حضور ' + counter,
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

describe('Phase 16 — Config', () => {

  it('P16-01: Config has 38 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 46, `expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P16-02: ATTENDANCE section has correct fields', () => {
    const a = config.ATTENDANCE;
    assert.ok(a, 'ATTENDANCE section should exist');
    assert.strictEqual(typeof a.enabled, 'boolean');
    assert.strictEqual(typeof a.checkInRadiusKm, 'number');
    assert.strictEqual(typeof a.allowEmployerOverride, 'boolean');
    assert.strictEqual(typeof a.autoNoShowAfterHours, 'number');
    assert.ok(Array.isArray(a.statuses));
    assert.strictEqual(typeof a.requireGpsForCheckIn, 'boolean');
    assert.strictEqual(typeof a.requireGpsForCheckOut, 'boolean');
    assert.strictEqual(typeof a.maxCheckInDistanceOverrideKm, 'number');
  });

  it('P16-03: ATTENDANCE.statuses has 5 entries', () => {
    assert.strictEqual(config.ATTENDANCE.statuses.length, 5);
    assert.deepStrictEqual(
      [...config.ATTENDANCE.statuses].sort(),
      ['checked_in', 'checked_out', 'confirmed', 'no_show', 'pending']
    );
  });

  it('P16-04: ATTENDANCE is frozen', () => {
    assert.strictEqual(Object.isFrozen(config.ATTENDANCE), true, 'ATTENDANCE should be frozen');
    assert.throws(() => {
      config.ATTENDANCE.enabled = false;
    }, TypeError, 'should not allow mutation');
  });

  it('P16-05: DATABASE has 12 dirs', () => {
    assert.strictEqual(Object.keys(config.DATABASE.dirs).length, 18);
    assert.ok(config.DATABASE.dirs.attendance);
  });

  it('P16-06: DATABASE has 12 indexFiles', () => {
    assert.strictEqual(Object.keys(config.DATABASE.indexFiles).length, 17);
  });

  it('P16-07: jobAttendanceIndex path exists', () => {
    assert.strictEqual(config.DATABASE.indexFiles.jobAttendanceIndex, 'attendance/job-index.json');
  });

  it('P16-08: workerAttendanceIndex path exists', () => {
    assert.strictEqual(config.DATABASE.indexFiles.workerAttendanceIndex, 'attendance/worker-index.json');
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance Service — Function Exports
// ══════════════════════════════════════════════════════════════

describe('Phase 16 — Attendance Service Exports', () => {

  it('P16-09: checkIn function exported', () => {
    assert.strictEqual(typeof attendance.checkIn, 'function');
  });

  it('P16-10: checkOut function exported', () => {
    assert.strictEqual(typeof attendance.checkOut, 'function');
  });

  it('P16-11: confirmAttendance function exported', () => {
    assert.strictEqual(typeof attendance.confirmAttendance, 'function');
  });

  it('P16-12: reportNoShow function exported', () => {
    assert.strictEqual(typeof attendance.reportNoShow, 'function');
  });

  it('P16-13: listByJob function exported', () => {
    assert.strictEqual(typeof attendance.listByJob, 'function');
  });

  it('P16-14: listByWorker function exported', () => {
    assert.strictEqual(typeof attendance.listByWorker, 'function');
  });

  it('P16-15: getJobSummary function exported', () => {
    assert.strictEqual(typeof attendance.getJobSummary, 'function');
  });

  it('P16-16: findById function exported', () => {
    assert.strictEqual(typeof attendance.findById, 'function');
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance Service — Validation Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 16 — Attendance Validation', () => {

  it('P16-17: checkIn rejects non-existent job', async () => {
    const result = await attendance.checkIn('job_nonexistent', 'usr_test', { lat: 30.0, lng: 31.0 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'JOB_NOT_FOUND');
  });

  it('P16-18: checkIn rejects non-in_progress job', async () => {
    const employer = await createTestUser('employer');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة مفتوحة',
      category: 'farming',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-06-01',
      durationDays: 1,
    });
    const result = await attendance.checkIn(job.id, 'usr_test', { lat: 30.0, lng: 31.0 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'JOB_NOT_IN_PROGRESS');
  });

  it('P16-19: checkIn rejects without GPS when required', async () => {
    const { job, worker } = await setupInProgressJob();
    const result = await attendance.checkIn(job.id, worker.id, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'GPS_REQUIRED');
  });

  it('P16-20: checkOut rejects when not checked in', async () => {
    const { job, worker } = await setupInProgressJob();
    const result = await attendance.checkOut(job.id, worker.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_CHECKED_IN');
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance Handler — Function Exports
// ══════════════════════════════════════════════════════════════

describe('Phase 16 — Attendance Handler Exports', () => {

  it('P16-21: handleCheckIn exported', () => {
    assert.strictEqual(typeof attendanceHandler.handleCheckIn, 'function');
  });

  it('P16-22: handleCheckOut exported', () => {
    assert.strictEqual(typeof attendanceHandler.handleCheckOut, 'function');
  });

  it('P16-23: handleConfirmAttendance exported', () => {
    assert.strictEqual(typeof attendanceHandler.handleConfirmAttendance, 'function');
  });

  it('P16-24: handleReportNoShow exported', () => {
    assert.strictEqual(typeof attendanceHandler.handleReportNoShow, 'function');
  });

  it('P16-25: handleListJobAttendance exported', () => {
    assert.strictEqual(typeof attendanceHandler.handleListJobAttendance, 'function');
  });

  it('P16-26: handleJobAttendanceSummary exported', () => {
    assert.strictEqual(typeof attendanceHandler.handleJobAttendanceSummary, 'function');
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance Events
// ══════════════════════════════════════════════════════════════

describe('Phase 16 — Attendance Events', () => {

  it('P16-27: attendance:checkin event dispatches', async () => {
    const { job, worker } = await setupInProgressJob();
    let eventData = null;
    const unsub = eventBus.on('attendance:checkin', (data) => { eventData = data; });
    // Check in near Cairo center (where the job is)
    await attendance.checkIn(job.id, worker.id, { lat: 30.0444, lng: 31.2357 });
    unsub();
    assert.ok(eventData, 'attendance:checkin event should fire');
    assert.ok(eventData.attendanceId);
    assert.strictEqual(eventData.jobId, job.id);
    assert.strictEqual(eventData.workerId, worker.id);
    assert.strictEqual(eventData.employerId, job.employerId);
  });

  it('P16-28: attendance:noshow event dispatches', async () => {
    const { job, worker, employer } = await setupInProgressJob();
    let eventData = null;
    const unsub = eventBus.on('attendance:noshow', (data) => { eventData = data; });
    await attendance.reportNoShow(job.id, worker.id, employer.id);
    unsub();
    assert.ok(eventData, 'attendance:noshow event should fire');
    assert.ok(eventData.attendanceId);
    assert.strictEqual(eventData.jobId, job.id);
    assert.strictEqual(eventData.workerId, worker.id);
  });

  it('P16-29: attendance:confirmed event dispatches', async () => {
    const { job, worker, employer } = await setupInProgressJob();
    const checkinResult = await attendance.checkIn(job.id, worker.id, { lat: 30.0444, lng: 31.2357 });
    assert.strictEqual(checkinResult.ok, true);

    let eventData = null;
    const unsub = eventBus.on('attendance:confirmed', (data) => { eventData = data; });
    await attendance.confirmAttendance(checkinResult.attendance.id, employer.id);
    unsub();
    assert.ok(eventData, 'attendance:confirmed event should fire');
    assert.strictEqual(eventData.attendanceId, checkinResult.attendance.id);
    assert.strictEqual(eventData.employerId, employer.id);
  });
});

// ══════════════════════════════════════════════════════════════
// Attendance Data Model
// ══════════════════════════════════════════════════════════════

describe('Phase 16 — Attendance Data Model', () => {

  it('P16-30: Record has 18 expected fields', async () => {
    const { job, worker } = await setupInProgressJob();
    const result = await attendance.checkIn(job.id, worker.id, { lat: 30.0444, lng: 31.2357 });
    assert.strictEqual(result.ok, true);
    const record = result.attendance;
    const expectedFields = [
      'id', 'jobId', 'workerId', 'employerId', 'date', 'status',
      'checkInAt', 'checkInLat', 'checkInLng',
      'checkOutAt', 'checkOutLat', 'checkOutLng',
      'hoursWorked', 'employerConfirmed', 'employerConfirmedAt',
      'noShowReportedBy', 'noShowReportedAt', 'createdAt',
    ];
    for (const field of expectedFields) {
      assert.ok(field in record, `record should have field: ${field}`);
    }
    assert.strictEqual(Object.keys(record).length, 18, `expected 18 fields, got ${Object.keys(record).length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// GPS Verification Config
// ══════════════════════════════════════════════════════════════

describe('Phase 16 — GPS Verification Config', () => {

  it('P16-31: checkInRadiusKm is 0.5', () => {
    assert.strictEqual(config.ATTENDANCE.checkInRadiusKm, 0.5);
  });

  it('P16-32: maxCheckInDistanceOverrideKm is 2', () => {
    assert.strictEqual(config.ATTENDANCE.maxCheckInDistanceOverrideKm, 2);
  });

  it('P16-33: GPS required for check-in by default', () => {
    assert.strictEqual(config.ATTENDANCE.requireGpsForCheckIn, true);
  });

  it('P16-34: GPS NOT required for check-out by default', () => {
    assert.strictEqual(config.ATTENDANCE.requireGpsForCheckOut, false);
  });
});

// ══════════════════════════════════════════════════════════════
// Version & Routes
// ══════════════════════════════════════════════════════════════

describe('Phase 16 — Version & Routes', () => {

  it('P16-35: package.json version 0.25.0', async () => {
    const pkgPath = resolve('package.json');
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.30.0');
  });

  it('P16-36: PWA cacheName v0.25.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.30.0');
  });

  it('P16-37: Router has 61 routes', async () => {
    const routerPath = resolve('server/router.js');
    const content = await readFile(routerPath, 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 89, `expected 74 routes, got ${routeMatches.length}`);
  });
});
