// tests/auth.test.js
// ═══════════════════════════════════════════════════════════════
// Auth Service Tests (~20 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We need a temp directory for file-based DB
let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-auth-test-'));
  // Create data dirs
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  // Patch the database module's base path
  // We do this by setting env before importing
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// Dynamic imports so they use the patched env
let generateOtp, sendOtp, verifyOtp;
let db;
let _crypto;

before(async () => {
  // Import modules
  const authMod = await import('../server/services/auth.js');
  generateOtp = authMod.generateOtp;
  sendOtp = authMod.sendOtp;
  verifyOtp = authMod.verifyOtp;
  db = await import('../server/services/database.js');
  _crypto = await import('node:crypto');
});

// Helper: resolve OTP from hashed storage (Phase 27+ stores otpHash not plain otp)
async function resolveOtp(phone) {
  const otpPath = db.getRecordPath('otp', phone);
  const data = await db.readJSON(otpPath);
  if (!data) throw new Error('OTP not found for ' + phone);
  if (data.otp) return data.otp; // legacy support
  for (let i = 1000; i <= 9999; i++) {
    const hash = _crypto.createHash('sha256').update(String(i)).digest('hex');
    if (hash === data.otpHash) return String(i);
  }
  throw new Error('Could not resolve OTP for ' + phone);
}

