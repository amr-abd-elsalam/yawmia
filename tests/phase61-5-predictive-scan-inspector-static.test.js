// ═══════════════════════════════════════════════════════════════
// tests/phase61-5-predictive-scan-inspector-static.test.js
// Phase 61.5 — Predictive Scan Queue Inspector Static Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT = 'scripts/inspect-predictive-scan-queue.js';
const STATUS = 'scripts/phase61-1-remediation-status.js';
const PACKAGE = 'package.json';

async function read(path) {
  return await readFile(path, 'utf-8');
}

function includes(text, phrase) {
  assert.ok(text.includes(phrase), `${phrase} must be present`);
}

function notIncludes(text, phrase) {
  assert.ok(!text.includes(phrase), `${phrase} must not be present`);
}

test('predictive scan inspector is explicitly read-only', async () => {
  const src = await read(SCRIPT);

  includes(src, 'Read-only');
  includes(src, 'readOnly: true');
  includes(src, 'mutationPerformed: false');
  includes(src, 'No mutation performed');
});

test('predictive scan inspector counts predictive_scan by status', async () => {
  const src = await read(SCRIPT);

  includes(src, "type === 'predictive_scan'");
  includes(src, 'byStatus');
  includes(src, 'pending');
  includes(src, 'running');
  includes(src, 'completed');
  includes(src, 'dead-letter');
});

test('predictive scan inspector reports stale running and attempts buckets', async () => {
  const src = await read(SCRIPT);

  includes(src, 'staleRunningCount');
  includes(src, 'nonStaleRunningCount');
  includes(src, 'attemptBuckets');
  includes(src, 'ageBuckets');
  includes(src, 'isLeaseExpired');
});

test('predictive scan inspector reports idempotency and scheduler state', async () => {
  const src = await read(SCRIPT);

  includes(src, 'ops_queue_idempotency');
  includes(src, 'expiredPredictiveScanKeys');
  includes(src, 'getSchedulerJob');
  includes(src, 'predictive_scan');
  includes(src, 'dualSchedulingRisk');
});

test('predictive scan inspector does not import workers or execute queue mutation APIs', async () => {
  const src = await read(SCRIPT);

  notIncludes(src, 'queueWorkers');
  notIncludes(src, 'processDueJobs');
  notIncludes(src, 'claimNextJobs');
  notIncludes(src, 'recoverStaleRunningJobs');
  notIncludes(src, 'writeQueueRecord');
  notIncludes(src, 'moveQueueRecord');
  notIncludes(src, 'retryJob');
  notIncludes(src, 'cancelJob');
  notIncludes(src, 'completeJob');
  notIncludes(src, 'failJob');
});

test('remediation status includes predictive scan inspection', async () => {
  const src = await read(STATUS);

  includes(src, 'predictive_scan_queue_inspect');
  includes(src, 'scripts/inspect-predictive-scan-queue.js');
  includes(src, 'PREDICTIVE_SCAN_STALE_RUNNING_REVIEW');
  includes(src, 'Do not requeue blindly before flood review');
});

test('package still has no new dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
