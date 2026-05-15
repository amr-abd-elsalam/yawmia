import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/workroomChecklist.js';

test('Phase 53 workroom checklist: empty checklist shape is valid', () => {
  const data = _testHelpers.emptyChecklist('job_test');
  assert.equal(data.jobId, 'job_test');
  assert.deepEqual(data.items, []);
  assert.ok(data.createdAt);
  assert.ok(data.updatedAt);
});

test('Phase 53 workroom checklist: publicChecklist aggregates counts', () => {
  const data = {
    jobId: 'job_test',
    items: [
      { id: 'chk_1', status: 'open' },
      { id: 'chk_2', status: 'completed' },
      { id: 'chk_3', status: 'open' },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const out = _testHelpers.publicChecklist(data);
  assert.equal(out.total, 3);
  assert.equal(out.completed, 1);
  assert.equal(out.open, 2);
});

test('Phase 53 workroom checklist: employer can create/delete', () => {
  assert.equal(_testHelpers.canCreateOrDelete({ role: 'employer' }), true);
  assert.equal(_testHelpers.canCreateOrDelete({ role: 'worker' }), false);
});

test('Phase 53 workroom checklist: worker can complete open/unassigned item', () => {
  const access = { role: 'worker' };
  const item = { assignedTo: null };
  assert.equal(_testHelpers.canCompleteItem(access, item, 'usr_worker'), true);
});

test('Phase 53 workroom checklist: worker can complete assigned item only if assigned to them', () => {
  const access = { role: 'worker' };

  assert.equal(
    _testHelpers.canCompleteItem(access, { assignedTo: 'usr_worker' }, 'usr_worker'),
    true
  );

  assert.equal(
    _testHelpers.canCompleteItem(access, { assignedTo: 'usr_other' }, 'usr_worker'),
    false
  );
});

test('Phase 53 workroom checklist: employer can complete any item', () => {
  const access = { role: 'employer' };
  assert.equal(
    _testHelpers.canCompleteItem(access, { assignedTo: 'usr_worker' }, 'usr_emp'),
    true
  );
});
