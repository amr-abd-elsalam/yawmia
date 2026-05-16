import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 55: no new npm dependencies', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));

  assert.deepEqual(pkg.dependencies, {
    dotenv: '^16.4.0',
  });

  assert.equal(pkg.devDependencies, undefined);
});
