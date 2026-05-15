import test from 'node:test';
import assert from 'node:assert/strict';

import {
  _testHelpers,
} from '../server/services/workroomTemplateMetrics.js';

test('Phase 53 workroom template metrics: empty metrics shape is valid', () => {
  const m = _testHelpers.emptyMetrics();

  assert.equal(m.id, 'workroom-template-usage');
  assert.equal(m.version, 1);
  assert.equal(m.total, 0);
  assert.deepEqual(m.byTemplateKey, {});
  assert.deepEqual(m.byDay, {});
  assert.ok(m.createdAt);
  assert.ok(m.updatedAt);
});

test('Phase 53 workroom template metrics: normalizeRole handles supported roles', () => {
  assert.equal(_testHelpers.normalizeRole('worker'), 'worker');
  assert.equal(_testHelpers.normalizeRole('employer'), 'employer');
  assert.equal(_testHelpers.normalizeRole('admin'), 'unknown');
  assert.equal(_testHelpers.normalizeRole(null), 'unknown');
});

test('Phase 53 workroom template metrics: safeTemplateKey accepts simple keys', () => {
  assert.equal(_testHelpers.safeTemplateKey('worker_0'), 'worker_0');
  assert.equal(_testHelpers.safeTemplateKey('employer-template-1'), 'employer-template-1');
});

test('Phase 53 workroom template metrics: safeTemplateKey rejects unsafe keys', () => {
  assert.equal(_testHelpers.safeTemplateKey('../x'), '');
  assert.equal(_testHelpers.safeTemplateKey('bad key'), '');
  assert.equal(_testHelpers.safeTemplateKey('<script>'), '');
});

test('Phase 53 workroom template metrics: toEgyptDate returns YYYY-MM-DD', () => {
  const d = _testHelpers.toEgyptDate('2026-05-10T22:30:00.000Z');
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test('Phase 53 workroom template metrics: metrics path points to metrics/workroom-template-usage', () => {
  const p = _testHelpers.metricsPath();
  assert.ok(p.includes('metrics'));
  assert.ok(p.includes('workroom-template-usage'));
  assert.ok(p.endsWith('workroom-template-usage.json'));
});
