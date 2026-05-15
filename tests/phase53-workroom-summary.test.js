import test from 'node:test';
import assert from 'node:assert/strict';

import { getWorkroomSummary } from '../server/services/workroom.js';

test('Phase 53 workroom summary: service export exists', () => {
  assert.equal(typeof getWorkroomSummary, 'function');
});
