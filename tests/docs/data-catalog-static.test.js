import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const DATA_CATALOG_PATH = join(ROOT, 'docs', 'architecture', 'DATA_CATALOG.md');

const REQUIRED_SECTIONS = [
  '# Yawmia Data Catalog',
  '## Purpose',
  '## Data Architecture Posture',
  '## Global Source vs Derived Data Rules',
  '## Sharding Model',
  '## Atomic Write Model',
  '## Indexing Model',
  '## Privacy Sensitivity Classes',
  '## Source Collections',
  '## Derived Indexes and Rebuildable Artifacts',
  '## Queue Storage Model',
  '## Metrics / Evidence Artifacts',
  '## Governance / Privacy Artifacts',
  '## Migration / Rehearsal Artifacts',
  '## Image/Object Store Boundary',
  '## Collection Ownership Matrix',
  '## Repair / Rebuild Tooling Matrix',
  '## Collection-Level Risks',
  '## Cross-Links',
  '## Final Safety Position',
];

const REQUIRED_COLLECTIONS = [
  'users',
  'sessions',
  'jobs',
  'applications',
  'otp',
  'notifications',
  'ratings',
  'payments',
  'reports',
  'verifications',
  'attendance',
  'audit',
  'messages',
  'push_subscriptions',
  'alerts',
  'metrics',
  'favorites',
  'images',
  'availability_windows',
  'instant_matches',
  'availability_ads',
  'direct_offers',
  'abuse_flag_reviews',
  'audit_indexes',
  'exports',
  'counter_archives',
  'predictive_signals',
  'workrooms',
  'trust_snapshots',
  'ops_queue',
  'ops_queue_idempotency',
  'ops_queue_dead_letter',
  'alert_deliveries',
  'queue_metrics',
  'workroom_receipts',
  'workroom_pins',
  'workroom_checklists',
  'workroom_search_indexes',
  'workroom_template_metrics',
  'trust_calibration',
  'predictive_signal_archives',
  'ops_locks',
  'scheduler',
  'ops_rollups',
  'incidents',
  'backup_restore_drills',
  'ops',
  'privacy_requests',
  'ops_reviews',
  'postmortems',
  'admin_approvals',
  'queue_pending',
  'queue_running',
  'queue_completed',
  'queue_failed',
  'queue_cancelled',
  'queue_archive',
  'scheduler_history',
  'workroom_hygiene',
  'trust_rollups',
  'predictive_archive_indexes',
  'scale_hygiene',
  'search_analytics',
  'product_intelligence',
  'matching_metrics',
  'payment_dispute_analytics',
  'storage_pressure',
  'scale_thresholds',
  'migration_snapshots',
  'benchmark_history',
  'migration_rehearsals',
  'externalization_decisions',
  'phase61_evidence',
  'rollback_rehearsals',
  'pilot_decisions',
  'repository_contract_reports',
];

const REQUIRED_INDEX_FILES = [
  'users/phone-index.json',
  'jobs/index.json',
  'applications/worker-index.json',
  'applications/job-index.json',
  'notifications/user-index.json',
  'jobs/employer-index.json',
  'payments/job-index.json',
  'reports/target-index.json',
  'reports/reporter-index.json',
  'verifications/user-index.json',
  'attendance/job-index.json',
  'attendance/worker-index.json',
  'messages/job-index.json',
  'messages/user-index.json',
  'push_subscriptions/user-index.json',
  'alerts/user-index.json',
  'favorites/user-index.json',
  'availability_ads/worker-index.json',
  'direct_offers/employer-index.json',
  'direct_offers/worker-index.json',
];

const REQUIRED_SHARDED_COLLECTIONS = [
  'jobs',
  'applications',
  'notifications',
  'attendance',
  'messages',
  'ratings',
  'payments',
  'instant_matches',
  'availability_ads',
  'direct_offers',
];

test('DATA_CATALOG.md exists', async () => {
  const st = await stat(DATA_CATALOG_PATH);
  assert.ok(st.isFile(), 'docs/architecture/DATA_CATALOG.md must exist');
});

