// ═══════════════════════════════════════════════════════════════
// tests/phase61-5-queue-repair-approval-static.test.js
// Phase 61.5 — Queue Repair Approval + Quiet-State Preflight Guardrails
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const REPAIR_QUEUE = 'scripts/repair-queue.js';
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

test('repair-queue confirm requires explicit approval id', async () => {
  const src = await read(REPAIR_QUEUE);

  includes(src, 'QUEUE_REPAIR_APPROVAL_ID');
  includes(src, '--approval-id=');
  includes(src, 'QUEUE_REPAIR_APPROVAL_REQUIRED');
  includes(src, 'apr_');
});

test('repair-queue confirm blocks active Yawmia server process', async () => {
  const src = await read(REPAIR_QUEUE);

  includes(src, 'discoverYawmiaServerProcesses');
  includes(src, 'ACTIVE_YAWMIA_SERVER_PROCESS');
  includes(src, '/mnt/j/yawmia');
  includes(src, 'server.js');
  includes(src, 'yawmiaServerLikely');
});

test('repair-queue confirm blocks online PM2-managed Yawmia', async () => {
  const src = await read(REPAIR_QUEUE);

  includes(src, 'discoverPm2YawmiaApps');
  includes(src, 'PM2_MANAGED_YAWMIA_ACTIVE');
  includes(src, 'pm2');
  includes(src, 'jlist');
  includes(src, 'online');
  includes(src, 'launching');
  includes(src, 'stopping');
});

test('repair-queue confirm runs stale-running dry-run preflight before mutation', async () => {
  const src = await read(REPAIR_QUEUE);

  includes(src, 'runStaleRunningPreflight');
  includes(src, 'recover-stale-running-jobs.js');
  includes(src, '--dry-run');
  includes(src, '--summary-only');
  includes(src, 'NON_STALE_RUNNING_JOBS_PRESENT');
  includes(src, 'ACTIVE_QUEUE_WORKER_LIKELY');
});

test('repair-queue confirm exits before importing repair service when preflight fails', async () => {
  const src = await read(REPAIR_QUEUE);

  const preflightIndex = src.indexOf('const confirmPreflight = CONFIRM ? buildConfirmPreflight() : null;');
  const importRepairIndex = src.indexOf("const { repairQueueStorage } = await import('../server/services/queueHealthVerify.js');");

  assert.ok(preflightIndex >= 0, 'confirm preflight must exist in main');
  assert.ok(importRepairIndex >= 0, 'repairQueueStorage import must exist');
  assert.ok(preflightIndex < importRepairIndex, 'confirm preflight must run before repairQueueStorage import');
});

test('repair-queue documents that confirm is summary/location repair only', async () => {
  const src = await read(REPAIR_QUEUE);

  includes(src, 'repair-queue --confirm is intended to rebuild queue summary/location index only');
  includes(src, 'repair-queue --confirm is not stale-running recovery');
  includes(src, 'repair-queue --confirm must not run while Yawmia server/queue worker is active');
});

test('repair-queue does not import queueWorkers or call processDueJobs', async () => {
  const src = await read(REPAIR_QUEUE);

  notIncludes(src, "import('../server/services/queueWorkers.js')");
  notIncludes(src, 'processDueJobs(');
});

test('package still has no new dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
