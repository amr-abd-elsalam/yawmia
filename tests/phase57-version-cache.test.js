import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../config.js';

test('package version is 0.57.0', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
  assert.equal(pkg.version, '0.57.0');
});

test('PWA cache version is 0.57.0', async () => {
  assert.equal(config.PWA.cacheName, 'yawmia-v0.57.0');

  const sw = await readFile(new URL('../frontend/sw.js', import.meta.url), 'utf-8');
  assert.match(sw, /CACHE_NAME = 'yawmia-v0\.57\.0'/);
});

test('router health/docs version bumped to 0.57.0', async () => {
  const router = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');
  assert.match(router, /version: '0\.57\.0'/);
  assert.match(router, /version: '0\.57\.0'/);
});
