import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'architecture', 'SYSTEMS_CATALOG.md');

const REQUIRED_SYSTEMS = [
  'Auth & Sessions System',
  'Users & Profiles System',
  'Jobs Marketplace System',
  'Applications Lifecycle System',
  'Attendance System',
  'Payments & Receipts System',
  'Ratings & Trust System',
  'Reports & Abuse Review System',
  'Notifications System',
  'Messaging System',
  'Workroom System',
  'SSE / Live Feed / Web Push System',
  'Presence & Instant Match System',
  'Availability Ads / Worker Discovery / Direct Offers System',
  'Search & Relevance System',
  'Analytics & Marketplace Intelligence System',
  'Ops Queue System',
  'Scheduler Registry System',
  'Monitoring / Incidents / Production Ops System',
  'Governance / Privacy / RBAC / Approvals System',
  'Backup / Restore / Migration Evidence System',
  'File-backed Database & Indexing System',
];

const REQUIRED_SECTION_HEADINGS = [
  '### Purpose',
  '### Primary Routes',
  '### Handlers',
  '### Services',
  '### Data Collections',
  '### Events',
  '### Risks',
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSystemSection(catalog, systemName) {
  const headingPattern = new RegExp(
    `## \\d+\\. ${escapeRegExp(systemName)}\\n([\\s\\S]*?)(?=\\n## \\d+\\. |\\n## Cross-System Operational Warnings|$)`
  );

  const match = catalog.match(headingPattern);
  return match ? match[0] : '';
}

test('SYSTEMS_CATALOG.md exists and documents architecture posture', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'v0.57.0',
    'file-backed JSON source of truth',
    'no PostgreSQL',
    'no Redis',
    'no external queue',
    'no external search',
    'Native Node.js 20+ ESM',
    'native http',
    'Vanilla JS frontend',
    'atomic writes',
    'monthly sharding',
    'secondary indexes',
    'filesystem indexes',
    'durable file-backed ops queue',
    'single-writer discipline',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SYSTEMS_CATALOG.md must include architecture posture phrase: ${phrase}`
    );
  }
});

test('SYSTEMS_CATALOG.md documents all required systems', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  for (const systemName of REQUIRED_SYSTEMS) {
    assert.ok(
      catalog.includes(systemName),
      `SYSTEMS_CATALOG.md must document system: ${systemName}`
    );
  }
});

test('each system section includes required architecture inventory headings', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  for (const systemName of REQUIRED_SYSTEMS) {
    const section = extractSystemSection(catalog, systemName);

    assert.ok(
      section,
      `Missing full section for system: ${systemName}`
    );

    for (const heading of REQUIRED_SECTION_HEADINGS) {
      assert.ok(
        section.includes(heading),
        `${systemName} must include heading: ${heading}`
      );
    }
  }
});

test('SYSTEMS_CATALOG.md documents source vs derived data boundary', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'Source vs Derived Data Boundary',
    'source vs derived data boundary',
    'JSON source records are source of truth.',
    'Secondary indexes are derived/rebuildable artifacts.',
    'Filesystem indexes are derived/rebuildable artifacts.',
    'Queue summary/location indexes are derived acceleration artifacts.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SYSTEMS_CATALOG.md must document source/derived boundary phrase: ${phrase}`
    );
  }
});

test('SYSTEMS_CATALOG.md documents queue segmented source-of-truth warning', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'Queue segmented files are source of truth when summary mismatch exists.',
    'Do not treat QUEUE_SUMMARY_MISMATCH as proof that external queue is needed.',
    'Actual segmented queue files are source of truth.',
    'Do not run queue-drain --confirm as remediation.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SYSTEMS_CATALOG.md must document queue warning phrase: ${phrase}`
    );
  }
});

test('SYSTEMS_CATALOG.md links scripts governance and Patch 14 / Patch 15 hardening', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'docs/operations/SCRIPTS_CATALOG.md',
    'Patch 14 repair-indexes hardened.',
    'Patch 15 cleanup-notification-flood hardened.',
    'Scripts governance is green baseline before architecture inventory.',
    'cleanup-notification-flood.js is quarantine-only.',
    'It never deletes notifications.',
    'Hardening does not authorize confirmed execution.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SYSTEMS_CATALOG.md must include scripts governance phrase: ${phrase}`
    );
  }
});

test('SYSTEMS_CATALOG.md preserves advisory-only externalization posture', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'Externalization is advisory-only in Phase 59/60/61.',
    'No external DB/search/queue is implemented.',
    'No runtime repository switching is enabled.',
    'pilotAllowed=false by default',
    'implementationAllowed=false by default',
    'runtimeSwitchEnabled=false',
    'docsOnly=true',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SYSTEMS_CATALOG.md must preserve advisory-only posture: ${phrase}`
    );
  }
});

test('SYSTEMS_CATALOG.md is documentation-only and does not authorize runtime work', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredSafetyLines = [
    'No runtime change.',
    'No deletion.',
    'No reset.',
    'No confirmed mutation.',
    'No production queue mutation.',
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
  ];

  for (const line of requiredSafetyLines) {
    assert.ok(
      catalog.includes(line),
      `SYSTEMS_CATALOG.md must preserve final safety position: ${line}`
    );
  }
});

test('SYSTEMS_CATALOG.md links DATA_CATALOG.md as companion collection-level catalog', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'docs/architecture/DATA_CATALOG.md',
    'Companion collection-level data catalog',
    'SYSTEMS_CATALOG.md maps systems.',
    'DATA_CATALOG.md maps collections, indexes, source/derived boundaries',
    'Together they form the current architecture inventory baseline.',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `SYSTEMS_CATALOG.md must link companion data catalog phrase: ${phrase}`
    );
  }
});
