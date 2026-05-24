import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('predeploy check includes Phase 60 checks', async () => {
  const text = await readFile('scripts/predeploy-check.js', 'utf-8');

  assert.match(text, /phase60Docs/);
  assert.match(text, /phase60Scripts/);
  assert.match(text, /capture-externalization-decision\.js/);
  assert.match(text, /list-benchmark-history\.js/);
});
