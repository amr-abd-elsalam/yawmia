// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-remediation-status-stale-recovery-static.test.js
// Phase 61.4 — Remediation Status Includes Stale Running Dry-Run
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT_PATH = 'scripts/phase61-1-remediation-status.js';
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

test('Phase 61 remediation status runs stale running recovery dry-run as a safe check', async () => {
  const script = await read(SCRIPT_PATH);

  assertIncludes(script, "run('stale_running_recovery_dry_run'");
  assertIncludes(script, 'scripts/recover-stale-running-jobs.js');
  assertIncludes(script, "'--dry-run', '--json'");
});

test('Phase 61 remediation status warns when stale running jobs require review', async () => {
  const script = await read(SCRIPT_PATH);

  assertIncludes(script, 'STALE_RUNNING_RECOVERY_DRY_RUN_UNAVAILABLE');
  assertIncludes(script, 'STALE_RUNNING_JOBS_REQUIRE_REVIEW');
  assertIncludes(script, 'stale running job(s) require dry-run review before any recovery workflow');
});

test('Phase 61 remediation status summarizes stale running dry-run output safely', async () => {
  const script = await read(SCRIPT_PATH);

  assertIncludes(script, "if (name === 'stale_running_recovery_dry_run')");
  assertIncludes(script, 'confirmImplemented');
  assertIncludes(script, 'scannedRunning');
  assertIncludes(script, 'staleRunningCount');
  assertIncludes(script, 'moveBackToPendingCandidates');
  assertIncludes(script, 'deadLetterCandidates');
});

test('Phase 61 remediation status keeps recommendedSequence non-mutating', async () => {
  const script = await read(SCRIPT_PATH);

  const recommendedMatch = script.match(/recommendedSequence:\s*\[([\s\S]*?)\]/m);
  assert.ok(recommendedMatch, 'recommendedSequence must exist');

  const recommended = recommendedMatch[1];

  assertIncludes(recommended, 'recover-stale-running-jobs.js --dry-run --json');
  assert.doesNotMatch(recommended, /--confirm/);
  assert.doesNotMatch(recommended, /queue-drain\.js --confirm/);
  assert.doesNotMatch(recommended, /reset-dev-data\.js --confirm/);
  assert.doesNotMatch(recommended, /quarantine-corrupt-json\.js --confirm/);
});

test('package still has no new production dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE_PATH));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
