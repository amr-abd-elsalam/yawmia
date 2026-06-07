// ═══════════════════════════════════════════════════════════════
// tests/e2e/attendance-lifecycle-smoke.test.js
// Patch 33 — Attendance Check-in / No-show / Confirm Smoke
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for attendance-sensitive marketplace workflows.
//
// Covers:
//   - accepted worker can check in on in_progress job
//   - duplicate same-day check-in remains protected
//   - worker can check out after check-in
//   - employer can confirm attendance
//   - employer can report no-show for accepted worker
//   - non-accepted worker cannot check in
//   - non-owner employer cannot report no-show
//   - listByJob/listByWorker/getJobSummary shape remains stable
//   - attendance-based payment adjustment remains finance-shape stable
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
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-attendance-lifecycle-smoke-'));

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

async function loadCoreServices() {
  const [
    database,
    users,
    jobs,
    applications,
    attendance,
    payments,
  ] = await Promise.all([
    importFresh('../../server/services/database.js'),
    importFresh('../../server/services/users.js'),
    importFresh('../../server/services/jobs.js'),
    importFresh('../../server/services/applications.js'),
    importFresh('../../server/services/attendance.js'),
    importFresh('../../server/services/payments.js'),
  ]);

  await database.initDatabase();

  return {
    database,
    users,
    jobs,
    applications,
    attendance,
    payments,
  };
}

async function createProfiledUser(users, phone, role, fields = {}) {
  const user = await users.create(phone, role);
  const updated = await users.update(user.id, {
    name: fields.name || (role === 'employer' ? 'صاحب عمل اختبار' : 'عامل اختبار'),
    governorate: fields.governorate || 'cairo',
    categories: role === 'worker' ? (fields.categories || ['construction']) : [],
    lat: typeof fields.lat === 'number' ? fields.lat : 30.0444,
    lng: typeof fields.lng === 'number' ? fields.lng : 31.2357,
  });

  return updated || user;
}

async function createStartedJob({
  users,
  jobs,
  applications,
  employerPhone = '01010000001',
  workerPhone = '01010000002',
  workersNeeded = 1,
  dailyWage = 200,
  durationDays = 1,
  category = 'construction',
} = {}) {
  const employer = await createProfiledUser(users, employerPhone, 'employer', {
    name: 'مقاول اختبار',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
  });

  const worker = await createProfiledUser(users, workerPhone, 'worker', {
    name: 'عامل بناء اختبار',
    governorate: 'cairo',
    categories: [category],
    lat: 30.0444,
    lng: 31.2357,
  });

  const job = await jobs.create(employer.id, {
    title: 'فرصة حضور اختبار',
    category,
    governorate: 'cairo',
    location: 'وسط البلد',
    lat: 30.0444,
    lng: 31.2357,
    workersNeeded,
    dailyWage,
    startDate: '2030-01-01',
    durationDays,
    description: 'فرصة اختبار لدورة الحضور',
  });

  const applied = await applications.apply(job.id, worker.id);
  assert.equal(applied.ok, true);

  const accepted = await applications.accept(applied.application.id, employer.id);
  assert.equal(accepted.ok, true);

  return { employer, worker, job: await jobs.findById(job.id), application: accepted.application };
}

