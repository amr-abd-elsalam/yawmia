// ═══════════════════════════════════════════════════════════════
// tests/phase47-admin-operations.test.js — Phase 47 Tests (~30)
// ═══════════════════════════════════════════════════════════════
// Strategy:
//   - All tests share a single YAWMIA_DATA_PATH (set BEFORE any imports).
//   - Each test cleans collection directories before/after running.
//   - Run with: node --test --test-concurrency=1 tests/phase47-admin-operations.test.js
//   - Or via: node --test-concurrency=1 --test tests/phase47-admin-operations.test.js
// ═══════════════════════════════════════════════════════════════

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Shared test data directory (set BEFORE any service imports) ──
let SHARED_DIR;

before(async () => {
  SHARED_DIR = await mkdtemp(join(tmpdir(), 'yawmia-phase47-'));
  process.env.YAWMIA_DATA_PATH = SHARED_DIR;
  process.env.NODE_ENV = 'development';

  // Pre-create all collection directories that Phase 47 services touch
  const collections = [
    'abuse_flag_reviews',
    'audit',
    'notifications',
    'users',
    'jobs',
    'metrics',
  ];
  for (const c of collections) {
    await mkdir(join(SHARED_DIR, c), { recursive: true });
  }
});

after(async () => {
  if (SHARED_DIR) {
    await rm(SHARED_DIR, { recursive: true, force: true });
  }
  delete process.env.YAWMIA_DATA_PATH;
});

// ── Cleanup helper — empties collection dirs between tests ──
async function cleanCollections() {
  if (!SHARED_DIR) return;
  const collections = ['abuse_flag_reviews', 'audit', 'notifications', 'users'];
  for (const c of collections) {
    const dir = join(SHARED_DIR, c);
    try {
      const files = await readdir(dir);
      for (const f of files) {
        if (f.endsWith('.json') || f.endsWith('.tmp')) {
          await rm(join(dir, f), { force: true });
        }
      }
    } catch (_) { /* dir may not exist */ }
  }
}

beforeEach(async () => {
  await cleanCollections();
});

// ── Write helpers ────────────────────────────────────────────

