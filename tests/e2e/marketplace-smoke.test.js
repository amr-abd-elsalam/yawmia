// ═══════════════════════════════════════════════════════════════
// tests/e2e/marketplace-smoke.test.js
// Patch 23 — Realistic E2E Smoke Tests
// ═══════════════════════════════════════════════════════════════
//
// Scope:
// - Service-level marketplace lifecycle smoke.
// - Direct Offer synthetic job smoke.
// - Workroom message smoke.
// - Router read-only/admin-read smoke.
//
// Safety:
// - Uses YAWMIA_DATA_PATH temp directory.
// - Does not touch ./data.
// - Does not use OTP.
// - Does not weaken auth.
// - Does not start server.js.
// - Does not run schedulers/queue workers/PM2.
// - Adds no dependencies.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';

let tempDir;
let services;

async function loadServices() {
  const database = await import('../../server/services/database.js');
  const users = await import('../../server/services/users.js');
  const sessions = await import('../../server/services/sessions.js');
  const jobs = await import('../../server/services/jobs.js');
  const applications = await import('../../server/services/applications.js');
  const payments = await import('../../server/services/payments.js');
  const directOffer = await import('../../server/services/directOffer.js');
  const workroom = await import('../../server/services/workroom.js');

  return {
    database,
    users,
    sessions,
    jobs,
    applications,
    payments,
    directOffer,
    workroom,
  };
}

async function createEmployer(suffix = '001') {
  const user = await services.users.create(`01000000${suffix}`, 'employer');
  const updated = await services.users.update(user.id, {
    name: `صاحب عمل ${suffix}`,
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
  });

  return updated || user;
}

async function createWorker(suffix = '101') {
  const user = await services.users.create(`01100000${suffix}`, 'worker');
  const updated = await services.users.update(user.id, {
    name: `عامل ${suffix}`,
    governorate: 'cairo',
    categories: ['construction', 'cleaning'],
    lat: 30.0500,
    lng: 31.2400,
  });

  return updated || user;
}

async function createSessionFor(user) {
  return await services.sessions.createSession(user.id, user.role, {
    ip: '127.0.0.1',
    userAgent: 'node:test marketplace smoke',
  });
}

async function createBasicJob(employerId, overrides = {}) {
  return await services.jobs.create(employerId, {
    title: overrides.title || 'عمال نظافة لموقع قريب',
    category: overrides.category || 'cleaning',
    governorate: overrides.governorate || 'cairo',
    location: overrides.location || 'القاهرة',
    area: overrides.area || 'وسط البلد',
    address: overrides.address || 'شارع رئيسي بجوار محطة المترو',
    landmark: overrides.landmark || 'بجوار محطة المترو',
    locationNotes: overrides.locationNotes || 'اسأل على بوابة الأمن',
    lat: overrides.lat ?? 30.0444,
    lng: overrides.lng ?? 31.2357,
    workersNeeded: overrides.workersNeeded || 1,
    dailyWage: overrides.dailyWage || 250,
    startDate: overrides.startDate || '2026-06-10',
    durationDays: overrides.durationDays || 1,
    description: overrides.description || 'مطلوب عامل ملتزم ليوم واحد',
    urgency: overrides.urgency || 'normal',
  });
}

