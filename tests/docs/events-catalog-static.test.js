import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EVENTS_CATALOG_PATH = join(ROOT, 'docs', 'architecture', 'EVENTS_CATALOG.md');

const REQUIRED_SECTIONS = [
  '# Yawmia Events Catalog',
  '## Purpose',
  '## Runtime Event Architecture Posture',
  '## EventBus Model',
  '## Event Durability Classes',
  '## Listener Bootstrap Order',
  '## Core Event Flow Principles',
  '## Auth / Session Events',
  '## User / Profile Events',
  '## Job Events',
  '## Application Events',
  '## Attendance Events',
  '## Payment Events',
  '## Report / Abuse Events',
  '## Notification Events',
  '## Message / Workroom Events',
  '## Availability Ad Events',
  '## Direct Offer Events',
  '## Instant Match / Presence Events',
  '## Search / Analytics Events',
  '## Trust / Predictive Events',
  '## Queue Events',
  '## Scheduler Events',
  '## Monitoring / Incident / Alert Events',
  '## Governance / Privacy / Approval Events',
  '## SSE Fanout Mapping',
  '## Live Feed Fanout Mapping',
  '## Admin SSE Fanout Mapping',
  '## Web Push Mapping',
  '## Counter / Derived Artifact Events',
  '## Cache Invalidation Events',
  '## Event Risks and Invariants',
  '## Review / Testing Surface',
  '## Cross-Links',
  '## Final Safety Position',
];

test('EVENTS_CATALOG.md exists', async () => {
  const st = await stat(EVENTS_CATALOG_PATH);
  assert.ok(st.isFile(), 'docs/architecture/EVENTS_CATALOG.md must exist');
});

test('EVENTS_CATALOG.md documents required event architecture posture', async () => {
  const catalog = await readFile(EVENTS_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'v0.57.0',
    'Native Node.js 20+ ESM',
    'file-backed JSON source of truth',
    'EventBus',
    'in-memory',
    'single-process',
    'no external pub/sub',
    'no external queue',
    'no Redis',
    'no PostgreSQL',
    'documentation-only',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `EVENTS_CATALOG.md must include posture phrase: ${phrase}`
    );
  }
});

test('EVENTS_CATALOG.md includes all required sections', async () => {
  const catalog = await readFile(EVENTS_CATALOG_PATH, 'utf-8');

  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      catalog.includes(section),
      `EVENTS_CATALOG.md must include required section: ${section}`
    );
  }
});

test('EVENTS_CATALOG.md documents EventBus source and router listener bootstrap', async () => {
  const catalog = await readFile(EVENTS_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'eventBus.js',
    'server/router.js',
    'setupNotificationListeners',
    'setupAdMatchListeners',
    'setupJobMatching',
    'setupJobAlerts',
    'setupLiveFeedListeners',
    'setupDirectOfferListeners',
    'directOfferCounters.applyEventBatched',
    'cacheDebouncer.flushPending',
    'directOfferCounters.forceFlush',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `EVENTS_CATALOG.md must document bootstrap/source phrase: ${phrase}`
    );
  }
});

test('EVENTS_CATALOG.md documents representative event names across domains', async () => {
  const catalog = await readFile(EVENTS_CATALOG_PATH, 'utf-8');

  const requiredEvents = [
    'notification:created',
    'job:created',
    'application:accepted',
    'attendance:checkin',
    'payment:created',
    'message:created',
    'workroom:message_sent',
    'direct_offer:created',
    'direct_offer:accepted',
    'instant_match:candidates',
    'search:performed',
    'abuse_flag:state_changed',
    'predictive_abuse:signal_created',
    'ops_queue:job_dead_lettered',
    'scheduler:stale',
    'ops_slo:violated',
    'incident:opened',
    'admin_approval:created',
    'privacy_request:created',
  ];

  for (const eventName of requiredEvents) {
    assert.ok(
      catalog.includes(eventName),
      `EVENTS_CATALOG.md must document event: ${eventName}`
    );
  }
});

test('EVENTS_CATALOG.md documents fanout and safety sections', async () => {
  const catalog = await readFile(EVENTS_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'SSE Fanout Mapping',
    'Admin SSE Fanout Mapping',
    'Web Push Mapping',
    'Event Risks and Invariants',
    'Final Safety Position',
    'EventBus events are not durable',
    'SSE delivery is best-effort',
    'Web Push delivery is best-effort',
    'No EventBus bridge is implemented',
    'No SSE fanout service is implemented',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `EVENTS_CATALOG.md must document fanout/safety phrase: ${phrase}`
    );
  }
});

test('EVENTS_CATALOG.md links ROUTES_CATALOG.md as route entrypoint / event-trigger companion catalog', async () => {
  const catalog = await readFile(EVENTS_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'docs/architecture/ROUTES_CATALOG.md',
    'ROUTES_CATALOG.md maps route entrypoints that trigger source mutations, derived artifact updates, and EventBus emissions through handlers/services.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `EVENTS_CATALOG.md must link routes catalog phrase: ${phrase}`
    );
  }
});

test('EVENTS_CATALOG.md links PROJECT_MAP.md as repository-level EventBus/fanout source tree companion map', async () => {
  const catalog = await readFile(EVENTS_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'docs/architecture/PROJECT_MAP.md',
    'PROJECT_MAP.md maps where EventBus/fanout-related files live and how to inspect them safely.',
    'PROJECT_MAP.md is the repository-level EventBus/fanout source tree companion map.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `EVENTS_CATALOG.md must link project map phrase: ${phrase}`
    );
  }
});
