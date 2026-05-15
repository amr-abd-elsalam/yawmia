import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import config from '../config.js';

test('Phase 53 version: package.json is 0.49.0', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
  assert.equal(pkg.version, '0.49.0');
});

test('Phase 53 version: config PWA cache name is yawmia-v0.49.0', () => {
  assert.equal(config.PWA.cacheName, 'yawmia-v0.49.0');
});

test('Phase 53 version: service worker cache name is yawmia-v0.49.0', async () => {
  const sw = await readFile(new URL('../frontend/sw.js', import.meta.url), 'utf-8');
  assert.match(sw, /CACHE_NAME\s*=\s*['"]yawmia-v0\.49\.0['"]/);
});

test('Phase 53 version: router exposes 0.49.0 version strings', async () => {
  const router = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');
  assert.match(router, /version:\s*['"]0\.49\.0['"]/);
  assert.match(router, /version:\s*['"]0\.49\.0['"]/);
});
