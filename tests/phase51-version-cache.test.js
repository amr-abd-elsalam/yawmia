import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package version is bumped to 0.47.0', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
  assert.equal(pkg.version, '0.47.0');
});

test('config PWA cache name is yawmia-v0.47.0', async () => {
  const { default: config } = await import('../config.js');
  assert.equal(config.PWA.cacheName, 'yawmia-v0.47.0');
});

test('service worker cache name is yawmia-v0.47.0 and includes workroom.js', async () => {
  const sw = await readFile(new URL('../frontend/sw.js', import.meta.url), 'utf-8');

  assert.match(sw, /const CACHE_NAME = 'yawmia-v0\.47\.0';/);
  assert.match(sw, /\/assets\/js\/workroom\.js/);
});

test('router health/docs versions are 0.47.0', async () => {
  const routerSource = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');

  assert.match(routerSource, /version: '0\.47\.0'/);
  assert.match(routerSource, /version: '0\.47\.0'/);
  assert.doesNotMatch(routerSource, /version: '0\.46\.0'/);
});

test('config contains Phase 51 sections and data dirs', async () => {
  const { default: config } = await import('../config.js');

  assert.equal(config.PREDICTIVE_ABUSE.enabled, true);
  assert.equal(config.TRUST_SCORE_V2.enabled, true);
  assert.equal(config.WORKROOM.enabled, true);

  assert.equal(config.DATABASE.dirs.predictive_signals, 'predictive_signals');
  assert.equal(config.DATABASE.dirs.workrooms, 'workrooms');
  assert.equal(config.DATABASE.dirs.trust_snapshots, 'metrics/trust-v2-snapshots');
});
