// tests/phase11-pwa-admin.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 11 — PWA Foundation + Admin Enhancement + Performance Fixes
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-ph11-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let config, userService, db, eventBus;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
});

after(() => {
  if (eventBus) eventBus.clear();
});

// ── Config Tests ──────────────────────────────────────────────

describe('Phase 11 — Config', () => {

  it('P11-01: Config has 50 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 50, `expected 50 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P11-02: PWA section exists with correct fields', () => {
    assert.ok(config.PWA, 'PWA section should exist');
    assert.strictEqual(config.PWA.enabled, true);
    assert.strictEqual(config.PWA.themeColor, '#2563eb');
    assert.strictEqual(config.PWA.backgroundColor, '#0f172a');
    assert.strictEqual(config.PWA.swPath, '/sw.js');
    assert.strictEqual(config.PWA.manifestPath, '/manifest.json');
    assert.strictEqual(typeof config.PWA.cacheName, 'string');
    assert.ok(config.PWA.cacheName.includes('yawmia'));
  });

  it('P11-03: PWA config is frozen', () => {
    assert.strictEqual(Object.isFrozen(config.PWA), true, 'PWA config should be frozen');
    assert.throws(() => {
      config.PWA.enabled = false;
    }, TypeError, 'should not allow mutation');
  });
});

// ── Ban/Unban Tests ───────────────────────────────────────────

describe('Phase 11 — Ban/Unban', () => {

  it('P11-04: banUser sets status to banned', async () => {
    const user = await userService.create('01011110001', 'worker');
    const banned = await userService.banUser(user.id, 'سلوك مخالف');
    assert.ok(banned);
    assert.strictEqual(banned.status, 'banned');
    assert.ok(banned.bannedAt, 'bannedAt should be set');
  });

  it('P11-05: banUser sets banReason', async () => {
    const user = await userService.create('01011110002', 'worker');
    const banned = await userService.banUser(user.id, 'سلوك مخالف');
    assert.strictEqual(banned.banReason, 'سلوك مخالف');
  });

  it('P11-06: banUser returns null for non-existent user', async () => {
    const result = await userService.banUser('usr_nonexistent999', 'reason');
    assert.strictEqual(result, null);
  });

  it('P11-07: banUser returns null for admin user', async () => {
    const admin = await userService.create('01011110003', 'admin');
    const result = await userService.banUser(admin.id, 'test');
    assert.strictEqual(result, null);
  });

  it('P11-08: unbanUser sets status to active', async () => {
    const user = await userService.create('01011110004', 'employer');
    await userService.banUser(user.id, 'test ban');
    const unbanned = await userService.unbanUser(user.id);
    assert.ok(unbanned);
    assert.strictEqual(unbanned.status, 'active');
    assert.strictEqual(unbanned.bannedAt, null);
  });

  it('P11-09: unbanUser clears banReason', async () => {
    const user = await userService.create('01011110005', 'worker');
    await userService.banUser(user.id, 'سبب الحظر');
    const unbanned = await userService.unbanUser(user.id);
    assert.strictEqual(unbanned.banReason, null);
  });

  it('P11-10: unbanUser returns null for non-existent user', async () => {
    const result = await userService.unbanUser('usr_nonexistent888');
    assert.strictEqual(result, null);
  });
});

// ── PWA Files Tests ───────────────────────────────────────────

describe('Phase 11 — PWA Files', () => {

  it('P11-11: manifest.json exists and has correct structure', async () => {
    const manifestPath = resolve('frontend/manifest.json');
    const raw = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);
    assert.strictEqual(manifest.short_name, 'يوميّة');
    assert.strictEqual(manifest.dir, 'rtl');
    assert.strictEqual(manifest.lang, 'ar');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.theme_color, '#2563eb');
    assert.strictEqual(manifest.background_color, '#0f172a');
  });

  it('P11-12: manifest.json has 2+ icons', async () => {
    const manifestPath = resolve('frontend/manifest.json');
    const raw = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.length >= 2, `expected 2+ icons, got ${manifest.icons.length}`);
  });

  it('P11-13: sw.js exists and contains cache name', async () => {
    const swPath = resolve('frontend/sw.js');
    const content = await readFile(swPath, 'utf-8');
    assert.ok(content.includes('yawmia-v0.34.0'), 'sw.js should contain cache name yawmia-v0.34.0');
  });

  it('P11-14: sw.js contains STATIC_ASSETS array', async () => {
    const swPath = resolve('frontend/sw.js');
    const content = await readFile(swPath, 'utf-8');
    assert.ok(content.includes('STATIC_ASSETS'), 'sw.js should contain STATIC_ASSETS');
  });

  it('P11-15: sw.js handles /api/ paths', async () => {
    const swPath = resolve('frontend/sw.js');
    const content = await readFile(swPath, 'utf-8');
    assert.ok(content.includes('/api/'), 'sw.js should handle /api/ paths');
  });
});

// ── Index Fix Tests ───────────────────────────────────────────

describe('Phase 11 — Employer Jobs Index', () => {

  it('P11-16: employer-jobs index is readable via getFromSetIndex', async () => {
    // Setup: create employer + job to populate index
    const employer = await userService.create('01011116001', 'employer');
    const jobsService = await import('../server/services/jobs.js');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة اختبار index',
      category: 'construction',
      governorate: 'cairo',
      workersNeeded: 2,
      dailyWage: 200,
      startDate: '2026-06-01',
      durationDays: 1,
    });

    const jobIds = await db.getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, employer.id);
    assert.ok(Array.isArray(jobIds), 'should return array');
    assert.ok(jobIds.includes(job.id), 'should include the created job ID');
  });

  it('P11-17: Jobs retrieved via index match source records', async () => {
    const employer = await userService.create('01011117001', 'employer');
    const jobsService = await import('../server/services/jobs.js');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة اختبار match',
      category: 'farming',
      governorate: 'giza',
      workersNeeded: 1,
      dailyWage: 150,
      startDate: '2026-06-01',
      durationDays: 2,
    });

    const jobIds = await db.getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, employer.id);
    assert.ok(jobIds.length > 0, 'index should have entries');

    for (const jobId of jobIds) {
      const jobData = await db.readJSON(db.getRecordPath('jobs', jobId));
      assert.ok(jobData, `job ${jobId} should exist on disk`);
      assert.strictEqual(jobData.employerId, employer.id, 'job should belong to employer');
    }
  });
});

// ── OTP Rate Limit Tests ──────────────────────────────────────

describe('Phase 11 — OTP Rate Limit Status Code', () => {

  it('P11-18: sendOtp returns ok: false when rate limited', async () => {
    const authService = await import('../server/services/auth.js');
    const phone = '01011118001';
    // Send up to the limit
    for (let i = 0; i < config.RATE_LIMIT.otpMaxRequests; i++) {
      await authService.sendOtp(phone, 'worker');
    }
    // Next one should be blocked
    const result = await authService.sendOtp(phone, 'worker');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'PHONE_OTP_RATE_LIMITED');
  });
});

// ── Version Tests ─────────────────────────────────────────────

describe('Phase 11 — Version', () => {

  it('P11-19: package.json version is 0.33.0', async () => {
    const pkgPath = resolve('package.json');
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.34.0');
  });

  it('P11-20: Config cacheName matches version', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.34.0');
  });
});
