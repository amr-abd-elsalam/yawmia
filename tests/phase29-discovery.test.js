// ═══════════════════════════════════════════════════════════════
// tests/phase29-discovery.test.js — Phase 29: Smart Discovery +
// Worker Availability + Arabic Search + Index Health (~45 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

let config;
let tmpDir;

before(async () => {
  config = (await import('../config.js')).default;
});

async function fileExists(path) {
  try { await (await import('node:fs/promises')).access(resolve(path)); return true; } catch { return false; }
}

// ══════════════════════════════════════════════════════════════
// Worker Availability
// ══════════════════════════════════════════════════════════════

describe('Phase 29 — Worker Availability', () => {

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-p29-'));
    const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit', 'messages', 'push_subscriptions'];
    for (const d of dirs) {
      await mkdir(join(tmpDir, d), { recursive: true });
    }
    process.env.YAWMIA_DATA_PATH = tmpDir;
  });

  after(async () => {
    delete process.env.YAWMIA_DATA_PATH;
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it('P29-01: users.js create() includes availability field', async () => {
    const content = await readFile(resolve('server/services/users.js'), 'utf-8');
    assert.ok(content.includes('availability:'), 'user object should have availability field');
    assert.ok(content.includes('availableFrom:'), 'availability should have availableFrom');
    assert.ok(content.includes('availableUntil:'), 'availability should have availableUntil');
  });

  it('P29-02: default availability is true via config', () => {
    assert.ok(config.WORKER_AVAILABILITY, 'WORKER_AVAILABILITY section should exist');
    assert.strictEqual(config.WORKER_AVAILABILITY.defaultAvailable, true);
  });

  it('P29-03: new user has availability object with correct structure', async () => {
    const db = await import('../server/services/database.js');
    await db.initDatabase();
    const userService = await import('../server/services/users.js');
    const user = await userService.create('01029290001', 'worker');
    assert.ok(user.availability, 'user should have availability');
    assert.strictEqual(user.availability.available, true);
    assert.strictEqual(user.availability.availableFrom, null);
    assert.strictEqual(user.availability.availableUntil, null);
    assert.ok(user.availability.updatedAt, 'should have updatedAt');
  });

  it('P29-04: handleGetMe source returns availability', async () => {
    const content = await readFile(resolve('server/handlers/authHandler.js'), 'utf-8');
    assert.ok(content.includes('availability: user.availability'), 'handleGetMe should return availability');
  });

  it('P29-05: handleUpdateProfile accepts availability for workers', async () => {
    const content = await readFile(resolve('server/handlers/authHandler.js'), 'utf-8');
    assert.ok(content.includes('body.availability'), 'handleUpdateProfile should handle body.availability');
  });

  it('P29-06: handleUpdateProfile availability block checks worker role', async () => {
    const content = await readFile(resolve('server/handlers/authHandler.js'), 'utf-8');
    assert.ok(content.includes("req.user.role === 'worker'"), 'availability update should check worker role');
  });

  it('P29-07: profile.html has availability-section container', async () => {
    const html = await readFile(resolve('frontend/profile.html'), 'utf-8');
    assert.ok(html.includes('id="availability-section"'), 'profile.html should have availability-section');
  });

  it('P29-08: profile.js has renderAvailabilityToggle function', async () => {
    const content = await readFile(resolve('frontend/assets/js/profile.js'), 'utf-8');
    assert.ok(content.includes('function renderAvailabilityToggle'), 'profile.js should have renderAvailabilityToggle');
  });
});

// ══════════════════════════════════════════════════════════════
// Job Matcher
// ══════════════════════════════════════════════════════════════

