import test from 'node:test';
import assert from 'node:assert/strict';

import {
  markSignalFalsePositive,
  markSignalConfirmed,
} from '../server/services/predictiveAbuse.js';
import {
  getPredictivePrecisionStats,
} from '../server/services/predictiveSignalRetention.js';

test('Phase 53 predictive lifecycle: false-positive and confirmed exports exist', () => {
  assert.equal(typeof markSignalFalsePositive, 'function');
  assert.equal(typeof markSignalConfirmed, 'function');
});

test('Phase 53 predictive precision: stats export exists', () => {
  assert.equal(typeof getPredictivePrecisionStats, 'function');
});
