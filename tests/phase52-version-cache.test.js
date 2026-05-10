import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 52 version bump: package.json is 0.48.0', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
  assert.equal(pkg.version, '0.48.0');
});

test('Phase 52 version bump: config PWA cache is yawmia-v0.48.0', async () => {
  const { default: config } = await import('../config.js');
  assert.equal(config.PWA.cacheName, 'yawmia-v0.48.0');
});

test('Phase 52 version bump: service worker cache is yawmia-v0.48.0', async () => {
  const sw = await readFile(new URL('../frontend/sw.js', import.meta.url), 'utf-8');
  assert.match(sw, /const CACHE_NAME = 'yawmia-v0\.48\.0';/);
});

test('Phase 52 config includes OPS_QUEUE and ALERT_DELIVERY', async () => {
  const { default: config } = await import('../config.js');
  assert.equal(config.OPS_QUEUE.enabled, true);
  assert.equal(config.ALERT_DELIVERY.enabled, true);
  assert.equal(config.DATABASE.dirs.ops_queue, 'ops_queue');
  assert.equal(config.DATABASE.dirs.alert_deliveries, 'alert_deliveries');
});
