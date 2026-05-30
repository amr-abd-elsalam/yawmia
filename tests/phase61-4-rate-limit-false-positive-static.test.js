// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-rate-limit-false-positive-static.test.js
// Phase 61.4 — Rate Limit False Positive Guardrails
// ═══════════════════════════════════════════════════════════════
// Static guardrails only.
// No server startup.
// No network.
// No queue mutation.
// No data mutation.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const RATE_LIMIT_PATH = 'server/middleware/rateLimit.js';
const CONFIG_PATH = 'config.js';
const PACKAGE_PATH = 'package.json';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('RATE_LIMIT remains enabled in config', async () => {
  const source = await read(CONFIG_PATH);

  const marker = 'RATE_LIMIT: {';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'RATE_LIMIT block must exist');

  const nextSection = source.indexOf('// ═══════════════════════════════════════════════════════════\n  // 18. الملفات الثابتة', start);
  assert.ok(nextSection > start, 'RATE_LIMIT block must be bounded before STATIC section');

  const rateLimitBlock = source.slice(start, nextSection);

  assert.match(rateLimitBlock, /RATE_LIMIT:\s*\{/);
  assert.match(rateLimitBlock, /enabled:\s*true/);
  assert.doesNotMatch(rateLimitBlock, /enabled:\s*false/);
});

test('rateLimit middleware has endpoint classification helpers', async () => {
  const source = await read(RATE_LIMIT_PATH);

  const requiredHelpers = [
    'isAlwaysAllowedRequest',
    'isSseEndpoint',
    'isPresenceHeartbeat',
    'isOtpSendEndpoint',
    'isOtpVerifyEndpoint',
    'isAdminWriteRequest',
    'isAdminReadRequest',
    'isBackgroundReadRequest',
    'isLowRiskWriteRequest',
    'isHighRiskWriteRequest',
    'isPenaltyEligibleRequest',
  ];

  for (const helper of requiredHelpers) {
    assert.match(source, new RegExp(`function\\s+${helper}\\s*\\(`), `${helper} must exist`);
  }
});

test('SSE endpoints are explicitly classified away from normal API buckets', async () => {
  const source = await read(RATE_LIMIT_PATH);

  assert.match(source, /\/api\/notifications\/stream/);
  assert.match(source, /\/api\/jobs\/live-feed/);
  assert.match(source, /\/api\/admin\/events/);
  assert.match(source, /isSseEndpoint\(req\)/);
  assert.match(source, /sse:\$\{ip\}/);
  assert.match(source, /SSE_RATE_LIMITED/);
});