describe('Phase 29 — Job Matcher', () => {

  it('P29-09: jobMatcher.js exports setupJobMatching', async () => {
    const mod = await import('../server/services/jobMatcher.js');
    assert.strictEqual(typeof mod.setupJobMatching, 'function');
  });

  it('P29-10: setupJobMatching checks JOB_MATCHING.enabled', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('JOB_MATCHING') && content.includes('.enabled'), 'should check JOB_MATCHING.enabled');
  });

  it('P29-11: matchAndNotify uses category matching', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('.categories') && content.includes('.includes(job.category)'), 'should match by category');
  });

  it('P29-12: matchAndNotify uses proximity matching', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('haversineDistance'), 'should use haversineDistance for proximity');
  });

  it('P29-13: matchAndNotify checks availability', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('availability') && content.includes('available === false'), 'should check availability');
  });

  it('P29-14: matchAndNotify skips non-active workers', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes("status !== 'active'") || content.includes("status === 'active'"), 'should filter by active status');
  });

  it('P29-15: matchAndNotify skips employer (job creator)', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('employerId'), 'should skip job creator');
  });

  it('P29-16: matchAndNotify limits to maxNotificationsPerJob', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('maxNotificationsPerJob') && content.includes('.slice('), 'should limit notifications');
  });

  it('P29-17: matchAndNotify sorts by score descending', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('b.score - a.score') || content.includes('b.score-a.score'), 'should sort by score DESC');
  });

  it('P29-18: matchAndNotify creates notifications', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('createNotification'), 'should create notifications');
  });

  it('P29-19: matchAndNotify is fire-and-forget safe', async () => {
    const content = await readFile(resolve('server/services/jobMatcher.js'), 'utf-8');
    assert.ok(content.includes('catch'), 'should catch all errors');
    assert.ok(content.includes('.catch(() => {})') || content.includes('.catch(()'), 'EventBus listener should be fire-and-forget');
  });

  it('P29-20: router.js calls setupJobMatching', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes('setupJobMatching'), 'router should call setupJobMatching');
    // Should be after setupNotificationListeners
    const ntfIndex = content.indexOf('setupNotificationListeners()');
    const matchIndex = content.indexOf('setupJobMatching()');
    assert.ok(matchIndex > ntfIndex, 'setupJobMatching should be called after setupNotificationListeners');
  });
});

// ══════════════════════════════════════════════════════════════
// Arabic Normalizer
// ══════════════════════════════════════════════════════════════

describe('Phase 29 — Arabic Normalizer', () => {
  let normalizeArabic, hasArabic;

  before(async () => {
    const mod = await import('../server/services/arabicNormalizer.js');
    normalizeArabic = mod.normalizeArabic;
    hasArabic = mod.hasArabic;
  });

  it('P29-21: arabicNormalizer.js exports normalizeArabic', () => {
    assert.strictEqual(typeof normalizeArabic, 'function');
  });

  it('P29-22: arabicNormalizer.js exports hasArabic', () => {
    assert.strictEqual(typeof hasArabic, 'function');
  });

  it('P29-23: normalizeArabic removes diacritics', () => {
    assert.strictEqual(normalizeArabic('مُهَنْدِس'), 'مهندس');
  });

  it('P29-24: normalizeArabic normalizes hamza (أ → ا)', () => {
    assert.strictEqual(normalizeArabic('أحمد'), 'احمد');
  });

  it('P29-25: normalizeArabic normalizes hamza (إ → ا)', () => {
    assert.strictEqual(normalizeArabic('إبراهيم'), 'ابراهيم');
  });

  it('P29-26: normalizeArabic normalizes taa marbuta (ة → ه)', () => {
    assert.strictEqual(normalizeArabic('قاهرة'), 'قاهره');
  });

  it('P29-27: normalizeArabic normalizes alef maksura (ى → ي)', () => {
    assert.strictEqual(normalizeArabic('مصطفى'), 'مصطفي');
  });

  it('P29-28: normalizeArabic removes tatweel', () => {
    assert.strictEqual(normalizeArabic('عـامل'), 'عامل');
  });

  it('P29-29: normalizeArabic handles combined normalizations', () => {
    const result = normalizeArabic('إنشاءات');
    assert.ok(result.includes('انشا'), `expected normalized text to contain 'انشا', got '${result}'`);
  });

  it('P29-30: normalizeArabic passes English through unchanged', () => {
    assert.strictEqual(normalizeArabic('hello'), 'hello');
  });

  it('P29-31: normalizeArabic handles null/empty input', () => {
    assert.strictEqual(normalizeArabic(''), '');
    assert.strictEqual(normalizeArabic(null), '');
    assert.strictEqual(normalizeArabic(undefined), '');
  });

  it('P29-32: jobs.js list() uses normalizeArabic in search', async () => {
    const content = await readFile(resolve('server/services/jobs.js'), 'utf-8');
    assert.ok(content.includes("import('./arabicNormalizer.js')"), 'jobs.js should import arabicNormalizer');
    assert.ok(content.includes('normalizeArabic'), 'jobs.js should use normalizeArabic');
  });

  it('P29-33: hasArabic returns true for Arabic text', () => {
    assert.strictEqual(hasArabic('أحمد'), true);
    assert.strictEqual(hasArabic('hello مرحبا'), true);
  });

  it('P29-34: hasArabic returns false for non-Arabic text', () => {
    assert.strictEqual(hasArabic('hello'), false);
    assert.strictEqual(hasArabic('123'), false);
    assert.strictEqual(hasArabic(''), false);
    assert.strictEqual(hasArabic(null), false);
  });
});

