import test from 'node:test';
import assert from 'node:assert/strict';

import {
  _testHelpers,
} from '../server/services/workroomReceipts.js';

test('Phase 53 workroom receipts: empty receipt shape is valid', () => {
  const r = _testHelpers.emptyReceipt('job_test');
  assert.equal(r.jobId, 'job_test');
  assert.deepEqual(r.messages, {});
  assert.ok(r.createdAt);
  assert.ok(r.updatedAt);
});

test('Phase 53 workroom receipts: receipt path helper is exported for tests', () => {
  const p = _testHelpers.receiptPath('job_test');
  assert.ok(p.includes('workrooms'));
  assert.ok(p.includes('receipts'));
  assert.ok(p.endsWith('job_test.json'));
});
