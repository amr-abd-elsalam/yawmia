import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('migration v18 exists and is non-destructive', async () => {
  const raw = await readFile('server/services/migration.js', 'utf-8');

  assert.match(raw, /version:\s*18/);
  assert.match(raw, /Phase 58: Governance, Privacy, RBAC, and Operational Maturity/);
  assert.match(raw, /no heavy schema scan|no heavy data scan|No heavy scan/i);
  assert.match(raw, /No destructive privacy\/anonymization action runs during migration/i);
});
