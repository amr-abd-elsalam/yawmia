import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

function runNode(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL('..', import.meta.url).pathname,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    child.on('close', code => {
      resolve({ status: code, stdout, stderr });
    });
  });
}

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

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>home</body></html>');
      return;
    }

    if (url.pathname === '/dashboard.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>dashboard</body></html>');
      return;
    }

    if (url.pathname === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'يوميّة' }));
      return;
    }

    // Optional admin endpoints if ADMIN_TOKEN is inherited by environment.
    if (
      url.pathname === '/api/admin/production/readiness' ||
      url.pathname === '/api/admin/ops/slo' ||
      url.pathname === '/api/admin/scale-hygiene/overview' ||
      url.pathname === '/api/admin/marketplace-intelligence/dashboard'
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const proc = await runNode(['scripts/postdeploy-smoke.js', `--base=http://127.0.0.1:${port}`], {
      env: {
        ...process.env,
        ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',
      },
    });

    assert.equal(proc.status, 0, proc.stderr || proc.stdout);
    assert.match(proc.stdout, /Post-deploy smoke passed/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
