import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import config from '../config.js';

test('Phase 59 package version is 0.55.0', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  assert.equal(pkg.version, '0.55.0');
});

test('Phase 59 PWA cache version is yawmia-v0.55.0 in config and service worker', async () => {
  assert.equal(config.PWA.cacheName, 'yawmia-v0.55.0');

  const sw = await readFile('frontend/sw.js', 'utf-8');
  assert.match(sw, /CACHE_NAME\s*=\s*'yawmia-v0\.55\.0'/);
});

test('Phase 59 router health/docs version is 0.55.0', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  assert.ok(router.includes("version: '0.55.0'"), 'health version should be 0.55.0');
  assert.ok(router.includes("version: '0.55.0'"), 'docs version should be 0.55.0');
  assert.ok(!router.includes("version: '0.54.0'"), 'router should not expose old 0.54.0 version');
});
