// ═══════════════════════════════════════════════════════════════
// tests/helpers/test-server.js — Test Server Helper
// ═══════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

/**
 * Start a test server on a random port.
 * Returns { server, port, baseUrl, tmpDir, close }
 */
export async function startTestServer() {
  // Create temp data directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-integ-'));

  // We need to set environment variables before importing modules
  process.env.YAWMIA_DATA_PATH = tmpDir;
  process.env.ADMIN_TOKEN = 'test-admin-token-123';
  process.env.PORT = '0'; // random port

  // Dynamically import modules (they read config at import time)
  // We need to create data dirs first
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp'];
  for (const dir of dirs) {
    await mkdir(join(tmpDir, dir), { recursive: true });
  }

  const { corsMiddleware } = await import('../../server/middleware/cors.js');
  const { requestIdMiddleware } = await import('../../server/middleware/requestId.js');
  const { bodyParserMiddleware } = await import('../../server/middleware/bodyParser.js');
  const { createRouter } = await import('../../server/router.js');

  const router = createRouter();

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);
    req.pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams);

    // Simplified middleware chain for testing
    corsMiddleware(req, res, () => {
      requestIdMiddleware(req, res, () => {
        bodyParserMiddleware(req, res, () => {
          router(req, res);
        });
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        tmpDir,
        async close() {
          return new Promise((res) => {
            server.close(() => {
              rm(tmpDir, { recursive: true, force: true }).then(res).catch(res);
            });
          });
        },
      });
    });
  });
}
