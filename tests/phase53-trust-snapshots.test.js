import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/trustCalibration.js';

test('Phase 53 trust snapshots: safe snapshot id is deterministic', () => {
  const id = _testHelpers.safeUserSnapshotId('usr_abc123', '2026-05-11');
  assert.equal(id, 'tsv2_usr_abc123_2026-05-11');
});

test('Phase 53 trust snapshots: monthKey extracts YYYY-MM', () => {
  assert.equal(_testHelpers.monthKey('2026-05-11T12:00:00.000Z'), '2026-05');
});

test('Phase 53 trust snapshots: dateKey extracts YYYY-MM-DD', () => {
  assert.equal(_testHelpers.dateKey('2026-05-11T12:00:00.000Z'), '2026-05-11');
});

test('Phase 53 trust snapshots: snapshot path contains monthly directory', () => {
  const p = _testHelpers.snapshotPath('tsv2_usr_x_2026-05-11', '2026-05-11T00:00:00.000Z');
  assert.ok(p.includes('trust-v2-snapshots'));
  assert.ok(p.includes('2026-05'));
  assert.ok(p.endsWith('tsv2_usr_x_2026-05-11.json'));
});
