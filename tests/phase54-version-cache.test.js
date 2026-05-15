import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../config.js';

test('package version is 0.50.0', async () => {
  const pkg = JSON.parse(await readFile('./package.json', 'utf-8'));
  assert.equal(pkg.version, '0.50.0');
});

test('config PWA cache name is yawmia-v0.50.0', () => {
  assert.equal(config.PWA.cacheName, 'yawmia-v0.50.0');
});

test('service worker cache name is yawmia-v0.50.0', async () => {
  const sw = await readFile('./frontend/sw.js', 'utf-8');
  assert.match(sw, /CACHE_NAME\s*=\s*'yawmia-v0\.50\.0'/);
});
