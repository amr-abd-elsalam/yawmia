import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('verify-production-readiness script documents Phase 59 scale/storage checks', async () => {
  const raw = await readFile('scripts/verify-production-readiness.js', 'utf-8');

  assert.ok(raw.includes('Phase 59 Readiness CLI'));
  assert.ok(raw.includes('scale threshold'));
  assert.ok(raw.includes('storage pressure'));
  assert.ok(raw.includes('--json'));
  assert.ok(raw.includes('--strict'));
});

test('predeploy-check script documents and runs Phase 59 verification', async () => {
  const raw = await readFile('scripts/predeploy-check.js', 'utf-8');

  assert.ok(raw.includes('Deployment Gate (Phase 59)'));
  assert.ok(raw.includes('verify-scale-thresholds.js'));
  assert.ok(raw.includes('measure-storage-pressure.js') || raw.includes('storage pressure'));
  assert.ok(raw.includes('SCALE_LIMITS.md'));
  assert.ok(raw.includes('EXTERNALIZATION_READINESS.md'));
  assert.ok(raw.includes('MULTI_INSTANCE_BOUNDARY.md'));
  assert.ok(raw.includes('DATA_MIGRATION_FORMATS.md'));
  assert.ok(raw.includes('STORAGE_PRESSURE_RUNBOOK.md'));
});
