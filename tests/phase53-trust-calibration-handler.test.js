import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleAdminTrustCalibrationDashboard,
  handleAdminTrustSnapshots,
  handleAdminRunTrustSnapshotBatch,
  handleAdminRunTrustCalibrationReport,
  handleAdminPredictivePrecision,
  handleAdminRunPredictiveSignalRetention,
  handleAdminMarkPredictiveFalsePositive,
  handleAdminMarkPredictiveConfirmed,
} from '../server/handlers/trustCalibrationHandler.js';

test('Phase 53 trust calibration handlers are exported', () => {
  assert.equal(typeof handleAdminTrustCalibrationDashboard, 'function');
  assert.equal(typeof handleAdminTrustSnapshots, 'function');
  assert.equal(typeof handleAdminRunTrustSnapshotBatch, 'function');
  assert.equal(typeof handleAdminRunTrustCalibrationReport, 'function');
});

test('Phase 53 predictive precision handlers are exported', () => {
  assert.equal(typeof handleAdminPredictivePrecision, 'function');
  assert.equal(typeof handleAdminRunPredictiveSignalRetention, 'function');
  assert.equal(typeof handleAdminMarkPredictiveFalsePositive, 'function');
  assert.equal(typeof handleAdminMarkPredictiveConfirmed, 'function');
});
