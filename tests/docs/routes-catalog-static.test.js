import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const ROUTES_CATALOG_PATH = join(ROOT, 'docs', 'architecture', 'ROUTES_CATALOG.md');

test('ROUTES_CATALOG.md exists', async () => {
  const st = await stat(ROUTES_CATALOG_PATH);
  assert.ok(st.isFile(), 'docs/architecture/ROUTES_CATALOG.md must exist');
});

test('ROUTES_CATALOG.md documents required route architecture posture', async () => {
  const catalog = await readFile(ROUTES_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'v0.57.0',
    'Native Node.js 20+ ESM',
    'native http',
    'zero-framework',
    'file-backed JSON source of truth',
    'server/router.js',
    'routes[]',
    'createRouter',
    'matchPath',
    'isValidId',
    'Route Definition Format',
    'Global Middleware vs Route-Specific Middleware',
    'requireAuth',
    'requireRole',
    'requireAdmin',
    'requireCapability',
    'Public Routes',
    'Auth Routes',
    'Job Routes',
    'Application Routes',
    'Attendance Routes',
    'Notification / SSE Routes',
    'Message / Workroom Routes',
    'Direct Offer',
    'Admin Core Routes',
    'Admin Queue / Alert Delivery Routes',
    'Admin Production Ops Routes',
    'Admin Scale / Storage / Externalization Routes',
    'Admin Phase 60 / Phase 61 Routes',
    'Admin Governance / Privacy / RBAC Routes',
    'Route Capability Matrix',
    'Read / Write / SSE / Download Classification',
    'Read-only Replica Route Posture',
    'Maintenance Mode Route Posture',
    'Source Collections and Derived Artifacts',
    'Route Risks and Invariants',
    'Final Safety Position',
    'no Express',
    'no PostgreSQL',
    'no Redis',
    'no external queue',
    'no external search',
    'documentation-only',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `ROUTES_CATALOG.md must include required phrase: ${phrase}`
    );
  }
});

test('ROUTES_CATALOG.md documents representative public/protected/admin routes', async () => {
  const catalog = await readFile(ROUTES_CATALOG_PATH, 'utf-8');

  const requiredRoutes = [
    'GET  /api/health',
    'GET  /api/config',
    'GET  /api/docs',
    'POST /api/auth/send-otp',
    'POST /api/auth/verify-otp',
    'GET  /api/auth/me',
    'PUT    /api/auth/profile',
    'POST /api/jobs',
    'GET  /api/jobs',
    'GET  /api/jobs/live-feed',
    'POST /api/jobs/:id/instant-accept',
    'GET  /api/workrooms',
    'POST   /api/direct-offers',
    'GET  /api/admin/stats',
    'GET  /api/admin/audit-log/export',
    'GET  /api/admin/ops-queue/stats',
    'GET  /api/admin/production/readiness',
    'GET  /api/admin/externalization/decision',
    'GET  /api/admin/phase61/evidence',
    'GET /api/admin/rbac/matrix',
  ];

  for (const route of requiredRoutes) {
    assert.ok(
      catalog.includes(route),
      `ROUTES_CATALOG.md must document representative route: ${route}`
    );
  }
});

test('ROUTES_CATALOG.md preserves query token and advisory-only warnings', async () => {
  const catalog = await readFile(ROUTES_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'Query token auth is intentionally limited to direct-download endpoints.',
    'Do not broaden query-token admin auth.',
    'Phase 59/60/61 externalization routes are advisory/evidence/control surfaces only.',
    'No external DB/search/queue is implemented.',
    'No runtime repository switching is enabled.',
    'No pilot is allowed by default.',
    'ROUTES_CATALOG.md does not authorize externalization.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `ROUTES_CATALOG.md must preserve warning: ${phrase}`
    );
  }
});

test('ROUTES_CATALOG.md preserves final safety position', async () => {
  const catalog = await readFile(ROUTES_CATALOG_PATH, 'utf-8');

  const requiredSafetyLines = [
    'No runtime change.',
    'No deletion.',
    'No reset.',
    'No confirmed mutation.',
    'No production queue mutation.',
    'No scheduler mutation.',
    'No PM2 restart/start/save.',
    'No index repair execution.',
    'No notification quarantine execution.',
    'No migration execution.',
    'No router refactor.',
    'No middleware refactor.',
    'No handler rewrite.',
    'No service rewrite.',
    'No auth weakening.',
    'No RBAC weakening.',
    'No EventBus refactor.',
    'No SSE fanout implementation.',
    'No external pub/sub.',
    'No externalization.',
    'No PostgreSQL.',
    'No Redis.',
    'No external queue.',
    'No external search.',
    'No new dependencies.',
    'No version/cache change.',
  ];

  for (const line of requiredSafetyLines) {
    assert.ok(
      catalog.includes(line),
      `ROUTES_CATALOG.md must preserve final safety position: ${line}`
    );
  }
});

test('ROUTES_CATALOG.md links PROJECT_MAP.md as repository-level route/handler/service source tree companion map', async () => {
  const catalog = await readFile(ROUTES_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'docs/architecture/PROJECT_MAP.md',
    'PROJECT_MAP.md maps where route registry, handlers, services, tests, and docs live in the repository.',
    'PROJECT_MAP.md is the repository-level route/handler/service source tree companion map.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `ROUTES_CATALOG.md must link project map phrase: ${phrase}`
    );
  }
});
