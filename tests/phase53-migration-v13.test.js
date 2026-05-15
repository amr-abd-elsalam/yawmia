import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 53 migration: migration v13 is registered', async () => {
  const src = await readFile(new URL('../server/services/migration.js', import.meta.url), 'utf-8');

  assert.match(src, /version:\s*13/);
  assert.match(src, /Phase 53: Workroom Collaboration V2 \+ Trust Calibration \+ Actionable UX/);
  assert.match(src, /Phase 53 directories registered/);
});
