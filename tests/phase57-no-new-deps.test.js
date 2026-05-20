import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 57 adds no new npm dependencies', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));

  assert.deepEqual(Object.keys(pkg.dependencies || {}).sort(), ['dotenv']);
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), []);
});
