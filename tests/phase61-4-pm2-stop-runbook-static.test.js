import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const RUNBOOK = 'docs/operations/PM2_MANAGED_YAWMIA_QUEUE_WORKER_RUNBOOK.md';
const AUDIT_DOC = 'docs/operations/ACTIVE_QUEUE_WORKER_FORENSIC_AUDIT_2026-05-31.md';

test('PM2 runbook documents that direct PID kill is not durable under PM2', async () => {
  const src = await readFile(RUNBOOK, 'utf-8');

  assert.match(src, /direct PID kill is not durable/i);
  assert.match(src, /PM2 restarts server\.js/i);
  assert.match(src, /queue_worker_<PID>_/);
});

test('PM2 runbook requires PM2 discovery before stop', async () => {
  const src = await readFile(RUNBOOK, 'utf-8');

  assert.match(src, /pm2 list/);
  assert.match(src, /pm2 status/);
  assert.match(src, /pm2 jlist/);
  assert.match(src, /pm2 describe/);
});

test('PM2 runbook requires pm2 stop after identity proof', async () => {
  const src = await readFile(RUNBOOK, 'utf-8');

  assert.match(src, /pm2 stop <CONFIRMED_YAWMIA_PM2_APP_NAME_OR_ID>/);
  assert.match(src, /identity is proven/i);
});

test('PM2 runbook forbids broad process kill commands', async () => {
  const src = await readFile(RUNBOOK, 'utf-8');

  assert.match(src, /pkill node/);
  assert.match(src, /killall node/);
  assert.match(src, /kill -9/);
});

test('PM2 runbook requires quiet snapshots before queue mutation', async () => {
  const src = await readFile(RUNBOOK, 'utf-8');

  assert.match(src, /Quiet Snapshot Requirement/);
  assert.match(src, /sleep 660/);
  assert.match(src, /leases stop refreshing/i);
});

test('active worker forensic audit documents quiet state proof', async () => {
  const src = await readFile(AUDIT_DOC, 'utf-8');

  assert.match(src, /nonStaleRunningCount:\s*0/);
  assert.match(src, /activeWorkerLikely:\s*false/);
  assert.match(src, /pm2ManagedLikely:\s*false/);
  assert.match(src, /staleRunningCount:\s*40/);
});

test('active worker forensic audit preserves no external queue and no pilot guardrails', async () => {
  const src = await readFile(AUDIT_DOC, 'utf-8');

  assert.match(src, /No PostgreSQL/);
  assert.match(src, /No Redis/);
  assert.match(src, /No external queue/);
  assert.match(src, /No pilot/i);
});
