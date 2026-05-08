import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 50: health and docs expose version 0.46.0', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-router-version-'));
  process.env.YAWMIA_DATA_PATH = tempDir;
  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  process.env.ADMIN_TOKEN = 'phase50-router-token';

  let serverModule;

  try {
    serverModule = await import('../server.js?phase50routerversion=' + Date.now());
    const server = serverModule.server;

    await new Promise((resolve) => {
      if (server.listening) return resolve();
      server.on('listening', resolve);
    });

    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(base + '/api/health').then(r => r.json());
    assert.equal(health.version, '0.46.0');

    const docs = await fetch(base + '/api/docs').then(r => r.json());
    assert.equal(docs.version, '0.46.0');

    // Phase 50 routes added; exact count can evolve, but should be >= Phase 49 baseline + additions.
    assert.ok(docs.total >= 146);

    const paths = docs.routes.map(r => r.path);
    assert.ok(paths.includes('/api/admin/audit-index/status'));
    assert.ok(paths.includes('/api/admin/audit-index/rebuild'));
    assert.ok(paths.includes('/api/admin/audit-index/verify'));
    assert.ok(paths.includes('/api/admin/exports'));
    assert.ok(paths.includes('/api/admin/exports/:id/download'));
    assert.ok(paths.includes('/api/admin/exports/:id/cancel'));
    assert.ok(paths.includes('/api/admin/counters/hygiene'));
    assert.ok(paths.includes('/api/admin/counters/compact'));

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
