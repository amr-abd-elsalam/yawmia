// ═══════════════════════════════════════════════════════════════
// tests/phase61-5-predictive-scan-flood-diagnostics-static.test.js
// Phase 61.5 — Predictive Scan Flood Diagnostics Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const RECOVER = 'scripts/recover-stale-running-jobs.js';

async function read(path) {
  return await readFile(path, 'utf-8');
}

function includes(text, phrase) {
  assert.ok(text.includes(phrase), `${phrase} must be present`);
}

function notIncludes(text, phrase) {
  assert.ok(!text.includes(phrase), `${phrase} must not be present`);
}

test('stale running dry-run summarizes stale jobs by type', async () => {
  const src = await read(RECOVER);

  includes(src, 'summarizeBy');
  includes(src, 'staleRunningByType');
  includes(src, 'nonStaleRunningByType');
});

test('stale running dry-run summarizes attempts for recovery review', async () => {
  const src = await read(RECOVER);

  includes(src, 'summarizeAttempts');
  includes(src, 'staleRunningAttempts');
  includes(src, 'maxed');
});

test('stale running dry-run exposes predictive_scan summary', async () => {
  const src = await read(RECOVER);

  includes(src, 'predictiveScanSummary');
  includes(src, "j.type === 'predictive_scan'");
  includes(src, 'moveBackToPendingCandidates');
  includes(src, 'deadLetterCandidates');
});

test('predictive_scan stale running jobs are not recommended for blind requeue', async () => {
  const src = await read(RECOVER);

  includes(src, 'predictive_scan stale running jobs detected; do not move them back to pending blindly before flood review');
  includes(src, 'review staleRunningByType and predictiveScanSummary before any recovery decision');
});

test('recover stale running confirm remains intentionally not implemented', async () => {
  const src = await read(RECOVER);

  includes(src, 'CONFIRM_NOT_IMPLEMENTED');
  includes(src, 'confirmImplemented: false');
  includes(src, 'mutationPerformed: false');
});

test('recover stale running dry-run does not import queue workers or execute queue processing APIs', async () => {
  const src = await read(RECOVER);

  // Strongest guard: the script must not import queueWorkers at all.
  // If queueWorkers is not imported, it cannot execute processDueJobs().
  notIncludes(src, "import('../server/services/queueWorkers.js')");
  notIncludes(src, "await import('../server/services/queueWorkers.js')");
  notIncludes(src, 'from \'../server/services/queueWorkers.js\'');
  notIncludes(src, 'from "../server/services/queueWorkers.js"');

  // Guard against direct queue-claim execution APIs.
  // Do not ban warning/comment strings like "queueWorkers.processDueJobs()".
  notIncludes(src, 'claimNextJobs({');
  notIncludes(src, 'await claimNextJobs');
  notIncludes(src, 'processDueJobs({');
  notIncludes(src, 'await processDueJobs');
});
