import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/trustCalibration.js';

test('Phase 53 trust calibration: scoreBucket maps scores correctly', () => {
  assert.equal(_testHelpers.scoreBucket(0.1).id, '0_20');
  assert.equal(_testHelpers.scoreBucket(0.35).id, '20_40');
  assert.equal(_testHelpers.scoreBucket(0.55).id, '40_60');
  assert.equal(_testHelpers.scoreBucket(0.75).id, '60_80');
  assert.equal(_testHelpers.scoreBucket(0.95).id, '80_100');
});

test('Phase 53 trust calibration: empty worker outcomes shape is valid', () => {
  const o = _testHelpers.emptyOutcomes('worker');
  assert.equal(o.role, 'worker');
  assert.equal(o.noShows, 0);
  assert.equal(o.successfulCompletions, 0);
  assert.equal(o.successRate, 0);
});

test('Phase 53 trust calibration: empty employer outcomes shape is valid', () => {
  const o = _testHelpers.emptyOutcomes('employer');
  assert.equal(o.role, 'employer');
  assert.equal(o.cancellations, 0);
  assert.equal(o.disputes, 0);
  assert.equal(o.successRate, 0);
});

test('Phase 53 trust calibration: finalizeOutcomeScore computes successRate', () => {
  const o = { positiveEvents: 8, negativeEvents: 2 };
  const out = _testHelpers.finalizeOutcomeScore(o);
  assert.equal(out.successRate, 0.8);
});

test('Phase 53 trust calibration: summarizeBuckets aggregates rows', () => {
  const rows = [
    { score: 0.9, outcomes: { successRate: 0.8, positiveEvents: 8, negativeEvents: 2 } },
    { score: 0.85, outcomes: { successRate: 0.9, positiveEvents: 9, negativeEvents: 1 } },
    { score: 0.3, outcomes: { successRate: 0.2, positiveEvents: 2, negativeEvents: 8 } },
  ];

  const buckets = _testHelpers.summarizeBuckets(rows);
  const high = buckets.find(b => b.bucket === '80_100');
  const low = buckets.find(b => b.bucket === '20_40');

  assert.equal(high.samples, 2);
  assert.equal(low.samples, 1);
  assert.ok(high.avgSuccessRate > low.avgSuccessRate);
});
