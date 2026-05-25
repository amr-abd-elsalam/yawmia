import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 61 version is 0.57.0 and PWA cache is bumped', async () => {
  const pkg = JSON.parse(await readFile('./package.json', 'utf-8'));
  assert.equal(pkg.version, '0.57.0');

  const configRaw = await readFile('./config.js', 'utf-8');
  assert.match(configRaw, /cacheName:\s*'yawmia-v0\.57\.0'/);

  const sw = await readFile('./frontend/sw.js', 'utf-8');
  assert.match(sw, /CACHE_NAME\s*=\s*'yawmia-v0\.57\.0'/);
});
