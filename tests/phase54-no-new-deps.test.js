import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('no new npm dependencies were added', async () => {
  const pkg = JSON.parse(await readFile('./package.json', 'utf-8'));

  assert.deepEqual(Object.keys(pkg.dependencies || {}).sort(), ['dotenv']);
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), []);
});
