import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../server/services/workroomHygiene.js');

test('Phase 55: workroom sidecar warning levels', () => {
  const { sidecarWarning } = mod._testHelpers;

  assert.equal(sidecarWarning(0), 'ok');
  assert.equal(sidecarWarning(100 * 1024), 'ok');
  assert.equal(sidecarWarning(600 * 1024), 'warning');
  assert.equal(sidecarWarning(3 * 1024 * 1024), 'critical');
});
