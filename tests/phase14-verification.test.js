// tests/phase14-verification.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 14 — Worker Verification + Public Profiles + Application Enrichment
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-phase14-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let config, db, userService, verificationService, eventBus;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  verificationService = await import('../server/services/verification.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
});

after(() => {
  if (eventBus) eventBus.clear();
});

// ── Helper ──────────────────────────────────────────────────
let counter = 0;
async function createTestUser(role) {
  counter++;
  const phone = '0101400' + String(counter).padStart(4, '0');
  return await userService.create(phone, role);
}

// Small base64 test image (tiny valid string)
const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ══════════════════════════════════════════════════════════════
// Config Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 14 — Config', () => {

  it('P14-01: Config has 38 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 48, `expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P14-02: VERIFICATION section has correct fields', () => {
    const v = config.VERIFICATION;
    assert.ok(v, 'VERIFICATION section should exist');
    assert.strictEqual(typeof v.enabled, 'boolean');
    assert.strictEqual(typeof v.maxImageSizeBytes, 'number');
    assert.ok(Array.isArray(v.allowedStatuses));
    assert.strictEqual(typeof v.rejectionCooldownHours, 'number');
    assert.strictEqual(typeof v.maxSubmissionsPerDay, 'number');
    assert.strictEqual(v.requiredForApplication, false);
    assert.strictEqual(v.requiredForJobCreation, false);
    assert.strictEqual(v.adminAutoApproveThreshold, null);
  });

  it('P14-03: VERIFICATION is frozen (immutable)', () => {
    assert.throws(() => {
      config.VERIFICATION.enabled = false;
    }, TypeError, 'config should be frozen');
  });

  it('P14-04: VERIFICATION.allowedStatuses has 4 statuses', () => {
    assert.strictEqual(config.VERIFICATION.allowedStatuses.length, 4);
    assert.deepStrictEqual(
      [...config.VERIFICATION.allowedStatuses].sort(),
      ['pending', 'rejected', 'unverified', 'verified']
    );
  });

  it('P14-05: DATABASE.dirs includes verifications', () => {
    assert.strictEqual(config.DATABASE.dirs.verifications, 'verifications');
    assert.strictEqual(Object.keys(config.DATABASE.dirs).length, 17);
  });

  it('P14-06: DATABASE.indexFiles includes userVerificationIndex', () => {
    assert.ok(config.DATABASE.indexFiles.userVerificationIndex);
    assert.strictEqual(config.DATABASE.indexFiles.userVerificationIndex, 'verifications/user-index.json');
    assert.strictEqual(Object.keys(config.DATABASE.indexFiles).length, 17);
  });

  it('P14-07: PWA cacheName updated to v0.25.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.31.0');
  });
});

// ══════════════════════════════════════════════════════════════
// User Model Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 14 — User Model', () => {

  it('P14-08: create() includes verificationStatus: unverified', async () => {
    const user = await createTestUser('worker');
    assert.strictEqual(user.verificationStatus, 'unverified');
  });

  it('P14-09: create() includes verificationSubmittedAt: null', async () => {
    const user = await createTestUser('worker');
    assert.strictEqual(user.verificationSubmittedAt, null);
  });
});

