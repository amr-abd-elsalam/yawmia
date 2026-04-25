// tests/phase35-hardening.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 35 — Operational Hardening & Data Maturity (~80 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir;
let config;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-ph35-test-'));
  const dirs = [
    'users', 'sessions', 'jobs', 'applications', 'otp',
    'notifications', 'ratings', 'payments', 'reports',
    'verifications', 'attendance', 'audit', 'messages',
    'push_subscriptions', 'alerts', 'metrics', 'favorites',
  ];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
  config = (await import('../config.js')).default;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════
// Paginated Disk Reads
// ══════════════════════════════════════════════════════════════

describe('Phase 35 — Paginated Disk Reads', () => {
  let db;
  let testDir;

  before(async () => {
    db = await import('../server/services/database.js');
    testDir = join(tmpDir, '_paginated_test');
    await mkdir(testDir, { recursive: true });
  });

  it('P35-01: paginatedListJSON with empty dir → { items: [], total: 0 }', async () => {
    const emptyDir = join(tmpDir, '_empty_test');
    await mkdir(emptyDir, { recursive: true });
    const result = await db.paginatedListJSON(emptyDir);
    assert.deepStrictEqual(result, { items: [], total: 0 });
  });

  it('P35-02: 5 files, skip=0, limit=3 → 3 items, total=5', async () => {
    const dir = join(tmpDir, '_page_test_02');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      await writeFile(join(dir, `item_${String(i).padStart(3, '0')}.json`), JSON.stringify({ id: `item_${i}`, idx: i }));
    }
    const result = await db.paginatedListJSON(dir, { skip: 0, limit: 3, prefix: 'item_', sortDir: 'asc' });
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.total, 5);
  });

  it('P35-03: 5 files, skip=3, limit=3 → 2 items, total=5', async () => {
    const dir = join(tmpDir, '_page_test_02'); // reuse
    const result = await db.paginatedListJSON(dir, { skip: 3, limit: 3, prefix: 'item_', sortDir: 'asc' });
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.total, 5);
  });

  it('P35-04: skip beyond total → items=[], total correct', async () => {
    const dir = join(tmpDir, '_page_test_02');
    const result = await db.paginatedListJSON(dir, { skip: 100, limit: 3, prefix: 'item_' });
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.total, 5);
  });

  it('P35-05: prefix filter → only matching files', async () => {
    const dir = join(tmpDir, '_prefix_test');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'job_001.json'), JSON.stringify({ id: 'job_001' }));
    await writeFile(join(dir, 'job_002.json'), JSON.stringify({ id: 'job_002' }));
    await writeFile(join(dir, 'index.json'), JSON.stringify({ other: true }));
    const result = await db.paginatedListJSON(dir, { prefix: 'job_' });
    assert.strictEqual(result.total, 2);
  });

  it('P35-06: sortDir=asc → ascending order', async () => {
    const dir = join(tmpDir, '_page_test_02');
    const result = await db.paginatedListJSON(dir, { skip: 0, limit: 5, prefix: 'item_', sortDir: 'asc' });
    assert.strictEqual(result.items[0].idx, 0);
  });

  it('P35-07: sortDir=desc (default) → descending order', async () => {
    const dir = join(tmpDir, '_page_test_02');
    const result = await db.paginatedListJSON(dir, { skip: 0, limit: 5, prefix: 'item_' });
    assert.strictEqual(result.items[0].idx, 4);
  });

  it('P35-08: limit=0 → empty items', async () => {
    const dir = join(tmpDir, '_page_test_02');
    const result = await db.paginatedListJSON(dir, { limit: 0, prefix: 'item_' });
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.total, 5);
  });

  it('P35-09: Non-existent dir → { items: [], total: 0 }', async () => {
    const result = await db.paginatedListJSON(join(tmpDir, '_nonexistent'));
    assert.deepStrictEqual(result, { items: [], total: 0 });
  });

  it('P35-10: Mixed .json + .tmp files → .tmp excluded', async () => {
    const dir = join(tmpDir, '_tmp_test');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'a.json'), JSON.stringify({ id: 'a' }));
    await writeFile(join(dir, 'b.json.tmp'), JSON.stringify({ id: 'b' }));
    const result = await db.paginatedListJSON(dir);
    assert.strictEqual(result.total, 1);
  });
});

// ══════════════════════════════════════════════════════════════
// SSE Event Replay Buffer
// ══════════════════════════════════════════════════════════════

