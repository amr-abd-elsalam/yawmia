import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 61 admin routes are registered and protected', async () => {
  const raw = await readFile('./server/router.js', 'utf-8');

  const routes = [
    '/api/admin/phase61/evidence',
    '/api/admin/phase61/evidence/capture',
    '/api/admin/phase61/evidence/snapshots',
    '/api/admin/phase61/pilot-gate',
    '/api/admin/phase61/pilot-gate/capture',
    '/api/admin/rollback-rehearsal/run',
    '/api/admin/rollback-rehearsal',
    '/api/admin/rollback-rehearsal/:id',
    '/api/admin/repository-contracts',
  ];

  for (const route of routes) {
    assert.ok(raw.includes(route), `Missing route ${route}`);
  }

  assert.match(raw, /handleGetPhase61Evidence/);
  assert.match(raw, /handleCapturePhase61Evidence/);
  assert.match(raw, /handleGetPilotDecisionGate/);
  assert.match(raw, /handleRunRollbackRehearsal/);
  assert.match(raw, /handleRepositoryContracts/);
});
