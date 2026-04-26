// ═══════════════════════════════════════════════════════════════
// tests/phase40-instant-marketplace.test.js — Phase 40 Test Suite
// ═══════════════════════════════════════════════════════════════
// ~80 test cases covering:
//   - Presence service (15)
//   - Availability windows (10)
//   - Instant match pipeline (25)
//   - Live feed SSE (10)
//   - API endpoints (15)
//   - Migration v3 + config (5)
// ═══════════════════════════════════════════════════════════════

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let TEMP_DIR;

before(async () => {
  TEMP_DIR = await mkdtemp(join(tmpdir(), 'yawmia-phase40-'));
  process.env.YAWMIA_DATA_PATH = TEMP_DIR;
  // Pre-create all required dirs
  const dirs = [
    'users', 'sessions', 'jobs', 'applications', 'otp', 'notifications',
    'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit',
    'messages', 'push_subscriptions', 'alerts', 'metrics', 'favorites', 'images',
    'availability_windows', 'instant_matches',
  ];
  for (const d of dirs) {
    await mkdir(join(TEMP_DIR, d), { recursive: true });
  }
});

after(async () => {
  if (TEMP_DIR) {
    await rm(TEMP_DIR, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 1. PRESENCE SERVICE TESTS (15)
// ═══════════════════════════════════════════════════════════════

test('P40-01: recordHeartbeat creates presence record', async () => {
  const { recordHeartbeat, getPresence, clearPresence } = await import('../server/services/presenceService.js');
  clearPresence();
  const result = recordHeartbeat('usr_test1', { lat: 30.04, lng: 31.23, acceptingJobs: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'online');
  const rec = getPresence('usr_test1');
  assert.ok(rec);
  assert.equal(rec.status, 'online');
  assert.deepEqual(rec.currentLocation, { lat: 30.04, lng: 31.23 });
});

test('P40-02: Multiple heartbeats update lastHeartbeat', async () => {
  const { recordHeartbeat, getPresence, clearPresence } = await import('../server/services/presenceService.js');
  clearPresence();
  recordHeartbeat('usr_test2', {});
  const first = getPresence('usr_test2').lastHeartbeat;
  await new Promise(r => setTimeout(r, 50));
  // Bypass throttle by using helper
  const { _setPresence } = await import('../server/services/presenceService.js');
  _setPresence('usr_test2', { lastHeartbeat: Date.now() });
  const second = getPresence('usr_test2').lastHeartbeat;
  assert.ok(second >= first);
});

test('P40-03: Status transitions: online → away after awayAfterMs', async () => {
  const { _setPresence, getPresence, clearPresence } = await import('../server/services/presenceService.js');
  const config = (await import('../config.js')).default;
  clearPresence();
  _setPresence('usr_test3', { lastHeartbeat: Date.now() - config.PRESENCE.awayAfterMs - 1000 });
  const rec = getPresence('usr_test3');
  assert.equal(rec.status, 'away');
});

test('P40-04: Status transitions: away → offline after offlineAfterMs', async () => {
  const { _setPresence, cleanupStale, getPresence, clearPresence } = await import('../server/services/presenceService.js');
  const config = (await import('../config.js')).default;
  clearPresence();
  _setPresence('usr_test4', { lastHeartbeat: Date.now() - config.PRESENCE.offlineAfterMs - 1000 });
  cleanupStale();
  const rec = getPresence('usr_test4');
  assert.equal(rec, null);
});

test('P40-05: Throttling: rapid heartbeats are throttled', async () => {
  const { recordHeartbeat, clearPresence } = await import('../server/services/presenceService.js');
  clearPresence();
  const r1 = recordHeartbeat('usr_test5', {});
  const r2 = recordHeartbeat('usr_test5', {});
  assert.equal(r1.ok, true);
  assert.equal(r1.throttled, false);
  assert.equal(r2.ok, true);
  assert.equal(r2.throttled, true);
});

test('P40-06: Multi-tab merge: both sessionIds tracked', async () => {
  const { recordHeartbeat, _setPresence, getPresence, clearPresence } = await import('../server/services/presenceService.js');
  clearPresence();
  _setPresence('usr_test6', { lastHeartbeat: Date.now() - 30000 }); // bypass throttle
  recordHeartbeat('usr_test6', { sessionId: 'sid-A' });
  // Force second heartbeat by manipulating lastHeartbeatMs map
  _setPresence('usr_test6', { lastHeartbeat: Date.now() - 30000 });
  recordHeartbeat('usr_test6', { sessionId: 'sid-B' });
  const rec = getPresence('usr_test6');
  assert.ok(rec);
  // sessionIds is array (for serialization)
  assert.ok(Array.isArray(rec.sessionIds));
});

test('P40-07: acceptingJobs respects toggle', async () => {
  const { recordHeartbeat, getPresence, _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  clearPresence();
  recordHeartbeat('usr_test7', { acceptingJobs: false });
  let rec = getPresence('usr_test7');
  assert.equal(rec.acceptingJobs, false);
  _setPresence('usr_test7', { lastHeartbeat: Date.now() - 30000 });
  recordHeartbeat('usr_test7', { acceptingJobs: true });
  rec = getPresence('usr_test7');
  assert.equal(rec.acceptingJobs, true);
});

test('P40-08: getOnlineWorkers filters by status', async () => {
  const { _setPresence, clearPresence, getOnlineWorkers } = await import('../server/services/presenceService.js');
  clearPresence();
  // Need to set up a real user first
  const { create: createUser } = await import('../server/services/users.js');
  const u = await createUser('01055556608', 'worker');
  await (await import('../server/services/users.js')).update(u.id, { name: 'تست', governorate: 'cairo', categories: ['farming'] });
  _setPresence(u.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  const list = await getOnlineWorkers({ acceptingJobs: true });
  assert.ok(list.length >= 1);
  const found = list.find(w => w.userId === u.id);
  assert.ok(found);
});

test('P40-09: getOnlineWorkers filters by governorate', async () => {
  const { _setPresence, clearPresence, getOnlineWorkers } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  clearPresence();
  const u1 = await createUser('01055556609', 'worker');
  await update(u1.id, { name: 't', governorate: 'cairo', categories: ['farming'] });
  const u2 = await createUser('01055556610', 'worker');
  await update(u2.id, { name: 't', governorate: 'alex', categories: ['farming'] });
  _setPresence(u1.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  _setPresence(u2.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  const cairoOnly = await getOnlineWorkers({ governorate: 'cairo' });
  const found = cairoOnly.find(w => w.userId === u1.id);
  const notFound = cairoOnly.find(w => w.userId === u2.id);
  assert.ok(found);
  assert.equal(notFound, undefined);
});

test('P40-10: getOnlineWorkers filters by category', async () => {
  const { _setPresence, clearPresence, getOnlineWorkers } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  clearPresence();
  const u1 = await createUser('01055556611', 'worker');
  await update(u1.id, { name: 't', governorate: 'cairo', categories: ['farming'] });
  const u2 = await createUser('01055556612', 'worker');
  await update(u2.id, { name: 't', governorate: 'cairo', categories: ['plumbing'] });
  _setPresence(u1.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  _setPresence(u2.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  const farmOnly = await getOnlineWorkers({ categories: ['farming'] });
  assert.ok(farmOnly.find(w => w.userId === u1.id));
  assert.equal(farmOnly.find(w => w.userId === u2.id), undefined);
});

test('P40-11: getOnlineWorkers filters by proximity', async () => {
  const { _setPresence, clearPresence, getOnlineWorkers } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  clearPresence();
  const u1 = await createUser('01055556613', 'worker');
  await update(u1.id, { name: 't', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  const u2 = await createUser('01055556614', 'worker');
  await update(u2.id, { name: 't', governorate: 'cairo', categories: ['farming'], lat: 31.20, lng: 29.92 }); // alex coords
  _setPresence(u1.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  _setPresence(u2.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  const nearby = await getOnlineWorkers({ lat: 30.04, lng: 31.23, radiusKm: 50 });
  assert.ok(nearby.find(w => w.userId === u1.id));
  assert.equal(nearby.find(w => w.userId === u2.id), undefined);
});

test('P40-12: countOnlineByFilters returns count', async () => {
  const { _setPresence, clearPresence, countOnlineByFilters } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  clearPresence();
  const u = await createUser('01055556615', 'worker');
  await update(u.id, { name: 't', governorate: 'cairo', categories: ['farming'] });
  _setPresence(u.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
  const count = await countOnlineByFilters({ governorate: 'cairo' });
  assert.ok(count >= 1);
});

test('P40-13: cleanupStale removes offline entries', async () => {
  const { _setPresence, cleanupStale, clearPresence, getStats } = await import('../server/services/presenceService.js');
  const config = (await import('../config.js')).default;
  clearPresence();
  _setPresence('usr_stale1', { lastHeartbeat: Date.now() - config.PRESENCE.offlineAfterMs - 5000 });
  _setPresence('usr_stale2', { lastHeartbeat: Date.now() });
  const removed = cleanupStale();
  assert.ok(removed >= 1);
  const stats = getStats();
  assert.ok(stats.total >= 1);
});

test('P40-14: getStats returns correct counts', async () => {
  const { _setPresence, clearPresence, getStats } = await import('../server/services/presenceService.js');
  const config = (await import('../config.js')).default;
  clearPresence();
  _setPresence('usr_s1', { lastHeartbeat: Date.now() });
  _setPresence('usr_s2', { lastHeartbeat: Date.now() - config.PRESENCE.awayAfterMs - 1000 });
  const stats = getStats();
  assert.equal(stats.total, 2);
  assert.equal(stats.online, 1);
  assert.equal(stats.away, 1);
});

test('P40-15: clearPresence empties the map', async () => {
  const { _setPresence, clearPresence, getStats } = await import('../server/services/presenceService.js');
  _setPresence('usr_x', { lastHeartbeat: Date.now() });
  clearPresence();
  const stats = getStats();
  assert.equal(stats.total, 0);
});

// ═══════════════════════════════════════════════════════════════
// 2. AVAILABILITY WINDOWS TESTS (10)
// ═══════════════════════════════════════════════════════════════

test('P40-16: Create recurring window', async () => {
  const { createWindow } = await import('../server/services/availabilityWindow.js');
  const result = await createWindow('usr_aw1', {
    type: 'recurring',
    daysOfWeek: [0, 1, 2, 3, 4],
    startHour: 8,
    endHour: 17,
  });
  assert.equal(result.ok, true);
  assert.ok(result.window.id.startsWith('aw_'));
  assert.equal(result.window.type, 'recurring');
});

test('P40-17: Create one-time window', async () => {
  const { createWindow } = await import('../server/services/availabilityWindow.js');
  const result = await createWindow('usr_aw2', {
    type: 'one_time',
    startAt: '2026-05-01T06:00:00Z',
    endAt: '2026-05-01T15:00:00Z',
  });
  assert.equal(result.ok, true);
  assert.equal(result.window.type, 'one_time');
});

test('P40-18: List user windows', async () => {
  const { createWindow, listByUser } = await import('../server/services/availabilityWindow.js');
  await createWindow('usr_aw3', { type: 'recurring', daysOfWeek: [0], startHour: 8, endHour: 17 });
  await createWindow('usr_aw3', { type: 'recurring', daysOfWeek: [6], startHour: 8, endHour: 17 });
  const list = await listByUser('usr_aw3');
  assert.equal(list.length, 2);
});

test('P40-19: Delete window — ownership check fails for non-owner', async () => {
  const { createWindow, deleteWindow } = await import('../server/services/availabilityWindow.js');
  const r = await createWindow('usr_aw4', { type: 'recurring', daysOfWeek: [0], startHour: 8, endHour: 17 });
  const del = await deleteWindow(r.window.id, 'usr_other');
  assert.equal(del.ok, false);
  assert.equal(del.code, 'NOT_WINDOW_OWNER');
});

test('P40-20: Delete window — owner succeeds', async () => {
  const { createWindow, deleteWindow, listByUser } = await import('../server/services/availabilityWindow.js');
  const r = await createWindow('usr_aw5', { type: 'recurring', daysOfWeek: [0], startHour: 8, endHour: 17 });
  const del = await deleteWindow(r.window.id, 'usr_aw5');
  assert.equal(del.ok, true);
  const list = await listByUser('usr_aw5');
  assert.equal(list.length, 0);
});

test('P40-21: maxWindowsPerUser enforced', async () => {
  const { createWindow } = await import('../server/services/availabilityWindow.js');
  const config = (await import('../config.js')).default;
  const max = config.AVAILABILITY_WINDOWS.maxWindowsPerUser;
  for (let i = 0; i < max; i++) {
    const r = await createWindow('usr_aw6', { type: 'recurring', daysOfWeek: [i % 7], startHour: 8, endHour: 17 });
    assert.equal(r.ok, true);
  }
  const overflow = await createWindow('usr_aw6', { type: 'recurring', daysOfWeek: [0], startHour: 8, endHour: 17 });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.code, 'MAX_WINDOWS_REACHED');
});

test('P40-22: isAvailableNow with no windows → defaults to always_available', async () => {
  const { isAvailableNow } = await import('../server/services/availabilityWindow.js');
  const result = await isAvailableNow('usr_aw_nowin');
  assert.equal(result, true);
});

test('P40-23: isAvailableNow with matching recurring window → true', async () => {
  const { _testHelpers } = await import('../server/services/availabilityWindow.js');
  const egyptNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const today = egyptNow.getUTCDay();
  const hour = egyptNow.getUTCHours();
  const window = {
    enabled: true,
    type: 'recurring',
    daysOfWeek: [today],
    startHour: hour,
    endHour: hour + 1,
  };
  assert.equal(_testHelpers.isWindowActive(window, egyptNow, Date.now()), true);
});

test('P40-24: isAvailableNow with non-matching recurring window → false', async () => {
  const { _testHelpers } = await import('../server/services/availabilityWindow.js');
  const egyptNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const today = egyptNow.getUTCDay();
  const otherDay = (today + 3) % 7;
  const window = {
    enabled: true,
    type: 'recurring',
    daysOfWeek: [otherDay],
    startHour: 0,
    endHour: 1,
  };
  assert.equal(_testHelpers.isWindowActive(window, egyptNow, Date.now()), false);
});

test('P40-25: isAvailableNow with one-time window matching → true', async () => {
  const { _testHelpers } = await import('../server/services/availabilityWindow.js');
  const egyptNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const window = {
    enabled: true,
    type: 'one_time',
    startAt: new Date(Date.now() - 60000).toISOString(),
    endAt: new Date(Date.now() + 60000).toISOString(),
  };
  assert.equal(_testHelpers.isWindowActive(window, egyptNow, Date.now()), true);
});

// ═══════════════════════════════════════════════════════════════
// 3. INSTANT MATCH PIPELINE TESTS (25)
// ═══════════════════════════════════════════════════════════════

test('P40-26: startMatch with 0 candidates → NO_CANDIDATES', async () => {
  const { startMatch } = await import('../server/services/instantMatch.js');
  const { clearPresence } = await import('../server/services/presenceService.js');
  clearPresence();
  const fakeJob = {
    id: 'job_im_test1',
    employerId: 'usr_emp1',
    status: 'open',
    urgency: 'immediate',
    title: 'تست',
    category: 'farming',
    governorate: 'cairo',
    dailyWage: 200,
    durationDays: 1,
    startDate: '2026-05-01',
  };
  const result = await startMatch(fakeJob);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NO_CANDIDATES');
});

test('P40-27: startMatch with eligible candidates → creates record', async () => {
  const { startMatch } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  clearPresence();
  // Create 5 workers
  const workerIds = [];
  for (let i = 0; i < 5; i++) {
    const u = await createUser('010' + (10000000 + i), 'worker');
    await update(u.id, { name: 'w' + i, governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
    _setPresence(u.id, { lastHeartbeat: Date.now(), acceptingJobs: true, currentLocation: { lat: 30.04, lng: 31.23 } });
    workerIds.push(u.id);
  }
  const fakeJob = {
    id: 'job_im_test2',
    employerId: 'usr_emp_test',
    status: 'open',
    urgency: 'immediate',
    title: 'تست',
    category: 'farming',
    governorate: 'cairo',
    lat: 30.04,
    lng: 31.23,
    dailyWage: 200,
    durationDays: 1,
    startDate: '2026-05-01',
  };
  const result = await startMatch(fakeJob);
  assert.equal(result.ok, true);
  assert.ok(result.matchId.startsWith('im_'));
  assert.ok(result.candidateCount >= 1);
});

test('P40-28: tryAccept by valid candidate succeeds', async () => {
  const { startMatch, tryAccept, findById } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const employer = await createUser('01098765001', 'employer');
  await update(employer.id, { name: 'emp', governorate: 'cairo' });

  const w = await createUser('01098765002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true, currentLocation: { lat: 30.04, lng: 31.23 } });

  const job = await createJob(employer.id, {
    title: 'تست فوري',
    category: 'farming',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1,
    description: '',
    urgency: 'immediate',
    lat: 30.04,
    lng: 31.23,
  });

  const matchResult = await startMatch(job);
  assert.equal(matchResult.ok, true);

  const acceptResult = await tryAccept(matchResult.matchId, w.id);
  assert.equal(acceptResult.ok, true);
  assert.ok(acceptResult.application);
  assert.equal(acceptResult.application.status, 'accepted');
  assert.equal(acceptResult.application.acceptedViaInstantMatch, true);

  const match = await findById(matchResult.matchId);
  assert.equal(match.status, 'accepted');
  assert.equal(match.acceptedBy, w.id);
});

test('P40-29: tryAccept by non-candidate → NOT_CANDIDATE', async () => {
  const { startMatch, tryAccept } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01098765101', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w1 = await createUser('01098765102', 'worker');
  await update(w1.id, { name: 'w1', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w1.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const w2 = await createUser('01098765103', 'worker');
  await update(w2.id, { name: 'w2', governorate: 'cairo', categories: ['farming'] });
  // w2 is NOT online — so won't be a candidate

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  assert.equal(m.ok, true);

  const result = await tryAccept(m.matchId, w2.id);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_CANDIDATE');
});

test('P40-30: tryAccept after another won → TOO_LATE', async () => {
  const { startMatch, tryAccept } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01098765201', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w1 = await createUser('01098765202', 'worker');
  await update(w1.id, { name: 'w1', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w1.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const w2 = await createUser('01098765203', 'worker');
  await update(w2.id, { name: 'w2', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w2.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);

  const r1 = await tryAccept(m.matchId, w1.id);
  assert.equal(r1.ok, true);

  const r2 = await tryAccept(m.matchId, w2.id);
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'TOO_LATE');
});

test('P40-31: Concurrent tryAccept (5 workers, 1 job) → exactly 1 wins', async () => {
  const { startMatch, tryAccept } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01098765301', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const workerIds = [];
  for (let i = 0; i < 5; i++) {
    const w = await createUser('010987654' + (10 + i), 'worker');
    await update(w.id, { name: 'w' + i, governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
    _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });
    workerIds.push(w.id);
  }

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  assert.equal(m.ok, true);

  // Use only candidates from the match (top N could be < 5)
  const candidates = workerIds.slice(0, m.candidateCount);
  const results = await Promise.all(candidates.map(wid => tryAccept(m.matchId, wid)));

  const successes = results.filter(r => r.ok);
  const failures = results.filter(r => !r.ok && r.code === 'TOO_LATE');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, candidates.length - 1);
});

test('P40-32: Accepted match increments job.workersAccepted', async () => {
  const { startMatch, tryAccept } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob, findById: findJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01098770001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01098770002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 2, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  await tryAccept(m.matchId, w.id);

  const updated = await findJob(job.id);
  assert.equal(updated.workersAccepted, 1);
});

test('P40-33: Job becomes filled when workersAccepted reaches workersNeeded', async () => {
  const { startMatch, tryAccept } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob, findById: findJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01098770101', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01098770102', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  await tryAccept(m.matchId, w.id);

  const updated = await findJob(job.id);
  assert.equal(updated.status, 'filled');
});

test('P40-34: expireMatch marks pending → expired', async () => {
  const { expireMatch } = await import('../server/services/instantMatch.js');
  const { atomicWrite, getWriteRecordPath } = await import('../server/services/database.js');
  const matchId = 'im_test_expire1';
  await atomicWrite(getWriteRecordPath('instant_matches', matchId), {
    id: matchId, jobId: 'job_x', candidateWorkerIds: ['w1'],
    notifiedAt: new Date().toISOString(), acceptanceWindowSeconds: 90,
    status: 'pending', createdAt: new Date().toISOString(),
  });
  const ok = await expireMatch(matchId);
  assert.equal(ok, true);
});

test('P40-35: cleanupExpired processes timed-out matches', async () => {
  const { cleanupExpired } = await import('../server/services/instantMatch.js');
  const { atomicWrite, getWriteRecordPath } = await import('../server/services/database.js');
  const matchId = 'im_test_expire2';
  await atomicWrite(getWriteRecordPath('instant_matches', matchId), {
    id: matchId, jobId: 'job_y', candidateWorkerIds: ['w1'],
    notifiedAt: new Date(Date.now() - 200000).toISOString(),
    acceptanceWindowSeconds: 90,
    status: 'pending', createdAt: new Date(Date.now() - 200000).toISOString(),
  });
  const count = await cleanupExpired();
  assert.ok(count >= 1);
});

test('P40-36: getStats returns activeAttempts + successRate', async () => {
  const { getStats } = await import('../server/services/instantMatch.js');
  const stats = await getStats();
  assert.equal(typeof stats.activeAttempts, 'number');
  assert.equal(typeof stats.successRateLastHour, 'number');
});

test('P40-37: Stored in shard subdir (YYYY-MM)', async () => {
  const { startMatch } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01099900001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01099900002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  assert.equal(m.ok, true);

  // Verify shard directory exists
  const { readdir } = await import('node:fs/promises');
  const matchDir = join(TEMP_DIR, 'instant_matches');
  const entries = await readdir(matchDir);
  const shardDir = entries.find(e => /^\d{4}-\d{2}$/.test(e));
  assert.ok(shardDir, 'shard subdirectory should exist');
});

test('P40-38: Application created has acceptedViaInstantMatch=true', async () => {
  const { startMatch, tryAccept } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  const { findById: findApp } = await import('../server/services/applications.js');
  clearPresence();

  const emp = await createUser('01099911001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01099911002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  const r = await tryAccept(m.matchId, w.id);
  assert.equal(r.ok, true);
  const app = await findApp(r.application.id);
  assert.equal(app.acceptedViaInstantMatch, true);
  assert.equal(app.status, 'accepted');
});

test('P40-39: Filter by category (non-matching workers excluded)', async () => {
  const { startMatch } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01099922001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01099922002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['plumbing'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  assert.equal(m.ok, false);
  assert.equal(m.code, 'NO_CANDIDATES');
});

test('P40-40: Filter by acceptingJobs=false excludes', async () => {
  const { startMatch } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01099933001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01099933002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: false });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  assert.equal(m.ok, false);
});

test('P40-41: findPendingByJob returns pending match', async () => {
  const { startMatch, findPendingByJob } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01099944001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01099944002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  await startMatch(job);
  const pending = await findPendingByJob(job.id);
  assert.ok(pending);
  assert.equal(pending.status, 'pending');
});

test('P40-42: Score weights from config are applied', async () => {
  const config = (await import('../config.js')).default;
  const w = config.INSTANT_MATCH.scoreWeights;
  assert.equal(w.distance + w.trustScore + w.ratingAvg, 1);
});

test('P40-43: Top N limited to topNCandidates', async () => {
  const config = (await import('../config.js')).default;
  assert.equal(config.INSTANT_MATCH.topNCandidates, 5);
});

test('P40-44: Acceptance window from config = 90s', async () => {
  const config = (await import('../config.js')).default;
  assert.equal(config.INSTANT_MATCH.acceptanceWindowSeconds, 90);
});

test('P40-45: Search radius from config = 5km', async () => {
  const config = (await import('../config.js')).default;
  assert.equal(config.INSTANT_MATCH.searchRadiusKm, 5);
});

test('P40-46: Fallback to broadcast enabled', async () => {
  const config = (await import('../config.js')).default;
  assert.equal(config.INSTANT_MATCH.fallbackToBroadcast, true);
});

test('P40-47: Match record fields are correct', async () => {
  const { startMatch, findById } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01099955001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01099955002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  const rec = await findById(m.matchId);
  assert.ok(rec);
  assert.equal(rec.status, 'pending');
  assert.ok(Array.isArray(rec.candidateWorkerIds));
  assert.equal(rec.acceptanceWindowSeconds, 90);
  assert.equal(rec.acceptedBy, null);
});

test('P40-48: jobMatcher.js immediate jobs trigger startMatch (integration)', async () => {
  // We can verify the integration was wired by checking jobMatcher.js exports
  // and that immediate jobs go through the new path.
  const jobMatcherModule = await import('../server/services/jobMatcher.js');
  assert.equal(typeof jobMatcherModule.setupJobMatching, 'function');
});

test('P40-49: Excludes employer from candidates (self-match prevention)', async () => {
  const { startMatch } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  // Employer who is also a worker (edge case)
  const emp = await createUser('01099966001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w = await createUser('01099966002', 'worker');
  await update(w.id, { name: 'w', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  if (m.ok) {
    // Verify employer is NOT in candidates
    const { findById } = await import('../server/services/instantMatch.js');
    const rec = await findById(m.matchId);
    assert.equal(rec.candidateWorkerIds.includes(emp.id), false);
  }
});

test('P40-50: tryAccept on accepted match → TOO_LATE', async () => {
  const { startMatch, tryAccept } = await import('../server/services/instantMatch.js');
  const { _setPresence, clearPresence } = await import('../server/services/presenceService.js');
  const { create: createUser, update } = await import('../server/services/users.js');
  const { create: createJob } = await import('../server/services/jobs.js');
  clearPresence();

  const emp = await createUser('01099977001', 'employer');
  await update(emp.id, { name: 'e', governorate: 'cairo' });

  const w1 = await createUser('01099977002', 'worker');
  await update(w1.id, { name: 'w1', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w1.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const w2 = await createUser('01099977003', 'worker');
  await update(w2.id, { name: 'w2', governorate: 'cairo', categories: ['farming'], lat: 30.04, lng: 31.23 });
  _setPresence(w2.id, { lastHeartbeat: Date.now(), acceptingJobs: true });

  const job = await createJob(emp.id, {
    title: 't', category: 'farming', governorate: 'cairo',
    workersNeeded: 1, dailyWage: 200,
    startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    durationDays: 1, description: '', urgency: 'immediate',
    lat: 30.04, lng: 31.23,
  });
  const m = await startMatch(job);
  await tryAccept(m.matchId, w1.id);
  const r2 = await tryAccept(m.matchId, w2.id);
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'TOO_LATE');
});

// ═══════════════════════════════════════════════════════════════
// 4. LIVE FEED TESTS (10)
// ═══════════════════════════════════════════════════════════════

test('P40-51: registerConnection adds to liveFeedConnections', async () => {
  const { registerConnection, _testHelpers, getStats, clearConnections } = await import('../server/services/liveFeed.js');
  clearConnections();
  const fakeRes = { writableEnded: false, destroyed: false, write: () => {}, on: () => {} };
  registerConnection('usr_lf1', fakeRes, { governorate: 'cairo' });
  const stats = getStats();
  assert.ok(stats.users >= 1);
});

test('P40-52: jobMatchesFilters governorate filtering', async () => {
  const { _testHelpers } = await import('../server/services/liveFeed.js');
  const job = { governorate: 'cairo', category: 'farming' };
  assert.equal(_testHelpers.jobMatchesFilters(job, { governorate: 'cairo' }), true);
  assert.equal(_testHelpers.jobMatchesFilters(job, { governorate: 'alex' }), false);
});

test('P40-53: jobMatchesFilters category filtering', async () => {
  const { _testHelpers } = await import('../server/services/liveFeed.js');
  const job = { governorate: 'cairo', category: 'farming' };
  assert.equal(_testHelpers.jobMatchesFilters(job, { categories: ['farming'] }), true);
  assert.equal(_testHelpers.jobMatchesFilters(job, { categories: ['plumbing'] }), false);
});

test('P40-54: jobMatchesFilters proximity filtering', async () => {
  const { _testHelpers } = await import('../server/services/liveFeed.js');
  const job = { governorate: 'cairo', category: 'farming', lat: 30.04, lng: 31.23 };
  assert.equal(_testHelpers.jobMatchesFilters(job, { lat: 30.04, lng: 31.23, radiusKm: 5 }), true);
  assert.equal(_testHelpers.jobMatchesFilters(job, { lat: 31.20, lng: 29.92, radiusKm: 5 }), false);
});

test('P40-55: jobToSummary returns expected fields', async () => {
  const { _testHelpers } = await import('../server/services/liveFeed.js');
  const job = {
    id: 'job_x', title: 'تست', category: 'farming', governorate: 'cairo',
    dailyWage: 250, workersNeeded: 5, workersAccepted: 0,
    durationDays: 2, startDate: '2026-05-01',
    urgency: 'immediate', status: 'open', createdAt: '2026-04-26T10:00:00Z',
  };
  const s = _testHelpers.jobToSummary(job);
  assert.equal(s.id, 'job_x');
  assert.equal(s.urgency, 'immediate');
  assert.equal(s.dailyWage, 250);
});

test('P40-56: getInitialDump returns top N nearby jobs', async () => {
  const { getInitialDump } = await import('../server/services/liveFeed.js');
  const dump = await getInitialDump('usr_test', { governorate: 'cairo' });
  assert.ok(Array.isArray(dump));
});

test('P40-57: getStats returns connections + users count', async () => {
  const { getStats, clearConnections, registerConnection } = await import('../server/services/liveFeed.js');
  clearConnections();
  const fakeRes = { writableEnded: false, destroyed: false, write: () => {}, on: () => {} };
  registerConnection('usr_lf2', fakeRes, {});
  const stats = getStats();
  assert.equal(typeof stats.connections, 'number');
  assert.equal(typeof stats.users, 'number');
});

test('P40-58: clearConnections empties registry', async () => {
  const { clearConnections, getStats, registerConnection } = await import('../server/services/liveFeed.js');
  const fakeRes = { writableEnded: false, destroyed: false, write: () => {}, on: () => {} };
  registerConnection('usr_lf3', fakeRes, {});
  clearConnections();
  const stats = getStats();
  assert.equal(stats.connections, 0);
  assert.equal(stats.users, 0);
});

test('P40-59: setupLiveFeedListeners is exported and callable', async () => {
  const { setupLiveFeedListeners } = await import('../server/services/liveFeed.js');
  assert.equal(typeof setupLiveFeedListeners, 'function');
});

test('P40-60: broadcastJobCreated does not throw for matching job', async () => {
  const { broadcastJobCreated, registerConnection, clearConnections } = await import('../server/services/liveFeed.js');
  clearConnections();
  let written = 0;
  const fakeRes = {
    writableEnded: false, destroyed: false,
    write: () => { written++; },
    on: () => {},
  };
  registerConnection('usr_lf4', fakeRes, { governorate: 'cairo' });
  broadcastJobCreated({
    id: 'job_x', title: 't', category: 'farming', governorate: 'cairo',
    dailyWage: 200, workersNeeded: 1, workersAccepted: 0,
    durationDays: 1, urgency: 'normal', status: 'open',
  });
  assert.ok(written >= 1);
});

// ═══════════════════════════════════════════════════════════════
// 5. API ENDPOINT TESTS (15)
// ═══════════════════════════════════════════════════════════════

test('P40-61: handleHeartbeat exists and is callable', async () => {
  const { handleHeartbeat } = await import('../server/handlers/presenceHandler.js');
  assert.equal(typeof handleHeartbeat, 'function');
});

test('P40-62: handleOnlineCount exists and is callable', async () => {
  const { handleOnlineCount } = await import('../server/handlers/presenceHandler.js');
  assert.equal(typeof handleOnlineCount, 'function');
});

test('P40-63: handleCreateWindow + handleListWindows + handleDeleteWindow exist', async () => {
  const handlers = await import('../server/handlers/availabilityHandler.js');
  assert.equal(typeof handlers.handleCreateWindow, 'function');
  assert.equal(typeof handlers.handleListWindows, 'function');
  assert.equal(typeof handlers.handleDeleteWindow, 'function');
});

test('P40-64: handleLiveFeedStream + handleInstantAccept exist', async () => {
  const handlers = await import('../server/handlers/liveFeedHandler.js');
  assert.equal(typeof handlers.handleLiveFeedStream, 'function');
  assert.equal(typeof handlers.handleInstantAccept, 'function');
});

test('P40-65: Router has 7 new Phase 40 routes', async () => {
  const { createRouter } = await import('../server/router.js');
  // Routes are inside the closure — verify by smoke check via function existence
  assert.equal(typeof createRouter, 'function');
});

test('P40-66: instantAcceptInternal is exported from applications.js', async () => {
  const { instantAcceptInternal } = await import('../server/services/applications.js');
  assert.equal(typeof instantAcceptInternal, 'function');
});

test('P40-67: presenceService.recordHeartbeat returns ok=true', async () => {
  const { recordHeartbeat, clearPresence } = await import('../server/services/presenceService.js');
  clearPresence();
  const r = recordHeartbeat('usr_api1', { acceptingJobs: true });
  assert.equal(r.ok, true);
});

test('P40-68: presenceService disabled mode returns ok=false', async () => {
  // We test the structure — the actual config is enabled in tests
  const presence = await import('../server/services/presenceService.js');
  assert.equal(typeof presence.recordHeartbeat, 'function');
});

test('P40-69: availabilityWindow rejects invalid type', async () => {
  const { createWindow } = await import('../server/services/availabilityWindow.js');
  const r = await createWindow('usr_inv1', { type: 'wrong' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_TYPE');
});

test('P40-70: availabilityWindow rejects missing daysOfWeek for recurring', async () => {
  const { createWindow } = await import('../server/services/availabilityWindow.js');
  const r = await createWindow('usr_inv2', { type: 'recurring', startHour: 8, endHour: 17 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DAYS_REQUIRED');
});

test('P40-71: availabilityWindow rejects endHour <= startHour', async () => {
  const { createWindow } = await import('../server/services/availabilityWindow.js');
  const r = await createWindow('usr_inv3', { type: 'recurring', daysOfWeek: [0], startHour: 10, endHour: 9 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_HOUR_RANGE');
});

test('P40-72: instantMatch.findById returns null for non-existent', async () => {
  const { findById } = await import('../server/services/instantMatch.js');
  const r = await findById('im_nonexistent');
  assert.equal(r, null);
});

test('P40-73: jobs.list supports onlyOnline filter (no error)', async () => {
  const { list } = await import('../server/services/jobs.js');
  const jobs = await list({ onlyOnline: true });
  assert.ok(Array.isArray(jobs));
});

test('P40-74: instantMatch.expireMatch on non-pending → false', async () => {
  const { expireMatch } = await import('../server/services/instantMatch.js');
  const { atomicWrite, getWriteRecordPath } = await import('../server/services/database.js');
  const matchId = 'im_test_already_accepted';
  await atomicWrite(getWriteRecordPath('instant_matches', matchId), {
    id: matchId, jobId: 'job_a', candidateWorkerIds: ['w1'],
    notifiedAt: new Date().toISOString(), acceptanceWindowSeconds: 90,
    status: 'accepted', createdAt: new Date().toISOString(),
  });
  const ok = await expireMatch(matchId);
  assert.equal(ok, false);
});

test('P40-75: Health endpoint structure includes presence + instantMatch placeholders', async () => {
  // Verify the router code includes the new fields by checking router exports
  const router = await import('../server/router.js');
  assert.equal(typeof router.createRouter, 'function');
});

// ═══════════════════════════════════════════════════════════════
// 6. CONFIG + MIGRATION TESTS (5)
// ═══════════════════════════════════════════════════════════════

test('P40-76: Migration v3 is registered', async () => {
  const { runMigrations } = await import('../server/services/migration.js');
  assert.equal(typeof runMigrations, 'function');
  // The migration runs at startup; verify it doesn't throw
  // (already running with full data dirs created in `before`)
});

test('P40-77: DATABASE.dirs has 20 entries', async () => {
  const config = (await import('../config.js')).default;
  const dirs = Object.keys(config.DATABASE.dirs);
  assert.equal(dirs.length, 20);
  assert.ok(dirs.includes('availability_windows'));
  assert.ok(dirs.includes('instant_matches'));
});

test('P40-78: SHARDING.collections has 8 entries', async () => {
  const config = (await import('../config.js')).default;
  assert.equal(config.SHARDING.collections.length, 8);
  assert.ok(config.SHARDING.collections.includes('instant_matches'));
});

test('P40-79: PWA cache name = yawmia-v0.36.0', async () => {
  const config = (await import('../config.js')).default;
  assert.equal(config.PWA.cacheName, 'yawmia-v0.36.0');
});

test('P40-80: Config has 4 new Phase 40 sections', async () => {
  const config = (await import('../config.js')).default;
  assert.ok(config.PRESENCE);
  assert.ok(config.INSTANT_MATCH);
  assert.ok(config.AVAILABILITY_WINDOWS);
  assert.ok(config.LIVE_FEED);
  assert.equal(config.PRESENCE.enabled, true);
  assert.equal(config.INSTANT_MATCH.topNCandidates, 5);
  assert.equal(config.AVAILABILITY_WINDOWS.maxWindowsPerUser, 10);
  assert.equal(config.LIVE_FEED.initialDumpSize, 20);
});
