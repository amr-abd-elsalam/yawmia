import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const SERVER_CATALOG_PATH = join(ROOT, 'docs', 'architecture', 'SERVER_CATALOG.md');

const REQUIRED_SECTIONS = [
  '# Yawmia Server Catalog',
  '## Purpose',
  '## Runtime Architecture Posture',
  '## Server Entry Point',
  '## Startup Sequence',
  '## Database Initialization Phase',
  '## Migration Phase',
  '## Index Bootstrap Phase',
  '## Router Creation Phase',
  '## Static File Serving Order',
  '## Global Middleware Chain',
  '## Route-Specific Middleware Model',
  '## Router Registry Model',
  '## Route Groups',
  '## Handler Ownership Overview',
  '## Service Listener Bootstrap',
  '## EventBus Bootstrap Notes',
  '## Timers and Intervals',
  '## Queue Worker Lifecycle',
  '## Scheduler Registry Lifecycle',
  '## Process Lock Lifecycle',
  '## SSE / Notification Stream Lifecycle',
  '## Live Feed SSE Lifecycle',
  '## Admin SSE Lifecycle',
  '## Maintenance Mode Guard',
  '## Read-only Replica Guard',
  '## Monitoring / Incident / Alert Lifecycle',
  '## Graceful Shutdown Sequence',
  '## Server-Level Source vs Derived Boundaries',
  '## Server-Level Risks and Invariants',
  '## Review / Testing Surface',
  '## Cross-Links',
  '## Final Safety Position',
];

test('SERVER_CATALOG.md exists', async () => {
  const st = await stat(SERVER_CATALOG_PATH);
  assert.ok(st.isFile(), 'docs/architecture/SERVER_CATALOG.md must exist');
});

test('SERVER_CATALOG.md documents server architecture posture', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'v0.57.0',
    'Native Node.js 20+ ESM',
    'native http',
    'file-backed JSON source of truth',
    'no Express',
    'no PostgreSQL',
    'no Redis',
    'no external queue',
    'no external search',
    'documentation-only',
    'server.js',
    'server/router.js',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SERVER_CATALOG.md must include posture phrase: ${phrase}`
    );
  }
});

test('SERVER_CATALOG.md includes all required sections', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      catalog.includes(section),
      `SERVER_CATALOG.md must include required section: ${section}`
    );
  }
});

test('SERVER_CATALOG.md documents static-before-API and global middleware chain', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'staticMiddleware runs before',
    'timingMiddleware',
    'corsMiddleware',
    'securityMiddleware',
    'requestIdMiddleware',
    'rateLimitMiddleware',
    'maintenanceMiddleware',
    'readOnlyReplicaMiddleware',
    'bodyParserMiddleware',
    'timingMiddleware is first and wraps res.end',
    'corsMiddleware handles OPTIONS early',
    'bodyParserMiddleware runs after rate/maintenance/read-only guards',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SERVER_CATALOG.md must document middleware phrase: ${phrase}`
    );
  }
});

test('SERVER_CATALOG.md documents startup phases', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'initDatabase',
    'runMigrations',
    'search index',
    'query index',
    'createRouter',
    'startup cleanup',
    'queue workers',
    'scheduler registry',
    'server.listen',
    'graceful shutdown handlers',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SERVER_CATALOG.md must document startup phase: ${phrase}`
    );
  }
});

test('SERVER_CATALOG.md documents router listener bootstrap', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'setupNotificationListeners',
    'setupAdMatchListeners',
    'setupCacheInvalidation',
    'setupJobMatching',
    'setupJobAlerts',
    'setupLiveFeedListeners',
    'setupDirectOfferListeners',
    'router.js module import has side effects',
    'Listener order matters for adMatcher before jobMatcher dedup',
    'Direct offer counters are registered before analytics cache invalidation',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SERVER_CATALOG.md must document listener bootstrap phrase: ${phrase}`
    );
  }
});

test('SERVER_CATALOG.md documents runtime lifecycles and safety warnings', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'Queue Worker Lifecycle',
    'Scheduler Registry Lifecycle',
    'Process Lock Lifecycle',
    'SSE / Notification Stream Lifecycle',
    'Admin SSE Lifecycle',
    'Graceful Shutdown Sequence',
    'directOfferCounters.forceFlush',
    'cacheDebouncer.flushPending',
    'EventBus in-memory warning',
    'single-writer discipline',
    'read_only_replica',
    'process locks are guardrails, not distributed consensus',
    'Actual segmented queue files are source of truth',
    'Do not run queue-drain --confirm as remediation',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SERVER_CATALOG.md must document lifecycle/safety phrase: ${phrase}`
    );
  }
});

test('SERVER_CATALOG.md preserves final safety position', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

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
    'No externalization.',
    'No PostgreSQL.',
    'No Redis.',
    'No external queue.',
    'No external search.',
    'No new dependencies.',
    'No version/cache change.',
    'SERVER_CATALOG.md is documentation-only.',
  ];

  for (const line of requiredSafetyLines) {
    assert.ok(
      catalog.includes(line),
      `SERVER_CATALOG.md must preserve final safety position: ${line}`
    );
  }
});

test('SERVER_CATALOG.md links EVENTS_CATALOG.md as EventBus event graph companion catalog', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'docs/architecture/EVENTS_CATALOG.md',
    'EVENTS_CATALOG.md maps the EventBus event graph companion catalog bootstrapped by server/router.js and services.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SERVER_CATALOG.md must link companion events catalog phrase: ${phrase}`
    );
  }
});

test('SERVER_CATALOG.md links ROUTES_CATALOG.md as route registry / route-specific middleware companion catalog', async () => {
  const catalog = await readFile(SERVER_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'docs/architecture/ROUTES_CATALOG.md',
    'ROUTES_CATALOG.md maps the server/router.js route registry, route-specific middleware, handlers, and services.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SERVER_CATALOG.md must link routes catalog phrase: ${phrase}`
    );
  }
});
