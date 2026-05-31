import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCRIPT = 'scripts/queue-drain.js';

test('queue-drain has confirm preflight before importing queueWorkers', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  const preflightIdx = src.indexOf('const confirmPreflight = buildConfirmPreflight();');
  const importWorkersIdx = src.indexOf("await import('../server/services/queueWorkers.js')");

  assert.notEqual(preflightIdx, -1, 'confirm preflight must exist');
  assert.notEqual(importWorkersIdx, -1, 'queueWorkers import must exist in confirm path');
  assert.ok(preflightIdx < importWorkersIdx, 'preflight must run before queueWorkers import');
});

test('queue-drain refuses confirm when active Yawmia server process is detected', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /ACTIVE_YAWMIA_SERVER_PROCESS/);
  assert.match(src, /CONFIRM_PREFLIGHT_BLOCKED/);
  assert.match(src, /confirmPreflightAllowed:\s*false/);
  assert.match(src, /process\.exit\(3\)/);
});

test('queue-drain detects Yawmia server processes through cwd and cmdline', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /discoverYawmiaServerProcesses/);
  assert.match(src, /readProcessInfo/);
  assert.match(src, /\/proc\/\$\{pid\}\/cwd/);
  assert.match(src, /\/proc\/\$\{pid\}\/cmdline/);
  assert.match(src, /yawmiaServerLikely/);
});

test('queue-drain detects PM2-managed Yawmia app and blocks confirm', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /discoverPm2YawmiaApps/);
  assert.match(src, /pm2/);
  assert.match(src, /jlist/);
  assert.match(src, /PM2_MANAGED_YAWMIA_ACTIVE/);
  assert.match(src, /pm2 stop <confirmed-yawmia-app-name-or-id>/);
});

test('queue-drain dry-run reports preflight without mutating queue', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.match(src, /confirmPreflightAllowed/);
  assert.match(src, /confirmPreflight/);
  assert.match(src, /mutationPerformed:\s*false/);
  assert.match(src, /dry-run does not claim/);
});

test('queue-drain does not use broad node kill commands', async () => {
  const src = await readFile(SCRIPT, 'utf-8');

  assert.doesNotMatch(src, /pkill\s+node/);
  assert.doesNotMatch(src, /killall\s+node/);
  assert.doesNotMatch(src, /kill\s+-9/);
});
