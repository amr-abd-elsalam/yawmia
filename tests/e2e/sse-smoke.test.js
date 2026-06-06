// ═══════════════════════════════════════════════════════════════
// tests/e2e/sse-smoke.test.js — Patch 24: SSE Reliability Smoke Tests
// ═══════════════════════════════════════════════════════════════
// Test-only practical reliability coverage for realtime communication paths.
// No server.js boot.
// No router.js import.
// No queue workers.
// No schedulers.
// No external services.
// Temp data path only.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

const TEST_TIMEOUT_MS = 2500;

let tempDirs = [];

// ─────────────────────────────────────────────────────────────
// Mock native req/res helpers
// ─────────────────────────────────────────────────────────────

function createMockReq({
  method = 'GET',
  pathname = '/',
  query = {},
  headers = {},
  body = {},
} = {}) {
  const req = new EventEmitter();

  req.method = method;
  req.pathname = pathname;
  req.query = query;
  req.headers = headers;
  req.body = body;
  req.socket = {
    remoteAddress: '127.0.0.1',
    setTimeout: () => {},
  };

  return req;
}

function createSseMockRes() {
  const res = new EventEmitter();

  res.statusCode = 200;
  res.headers = {};
  res.headersSent = false;
  res.writableEnded = false;
  res.destroyed = false;
  res.chunks = [];

  res.setHeader = function setHeader(key, value) {
    res.headers[key.toLowerCase()] = value;
  };

  res.writeHead = function writeHead(statusCode, headers = {}) {
    res.statusCode = statusCode;
    for (const [key, value] of Object.entries(headers)) {
      res.headers[key.toLowerCase()] = value;
    }
    res.headersSent = true;
  };

  res.write = function write(chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
    res.chunks.push(text);
    res.emit('write', text);
    return true;
  };

  res.end = function end(chunk) {
    if (chunk !== undefined) res.write(chunk);
    res.writableEnded = true;
    res.emit('finish');
  };

  res.close = function close() {
    if (res.destroyed) return;
    res.destroyed = true;
    res.writableEnded = true;
    res.emit('close');
  };

  return res;
}

function sseText(res) {
  return res.chunks.join('');
}

function parseSseEvents(text) {
  return text
    .split('\n\n')
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const event = { event: 'message', data: '', id: null };
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event.event = line.slice('event:'.length).trim();
        else if (line.startsWith('data:')) event.data += line.slice('data:'.length).trim();
        else if (line.startsWith('id:')) event.id = line.slice('id:'.length).trim();
      }

      try {
        event.json = event.data ? JSON.parse(event.data) : null;
      } catch (_) {
        event.json = null;
      }

      return event;
    });
}

function findSseEvent(res, eventName) {
  return parseSseEvents(sseText(res)).find(evt => evt.event === eventName) || null;
}

async function waitForSseEvent(res, eventName, predicate = () => true, timeoutMs = TEST_TIMEOUT_MS) {
  const existing = findSseEvent(res, eventName);
  if (existing && predicate(existing)) return existing;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());

    await Promise.race([
      once(res, 'write'),
      new Promise(resolve => setTimeout(resolve, Math.min(remaining, 25))),
    ]).catch(() => {});

    const evt = findSseEvent(res, eventName);
    if (evt && predicate(evt)) return evt;
  }

  assert.fail(`Timed out waiting for SSE event: ${eventName}\n\nCaptured:\n${sseText(res)}`);
}

// ─────────────────────────────────────────────────────────────
// Test data helpers
// ─────────────────────────────────────────────────────────────

async function setupTempDataPath() {
  const dir = await mkdtemp(join(os.tmpdir(), 'yawmia-sse-smoke-'));
  tempDirs.push(dir);
  process.env.YAWMIA_DATA_PATH = dir;

  const { initDatabase } = await import('../../server/services/database.js');
  await initDatabase();

  return dir;
}

async function createUserWithSession({
  phone,
  role,
  name,
  governorate = 'cairo',
  categories = ['farming'],
}) {
  const users = await import('../../server/services/users.js');
  const sessions = await import('../../server/services/sessions.js');

  let user = await users.create(phone, role);
  user = await users.update(user.id, {
    name,
    governorate,
    categories: role === 'worker' ? categories : undefined,
    verificationStatus: 'verified',
  });

  const session = await sessions.createSession(user.id, user.role, {
    ip: '127.0.0.1',
    userAgent: 'node-test',
  });

  return { user, session };
}

