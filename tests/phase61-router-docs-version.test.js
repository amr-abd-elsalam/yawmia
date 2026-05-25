import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Router health/docs version bumped to 0.57.0', async () => {
  const raw = await readFile('./server/router.js', 'utf-8');

  assert.match(raw, /version:\s*'0\.57\.0'/);
  assert.match(raw, /version:\s*'0\.57\.0'/);

  assert.doesNotMatch(raw, /version:\s*'0\.56\.0'/);
});
