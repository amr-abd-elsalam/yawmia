import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/queueWorkers.js';

test('Phase 55: queue worker registers scheduler_history_cleanup handler', () => {
  _testHelpers.registerBuiltIns();

  const keys = Array.from(_testHelpers.handlers.keys());

  assert.equal(keys.includes('scheduler_history_cleanup'), true);
});
