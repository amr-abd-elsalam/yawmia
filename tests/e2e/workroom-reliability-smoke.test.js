// ═══════════════════════════════════════════════════════════════
// tests/e2e/workroom-reliability-smoke.test.js
// Patch 25 — Workroom Reliability Expansion
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for Workroom V2 collaboration surfaces.
//
// Covers:
//   - workroom message baseline
//   - pins lifecycle
//   - checklist lifecycle
//   - read receipts
//   - message search
//   - attachment metadata validation
//   - handler-level short-query validation
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no server.js import
//   - no router.js import
//   - no queue workers
//   - no schedulers
//   - no OTP weakening
//   - no real ./data mutation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setupTempDataPath() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-workroom-smoke-'));
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.YAWMIA_DATA_PATH = dir;
  return dir;
}

async function importFresh(path) {
  return await import(`${path}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

async function waitFor(fn, options = {}) {
  const timeoutMs = options.timeoutMs || 1500;
  const intervalMs = options.intervalMs || 25;
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  if (lastError) throw lastError;
  throw new Error(options.message || 'waitFor timeout');
}

function createMockJsonRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writableEnded: false,
    destroyed: false,
    headersSent: false,

    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },

    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headersSent = true;
      for (const [key, value] of Object.entries(headers)) {
        this.headers[key.toLowerCase()] = value;
      }
    },

    write(chunk) {
      this.body += chunk ? String(chunk) : '';
    },

    end(chunk) {
      if (chunk) this.body += String(chunk);
      this.writableEnded = true;
    },
  };

  return res;
}

function parseJsonRes(res) {
  try {
    return JSON.parse(res.body || '{}');
  } catch (_) {
    return {};
  }
}

async function createFixture() {
  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');

  const employer = await users.create('01000000001', 'employer');
  const worker = await users.create('01000000002', 'worker');

  await users.update(employer.id, {
    name: 'صاحب عمل اختبار',
    governorate: 'cairo',
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
  });

  await users.update(worker.id, {
    name: 'عامل اختبار',
    governorate: 'cairo',
    categories: ['cleaning'],
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
  });

  const job = await jobs.create(employer.id, {
    title: 'تنظيف مكتب اختبار',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 250,
    startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    durationDays: 1,
    description: 'فرصة اختبار لمساحة العمل',
    area: 'مدينة نصر',
    address: 'عنوان اختبار',
    landmark: 'بجوار نقطة اختبار',
  });

  const appResult = await applications.apply(job.id, worker.id);
  assert.equal(appResult.ok, true, 'worker should apply successfully');

  const acceptResult = await applications.accept(appResult.application.id, employer.id);
  assert.equal(acceptResult.ok, true, 'employer should accept worker');

  const startResult = await jobs.startJob(job.id, employer.id);
  assert.equal(startResult.ok, true, 'filled job should start');

  return {
    database,
    users,
    jobs,
    applications,
    employer: await users.findById(employer.id),
    worker: await users.findById(worker.id),
    job: await jobs.findById(job.id),
    application: acceptResult.application,
  };
}

test('Patch 25: Workroom V2 pins, checklist, receipts, search, attachment metadata smoke', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const fixture = await createFixture();

  const workroom = await importFresh('../../server/services/workroom.js');
  const pins = await importFresh('../../server/services/workroomPins.js');
  const checklist = await importFresh('../../server/services/workroomChecklist.js');
  const receipts = await importFresh('../../server/services/workroomReceipts.js');
  const search = await importFresh('../../server/services/workroomSearch.js');
  const attachments = await importFresh('../../server/services/workroomAttachments.js');

  const { employer, worker, job } = fixture;

  // ── Workroom access smoke ─────────────────────────────────
  const employerWorkroom = await workroom.getWorkroom(job.id, employer.id);
  assert.equal(employerWorkroom.ok, true, 'employer should access workroom');
  assert.equal(employerWorkroom.workroom.jobId, job.id);

  const workerWorkroom = await workroom.getWorkroom(job.id, worker.id);
  assert.equal(workerWorkroom.ok, true, 'accepted worker should access workroom');
  assert.equal(workerWorkroom.workroom.jobId, job.id);

  // ── Message baseline ──────────────────────────────────────
  const searchableText = 'رسالة بحث عربية فريدة عن تنظيف المكتب وسلّم البوابة';
  const msgResult = await workroom.sendWorkroomMessage(job.id, employer.id, {
    recipientId: worker.id,
    text: searchableText,
    templateKey: 'test_searchable_message',
  });

  assert.equal(msgResult.ok, true, 'workroom message should send');
  assert.ok(msgResult.message.id.startsWith('msg_'), 'message id should be msg_*');
  assert.equal(msgResult.message.source, 'workroom', 'message source should be workroom');

  const messageId = msgResult.message.id;

  const listedMessages = await workroom.listWorkroomMessages(job.id, employer.id, {
    limit: 20,
    offset: 0,
  });

  assert.equal(listedMessages.ok, true, 'listWorkroomMessages should succeed');
  assert.ok(
    listedMessages.items.some(m => m.id === messageId),
    'sent message should appear in workroom message list'
  );

  // ── Pins lifecycle ────────────────────────────────────────
  const pinResult = await pins.pinMessage(job.id, messageId, employer.id, 'رسالة مهمة للاختبار');
  assert.equal(pinResult.ok, true, 'pinMessage should succeed');

  const pinsAfterPin = await pins.listPins(job.id, employer.id);
  assert.ok(
    JSON.stringify(pinsAfterPin).includes(messageId),
    'listPins should include pinned message id'
  );

  const unpinResult = await pins.unpinMessage(job.id, messageId, employer.id);
  assert.equal(unpinResult.ok, true, 'unpinMessage should succeed');

  const pinsAfterUnpin = await pins.listPins(job.id, employer.id);
  assert.equal(
    JSON.stringify(pinsAfterUnpin).includes(messageId),
    false,
    'listPins should not include message after unpin'
  );

  // ── Checklist lifecycle ───────────────────────────────────
  const createItem = await checklist.createChecklistItem(job.id, employer.id, {
    text: 'تأكيد عنوان البوابة مع العامل',
    assignedTo: worker.id,
  });

  assert.equal(createItem.ok, true, 'createChecklistItem should succeed');
  assert.ok(createItem.item.id, 'checklist item should have id');

  const checklistAfterCreate = await checklist.getChecklist(job.id, employer.id);
  assert.ok(
    JSON.stringify(checklistAfterCreate).includes(createItem.item.id),
    'created checklist item should appear in checklist'
  );

  const updateItem = await checklist.updateChecklistItem(
    job.id,
    createItem.item.id,
    employer.id,
    {
      text: 'تم تأكيد عنوان البوابة مع العامل',
      status: 'completed',
      assignedTo: worker.id,
    }
  );

  assert.equal(updateItem.ok, true, 'updateChecklistItem should succeed');
  assert.equal(updateItem.item.status, 'completed', 'checklist item should be completed');

  const deleteItem = await checklist.deleteChecklistItem(job.id, createItem.item.id, employer.id);
  assert.equal(deleteItem.ok, true, 'deleteChecklistItem should succeed');

  const checklistAfterDelete = await checklist.getChecklist(job.id, employer.id);
  assert.equal(
    JSON.stringify(checklistAfterDelete).includes(createItem.item.id),
    false,
    'deleted checklist item should not appear in checklist'
  );

  // ── Read receipts lifecycle ───────────────────────────────
  const markRead = await receipts.markMessageRead(job.id, messageId, worker.id);
  assert.equal(markRead.ok, true, 'markMessageRead should succeed');

  const readReceipts = await receipts.getReadReceipts(job.id);
  const receiptString = JSON.stringify(readReceipts);
  assert.ok(receiptString.includes(messageId), 'read receipts should reference message id');
  assert.ok(receiptString.includes(worker.id), 'read receipts should reference reader user id');

  const readAll = await workroom.markWorkroomRead(job.id, worker.id);
  assert.equal(readAll.ok, true, 'markWorkroomRead should remain compatible');

  // ── Workroom search ───────────────────────────────────────
  const searchResult = await waitFor(async () => {
    const result = await search.searchWorkroomMessages(job.id, 'تنظيف المكتب', {
      userId: employer.id,
      limit: 10,
    });

    const serialized = JSON.stringify(result);
    return serialized.includes(messageId) ? result : null;
  }, {
    timeoutMs: 2000,
    intervalMs: 50,
    message: 'workroom search did not index/find message',
  });

  assert.ok(searchResult, 'workroom search should find deterministic Arabic message');

  // ── Attachment metadata validation ────────────────────────
  const safeAttachment = {
    type: 'image',
    imageRef: 'img_abcdef12',
    caption: 'صورة مرجعية للموقع',
    clientName: 'gate-photo.jpg',
  };

  const attachmentValidation = attachments.validateAttachmentList([safeAttachment]);
  assert.equal(attachmentValidation.ok, true, 'safe attachment metadata should validate');

  const normalizedAttachmentString = JSON.stringify(attachmentValidation.attachments || []);
  assert.ok(normalizedAttachmentString.includes('img_abcdef12'), 'validated metadata should keep imageRef');
  assert.equal(
    normalizedAttachmentString.includes('data:image/'),
    false,
    'validated attachment metadata should not contain raw base64 data URI'
  );

  // ── Workroom summary smoke ────────────────────────────────
  const summary = await workroom.getWorkroomSummary(job.id, employer.id);
  assert.equal(summary.ok, true, 'getWorkroomSummary should succeed');
  assert.ok(summary.summary, 'workroom summary should exist');
});

test('Patch 25: workroom search handler rejects too-short query', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const fixture = await createFixture();
  const handler = await importFresh('../../server/handlers/workroomHandler.js');

  const req = {
    method: 'GET',
    pathname: `/api/workrooms/${fixture.job.id}/search`,
    params: { id: fixture.job.id },
    query: { q: 'أ' },
    headers: {},
    body: {},
    user: fixture.employer,
    session: { token: 'test-session-token', userId: fixture.employer.id },
    socket: {
      remoteAddress: '127.0.0.1',
      setTimeout() {},
    },
  };

  const res = createMockJsonRes();

  await handler.handleSearchWorkroomMessages(req, res);

  const data = parseJsonRes(res);
  assert.equal(res.statusCode, 400, 'short workroom search query should return 400');
  assert.equal(data.code, 'QUERY_TOO_SHORT');
});
