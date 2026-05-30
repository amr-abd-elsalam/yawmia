// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-stale-running-classification-static.test.js
// Phase 61.4 — Stale Running Classification Explainability
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT_PATH = 'scripts/recover-stale-running-jobs.js';
const STATUS_PATH = 'scripts/phase61-1-remediation-status.js';
const PACKAGE_PATH = 'package.json';

async function read(path) {
  return await readFile(path, 'utf-8');
}

function assertIncludes(text, phrase) {
  assert.match(
    text,
    new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `${phrase} must be present`
  );
}

test('stale running dry-run explains stale classification criteria', async () => {
  const script = await read(SCRIPT_PATH);

  assertIncludes(script, 'function classifyRunningJob');
  assertIncludes(script, 'leaseUntil_expired');
  assertIncludes(script, 'updatedAt_exceeds_staleRunningMs');
  assertIncludes(script, 'leaseExpired');
  assertIncludes(script, 'updatedAtStale');
  assertIncludes(script, 'leaseAgeMs');
  assertIncludes(script, 'updatedAgeMs');
  assertIncludes(script, 'staleRunningMs');
});

test('stale running dry-run reports non-stale running jobs separately', async () => {
  const script = await read(SCRIPT_PATH);

  assertIncludes(script, 'nonStaleRunningJobs');
  assertIncludes(script, 'nonStaleRunningCount');
  assertIncludes(script, 'no_action_in_dry_run');
  assertIncludes(script, 'running job did not match stale criteria in this dry-run');
});

test('stale running dry-run remains non-mutating and does not import queueWorkers', async () => {
  const script = await read(SCRIPT_PATH);

  assert.doesNotMatch(script, /import\(['"].*queueWorkers\.js['"]\)/);
  assert.doesNotMatch(script, /await\s+\w+\.processDueJobs\s*\(/);
  assert.doesNotMatch(script, /claimNextJobs\s*\(/);
  assert.doesNotMatch(script, /writeQueueRecord\s*\(/);
  assert.doesNotMatch(script, /moveQueueRecord\s*\(/);
  assert.doesNotMatch(script, /deleteQueueRecord\s*\(/);

  assertIncludes(script, 'mutationPerformed: false');
  assertIncludes(script, 'confirmImplemented: false');
});

test('remediation status summary includes nonStaleRunningCount', async () => {
  const script = await read(STATUS_PATH);

  assertIncludes(script, 'nonStaleRunningCount');
  assertIncludes(script, "if (name === 'stale_running_recovery_dry_run')");
});

test('package still has no new production dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE_PATH));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
