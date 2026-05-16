import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAcceptedApplicationStatus,
  isPendingApplicationStatus,
  isTerminalApplicationStatus,
} from '../server/services/applicationStatus.js';

test('Phase 55: accepted-equivalent application statuses', () => {
  assert.equal(isAcceptedApplicationStatus('accepted'), true);
  assert.equal(isAcceptedApplicationStatus('worker_confirmed'), true);

  assert.equal(isAcceptedApplicationStatus('pending'), false);
  assert.equal(isAcceptedApplicationStatus('rejected'), false);
  assert.equal(isAcceptedApplicationStatus('withdrawn'), false);
  assert.equal(isAcceptedApplicationStatus('worker_declined'), false);
  assert.equal(isAcceptedApplicationStatus(null), false);
  assert.equal(isAcceptedApplicationStatus(undefined), false);
});

test('Phase 55: pending application status helper', () => {
  assert.equal(isPendingApplicationStatus('pending'), true);
  assert.equal(isPendingApplicationStatus('accepted'), false);
  assert.equal(isPendingApplicationStatus('worker_confirmed'), false);
});

test('Phase 55: terminal application status helper', () => {
  assert.equal(isTerminalApplicationStatus('rejected'), true);
  assert.equal(isTerminalApplicationStatus('withdrawn'), true);
  assert.equal(isTerminalApplicationStatus('worker_declined'), true);

  assert.equal(isTerminalApplicationStatus('pending'), false);
  assert.equal(isTerminalApplicationStatus('accepted'), false);
  assert.equal(isTerminalApplicationStatus('worker_confirmed'), false);
});