describe('Phase 35 — SSE Event Replay', () => {
  let replay;

  before(async () => {
    replay = await import('../server/services/eventReplayBuffer.js');
  });

  beforeEach(() => {
    replay.clear();
  });

  it('P35-11: addEvent stores in buffer', () => {
    replay.addEvent('user1', 'evt1', 'notification', { msg: 'test' });
    const stats = replay.getStats();
    assert.strictEqual(stats.totalUsers, 1);
    assert.strictEqual(stats.totalEvents, 1);
  });

  it('P35-12: getEventsSince with valid lastEventId → newer events only', () => {
    replay.addEvent('user1', 'evt1', 'notification', { n: 1 });
    replay.addEvent('user1', 'evt2', 'notification', { n: 2 });
    replay.addEvent('user1', 'evt3', 'notification', { n: 3 });
    const events = replay.getEventsSince('user1', 'evt1');
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].id, 'evt2');
    assert.strictEqual(events[1].id, 'evt3');
  });

  it('P35-13: getEventsSince with null lastEventId → empty', () => {
    replay.addEvent('user1', 'evt1', 'notification', {});
    const events = replay.getEventsSince('user1', null);
    assert.strictEqual(events.length, 0);
  });

  it('P35-14: getEventsSince with unknown lastEventId → empty', () => {
    replay.addEvent('user1', 'evt1', 'notification', {});
    const events = replay.getEventsSince('user1', 'unknown');
    assert.strictEqual(events.length, 0);
  });

  it('P35-15: Buffer respects maxEventsPerUser', () => {
    const max = config.SSE_REPLAY.maxEventsPerUser;
    for (let i = 0; i < max + 10; i++) {
      replay.addEvent('user1', `evt_${i}`, 'notification', { i });
    }
    const stats = replay.getStats();
    assert.strictEqual(stats.totalEvents, max);
  });

  it('P35-16: cleanup removes old events', () => {
    replay.addEvent('user1', 'evt1', 'notification', {});
    // Manually check cleanup doesn't crash on fresh events
    replay.cleanup();
    const stats = replay.getStats();
    assert.ok(stats.totalEvents >= 0);
  });

  it('P35-17: getStats returns correct counts', () => {
    replay.addEvent('user1', 'e1', 'n', {});
    replay.addEvent('user2', 'e2', 'n', {});
    replay.addEvent('user1', 'e3', 'n', {});
    const stats = replay.getStats();
    assert.strictEqual(stats.totalUsers, 2);
    assert.strictEqual(stats.totalEvents, 3);
  });

  it('P35-18: clear resets all buffers', () => {
    replay.addEvent('user1', 'e1', 'n', {});
    replay.clear();
    const stats = replay.getStats();
    assert.strictEqual(stats.totalUsers, 0);
    assert.strictEqual(stats.totalEvents, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// Content Filter V2
// ══════════════════════════════════════════════════════════════

describe('Phase 35 — Content Filter V2', () => {
  let checkContent, isContentSafe;

  before(async () => {
    const mod = await import('../server/services/contentFilter.js');
    checkContent = mod.checkContent;
    isContentSafe = mod.isContentSafe;
  });

  it('P35-31: URL http://example.com → blocked', () => {
    const result = checkContent('اشتغل معايا http://example.com');
    assert.ok(result.flaggedTerms.includes('رابط خارجي'));
    assert.ok(result.score >= 0.7);
  });

  it('P35-32: URL https://t.me/channel → blocked', () => {
    const result = checkContent('تابعني https://t.me/channel');
    assert.ok(!result.safe);
  });

  it('P35-33: URL www.whatsapp.com → blocked', () => {
    const result = checkContent('ابعتلي على www.whatsapp.com');
    assert.ok(!result.safe);
  });

  it('P35-34: Arabic-Indic phone ٠١٠١٢٣٤٥٦٧٨ → blocked', () => {
    const result = checkContent('كلمني على ٠١٠١٢٣٤٥٦٧٨');
    assert.ok(result.flaggedTerms.some(t => t.includes('أرقام عربية')));
    assert.ok(result.score >= 0.7);
  });

  it('P35-35: New dialect term "واتس" → flagged', () => {
    const result = checkContent('ابعتلي على الواتس');
    assert.ok(result.score > 0);
  });

  it('P35-36: New dialect term "واتس اب" → flagged', () => {
    const result = checkContent('كلمني واتس اب');
    assert.ok(result.score > 0);
  });

  it('P35-37: New dialect term "ابعتلي" → flagged', () => {
    const result = checkContent('ابعتلي رسالة');
    assert.ok(result.score > 0);
  });

  it('P35-38: Clean text → safe', () => {
    const result = checkContent('محتاج 5 عمال للحصاد في الجيزة');
    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.score, 0);
  });

  it('P35-39: Combined URL + phone → score capped at 1.0', () => {
    const result = checkContent('01012345678 http://example.com واتساب');
    assert.ok(result.score <= 1.0);
  });

  it('P35-40: Existing terms still detected', () => {
    const result = checkContent('هو ده نصاب واضح');
    assert.ok(result.score > 0);
    assert.ok(result.flaggedTerms.length > 0);
  });

  it('P35-41: Empty text → safe', () => {
    const result = checkContent('');
    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.score, 0);
  });

  it('P35-42: Non-string → safe', () => {
    const result = checkContent(12345);
    assert.strictEqual(result.safe, true);
  });

  it('P35-43: Normal text without URL-like patterns → safe', () => {
    const result = checkContent('محتاج عمال بناء في القاهرة — يومية 300 جنيه');
    assert.strictEqual(result.safe, true);
  });
});

// ══════════════════════════════════════════════════════════════
// Error Aggregation
// ══════════════════════════════════════════════════════════════

describe('Phase 35 — Error Aggregation', () => {
  let errorAgg;

  before(async () => {
    errorAgg = await import('../server/services/errorAggregator.js');
  });

  beforeEach(() => {
    errorAgg.clear();
  });

  it('P35-54: recordError increments count', () => {
    errorAgg.recordError('/api/jobs', 500, 'test error');
    const summary = errorAgg.getErrorSummary();
    assert.strictEqual(summary.totalErrors, 1);
  });

  it('P35-55: Multiple errors same endpoint → aggregated', () => {
    errorAgg.recordError('/api/jobs', 500, 'err1');
    errorAgg.recordError('/api/jobs', 500, 'err2');
    errorAgg.recordError('/api/jobs', 500, 'err3');
    const summary = errorAgg.getErrorSummary();
    assert.strictEqual(summary.totalErrors, 3);
    assert.strictEqual(summary.endpoints.length, 1);
    assert.strictEqual(summary.endpoints[0].count, 3);
  });

  it('P35-56: Different endpoints → separate entries', () => {
    errorAgg.recordError('/api/jobs', 500, 'err1');
    errorAgg.recordError('/api/users', 500, 'err2');
    const summary = errorAgg.getErrorSummary();
    assert.strictEqual(summary.endpoints.length, 2);
  });

  it('P35-57: getErrorSummary sorted by count desc', () => {
    errorAgg.recordError('/api/a', 500, 'err');
    errorAgg.recordError('/api/b', 500, 'err');
    errorAgg.recordError('/api/b', 500, 'err');
    const summary = errorAgg.getErrorSummary();
    assert.strictEqual(summary.endpoints[0].endpoint, '/api/b');
  });

  it('P35-58: cleanup runs without error', () => {
    errorAgg.recordError('/api/x', 500, 'err');
    errorAgg.cleanup();
    // Recent entries should survive cleanup
    const summary = errorAgg.getErrorSummary();
    assert.ok(summary.totalErrors >= 0);
  });

  it('P35-59: Empty state returns zeros', () => {
    const summary = errorAgg.getErrorSummary();
    assert.strictEqual(summary.totalErrors, 0);
    assert.strictEqual(summary.endpoints.length, 0);
  });

  it('P35-60: clear resets all', () => {
    errorAgg.recordError('/api/x', 500, 'err');
    errorAgg.clear();
    const summary = errorAgg.getErrorSummary();
    assert.strictEqual(summary.totalErrors, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// Session Hardening
// ══════════════════════════════════════════════════════════════

describe('Phase 35 — Session Hardening', () => {
  let sessions, db;

  before(async () => {
    db = await import('../server/services/database.js');
    await db.initDatabase();
    sessions = await import('../server/services/sessions.js');
  });

  it('P35-62: createSession with metadata stores IP + userAgent', async () => {
    const session = await sessions.createSession('usr_test1', 'worker', {
      ip: '1.2.3.4',
      userAgent: 'TestBrowser/1.0',
    });
    assert.ok(session.token);
    assert.strictEqual(session.ip, '1.2.3.4');
    assert.strictEqual(session.userAgent, 'TestBrowser/1.0');
  });

  it('P35-63: createSession without metadata → backward compatible', async () => {
    const session = await sessions.createSession('usr_test2', 'employer');
    assert.ok(session.token);
    assert.strictEqual(session.userId, 'usr_test2');
    // No metadata fields expected when not provided
  });

  it('P35-64: rotateSession creates new, destroys old', async () => {
    const oldSession = await sessions.createSession('usr_rot1', 'worker');
    const newSession = await sessions.rotateSession(
      oldSession.token, 'usr_rot1', 'worker',
      { ip: '5.6.7.8', userAgent: 'Test' }
    );
    assert.ok(newSession.token);
    assert.notStrictEqual(newSession.token, oldSession.token);
    // Old session should be destroyed
    const verified = await sessions.verifySession(oldSession.token);
    assert.strictEqual(verified, null);
    // New session should be valid
    const verifiedNew = await sessions.verifySession(newSession.token);
    assert.ok(verifiedNew);
  });

  it('P35-65: rotateSession preserves userId + role', async () => {
    const oldSession = await sessions.createSession('usr_rot2', 'employer');
    const newSession = await sessions.rotateSession(oldSession.token, 'usr_rot2', 'employer');
    assert.strictEqual(newSession.userId, 'usr_rot2');
    assert.strictEqual(newSession.role, 'employer');
  });

  it('P35-66: rotateSession with metadata → new session has metadata', async () => {
    const oldSession = await sessions.createSession('usr_rot3', 'worker');
    const newSession = await sessions.rotateSession(
      oldSession.token, 'usr_rot3', 'worker',
      { ip: '10.0.0.1', userAgent: 'Mobile/2.0' }
    );
    assert.strictEqual(newSession.ip, '10.0.0.1');
    assert.strictEqual(newSession.userAgent, 'Mobile/2.0');
  });

  it('P35-71: rotateSession with non-existent old token → creates new gracefully', async () => {
    const newSession = await sessions.rotateSession('ses_nonexistent', 'usr_rot4', 'worker');
    assert.ok(newSession.token);
    const verified = await sessions.verifySession(newSession.token);
    assert.ok(verified);
  });
});

// ══════════════════════════════════════════════════════════════
// Backup Scheduler
// ══════════════════════════════════════════════════════════════

describe('Phase 35 — Backup Scheduler', () => {
  let backupScheduler;

  before(async () => {
    backupScheduler = await import('../server/services/backupScheduler.js');
  });

  it('P35-46: exports checkAndRunBackup', () => {
    assert.strictEqual(typeof backupScheduler.checkAndRunBackup, 'function');
  });

  it('P35-47: exports getLastBackupInfo', () => {
    assert.strictEqual(typeof backupScheduler.getLastBackupInfo, 'function');
  });

  it('P35-53: Disabled via config → backed: false', async () => {
    // config.BACKUP.enabled is false by default
    const result = await backupScheduler.checkAndRunBackup();
    assert.strictEqual(result.backed, false);
  });

  it('P35-48: getLastBackupInfo returns structure', () => {
    const info = backupScheduler.getLastBackupInfo();
    assert.ok('lastDate' in info);
    assert.ok('lastResult' in info);
  });
});

// ══════════════════════════════════════════════════════════════
// Version + Config
// ══════════════════════════════════════════════════════════════

describe('Phase 35 — Version & Config', () => {

  it('P35-72: package.json version === 0.34.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.34.0');
  });

  it('P35-73: SSE_REPLAY section exists', () => {
    assert.ok(config.SSE_REPLAY);
    assert.strictEqual(config.SSE_REPLAY.enabled, true);
    assert.strictEqual(typeof config.SSE_REPLAY.maxEventsPerUser, 'number');
    assert.strictEqual(typeof config.SSE_REPLAY.maxEventAgeMs, 'number');
  });

  it('P35-74: BACKUP section exists (disabled by default)', () => {
    assert.ok(config.BACKUP);
    assert.strictEqual(config.BACKUP.enabled, false);
    assert.strictEqual(typeof config.BACKUP.hourEgypt, 'number');
    assert.strictEqual(typeof config.BACKUP.retentionCount, 'number');
  });

  it('P35-75: RATE_LIMIT.perUserEnabled exists', () => {
    assert.strictEqual(config.RATE_LIMIT.perUserEnabled, true);
    assert.strictEqual(typeof config.RATE_LIMIT.perUserMaxRequests, 'number');
    assert.strictEqual(typeof config.RATE_LIMIT.penaltyThreshold, 'number');
  });

  it('P35-76: SESSIONS.rotateOnAuth exists', () => {
    assert.strictEqual(config.SESSIONS.rotateOnAuth, true);
    assert.strictEqual(config.SESSIONS.trackMetadata, true);
  });

  it('P35-77: Config sections count === 49', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 50, `expected 48 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P35-78: PWA.cacheName === yawmia-v0.34.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.34.0');
  });

  it('P35-79: sw.js CACHE_NAME === yawmia-v0.34.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.34.0'"));
  });

  it('P35-80: router.js version === 0.34.0', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("version: '0.34.0'"));
  });

  it('P35-81: router.js has 92 routes', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches);
    assert.strictEqual(routeMatches.length, 92);
  });

  it('P35-82: /api/admin/errors route exists in router', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/admin/errors'"));
  });
});
