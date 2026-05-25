import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';

test('Phase 61 config sections exist and are advisory by default', () => {
  assert.equal(config.PHASE61_EVIDENCE_CADENCE.enabled, true);
  assert.equal(config.PHASE61_EVIDENCE_CADENCE.advisoryOnly, true);
  assert.equal(config.PHASE61_EVIDENCE_CADENCE.basePath, 'metrics/phase61-evidence');

  assert.equal(config.PHASE61_PILOT_GATE.enabled, true);
  assert.equal(config.PHASE61_PILOT_GATE.advisoryOnly, true);
  assert.equal(config.PHASE61_PILOT_GATE.implementationAllowedByDefault, false);
  assert.equal(config.PHASE61_PILOT_GATE.maxPilotCandidatesAtOnce, 1);

  assert.equal(config.PHASE61_ROLLBACK_REHEARSAL.enabled, true);
  assert.equal(config.PHASE61_ROLLBACK_REHEARSAL.basePath, 'migration-snapshots/rehearsals/rollback');
  assert.equal(config.PHASE61_ROLLBACK_REHEARSAL.persistReports, true);

  assert.equal(config.REPOSITORY_CONTRACTS.enabled, true);
  assert.equal(config.REPOSITORY_CONTRACTS.docsOnly, true);
  assert.equal(config.REPOSITORY_CONTRACTS.runtimeSwitchEnabled, false);

  assert.ok(config.REPOSITORY_CONTRACTS.candidates.includes('ops_queue'));
  assert.ok(config.REPOSITORY_CONTRACTS.candidates.includes('audit'));
  assert.ok(config.REPOSITORY_CONTRACTS.candidates.includes('images'));
});

test('Phase 61 database dirs are registered', () => {
  assert.equal(config.DATABASE.dirs.phase61_evidence, 'metrics/phase61-evidence');
  assert.equal(config.DATABASE.dirs.rollback_rehearsals, 'migration-snapshots/rehearsals/rollback');
  assert.equal(config.DATABASE.dirs.pilot_decisions, 'metrics/pilot-decisions');
  assert.equal(config.DATABASE.dirs.repository_contract_reports, 'metrics/repository-contracts');
});

test('Phase 61 scheduler jobs are registered but rollback is not enabled by default', () => {
  const jobs = config.SCHEDULER_REGISTRY.jobs;

  assert.equal(jobs.phase61_evidence_capture.enabled, true);
  assert.equal(jobs.phase61_pilot_gate_capture.enabled, true);
  assert.equal(jobs.phase61_rollback_rehearsal.enabled, false);
});
