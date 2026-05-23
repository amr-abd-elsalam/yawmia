import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('migration v19 exists and does not run heavy scans', async () => {
  const raw = await readFile('server/services/migration.js', 'utf-8');

  assert.ok(raw.includes('version: 19'));
  assert.ok(raw.includes('Phase 59: File-Based Scale Limits and Externalization Readiness'));
  assert.ok(raw.includes('does NOT'));
  assert.ok(raw.includes('run storage pressure scans'));
  assert.ok(raw.includes('run benchmarks'));
  assert.ok(raw.includes('externalize any data'));

  const v19Start = raw.indexOf('version: 19');
  const v19Block = raw.slice(v19Start, raw.indexOf('];', v19Start));

  assert.ok(!v19Block.includes('getStoragePressure('));
  assert.ok(!v19Block.includes('captureStoragePressureSnapshot('));
  assert.ok(!v19Block.includes('benchmark'));
});