async function waitFor(fn, options = {}) {
  const timeoutMs = options.timeoutMs || 2000;
  const intervalMs = options.intervalMs || 25;
  const startedAt = Date.now();
  let lastValue;

  while (Date.now() - startedAt <= timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  assert.fail(`Timed out waiting for condition. Last value: ${JSON.stringify(lastValue)}`);
}

function createMockReq({ method = 'GET', pathname, query = {}, headers = {} }) {
  const req = new EventEmitter();
  req.method = method;
  req.pathname = pathname;
  req.query = query;
  req.headers = {
    host: 'localhost',
    ...headers,
  };
  req.socket = {
    remoteAddress: '127.0.0.1',
    setTimeout() {},
  };
  return req;
}

function invokeRouter(router, options) {
  return new Promise((resolve, reject) => {
    const req = createMockReq(options);
    const chunks = [];

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.writableEnded = false;
    res.destroyed = false;
    res.headersSent = false;

    res.setHeader = function setHeader(key, value) {
      res.headers[String(key).toLowerCase()] = value;
    };

    res.writeHead = function writeHead(statusCode, headers = {}) {
      res.statusCode = statusCode;
      res.headersSent = true;
      for (const [key, value] of Object.entries(headers || {})) {
        res.headers[String(key).toLowerCase()] = value;
      }
    };

    res.write = function write(chunk) {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return true;
    };

    res.end = function end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      res.writableEnded = true;
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
    };

    try {
      router(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

function parseJsonResponse(response) {
  assert.ok(response.body, 'expected JSON response body');
  return JSON.parse(response.body);
}

test.before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'yawmia-e2e-'));

  process.env.NODE_ENV = 'test';
  process.env.YAWMIA_DATA_PATH = tempDir;
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.PORT = '0';

  services = await loadServices();
  await services.database.initDatabase();
});

test.after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('marketplace lifecycle: employer creates job, worker applies, employer accepts, starts, completes, payment is created', async () => {
  const employer = await createEmployer('001');
  const worker = await createWorker('101');

  await createSessionFor(employer);
  await createSessionFor(worker);

  const job = await createBasicJob(employer.id, {
    title: 'عمال نظافة لاختبار E2E',
    category: 'cleaning',
    workersNeeded: 1,
    dailyWage: 300,
  });

  assert.equal(job.status, 'open');
  assert.equal(job.employerId, employer.id);
  assert.equal(job.workersAccepted, 0);

  const applyResult = await services.applications.apply(job.id, worker.id);
  assert.equal(applyResult.ok, true);
  assert.equal(applyResult.application.status, 'pending');

  const jobApplications = await services.applications.listByJob(job.id);
  assert.equal(jobApplications.length, 1);
  assert.equal(jobApplications[0].workerId, worker.id);

  const acceptResult = await services.applications.accept(applyResult.application.id, employer.id);
  assert.equal(acceptResult.ok, true);
  assert.equal(acceptResult.application.status, 'accepted');

  const filledJob = await services.jobs.findById(job.id);
  assert.equal(filledJob.status, 'filled');
  assert.equal(filledJob.workersAccepted, 1);

  const startResult = await services.jobs.startJob(job.id, employer.id);
  assert.equal(startResult.ok, true);
  assert.equal(startResult.job.status, 'in_progress');

  const completeResult = await services.jobs.completeJob(job.id, employer.id);
  assert.equal(completeResult.ok, true);
  assert.equal(completeResult.job.status, 'completed');

  const payments = await waitFor(async () => {
    const rows = await services.payments.listByJob(job.id);
    return rows.length > 0 ? rows : null;
  });

  assert.equal(payments.length, 1);
  assert.equal(payments[0].jobId, job.id);
  assert.equal(payments[0].employerId, employer.id);
  assert.equal(payments[0].amount, job.totalCost);
});

test('workroom messaging: accepted employer and worker can send, list, and mark messages as read', async () => {
  const employer = await createEmployer('002');
  const worker = await createWorker('102');

  const job = await createBasicJob(employer.id, {
    title: 'فرصة Workroom Smoke',
    category: 'cleaning',
    workersNeeded: 1,
  });

  const application = await services.applications.apply(job.id, worker.id);
  assert.equal(application.ok, true);

  const accepted = await services.applications.accept(application.application.id, employer.id);
  assert.equal(accepted.ok, true);

  const started = await services.jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);

  const employerWorkroom = await services.workroom.getWorkroom(job.id, employer.id);
  assert.equal(employerWorkroom.ok, true);
  assert.equal(employerWorkroom.workroom.jobId, job.id);

  const workerWorkroom = await services.workroom.getWorkroom(job.id, worker.id);
  assert.equal(workerWorkroom.ok, true);
  assert.equal(workerWorkroom.workroom.jobId, job.id);

  const messageText = 'اختبار رسالة Workroom من صاحب العمل';
  const sendResult = await services.workroom.sendWorkroomMessage(job.id, employer.id, {
    recipientId: worker.id,
    text: messageText,
    templateKey: 'e2e_smoke',
  });

  assert.equal(sendResult.ok, true);
  assert.equal(sendResult.message.text, messageText);
  assert.equal(sendResult.message.senderId, employer.id);
  assert.equal(sendResult.message.recipientId, worker.id);

  const listed = await services.workroom.listWorkroomMessages(job.id, worker.id, {
    limit: 20,
    offset: 0,
  });

  assert.equal(listed.ok, true);
  assert.ok(
    listed.items.some(item => item.id === sendResult.message.id && item.text === messageText),
    'expected sent workroom message to be visible to worker'
  );

  const readResult = await services.workroom.markWorkroomRead(job.id, worker.id);
  assert.equal(readResult.ok, true);
  assert.equal(typeof readResult.count, 'number');
});

