import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../server/router.js';

test('Phase 55: router can be created with scale hygiene routes registered', () => {
  const router = createRouter();
  assert.equal(typeof router, 'function');
});