async function createBasicMarketplaceFixture(seed = '001') {
  await setupTempDataPath();

  const employer = await createUserWithSession({
    phone: `0101000${seed}`,
    role: 'employer',
    name: `Employer ${seed}`,
    governorate: 'cairo',
  });

  const worker = await createUserWithSession({
    phone: `0111000${seed}`,
    role: 'worker',
    name: `Worker ${seed}`,
    governorate: 'cairo',
    categories: ['farming'],
  });

  const jobs = await import('../../server/services/jobs.js');
  const job = await jobs.create(employer.user.id, {
    title: `حصاد يومي ${seed}`,
    category: 'farming',
    governorate: 'cairo',
    location: 'Test location',
    workersNeeded: 1,
    dailyWage: 250,
    startDate: '2026-06-10',
    durationDays: 1,
    description: 'Smoke test job',
  });

  return { employer, worker, job };
}

async function openNotificationStream(sessionToken) {
  const { handleNotificationStream } = await import('../../server/handlers/sseHandler.js');

  const req = createMockReq({
    method: 'GET',
    pathname: '/api/notifications/stream',
    query: { token: sessionToken },
    headers: {},
  });
  const res = createSseMockRes();

  await handleNotificationStream(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/event-stream');
  assert.match(sseText(res), /retry:\s*\d+/);

  return res;
}

async function openLiveFeedStream(sessionToken) {
  const { handleLiveFeedStream } = await import('../../server/handlers/liveFeedHandler.js');

  const req = createMockReq({
    method: 'GET',
    pathname: '/api/jobs/live-feed',
    query: { token: sessionToken },
    headers: {},
  });
  const res = createSseMockRes();

  await handleLiveFeedStream(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/event-stream');
  assert.match(sseText(res), /retry:\s*\d+/);

  return res;
}

async function closeRealtimeState(responses = []) {
  for (const res of responses) {
    try { res.close(); } catch (_) {}
  }

  try {
    const liveFeed = await import('../../server/services/liveFeed.js');
    if (typeof liveFeed.clearConnections === 'function') {
      liveFeed.clearConnections();
    }
  } catch (_) {}

  try {
    const adminSse = await import('../../server/handlers/adminSseHandler.js');
    if (adminSse._testHelpers && typeof adminSse._testHelpers.resetState === 'function') {
      adminSse._testHelpers.resetState();
    }
  } catch (_) {}

  try {
    const replay = await import('../../server/services/eventReplayBuffer.js');
    if (typeof replay.clear === 'function') {
      replay.clear();
    }
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────

test.afterEach(async () => {
  await closeRealtimeState();
});

test.after(async () => {
  for (const dir of tempDirs) {
    // Safe: test-created temp dir under os.tmpdir(), never ./data.
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

test('Notification SSE sends init event with unread count and userId', async () => {
  await setupTempDataPath();

  const { user, session } = await createUserWithSession({
    phone: '01020000001',
    role: 'worker',
    name: 'SSE Worker Init',
    governorate: 'cairo',
    categories: ['farming'],
  });

  const res = await openNotificationStream(session.token);

  const init = await waitForSseEvent(res, 'init');
  assert.equal(init.json.userId, user.id);
  assert.equal(typeof init.json.unreadCount, 'number');

  res.close();
});

test('Notification SSE fans out created notification to connected user', async () => {
  await setupTempDataPath();

  const { user, session } = await createUserWithSession({
    phone: '01020000002',
    role: 'worker',
    name: 'SSE Worker Fanout',
    governorate: 'cairo',
    categories: ['farming'],
  });

  const res = await openNotificationStream(session.token);

  const { createNotification } = await import('../../server/services/notifications.js');
  const notification = await createNotification(
    user.id,
    'activity_summary',
    'Smoke notification fanout',
    { source: 'sse-smoke' }
  );

  assert.ok(notification);
  const evt = await waitForSseEvent(res, 'notification', e => e.json && e.json.id === notification.id);

  assert.equal(evt.json.userId, user.id);
  assert.equal(evt.json.type, 'activity_summary');
  assert.equal(evt.json.message, 'Smoke notification fanout');

  res.close();
});

test('Workroom message emits workroom_message SSE to recipient', async () => {
  const { employer, worker, job } = await createBasicMarketplaceFixture('003');

  const { setupNotificationListeners } = await import('../../server/services/notifications.js');
  setupNotificationListeners();

  const applications = await import('../../server/services/applications.js');
  const jobs = await import('../../server/services/jobs.js');
  const workroom = await import('../../server/services/workroom.js');

  const appResult = await applications.apply(job.id, worker.user.id);
  assert.equal(appResult.ok, true);

  const acceptResult = await applications.accept(appResult.application.id, employer.user.id);
  assert.equal(acceptResult.ok, true);

  const startResult = await jobs.startJob(job.id, employer.user.id);
  assert.equal(startResult.ok, true);

  const res = await openNotificationStream(worker.session.token);

  const sendResult = await workroom.sendWorkroomMessage(job.id, employer.user.id, {
    recipientId: worker.user.id,
    text: 'رسالة smoke من صاحب العمل',
  });

  assert.equal(sendResult.ok, true);

  const evt = await waitForSseEvent(
    res,
    'workroom_message',
    e => e.json && e.json.messageId === sendResult.message.id
  );

  assert.equal(evt.json.jobId, job.id);
  assert.equal(evt.json.senderId, employer.user.id);
  assert.equal(evt.json.text, 'رسالة smoke من صاحب العمل');

  res.close();
});

test('Live Feed SSE sends init event with jobs, filters, and userId', async () => {
  await setupTempDataPath();

  const { user, session } = await createUserWithSession({
    phone: '01020000004',
    role: 'worker',
    name: 'Live Feed Init Worker',
    governorate: 'cairo',
    categories: ['farming'],
  });

  const res = await openLiveFeedStream(session.token);

  const init = await waitForSseEvent(res, 'init');
  assert.equal(init.json.userId, user.id);
  assert.ok(Array.isArray(init.json.jobs));
  assert.ok(init.json.filters);
  assert.equal(init.json.filters.governorate, 'cairo');

  res.close();
});

test('Live Feed SSE fans out matching job_created event', async () => {
  await setupTempDataPath();

  const { session } = await createUserWithSession({
    phone: '01020000005',
    role: 'worker',
    name: 'Live Feed Fanout Worker',
    governorate: 'cairo',
    categories: ['farming'],
  });

  const res = await openLiveFeedStream(session.token);

  const { broadcastJobCreated } = await import('../../server/services/liveFeed.js');

  const job = {
    id: 'job_live_feed_smoke',
    title: 'فرصة live feed smoke',
    category: 'farming',
    governorate: 'cairo',
    dailyWage: 300,
    workersNeeded: 1,
    workersAccepted: 0,
    durationDays: 1,
    startDate: '2026-06-10',
    urgency: 'normal',
    status: 'open',
    createdAt: new Date().toISOString(),
  };

  broadcastJobCreated(job);

  const evt = await waitForSseEvent(res, 'job_created', e => e.json && e.json.id === job.id);
  assert.equal(evt.json.title, job.title);
  assert.equal(evt.json.category, 'farming');
  assert.equal(evt.json.governorate, 'cairo');

  res.close();
});

test('Admin SSE sends init event with subscribed events', async () => {
  await setupTempDataPath();

  const { handleAdminEventStream } = await import('../../server/handlers/adminSseHandler.js');

  const req = createMockReq({
    method: 'GET',
    pathname: '/api/admin/events',
    query: {},
    headers: { 'x-admin-token': 'test-admin-token' },
  });
  const res = createSseMockRes();

  await handleAdminEventStream(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/event-stream');
  assert.match(sseText(res), /retry:\s*\d+/);

  const init = await waitForSseEvent(res, 'init');
  assert.equal(init.json.adminId, 'admin_token');
  assert.ok(Array.isArray(init.json.subscribedEvents));
  assert.ok(init.json.subscribedEvents.includes('csv_export:progress'));

  res.close();
});

test('Admin SSE fans out EventBus csv_export:progress event', async () => {
  await setupTempDataPath();

  const { handleAdminEventStream } = await import('../../server/handlers/adminSseHandler.js');
  const { eventBus } = await import('../../server/services/eventBus.js');

  const req = createMockReq({
    method: 'GET',
    pathname: '/api/admin/events',
    query: {},
    headers: { 'x-admin-token': 'test-admin-token' },
  });
  const res = createSseMockRes();

  await handleAdminEventStream(req, res);
  await waitForSseEvent(res, 'init');

  eventBus.emit('csv_export:progress', {
    exportId: 'exp_sse_smoke',
    rowsProcessed: 1000,
    totalEstimate: 2000,
    percentage: 50,
    completed: false,
  });

  const evt = await waitForSseEvent(
    res,
    'csv_export:progress',
    e => e.json && e.json.exportId === 'exp_sse_smoke'
  );

  assert.equal(evt.json.percentage, 50);
  assert.equal(evt.json.rowsProcessed, 1000);

  res.close();
});

test('Direct offer live status fans out to employer live feed connection', async () => {
  await setupTempDataPath();

  const { user } = await createUserWithSession({
    phone: '01020000008',
    role: 'employer',
    name: 'Employer Live Status',
    governorate: 'cairo',
  });

  const liveFeed = await import('../../server/services/liveFeed.js');

  const res = createSseMockRes();
  liveFeed.registerConnection(user.id, res, { governorate: 'cairo' });

  liveFeed.sendDirectOfferStatusToEmployer(user.id, {
    offerId: 'dof_sse_smoke',
    workerId: 'usr_worker_smoke',
    jobId: 'job_sse_smoke',
    status: 'accepted',
  });

  const evt = await waitForSseEvent(
    res,
    'direct_offer_status',
    e => e.json && e.json.offerId === 'dof_sse_smoke'
  );

  assert.equal(evt.json.status, 'accepted');
  assert.equal(evt.json.jobId, 'job_sse_smoke');

  res.close();
});
