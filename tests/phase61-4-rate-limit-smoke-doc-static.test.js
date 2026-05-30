// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-rate-limit-smoke-doc-static.test.js
// Phase 61.4 — Rate Limit Smoke Documentation Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOC_PATH = 'docs/operations/RATE_LIMIT_FALSE_POSITIVE_SMOKE_2026-05-30.md';
const PACKAGE_PATH = 'package.json';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('Phase 61.4 rate-limit smoke document exists and names the false-positive scope', async () => {
  const doc = await read(DOC_PATH);

  assert.match(doc, /Rate Limit False-Positive Smoke Checklist/);
  assert.match(doc, /Phase 61\.4/);
  assert.match(doc, /normal dashboard/);
  assert.match(doc, /Workroom/);
  assert.match(doc, /notification/);
  assert.match(doc, /presence/);
  assert.match(doc, /SSE/);
  assert.match(doc, /Talent Radar/);
});

test('Rate-limit smoke doc keeps OTP and admin write protections explicit', async () => {
  const doc = await read(DOC_PATH);

  assert.match(doc, /OTP remains strict/);
  assert.match(doc, /Admin writes remain strict/);
  assert.match(doc, /High-risk marketplace writes remain protected/);
  assert.match(doc, /OTP abuse smoke/);
  assert.match(doc, /Admin Write Smoke/);
});

test('Rate-limit smoke doc forbids unsafe architecture conclusions', async () => {
  const doc = await read(DOC_PATH);

  const requiredGuardrails = [
    'No new dependencies',
    'No external rate limiter',
    'No Redis',
    'No Firebase/Auth provider migration',
    'No Queue mutation',
    'No rate-limit disable as permanent fix',
    'No OTP weakening',
    'No admin write weakening',
    'No version rollback',
  ];

  for (const phrase of requiredGuardrails) {
    assert.match(doc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${phrase} must be documented`);
  }
});

test('Rate-limit smoke doc includes worker and employer manual smoke paths', async () => {
  const doc = await read(DOC_PATH);

  assert.match(doc, /Worker Smoke/);
  assert.match(doc, /Login as worker/);
  assert.match(doc, /Open Workroom list/);
  assert.match(doc, /Send one message/);

  assert.match(doc, /Employer Smoke/);
  assert.match(doc, /Login as employer/);
  assert.match(doc, /Open Talent Radar/);
  assert.match(doc, /applications panel/);
  assert.match(doc, /attendance panel/);
});

test('Rate-limit smoke doc explicitly treats SSE and presence as no-penalty smoke areas', async () => {
  const doc = await read(DOC_PATH);

  assert.match(doc, /SSE Reconnect Smoke/);
  assert.match(doc, /SSE reconnect does not trigger global penalty/);

  assert.match(doc, /Presence Heartbeat Smoke/);
  assert.match(doc, /No user-facing penalty/);
  assert.match(doc, /No false temporary blocking/);
});

test('Rate-limit smoke doc forbids queue mutation commands during smoke', async () => {
  const doc = await read(DOC_PATH);

  assert.match(doc, /Forbidden During This Smoke/);
  assert.match(doc, /repair-queue\.js --confirm/);
  assert.match(doc, /queue-drain\.js --confirm/);
  assert.match(doc, /compact-queue\.js --confirm/);
  assert.match(doc, /reset-dev-data\.js --confirm/);
  assert.match(doc, /quarantine-corrupt-json\.js --confirm/);
});

test('package still has no new production dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE_PATH));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
