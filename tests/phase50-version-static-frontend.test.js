import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 50: package version bumped to 0.46.0', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
  assert.equal(pkg.version, '0.46.0');
});

test('Phase 50: service worker cache bumped to yawmia-v0.46.0', async () => {
  const sw = await readFile(new URL('../frontend/sw.js', import.meta.url), 'utf-8');
  assert.match(sw, /const CACHE_NAME = 'yawmia-v0\.46\.0';/);
  assert.doesNotMatch(sw, /yawmia-v0\.45\.0/);
});

test('Phase 50: config PWA cache bumped to yawmia-v0.46.0', async () => {
  const config = (await import('../config.js?phase50version=' + Date.now())).default;
  assert.equal(config.PWA.cacheName, 'yawmia-v0.46.0');
});

test('Phase 50: frontend jobDetail no longer references undefined userId', async () => {
  const js = await readFile(new URL('../frontend/assets/js/jobDetail.js', import.meta.url), 'utf-8');
  assert.doesNotMatch(js, /job\.employerId !== userId/);
  assert.match(js, /job\.employerId !== user\.id/);
});

test('Phase 50: static HTML response includes security headers', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-static-'));
  process.env.YAWMIA_DATA_PATH = tempDir;
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  process.env.ADMIN_TOKEN = 'phase50-static-token';

  let serverModule;

  try {
    serverModule = await import('../server.js?phase50static=' + Date.now());
    const server = serverModule.server;

    await new Promise((resolve) => {
      if (server.listening) return resolve();
      server.on('listening', resolve);
    });

    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.ok(res.headers.get('content-security-policy'));

    await new Promise(resolve => server.close(resolve));
  } finally {
    if (serverModule && serverModule.server && serverModule.server.listening) {
      await new Promise(resolve => serverModule.server.close(resolve));
    }
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.ADMIN_TOKEN;
  }
});