test('DATA_CATALOG.md documents required data architecture posture', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'v0.57.0',
    'file-backed JSON source of truth',
    'no PostgreSQL',
    'no Redis',
    'no external queue',
    'no external search',
    'Native Node.js 20+ ESM',
    'atomic writes',
    'unique temp-file writes',
    'monthly sharding',
    'secondary indexes',
    'filesystem indexes',
    'segmented queue storage',
    'single-writer discipline',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `DATA_CATALOG.md must include architecture posture phrase: ${phrase}`
    );
  }
});

test('DATA_CATALOG.md documents global source vs derived rules', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'JSON source records are source of truth',
    'Secondary indexes are derived/rebuildable artifacts',
    'Filesystem search indexes are derived/rebuildable artifacts',
    'Queue segmented files are source of truth when summary mismatch exists',
    'Queue summary/location indexes are derived acceleration artifacts',
    'Metrics snapshots and rollups are evidence artifacts',
    'Migration snapshots and rehearsal reports are evidence artifacts',
    'Review bundles are not source of truth',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `DATA_CATALOG.md must document source/derived rule: ${phrase}`
    );
  }
});

test('DATA_CATALOG.md documents queue source-of-truth warnings', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'Do not treat QUEUE_SUMMARY_MISMATCH as proof that external queue is needed',
    'Actual segmented queue files are source of truth',
    'Do not run queue-drain --confirm as remediation',
    'Do not run repair-queue --confirm without dry-run evidence and explicit approval',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `DATA_CATALOG.md must document queue warning: ${phrase}`
    );
  }
});

test('DATA_CATALOG.md documents notification flood and repair-indexes hardening warnings', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'cleanup-notification-flood.js is quarantine-only',
    'It never deletes notifications',
    'Confirmed mode moves notification source files to quarantine and updates notifications/user-index.json',
    'repair-indexes.js rebuilds derived secondary indexes only',
    'sourceDataMutated:false',
    'It must remain dry-run-first',
    'Confirmed index repair requires explicit approval',
  ];

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `DATA_CATALOG.md must document hardening warning: ${phrase}`
    );
  }
});

test('DATA_CATALOG.md includes all required sections', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      catalog.includes(section),
      `DATA_CATALOG.md must include required section: ${section}`
    );
  }
});

test('DATA_CATALOG.md includes required collections and artifact groups', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  for (const collection of REQUIRED_COLLECTIONS) {
    assert.ok(
      catalog.includes(collection),
      `DATA_CATALOG.md must include collection/artifact group: ${collection}`
    );
  }
});

test('DATA_CATALOG.md includes all core secondary index files', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  for (const indexFile of REQUIRED_INDEX_FILES) {
    assert.ok(
      catalog.includes(indexFile),
      `DATA_CATALOG.md must include index file: ${indexFile}`
    );
  }
});

test('DATA_CATALOG.md includes sharded collections', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  for (const collection of REQUIRED_SHARDED_COLLECTIONS) {
    assert.ok(
      catalog.includes(collection),
      `DATA_CATALOG.md must include sharded collection: ${collection}`
    );
  }

  assert.ok(
    catalog.includes('config.SHARDING.enabled=true'),
    'DATA_CATALOG.md must document config.SHARDING.enabled=true'
  );

  assert.ok(
    catalog.includes('config.SHARDING.strategy=monthly'),
    'DATA_CATALOG.md must document monthly sharding strategy'
  );
});

test('DATA_CATALOG.md includes privacy sensitivity classes', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  const classes = [
    'Public-safe',
    'Internal',
    'PII',
    'Sensitive PII',
    'Financial',
    'Auth-sensitive',
    'Operational',
    'Governance-sensitive',
    'Evidence artifact',
    'Derived artifact',
  ];

  for (const cls of classes) {
    assert.ok(
      catalog.includes(cls),
      `DATA_CATALOG.md must include privacy sensitivity class: ${cls}`
    );
  }
});

test('DATA_CATALOG.md includes repair/rebuild tooling matrix and final safety position', async () => {
  const catalog = await readFile(DATA_CATALOG_PATH, 'utf-8');

  const requiredPhrases = [
    'Repair / Rebuild Tooling Matrix',
    'scripts/repair-indexes.js',
    'scripts/cleanup-notification-flood.js',
    'scripts/repair-queue.js',
    'scripts/queue-drain.js',
    'Final Safety Position',
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

  for (const phrase of requiredPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `DATA_CATALOG.md must include tooling/safety phrase: ${phrase}`
    );
  }
});
