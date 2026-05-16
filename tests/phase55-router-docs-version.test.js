import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../server/router.js';

function mockReq(pathname, method = 'GET') {
  return {
    method,
    pathname,
    query: {},
    headers: {},
    socket: {},
  };
}

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writableEnded: false,
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body = chunk;
      this.writableEnded = true;
    },
    setHeader() {},
  };
}

test('Phase 55: /api/docs reports version 0.51.0 and includes scale hygiene routes', async () => {
  const router = createRouter();
  const req = mockReq('/api/docs');
  const res = mockRes();

  router(req, res);

  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(res.statusCode, 200);

  const data = JSON.parse(res.body);
  assert.equal(data.version, '0.51.0');

  const paths = data.routes.map(r => r.path);
  assert.equal(paths.includes('/api/admin/scale-hygiene/overview'), true);
  assert.equal(paths.includes('/api/admin/queue/compact'), true);
  assert.equal(paths.includes('/api/admin/workroom-hygiene/compact'), true);
});