async function waitForPaymentOrCreate(payments, jobId, employerId) {
  for (let i = 0; i < 30; i++) {
    const existing = await payments.listByJob(jobId);
    if (existing.length > 0) return existing[0];
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  const created = await payments.createPayment(jobId, employerId);
  if (created.ok) return created.payment;

  if (created.code === 'PAYMENT_EXISTS') {
    const existing = await payments.listByJob(jobId);
    if (existing.length > 0) return existing[0];
  }

  assert.fail(`payment was not created: ${created.code || created.error || 'unknown'}`);
}

test('Patch 33: accepted worker can check in, duplicate is blocked, check out, and employer can confirm', async (t) => {
  await setupTempDataPath(t);
  const { users, jobs, applications, attendance } = await loadCoreServices();

  const { employer, worker, job } = await createStartedJob({
    users,
    jobs,
    applications,
    workersNeeded: 1,
    dailyWage: 250,
    durationDays: 1,
  });

  const started = await jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);
  assert.equal(started.job.status, 'in_progress');

  const checkIn = await attendance.checkIn(job.id, worker.id, {
    lat: 30.0444,
    lng: 31.2357,
  });

  assert.equal(checkIn.ok, true);
  assert.equal(checkIn.attendance.status, 'checked_in');
  assert.equal(checkIn.attendance.workerId, worker.id);
  assert.equal(checkIn.attendance.employerId, employer.id);
  assert.equal(checkIn.attendance.jobId, job.id);
  assert.equal(typeof checkIn.attendance.checkInAt, 'string');

  const duplicateCheckIn = await attendance.checkIn(job.id, worker.id, {
    lat: 30.0444,
    lng: 31.2357,
  });

  assert.equal(duplicateCheckIn.ok, false);
  assert.equal(duplicateCheckIn.code, 'ALREADY_CHECKED_IN');

  const byJobAfterCheckIn = await attendance.listByJob(job.id);
  assert.equal(byJobAfterCheckIn.length, 1);
  assert.equal(byJobAfterCheckIn[0].id, checkIn.attendance.id);

  const byWorkerAfterCheckIn = await attendance.listByWorker(worker.id);
  assert.equal(byWorkerAfterCheckIn.length, 1);
  assert.equal(byWorkerAfterCheckIn[0].id, checkIn.attendance.id);

  const checkOut = await attendance.checkOut(job.id, worker.id, {
    lat: 30.0444,
    lng: 31.2357,
  });

  assert.equal(checkOut.ok, true);
  assert.equal(checkOut.attendance.status, 'checked_out');
  assert.equal(checkOut.attendance.workerId, worker.id);
  assert.equal(typeof checkOut.attendance.checkOutAt, 'string');
  assert.equal(typeof checkOut.attendance.hoursWorked, 'number');

  const confirmed = await attendance.confirmAttendance(checkOut.attendance.id, employer.id);

  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.attendance.status, 'confirmed');
  assert.equal(confirmed.attendance.employerConfirmed, true);
  assert.equal(typeof confirmed.attendance.employerConfirmedAt, 'string');

  const summary = await attendance.getJobSummary(job.id);

  assert.equal(summary.jobId, job.id);
  assert.equal(summary.totalRecords, 1);
  assert.equal(summary.checkedInCount, 1);
  assert.equal(summary.noShowCount, 0);
  assert.equal(summary.confirmedCount, 1);
  assert.equal(summary.attendanceByWorker[worker.id].checkedIn, 1);
  assert.equal(summary.attendanceByWorker[worker.id].confirmed, 1);
});

test('Patch 33: no-show lifecycle and attendance access guards remain protected', async (t) => {
  await setupTempDataPath(t);
  const { users, jobs, applications, attendance } = await loadCoreServices();

  const { employer, worker, job } = await createStartedJob({
    users,
    jobs,
    applications,
    employerPhone: '01020000001',
    workerPhone: '01020000002',
    workersNeeded: 1,
    dailyWage: 220,
    durationDays: 1,
  });

  const unrelatedWorker = await createProfiledUser(users, '01020000003', 'worker', {
    name: 'عامل غير مقبول',
    governorate: 'cairo',
    categories: ['construction'],
    lat: 30.0444,
    lng: 31.2357,
  });

  const wrongEmployer = await createProfiledUser(users, '01020000004', 'employer', {
    name: 'صاحب عمل آخر',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
  });

  const started = await jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);

  const nonAcceptedCheckIn = await attendance.checkIn(job.id, unrelatedWorker.id, {
    lat: 30.0444,
    lng: 31.2357,
  });

  assert.equal(nonAcceptedCheckIn.ok, false);
  assert.equal(nonAcceptedCheckIn.code, 'NOT_ACCEPTED_WORKER');

  const wrongOwnerNoShow = await attendance.reportNoShow(job.id, worker.id, wrongEmployer.id);

  assert.equal(wrongOwnerNoShow.ok, false);
  assert.equal(wrongOwnerNoShow.code, 'NOT_JOB_OWNER');

  const noShow = await attendance.reportNoShow(job.id, worker.id, employer.id);

  assert.equal(noShow.ok, true);
  assert.equal(noShow.attendance.status, 'no_show');
  assert.equal(noShow.attendance.workerId, worker.id);
  assert.equal(noShow.attendance.noShowReportedBy, employer.id);
  assert.equal(typeof noShow.attendance.noShowReportedAt, 'string');

  const duplicateNoShow = await attendance.reportNoShow(job.id, worker.id, employer.id);

  assert.equal(duplicateNoShow.ok, true);
  assert.equal(duplicateNoShow.attendance.id, noShow.attendance.id);
  assert.equal(duplicateNoShow.attendance.status, 'no_show');

  const byJob = await attendance.listByJob(job.id);
  assert.equal(byJob.length, 1);
  assert.equal(byJob[0].id, noShow.attendance.id);

  const byWorker = await attendance.listByWorker(worker.id);
  assert.equal(byWorker.length, 1);
  assert.equal(byWorker[0].status, 'no_show');

  const summary = await attendance.getJobSummary(job.id);

  assert.equal(summary.jobId, job.id);
  assert.equal(summary.totalRecords, 1);
  assert.equal(summary.checkedInCount, 0);
  assert.equal(summary.noShowCount, 1);
  assert.equal(summary.confirmedCount, 0);
  assert.equal(summary.attendanceByWorker[worker.id].noShows, 1);
});

