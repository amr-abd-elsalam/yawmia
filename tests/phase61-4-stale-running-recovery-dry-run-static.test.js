// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-stale-running-recovery-dry-run-static.test.js
// Phase 61.4 — Stale Running Recovery Dry-Run Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT_PATH = 'scripts/recover-stale-running-jobs.js';
const DOC_PATH = 'docs/operations/STALE_RUNNING_RECOVERY_DRY_RUN_2026-05-30.md';
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

test('stale running recovery dry-run script exists and is explicitly dry-run only', async () => {
  const script = await read(SCRIPT_PATH);

  assertIncludes(script, 'Stale Running Queue Jobs Dry-Run Auditor');
  assertIncludes(script, 'Default is dry-run');
  assertIncludes(script, 'CONFIRM_NOT_IMPLEMENTED');
  assertIncludes(script, 'mutationPerformed: false');
  assertIncludes(script, 'confirmImplemented: false');
});

test('stale running recovery script does not process due jobs or claim pending jobs', async () => {
  const script = await read(SCRIPT_PATH);

  assert.doesNotMatch(script, /processDueJobs\s*\(/);
  assert.doesNotMatch(script, /queueWorkers/);
  assert.doesNotMatch(script, /claimNextJobs\s*\(/);

  assertIncludes(script, 'this script does not call queueWorkers.processDueJobs()');
  assertIncludes(script, 'this script does not claim pending jobs');
});

test('stale running recovery script does not mutate queue records', async () => {
  const script = await read(SCRIPT_PATH);

  const forbiddenMutators = [
    'writeQueueRecord',
    'deleteQueueRecord',
    'moveQueueRecord',
    'completeJob',
    'failJob',
    'cancelJob',
    'retryJob',
    'moveToDeadLetter',
    'recoverStaleRunningJobs()',
  ];

  for (const phrase of forbiddenMutators) {
    assert.doesNotMatch(
      script,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${phrase} must not be used by dry-run recovery script`
    );
  }
});

test('stale running recovery script reports required job fields', async () => {
  const script = await read(SCRIPT_PATH);

  const requiredFields = [
    'jobId',
    'type',
    'status',
    'attempts',
    'maxAttempts',
    'lockedBy',
    'leaseUntil',
    'updatedAt',
    'path',
    'proposedAction',
    'proposedReason',
  ];

  for (const field of requiredFields) {
    assertIncludes(script, field);
  }
});

test('stale running recovery documentation exists and forbids queue-drain as recovery', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'Stale Running Queue Recovery Dry-Run');
  assertIncludes(doc, 'Confirm recovery implemented: NO');
  assertIncludes(doc, 'Queue mutation now: NO');
  assertIncludes(doc, 'queue-drain --confirm is not stale-running recovery only');
  assertIncludes(doc, 'queueWorkers.processDueJobs()');
  assertIncludes(doc, 'do not use queue-drain --confirm to recover stale running jobs');
});

test('stale running recovery documentation defines safe dry-run and confirm-not-implemented behavior', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'node scripts/recover-stale-running-jobs.js --dry-run --json');
  assertIncludes(doc, 'mutationPerformed:false');
  assertIncludes(doc, 'CONFIRM_NOT_IMPLEMENTED');
  assertIncludes(doc, 'mutationPerformed: false');
});

test('stale running recovery documentation forbids unsafe commands and architecture leaps', async () => {
  const doc = await read(DOC_PATH);

  const requiredGuardrails = [
    'repair-queue.js --confirm',
    'queue-drain.js --confirm',
    'compact-queue.js --confirm',
    'reset-dev-data.js --confirm',
    'quarantine-corrupt-json.js --confirm',
    'PostgreSQL',
    'Redis',
    'external queue',
    'external search',
    'No queue mutation now',
    'No pilot while QUEUE_SUMMARY_MISMATCH remains active',
  ];

  for (const phrase of requiredGuardrails) {
    assertIncludes(doc, phrase);
  }
});

test('package still has no new production dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE_PATH));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
