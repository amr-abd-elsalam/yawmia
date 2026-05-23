import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const docs = [
  'SCALE_LIMITS.md',
  'EXTERNALIZATION_READINESS.md',
  'MULTI_INSTANCE_BOUNDARY.md',
  'DATA_MIGRATION_FORMATS.md',
  'STORAGE_PRESSURE_RUNBOOK.md',
];

test('Phase 59 required docs exist and contain key guardrails', async () => {
  for (const doc of docs) {
    const raw = await readFile(doc, 'utf-8');
    assert.ok(raw.length > 500, `${doc} should be substantial`);
  }

  const scale = await readFile('SCALE_LIMITS.md', 'utf-8');
  assert.ok(scale.includes('Do not migrate to PostgreSQL just because one warning appears.'));
  assert.ok(scale.includes('Do not run multiple writers as a scaling solution.'));
  assert.ok(scale.includes('Do not treat file locks as distributed consensus.'));

  const external = await readFile('EXTERNALIZATION_READINESS.md', 'utf-8');
  assert.ok(external.includes('Externalization is not Phase 59 implementation'));
  assert.ok(external.includes('Dual-read strategy'));
  assert.ok(external.includes('Dual-write strategy'));
  assert.ok(external.includes('Rollback strategy'));

  const multi = await readFile('MULTI_INSTANCE_BOUNDARY.md', 'utf-8');
  assert.ok(multi.includes('File-backed process locks are guardrails, not distributed consensus.'));
  assert.ok(multi.includes('EventBus is in-memory'));
  assert.ok(multi.includes('Admin SSE is single-instance'));
  assert.ok(multi.includes('Do not run PM2 cluster mode.'));

  const formats = await readFile('DATA_MIGRATION_FORMATS.md', 'utf-8');
  assert.ok(formats.includes('manifest.json schema'));
  assert.ok(formats.includes('NDJSON'));
  assert.ok(formats.includes('checksums'));

  const runbook = await readFile('STORAGE_PRESSURE_RUNBOOK.md', 'utf-8');
  assert.ok(runbook.includes('Warning threshold workflow'));
  assert.ok(runbook.includes('Critical threshold workflow'));
  assert.ok(runbook.includes('node scripts/measure-storage-pressure.js'));
});

test('Runbooks were updated with Phase 59 references', async () => {
  const deploy = await readFile('DEPLOYMENT_RUNBOOK.md', 'utf-8');
  const ops = await readFile('OPERATIONS_RUNBOOK.md', 'utf-8');
  const gov = await readFile('DATA_GOVERNANCE_RUNBOOK.md', 'utf-8');
  const privacy = await readFile('PRIVACY_REQUEST_RUNBOOK.md', 'utf-8');
  const rbac = await readFile('ADMIN_RBAC_MODEL.md', 'utf-8');

  assert.ok(deploy.includes('Phase 59'));
  assert.ok(deploy.includes('verify-scale-thresholds'));
  assert.ok(ops.includes('Storage pressure'));
  assert.ok(gov.includes('migration snapshot'));
  assert.ok(privacy.includes('storage pressure'));
  assert.ok(rbac.includes('admin.scale.read'));
});