test('direct offer synthetic job: worker accepts offer, synthetic job and accepted application are created, public listing does not leak synthetic jobs', async () => {
  const employer = await createEmployer('003');
  const worker = await createWorker('103');

  const offerResult = await services.directOffer.create(employer.id, worker.id, {
    category: 'cleaning',
    governorate: 'cairo',
    proposedDailyWage: 350,
    proposedStartDate: '2026-06-11',
    proposedDurationDays: 1,
    message: 'عرض مباشر لاختبار synthetic job',
  });

  assert.equal(offerResult.ok, true);
  assert.ok(offerResult.offer.id.startsWith('dof_'));

  const acceptResult = await services.directOffer.tryAccept(offerResult.offer.id, worker.id);
  assert.equal(acceptResult.ok, true);
  assert.ok(acceptResult.jobId.startsWith('job_'));

  const rawOffer = await services.directOffer.findById(offerResult.offer.id);
  assert.equal(rawOffer.status, 'accepted');
  assert.equal(rawOffer.resultingJobId, acceptResult.jobId);

  const syntheticJob = await services.jobs.findById(acceptResult.jobId);
  assert.equal(syntheticJob.sourceType, 'direct_offer');
  assert.equal(syntheticJob.sourceOfferId, offerResult.offer.id);
  assert.equal(syntheticJob.employerId, employer.id);
  assert.equal(syntheticJob.workersNeeded, 1);
  assert.equal(syntheticJob.workersAccepted, 1);

  const syntheticApplications = await services.applications.listByJob(syntheticJob.id);
  assert.equal(syntheticApplications.length, 1);
  assert.equal(syntheticApplications[0].workerId, worker.id);
  assert.equal(syntheticApplications[0].status, 'accepted');

  const publicInProgressJobs = await services.jobs.list({ status: 'in_progress' });
  assert.equal(
    publicInProgressJobs.some(job => job.id === syntheticJob.id),
    false,
    'direct-offer synthetic job must not appear in normal public in_progress listing'
  );

  const explicitSyntheticJobs = await services.jobs.list({
    status: 'in_progress',
    sourceType: 'direct_offer',
  });

  assert.equal(
    explicitSyntheticJobs.some(job => job.id === syntheticJob.id),
    true,
    'direct-offer synthetic job should be queryable when sourceType filter is explicit'
  );
});

test('router read-only smoke: health, config, docs, and admin production readiness return JSON', async () => {
  const { createRouter } = await import('../../server/router.js');
  const router = createRouter();

  const healthResponse = await invokeRouter(router, {
    method: 'GET',
    pathname: '/api/health',
  });

  assert.equal(healthResponse.statusCode, 200);
  const health = parseJsonResponse(healthResponse);
  assert.equal(health.status, 'ok');
  assert.equal(health.version, '0.57.0');

  const configResponse = await invokeRouter(router, {
    method: 'GET',
    pathname: '/api/config',
  });

  assert.equal(configResponse.statusCode, 200);
  const publicConfig = parseJsonResponse(configResponse);
  assert.ok(publicConfig.BRAND);
  assert.ok(publicConfig.LABOR_CATEGORIES);
  assert.ok(publicConfig.REGIONS);

  const docsResponse = await invokeRouter(router, {
    method: 'GET',
    pathname: '/api/docs',
  });

  assert.equal(docsResponse.statusCode, 200);
  const docs = parseJsonResponse(docsResponse);
  assert.equal(docs.ok, true);
  assert.equal(docs.version, '0.57.0');
  assert.ok(Array.isArray(docs.routes));
  assert.ok(docs.routes.some(route => route.path === '/api/health'));

  const readinessResponse = await invokeRouter(router, {
    method: 'GET',
    pathname: '/api/admin/production/readiness',
    headers: {
      'x-admin-token': 'test-admin-token',
    },
  });

  assert.equal(readinessResponse.statusCode, 200);
  const readiness = parseJsonResponse(readinessResponse);
  assert.equal(readiness.ok, true);
  assert.ok(readiness.readiness);
});
