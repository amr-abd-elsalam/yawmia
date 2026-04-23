// tests/validators.test.js
// ═══════════════════════════════════════════════════════════════
// Validators Tests (~15 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePhone,
  validateOtp,
  validateRole,
  validateGovernorate,
  validateCategory,
  validateDailyWage,
  validateProfileFields,
  validateJobFields,
} from '../server/services/validators.js';

describe('Validators', () => {

  // ── Phone Validation ────────────────────────────────────────
  describe('validatePhone', () => {
    it('V-01: accepts valid Egyptian phone numbers', () => {
      assert.deepStrictEqual(validatePhone('01012345678'), { valid: true });
      assert.deepStrictEqual(validatePhone('01112345678'), { valid: true });
      assert.deepStrictEqual(validatePhone('01212345678'), { valid: true });
      assert.deepStrictEqual(validatePhone('01512345678'), { valid: true });
    });

    it('V-02: rejects invalid phone formats', () => {
      assert.strictEqual(validatePhone('0201234567').valid, false);
      assert.strictEqual(validatePhone('0101234567').valid, false);   // 10 digits
      assert.strictEqual(validatePhone('011123456789').valid, false); // 12 digits
      assert.strictEqual(validatePhone('01312345678').valid, false);  // invalid prefix
      assert.strictEqual(validatePhone('').valid, false);
      assert.strictEqual(validatePhone(null).valid, false);
      assert.strictEqual(validatePhone(undefined).valid, false);
    });
  });

  // ── OTP Validation ──────────────────────────────────────────
  describe('validateOtp', () => {
    it('V-03: accepts valid 4-digit OTP', () => {
      assert.deepStrictEqual(validateOtp('1234'), { valid: true });
      assert.deepStrictEqual(validateOtp('0000'), { valid: true });
      assert.deepStrictEqual(validateOtp('9999'), { valid: true });
    });

    it('V-04: rejects invalid OTP', () => {
      assert.strictEqual(validateOtp('123').valid, false);
      assert.strictEqual(validateOtp('12345').valid, false);
      assert.strictEqual(validateOtp('abcd').valid, false);
      assert.strictEqual(validateOtp('').valid, false);
      assert.strictEqual(validateOtp(null).valid, false);
    });
  });

  // ── Role Validation ─────────────────────────────────────────
  describe('validateRole', () => {
    it('V-05: accepts valid roles', () => {
      assert.deepStrictEqual(validateRole('worker'), { valid: true });
      assert.deepStrictEqual(validateRole('employer'), { valid: true });
      assert.deepStrictEqual(validateRole('admin'), { valid: true });
    });

    it('V-06: rejects invalid roles', () => {
      assert.strictEqual(validateRole('manager').valid, false);
      assert.strictEqual(validateRole('').valid, false);
      assert.strictEqual(validateRole(null).valid, false);
    });
  });

  // ── Governorate Validation ──────────────────────────────────
  describe('validateGovernorate', () => {
    it('V-07: accepts valid governorates', () => {
      assert.deepStrictEqual(validateGovernorate('cairo'), { valid: true });
      assert.deepStrictEqual(validateGovernorate('fayoum'), { valid: true });
      assert.deepStrictEqual(validateGovernorate('alex'), { valid: true });
    });

    it('V-08: rejects invalid governorates', () => {
      assert.strictEqual(validateGovernorate('mars').valid, false);
      assert.strictEqual(validateGovernorate('').valid, false);
    });
  });

  // ── Category Validation ─────────────────────────────────────
  describe('validateCategory', () => {
    it('V-09: accepts valid categories', () => {
      assert.deepStrictEqual(validateCategory('farming'), { valid: true });
      assert.deepStrictEqual(validateCategory('construction'), { valid: true });
    });

    it('V-10: rejects invalid categories', () => {
      assert.strictEqual(validateCategory('astronaut').valid, false);
      assert.strictEqual(validateCategory('').valid, false);
    });
  });

  // ── Daily Wage Validation ───────────────────────────────────
  describe('validateDailyWage', () => {
    it('V-11: accepts valid wages', () => {
      assert.deepStrictEqual(validateDailyWage(150), { valid: true });
      assert.deepStrictEqual(validateDailyWage(250), { valid: true });
      assert.deepStrictEqual(validateDailyWage(1000), { valid: true });
    });

    it('V-12: rejects invalid wages', () => {
      assert.strictEqual(validateDailyWage(50).valid, false);
      assert.strictEqual(validateDailyWage(1500).valid, false);
      assert.strictEqual(validateDailyWage(null).valid, false);
      assert.strictEqual(validateDailyWage('250').valid, false);
    });
  });

  // ── Job Fields Validation ───────────────────────────────────
  describe('validateJobFields', () => {
    it('V-13: accepts valid job fields', () => {
      const result = validateJobFields({
        title: 'جمع محصول قمح',
        category: 'farming',
        governorate: 'fayoum',
        workersNeeded: 20,
        dailyWage: 250,
        startDate: '2027-01-15',
        durationDays: 3,
      });
      assert.deepStrictEqual(result, { valid: true });
    });

    it('V-14: rejects job with missing fields', () => {
      const result = validateJobFields({});
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('V-15: rejects job with invalid values', () => {
      const result = validateJobFields({
        title: 'ab',   // too short
        category: 'invalid',
        governorate: 'mars',
        workersNeeded: 200,
        dailyWage: 50,
        startDate: '',
        durationDays: 100,
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length >= 3);
    });
  });

  // ── Profile Fields Validation ───────────────────────────────
  describe('validateProfileFields', () => {
    it('V-16: accepts valid profile fields', () => {
      const result = validateProfileFields({
        name: 'أحمد محمد',
        governorate: 'cairo',
        categories: ['farming', 'loading'],
      }, 'worker');
      assert.deepStrictEqual(result, { valid: true });
    });

    it('V-17: rejects invalid profile fields', () => {
      const result = validateProfileFields({
        name: 'ا',   // too short
        governorate: 'mars',
        categories: 'not-array',
      }, 'worker');
      assert.strictEqual(result.valid, false);
    });
  });
});