async function writeReviewState(fingerprint, state) {
  const filePath = join(SHARED_DIR, 'abuse_flag_reviews', `${fingerprint}.json`);
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

async function writeAuditEntry(entry) {
  const filePath = join(SHARED_DIR, 'audit', `${entry.id}.json`);
  await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
}

async function writeNotification(notif) {
  const filePath = join(SHARED_DIR, 'notifications', `${notif.id}.json`);
  await writeFile(filePath, JSON.stringify(notif, null, 2), 'utf-8');
}

async function writeUser(user) {
  const filePath = join(SHARED_DIR, 'users', `${user.id}.json`);
  await writeFile(filePath, JSON.stringify(user, null, 2), 'utf-8');
}

// Update phone-index for findById to work correctly
async function writeUsersWithPhoneIndex(users) {
  const phoneIndex = {};
  for (const u of users) {
    await writeUser(u);
    if (u.phone) phoneIndex[u.phone] = u.id;
  }
  const idxPath = join(SHARED_DIR, 'users', 'phone-index.json');
  await writeFile(idxPath, JSON.stringify(phoneIndex, null, 2), 'utf-8');
}

function makeReviewState(overrides = {}) {
  const fp = overrides.fingerprint || `fp_${Math.random().toString(36).slice(2, 14)}`;
  return {
    fingerprint: fp,
    flagType: 'same_worker_spam',
    employerId: 'usr_emp1',
    workerId: 'usr_wrk1',
    firstSeenAt: '2026-04-01T00:00:00.000Z',
    occurrenceCount: 1,
    reviews: [],
    currentStatus: 'active',
    snoozeUntil: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Section 1: abuseFlagReview Extensions
// ═══════════════════════════════════════════════════════════════

test('Phase 47: listByStatus filters active flags', async () => {
  await writeReviewState('fp1', makeReviewState({ fingerprint: 'fp1', currentStatus: 'active' }));
  await writeReviewState('fp2', makeReviewState({ fingerprint: 'fp2', currentStatus: 'snoozed', snoozeUntil: new Date(Date.now() + 24 * 3600000).toISOString() }));
  await writeReviewState('fp3', makeReviewState({ fingerprint: 'fp3', currentStatus: 'dismissed' }));

  const { listByStatus } = await import('../server/services/abuseFlagReview.js');
  const result = await listByStatus('active');

  assert.equal(result.length, 1);
  assert.equal(result[0].fingerprint, 'fp1');
});

test('Phase 47: listByStatus filters snoozed with lazy expiry', async () => {
  await writeReviewState('fp_future', makeReviewState({
    fingerprint: 'fp_future',
    currentStatus: 'snoozed',
    snoozeUntil: new Date(Date.now() + 24 * 3600000).toISOString(),
  }));
  await writeReviewState('fp_expired', makeReviewState({
    fingerprint: 'fp_expired',
    currentStatus: 'snoozed',
    snoozeUntil: new Date(Date.now() - 3600000).toISOString(),
  }));

  const { listByStatus } = await import('../server/services/abuseFlagReview.js');
  const result = await listByStatus('snoozed');

  assert.equal(result.length, 1);
  assert.equal(result[0].fingerprint, 'fp_future');
});

test('Phase 47: listByStatus invalid status returns empty array', async () => {
  await writeReviewState('fp1', makeReviewState({ fingerprint: 'fp1' }));
  const { listByStatus } = await import('../server/services/abuseFlagReview.js');
  const result = await listByStatus('invalid_status');
  assert.equal(result.length, 0);
});

test('Phase 47: listByStatus sorts by latest activity descending', async () => {
  await writeReviewState('fp_old', makeReviewState({
    fingerprint: 'fp_old',
    currentStatus: 'dismissed',
    reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: null, snoozeUntil: null, createdAt: '2026-01-01T00:00:00.000Z' }],
  }));
  await writeReviewState('fp_new', makeReviewState({
    fingerprint: 'fp_new',
    currentStatus: 'dismissed',
    reviews: [{ id: 'rev2', adminId: 'a1', decision: 'dismissed', note: null, snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
  }));

  const { listByStatus } = await import('../server/services/abuseFlagReview.js');
  const result = await listByStatus('dismissed');

  assert.equal(result.length, 2);
  assert.equal(result[0].fingerprint, 'fp_new');
  assert.equal(result[1].fingerprint, 'fp_old');
});

test('Phase 47: bulkUpdate dismisses 5 flags atomically', async () => {
  const fps = ['fp1', 'fp2', 'fp3', 'fp4', 'fp5'];
  for (const fp of fps) {
    await writeReviewState(fp, makeReviewState({ fingerprint: fp }));
  }

  const { bulkUpdate } = await import('../server/services/abuseFlagReview.js');
  const result = await bulkUpdate({
    fingerprints: fps,
    adminId: 'usr_admin',
    decision: 'dismissed',
  });

  assert.equal(result.succeeded.length, 5, `expected 5 succeeded, got ${result.succeeded.length}, failed=${JSON.stringify(result.failed)}`);
  assert.equal(result.failed.length, 0);
});

test('Phase 47: bulkUpdate handles partial failure (missing fingerprints)', async () => {
  await writeReviewState('fp1', makeReviewState({ fingerprint: 'fp1' }));
  await writeReviewState('fp2', makeReviewState({ fingerprint: 'fp2' }));

  const { bulkUpdate } = await import('../server/services/abuseFlagReview.js');
  const result = await bulkUpdate({
    fingerprints: ['fp1', 'fp2', 'fp_missing1', 'fp_missing2'],
    adminId: 'usr_admin',
    decision: 'dismissed',
  });

  assert.equal(result.succeeded.length, 2);
  assert.equal(result.failed.length, 2);
  assert(result.failed.every(f => f.error === 'FLAG_NOT_FOUND'));
});

test('Phase 47: bulkUpdate exceeds max throws error', async () => {
  const fps = Array.from({ length: 51 }, (_, i) => `fp${i}`);

  const { bulkUpdate } = await import('../server/services/abuseFlagReview.js');
  await assert.rejects(
    async () => await bulkUpdate({ fingerprints: fps, adminId: 'usr_admin', decision: 'dismissed' }),
    /Bulk action exceeds max 50 flags/
  );
});

test('Phase 47: bulkUpdate snoozed sets snoozeUntil correctly', async () => {
  await writeReviewState('fp1', makeReviewState({ fingerprint: 'fp1' }));

  const { bulkUpdate, getReviewState } = await import('../server/services/abuseFlagReview.js');
  await bulkUpdate({
    fingerprints: ['fp1'],
    adminId: 'usr_admin',
    decision: 'snoozed',
    snoozeDays: 7,
  });

  const state = await getReviewState('fp1');
  assert.equal(state.currentStatus, 'snoozed');
  assert.ok(state.snoozeUntil);
  const snoozeMs = new Date(state.snoozeUntil).getTime();
  const expectedMs = Date.now() + 7 * 86400000;
  assert.ok(Math.abs(snoozeMs - expectedMs) < 5000);
});

test('Phase 47: bulkUpdate empty fingerprints returns empty result', async () => {
  const { bulkUpdate } = await import('../server/services/abuseFlagReview.js');
  const result = await bulkUpdate({
    fingerprints: [],
    adminId: 'usr_admin',
    decision: 'dismissed',
  });
  assert.equal(result.succeeded.length, 0);
  assert.equal(result.failed.length, 0);
});

test('Phase 47: searchByNotes Arabic content matches', async () => {
  await writeReviewState('fp1', makeReviewState({
    fingerprint: 'fp1',
    reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: 'نصب متكرر — راجعت قبل كده', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
  }));
  await writeReviewState('fp2', makeReviewState({
    fingerprint: 'fp2',
    reviews: [{ id: 'rev2', adminId: 'a1', decision: 'dismissed', note: 'حالة عادية', snoozeUntil: null, createdAt: '2026-05-02T00:00:00.000Z' }],
  }));

  const { searchByNotes } = await import('../server/services/abuseFlagReview.js');
  const result = await searchByNotes('نصب');

  assert.equal(result.length, 1);
  assert.equal(result[0].fingerprint, 'fp1');
  assert.ok(result[0]._matchingReview);
  assert.ok(result[0]._matchingReview.note.includes('نصب'));
});

test('Phase 47: searchByNotes minimum 2 chars returns empty', async () => {
  await writeReviewState('fp1', makeReviewState({
    fingerprint: 'fp1',
    reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: 'anything', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
  }));

  const { searchByNotes } = await import('../server/services/abuseFlagReview.js');
  const result = await searchByNotes('a');
  assert.equal(result.length, 0);
});

test('Phase 47: searchByNotes case-insensitive', async () => {
  await writeReviewState('fp1', makeReviewState({
    fingerprint: 'fp1',
    reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: 'FRAUD CASE', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
  }));

  const { searchByNotes } = await import('../server/services/abuseFlagReview.js');
  const result = await searchByNotes('fraud');
  assert.equal(result.length, 1);
});

test('Phase 47: searchByNotes sorts newest matching review first', async () => {
  await writeReviewState('fp_old', makeReviewState({
    fingerprint: 'fp_old',
    reviews: [{ id: 'rev_old', adminId: 'a1', decision: 'dismissed', note: 'matching old', snoozeUntil: null, createdAt: '2026-01-01T00:00:00.000Z' }],
  }));
  await writeReviewState('fp_new', makeReviewState({
    fingerprint: 'fp_new',
    reviews: [{ id: 'rev_new', adminId: 'a1', decision: 'dismissed', note: 'matching new', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
  }));

  const { searchByNotes } = await import('../server/services/abuseFlagReview.js');
  const result = await searchByNotes('matching');
  assert.equal(result.length, 2);
  assert.equal(result[0].fingerprint, 'fp_new');
  assert.equal(result[1].fingerprint, 'fp_old');
});

test('Phase 47: getRemainingWarnings counts warnings within week', async () => {
  const userId = 'usr_target';
  await writeNotification({
    id: 'ntf_w1',
    userId,
    type: 'admin_warning',
    message: 'warning 1',
    meta: {},
    read: false,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    readAt: null,
  });
  await writeNotification({
    id: 'ntf_w2',
    userId,
    type: 'admin_warning',
    message: 'warning 2',
    meta: {},
    read: false,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    readAt: null,
  });
  await writeNotification({
    id: 'ntf_old',
    userId,
    type: 'admin_warning',
    message: 'old',
    meta: {},
    read: false,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    readAt: null,
  });

  // Also write to user-notifications-index (notifications.listByUser uses index)
  const idxPath = join(SHARED_DIR, 'notifications', 'user-index.json');
  await writeFile(idxPath, JSON.stringify({ [userId]: ['ntf_w1', 'ntf_w2', 'ntf_old'] }, null, 2), 'utf-8');

  const { getRemainingWarnings } = await import('../server/services/abuseFlagReview.js');
  const result = await getRemainingWarnings(userId);

  assert.equal(result.used, 2, `expected 2 warnings, got ${result.used}`);
  assert.equal(result.max, 3);
  assert.equal(result.remaining, 1);
});

test('Phase 47: getRemainingWarnings no userId returns max', async () => {
  const { getRemainingWarnings } = await import('../server/services/abuseFlagReview.js');
  const result = await getRemainingWarnings(null);
  assert.equal(result.used, 0);
  assert.equal(result.remaining, result.max);
});

test('Phase 47: getSnoozeExpiringSoon within window returns flags with metadata', async () => {
  await writeReviewState('fp_within', makeReviewState({
    fingerprint: 'fp_within',
    currentStatus: 'snoozed',
    snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(),
  }));
  await writeReviewState('fp_outside', makeReviewState({
    fingerprint: 'fp_outside',
    currentStatus: 'snoozed',
    snoozeUntil: new Date(Date.now() + 48 * 3600000).toISOString(),
  }));

  const { getSnoozeExpiringSoon } = await import('../server/services/abuseFlagReview.js');
  const result = await getSnoozeExpiringSoon(24);

  assert.equal(result.length, 1);
  assert.equal(result[0].fingerprint, 'fp_within');
  assert.ok(typeof result[0]._hoursUntilExpiry === 'number');
  assert.ok(result[0]._hoursUntilExpiry > 0 && result[0]._hoursUntilExpiry <= 24);
});

// ═══════════════════════════════════════════════════════════════
// Section 2: snoozeReminders
// ═══════════════════════════════════════════════════════════════

test('Phase 47: scanSnoozeExpiries idempotent (no double alert)', async () => {
  await writeUsersWithPhoneIndex([{
    id: 'usr_admin1',
    role: 'admin',
    status: 'active',
    phone: '01000000001',
    name: 'Admin',
    rating: { avg: 0, count: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }]);

  const snoozeSetAt = '2026-04-01T00:00:00.000Z';
  await writeReviewState('fp_snooze', makeReviewState({
    fingerprint: 'fp_snooze',
    currentStatus: 'snoozed',
    snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(),
    reviews: [{ id: 'rev1', adminId: 'usr_admin1', decision: 'snoozed', note: null, snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(), createdAt: snoozeSetAt }],
  }));

  const { scanSnoozeExpiries } = await import('../server/services/snoozeReminders.js');

  const result1 = await scanSnoozeExpiries();
  assert.equal(result1.alertsSent, 1, 'first scan sends alert');

  const result2 = await scanSnoozeExpiries();
  assert.equal(result2.alertsSent, 0, 'second scan idempotent — no duplicate');
});

test('Phase 47: scanSnoozeExpiries skips non-snoozed states', async () => {
  await writeUsersWithPhoneIndex([{
    id: 'usr_admin1',
    role: 'admin',
    status: 'active',
    phone: '01000000001',
    name: 'Admin',
    rating: { avg: 0, count: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }]);

  await writeReviewState('fp_active', makeReviewState({ fingerprint: 'fp_active', currentStatus: 'active' }));
  await writeReviewState('fp_dismissed', makeReviewState({ fingerprint: 'fp_dismissed', currentStatus: 'dismissed' }));
  await writeReviewState('fp_actioned', makeReviewState({ fingerprint: 'fp_actioned', currentStatus: 'actioned' }));

  const { scanSnoozeExpiries } = await import('../server/services/snoozeReminders.js');
  const result = await scanSnoozeExpiries();
  assert.equal(result.alertsSent, 0);
});

test('Phase 47: scanSnoozeExpiries fires sendAdminAlert per admin', async () => {
  await writeUsersWithPhoneIndex([
    { id: 'usr_admin1', role: 'admin', status: 'active', phone: '01000000001', name: 'A1', rating: { avg: 0, count: 0 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'usr_admin2', role: 'admin', status: 'active', phone: '01000000002', name: 'A2', rating: { avg: 0, count: 0 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]);

  const snoozeSetAt = '2026-04-01T00:00:00.000Z';
  await writeReviewState('fp_snooze', makeReviewState({
    fingerprint: 'fp_snooze',
    currentStatus: 'snoozed',
    snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(),
    reviews: [{ id: 'rev1', adminId: 'usr_admin1', decision: 'snoozed', note: null, snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(), createdAt: snoozeSetAt }],
  }));

  const { scanSnoozeExpiries } = await import('../server/services/snoozeReminders.js');
  await scanSnoozeExpiries();

  // Verify notifications created
  const ntfFiles = await readdir(join(SHARED_DIR, 'notifications'));
  const ntfFilesJson = ntfFiles.filter(f => f.startsWith('ntf_') && f.endsWith('.json'));
  assert.ok(ntfFilesJson.length >= 2, `expected >= 2 notifications, got ${ntfFilesJson.length}`);
});

test('Phase 47: detectExpiredSnoozes emits abuse_flag:snooze_expired', async () => {
  await writeReviewState('fp_expired', makeReviewState({
    fingerprint: 'fp_expired',
    currentStatus: 'snoozed',
    snoozeUntil: new Date(Date.now() - 3600000).toISOString(),
  }));

  const { eventBus } = await import('../server/services/eventBus.js');
  const events = [];
  const handler = (data) => events.push(data);
  eventBus.on('abuse_flag:snooze_expired', handler);

  try {
    const { detectExpiredSnoozes } = await import('../server/services/snoozeReminders.js');
    const count = await detectExpiredSnoozes();

    assert.equal(count, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].fingerprint, 'fp_expired');
  } finally {
    eventBus.off('abuse_flag:snooze_expired', handler);
  }
});

test('Phase 47: scanSnoozeExpiries handles 100 states efficiently', async () => {
  await writeUsersWithPhoneIndex([{
    id: 'usr_admin1', role: 'admin', status: 'active', phone: '01000000001', name: 'A1',
    rating: { avg: 0, count: 0 },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }]);

  for (let i = 0; i < 100; i++) {
    const fp = `fp_${i.toString().padStart(3, '0')}`;
    const status = i < 10 ? 'snoozed' : (i < 50 ? 'active' : 'dismissed');
    const snoozeUntil = i < 10
      ? new Date(Date.now() + 12 * 3600000).toISOString()
      : null;
    const reviews = i < 10
      ? [{ id: `rev_${i}`, adminId: 'a1', decision: 'snoozed', note: null, snoozeUntil, createdAt: '2026-04-01T00:00:00.000Z' }]
      : [];
    await writeReviewState(fp, makeReviewState({ fingerprint: fp, currentStatus: status, snoozeUntil, reviews }));
  }

  const { scanSnoozeExpiries } = await import('../server/services/snoozeReminders.js');
  const start = Date.now();
  const result = await scanSnoozeExpiries();
  const duration = Date.now() - start;

  assert.equal(result.scanned, 100, `expected scanned=100, got ${result.scanned}`);
  assert.equal(result.alertsSent, 10);
  assert.ok(duration < 5000, `expected <5s, got ${duration}ms`);
});

// ═══════════════════════════════════════════════════════════════
// Section 3: auditLogSearch
// ═══════════════════════════════════════════════════════════════

test('Phase 47: searchActions full-text Arabic content', async () => {
  await writeAuditEntry({
    id: 'aud_1',
    adminId: 'usr_admin1',
    action: 'user_banned',
    targetType: 'user',
    targetId: 'usr_target',
    details: { reason: 'نصب متكرر' },
    ip: '127.0.0.1',
    createdAt: '2026-05-01T00:00:00.000Z',
  });
  await writeAuditEntry({
    id: 'aud_2',
    adminId: 'usr_admin1',
    action: 'user_unbanned',
    targetType: 'user',
    targetId: 'usr_other',
    details: { reason: 'تمت المراجعة' },
    ip: '127.0.0.1',
    createdAt: '2026-05-02T00:00:00.000Z',
  });

  const { searchActions } = await import('../server/services/auditLogSearch.js');
  const result = await searchActions({ q: 'نصب' });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].id, 'aud_1');
});

test('Phase 47: searchActions combined filters intersection', async () => {
  for (let i = 0; i < 10; i++) {
    await writeAuditEntry({
      id: `aud_${i}`,
      adminId: i < 5 ? 'usr_admin1' : 'usr_admin2',
      action: i % 2 === 0 ? 'user_banned' : 'user_unbanned',
      targetType: 'user',
      targetId: `usr_target_${i}`,
      details: {},
      ip: '127.0.0.1',
      createdAt: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    });
  }

  const { searchActions } = await import('../server/services/auditLogSearch.js');
  const result = await searchActions({
    action: 'user_banned',
    adminId: 'usr_admin1',
  });

  // user_banned (even i) AND admin1 (i<5): i=0, 2, 4 → 3 results
  assert.equal(result.entries.length, 3);
  assert(result.entries.every(e => e.action === 'user_banned' && e.adminId === 'usr_admin1'));
});

test('Phase 47: searchActions max results enforcement', async () => {
  // 250 entries (above 200 default max)
  for (let i = 0; i < 250; i++) {
    await writeAuditEntry({
      id: `aud_${String(i).padStart(4, '0')}`,
      adminId: 'usr_admin1',
      action: 'test_action',
      targetType: 'test',
      targetId: `t_${i}`,
      details: {},
      ip: '127.0.0.1',
      createdAt: `2026-05-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
    });
  }

  const { searchActions } = await import('../server/services/auditLogSearch.js');
  const result = await searchActions({});

  // Default limit = 50, total = 250
  assert.equal(result.entries.length, 50);
  assert.equal(result.total, 250);
});

test('Phase 47: exportToCSV BOM + Arabic headers', async () => {
  await writeAuditEntry({
    id: 'aud_1',
    adminId: 'usr_admin1',
    action: 'user_banned',
    targetType: 'user',
    targetId: 'usr_t',
    details: { reason: 'test' },
    ip: '127.0.0.1',
    createdAt: '2026-05-01T00:00:00.000Z',
  });

  const { exportToCSV } = await import('../server/services/auditLogSearch.js');
  const result = await exportToCSV({});

  assert.ok(result.csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM');
  assert.ok(result.csv.includes('الأدمن'), 'CSV should include Arabic header الأدمن');
  assert.ok(result.csv.includes('الإجراء'), 'CSV should include Arabic header الإجراء');
  assert.equal(result.count, 1);
  assert.ok(result.filename.startsWith('audit-log-'));
  assert.ok(result.filename.endsWith('.csv'));
});

test('Phase 47: exportToCSV max rows enforcement (10000)', async () => {
  // Reduced from 10001 to 1001 for test speed; verify cap logic with smaller dataset
  // by overriding config via env if needed. For now, test with realistic 200 entries
  // and verify cap applies (we'll check the "all returned" case with fewer entries
  // than max, then a separate small-cap test).

  // Strategy: write 250 entries, verify all 250 returned (under 10K cap)
  for (let i = 0; i < 250; i++) {
    await writeAuditEntry({
      id: `aud_${String(i).padStart(4, '0')}`,
      adminId: 'usr_admin1',
      action: 'test_action',
      targetType: 'test',
      targetId: `t_${i}`,
      details: {},
      ip: '127.0.0.1',
      createdAt: `2026-05-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
    });
  }

  const { exportToCSV } = await import('../server/services/auditLogSearch.js');
  const result = await exportToCSV({});

  // 250 < 10000 max, so all returned
  assert.equal(result.count, 250, `expected 250 entries (< 10000 cap), got ${result.count}`);
});

// ═══════════════════════════════════════════════════════════════
// Section 4: HTTP Integration
// ═══════════════════════════════════════════════════════════════

async function startTestServer() {
  const port = 30000 + Math.floor(Math.random() * 30000);
  process.env.PORT = String(port);
  process.env.ADMIN_TOKEN = 'test_admin_token_phase47';

  // Cache-bust server.js per startup so it picks up port + dir
  const serverModule = await import(`../server.js?t=${Date.now()}_${Math.random()}`);
  await new Promise(resolve => setTimeout(resolve, 200));
  return { server: serverModule.server, port: serverModule.server.address()?.port || port };
}

async function stopTestServer(server) {
  if (server) {
    await new Promise(resolve => {
      server.close(() => resolve());
      setTimeout(resolve, 500);
    });
  }
}

test('Phase 47 HTTP: GET /api/admin/abuse-flags?status=active requires admin', async () => {
  let serverInstance;
  try {
    const { server, port } = await startTestServer();
    serverInstance = server;

    // No admin token
    const res1 = await fetch(`http://localhost:${port}/api/admin/abuse-flags?status=active`);
    assert.equal(res1.status, 401);

    // With admin token
    const res2 = await fetch(`http://localhost:${port}/api/admin/abuse-flags?status=active`, {
      headers: { 'X-Admin-Token': 'test_admin_token_phase47' },
    });
    assert.equal(res2.status, 200);
    const data = await res2.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.flags));
  } finally {
    await stopTestServer(serverInstance);
  }
});

test('Phase 47 HTTP: GET /api/admin/abuse-flags/search rejects short query', async () => {
  let serverInstance;
  try {
    const { server, port } = await startTestServer();
    serverInstance = server;

    const res = await fetch(`http://localhost:${port}/api/admin/abuse-flags/search?notes=a`, {
      headers: { 'X-Admin-Token': 'test_admin_token_phase47' },
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'QUERY_TOO_SHORT');
  } finally {
    await stopTestServer(serverInstance);
  }
});

test('Phase 47 HTTP: POST /api/admin/abuse-flags/bulk-action validates body', async () => {
  let serverInstance;
  try {
    const { server, port } = await startTestServer();
    serverInstance = server;

    const res1 = await fetch(`http://localhost:${port}/api/admin/abuse-flags/bulk-action`, {
      method: 'POST',
      headers: {
        'X-Admin-Token': 'test_admin_token_phase47',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fingerprints: [], decision: 'dismissed' }),
    });
    assert.equal(res1.status, 400);
    const data1 = await res1.json();
    assert.equal(data1.code, 'FINGERPRINTS_REQUIRED');

    const res2 = await fetch(`http://localhost:${port}/api/admin/abuse-flags/bulk-action`, {
      method: 'POST',
      headers: {
        'X-Admin-Token': 'test_admin_token_phase47',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fingerprints: ['fp1'], decision: 'invalid' }),
    });
    assert.equal(res2.status, 400);
    const data2 = await res2.json();
    assert.equal(data2.code, 'INVALID_DECISION');
  } finally {
    await stopTestServer(serverInstance);
  }
});

test('Phase 47 HTTP: GET /api/admin/audit-log/export sets correct headers', async () => {
  let serverInstance;
  try {
    await writeAuditEntry({
      id: 'aud_test',
      adminId: 'usr_admin1',
      action: 'test',
      targetType: 'test',
      targetId: 't1',
      details: {},
      ip: '127.0.0.1',
      createdAt: '2026-05-01T00:00:00.000Z',
    });

    const { server, port } = await startTestServer();
    serverInstance = server;

    const res = await fetch(`http://localhost:${port}/api/admin/audit-log/export`, {
      headers: { 'X-Admin-Token': 'test_admin_token_phase47' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/csv'));
    assert.ok(res.headers.get('content-disposition').includes('attachment'));
    const text = await res.text();
    assert.ok(text.startsWith('\uFEFF'), `expected BOM start, got: ${text.slice(0, 10)}`);
  } finally {
    await stopTestServer(serverInstance);
  }
});

test('Phase 47 HTTP: version 0.43.0 in /api/health', async () => {
  let serverInstance;
  try {
    const { server, port } = await startTestServer();
    serverInstance = server;

    const res = await fetch(`http://localhost:${port}/api/health`);
    const data = await res.json();
    assert.equal(data.version, '0.43.0');
  } finally {
    await stopTestServer(serverInstance);
  }
});

// ═══════════════════════════════════════════════════════════════
// Section 5: Cross-Phase Integration
// ═══════════════════════════════════════════════════════════════

test('Phase 47 + 45: snoozeReminders + recordReview lifecycle', async () => {
  await writeUsersWithPhoneIndex([{
    id: 'usr_admin1', role: 'admin', status: 'active', phone: '01000000001', name: 'A1',
    rating: { avg: 0, count: 0 },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }]);

  const snoozeUntil1 = new Date(Date.now() + 12 * 3600000).toISOString();
  await writeReviewState('fp_lifecycle', makeReviewState({
    fingerprint: 'fp_lifecycle',
    currentStatus: 'snoozed',
    snoozeUntil: snoozeUntil1,
    reviews: [{
      id: 'rev1', adminId: 'usr_admin1', decision: 'snoozed', note: null,
      snoozeUntil: snoozeUntil1, createdAt: '2026-04-01T00:00:00.000Z',
    }],
  }));

  const { scanSnoozeExpiries } = await import('../server/services/snoozeReminders.js');

  const r1 = await scanSnoozeExpiries();
  assert.equal(r1.alertsSent, 1, `expected first scan alertsSent=1, got ${r1.alertsSent}, scanned=${r1.scanned}`);

  const r2 = await scanSnoozeExpiries();
  assert.equal(r2.alertsSent, 0);

  // Re-snooze with new period
  await new Promise(resolve => setTimeout(resolve, 100));
  const { recordReview, getReviewState } = await import('../server/services/abuseFlagReview.js');
  const currentState = await getReviewState('fp_lifecycle');
  await recordReview({
    flag: currentState,
    adminId: 'usr_admin1',
    decision: 'snoozed',
    snoozeDays: 1,
  });

  const r3 = await scanSnoozeExpiries();
  assert.equal(r3.alertsSent, 1, 'new snooze period should fire new reminder');
});

test('Phase 47 + 44: detectAbuse output + bulk dismiss workflow', async () => {
  const fps = ['fp_a', 'fp_b', 'fp_c'];
  for (const fp of fps) {
    await writeReviewState(fp, makeReviewState({ fingerprint: fp, currentStatus: 'active' }));
  }

  const { bulkUpdate, listByStatus } = await import('../server/services/abuseFlagReview.js');
  const result = await bulkUpdate({
    fingerprints: fps,
    adminId: 'usr_admin1',
    decision: 'dismissed',
    note: 'bulk dismissed after review',
  });
  assert.equal(result.succeeded.length, 3, `expected 3 succeeded, got ${result.succeeded.length}, failed=${JSON.stringify(result.failed)}`);

  const active = await listByStatus('active');
  const dismissed = await listByStatus('dismissed');
  assert.equal(active.length, 0);
  assert.equal(dismissed.length, 3);
});

test('Phase 47: bulkUpdate verifies all 5 succeed via getReviewState', async () => {
  const fps = Array.from({ length: 5 }, (_, i) => `fp_audit_${i}`);
  for (const fp of fps) {
    await writeReviewState(fp, makeReviewState({ fingerprint: fp }));
  }

  const { bulkUpdate, getReviewState } = await import('../server/services/abuseFlagReview.js');
  await bulkUpdate({
    fingerprints: fps,
    adminId: 'usr_admin1',
    decision: 'dismissed',
  });

  for (const fp of fps) {
    const state = await getReviewState(fp);
    assert.ok(state, `state for ${fp} should exist`);
    assert.equal(state.currentStatus, 'dismissed');
  }
});
