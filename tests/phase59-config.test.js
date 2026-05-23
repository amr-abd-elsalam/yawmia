import test from 'node:test';
import assert from 'node:assert/strict';

import config from '../config.js';

test('Phase 59 config sections exist and are enabled/advisory-safe', () => {
  assert.ok(config.SCALE_LIMITS, 'SCALE_LIMITS must exist');
  assert.equal(config.SCALE_LIMITS.enabled, true);
  assert.equal(config.SCALE_LIMITS.mode, 'advisory');
  assert.equal(config.SCALE_LIMITS.deepScanDefaultEnabled, false);

  assert.ok(config.STORAGE_PRESSURE, 'STORAGE_PRESSURE must exist');
  assert.equal(config.STORAGE_PRESSURE.enabled, true);
  assert.equal(config.STORAGE_PRESSURE.deepScanEnabled, false);
  assert.ok(config.STORAGE_PRESSURE.basePath.includes('storage-pressure'));

  assert.ok(config.EXTERNALIZATION_READINESS, 'EXTERNALIZATION_READINESS must exist');
  assert.equal(config.EXTERNALIZATION_READINESS.enabled, true);
  assert.equal(config.EXTERNALIZATION_READINESS.noExternalizationBeforePhase, 60);
  assert.equal(config.EXTERNALIZATION_READINESS.ndjsonExportEnabled, true);
  assert.ok(config.EXTERNALIZATION_READINESS.candidates.includes('ops_queue'));
  assert.ok(config.EXTERNALIZATION_READINESS.candidates.includes('audit'));

  assert.ok(config.MULTI_INSTANCE_BOUNDARY, 'MULTI_INSTANCE_BOUNDARY must exist');
  assert.equal(config.MULTI_INSTANCE_BOUNDARY.enabled, true);
  assert.equal(config.MULTI_INSTANCE_BOUNDARY.requireSingleWriterForQueueAndSchedulers, true);
  assert.equal(config.MULTI_INSTANCE_BOUNDARY.eventBusBridgeRequiredForMultiInstance, true);
  assert.equal(config.MULTI_INSTANCE_BOUNDARY.sseFanoutRequiredForMultiInstance, true);
  assert.equal(config.MULTI_INSTANCE_BOUNDARY.externalQueueRequiredForMultiWriter, true);
});

test('Phase 59 database directories are registered', () => {
  assert.equal(config.DATABASE.dirs.storage_pressure, 'metrics/storage-pressure');
  assert.equal(config.DATABASE.dirs.scale_thresholds, 'metrics/scale-thresholds');
  assert.equal(config.DATABASE.dirs.migration_snapshots, 'migration-snapshots');
});

test('Phase 59 thresholds include collection, index, queue, workroom and analytics limits', () => {
  const th = config.SCALE_LIMITS.thresholds;

  assert.ok(th.collections.users.warningFiles > 0);
  assert.ok(th.collections.jobs.warningFilesPerShard > 0);
  assert.ok(th.collections.messages.criticalFilesPerShard > 0);
  assert.ok(th.collections.audit.criticalFiles > 0);
  assert.ok(th.collections.privacy_requests.warningFiles > 0);
  assert.ok(th.collections.admin_approvals.warningFiles > 0);
  assert.ok(th.collections.ops_reviews.warningFiles > 0);
  assert.ok(th.collections.postmortems.warningFiles > 0);

  assert.ok(th.indexes.setIndexWarningKB > 0);
  assert.ok(th.indexes.auditTokenFilesWarning > 0);
  assert.ok(th.indexes.searchIndexWarningKB > 0);

  assert.ok(th.queue.pendingWarning > 0);
  assert.ok(th.queue.deadLetterWarning > 0);
  assert.ok(th.queue.staleSummaryWarningMinutes > 0);

  assert.ok(th.workrooms.sidecarWarningKB > 0);
  assert.ok(th.workrooms.searchIndexWarningKB > 0);

  assert.ok(th.images.totalSizeWarningMB > 0);
  assert.ok(th.images.totalSizeCriticalMB > 0);
  assert.ok(th.images.largestFileWarningMB > 0);
  assert.ok(th.images.binaryFilesWarning > 0);

  assert.ok(th.analytics.searchAnalyticsWarningFiles > 0);
  assert.ok(th.analytics.productIntelligenceWarningFiles > 0);
});

test('read_only_admin has admin.scale.read visibility after Phase 59', () => {
  const caps = config.ADMIN_RBAC.capabilities.read_only_admin || [];
  assert.ok(caps.includes('admin.scale.read'));
});
