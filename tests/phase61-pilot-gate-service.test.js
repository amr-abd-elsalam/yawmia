import test from 'node:test';
import assert from 'node:assert/strict';

test('Phase 61 pilot gate blocks implementation by default', async () => {
  const svc = await import('../server/services/pilotDecisionGate.js?gate=' + Date.now());

  const evaluation = svc.evaluatePilotBlockers({
    candidate: null,
    selectedCandidates: [],
    externalizationDecision: { status: 'monitor', candidates: [] },
    migrationRehearsal: null,
    rollbackRehearsal: null,
    restoreDrill: null,
    approval: null,
    privacyReview: null,
    hasCriticalOpenIncidents: false,
    hasOverdueCriticalPostmortemActions: false,
  });

  assert.equal(evaluation.pilotAllowed, false);
  assert.equal(evaluation.implementationAllowed, false);
  assert.ok(evaluation.blockers.some(b => b.code === 'CANDIDATE_REQUIRED'));
  assert.ok(evaluation.blockers.some(b => b.code === 'REPEATED_EVIDENCE_REQUIRED'));
  assert.ok(evaluation.blockers.some(b => b.code === 'MIGRATION_REHEARSAL_REQUIRED'));
  assert.ok(evaluation.blockers.some(b => b.code === 'ROLLBACK_REHEARSAL_REQUIRED'));
});

test('Phase 61 pilot gate still keeps implementationAllowed false even if checklist passes', async () => {
  const svc = await import('../server/services/pilotDecisionGate.js?gatepass=' + Date.now());

  const evaluation = svc.evaluatePilotBlockers({
    candidate: 'ops_queue',
    selectedCandidates: ['ops_queue'],
    externalizationDecision: {
      status: 'rehearsal_required',
      candidates: [
        { candidate: 'ops_queue', status: 'rehearsal_required', reasons: ['Repeated critical storage pressure'] },
      ],
    },
    migrationRehearsal: { status: 'passed', ok: true, sourceDataMutated: false, externalDbConnected: false },
    rollbackRehearsal: { status: 'passed', ok: true, sourceDataMutated: false, externalDbConnected: false },
    restoreDrill: { fresh: true, passed: true },
    approval: { id: 'apr_1', status: 'approved' },
    privacyReview: { id: 'opsrev_1', status: 'completed' },
    hasCriticalOpenIncidents: false,
    hasOverdueCriticalPostmortemActions: false,
  });

  assert.equal(evaluation.pilotAllowed, true);
  assert.equal(evaluation.implementationAllowed, false);
  assert.equal(evaluation.blockers.length, 0);
});