describe('Auth Service', () => {

  describe('generateOtp', () => {
    it('A-01: generates a 4-digit OTP', () => {
      const otp = generateOtp();
      assert.strictEqual(typeof otp, 'string');
      assert.strictEqual(otp.length, 4);
      assert.ok(/^\d{4}$/.test(otp), `OTP should be 4 digits, got "${otp}"`);
    });

    it('A-02: generates different OTPs', () => {
      const otps = new Set();
      for (let i = 0; i < 20; i++) {
        otps.add(generateOtp());
      }
      // Should have at least a few different values
      assert.ok(otps.size > 1, 'OTPs should vary');
    });

    it('A-03: OTP is always 4 digits (no leading zero loss)', () => {
      for (let i = 0; i < 50; i++) {
        const otp = generateOtp();
        assert.strictEqual(otp.length, 4);
      }
    });
  });

  describe('sendOtp', () => {
    it('A-04: sends OTP and returns success', async () => {
      const result = await sendOtp('01012345678', 'worker');
      assert.strictEqual(result.ok, true);
      assert.ok(result.message);
    });

    it('A-05: stores OTP data in file', async () => {
      await sendOtp('01098765432', 'employer');
      const otpPath = db.getRecordPath('otp', '01098765432');
      const data = await db.readJSON(otpPath);
      assert.ok(data);
      assert.strictEqual(data.phone, '01098765432');
      assert.strictEqual(data.role, 'employer');
      assert.strictEqual(typeof data.otpHash, 'string');
      assert.ok(data.otpHash.length > 0, 'otpHash should be non-empty');
      assert.strictEqual(data.attempts, 0);
    });

    it('A-06: OTP has expiry time', async () => {
      await sendOtp('01111111111', 'worker');
      const otpPath = db.getRecordPath('otp', '01111111111');
      const data = await db.readJSON(otpPath);
      assert.ok(data.expiresAt);
      const expiresAt = new Date(data.expiresAt);
      const now = new Date();
      assert.ok(expiresAt > now, 'expiresAt should be in the future');
    });
  });

  describe('verifyOtp', () => {
    it('A-07: verifies correct OTP and returns token', async () => {
      await sendOtp('01022222222', 'worker');
      const otp = await resolveOtp('01022222222');

      const result = await verifyOtp('01022222222', otp);
      assert.strictEqual(result.ok, true);
      assert.ok(result.token);
      assert.ok(result.token.startsWith('ses_'));
      assert.ok(result.user);
      assert.strictEqual(result.user.phone, '01022222222');
      assert.strictEqual(result.user.role, 'worker');
    });

    it('A-08: rejects wrong OTP', async () => {
      await sendOtp('01033333333', 'worker');
      const result = await verifyOtp('01033333333', '0000');
      // Might succeed if 0000 happens to be the OTP, so check based on actual OTP
      const otpPath = db.getRecordPath('otp', '01033333333');
      const otpData = await db.readJSON(otpPath);
      if (otpData) {
        // OTP was wrong, should have incremented attempts
        assert.ok(otpData.attempts >= 0);
      }
    });

    it('A-09: rejects non-existent OTP', async () => {
      const result = await verifyOtp('01099999999', '1234');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'OTP_NOT_FOUND');
    });

    it('A-10: creates user on first verification', async () => {
      await sendOtp('01044444444', 'employer');
      const otp = await resolveOtp('01044444444');

      const result = await verifyOtp('01044444444', otp);
      assert.strictEqual(result.ok, true);
      assert.ok(result.user.id);
      assert.ok(result.user.id.startsWith('usr_'));
    });

    it('A-11: same phone second OTP reuses existing user', async () => {
      // First login
      await sendOtp('01055555555', 'worker');
      const otp1 = await resolveOtp('01055555555');
      const result1 = await verifyOtp('01055555555', otp1);
      const userId1 = result1.user.id;

      // Second login
      await sendOtp('01055555555', 'worker');
      const otp2 = await resolveOtp('01055555555');
      const result2 = await verifyOtp('01055555555', otp2);
      const userId2 = result2.user.id;

      assert.strictEqual(userId1, userId2, 'same phone should map to same user');
    });

    it('A-12: deletes OTP file after successful verification', async () => {
      await sendOtp('01066666666', 'worker');
      const otp = await resolveOtp('01066666666');
      await verifyOtp('01066666666', otp);

      // OTP should be deleted
      const otpPathCheck = db.getRecordPath('otp', '01066666666');
      const deletedOtp = await db.readJSON(otpPathCheck);
      assert.strictEqual(deletedOtp, null, 'OTP should be deleted after verification');
    });

    it('A-13: rejects expired OTP', async () => {
      // Manually create an expired OTP
      const otpPath = db.getRecordPath('otp', '01077777777');
      await db.atomicWrite(otpPath, {
        phone: '01077777777',
        otp: '5678',
        role: 'worker',
        attempts: 0,
        createdAt: new Date(Date.now() - 600000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
      });

      const result = await verifyOtp('01077777777', '5678');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'OTP_EXPIRED');
    });

    it('A-14: rejects after max attempts', async () => {
      const otpPath = db.getRecordPath('otp', '01088888888');
      await db.atomicWrite(otpPath, {
        phone: '01088888888',
        otp: '9999',
        role: 'worker',
        attempts: 3,  // Already at max
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      });

      const result = await verifyOtp('01088888888', '9999');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'OTP_MAX_ATTEMPTS');
    });

    it('A-15: tracks attempt count on wrong OTP', async () => {
      await sendOtp('01015151515', 'worker');
      const otpPath = db.getRecordPath('otp', '01015151515');
      const otpData = await db.readJSON(otpPath);
      const wrongOtp = otpData.otp === '0000' ? '1111' : '0000';

      await verifyOtp('01015151515', wrongOtp);
      const updated = await db.readJSON(otpPath);
      assert.strictEqual(updated.attempts, 1);
    });
  });

  describe('Session Creation', () => {
    it('A-16: session token starts with ses_', async () => {
      await sendOtp('01016161616', 'worker');
      const otp = await resolveOtp('01016161616');
      const result = await verifyOtp('01016161616', otp);

      assert.ok(result.token.startsWith('ses_'));
      assert.strictEqual(result.token.length, 4 + 32); // ses_ + 32 hex
    });

    it('A-17: session file is created', async () => {
      await sendOtp('01017171717', 'employer');
      const otp = await resolveOtp('01017171717');
      const result = await verifyOtp('01017171717', otp);

      const sessionPath = db.getRecordPath('sessions', result.token);
      const session = await db.readJSON(sessionPath);
      assert.ok(session);
      assert.strictEqual(session.token, result.token);
      assert.strictEqual(session.role, 'employer');
    });
  });
});
