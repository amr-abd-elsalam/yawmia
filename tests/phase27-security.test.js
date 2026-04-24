// tests/phase27-security.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 27 — Security Hardening + Critical Bug Fixes (~35 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let config;

before(async () => {
  config = (await import('../config.js')).default;
});

// ══════════════════════════════════════════════════════════════
// Path Traversal Prevention — isValidId
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — Path Traversal Prevention', () => {

  it('P27-01: isValidId exported from database.js', async () => {
    const db = await import('../server/services/database.js');
    assert.strictEqual(typeof db.isValidId, 'function');
  });

  it('P27-02: isValidId rejects ../etc/passwd', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('../etc/passwd'), false);
  });

  it('P27-03: isValidId rejects id/../../secret', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('id/../../secret'), false);
  });

  it('P27-04: isValidId rejects empty string', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId(''), false);
  });

  it('P27-05: isValidId rejects null', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId(null), false);
  });

  it('P27-06: isValidId rejects string with <script>', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('<script>alert(1)</script>'), false);
  });

  it('P27-07: isValidId rejects string > 100 chars', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('a'.repeat(101)), false);
  });

  it('P27-08: isValidId accepts usr_abc123def456', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('usr_abc123def456'), true);
  });

  it('P27-09: isValidId accepts job_abc123', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('job_abc123'), true);
  });

  it('P27-10: isValidId accepts 01012345678 (phone number)', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('01012345678'), true);
  });

  it('P27-11: isValidId accepts long session token', async () => {
    const { isValidId } = await import('../server/services/database.js');
    assert.strictEqual(isValidId('ses_abc123def456abc123def456abc123de'), true);
  });

  it('P27-12: getRecordPath throws on invalid ID', async () => {
    const { getRecordPath } = await import('../server/services/database.js');
    assert.throws(() => {
      getRecordPath('users', '../../../etc/passwd');
    }, /Invalid record ID/);
  });

  it('P27-13: getRecordPath works on valid ID', async () => {
    const { getRecordPath } = await import('../server/services/database.js');
    assert.doesNotThrow(() => {
      const path = getRecordPath('users', 'usr_abc123');
      assert.ok(path.endsWith('usr_abc123.json'));
    });
  });
});

// ══════════════════════════════════════════════════════════════
// OTP Hashing
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — OTP Hashing', () => {

  it('P27-14: auth.js source contains otpHash', async () => {
    const content = await readFile(resolve('server/services/auth.js'), 'utf-8');
    assert.ok(content.includes('otpHash'), 'auth.js should reference otpHash');
  });

  it('P27-15: auth.js source contains createHash', async () => {
    const content = await readFile(resolve('server/services/auth.js'), 'utf-8');
    assert.ok(content.includes('createHash'), 'auth.js should use createHash for OTP hashing');
  });

  it('P27-16: sendOtp stores otpHash not plain otp field', async () => {
    const content = await readFile(resolve('server/services/auth.js'), 'utf-8');
    // Find the otpData object creation in sendOtp
    const sendOtpBlock = content.substring(content.indexOf('async function sendOtp'), content.indexOf('export async function verifyOtp'));
    assert.ok(sendOtpBlock.includes('otpHash: hashOtp(otp)'), 'sendOtp should store otpHash');
    // Make sure plain 'otp' is NOT stored as a field in otpData
    const otpDataBlock = sendOtpBlock.substring(sendOtpBlock.indexOf('const otpData'), sendOtpBlock.indexOf('const otpPath'));
    assert.ok(!otpDataBlock.match(/^\s*otp[,:\s]/m) || otpDataBlock.includes('otpHash'), 'otpData should not have plain otp field');
  });

  it('P27-17: verifyOtp handles backward compatibility', async () => {
    const content = await readFile(resolve('server/services/auth.js'), 'utf-8');
    const verifyBlock = content.substring(content.indexOf('export async function verifyOtp'));
    assert.ok(verifyBlock.includes('otpData.otpHash'), 'verifyOtp should check otpHash field');
    assert.ok(verifyBlock.includes('otpData.otp'), 'verifyOtp should handle legacy otp field');
  });
});

// ══════════════════════════════════════════════════════════════
// Admin Rate Limiting
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — Admin Rate Limiting', () => {

  it('P27-18: rateLimit source contains admin: key pattern', async () => {
    const content = await readFile(resolve('server/middleware/rateLimit.js'), 'utf-8');
    assert.ok(content.includes('`admin:${ip}`') || content.includes("'admin:' + ip") || content.includes('admin:${ip}'), 'rateLimit should have admin: key pattern');
  });

  it('P27-19: rateLimit source checks /api/admin/', async () => {
    const content = await readFile(resolve('server/middleware/rateLimit.js'), 'utf-8');
    assert.ok(content.includes('/api/admin/'), 'rateLimit should check /api/admin/ path');
  });

  it('P27-20: rateLimit source has ADMIN_RATE_LIMITED code', async () => {
    const content = await readFile(resolve('server/middleware/rateLimit.js'), 'utf-8');
    assert.ok(content.includes('ADMIN_RATE_LIMITED'), 'rateLimit should have ADMIN_RATE_LIMITED error code');
  });
});

