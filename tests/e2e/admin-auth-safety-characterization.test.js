// ═══════════════════════════════════════════════════════════════
// tests/e2e/admin-auth-safety-characterization.test.js
// Patch 38 — P0 Security Hardening Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Ensure ADMIN_TOKEN in query string is rejected by default.
//   Query-string admin tokens can leak via logs/history/referrers/proxies.
//   X-Admin-Token remains as temporary legacy header path.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';

function makeReq({
  method = 'GET',
  pathname = '/api/admin/export/users',
  query = {},
  headers = {},
} = {}) {
  return {
    method,
    pathname,
    query,
    headers,
    socket: {
      remoteAddress: '127.0.0.1',
      setTimeout() {},
    },
  };
}

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writableEnded: false,
    headersSent: false,
    destroyed: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = { ...this.headers, ...headers };
      this.headersSent = true;
    },
    write(chunk) {
      this.body += chunk || '';
    },
    end(chunk = '') {
      this.body += chunk || '';
      this.writableEnded = true;
    },
    on() {},
  };
}

test('requireAdmin rejects admin query token by default even for download routes', async () => {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  delete process.env.ADMIN_QUERY_TOKEN_ENABLED;
  delete process.env.ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED;

  const { requireAdmin } = await import('../../server/middleware/auth.js?admin-auth-safety-1=' + Date.now());

  const req = makeReq({
    method: 'GET',
    pathname: '/api/admin/export/users',
    query: { _token: 'test-admin-token' },
  });
  const res = makeRes();

  let nextCalled = false;
  requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);

  const payload = JSON.parse(res.body);
  assert.equal(payload.code, 'ADMIN_QUERY_TOKEN_DISABLED');
});

test('requireAdmin allows X-Admin-Token header as temporary legacy path', async () => {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  delete process.env.ADMIN_QUERY_TOKEN_ENABLED;
  delete process.env.ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED;

  const { requireAdmin } = await import('../../server/middleware/auth.js?admin-auth-safety-2=' + Date.now());

  const req = makeReq({
    method: 'GET',
    pathname: '/api/admin/stats',
    headers: { 'x-admin-token': 'test-admin-token' },
  });
  const res = makeRes();

  let nextCalled = false;
  requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.isAdmin, true);
  assert.equal(res.writableEnded, false);
});

test('requireAdmin allows download query token only when explicit env flag is enabled', async () => {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  delete process.env.ADMIN_QUERY_TOKEN_ENABLED;
  process.env.ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED = 'true';

  const { requireAdmin } = await import('../../server/middleware/auth.js?admin-auth-safety-3=' + Date.now());

  const req = makeReq({
    method: 'GET',
    pathname: '/api/admin/export/users',
    query: { _token: 'test-admin-token' },
  });
  const res = makeRes();

  let nextCalled = false;
  requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.isAdmin, true);
  assert.equal(res.writableEnded, false);

  delete process.env.ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED;
});

test('admin SSE rejects query token by default', async () => {
  process.env.ADMIN_TOKEN = 'test-admin-token';
  delete process.env.ADMIN_QUERY_TOKEN_ENABLED;
  delete process.env.ADMIN_SSE_QUERY_TOKEN_ENABLED;

  const { handleAdminEventStream } = await import('../../server/handlers/adminSseHandler.js?admin-auth-safety-4=' + Date.now());

  const req = makeReq({
    method: 'GET',
    pathname: '/api/admin/events',
    query: { token: 'test-admin-token' },
  });
  const res = makeRes();

  await handleAdminEventStream(req, res);

  assert.equal(res.statusCode, 401);

  const payload = JSON.parse(res.body);
  assert.equal(payload.code, 'ADMIN_SSE_QUERY_TOKEN_DISABLED');
});
