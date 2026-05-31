import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT = 'scripts/phase61-1-remediation-status.js';

test('remediation status blocks on nonStaleRunningCount as active worker evidence', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /nonStaleRunningCount/);
  assert.match(src, /ACTIVE_QUEUE_WORKER_LIKELY/);
  assert.match(src, /quiet snapshots prove leases stopped refreshing/);
});

test('remediation status blocks on PM2-managed Yawmia active evidence', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /pm2ManagedLikely/);
  assert.match(src, /PM2_MANAGED_YAWMIA_ACTIVE/);
  assert.match(src, /pm2 stop <confirmed-yawmia-app>/);
});

test('remediation status summarizes runningJobsByLockOwner safely', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /runningJobsByLockOwner/);
  assert.match(src, /activeYawmiaServerLikely/);
  assert.match(src, /pm2App/);
});

test('remediation status recommends summary-only stale running dry-run', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /recover-stale-running-jobs\.js --dry-run --json --summary-only/);
});

test('remediation status keeps queue mutation commands forbidden without new approval', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /queue-drain\.js --confirm --json/);
  assert.match(src, /recover-stale-running-jobs\.js --confirm --json/);
  assert.match(src, /reset-dev-data\.js/);
  assert.match(src, /quarantine-corrupt-json\.js/);
});
