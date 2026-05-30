// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-stale-running-observation-static.test.js
// Phase 61.4 — Stale Running Recovery Observation Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOC_PATH = 'docs/operations/STALE_RUNNING_RECOVERY_OBSERVATION_2026-05-30.md';
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

test('stale running observation document exists and records dry-run status', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'Stale Running Recovery Observation');
  assertIncludes(doc, 'Phase 61.4');
  assertIncludes(doc, 'Status: OBSERVED_DRY_RUN');
  assertIncludes(doc, 'Queue mutation performed: NO');
  assertIncludes(doc, 'Recovery confirm implemented: NO');
  assertIncludes(doc, 'Recovery confirm approved: NO');
});

test('stale running observation records the 40 predictive_scan stale jobs pattern', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'scannedRunning: 40');
  assertIncludes(doc, 'staleRunningCount: 40');
  assertIncludes(doc, 'moveBackToPendingCandidates: 40');
  assertIncludes(doc, 'deadLetterCandidates: 0');
  assertIncludes(doc, 'type: predictive_scan');
  assertIncludes(doc, 'attempts: 1');
  assertIncludes(doc, 'maxAttempts: 5');
});

test('stale running observation links stale jobs to prior queue-drain totalClaimed 40', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'queue-drain --confirm totalClaimed: 40');
  assertIncludes(doc, 'staleRunningCount: 40');
  assertIncludes(doc, 'The 40 stale running jobs are consistent with the prior queue-drain --confirm run');
});

test('stale running observation keeps queue-drain forbidden as stale recovery', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'queue-drain --confirm is not stale-running recovery only');
  assertIncludes(doc, 'queue-drain --confirm calls processDueJobs()');
  assertIncludes(doc, 'Do not use queue-drain as a stale-running recovery command');
});

test('stale running observation preserves QUEUE_SUMMARY_MISMATCH as active blocker', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'QUEUE_SUMMARY_MISMATCH: ACTIVE BLOCKER');
  assertIncludes(doc, 'QUEUE_SUMMARY_MISMATCH remains the active blocker');
  assertIncludes(doc, 'summary mismatches: 3');
  assertIncludes(doc, 'actual file mismatches: 3');
});

test('stale running observation documents actual segmented files as source of truth', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'actual segmented queue files');
  assertIncludes(doc, 'raw queue records');
  assertIncludes(doc, 'queue summary/location index as rebuildable acceleration metadata only');
  assertIncludes(doc, 'Do not treat summary/location index as source of truth');
});

test('stale running observation forbids confirm/reset/quarantine/externalization now', async () => {
  const doc = await read(DOC_PATH);

  const requiredGuardrails = [
    'repair-queue.js --confirm',
    'queue-drain.js --confirm',
    'compact-queue.js --confirm',
    'recover-stale-running-jobs.js --confirm',
    'reset-dev-data.js --confirm',
    'quarantine-corrupt-json.js --confirm',
    'No PostgreSQL',
    'No external queue',
    'No Redis',
    'No external search',
    'No queue mutation now',
    'No pilot while QUEUE_SUMMARY_MISMATCH remains active',
    'No version rollback',
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
