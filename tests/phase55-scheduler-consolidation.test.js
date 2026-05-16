import test from 'node:test';
import assert from 'node:assert/strict';

import { _testHelpers } from '../server/services/schedulerRegistry.js';

test('Phase 55: scheduler default definitions include scale hygiene jobs', () => {
  const defs = _testHelpers.defaultDefinitions();
  const names = defs.map(d => d.name);

  assert.equal(names.includes('queue_compaction'), true);
  assert.equal(names.includes('workroom_hygiene_compaction'), true);
  assert.equal(names.includes('workroom_attachment_cleanup'), true);
  assert.equal(names.includes('trust_snapshot_rollup'), true);
  assert.equal(names.includes('predictive_archive_index_rebuild'), true);
  assert.equal(names.includes('audit_token_compaction'), true);
  assert.equal(names.includes('scheduler_history_cleanup'), true);
});
