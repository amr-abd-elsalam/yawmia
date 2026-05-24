import test from 'node:test';
import assert from 'node:assert/strict';

test('Phase 60 externalization decision is advisory and does not allow implementation by default', async () => {
  const mod = await import('../server/services/externalizationDecision.js');

  const report = await mod.getExternalizationDecisionReport({
    pressureSnapshots: [],
    benchmarks: [],
  });

  assert.equal(report.enabled, true);
  assert.equal(report.phase, 60);
  assert.equal(report.implementationAllowed, false);
  assert.equal(report.advisoryOnly, true);
  assert.ok(Array.isArray(report.candidates));
  assert.ok(Array.isArray(report.recommendations));
});

test('one warning does not produce pilot candidate', async () => {
  const mod = await import('../server/services/externalizationDecision.js');

  const report = await mod.getExternalizationDecisionReport({
    pressureSnapshots: [
      {
        id: 'sp_test',
        timestamp: new Date().toISOString(),
        status: 'warning',
        warnings: [{ code: 'queue_pending_warning', message: 'queue pending warning' }],
        criticals: [],
      },
    ],
    benchmarks: [],
  });

  assert.equal(report.implementationAllowed, false);
  assert.equal(report.candidates.some(c => c.status === 'pilot_candidate'), false);
});

test('repeated criticals can recommend rehearsal but not automatic migration', async () => {
  const mod = await import('../server/services/externalizationDecision.js');

  const now = new Date().toISOString();
  const report = await mod.getExternalizationDecisionReport({
    pressureSnapshots: [
      { id: 'sp1', timestamp: now, status: 'critical', warnings: [], criticals: [{ code: 'queue_pending_critical', message: 'queue critical' }] },
      { id: 'sp2', timestamp: now, status: 'critical', warnings: [], criticals: [{ code: 'queue_pending_critical', message: 'queue critical again' }] },
    ],
    benchmarks: [],
  });

  const queue = report.candidates.find(c => c.candidate === 'ops_queue');
  assert.ok(queue);
  assert.equal(queue.status, 'rehearsal_required');
  assert.equal(queue.implementationAllowed, false);
  assert.equal(report.implementationAllowed, false);
});
