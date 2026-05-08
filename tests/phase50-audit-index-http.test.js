import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 50: admin audit-index/export/counter endpoints require admin and respond', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-http-'));
  const port = 0;

  process.env.YAWMIA_DATA_PATH = tempDir;
  process.env.ADMIN_TOKEN = 'phase50-admin-token';
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';

  let serverModule;

  try {
    serverModule = await import('../server.js?phase50http=' + Date.now());
    const server = serverModule.server;

    await new Promise((resolve) => {
      if (server.listening) return resolve();
      server.on('listening', resolve);
    });

    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const noAuth = await fetch(base + '/api/admin/audit-index/status');
    assert.equal(noAuth.status, 401);

    const headers = { 'X-Admin-Token': 'phase50-admin-token' };

    const statusRes = await fetch(base + '/api/admin/audit-index/status', { headers });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.ok, true);
    assert.ok(statusData.auditIndex);

    const rebuildRes = await fetch(base + '/api/admin/audit-index/rebuild', {
      method: 'POST',
      headers,
    });
    assert.equal(rebuildRes.status, 200);
    const rebuildData = await rebuildRes.json();
    assert.equal(rebuildData.ok, true);
    assert.equal(typeof rebuildData.indexed, 'number');

    const verifyRes = await fetch(base + '/api/admin/audit-index/verify', {
      method: 'POST',
      headers,
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.ok, true);

    const exportsRes = await fetch(base + '/api/admin/exports', { headers });
    assert.equal(exportsRes.status, 200);
    const exportsData = await exportsRes.json();
    assert.equal(exportsData.ok, true);
    assert.ok(Array.isArray(exportsData.exports));

    const hygieneRes = await fetch(base + '/api/admin/counters/hygiene', { headers });
    assert.equal(hygieneRes.status, 200);
    const hygieneData = await hygieneRes.json();
    assert.equal(hygieneData.ok, true);
    assert.equal(typeof hygieneData.fileSizeBytes, 'number');

    await new Promise(resolve => server.close(resolve));
  } finally {
    if (serverModule && serverModule.server && serverModule.server.listening) {
      await new Promise(resolve => serverModule.server.close(resolve));
    }
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
    delete process.env.ADMIN_TOKEN;
    delete process.env.PORT;
    delete process.env.HOST;
  }
});