test('presence heartbeat is explicitly classified and does not use penalty violation path', async () => {
  const source = await read(RATE_LIMIT_PATH);

  assert.match(source, /\/api\/presence\/heartbeat/);
  assert.match(source, /isPresenceHeartbeat\(req\)/);
  assert.match(source, /presence:\$\{ip\}/);
  assert.match(source, /PRESENCE_RATE_LIMITED/);

  const presenceBlockStart = source.indexOf('if (isPresenceHeartbeat(req))');
  assert.ok(presenceBlockStart >= 0, 'presence heartbeat block must exist');

  const presenceBlockEnd = source.indexOf('// OTP-specific rate limiting remains strict', presenceBlockStart);
  assert.ok(presenceBlockEnd > presenceBlockStart, 'presence block should appear before OTP block');

  const presenceBlock = source.slice(presenceBlockStart, presenceBlockEnd);
  assert.doesNotMatch(presenceBlock, /recordViolation\s*\(/, 'presence heartbeat must not record penalty violations');
});

test('OTP send and verify remain explicitly strict and penalty eligible', async () => {
  const source = await read(RATE_LIMIT_PATH);

  assert.match(source, /\/api\/auth\/send-otp/);
  assert.match(source, /\/api\/auth\/verify-otp/);
  assert.match(source, /OTP_RATE_LIMITED/);
  assert.match(source, /OTP_VERIFY_RATE_LIMITED/);

  const penaltyHelperStart = source.indexOf('function isPenaltyEligibleRequest');
  assert.ok(penaltyHelperStart >= 0, 'penalty eligibility helper must exist');

  const penaltyHelperEnd = source.indexOf('function softThrottleMessage', penaltyHelperStart);
  assert.ok(penaltyHelperEnd > penaltyHelperStart, 'penalty helper should be bounded');

  const penaltyHelper = source.slice(penaltyHelperStart, penaltyHelperEnd);
  assert.match(penaltyHelper, /isOtpSendEndpoint\(req\)/);
  assert.match(penaltyHelper, /isOtpVerifyEndpoint\(req\)/);
});

test('admin write limiter remains strict and penalty eligible', async () => {
  const source = await read(RATE_LIMIT_PATH);

  assert.match(source, /isAdminWriteRequest/);
  assert.match(source, /admin:\$\{ip\}/);
  assert.match(source, /ADMIN_RATE_LIMITED/);

  const penaltyHelperStart = source.indexOf('function isPenaltyEligibleRequest');
  const penaltyHelperEnd = source.indexOf('function softThrottleMessage', penaltyHelperStart);
  const penaltyHelper = source.slice(penaltyHelperStart, penaltyHelperEnd);

  assert.match(penaltyHelper, /isAdminWriteRequest\(req\)/);
});

test('background reads are relaxed and do not record penalty violations', async () => {
  const source = await read(RATE_LIMIT_PATH);

  const expectedBackgroundPaths = [
    '/api/auth/me',
    '/api/notifications',
    '/api/messages/unread-count',
    '/api/profile/tasks',
    '/api/workrooms',
    '/api/jobs/mine',
    '/api/applications/mine',
    '/api/direct-offers/mine',
    '/api/workers/online-count',
    '/api/workers/discover',
  ];

  for (const path of expectedBackgroundPaths) {
    assert.match(source, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${path} should be classified`);
  }

  assert.match(source, /background:\$\{ip\}/);
  assert.match(source, /BACKGROUND_RATE_LIMITED/);

  const bgBlockStart = source.indexOf('if (isBackgroundReadRequest(req))');
  assert.ok(bgBlockStart >= 0, 'background block must exist');

  const bgBlockEnd = source.indexOf('// Low-risk writes', bgBlockStart);
  assert.ok(bgBlockEnd > bgBlockStart, 'background block should be bounded');

  const bgBlock = source.slice(bgBlockStart, bgBlockEnd);
  assert.doesNotMatch(bgBlock, /recordViolation\s*\(/, 'background reads must not record penalty violations');
});

test('low-risk writes are relaxed and do not record penalty violations', async () => {
  const source = await read(RATE_LIMIT_PATH);

  assert.match(source, /\/api\/notifications\/read-all/);
  assert.match(source, /\/api\/push\/subscribe/);
  assert.match(source, /\/action-click/);
  assert.match(source, /\/messages\/read-all/);
  assert.match(source, /low_risk_write:\$\{ip\}/);
  assert.match(source, /LOW_RISK_WRITE_RATE_LIMITED/);

  const blockStart = source.indexOf('if (isLowRiskWriteRequest(req))');
  assert.ok(blockStart >= 0, 'low-risk write block must exist');

  const blockEnd = source.indexOf('// Fallback global limiter', blockStart);
  assert.ok(blockEnd > blockStart, 'low-risk write block should be bounded');

  const block = source.slice(blockStart, blockEnd);
  assert.doesNotMatch(block, /recordViolation\s*\(/, 'low-risk writes must not record penalty violations');
});

test('penalty check happens before normal fallback global counter', async () => {
  const source = await read(RATE_LIMIT_PATH);

  const penaltyIndex = source.indexOf('Penalty check must run BEFORE incrementing normal counters');
  const fallbackIndex = source.indexOf('// Fallback global limiter for unclassified routes.');

  assert.ok(penaltyIndex >= 0, 'early penalty check must exist');
  assert.ok(fallbackIndex >= 0, 'fallback global limiter must exist');
  assert.ok(penaltyIndex < fallbackIndex, 'penalty check must appear before fallback global limiter');
});

test('checkUserRateLimit excludes background UX traffic from strict per-user bucket', async () => {
  const source = await read(RATE_LIMIT_PATH);

  const fnStart = source.indexOf('export function checkUserRateLimit');
  assert.ok(fnStart >= 0, 'checkUserRateLimit must exist');

  const fnEnd = source.indexOf('/**\n * Reset store', fnStart);
  assert.ok(fnEnd > fnStart, 'checkUserRateLimit block should be bounded');

  const fn = source.slice(fnStart, fnEnd);

  assert.match(fn, /isAlwaysAllowedRequest\(req\)/);
  assert.match(fn, /isSseEndpoint\(req\)/);
  assert.match(fn, /isPresenceHeartbeat\(req\)/);
  assert.match(fn, /isBackgroundReadRequest\(req\)/);
  assert.match(fn, /isLowRiskWriteRequest\(req\)/);
  assert.match(fn, /user_high_risk:\$\{userId\}/);
});

test('package still has no new production dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE_PATH));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
