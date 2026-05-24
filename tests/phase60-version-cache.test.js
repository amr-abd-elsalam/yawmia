import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 60 version/cache are bumped to 0.56.0', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const configText = await readFile('config.js', 'utf-8');
  const swText = await readFile('frontend/sw.js', 'utf-8');
  const routerText = await readFile('server/router.js', 'utf-8');

  assert.equal(pkg.version, '0.56.0');
  assert.match(configText, /cacheName:\s*'yawmia-v0\.56\.0'/);
  assert.match(swText, /CACHE_NAME\s*=\s*'yawmia-v0\.56\.0'/);
  assert.match(routerText, /version:\s*'0\.56\.0'/);
});
