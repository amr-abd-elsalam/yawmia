import test from 'node:test';
import assert from 'node:assert/strict';

import config from '../config.js';

test('Phase 53 config includes new database dirs', () => {
  const dirs = config.DATABASE.dirs;

  assert.equal(dirs.workroom_receipts, 'workrooms/receipts');
  assert.equal(dirs.workroom_pins, 'workrooms/pins');
  assert.equal(dirs.workroom_checklists, 'workrooms/checklists');
  assert.equal(dirs.workroom_search_indexes, 'workrooms/search-indexes');
  assert.equal(dirs.workroom_template_metrics, 'metrics/workroom-template-usage');
  assert.equal(dirs.trust_calibration, 'metrics/trust-calibration');
  assert.equal(dirs.predictive_signal_archives, 'metrics/predictive-signal-archives');
});

test('Phase 53 config includes new feature sections', () => {
  assert.equal(config.NOTIFICATION_ACTIONS.enabled, true);
  assert.equal(config.PROFILE_TASKS.enabled, true);
  assert.equal(config.WORKROOM_V2.enabled, true);
  assert.equal(config.TRUST_CALIBRATION.enabled, true);
  assert.equal(config.PREDICTIVE_SIGNAL_RETENTION.enabled, true);
});
