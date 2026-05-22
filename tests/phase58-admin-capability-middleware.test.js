import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCapability } from '../server/middleware/auth.js';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    writableEnded: false,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      Object.assign(this.headers, headers);
    },
    end(body) {
      this.body = body;
      this.writableEnded = true;
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    },
  };
}

function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    const res = makeRes();
    let nextCalled = false;

    mw(req, res, () => {
      nextCalled = true;
      resolve({ res, nextCalled });
    });

    setTimeout(() => resolve({ res, nextCalled }), 50);
  });
}

test('requireCapability allows ADMIN_TOKEN super_admin', async () => {
  process.env.ADMIN_TOKEN = 'test-admin-token';

  const req = {
    method: 'POST',
    pathname: '/api/admin/queue/repair',
    headers: { 'x-admin-token': 'test-admin-token' },
    query: {},
  };

  const mw = requireCapability('admin.queue.repair');
  const { res, nextCalled } = await runMiddleware(mw, req);

  assert.equal(nextCalled, true);
  assert.equal(res.writableEnded, false);
  assert.equal(req.adminRole, 'super_admin');
});

test('requireCapability allows admin user with matching role capability', async () => {
  const req = {
    method: 'POST',
    pathname: '/api/admin/queue/repair',
    headers: {},
    query: {},
    user: {
      id: 'adm_ops',
      role: 'admin',
      adminRole: 'ops_admin',
      status: 'active',
    },
  };

  const mw = requireCapability('admin.queue.repair');
  const { res, nextCalled } = await runMiddleware(mw, req);

  assert.equal(nextCalled, true);
  assert.equal(res.writableEnded, false);
  assert.equal(req.adminRole, 'ops_admin');
});

test('requireCapability rejects admin user without capability', async () => {
  const req = {
    method: 'POST',
    pathname: '/api/admin/production/process-locks/foo/release',
    headers: {},
    query: {},
    user: {
      id: 'adm_trust',
      role: 'admin',
      adminRole: 'trust_admin',
      status: 'active',
    },
  };

  const mw = requireCapability('admin.locks.release');
  const { res, nextCalled } = await runMiddleware(mw, req);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);

  const body = res.json();
  assert.equal(body.code, 'ADMIN_CAPABILITY_REQUIRED');
  assert.equal(body.capability, 'admin.locks.release');
  assert.equal(body.role, 'trust_admin');
});

test('requireCapability rejects non-admin request', async () => {
  const req = {
    method: 'GET',
    pathname: '/api/admin/rbac/matrix',
    headers: {},
    query: {},
  };

  const mw = requireCapability('admin.read');
  const { res, nextCalled } = await runMiddleware(mw, req);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);

  const body = res.json();
  assert.equal(body.code, 'ADMIN_REQUIRED');
});
