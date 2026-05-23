import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateThreshold,
  evaluateCollectionPressure,
  evaluateIndexPressure,
  evaluateQueuePressure,
  evaluateWorkroomPressure,
  evaluateImagePressure,
  evaluateGovernancePressure,
  buildScaleRecommendations,
  getScaleThresholdConfig,
} from '../server/services/scaleThresholds.js';

test('evaluateThreshold returns ok/warning/critical', () => {
  assert.equal(evaluateThreshold(1, 10, 20), 'ok');
  assert.equal(evaluateThreshold(10, 10, 20), 'warning');
  assert.equal(evaluateThreshold(25, 10, 20), 'critical');
});

test('evaluateCollectionPressure detects flat and shard pressure', () => {
  const result = evaluateCollectionPressure({
    users: {
      fileCount: 3,
      largestJsonKB: 12,
      shards: {},
    },
    jobs: {
      fileCount: 4,
      largestJsonKB: 3,
      shards: {
        '2026-05': { fileCount: 9, largestJsonKB: 2 },
      },
    },
  }, {
    users: {
      warningFiles: 2,
      criticalFiles: 5,
      warningLargestJsonKB: 10,
      criticalLargestJsonKB: 20,
    },
    jobs: {
      warningFilesPerShard: 5,
      criticalFilesPerShard: 10,
    },
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some(w => w.code === 'COLLECTION_FILE_COUNT_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'COLLECTION_LARGEST_JSON_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'COLLECTION_SHARD_FILE_COUNT_PRESSURE'));
});

test('evaluateCollectionPressure detects critical shard pressure', () => {
  const result = evaluateCollectionPressure({
    messages: {
      fileCount: 20,
      shards: {
        '2026-05': { fileCount: 100 },
      },
    },
  }, {
    messages: {
      warningFilesPerShard: 10,
      criticalFilesPerShard: 50,
    },
  });

  assert.equal(result.status, 'critical');
  assert.ok(result.criticals.length > 0);
});

test('evaluateIndexPressure detects set index and audit token pressure', () => {
  const result = evaluateIndexPressure({
    setIndexes: [
      { name: 'notifications', sizeKB: 50 },
      { name: 'messages', sizeKB: 200 },
    ],
    auditTokenIndex: {
      fileCount: 120,
      totalSizeKB: 500,
      largestTokenFiles: [],
    },
    searchIndex: {
      sizeKB: 20,
    },
  }, {
    setIndexWarningKB: 100,
    setIndexCriticalKB: 300,
    auditTokenFilesWarning: 100,
    auditTokenFilesCritical: 200,
    searchIndexWarningKB: 10,
    searchIndexCriticalKB: 50,
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some(w => w.code === 'SET_INDEX_SIZE_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'AUDIT_TOKEN_INDEX_FILE_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'SEARCH_INDEX_SIZE_PRESSURE'));
});

test('evaluateQueuePressure detects pending and DLQ pressure', () => {
  const result = evaluateQueuePressure({
    byStatus: {
      pending: 120,
      running: 5,
      'dead-letter': 12,
    },
    summary: {
      lastUpdatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  }, {
    pendingWarning: 100,
    pendingCritical: 500,
    runningWarning: 50,
    runningCritical: 100,
    deadLetterWarning: 10,
    deadLetterCritical: 50,
    staleSummaryWarningMinutes: 30,
    staleSummaryCriticalHours: 6,
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some(w => w.code === 'QUEUE_PENDING_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'QUEUE_DEAD_LETTER_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'QUEUE_SUMMARY_STALE'));
});

test('evaluateWorkroomPressure detects sidecar pressure', () => {
  const result = evaluateWorkroomPressure({
    largestSidecarKB: 900,
    largestSearchIndexKB: 2000,
  }, {
    sidecarWarningKB: 512,
    sidecarCriticalKB: 2048,
    searchIndexWarningKB: 1024,
    searchIndexCriticalKB: 4096,
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some(w => w.code === 'WORKROOM_SIDECAR_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'WORKROOM_SEARCH_INDEX_PRESSURE'));
});

test('evaluateImagePressure detects image store pressure', () => {
  const result = evaluateImagePressure({
    binaryFileCount: 120,
    metaFileCount: 120,
    totalSizeKB: 2 * 1024 * 1024, // 2GB
    largestFileKB: 3 * 1024,      // 3MB
  }, {
    totalSizeWarningMB: 1024,
    totalSizeCriticalMB: 5120,
    largestFileWarningMB: 2,
    largestFileCriticalMB: 10,
    binaryFilesWarning: 100,
    binaryFilesCritical: 500,
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some(w => w.code === 'IMAGE_STORE_SIZE_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'IMAGE_LARGEST_FILE_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'IMAGE_BINARY_FILE_COUNT_PRESSURE'));
});

test('evaluateGovernancePressure detects stale governance records', () => {
  const result = evaluateGovernancePressure({
    privacyRequests: { total: 3, stale: 1 },
    adminApprovals: { total: 6, pending: 6 },
    opsReviews: { total: 0, stale: 1 },
    postmortems: { total: 1, overdue: 2 },
  }, {
    privacy_requests: { warningFiles: 2, criticalFiles: 10 },
    admin_approvals: { warningFiles: 5, criticalFiles: 20 },
    ops_reviews: { warningFiles: 5, criticalFiles: 20 },
    postmortems: { warningFiles: 5, criticalFiles: 20 },
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some(w => w.code === 'GOVERNANCE_RECORD_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'GOVERNANCE_STALE_RECORDS'));
});

test('buildScaleRecommendations creates action-first recommendations', () => {
  const recommendations = buildScaleRecommendations({
    queue: {
      warnings: [{
        level: 'warning',
        code: 'QUEUE_PENDING_PRESSURE',
        message: 'Queue pending jobs pressure detected.',
        scope: 'ops_queue',
        metric: 'pending',
        value: 100,
        threshold: 50,
        recommendation: 'Run queue verification.',
      }],
      criticals: [],
    },
  });

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].severity, 'warning');
  assert.ok(recommendations[0].command.includes('verify-queue'));
});

test('getScaleThresholdConfig exposes advisory defaults', () => {
  const cfg = getScaleThresholdConfig();
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.mode, 'advisory');
  assert.equal(cfg.deepScanDefaultEnabled, false);
});
