import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT = 'scripts/recover-stale-running-jobs.js';

test('stale running recovery script exposes active worker and PM2 preflight fields', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /activeWorkerLikely/);
  assert.match(src, /pm2ManagedLikely/);
  assert.match(src, /confirmPreflightAllowed/);
  assert.match(src, /confirmPreflightBlockers/);
  assert.match(src, /runningJobsByLockOwner/);
  assert.match(src, /processCorrelation/);
  assert.match(src, /pm2Correlation/);
});

test('stale running recovery script extracts PID from queue_worker owner', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /function extractPidFromWorkerId/);
  assert.match(src, /workerId\.match\(/);
  assert.match(src, /\^queue_worker_/);
  assert.match(src, /\\d\+/);
  assert.match(src, /Number\(match\[1\]\)/);
});

test('stale running recovery script reads process cwd and cmdline for owner correlation', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /readProcessInfo/);
  assert.match(src, /\/proc\/\$\{pid\}\/cwd/);
  assert.match(src, /\/proc\/\$\{pid\}\/cmdline/);
  assert.match(src, /yawmiaServerLikely/);
});

test('stale running recovery script reads PM2 jlist without mutation', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /pm2/);
  assert.match(src, /jlist/);
  assert.doesNotMatch(src, /pm2'\s*,\s*\['stop'/);
  assert.doesNotMatch(src, /pm2'\s*,\s*\['restart'/);
  assert.doesNotMatch(src, /pm2'\s*,\s*\['delete'/);
});

test('stale running recovery script supports summary-only compact output', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /SUMMARY_ONLY/);
  assert.match(src, /--summary-only/);
  assert.match(src, /--compact/);
  assert.match(src, /function compactOutput/);
  assert.match(src, /staleSample/);
  assert.match(src, /nonStaleSample/);
});

test('stale running recovery confirm remains intentionally not implemented', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /CONFIRM_NOT_IMPLEMENTED/);
  assert.match(src, /confirm is intentionally not implemented/i);
  assert.match(src, /mutationPerformed:\s*false/);

  // Comments may mention processDueJobs as a forbidden behavior.
  // The guardrail is that this script must not import queueWorkers or call workers.processDueJobs().
  assert.doesNotMatch(src, /import\(['"]\.\.\/server\/services\/queueWorkers\.js['"]\)/);
  assert.doesNotMatch(src, /workers\.processDueJobs\(/);
  assert.doesNotMatch(src, /await\s+[^;\n]*processDueJobs\(/);
});
