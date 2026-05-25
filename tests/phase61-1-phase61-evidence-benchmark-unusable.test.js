import test from 'node:test';
import assert from 'node:assert/strict';

test('Phase 61.1: Phase 61 evidence blocks unusable/corrupt benchmark artifacts', async () => {
  const mod = await import('../server/services/phase61EvidenceCadence.js?' + Date.now());

  const now = new Date().toISOString();

  const latest = {
    storagePressure: { kind: 'storagePressure', status: 'passed', timestamp: now, ageDays: 0 },
    scaleThresholds: { kind: 'scaleThresholds', status: 'passed', timestamp: now, ageDays: 0 },
    benchmark: {
      kind: 'benchmark',
      status: 'failed',
      timestamp: now,
      ageDays: 0,
      evidenceUsable: false,
      corruptionSuspected: true,
      errorCount: 2,
    },
    externalizationDecision: { kind: 'externalizationDecision', status: 'passed', timestamp: now, ageDays: 0 },
    migrationRehearsal: { kind: 'migrationRehearsal', status: 'passed', timestamp: now, ageDays: 0 },
    rollbackRehearsal: { kind: 'rollbackRehearsal', status: 'passed', timestamp: now, ageDays: 0 },
    weeklyOpsReview: { kind: 'weeklyOpsReview', status: 'passed', timestamp: now, ageDays: 0 },
    restoreDrill: { kind: 'restoreDrill', status: 'passed', timestamp: now, ageDays: 0 },
  };

  const result = mod.evaluateEvidenceFreshness(latest);

  assert.equal(result.status, 'critical');
  assert.ok(result.blockers.some(b => b.code === 'benchmark_failed_or_critical'));
  assert.ok(result.blockers.some(b => b.code === 'benchmark_not_usable_as_evidence'));
});
