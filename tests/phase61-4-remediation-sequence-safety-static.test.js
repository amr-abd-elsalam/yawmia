// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-remediation-sequence-safety-static.test.js
// Phase 61.4 — Remediation Status Recommended Sequence Safety
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT_PATH = 'scripts/phase61-1-remediation-status.js';

async function read(path) {
  return await readFile(path, 'utf-8');
}

function extractArrayBlock(source, propertyName) {
  const re = new RegExp(`${propertyName}:\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const match = source.match(re);
  return match ? match[1] : '';
}

test('Phase 61 remediation recommendedSequence is safe and non-mutating only', async () => {
  const script = await read(SCRIPT_PATH);
  const block = extractArrayBlock(script, 'recommendedSequence');

  assert.ok(block, 'recommendedSequence block must exist');

  assert.match(block, /verify-data-json\.js --strict --json/);
  assert.match(block, /find-null-json-files\.js --json/);
  assert.match(block, /verify-queue\.js --json/);
  assert.match(block, /repair-queue\.js --dry-run --json/);
  assert.match(block, /recover-stale-running-jobs\.js --dry-run --json/);

  assert.doesNotMatch(block, /--confirm/);
  assert.doesNotMatch(block, /reset-dev-data/);
  assert.doesNotMatch(block, /quarantine-corrupt-json\.js --confirm/);
  assert.doesNotMatch(block, /queue-drain\.js --confirm/);
});

test('Phase 61 remediation status separates confirm commands from recommendedSequence', async () => {
  const script = await read(SCRIPT_PATH);

  assert.match(script, /confirmOnlyAfterApproval/);
  assert.match(script, /forbiddenWithoutNewApproval/);

  const confirmBlock = extractArrayBlock(script, 'confirmOnlyAfterApproval');
  assert.match(confirmBlock, /repair-queue\.js --confirm --json/);
  assert.match(confirmBlock, /compact-queue\.js --confirm --json/);

  const forbiddenBlock = extractArrayBlock(script, 'forbiddenWithoutNewApproval');
  assert.match(forbiddenBlock, /queue-drain\.js --confirm --json/);
  assert.match(forbiddenBlock, /reset-dev-data\.js --confirm --reinit --json/);
  assert.match(forbiddenBlock, /quarantine-corrupt-json\.js --confirm --json/);
  assert.match(forbiddenBlock, /recover-stale-running-jobs\.js --confirm --json/);
});

test('Phase 61 remediation status includes stale running dry-run in safe diagnostics', async () => {
  const script = await read(SCRIPT_PATH);
  const block = extractArrayBlock(script, 'safeDiagnostics');

  assert.match(block, /recover-stale-running-jobs\.js --dry-run --json/);
  assert.doesNotMatch(block, /--confirm/);
});
