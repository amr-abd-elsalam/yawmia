import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('router exposes 0.50.0 health/docs version strings', async () => {
  const router = await readFile('./server/router.js', 'utf-8');

  assert.match(router, /version:\s*'0\.50\.0'/);
  assert.match(router, /version:\s*'0\.50\.0'/);
  assert.doesNotMatch(router, /version:\s*'0\.49\.0'/);
});
