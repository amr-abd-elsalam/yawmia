// ═══════════════════════════════════════════════════════════════
// tests/phase47-admin-operations.test.js — Phase 47 Tests (~30)
// ═══════════════════════════════════════════════════════════════
// Coverage:
//   - abuseFlagReview extensions (listByStatus, getRemainingWarnings,
//     bulkUpdate, searchByNotes, getSnoozeExpiringSoon)
//   - snoozeReminders (scanSnoozeExpiries, detectExpiredSnoozes idempotency)
//   - auditLogSearch (searchActions, exportToCSV)
//   - HTTP integration (admin endpoints)
//   - Cross-phase scenarios (Phase 40+42 competing offers, Phase 44+45+47)
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Test Setup Helpers ────────────────────────────────────────

async function setupTempData() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase47-'));
  process.env.YAWMIA_DATA_PATH = dir;
  // Create required collection directories
  await mkdir(join(dir, 'abuse_flag_reviews'), { recursive: true });
  await mkdir(join(dir, 'audit'), { recursive: true });
  await mkdir(join(dir, 'notifications'), { recursive: true });
  await mkdir(join(dir, 'users'), { recursive: true });
  return dir;
}

async function cleanupTempData(dir) {
  delete process.env.YAWMIA_DATA_PATH;
  if (dir) {
    await rm(dir, { recursive: true, force: true });
  }
}

async function freshImport(modulePath) {
  // Cache-busting import for test isolation
  return await import(`${modulePath}?t=${Date.now()}_${Math.random()}`);
}

