import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function fakeReq(method, pathname) {
  return {
    method,
    pathname,
    query: {},
    headers: {},
  };
}

function fakeRes() {
  return {
    statusCode: 0,
    body: '',
    headers: {},
    writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(code, headers = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(body = '') {
      this.body = body;
      this.writableEnded = true;
    },
  };
}

test('server.js includes readOnlyReplicaMiddleware before bodyParserMiddleware', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf-8');

  const idxGuard = server.indexOf('readOnlyReplicaMiddleware');
  const idxBody = server.indexOf('bodyParserMiddleware');

  assert.ok(idxGuard > -1);
  assert.ok(idxBody > -1);
  assert.ok(idxGuard < idxBody);
});

test('read-only replica blocks auth send-otp write', async () => {
  const prev = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'read_only_replica';

  const { readOnlyReplicaMiddleware } = await import('../server/middleware/readOnlyReplica.js');

  const req = fakeReq('POST', '/api/auth/send-otp');
  const res = fakeRes();

  let nextCalled = false;
  readOnlyReplicaMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /READ_ONLY_REPLICA_WRITE_BLOCKED/);

  restoreEnv('INSTANCE_MODE', prev);
});

test('read-only replica blocks admin write endpoint', async () => {
  const prev = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'read_only_replica';

  const { readOnlyReplicaMiddleware } = await import('../server/middleware/readOnlyReplica.js');

  const req = fakeReq('POST', '/api/admin/counters/rebuild');
  const res = fakeRes();

  let nextCalled = false;
  readOnlyReplicaMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);

  restoreEnv('INSTANCE_MODE', prev);
});

test('read-only replica allows public read route GET /api/jobs', async () => {
  const prev = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'read_only_replica';

  const { readOnlyReplicaMiddleware } = await import('../server/middleware/readOnlyReplica.js');

  const req = fakeReq('GET', '/api/jobs');
  const res = fakeRes();

  let nextCalled = false;
  readOnlyReplicaMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.writableEnded, false);

  restoreEnv('INSTANCE_MODE', prev);
});
