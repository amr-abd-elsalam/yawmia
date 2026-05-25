import test from 'node:test';
import assert from 'node:assert/strict';

test('Phase 61.1: scale thresholds ignore inflated queue counts when summary is unreliable', async () => {
  const mod = await import('../server/services/scaleThresholds.js?' + Date.now());

  const result = mod.evaluateQueuePressure({
    byStatus: {
      pending: 999999,
      running: 999999,
      failed: 0,
      cancelled: 0,
      completed: 0,
      'dead-letter': 0,
    },
    summary: {
      stale: true,
      staleReason: 'status_total_exceeds_location_count',
      mismatchSuspected: true,
      locationCount: 10,
      statusTotal: 1999998,
    },
  }, {
    pendingWarning: 1000,
    pendingCritical: 5000,
    runningWarning: 100,
    runningCritical: 500,
    deadLetterWarning: 10,
    deadLetterCritical: 50,
  });

  assert.equal(result.status, 'warning');
  assert.equal(result.criticals.length, 0);
  assert.ok(result.warnings.some(w => w.code === 'QUEUE_SUMMARY_UNRELIABLE'));

  assert.equal(result.evaluations.pending.rawStatus, 'critical');
  assert.equal(result.evaluations.pending.status, 'ok');
  assert.equal(result.evaluations.pending.ignoredDueToUnreliableSummary, true);
});
