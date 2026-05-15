import test from 'node:test';
import assert from 'node:assert/strict';

import { handleGetProfileTasks } from '../server/handlers/profileTasksHandler.js';

test('Phase 53 profile tasks handler is exported', () => {
  assert.equal(typeof handleGetProfileTasks, 'function');
});
