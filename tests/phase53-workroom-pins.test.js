import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/workroomPins.js';

test('Phase 53 workroom pins: empty pins shape is valid', () => {
  const data = _testHelpers.emptyPins('job_test');
  assert.equal(data.jobId, 'job_test');
  assert.deepEqual(data.pins, []);
  assert.ok(data.createdAt);
  assert.ok(data.updatedAt);
});

test('Phase 53 workroom pins: pins path points to workrooms/pins', () => {
  const p = _testHelpers.pinsPath('job_test');
  assert.ok(p.includes('workrooms'));
  assert.ok(p.includes('pins'));
  assert.ok(p.endsWith('job_test.json'));
});

test('Phase 53 workroom pins: employer can pin, worker cannot by default', () => {
  assert.equal(_testHelpers.canPin({ role: 'employer' }), true);
  assert.equal(_testHelpers.canPin({ role: 'worker' }), false);
});

test('Phase 53 workroom pins: public pin shape is safe', () => {
  const pin = {
    id: 'pin_x',
    jobId: 'job_x',
    messageId: 'msg_x',
    pinnedBy: 'usr_emp',
    note: 'important',
    pinnedAt: '2026-01-01T00:00:00.000Z',
  };

  const message = {
    id: 'msg_x',
    senderId: 'usr_emp',
    senderRole: 'employer',
    text: 'تعليمات مهمة',
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'workroom',
  };

  const out = _testHelpers.publicPin(pin, message);
  assert.equal(out.message.text, 'تعليمات مهمة');
  assert.equal(out.note, 'important');
});
