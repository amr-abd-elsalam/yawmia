import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir;
let db;
let queue;
let server;
let baseUrl;

function runMiddleware(middlewares, req, res, done) {
  let idx = 0;
  function next(err) {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      return;
    }
    const mw = middlewares[idx++];
    if (!mw) return done();
    mw(req, res, next);
  }
  next();
}

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-phase52-http-'));
  process.env.YAWMIA_DATA_PATH = dataDir;
  process.env.ADMIN_TOKEN = 'phase52-admin-token';

  db = await import('../server/services/database.js');
  await db.initDatabase();

  queue = await import('../server/services/opsQueue.js');

  const { createRouter } = await import('../server/router.js');
  const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');

  const router = createRouter();

  server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    req.pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams);

    runMiddleware([bodyParserMiddleware], req, res, () => {
      router(req, res);
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  delete process.env.ADMIN_TOKEN;
  await rm(dataDir, { recursive: true, force: true });
});

function adminHeaders(extra = {}) {
  return {
    'X-Admin-Token': 'phase52-admin-token',
    'Content-Type': 'application/json',
    ...extra,
  };
}

test('non-admin rejected from queue stats', async () => {
  const res = await fetch(`${baseUrl}/api/admin/ops-queue/stats`);
  assert.equal(res.status, 401);
});

test('admin can get queue stats', async () => {
  const res = await fetch(`${baseUrl}/api/admin/ops-queue/stats`, {
    headers: adminHeaders(),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.stats);
});

test('admin can list queue jobs and get detail', async () => {
  const enq = await queue.enqueueJob({
    type: 'http_test',
    payload: {},
  });

  const listRes = await fetch(`${baseUrl}/api/admin/ops-queue/jobs`, {
    headers: adminHeaders(),
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.ok, true);
  assert.equal(listData.jobs.some(j => j.id === enq.job.id), true);

  const detailRes = await fetch(`${baseUrl}/api/admin/ops-queue/jobs/${enq.job.id}`, {
    headers: adminHeaders(),
  });
  assert.equal(detailRes.status, 200);
  const detailData = await detailRes.json();
  assert.equal(detailData.ok, true);
  assert.equal(detailData.job.id, enq.job.id);
});

test('admin can cancel and retry queue job', async () => {
  const enq = await queue.enqueueJob({
    type: 'http_cancel_retry',
    payload: {},
  });

  const cancelRes = await fetch(`${baseUrl}/api/admin/ops-queue/jobs/${enq.job.id}/cancel`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ reason: 'test cancel' }),
  });
  assert.equal(cancelRes.status, 200);
  const cancelData = await cancelRes.json();
  assert.equal(cancelData.ok, true);
  assert.equal(cancelData.job.status, 'cancelled');

  const retryRes = await fetch(`${baseUrl}/api/admin/ops-queue/jobs/${enq.job.id}/retry`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });
  assert.equal(retryRes.status, 200);
  const retryData = await retryRes.json();
  assert.equal(retryData.ok, true);
  assert.equal(retryData.job.status, 'pending');
});

test('admin can list dead-letter jobs', async () => {
  const enq = await queue.enqueueJob({
    type: 'http_dlq',
    payload: {},
    maxAttempts: 1,
  });

  await queue.claimNextJobs({ workerId: 'http-worker', limit: 10 });
  await queue.failJob(enq.job.id, new Error('dlq'), { retryable: true });

  const res = await fetch(`${baseUrl}/api/admin/ops-queue/dead-letter`, {
    headers: adminHeaders(),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.jobs.some(j => j.id === enq.job.id), true);
});

test('admin can access alert delivery health/list', async () => {
  const healthRes = await fetch(`${baseUrl}/api/admin/alerts/health`, {
    headers: adminHeaders(),
  });
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.ok, true);

  const listRes = await fetch(`${baseUrl}/api/admin/alerts/deliveries`, {
    headers: adminHeaders(),
  });
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.ok, true);
});

test('async export endpoint requires admin', async () => {
  const res = await fetch(`${baseUrl}/api/admin/exports/audit-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
});

test('admin async audit export endpoint returns exportId and queueJobId', async () => {
  const res = await fetch(`${baseUrl}/api/admin/exports/audit-log`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 202);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.exportId);
  assert.ok(data.queueJobId);
});
