import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir;
let server;
let baseUrl;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-phase52-version-http-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const { createRouter } = await import('../server/router.js');
  const router = createRouter();

  server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    req.pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams);
    router(req, res);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

test('/api/health returns version 0.48.0', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.version, '0.48.0');
});

test('/api/docs returns version 0.48.0 and includes Phase 52 routes', async () => {
  const res = await fetch(`${baseUrl}/api/docs`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.version, '0.48.0');

  const paths = new Set((data.routes || []).map(r => r.path));
  assert.equal(paths.has('/api/admin/ops-queue/stats'), true);
  assert.equal(paths.has('/api/admin/alerts/deliveries'), true);
  assert.equal(paths.has('/api/admin/exports/audit-log'), true);
});

test('/api/health includes Phase 52 ops queue and alert delivery stats', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.opsQueue);
  assert.ok(data.alertDeliveries);
  assert.equal(typeof data.opsQueue.enabled, 'boolean');
  assert.equal(typeof data.alertDeliveries.enabled, 'boolean');
});
