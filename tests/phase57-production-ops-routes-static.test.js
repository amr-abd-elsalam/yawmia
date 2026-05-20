import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('router registers Phase 57 production ops routes', async () => {
  const router = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');

  assert.match(router, /\/api\/admin\/production\/deployment-gate/);
  assert.match(router, /\/api\/admin\/production\/scheduler-cadence/);
  assert.match(router, /\/api\/admin\/production\/ops-review/);
});

test('productionOpsHandler exports Phase 57 read-only handlers', async () => {
  const handler = await readFile(new URL('../server/handlers/productionOpsHandler.js', import.meta.url), 'utf-8');

  assert.match(handler, /export async function handleDeploymentGate/);
  assert.match(handler, /export async function handleSchedulerCadence/);
  assert.match(handler, /export async function handleOpsReview/);
});
