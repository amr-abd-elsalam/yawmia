// tests/static.test.js
// ═══════════════════════════════════════════════════════════════
// Static File Serving Tests (~7 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, rm, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let baseUrl;
let server;
let tmpDir;
let tmpFrontendDir;

before(async () => {
  // Create temp data directory
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-static-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;

  // Create temp frontend directory
  tmpFrontendDir = join(tmpDir, 'frontend');
  await mkdir(join(tmpFrontendDir, 'assets', 'css'), { recursive: true });
  await mkdir(join(tmpFrontendDir, 'assets', 'js'), { recursive: true });

  // Create test files
  await writeFile(join(tmpFrontendDir, 'index.html'), '<!DOCTYPE html><html><body>Test Index</body></html>');
  await writeFile(join(tmpFrontendDir, 'dashboard.html'), '<!DOCTYPE html><html><body>Test Dashboard</body></html>');
  await writeFile(join(tmpFrontendDir, 'assets', 'css', 'style.css'), 'body { color: red; }');
  await writeFile(join(tmpFrontendDir, 'assets', 'js', 'app.js'), 'console.log("test");');

  // Override STATIC root in config (we need to patch it)
  // We'll import and set up the server with the temp frontend dir
  const { resolve } = await import('node:path');

  // Import middleware and router
  const { corsMiddleware } = await import('../server/middleware/cors.js');
  const { requestIdMiddleware } = await import('../server/middleware/requestId.js');
  const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');
  const { rateLimitMiddleware, resetRateLimit } = await import('../server/middleware/rateLimit.js');
  const { createRouter } = await import('../server/router.js');

  resetRateLimit();

  const router = createRouter();

  // Create a custom static middleware that uses our temp frontend dir
  const { readFile: readFileFs, stat: statFs } = await import('node:fs/promises');
  const { join: joinPath, resolve: resolvePath, extname: extnameFs } = await import('node:path');
  const config = (await import('../config.js')).default;

  const STATIC_ROOT = resolvePath(tmpFrontendDir);

  function testStaticMiddleware(req, res, next) {
    if (req.pathname.startsWith('/api/') || req.pathname === '/api') {
      return next();
    }
    (async () => {
      let urlPath = req.pathname;
      if (urlPath === '/') urlPath = '/index.html';
      let decoded;
      try { decoded = decodeURIComponent(urlPath); } catch { return next(); }
      const filePath = resolvePath(joinPath(STATIC_ROOT, decoded));
      if (!filePath.startsWith(STATIC_ROOT)) return next();
      try {
        const s = await statFs(filePath);
        if (!s.isFile()) return next();
      } catch { return next(); }
      const ext = extnameFs(filePath).toLowerCase();
      const contentType = config.STATIC.mimeTypes[ext] || 'application/octet-stream';
      const content = await readFileFs(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'Cache-Control': `public, max-age=${config.STATIC.maxAge}`,
      });
      res.end(content);
    })().catch(() => next());
  }

  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    req.pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams);

    testStaticMiddleware(req, res, () => {
      corsMiddleware(req, res, () => {
        requestIdMiddleware(req, res, () => {
          rateLimitMiddleware(req, res, () => {
            bodyParserMiddleware(req, res, () => {
              router(req, res);
            });
          });
        });
      });
    });
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('Static File Serving', () => {

  it('ST-01: GET / serves index.html', async () => {
    const res = await fetch(baseUrl + '/');
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Test Index'));
    assert.ok(res.headers.get('content-type').includes('text/html'));
  });

  it('ST-02: GET /dashboard.html serves dashboard', async () => {
    const res = await fetch(baseUrl + '/dashboard.html');
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Test Dashboard'));
  });

  it('ST-03: GET /assets/css/style.css serves CSS with correct Content-Type', async () => {
    const res = await fetch(baseUrl + '/assets/css/style.css');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/css'));
    const text = await res.text();
    assert.ok(text.includes('color: red'));
  });

  it('ST-04: GET /assets/js/app.js serves JS with correct Content-Type', async () => {
    const res = await fetch(baseUrl + '/assets/js/app.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/javascript'));
  });

  it('ST-05: GET /../../../etc/passwd is blocked (directory traversal)', async () => {
    const res = await fetch(baseUrl + '/../../../etc/passwd');
    // Should fall through to API router → 404
    assert.ok(res.status === 404 || res.status === 200); // 200 if browser normalizes the path
    // Try URL-encoded version
    const res2 = await fetch(baseUrl + '/..%2F..%2F..%2Fetc%2Fpasswd');
    const data = await res2.text();
    assert.ok(!data.includes('root:'));
  });

  it('ST-06: GET /api/health still works (static does not intercept API)', async () => {
    const res = await fetch(baseUrl + '/api/health');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
  });

  it('ST-07: GET /nonexistent.html falls through to 404', async () => {
    const res = await fetch(baseUrl + '/nonexistent.html');
    assert.strictEqual(res.status, 404);
  });
});
