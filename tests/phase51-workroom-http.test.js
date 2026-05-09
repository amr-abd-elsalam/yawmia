import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

let dataDir;
let db;
let users;
let jobs;
let apps;
let sessions;
let predictive;
let server;
let baseUrl;
let employer;
let worker;
let tokenEmployer;
let tokenWorker;
let job;

async function request(method, path, body, headers = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) {}

  return { status: res.status, data };
}

async function bearer(token) {
  return { Authorization: 'Bearer ' + token };
}

async function setup() {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-p51-http-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  users = await import('../server/services/users.js');
  jobs = await import('../server/services/jobs.js');
  apps = await import('../server/services/applications.js');
  sessions = await import('../server/services/sessions.js');
  predictive = await import('../server/services/predictiveAbuse.js');

  await db.initDatabase();

  employer = await users.create('01040000001', 'employer');
  employer = await users.update(employer.id, {
    name: 'Employer HTTP',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
    verificationStatus: 'verified',
  });

  worker = await users.create('01040000002', 'worker');
  worker = await users.update(worker.id, {
    name: 'Worker HTTP',
    governorate: 'cairo',
    categories: ['cleaning'],
    lat: 30.0444,
    lng: 31.2357,
    verificationStatus: 'verified',
  });

  tokenEmployer = (await sessions.createSession(employer.id, employer.role)).token;
  tokenWorker = (await sessions.createSession(worker.id, worker.role)).token;

  job = await jobs.create(employer.id, {
    title: 'تنظيف HTTP',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 250,
    startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    durationDays: 1,
    description: 'HTTP test job',
    lat: 30.0444,
    lng: 31.2357,
  });

  const app = await apps.apply(job.id, worker.id);
  await apps.accept(app.application.id, employer.id);

  const { createRouter } = await import('../server/router.js');
  const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');

  const router = createRouter();

  server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    req.pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams);

    bodyParserMiddleware(req, res, () => {
      router(req, res);
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

async function cleanup() {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

async function createPredictiveFixture() {
  const now = Date.now();

  for (let i = 0; i < 14; i++) {
    const offer = {
      id: `dof_http_pred_${i}`,
      employerId: employer.id,
      workerId: `usr_http_w_${i}`,
      status: 'declined',
      proposedDailyWage: 250,
      createdAt: new Date(now - i * 60000).toISOString(),
      updatedAt: new Date(now - i * 60000).toISOString(),
      declinedAt: new Date(now - i * 60000).toISOString(),
      expiresAt: new Date(now + 120000).toISOString(),
    };
    await db.atomicWrite(db.getWriteRecordPath('direct_offers', offer.id), offer);
  }
}

test.before(setup);
test.after(cleanup);

test('GET /api/users/:id/trust-v2 returns public-safe trust score', async () => {
  const res = await request('GET', `/api/users/${worker.id}/trust-v2`);
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.trust.userId, worker.id);
  assert.equal(res.data.trust.rawMetrics, undefined);
});

test('GET /api/admin/users/:id/trust-v2 requires admin and returns admin-rich trust score', async () => {
  const noAdmin = await request('GET', `/api/admin/users/${worker.id}/trust-v2`);
  assert.equal(noAdmin.status, 401);

  const res = await request('GET', `/api/admin/users/${worker.id}/trust-v2`, null, {
    'X-Admin-Token': process.env.ADMIN_TOKEN,
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.ok(res.data.trust.rawMetrics);
});

test('GET /api/workrooms requires auth', async () => {
  const res = await request('GET', '/api/workrooms');
  assert.equal(res.status, 401);
});

test('GET /api/workrooms lists user workrooms', async () => {
  const res = await request('GET', '/api/workrooms', null, await bearer(tokenWorker));
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.ok(Array.isArray(res.data.workrooms));
  assert.ok(res.data.workrooms.some(w => w.jobId === job.id));
});

test('GET /api/workrooms/:id returns workroom', async () => {
  const res = await request('GET', `/api/workrooms/${job.id}`, null, await bearer(tokenWorker));
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.workroom.jobId, job.id);
});

test('POST /api/workrooms/:id/messages sends workroom message', async () => {
  const res = await request('POST', `/api/workrooms/${job.id}/messages`, {
    text: 'أنا في الطريق',
    templateKey: 'worker_0',
  }, await bearer(tokenWorker));

  assert.equal(res.status, 201);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.message.source, 'workroom');
  assert.equal(res.data.message.templateKey, 'worker_0');
});

test('GET /api/workrooms/:id/messages lists messages', async () => {
  const res = await request('GET', `/api/workrooms/${job.id}/messages`, null, await bearer(tokenWorker));

  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.ok(Array.isArray(res.data.items));
});

test('POST /api/workrooms/:id/messages/read-all marks messages read', async () => {
  const res = await request('POST', `/api/workrooms/${job.id}/messages/read-all`, {}, await bearer(tokenWorker));

  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
});

test('GET /api/workrooms/:id/timeline returns timeline', async () => {
  const res = await request('GET', `/api/workrooms/${job.id}/timeline`, null, await bearer(tokenWorker));

  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.ok(Array.isArray(res.data.timeline));
});

test('admin predictive abuse dashboard and scan routes', async () => {
  await createPredictiveFixture();

  const scan = await request('POST', '/api/admin/predictive-abuse/run-scan', {}, {
    'X-Admin-Token': process.env.ADMIN_TOKEN,
  });

  assert.equal(scan.status, 200);
  assert.equal(scan.data.ok, true);

  const dashboard = await request('GET', '/api/admin/predictive-abuse/dashboard', null, {
    'X-Admin-Token': process.env.ADMIN_TOKEN,
  });

  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.ok, true);
  assert.ok(dashboard.data.metrics);

  const signals = await request('GET', '/api/admin/predictive-abuse/signals?status=active', null, {
    'X-Admin-Token': process.env.ADMIN_TOKEN,
  });

  assert.equal(signals.status, 200);
  assert.equal(signals.data.ok, true);
  assert.ok(Array.isArray(signals.data.signals));

  if (signals.data.signals.length > 0) {
    const sigId = signals.data.signals[0].id;

    const dismiss = await request('POST', `/api/admin/predictive-abuse/signals/${sigId}/dismiss`, {
      note: 'test dismiss',
    }, {
      'X-Admin-Token': process.env.ADMIN_TOKEN,
    });

    assert.equal(dismiss.status, 200);
    assert.equal(dismiss.data.ok, true);
    assert.equal(dismiss.data.signal.status, 'dismissed');
  }
});

test('admin decision quality and backlog priority routes', async () => {
  const dq = await request('GET', '/api/admin/trust/decision-quality', null, {
    'X-Admin-Token': process.env.ADMIN_TOKEN,
  });

  assert.equal(dq.status, 200);
  assert.equal(dq.data.ok, true);
  assert.ok(dq.data.warningEffectiveness);

  const backlog = await request('GET', '/api/admin/trust/backlog-priority', null, {
    'X-Admin-Token': process.env.ADMIN_TOKEN,
  });

  assert.equal(backlog.status, 200);
  assert.equal(backlog.data.ok, true);
  assert.ok(Array.isArray(backlog.data.items));
});
