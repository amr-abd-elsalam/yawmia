import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('read-only replica guard still blocks write methods', async () => {
  const raw = await readFile('server/middleware/readOnlyReplica.js', 'utf-8');

  assert.ok(raw.includes("method === 'POST'"));
  assert.ok(raw.includes("method === 'PUT'"));
  assert.ok(raw.includes("method === 'PATCH'"));
  assert.ok(raw.includes("method === 'DELETE'"));

  assert.ok(raw.includes('READ_ONLY_REPLICA_WRITE_BLOCKED'));
  assert.ok(raw.includes('isReadOnlyReplica'));
});

test('multi-instance boundary docs warn against PM2 cluster and multiple writers', async () => {
  const raw = await readFile('docs/operations/MULTI_INSTANCE_BOUNDARY.md', 'utf-8');

  assert.ok(raw.includes('Do not run PM2 cluster mode.'));
  assert.ok(raw.includes('Do not run multiple writers'));
  assert.ok(raw.includes('File-backed process locks are guardrails, not distributed consensus.'));
});
