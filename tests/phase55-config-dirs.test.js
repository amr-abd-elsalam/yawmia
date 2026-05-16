import test from 'node:test';
import assert from 'node:assert/strict';

import config from '../config.js';

test('Phase 55: config includes scale hygiene sections', () => {
  assert.equal(config.QUEUE_STORAGE.enabled, true);
  assert.equal(config.QUEUE_HYGIENE.enabled, true);
  assert.equal(config.WORKROOM_HYGIENE.enabled, true);
  assert.equal(config.TRUST_RETENTION.enabled, true);
  assert.equal(config.PREDICTIVE_ARCHIVE_INDEX.enabled, true);
  assert.equal(config.SCHEDULER_HISTORY.enabled, true);
  assert.equal(config.SCALE_HYGIENE.enabled, true);
});

test('Phase 55: config includes new data directories', () => {
  const dirs = config.DATABASE.dirs;

  assert.equal(dirs.queue_pending, 'ops_queue/pending');
  assert.equal(dirs.queue_running, 'ops_queue/running');
  assert.equal(dirs.queue_completed, 'ops_queue/completed');
  assert.equal(dirs.queue_failed, 'ops_queue/failed');
  assert.equal(dirs.queue_cancelled, 'ops_queue/cancelled');
  assert.equal(dirs.queue_archive, 'ops_queue/archive');
  assert.equal(dirs.scheduler_history, 'scheduler/history');
  assert.equal(dirs.workroom_hygiene, 'metrics/workroom-hygiene');
  assert.equal(dirs.trust_rollups, 'metrics/trust-calibration/rollups');
  assert.equal(dirs.predictive_archive_indexes, 'metrics/predictive-signal-archives/index');
  assert.equal(dirs.scale_hygiene, 'metrics/scale-hygiene');
});
