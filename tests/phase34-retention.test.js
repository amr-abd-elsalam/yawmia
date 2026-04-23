// ═══════════════════════════════════════════════════════════════
// tests/phase34-retention.test.js — Phase 34: User Retention & Engagement
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-ph34-test-'));
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
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let config, userService, jobsService, applicationsService, ratingsService, favoritesService, notificationsService, db, eventBus;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  jobsService = await import('../server/services/jobs.js');
  applicationsService = await import('../server/services/applications.js');
  ratingsService = await import('../server/services/ratings.js');
  favoritesService = await import('../server/services/favorites.js');
  notificationsService = await import('../server/services/notifications.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
});

after(() => {
  if (eventBus) eventBus.clear();
});

// ═══════════════════════════════════════════════════════════════
// Profile Completeness
// ═══════════════════════════════════════════════════════════════

describe('Phase 34 — Profile Completeness', () => {

  it('P34-01: Full profile → score 100', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const user = {
      role: 'worker',
      name: 'أحمد محمد',
      governorate: 'cairo',
      categories: ['farming'],
      lat: 30.04,
      lng: 31.23,
      verificationStatus: 'verified',
      termsAcceptedAt: '2026-04-20T10:00:00Z',
    };
    const result = calculateCompleteness(user);
    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.missing.length, 0);
  });

  it('P34-02: Empty profile → score 10 (only terms)', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const user = { role: 'worker', name: '', governorate: '', categories: [], termsAcceptedAt: '2026-01-01T00:00:00Z' };
    const result = calculateCompleteness(user);
    assert.strictEqual(result.score, 10);
  });

  it('P34-03: Worker without categories → missing includes categories', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const user = { role: 'worker', name: 'Test', governorate: 'cairo', categories: [] };
    const result = calculateCompleteness(user);
    assert.ok(result.missing.includes('categories'));
  });

  it('P34-04: Employer without categories → categories NOT missing', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const user = { role: 'employer', name: 'Test', governorate: 'cairo', categories: [] };
    const result = calculateCompleteness(user);
    assert.ok(!result.missing.includes('categories'));
  });

  it('P34-05: User without location → missing includes location', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const user = { role: 'worker', name: 'Test', governorate: 'cairo', categories: ['farming'] };
    const result = calculateCompleteness(user);
    assert.ok(result.missing.includes('location'));
  });

  it('P34-06: Verified user → verification NOT missing', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const user = { role: 'worker', name: 'Test', verificationStatus: 'verified' };
    const result = calculateCompleteness(user);
    assert.ok(!result.missing.includes('verification'));
  });

  it('P34-07: Score is number 0–100', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const user = { role: 'worker' };
    const result = calculateCompleteness(user);
    assert.strictEqual(typeof result.score, 'number');
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  it('P34-08: Null user returns score 0', async () => {
    const { calculateCompleteness } = await import('../server/services/profileCompleteness.js');
    const result = calculateCompleteness(null);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.complete, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Favorites
// ═══════════════════════════════════════════════════════════════

describe('Phase 34 — Favorites', () => {

  it('P34-09: Add favorite → ok', async () => {
    const employer = await userService.create('01034901001', 'employer');
    const worker = await userService.create('01034901002', 'worker');
    const result = await favoritesService.addFavorite(employer.id, worker.id, 'عامل ممتاز');
    assert.strictEqual(result.ok, true);
    assert.ok(result.favorite);
    assert.ok(result.favorite.id.startsWith('fav_'));
    assert.strictEqual(result.favorite.favoriteUserId, worker.id);
  });

  it('P34-10: Add duplicate → ALREADY_FAVORITE', async () => {
    const employer = await userService.create('01034910001', 'employer');
    const worker = await userService.create('01034910002', 'worker');
    await favoritesService.addFavorite(employer.id, worker.id);
    const result = await favoritesService.addFavorite(employer.id, worker.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_FAVORITE');
  });

  it('P34-11: Add self → CANNOT_FAVORITE_SELF', async () => {
    const employer = await userService.create('01034911001', 'employer');
    const result = await favoritesService.addFavorite(employer.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CANNOT_FAVORITE_SELF');
  });

  it('P34-12: Add non-existent user → USER_NOT_FOUND', async () => {
    const employer = await userService.create('01034912001', 'employer');
    const result = await favoritesService.addFavorite(employer.id, 'usr_nonexistent999');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'USER_NOT_FOUND');
  });

  it('P34-13: List favorites → enriched with target profile', async () => {
    const employer = await userService.create('01034913001', 'employer');
    const worker = await userService.create('01034913002', 'worker');
    await userService.update(worker.id, { name: 'عامل اختبار', governorate: 'cairo' });
    await favoritesService.addFavorite(employer.id, worker.id);
    const list = await favoritesService.listFavorites(employer.id);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    const first = list.find(f => f.favoriteUserId === worker.id);
    assert.ok(first);
    assert.ok(first.targetProfile);
    assert.strictEqual(first.targetProfile.name, 'عامل اختبار');
  });

  it('P34-14: Remove favorite → ok', async () => {
    const employer = await userService.create('01034914001', 'employer');
    const worker = await userService.create('01034914002', 'worker');
    const addResult = await favoritesService.addFavorite(employer.id, worker.id);
    const result = await favoritesService.removeFavorite(addResult.favorite.id, employer.id);
    assert.strictEqual(result.ok, true);
  });

  it('P34-15: Remove non-existent → FAVORITE_NOT_FOUND', async () => {
    const employer = await userService.create('01034915001', 'employer');
    const result = await favoritesService.removeFavorite('fav_nonexistent999', employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'FAVORITE_NOT_FOUND');
  });

  it('P34-16: isFavorite returns true after add', async () => {
    const employer = await userService.create('01034916001', 'employer');
    const worker = await userService.create('01034916002', 'worker');
    await favoritesService.addFavorite(employer.id, worker.id);
    const result = await favoritesService.isFavorite(employer.id, worker.id);
    assert.strictEqual(result, true);
  });

  it('P34-17: isFavorite returns false when not favorited', async () => {
    const employer = await userService.create('01034917001', 'employer');
    const worker = await userService.create('01034917002', 'worker');
    const result = await favoritesService.isFavorite(employer.id, worker.id);
    assert.strictEqual(result, false);
  });

  it('P34-18: Remove then check → false', async () => {
    const employer = await userService.create('01034918001', 'employer');
    const worker = await userService.create('01034918002', 'worker');
    const addResult = await favoritesService.addFavorite(employer.id, worker.id);
    await favoritesService.removeFavorite(addResult.favorite.id, employer.id);
    const result = await favoritesService.isFavorite(employer.id, worker.id);
    assert.strictEqual(result, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Pending Ratings
// ═══════════════════════════════════════════════════════════════

describe('Phase 34 — Pending Ratings', () => {

  it('P34-19: Worker with unrated completed job → pending has entry', async () => {
    const employer = await userService.create('01034919001', 'employer');
    const worker = await userService.create('01034919002', 'worker');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة تقييم', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const appResult = await applicationsService.apply(job.id, worker.id);
    await applicationsService.accept(appResult.application.id, employer.id);
    await jobsService.startJob(job.id, employer.id);
    await jobsService.completeJob(job.id, employer.id);

    const pending = await ratingsService.getPendingRatings(worker.id);
    assert.ok(pending.length > 0);
    assert.strictEqual(pending[0].jobId, job.id);
    assert.strictEqual(pending[0].targetUserId, employer.id);
    assert.strictEqual(pending[0].targetRole, 'employer');
  });

  it('P34-20: Worker who already rated → empty', async () => {
    const employer = await userService.create('01034920001', 'employer');
    const worker = await userService.create('01034920002', 'worker');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة مقيّمة', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const appResult = await applicationsService.apply(job.id, worker.id);
    await applicationsService.accept(appResult.application.id, employer.id);
    await jobsService.startJob(job.id, employer.id);
    await jobsService.completeJob(job.id, employer.id);

    // Rate the employer
    await ratingsService.submitRating(job.id, worker.id, { toUserId: employer.id, stars: 5 });

    const pending = await ratingsService.getPendingRatings(worker.id);
    const found = pending.find(p => p.jobId === job.id);
    assert.strictEqual(found, undefined);
  });

  it('P34-21: Employer with unrated completed job → pending has entry', async () => {
    const employer = await userService.create('01034921001', 'employer');
    const worker = await userService.create('01034921002', 'worker');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة تقييم employer', category: 'construction', governorate: 'giza',
      workersNeeded: 1, dailyWage: 250, startDate: '2026-06-01', durationDays: 1,
    });
    const appResult = await applicationsService.apply(job.id, worker.id);
    await applicationsService.accept(appResult.application.id, employer.id);
    await jobsService.startJob(job.id, employer.id);
    await jobsService.completeJob(job.id, employer.id);

    const pending = await ratingsService.getPendingRatings(employer.id);
    assert.ok(pending.length > 0);
    const found = pending.find(p => p.jobId === job.id);
    assert.ok(found);
    assert.strictEqual(found.targetUserId, worker.id);
    assert.strictEqual(found.targetRole, 'worker');
  });

  it('P34-22: No completed jobs → empty pending', async () => {
    const worker = await userService.create('01034922001', 'worker');
    const pending = await ratingsService.getPendingRatings(worker.id);
    assert.strictEqual(pending.length, 0);
  });

  it('P34-23: Max 3 pending returned', async () => {
    const employer = await userService.create('01034923001', 'employer');
    const worker = await userService.create('01034923002', 'worker');
    // Create 5 completed jobs
    for (let i = 0; i < 5; i++) {
      const job = await jobsService.create(employer.id, {
        title: 'فرصة ' + i, category: 'farming', governorate: 'cairo',
        workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
      });
      const appResult = await applicationsService.apply(job.id, worker.id);
      await applicationsService.accept(appResult.application.id, employer.id);
      await jobsService.startJob(job.id, employer.id);
      await jobsService.completeJob(job.id, employer.id);
    }
    const pending = await ratingsService.getPendingRatings(worker.id);
    assert.ok(pending.length <= 3, `expected max 3, got ${pending.length}`);
  });

  it('P34-24: Job not completed → not in pending', async () => {
    const employer = await userService.create('01034924001', 'employer');
    const worker = await userService.create('01034924002', 'worker');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة مش مكتملة', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    });
    const appResult = await applicationsService.apply(job.id, worker.id);
    await applicationsService.accept(appResult.application.id, employer.id);
    // NOT started or completed

    const pending = await ratingsService.getPendingRatings(worker.id);
    const found = pending.find(p => p.jobId === job.id);
    assert.strictEqual(found, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// Notification Dedup
// ═══════════════════════════════════════════════════════════════

describe('Phase 34 — Notification Dedup', () => {

  it('P34-25: Same type+userId within window → second returns null', async () => {
    const user = await userService.create('01034925001', 'worker');
    const first = await notificationsService.createNotification(user.id, 'test_dedup_type', 'رسالة 1');
    const second = await notificationsService.createNotification(user.id, 'test_dedup_type', 'رسالة 2');
    assert.ok(first !== null, 'first notification should be created');
    assert.strictEqual(second, null, 'second notification should be deduped');
  });

  it('P34-26: Different type, same userId → both created', async () => {
    const user = await userService.create('01034926001', 'worker');
    const first = await notificationsService.createNotification(user.id, 'type_a_unique', 'رسالة أ');
    const second = await notificationsService.createNotification(user.id, 'type_b_unique', 'رسالة ب');
    assert.ok(first !== null);
    assert.ok(second !== null);
  });

  it('P34-27: Same type, different userId → both created', async () => {
    const user1 = await userService.create('01034927001', 'worker');
    const user2 = await userService.create('01034927002', 'worker');
    const first = await notificationsService.createNotification(user1.id, 'same_type_diff_user', 'رسالة 1');
    const second = await notificationsService.createNotification(user2.id, 'same_type_diff_user', 'رسالة 2');
    assert.ok(first !== null);
    assert.ok(second !== null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Version & Config
// ═══════════════════════════════════════════════════════════════

describe('Phase 34 — Version & Config', () => {

  it('P34-28: package.json version is 0.30.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.30.0');
  });

  it('P34-29: FAVORITES section exists in config', () => {
    assert.ok(config.FAVORITES, 'FAVORITES section should exist');
    assert.strictEqual(config.FAVORITES.enabled, true);
    assert.strictEqual(config.FAVORITES.maxPerUser, 50);
  });

  it('P34-30: DATABASE.dirs includes favorites', () => {
    assert.strictEqual(config.DATABASE.dirs.favorites, 'favorites');
  });

  it('P34-31: DATABASE.indexFiles includes userFavoritesIndex', () => {
    assert.strictEqual(config.DATABASE.indexFiles.userFavoritesIndex, 'favorites/user-index.json');
  });

  it('P34-32: Config has 46 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 46, `expected 46 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });
});
