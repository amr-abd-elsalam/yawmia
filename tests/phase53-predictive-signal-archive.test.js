import test from 'node:test';
import assert from 'node:assert/strict';

import {
  archiveSignal,
} from '../server/services/predictiveSignalRetention.js';

test('Phase 53 predictive archive: archiveSignal export exists', () => {
  assert.equal(typeof archiveSignal, 'function');
});
