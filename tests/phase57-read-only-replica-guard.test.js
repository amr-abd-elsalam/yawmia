import test from 'node:test';
import assert from 'node:assert/strict';

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function fakeReq({ method = 'GET', pathname = '/api/health' } = {}) {
  return {
    method,
    pathname,
    query: {},
    headers: {},
  };
}

function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    end(body = '') {
      this.body = body;
      this.writableEnded = true;
    },
  };
}

test('read-only replica allows GET /api/health', async () => {
  const previous = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'read_only_replica';

  const { readOnlyReplicaMiddleware } = await import('../server/middleware/readOnlyReplica.js');
  const req = fakeReq({ method: 'GET', pathname: '/api/health' });
  const res = fakeRes();

  let nextCalled = false;
  readOnlyReplicaMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.writableEnded, false);

  restoreEnv('INSTANCE_MODE', previous);
});

test('read-only replica blocks POST write APIs', async () => {
  const previous = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'read_only_replica';

  const { readOnlyReplicaMiddleware } = await import('../server/middleware/readOnlyReplica.js');
  const req = fakeReq({ method: 'POST', pathname: '/api/jobs' });
  const res = fakeRes();

  let nextCalled = false;
  readOnlyReplicaMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);

  const body = JSON.parse(res.body);
  assert.equal(body.code, 'READ_ONLY_REPLICA_WRITE_BLOCKED');
  assert.equal(body.readOnlyReplica, true);

  restoreEnv('INSTANCE_MODE', previous);
});

test('single_writer mode does not block writes', async () => {
  const previous = process.env.INSTANCE_MODE;
  process.env.INSTANCE_MODE = 'single_writer';

  const { readOnlyReplicaMiddleware } = await import('../server/middleware/readOnlyReplica.js');
  const req = fakeReq({ method: 'POST', pathname: '/api/jobs' });
  const res = fakeRes();

  let nextCalled = false;
  readOnlyReplicaMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.writableEnded, false);

  restoreEnv('INSTANCE_MODE', previous);
});