test('Patch 33: attendance-based payment adjustment remains finance-shape stable', async (t) => {
  await setupTempDataPath(t);
  const { users, jobs, applications, attendance, payments } = await loadCoreServices();

  const employer = await createProfiledUser(users, '01030000001', 'employer', {
    name: 'صاحب عمل دفع حضور',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
  });

  const workerA = await createProfiledUser(users, '01030000002', 'worker', {
    name: 'عامل حضر',
    governorate: 'cairo',
    categories: ['construction'],
    lat: 30.0444,
    lng: 31.2357,
  });

  const workerB = await createProfiledUser(users, '01030000003', 'worker', {
    name: 'عامل غاب',
    governorate: 'cairo',
    categories: ['construction'],
    lat: 30.0444,
    lng: 31.2357,
  });

  const job = await jobs.create(employer.id, {
    title: 'فرصة دفع محسوب بالحضور',
    category: 'construction',
    governorate: 'cairo',
    location: 'وسط البلد',
    lat: 30.0444,
    lng: 31.2357,
    workersNeeded: 2,
    dailyWage: 200,
    startDate: '2030-01-01',
    durationDays: 1,
    description: 'فرصة اختبار لحساب الدفع بناءً على الحضور',
  });

  const appA = await applications.apply(job.id, workerA.id);
  assert.equal(appA.ok, true);
  const acceptedA = await applications.accept(appA.application.id, employer.id);
  assert.equal(acceptedA.ok, true);

  const appB = await applications.apply(job.id, workerB.id);
  assert.equal(appB.ok, true);
  const acceptedB = await applications.accept(appB.application.id, employer.id);
  assert.equal(acceptedB.ok, true);

  const filledJob = await jobs.findById(job.id);
  assert.equal(filledJob.status, 'filled');
  assert.equal(filledJob.workersAccepted, 2);

  const started = await jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);
  assert.equal(started.job.status, 'in_progress');

  const checkInA = await attendance.checkIn(job.id, workerA.id, {
    lat: 30.0444,
    lng: 31.2357,
  });
  assert.equal(checkInA.ok, true);

  const checkOutA = await attendance.checkOut(job.id, workerA.id, {
    lat: 30.0444,
    lng: 31.2357,
  });
  assert.equal(checkOutA.ok, true);

  const confirmA = await attendance.confirmAttendance(checkOutA.attendance.id, employer.id);
  assert.equal(confirmA.ok, true);
  assert.equal(confirmA.attendance.status, 'confirmed');

  const noShowB = await attendance.reportNoShow(job.id, workerB.id, employer.id);
  assert.equal(noShowB.ok, true);
  assert.equal(noShowB.attendance.status, 'no_show');

  const summary = await attendance.getJobSummary(job.id);

  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.checkedInCount, 1);
  assert.equal(summary.noShowCount, 1);
  assert.equal(summary.confirmedCount, 1);
  assert.equal(summary.attendanceByWorker[workerA.id].checkedIn, 1);
  assert.equal(summary.attendanceByWorker[workerB.id].noShows, 1);

  const completed = await jobs.completeJob(job.id, employer.id);
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, 'completed');

  const payment = await waitForPaymentOrCreate(payments, job.id, employer.id);

  assert.equal(payment.jobId, job.id);
  assert.equal(payment.employerId, employer.id);
  assert.equal(payment.status, 'pending');

  assert.deepEqual(payment.attendanceBreakdown, {
    expectedWorkerDays: 2,
    actualWorkerDays: 1,
    noShowDays: 1,
    attendanceRate: 0.5,
  });

  assert.equal(payment.amount, 200);
  assert.equal(payment.platformFee, 30);
  assert.equal(payment.workerPayout, 170);
  assert.equal(payment.workersAccepted, 2);
  assert.equal(payment.dailyWage, 200);
  assert.equal(payment.durationDays, 1);

  const listed = await payments.listByJob(job.id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, payment.id);

  const counts = await payments.countByStatus();
  assert.equal(counts.pending, 1);
  assert.equal(counts.total, 1);

  const financialSummary = await payments.getFinancialSummary();
  assert.equal(financialSummary.totalPayments, 1);
  assert.equal(financialSummary.totalAmount, 200);
  assert.equal(financialSummary.totalPlatformFee, 30);
  assert.equal(financialSummary.totalWorkerPayout, 170);
  assert.equal(financialSummary.pendingAmount, 200);
  assert.equal(financialSummary.pendingPlatformFee, 30);
});