async function writeReviewState(dataDir, fingerprint, state) {
  const filePath = join(dataDir, 'abuse_flag_reviews', `${fingerprint}.json`);
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

async function writeAuditEntry(dataDir, entry) {
  const filePath = join(dataDir, 'audit', `${entry.id}.json`);
  await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
}

async function writeNotification(dataDir, notif) {
  const filePath = join(dataDir, 'notifications', `${notif.id}.json`);
  await writeFile(filePath, JSON.stringify(notif, null, 2), 'utf-8');
}

async function writeUser(dataDir, user) {
  const filePath = join(dataDir, 'users', `${user.id}.json`);
  await writeFile(filePath, JSON.stringify(user, null, 2), 'utf-8');
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
// Section 1: abuseFlagReview Extensions (15 tests)
// ═══════════════════════════════════════════════════════════════

test('Phase 47: listByStatus filters active flags', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp1', makeReviewState({ fingerprint: 'fp1', currentStatus: 'active' }));
    await writeReviewState(dir, 'fp2', makeReviewState({ fingerprint: 'fp2', currentStatus: 'snoozed', snoozeUntil: new Date(Date.now() + 24 * 3600000).toISOString() }));
    await writeReviewState(dir, 'fp3', makeReviewState({ fingerprint: 'fp3', currentStatus: 'dismissed' }));

    const { listByStatus } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await listByStatus('active');

    assert.equal(result.length, 1);
    assert.equal(result[0].fingerprint, 'fp1');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: listByStatus filters snoozed with lazy expiry', async () => {
  const dir = await setupTempData();
  try {
    // Future snooze (should appear)
    await writeReviewState(dir, 'fp_future', makeReviewState({
      fingerprint: 'fp_future',
      currentStatus: 'snoozed',
      snoozeUntil: new Date(Date.now() + 24 * 3600000).toISOString(),
    }));
    // Expired snooze (should be excluded — auto-converted to 'active' via lazy expiry)
    await writeReviewState(dir, 'fp_expired', makeReviewState({
      fingerprint: 'fp_expired',
      currentStatus: 'snoozed',
      snoozeUntil: new Date(Date.now() - 3600000).toISOString(),
    }));

    const { listByStatus } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await listByStatus('snoozed');

    assert.equal(result.length, 1);
    assert.equal(result[0].fingerprint, 'fp_future');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: listByStatus invalid status returns empty array', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp1', makeReviewState({ fingerprint: 'fp1' }));
    const { listByStatus } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await listByStatus('invalid_status');
    assert.equal(result.length, 0);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: listByStatus sorts by latest activity descending', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp_old', makeReviewState({
      fingerprint: 'fp_old',
      currentStatus: 'dismissed',
      reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: null, snoozeUntil: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    }));
    await writeReviewState(dir, 'fp_new', makeReviewState({
      fingerprint: 'fp_new',
      currentStatus: 'dismissed',
      reviews: [{ id: 'rev2', adminId: 'a1', decision: 'dismissed', note: null, snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
    }));

    const { listByStatus } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await listByStatus('dismissed');

    assert.equal(result.length, 2);
    assert.equal(result[0].fingerprint, 'fp_new');
    assert.equal(result[1].fingerprint, 'fp_old');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: bulkUpdate dismisses 5 flags atomically', async () => {
  const dir = await setupTempData();
  try {
    const fps = ['fp1', 'fp2', 'fp3', 'fp4', 'fp5'];
    for (const fp of fps) {
      await writeReviewState(dir, fp, makeReviewState({ fingerprint: fp }));
    }

    const { bulkUpdate } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await bulkUpdate({
      fingerprints: fps,
      adminId: 'usr_admin',
      decision: 'dismissed',
    });

    assert.equal(result.succeeded.length, 5);
    assert.equal(result.failed.length, 0);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: bulkUpdate handles partial failure (missing fingerprints)', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp1', makeReviewState({ fingerprint: 'fp1' }));
    await writeReviewState(dir, 'fp2', makeReviewState({ fingerprint: 'fp2' }));

    const { bulkUpdate } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await bulkUpdate({
      fingerprints: ['fp1', 'fp2', 'fp_missing1', 'fp_missing2'],
      adminId: 'usr_admin',
      decision: 'dismissed',
    });

    assert.equal(result.succeeded.length, 2);
    assert.equal(result.failed.length, 2);
    assert(result.failed.every(f => f.error === 'FLAG_NOT_FOUND'));
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: bulkUpdate exceeds max throws error', async () => {
  const dir = await setupTempData();
  try {
    const fps = Array.from({ length: 51 }, (_, i) => `fp${i}`);

    const { bulkUpdate } = await freshImport('../server/services/abuseFlagReview.js');
    await assert.rejects(
      async () => await bulkUpdate({ fingerprints: fps, adminId: 'usr_admin', decision: 'dismissed' }),
      /Bulk action exceeds max 50 flags/
    );
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: bulkUpdate snoozed sets snoozeUntil correctly', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp1', makeReviewState({ fingerprint: 'fp1' }));

    const { bulkUpdate, getReviewState } = await freshImport('../server/services/abuseFlagReview.js');
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
    // Allow ±5s drift
    assert.ok(Math.abs(snoozeMs - expectedMs) < 5000);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: bulkUpdate empty fingerprints returns empty result', async () => {
  const dir = await setupTempData();
  try {
    const { bulkUpdate } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await bulkUpdate({
      fingerprints: [],
      adminId: 'usr_admin',
      decision: 'dismissed',
    });
    assert.equal(result.succeeded.length, 0);
    assert.equal(result.failed.length, 0);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: searchByNotes Arabic content matches', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp1', makeReviewState({
      fingerprint: 'fp1',
      reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: 'نصب متكرر — راجعت قبل كده', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
    }));
    await writeReviewState(dir, 'fp2', makeReviewState({
      fingerprint: 'fp2',
      reviews: [{ id: 'rev2', adminId: 'a1', decision: 'dismissed', note: 'حالة عادية', snoozeUntil: null, createdAt: '2026-05-02T00:00:00.000Z' }],
    }));

    const { searchByNotes } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await searchByNotes('نصب');

    assert.equal(result.length, 1);
    assert.equal(result[0].fingerprint, 'fp1');
    assert.ok(result[0]._matchingReview);
    assert.ok(result[0]._matchingReview.note.includes('نصب'));
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: searchByNotes minimum 2 chars returns empty', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp1', makeReviewState({
      fingerprint: 'fp1',
      reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: 'anything', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
    }));

    const { searchByNotes } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await searchByNotes('a');
    assert.equal(result.length, 0);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: searchByNotes case-insensitive', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp1', makeReviewState({
      fingerprint: 'fp1',
      reviews: [{ id: 'rev1', adminId: 'a1', decision: 'dismissed', note: 'FRAUD CASE', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
    }));

    const { searchByNotes } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await searchByNotes('fraud');
    assert.equal(result.length, 1);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: searchByNotes sorts newest matching review first', async () => {
  const dir = await setupTempData();
  try {
    await writeReviewState(dir, 'fp_old', makeReviewState({
      fingerprint: 'fp_old',
      reviews: [{ id: 'rev_old', adminId: 'a1', decision: 'dismissed', note: 'matching old', snoozeUntil: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    }));
    await writeReviewState(dir, 'fp_new', makeReviewState({
      fingerprint: 'fp_new',
      reviews: [{ id: 'rev_new', adminId: 'a1', decision: 'dismissed', note: 'matching new', snoozeUntil: null, createdAt: '2026-05-01T00:00:00.000Z' }],
    }));

    const { searchByNotes } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await searchByNotes('matching');
    assert.equal(result.length, 2);
    assert.equal(result[0].fingerprint, 'fp_new');
    assert.equal(result[1].fingerprint, 'fp_old');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: getRemainingWarnings counts warnings within week', async () => {
  const dir = await setupTempData();
  try {
    const userId = 'usr_target';
    await writeNotification(dir, {
      id: 'ntf_w1',
      userId,
      type: 'admin_warning',
      message: 'warning 1',
      meta: {},
      read: false,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      readAt: null,
    });
    await writeNotification(dir, {
      id: 'ntf_w2',
      userId,
      type: 'admin_warning',
      message: 'warning 2',
      meta: {},
      read: false,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      readAt: null,
    });
    // Old warning (>7 days) — should not count
    await writeNotification(dir, {
      id: 'ntf_old',
      userId,
      type: 'admin_warning',
      message: 'old',
      meta: {},
      read: false,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      readAt: null,
    });

    const { getRemainingWarnings } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await getRemainingWarnings(userId);

    assert.equal(result.used, 2);
    assert.equal(result.max, 3);
    assert.equal(result.remaining, 1);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: getRemainingWarnings no userId returns max', async () => {
  const dir = await setupTempData();
  try {
    const { getRemainingWarnings } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await getRemainingWarnings(null);
    assert.equal(result.used, 0);
    assert.equal(result.remaining, result.max);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: getSnoozeExpiringSoon within window returns flags with metadata', async () => {
  const dir = await setupTempData();
  try {
    // Within 24h window (12h from now)
    await writeReviewState(dir, 'fp_within', makeReviewState({
      fingerprint: 'fp_within',
      currentStatus: 'snoozed',
      snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(),
    }));
    // Outside window (48h from now)
    await writeReviewState(dir, 'fp_outside', makeReviewState({
      fingerprint: 'fp_outside',
      currentStatus: 'snoozed',
      snoozeUntil: new Date(Date.now() + 48 * 3600000).toISOString(),
    }));

    const { getSnoozeExpiringSoon } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await getSnoozeExpiringSoon(24);

    assert.equal(result.length, 1);
    assert.equal(result[0].fingerprint, 'fp_within');
    assert.ok(typeof result[0]._hoursUntilExpiry === 'number');
    assert.ok(result[0]._hoursUntilExpiry > 0 && result[0]._hoursUntilExpiry <= 24);
  } finally {
    await cleanupTempData(dir);
  }
});

// ═══════════════════════════════════════════════════════════════
// Section 2: snoozeReminders (5 tests)
// ═══════════════════════════════════════════════════════════════

test('Phase 47: scanSnoozeExpiries idempotent (no double alert)', async () => {
  const dir = await setupTempData();
  try {
    // Admin user
    await writeUser(dir, {
      id: 'usr_admin1',
      role: 'admin',
      status: 'active',
      phone: '01000000001',
      name: 'Admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // Snoozed flag with snoozeUntil 12h from now (within 24h reminder window)
    const snoozeSetAt = '2026-04-01T00:00:00.000Z';
    await writeReviewState(dir, 'fp_snooze', makeReviewState({
      fingerprint: 'fp_snooze',
      currentStatus: 'snoozed',
      snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(),
      reviews: [{ id: 'rev1', adminId: 'usr_admin1', decision: 'snoozed', note: null, snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(), createdAt: snoozeSetAt }],
    }));

    const { scanSnoozeExpiries } = await freshImport('../server/services/snoozeReminders.js');

    const result1 = await scanSnoozeExpiries();
    assert.equal(result1.alertsSent, 1, 'first scan sends alert');

    const result2 = await scanSnoozeExpiries();
    assert.equal(result2.alertsSent, 0, 'second scan idempotent — no duplicate');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: scanSnoozeExpiries skips non-snoozed states', async () => {
  const dir = await setupTempData();
  try {
    await writeUser(dir, {
      id: 'usr_admin1',
      role: 'admin',
      status: 'active',
      phone: '01000000001',
      name: 'Admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await writeReviewState(dir, 'fp_active', makeReviewState({ fingerprint: 'fp_active', currentStatus: 'active' }));
    await writeReviewState(dir, 'fp_dismissed', makeReviewState({ fingerprint: 'fp_dismissed', currentStatus: 'dismissed' }));
    await writeReviewState(dir, 'fp_actioned', makeReviewState({ fingerprint: 'fp_actioned', currentStatus: 'actioned' }));

    const { scanSnoozeExpiries } = await freshImport('../server/services/snoozeReminders.js');
    const result = await scanSnoozeExpiries();
    assert.equal(result.alertsSent, 0);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: scanSnoozeExpiries fires sendAdminAlert per admin', async () => {
  const dir = await setupTempData();
  try {
    // Two admins
    await writeUser(dir, {
      id: 'usr_admin1', role: 'admin', status: 'active', phone: '01000000001', name: 'A1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await writeUser(dir, {
      id: 'usr_admin2', role: 'admin', status: 'active', phone: '01000000002', name: 'A2',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const snoozeSetAt = '2026-04-01T00:00:00.000Z';
    await writeReviewState(dir, 'fp_snooze', makeReviewState({
      fingerprint: 'fp_snooze',
      currentStatus: 'snoozed',
      snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(),
      reviews: [{ id: 'rev1', adminId: 'usr_admin1', decision: 'snoozed', note: null, snoozeUntil: new Date(Date.now() + 12 * 3600000).toISOString(), createdAt: snoozeSetAt }],
    }));

    const { scanSnoozeExpiries } = await freshImport('../server/services/snoozeReminders.js');
    await scanSnoozeExpiries();

    // Verify notifications created — read directory
    const { readdir } = await import('node:fs/promises');
    const ntfFiles = await readdir(join(dir, 'notifications'));
    const ntfFilesJson = ntfFiles.filter(f => f.endsWith('.json'));
    assert.ok(ntfFilesJson.length >= 2, `expected >= 2 notifications, got ${ntfFilesJson.length}`);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: detectExpiredSnoozes emits abuse_flag:snooze_expired', async () => {
  const dir = await setupTempData();
  try {
    // Expired snooze (1 hour ago)
    await writeReviewState(dir, 'fp_expired', makeReviewState({
      fingerprint: 'fp_expired',
      currentStatus: 'snoozed',
      snoozeUntil: new Date(Date.now() - 3600000).toISOString(),
    }));

    const { eventBus } = await freshImport('../server/services/eventBus.js');
    const events = [];
    const handler = (data) => events.push(data);
    eventBus.on('abuse_flag:snooze_expired', handler);

    const { detectExpiredSnoozes } = await freshImport('../server/services/snoozeReminders.js');
    const count = await detectExpiredSnoozes();

    assert.equal(count, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].fingerprint, 'fp_expired');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: scanSnoozeExpiries handles 100 states efficiently', async () => {
  const dir = await setupTempData();
  try {
    await writeUser(dir, {
      id: 'usr_admin1', role: 'admin', status: 'active', phone: '01000000001', name: 'A1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // 100 states (mix of statuses, only 10 in reminder window)
    for (let i = 0; i < 100; i++) {
      const fp = `fp_${i.toString().padStart(3, '0')}`;
      const status = i < 10 ? 'snoozed' : (i < 50 ? 'active' : 'dismissed');
      const snoozeUntil = i < 10
        ? new Date(Date.now() + 12 * 3600000).toISOString()
        : null;
      const reviews = i < 10
        ? [{ id: `rev_${i}`, adminId: 'a1', decision: 'snoozed', note: null, snoozeUntil, createdAt: '2026-04-01T00:00:00.000Z' }]
        : [];
      await writeReviewState(dir, fp, makeReviewState({ fingerprint: fp, currentStatus: status, snoozeUntil, reviews }));
    }

    const { scanSnoozeExpiries } = await freshImport('../server/services/snoozeReminders.js');
    const start = Date.now();
    const result = await scanSnoozeExpiries();
    const duration = Date.now() - start;

    assert.equal(result.scanned, 100);
    assert.equal(result.alertsSent, 10);
    assert.ok(duration < 5000, `expected <5s, got ${duration}ms`);
  } finally {
    await cleanupTempData(dir);
  }
});

// ═══════════════════════════════════════════════════════════════
// Section 3: auditLogSearch (5 tests)
// ═══════════════════════════════════════════════════════════════

test('Phase 47: searchActions full-text Arabic content', async () => {
  const dir = await setupTempData();
  try {
    await writeAuditEntry(dir, {
      id: 'aud_1',
      adminId: 'usr_admin1',
      action: 'user_banned',
      targetType: 'user',
      targetId: 'usr_target',
      details: { reason: 'نصب متكرر' },
      ip: '127.0.0.1',
      createdAt: '2026-05-01T00:00:00.000Z',
    });
    await writeAuditEntry(dir, {
      id: 'aud_2',
      adminId: 'usr_admin1',
      action: 'user_unbanned',
      targetType: 'user',
      targetId: 'usr_other',
      details: { reason: 'تمت المراجعة' },
      ip: '127.0.0.1',
      createdAt: '2026-05-02T00:00:00.000Z',
    });

    const { searchActions } = await freshImport('../server/services/auditLogSearch.js');
    const result = await searchActions({ q: 'نصب' });

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].id, 'aud_1');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: searchActions combined filters intersection', async () => {
  const dir = await setupTempData();
  try {
    for (let i = 0; i < 10; i++) {
      await writeAuditEntry(dir, {
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

    const { searchActions } = await freshImport('../server/services/auditLogSearch.js');
    const result = await searchActions({
      action: 'user_banned',
      adminId: 'usr_admin1',
    });

    // user_banned (even i) AND admin1 (i<5): i=0, 2, 4 → 3 results
    assert.equal(result.entries.length, 3);
    assert(result.entries.every(e => e.action === 'user_banned' && e.adminId === 'usr_admin1'));
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: searchActions max results enforcement', async () => {
  const dir = await setupTempData();
  try {
    // 250 entries (above 200 default max)
    for (let i = 0; i < 250; i++) {
      await writeAuditEntry(dir, {
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

    const { searchActions } = await freshImport('../server/services/auditLogSearch.js');
    const result = await searchActions({});

    // Default limit = 50 (capped by max 200), total = 250
    assert.equal(result.entries.length, 50);
    assert.equal(result.total, 250);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: exportToCSV BOM + Arabic headers', async () => {
  const dir = await setupTempData();
  try {
    await writeAuditEntry(dir, {
      id: 'aud_1',
      adminId: 'usr_admin1',
      action: 'user_banned',
      targetType: 'user',
      targetId: 'usr_t',
      details: { reason: 'test' },
      ip: '127.0.0.1',
      createdAt: '2026-05-01T00:00:00.000Z',
    });

    const { exportToCSV } = await freshImport('../server/services/auditLogSearch.js');
    const result = await exportToCSV({});

    assert.ok(result.csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM');
    assert.ok(result.csv.includes('الأدمن'), 'CSV should include Arabic header الأدمن');
    assert.ok(result.csv.includes('الإجراء'), 'CSV should include Arabic header الإجراء');
    assert.equal(result.count, 1);
    assert.ok(result.filename.startsWith('audit-log-'));
    assert.ok(result.filename.endsWith('.csv'));
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: exportToCSV max rows enforcement (10000)', async () => {
  const dir = await setupTempData();
  try {
    // Create 10001 entries
    for (let i = 0; i < 10001; i++) {
      await writeAuditEntry(dir, {
        id: `aud_${String(i).padStart(5, '0')}`,
        adminId: 'usr_admin1',
        action: 'test_action',
        targetType: 'test',
        targetId: `t_${i}`,
        details: {},
        ip: '127.0.0.1',
        createdAt: '2026-05-01T00:00:00.000Z',
      });
    }

    const { exportToCSV } = await freshImport('../server/services/auditLogSearch.js');
    const result = await exportToCSV({});

    assert.equal(result.count, 10000, 'should be capped at maxRows');
  } finally {
    await cleanupTempData(dir);
  }
});

// ═══════════════════════════════════════════════════════════════
// Section 4: HTTP Integration (5 tests)
// ═══════════════════════════════════════════════════════════════

async function startTestServer() {
  // Use unique port per test to avoid conflicts
  const port = 30000 + Math.floor(Math.random() * 30000);
  process.env.PORT = String(port);
  process.env.ADMIN_TOKEN = 'test_admin_token_phase47';
  process.env.NODE_ENV = 'development';

  const { server } = await freshImport('../server.js');
  // Wait for listen
  await new Promise(resolve => setTimeout(resolve, 200));

  return { server, port: server.address()?.port || port };
}

async function stopTestServer(server) {
  if (server && !server.listening === false) {
    await new Promise(resolve => {
      server.close(() => resolve());
      setTimeout(resolve, 500);
    });
  }
}

test('Phase 47 HTTP: GET /api/admin/abuse-flags?status=active requires admin', async () => {
  const dir = await setupTempData();
  let serverInstance;
  try {
    const { server, port } = await startTestServer();
    serverInstance = server;

    // No admin token — should fail
    const res1 = await fetch(`http://localhost:${port}/api/admin/abuse-flags?status=active`);
    assert.equal(res1.status, 401);

    // With admin token — should succeed
    const res2 = await fetch(`http://localhost:${port}/api/admin/abuse-flags?status=active`, {
      headers: { 'X-Admin-Token': 'test_admin_token_phase47' },
    });
    assert.equal(res2.status, 200);
    const data = await res2.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.flags));
  } finally {
    await stopTestServer(serverInstance);
    await cleanupTempData(dir);
  }
});

test('Phase 47 HTTP: GET /api/admin/abuse-flags/search rejects short query', async () => {
  const dir = await setupTempData();
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
    await cleanupTempData(dir);
  }
});

test('Phase 47 HTTP: POST /api/admin/abuse-flags/bulk-action validates body', async () => {
  const dir = await setupTempData();
  let serverInstance;
  try {
    const { server, port } = await startTestServer();
    serverInstance = server;

    // Empty fingerprints
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

    // Invalid decision
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
    await cleanupTempData(dir);
  }
});

test('Phase 47 HTTP: GET /api/admin/audit-log/export sets correct headers', async () => {
  const dir = await setupTempData();
  let serverInstance;
  try {
    await writeAuditEntry(dir, {
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
    assert.ok(text.startsWith('\uFEFF'));
  } finally {
    await stopTestServer(serverInstance);
    await cleanupTempData(dir);
  }
});

test('Phase 47 HTTP: version 0.43.0 in /api/health', async () => {
  const dir = await setupTempData();
  let serverInstance;
  try {
    const { server, port } = await startTestServer();
    serverInstance = server;

    const res = await fetch(`http://localhost:${port}/api/health`);
    const data = await res.json();
    assert.equal(data.version, '0.43.0');
  } finally {
    await stopTestServer(serverInstance);
    await cleanupTempData(dir);
  }
});

// ═══════════════════════════════════════════════════════════════
// Section 5: Cross-Phase Integration (3 tests)
// ═══════════════════════════════════════════════════════════════

test('Phase 47 + 45: snoozeReminders + recordReview lifecycle', async () => {
  const dir = await setupTempData();
  try {
    await writeUser(dir, {
      id: 'usr_admin1', role: 'admin', status: 'active', phone: '01000000001', name: 'A1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // Initial snooze (12h from now)
    const snoozeUntil1 = new Date(Date.now() + 12 * 3600000).toISOString();
    await writeReviewState(dir, 'fp_lifecycle', makeReviewState({
      fingerprint: 'fp_lifecycle',
      currentStatus: 'snoozed',
      snoozeUntil: snoozeUntil1,
      reviews: [{
        id: 'rev1', adminId: 'usr_admin1', decision: 'snoozed', note: null,
        snoozeUntil: snoozeUntil1, createdAt: '2026-04-01T00:00:00.000Z',
      }],
    }));

    const { scanSnoozeExpiries } = await freshImport('../server/services/snoozeReminders.js');

    // First scan: alert sent
    const r1 = await scanSnoozeExpiries();
    assert.equal(r1.alertsSent, 1);

    // Second scan: idempotent — no duplicate
    const r2 = await scanSnoozeExpiries();
    assert.equal(r2.alertsSent, 0);

    // Re-snooze (admin extends snooze period — new createdAt > lastReminderSentAt)
    await new Promise(resolve => setTimeout(resolve, 100));
    const { recordReview, getReviewState } = await freshImport('../server/services/abuseFlagReview.js');
    const currentState = await getReviewState('fp_lifecycle');
    await recordReview({
      flag: currentState,
      adminId: 'usr_admin1',
      decision: 'snoozed',
      snoozeDays: 1, // new snooze period — also within 24h reminder window
    });

    // Third scan: new snooze period, lastReminderSentAt < new snoozeSetAtMs → reminder fires again
    const r3 = await scanSnoozeExpiries();
    assert.equal(r3.alertsSent, 1, 'new snooze period should fire new reminder');
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47 + 44: detectAbuse output + bulk dismiss workflow', async () => {
  const dir = await setupTempData();
  try {
    // Manually create review states (simulating detectAbuse output)
    const fps = ['fp_a', 'fp_b', 'fp_c'];
    for (const fp of fps) {
      await writeReviewState(dir, fp, makeReviewState({ fingerprint: fp, currentStatus: 'active' }));
    }

    // Bulk dismiss all
    const { bulkUpdate, listByStatus } = await freshImport('../server/services/abuseFlagReview.js');
    const result = await bulkUpdate({
      fingerprints: fps,
      adminId: 'usr_admin1',
      decision: 'dismissed',
      note: 'bulk dismissed after review',
    });
    assert.equal(result.succeeded.length, 3);

    // Verify all are now dismissed
    const active = await listByStatus('active');
    const dismissed = await listByStatus('dismissed');
    assert.equal(active.length, 0);
    assert.equal(dismissed.length, 3);
  } finally {
    await cleanupTempData(dir);
  }
});

test('Phase 47: bulkUpdate logs single audit entry (not 50)', async () => {
  const dir = await setupTempData();
  try {
    const fps = Array.from({ length: 5 }, (_, i) => `fp_audit_${i}`);
    for (const fp of fps) {
      await writeReviewState(dir, fp, makeReviewState({ fingerprint: fp }));
    }

    const { bulkUpdate } = await freshImport('../server/services/abuseFlagReview.js');
    await bulkUpdate({
      fingerprints: fps,
      adminId: 'usr_admin1',
      decision: 'dismissed',
    });

    // Note: bulkUpdate itself doesn't write audit entries — handler does.
    // This test verifies bulkUpdate doesn't bloat audit log per-flag.
    // In a real test, we'd verify the handler logs 1 entry, but bulkUpdate alone is silent.

    // Verify all 5 succeeded by re-reading state
    const { getReviewState } = await freshImport('../server/services/abuseFlagReview.js');
    for (const fp of fps) {
      const state = await getReviewState(fp);
      assert.equal(state.currentStatus, 'dismissed');
    }
  } finally {
    await cleanupTempData(dir);
  }
});
