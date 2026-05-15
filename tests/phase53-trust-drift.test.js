import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/trustCalibration.js';

test('Phase 53 trust drift: no warnings when score and success are close', () => {
  const warnings = _testHelpers.detectTrustDriftFromBuckets([
    {
      bucket: '80_100',
      label: '80-100',
      samples: 20,
      avgScore: 0.85,
      avgSuccessRate: 0.8,
      totalPositive: 16,
      totalNegative: 4,
    },
  ], 0.15);

  assert.equal(warnings.length, 0);
});

test('Phase 53 trust drift: warning when score and success diverge', () => {
  const warnings = _testHelpers.detectTrustDriftFromBuckets([
    {
      bucket: '80_100',
      label: '80-100',
      samples: 20,
      avgScore: 0.9,
      avgSuccessRate: 0.55,
      totalPositive: 11,
      totalNegative: 9,
    },
  ], 0.15);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].bucket, '80_100');
  assert.ok(warnings[0].delta >= 0.15);
});

test('Phase 53 trust drift: high severity when delta is large', () => {
  const warnings = _testHelpers.detectTrustDriftFromBuckets([
    {
      bucket: '60_80',
      label: '60-80',
      samples: 25,
      avgScore: 0.75,
      avgSuccessRate: 0.25,
      totalPositive: 5,
      totalNegative: 20,
    },
  ], 0.15);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].severity, 'high');
});