// ══════════════════════════════════════════════════════════════
// Verification Service Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 14 — Verification Service', () => {

  it('P14-10: submitVerification creates verification record', async () => {
    const user = await createTestUser('worker');
    const result = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    assert.strictEqual(result.ok, true);
    assert.ok(result.verification.id.startsWith('vrf_'));
    assert.strictEqual(result.verification.status, 'pending');
    assert.strictEqual(result.verification.userId, user.id);
  });

  it('P14-12: submitVerification returns error without image', async () => {
    const user = await createTestUser('worker');
    const result = await verificationService.submitVerification(user.id, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'IMAGE_REQUIRED');
  });

  it('P14-13: submitVerification returns error for oversized image', async () => {
    const user = await createTestUser('worker');
    // Create string larger than 2MB
    const bigImage = 'x'.repeat(3 * 1024 * 1024);
    const result = await verificationService.submitVerification(user.id, { nationalIdImage: bigImage });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'IMAGE_TOO_LARGE');
  });

  it('P14-14: submitVerification updates user.verificationStatus to pending', async () => {
    const user = await createTestUser('worker');
    await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    const updated = await userService.findById(user.id);
    assert.strictEqual(updated.verificationStatus, 'pending');
  });

  it('P14-15: submitVerification updates user.verificationSubmittedAt', async () => {
    const user = await createTestUser('worker');
    await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    const updated = await userService.findById(user.id);
    assert.ok(updated.verificationSubmittedAt, 'verificationSubmittedAt should be set');
  });

  it('P14-16: submitVerification returns error when already verified', async () => {
    const user = await createTestUser('worker');
    // Manually set to verified
    await userService.update(user.id, { verificationStatus: 'verified' });
    const result = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_VERIFIED');
  });

  it('P14-17: submitVerification returns error when already pending', async () => {
    const user = await createTestUser('worker');
    await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    // Try again
    const result = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_PENDING');
  });

  it('P14-18: submitVerification respects rejection cooldown', async () => {
    const user = await createTestUser('worker');
    // Manually set to rejected with recent timestamp
    await userService.update(user.id, {
      verificationStatus: 'rejected',
      verificationSubmittedAt: new Date().toISOString(),
    });
    const result = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'COOLDOWN_ACTIVE');
  });

  it('P14-19: submitVerification does not include image data in response', async () => {
    const user = await createTestUser('worker');
    const result = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.verification.nationalIdImage, undefined);
    assert.strictEqual(result.verification.selfieImage, undefined);
  });

  it('P14-20: reviewVerification changes status to verified', async () => {
    const user = await createTestUser('worker');
    const sub = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    const result = await verificationService.reviewVerification(sub.verification.id, {
      status: 'verified',
      adminNotes: 'تم التحقق',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.verification.status, 'verified');

    const updated = await userService.findById(user.id);
    assert.strictEqual(updated.verificationStatus, 'verified');
  });

  it('P14-21: reviewVerification changes status to rejected', async () => {
    const user = await createTestUser('worker');
    const sub = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    const result = await verificationService.reviewVerification(sub.verification.id, {
      status: 'rejected',
      adminNotes: 'صورة غير واضحة',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.verification.status, 'rejected');

    const updated = await userService.findById(user.id);
    assert.strictEqual(updated.verificationStatus, 'rejected');
  });

  it('P14-22: reviewVerification returns error for non-existent', async () => {
    const result = await verificationService.reviewVerification('vrf_nonexistent', { status: 'verified' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'VERIFICATION_NOT_FOUND');
  });

  it('P14-23: reviewVerification returns error for already reviewed', async () => {
    const user = await createTestUser('worker');
    const sub = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    await verificationService.reviewVerification(sub.verification.id, { status: 'verified' });
    const result = await verificationService.reviewVerification(sub.verification.id, { status: 'rejected' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_REVIEWED');
  });

  it('P14-24: reviewVerification returns error for invalid status', async () => {
    const user = await createTestUser('worker');
    const sub = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    const result = await verificationService.reviewVerification(sub.verification.id, { status: 'invalid' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_VERIFICATION_STATUS');
  });

  it('P14-25: listByUser returns user verifications newest first', async () => {
    const user = await createTestUser('worker');
    await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    // Reset status so we can submit again
    await userService.update(user.id, {
      verificationStatus: 'rejected',
      verificationSubmittedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });

    const list = await verificationService.listByUser(user.id);
    assert.ok(list.length >= 2);
    // Newest first
    assert.ok(new Date(list[0].createdAt) >= new Date(list[1].createdAt));
    // Should not contain image data
    assert.strictEqual(list[0].nationalIdImage, undefined);
  });

  it('P14-26: listPending returns pending verifications only', async () => {
    const pending = await verificationService.listPending();
    for (const v of pending) {
      assert.strictEqual(v.status, 'pending');
    }
  });

  it('P14-27: listAll paginates correctly', async () => {
    const result = await verificationService.listAll({ page: 1, limit: 5 });
    assert.ok(typeof result.total === 'number');
    assert.ok(typeof result.totalPages === 'number');
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 5);
    assert.ok(Array.isArray(result.verifications));
  });
});

// ══════════════════════════════════════════════════════════════
// Public Profile Tests (Service Level)
// ══════════════════════════════════════════════════════════════

describe('Phase 14 — Public Profile', () => {

  it('P14-28: Public profile data excludes phone', async () => {
    const user = await createTestUser('worker');
    await userService.update(user.id, { name: 'عامل تجريبي', governorate: 'cairo' });
    const fresh = await userService.findById(user.id);
    // Simulate public profile building (same logic as handler)
    const profile = {
      id: fresh.id,
      name: fresh.name,
      role: fresh.role,
      governorate: fresh.governorate,
      categories: fresh.categories,
      rating: fresh.rating,
      verificationStatus: fresh.verificationStatus || 'unverified',
      memberSince: fresh.createdAt,
    };
    assert.ok(profile.id);
    assert.ok(profile.name);
    assert.ok(profile.role);
    assert.strictEqual(profile.phone, undefined, 'phone should not be in public profile');
  });

  it('P14-29: Public profile includes verificationStatus', async () => {
    const user = await createTestUser('worker');
    const fresh = await userService.findById(user.id);
    assert.strictEqual(fresh.verificationStatus, 'unverified');
  });

  it('P14-30: Public profile includes rating', async () => {
    const user = await createTestUser('worker');
    assert.ok(user.rating);
    assert.strictEqual(typeof user.rating.avg, 'number');
    assert.strictEqual(typeof user.rating.count, 'number');
  });

  it('P14-31: Deleted user cannot be found for public profile', async () => {
    const user = await createTestUser('worker');
    await userService.softDelete(user.id);
    const deleted = await userService.findById(user.id);
    assert.strictEqual(deleted.status, 'deleted');
  });

  it('P14-32: Non-existent user returns null', async () => {
    const result = await userService.findById('usr_nonexistent_pub');
    assert.strictEqual(result, null);
  });
});

// ══════════════════════════════════════════════════════════════
// Integration Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 14 — Integration', () => {

  it('P14-33: verification:submitted event emitted', async () => {
    const user = await createTestUser('worker');
    let eventData = null;
    const unsub = eventBus.on('verification:submitted', (data) => { eventData = data; });
    await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    unsub();
    assert.ok(eventData, 'verification:submitted should fire');
    assert.ok(eventData.verificationId);
    assert.strictEqual(eventData.userId, user.id);
  });

  it('P14-34: verification:reviewed event emitted', async () => {
    const user = await createTestUser('worker');
    const sub = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    let eventData = null;
    const unsub = eventBus.on('verification:reviewed', (data) => { eventData = data; });
    await verificationService.reviewVerification(sub.verification.id, { status: 'verified' });
    unsub();
    assert.ok(eventData, 'verification:reviewed should fire');
    assert.strictEqual(eventData.status, 'verified');
    assert.strictEqual(eventData.userId, user.id);
  });

  it('P14-35: User-verification index updated on submission', async () => {
    const user = await createTestUser('worker');
    const sub = await verificationService.submitVerification(user.id, { nationalIdImage: TEST_IMAGE });
    const indexIds = await db.getFromSetIndex(config.DATABASE.indexFiles.userVerificationIndex, user.id);
    assert.ok(indexIds.includes(sub.verification.id));
  });

  it('P14-36: Version is 0.25.0', async () => {
    const pkgPath = resolve('package.json');
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.31.0');
  });
});
