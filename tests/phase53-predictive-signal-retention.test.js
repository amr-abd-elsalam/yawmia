import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/predictiveSignalRetention.js';

test('Phase 53 predictive retention: resolved status detection', () => {
  assert.equal(_testHelpers.isResolved({ status: 'dismissed' }), true);
  assert.equal(_testHelpers.isResolved({ status: 'escalated' }), true);
  assert.equal(_testHelpers.isResolved({ status: 'false_positive' }), true);
  assert.equal(_testHelpers.isResolved({ status: 'confirmed' }), true);
  assert.equal(_testHelpers.isResolved({ status: 'active' }), false);
});

test('Phase 53 predictive retention: retention basis priority', () => {
  const signal = {
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    reviewedAt: '2026-01-03T00:00:00.000Z',
    outcomeAt: '2026-01-04T00:00:00.000Z',
  };

  assert.equal(_testHelpers.retentionBasis(signal), '2026-01-04T00:00:00.000Z');
});

test('Phase 53 predictive retention: monthKey extracts YYYY-MM', () => {
  assert.equal(_testHelpers.monthKey('2026-05-10T12:00:00.000Z'), '2026-05');
});

test('Phase 53 predictive retention: archive path points to predictive-signal-archives', () => {
  const p = _testHelpers.archivePath('2026-05');
  assert.ok(p.includes('predictive-signal-archives'));
  assert.ok(p.endsWith('2026-05.json'));
});
