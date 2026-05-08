import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

test('Phase 50: bodyParser parses DELETE JSON body', async () => {
  const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');

  const req = new EventEmitter();
  req.method = 'DELETE';
  req.headers = { 'content-type': 'application/json' };

  let statusCode = null;
  let ended = false;
  const res = {
    writableEnded: false,
    writeHead(code) {
      statusCode = code;
    },
    end() {
      ended = true;
      this.writableEnded = true;
    },
  };

  const done = new Promise((resolve) => {
    bodyParserMiddleware(req, res, () => {
      resolve();
    });
  });

  req.emit('data', Buffer.from(JSON.stringify({ endpoint: 'https://push.example/sub' })));
  req.emit('end');

  await done;

  assert.equal(statusCode, null);
  assert.equal(ended, false);
  assert.deepEqual(req.body, { endpoint: 'https://push.example/sub' });
});

test('Phase 50: security helper applies static-safe headers', async () => {
  const { applySecurityHeaders } = await import('../server/middleware/security.js');

  const headers = {};
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
  };

  applySecurityHeaders(res);

  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.ok(headers['Content-Security-Policy']);
});

test('Phase 50: per-user rate limit helper blocks after configured limit', async () => {
  const { checkUserRateLimit, resetRateLimit } = await import('../server/middleware/rateLimit.js');
  const config = (await import('../config.js')).default;

  resetRateLimit();

  const originalMax = config.RATE_LIMIT.perUserMaxRequests;
  // config is frozen, so cannot mutate. Instead call enough times to exceed default.
  const max = config.RATE_LIMIT.perUserMaxRequests;

  let ended = false;
  let statusCode = null;

  function makeReqRes() {
    const req = { user: { id: 'usr_phase50_rate_test' } };
    const headers = {};
    const res = {
      setHeader(k, v) { headers[k] = v; },
      writeHead(code) { statusCode = code; },
      end() { ended = true; },
    };
    return { req, res };
  }

  for (let i = 0; i < max; i++) {
    const { req, res } = makeReqRes();
    assert.equal(checkUserRateLimit(req, res), true);
  }

  const { req, res } = makeReqRes();
  assert.equal(checkUserRateLimit(req, res), false);
  assert.equal(statusCode, 429);
  assert.equal(ended, true);

  resetRateLimit();
});

test('Phase 50: requireAdmin query token is scoped to download/export paths', async () => {
  process.env.ADMIN_TOKEN = 'phase50-token';

  const { requireAdmin } = await import('../server/middleware/auth.js?phase50adminscope=' + Date.now());

  async function run(pathname, method = 'GET') {
    let statusCode = null;
    let body = '';
    let nextCalled = false;

    const req = {
      method,
      pathname,
      query: { _token: 'phase50-token' },
      headers: {},
      socket: {},
    };

    const res = {
      writeHead(code) { statusCode = code; },
      end(chunk) { body += chunk || ''; },
    };

    await new Promise((resolve) => {
      requireAdmin(req, res, () => {
        nextCalled = true;
        resolve();
      });
      setTimeout(resolve, 20);
    });

    return { statusCode, body, nextCalled };
  }

  const allowed = await run('/api/admin/audit-log/export');
  assert.equal(allowed.nextCalled, true);

  const allowedDownload = await run('/api/admin/exports/exp_abc/download');
  assert.equal(allowedDownload.nextCalled, true);

  const denied = await run('/api/admin/users');
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.statusCode, 401);

  delete process.env.ADMIN_TOKEN;
});
