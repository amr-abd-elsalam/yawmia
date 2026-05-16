import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import config from '../config.js';

test('Phase 55: package version is 0.51.0', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
  assert.equal(pkg.version, '0.51.0');
});

test('Phase 55: config PWA cache is bumped', () => {
  assert.equal(config.PWA.cacheName, 'yawmia-v0.51.0');
});

test('Phase 55: service worker cache is bumped', async () => {
  const sw = await readFile(new URL('../frontend/sw.js', import.meta.url), 'utf-8');
  assert.match(sw, /const CACHE_NAME = 'yawmia-v0\.51\.0';/);
});

test('Phase 55: no new npm dependencies added', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.equal(pkg.devDependencies, undefined);
});
