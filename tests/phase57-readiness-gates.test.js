import test from 'node:test';
import assert from 'node:assert/strict';

test('readiness check shape supports Phase 57 recommendation field', async () => {
  const mod = await import('../server/services/productionReadiness.js');

  const classification = mod.classifyReadiness([
    { id: 'a', status: 'pass', message: 'ok' },
    { id: 'b', status: 'warn', message: 'warn', recommendation: 'node scripts/example.js' },
  ]);

  assert.equal(classification.ok, true);
  assert.equal(classification.status, 'warnings');
  assert.equal(classification.summary.pass, 1);
  assert.equal(classification.summary.warn, 1);
  assert.equal(classification.summary.fail, 0);
});
