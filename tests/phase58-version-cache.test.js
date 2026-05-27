import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../config.js';

test('package version bumped to 0.57.0', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  assert.equal(pkg.version, '0.57.0');
});

test('config PWA cache bumped to yawmia-v0.57.0', () => {
  assert.equal(config.PWA.cacheName, 'yawmia-v0.57.0');
});

test('service worker cache name bumped to yawmia-v0.57.0', async () => {
  const sw = await readFile('frontend/sw.js', 'utf-8');
  assert.match(sw, /CACHE_NAME\s*=\s*'yawmia-v0\.57\.0'/);
});

test('router health/docs version bumped to 0.57.0', async () => {
  const router = await readFile('server/router.js', 'utf-8');
  assert.match(router, /version:\s*'0\.57\.0'/);
  assert.match(router, /version:\s*'0\.57\.0'/);
});