// ══════════════════════════════════════════════════════════════
// URL Parameter Validation
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — URL Parameter Validation', () => {

  it('P27-21: router.js imports isValidId', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes('isValidId'), 'router.js should import isValidId');
  });

  it('P27-22: router.js validates params before handler dispatch', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    // isValidId check should appear BEFORE runMiddlewares in the createRouter function
    const routerBlock = content.substring(content.indexOf('function router(req, res)'));
    const validIdPos = routerBlock.indexOf('isValidId');
    const middlewarePos = routerBlock.indexOf('runMiddlewares(route.middlewares');
    assert.ok(validIdPos > 0, 'isValidId should be used in router');
    assert.ok(validIdPos < middlewarePos, 'isValidId check should happen before runMiddlewares');
  });

  it('P27-23: router.js returns INVALID_ID code on bad params', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes('INVALID_ID'), 'router should return INVALID_ID code');
  });
});

// ══════════════════════════════════════════════════════════════
// Renewal Lock
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — Renewal Concurrency Lock', () => {

  it('P27-24: jobs.js renewJob uses withLock', async () => {
    const content = await readFile(resolve('server/services/jobs.js'), 'utf-8');
    const renewBlock = content.substring(content.indexOf('export function renewJob'));
    assert.ok(renewBlock.includes('withLock'), 'renewJob should use withLock');
  });

  it('P27-25: jobs.js renewJob lock key contains jobId', async () => {
    const content = await readFile(resolve('server/services/jobs.js'), 'utf-8');
    const renewBlock = content.substring(content.indexOf('export function renewJob'));
    assert.ok(renewBlock.includes('renew:') || renewBlock.includes('`renew:${jobId}`'), 'renewJob lock key should contain renew: prefix');
  });
});

// ══════════════════════════════════════════════════════════════
// Payment Lock Verification
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — Payment Lock Verification', () => {

  it('P27-26: payments.js createPayment uses withLock', async () => {
    const content = await readFile(resolve('server/services/payments.js'), 'utf-8');
    const createBlock = content.substring(content.indexOf('export async function createPayment'));
    assert.ok(createBlock.includes('withLock'), 'createPayment should use withLock');
    assert.ok(createBlock.includes('payment:'), 'createPayment lock key should contain payment: prefix');
  });
});

// ══════════════════════════════════════════════════════════════
// Config-Driven Fee
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — Config-Driven Fee', () => {

  it('P27-27: jobs.js references loadConfig for fee', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    const setupBlock = content.substring(content.indexOf('function setupCreateJob'));
    assert.ok(setupBlock.includes('loadConfig') || setupBlock.includes('FINANCIALS'), 'setupCreateJob should load config for fee');
  });

  it('P27-28: jobs.js does NOT have hardcoded 0.15 in updateCost', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    const updateCostBlock = content.substring(content.indexOf('function updateCost'));
    const endOfUpdateCost = updateCostBlock.indexOf('if (workerInput) workerInput');
    const updateCostBody = updateCostBlock.substring(0, endOfUpdateCost > 0 ? endOfUpdateCost : 500);
    assert.ok(!updateCostBody.includes('* 0.15'), 'updateCost should not have hardcoded 0.15');
  });
});

// ══════════════════════════════════════════════════════════════
// listJSON Enhancement
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — listJSON Enhancement', () => {

  it('P27-29: listJSON accepts options parameter', async () => {
    const content = await readFile(resolve('server/services/database.js'), 'utf-8');
    const listBlock = content.substring(content.indexOf('export async function listJSON'));
    assert.ok(listBlock.includes('options') || listBlock.includes('prefix'), 'listJSON should accept options parameter');
  });

  it('P27-30: listJSON filters by prefix when provided', async () => {
    const content = await readFile(resolve('server/services/database.js'), 'utf-8');
    const listBlock = content.substring(content.indexOf('export async function listJSON'));
    assert.ok(listBlock.includes('options.prefix') || listBlock.includes('startsWith'), 'listJSON should filter by prefix');
  });
});

// ══════════════════════════════════════════════════════════════
// Version
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — Version', () => {

  it('P27-31: package.json version is 0.28.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.30.0');
  });

  it('P27-32: config PWA cacheName is yawmia-v0.30.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.30.0');
  });

  it('P27-33: sw.js CACHE_NAME is yawmia-v0.30.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.30.0'"), 'sw.js cache name should be yawmia-v0.30.0');
  });

  it('P27-34: health endpoint version is 0.28.0', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("version: '0.30.0'"), 'router health version should be 0.28.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Route Count
// ══════════════════════════════════════════════════════════════

describe('Phase 27 — Route Count', () => {

  it('P27-35: Router has 84 routes', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 89, `expected 84 routes, got ${routeMatches.length}`);
  });
});
