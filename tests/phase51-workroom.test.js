import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';

let dataDir;
let db;
let users;
let jobs;
let apps;
let workroom;
let attendance;
let payments;
let directOffer;

async function setup() {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-p51-workroom-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  users = await import('../server/services/users.js');
  jobs = await import('../server/services/jobs.js');
  apps = await import('../server/services/applications.js');
  workroom = await import('../server/services/workroom.js');
  attendance = await import('../server/services/attendance.js');
  payments = await import('../server/services/payments.js');
  directOffer = await import('../server/services/directOffer.js');

  await db.initDatabase();
}

async function cleanup() {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

async function createUser(phone, role, fields = {}) {
  const user = await users.create(phone, role);
  return await users.update(user.id, {
    name: fields.name || (role === 'worker' ? 'Worker' : 'Employer'),
    governorate: fields.governorate || 'cairo',
    categories: fields.categories || (role === 'worker' ? ['cleaning'] : []),
    lat: fields.lat ?? 30.0444,
    lng: fields.lng ?? 31.2357,
    verificationStatus: fields.verificationStatus || 'verified',
  });
}

async function createJob(employerId, overrides = {}) {
  return await jobs.create(employerId, {
    title: overrides.title || 'تنظيف موقع عمل',
    category: overrides.category || 'cleaning',
    governorate: overrides.governorate || 'cairo',
    workersNeeded: overrides.workersNeeded || 1,
    dailyWage: overrides.dailyWage || 250,
    startDate: overrides.startDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    durationDays: overrides.durationDays || 1,
    description: overrides.description || 'فرصة عمل اختبارية',
    lat: overrides.lat ?? 30.0444,
    lng: overrides.lng ?? 31.2357,
  });
}

test.before(setup);
test.after(cleanup);

test('accepted worker and employer owner can access workroom', async () => {
  const employer = await createUser('01030000001', 'employer', { name: 'Employer A' });
  const worker = await createUser('01030000002', 'worker', { name: 'Worker A' });
  const job = await createJob(employer.id);

  const app = await apps.apply(job.id, worker.id);
  assert.equal(app.ok, true);

  const accepted = await apps.accept(app.application.id, employer.id);
  assert.equal(accepted.ok, true);

  const workerRoom = await workroom.getWorkroom(job.id, worker.id);
  assert.equal(workerRoom.ok, true);
  assert.equal(workerRoom.workroom.userRoleInWorkroom, 'worker');

  const employerRoom = await workroom.getWorkroom(job.id, employer.id);
  assert.equal(employerRoom.ok, true);
  assert.equal(employerRoom.workroom.userRoleInWorkroom, 'employer');
});

test('pending applicant cannot access workroom', async () => {
  const employer = await createUser('01030000003', 'employer');
  const worker = await createUser('01030000004', 'worker');
  const job = await createJob(employer.id);

  const app = await apps.apply(job.id, worker.id);
  assert.equal(app.ok, true);

  const result = await workroom.getWorkroom(job.id, worker.id);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WORKROOM_NOT_AVAILABLE');
});

test('unrelated user gets denied after workroom is available', async () => {
  const employer = await createUser('01030000005', 'employer');
  const worker = await createUser('01030000006', 'worker');
  const other = await createUser('01030000007', 'worker');
  const job = await createJob(employer.id);

  const app = await apps.apply(job.id, worker.id);
  await apps.accept(app.application.id, employer.id);

  const result = await workroom.getWorkroom(job.id, other.id);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_WORKROOM_PARTICIPANT');
});

test('synthetic direct_offer job accepted worker can access workroom', async () => {
  const employer = await createUser('01030000008', 'employer', { name: 'Employer Direct' });
  const worker = await createUser('01030000009', 'worker', { name: 'Worker Direct' });

  const offer = await directOffer.create(employer.id, worker.id, {
    category: 'cleaning',
    governorate: 'cairo',
    proposedDailyWage: 300,
    proposedStartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    proposedDurationDays: 1,
    message: 'عرض مباشر للاختبار',
  });

  assert.equal(offer.ok, true);

  const accepted = await directOffer.tryAccept(offer.offer.id, worker.id);
  assert.equal(accepted.ok, true);
  assert.ok(accepted.jobId);

  const room = await workroom.getWorkroom(accepted.jobId, worker.id);
  assert.equal(room.ok, true);
  assert.equal(room.workroom.job.sourceType, 'direct_offer');
});

test('worker and employer can send workroom messages', async () => {
  const employer = await createUser('01030000010', 'employer');
  const worker = await createUser('01030000011', 'worker');
  const job = await createJob(employer.id);

  const app = await apps.apply(job.id, worker.id);
  await apps.accept(app.application.id, employer.id);

  const wMsg = await workroom.sendWorkroomMessage(job.id, worker.id, {
    text: 'أنا في الطريق',
    templateKey: 'worker_0',
  });

  assert.equal(wMsg.ok, true);
  assert.equal(wMsg.message.source, 'workroom');
  assert.equal(wMsg.message.templateKey, 'worker_0');
  assert.equal(wMsg.message.recipientId, employer.id);

  const eMsg = await workroom.sendWorkroomMessage(job.id, employer.id, {
    text: 'تمام، مستنيك في المعاد',
    recipientId: worker.id,
    templateKey: 'employer_0',
  });

  assert.equal(eMsg.ok, true);
  assert.equal(eMsg.message.source, 'workroom');
  assert.equal(eMsg.message.recipientId, worker.id);

  const list = await workroom.listWorkroomMessages(job.id, worker.id, { limit: 10, offset: 0 });
  assert.equal(list.ok, true);
  assert.equal(list.total, 2);
});

test('content filter still blocks unsafe workroom message', async () => {
  const employer = await createUser('01030000012', 'employer');
  const worker = await createUser('01030000013', 'worker');
  const job = await createJob(employer.id);

  const app = await apps.apply(job.id, worker.id);
  await apps.accept(app.application.id, employer.id);

  const result = await workroom.sendWorkroomMessage(job.id, worker.id, {
    text: 'كلمني واتساب على 01012345678',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONTENT_BLOCKED');
});

test('timeline includes job started, attendance, payment and completion events', async () => {
  const employer = await createUser('01030000014', 'employer');
  const worker = await createUser('01030000015', 'worker');
  const job = await createJob(employer.id);

  const app = await apps.apply(job.id, worker.id);
  await apps.accept(app.application.id, employer.id);

  const started = await jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);

  const checkin = await attendance.checkIn(job.id, worker.id, {
    lat: 30.0444,
    lng: 31.2357,
  });
  assert.equal(checkin.ok, true);

  const confirmed = await attendance.confirmAttendance(checkin.attendance.id, employer.id);
  assert.equal(confirmed.ok, true);

  const completed = await jobs.completeJob(job.id, employer.id);
  assert.equal(completed.ok, true);

  const payment = await payments.createPayment(job.id, employer.id);
  assert.equal(payment.ok === true || payment.code === 'PAYMENT_EXISTS', true);

  const timeline = await workroom.getWorkroomTimeline(job.id, worker.id);
  assert.equal(timeline.ok, true);

  const types = timeline.timeline.map(e => e.type);

  assert.ok(types.includes('job_started'));
  assert.ok(types.includes('attendance_checkin'));
  assert.ok(types.includes('attendance_confirmed'));
  assert.ok(types.includes('job_completed'));
  assert.ok(types.includes('payment_created'));
});

test('old /api/jobs/:id/messages compatible service still works', async () => {
  const employer = await createUser('01030000016', 'employer');
  const worker = await createUser('01030000017', 'worker');
  const job = await createJob(employer.id);

  const app = await apps.apply(job.id, worker.id);
  await apps.accept(app.application.id, employer.id);

  const messages = await import('../server/services/messages.js');

  const sent = await messages.sendMessage(job.id, worker.id, {
    recipientId: employer.id,
    text: 'رسالة قديمة عبر API القديم',
  });

  assert.equal(sent.ok, true);
  assert.equal(sent.message.source, 'job_messages');
  assert.equal(sent.message.templateKey, null);

  const list = await messages.listByJob(job.id, worker.id, { limit: 10, offset: 0 });
  assert.equal(list.total, 1);
});
