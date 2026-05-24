import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 60 does not add new npm dependencies', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.equal(pkg.devDependencies, undefined);
});
