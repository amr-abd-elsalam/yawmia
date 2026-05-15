import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/queueWorkers.js';

test('Phase 53 queue workers: built-in handlers include trust and workroom jobs', () => {
  _testHelpers.registerBuiltIns();

  const handlers = _testHelpers.handlers;

  assert.equal(handlers.has('trust_snapshot_batch'), true);
  assert.equal(handlers.has('trust_calibration_report'), true);
  assert.equal(handlers.has('predictive_signal_retention'), true);
  assert.equal(handlers.has('workroom_search_rebuild'), true);
});

test('Phase 53 queue workers: previous Phase 52 handlers remain registered', () => {
  _testHelpers.registerBuiltIns();

  const handlers = _testHelpers.handlers;

  assert.equal(handlers.has('admin_alert_webhook'), true);
  assert.equal(handlers.has('admin_alert_email'), true);
  assert.equal(handlers.has('audit_csv_export'), true);
  assert.equal(handlers.has('predictive_scan'), true);
  assert.equal(handlers.has('counter_rebuild'), true);
  assert.equal(handlers.has('counter_compaction'), true);
  assert.equal(handlers.has('audit_index_rebuild'), true);
});
