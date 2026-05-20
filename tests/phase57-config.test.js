import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';

test('Phase 57 config sections exist and are enabled', () => {
  assert.equal(config.DEPLOYMENT_DISCIPLINE.enabled, true);
  assert.equal(config.FILE_HEALTH.enabled, true);
  assert.equal(config.OPS_GOVERNANCE.enabled, true);
  assert.equal(config.READ_ONLY_REPLICA_GUARD.enabled, true);
  assert.equal(config.INCIDENT_TAXONOMY.enabled, true);
});

test('Phase 57 deployment discipline defaults are safe', () => {
  assert.equal(config.DEPLOYMENT_DISCIPLINE.requirePredeployCheck, true);
  assert.equal(config.DEPLOYMENT_DISCIPLINE.requirePostdeploySmoke, true);
  assert.equal(config.DEPLOYMENT_DISCIPLINE.restoreDrillMaxAgeDays, 7);
  assert.equal(config.DEPLOYMENT_DISCIPLINE.requireQueueHealthyInProduction, true);
});

test('Phase 57 file health config has bounded scan settings', () => {
  assert.equal(config.FILE_HEALTH.jsonParseCheckEnabled, true);
  assert.equal(config.FILE_HEALTH.zeroByteJsonIsCritical, true);
  assert.ok(config.FILE_HEALTH.maxFilesPerScan >= 1000);
  assert.ok(config.FILE_HEALTH.batchSize > 0);
});
