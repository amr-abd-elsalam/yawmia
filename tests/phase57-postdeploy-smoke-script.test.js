import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';

test('postdeploy-smoke succeeds against a minimal compatible server', async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '0.53.0' }));
      return;
    }

    if (url.pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ BRAND: { name: 'يوميّة' } }));
      return;
    }

    if (url.pathname === '/api/docs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '0.53.0' }));
      return;
    }

    if (url.pathname === '/' || url.pathname === '/dashboard.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html></html>');
      return;
    }

    if (url.pathname === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'يوميّة' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const proc = spawnSync(process.execPath, ['scripts/postdeploy-smoke.js', `--base=http://127.0.0.1:${port}`], {
    cwd: new URL('..', import.meta.url).pathname,
    env: process.env,
    encoding: 'utf-8',
  });

  await new Promise(resolve => server.close(resolve));

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.match(proc.stdout, /Post-deploy smoke passed/);
});