// ══════════════════════════════════════════════════════════════
// Index Health
// ══════════════════════════════════════════════════════════════

describe('Phase 29 — Index Health', () => {

  it('P29-35: indexHealth.js exports checkIndexHealth', async () => {
    const mod = await import('../server/services/indexHealth.js');
    assert.strictEqual(typeof mod.checkIndexHealth, 'function');
  });

  it('P29-36: indexHealth.js exports getHealthStatus', async () => {
    const mod = await import('../server/services/indexHealth.js');
    assert.strictEqual(typeof mod.getHealthStatus, 'function');
  });

  it('P29-37: getHealthStatus returns correct structure', async () => {
    const { getHealthStatus } = await import('../server/services/indexHealth.js');
    const status = getHealthStatus();
    assert.ok('lastCheck' in status, 'should have lastCheck');
    assert.ok('status' in status, 'should have status');
    assert.ok('warnings' in status, 'should have warnings');
    assert.strictEqual(typeof status.warnings, 'number');
  });

  it('P29-38: checkIndexHealth checks phone-index', async () => {
    const content = await readFile(resolve('server/services/indexHealth.js'), 'utf-8');
    assert.ok(content.includes('phone') && content.includes('Index') || content.includes('phoneIndex'), 'should check phone-index');
  });

  it('P29-39: checkIndexHealth checks job-apps-index', async () => {
    const content = await readFile(resolve('server/services/indexHealth.js'), 'utf-8');
    assert.ok(content.includes('jobAppsIndex') || content.includes('job-apps'), 'should check job-apps-index');
  });

  it('P29-40: health endpoint includes indexHealth', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes('indexHealth'), 'health endpoint should include indexHealth');
    assert.ok(content.includes('getHealthStatus'), 'should use getHealthStatus');
  });

  it('P29-41: server.js calls checkIndexHealth at startup', async () => {
    const content = await readFile(resolve('server.js'), 'utf-8');
    assert.ok(content.includes('checkIndexHealth'), 'server.js should call checkIndexHealth');
  });
});

// ══════════════════════════════════════════════════════════════
// Config
// ══════════════════════════════════════════════════════════════

describe('Phase 29 — Config', () => {

  it('P29-42: config has WORKER_AVAILABILITY section', () => {
    assert.ok(config.WORKER_AVAILABILITY, 'WORKER_AVAILABILITY section should exist');
    assert.strictEqual(config.WORKER_AVAILABILITY.enabled, true);
  });

  it('P29-43: config has JOB_MATCHING section', () => {
    assert.ok(config.JOB_MATCHING, 'JOB_MATCHING section should exist');
    assert.strictEqual(config.JOB_MATCHING.enabled, true);
  });

  it('P29-44: JOB_MATCHING.maxNotificationsPerJob is 50', () => {
    assert.strictEqual(config.JOB_MATCHING.maxNotificationsPerJob, 50);
  });

  it('P29-45: config has 43 sections total', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 48, `expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Version
// ══════════════════════════════════════════════════════════════

describe('Phase 29 — Version', () => {

  it('P29-46: package.json version is 0.27.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.31.0');
  });

  it('P29-47: config PWA cacheName is yawmia-v0.27.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.31.0');
  });

  it('P29-48: sw.js CACHE_NAME is yawmia-v0.27.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.31.0'"), 'cache name should be yawmia-v0.27.0');
  });
});
