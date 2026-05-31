// ═══════════════════════════════════════════════════════════════
// tests/phase61-5-remediation-status-queue-mismatch-static.test.js
// Phase 61.5 — Remediation Status Queue Mismatch Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const STATUS = 'scripts/phase61-1-remediation-status.js';

async function read(path) {
  return await readFile(path, 'utf-8');
}

function includes(text, phrase) {
  assert.ok(text.includes(phrase), `${phrase} must be present`);
}

test('remediation status keeps queue summary mismatch as blocker', async () => {
  const src = await read(STATUS);

  includes(src, 'QUEUE_SUMMARY_MISMATCH');
  includes(src, 'Queue summary/location index does not match actual queue files.');
  includes(src, 'node scripts/repair-queue.js --dry-run --json');
});

test('remediation status keeps stale running recovery as review-only warning', async () => {
  const src = await read(STATUS);

  includes(src, 'STALE_RUNNING_JOBS_REQUIRE_REVIEW');
  includes(src, 'stale running job(s) require dry-run review before any recovery workflow');
  includes(src, 'node scripts/recover-stale-running-jobs.js --dry-run --json --summary-only');
});

test('repair confirm now requires explicit approval id in status guidance', async () => {
  const src = await read(STATUS);

  includes(src, 'node scripts/repair-queue.js --confirm --json --approval-id=<approved-id>');
});

test('repair confirm without approval remains forbidden', async () => {
  const src = await read(STATUS);

  includes(src, 'node scripts/repair-queue.js --confirm --json');
  includes(src, 'forbiddenWithoutNewApproval');
});

test('remediation status preserves no externalization and no pilot stance', async () => {
  const src = await read(STATUS);

  includes(src, 'noExternalization: true');
  includes(src, 'noPilot: true');
});
