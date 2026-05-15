import test from 'node:test';
import assert from 'node:assert/strict';

import {
  _testHelpers,
} from '../server/services/workroomSearch.js';

test('Phase 53 workroom search: Arabic tokenizer normalizes common variants', () => {
  const tokens = _testHelpers.tokenize('أنا وصلت للموقع، محتاج توضيح للمكان');
  assert.ok(tokens.includes('انا'));
  assert.ok(tokens.includes('وصلت'));
  assert.ok(tokens.includes('للموقع'));
  assert.ok(tokens.includes('محتاج'));
});

test('Phase 53 workroom search: query normalization works', () => {
  const q = _testHelpers.normalizeQuery('إتصال');
  assert.equal(q, 'اتصال');
});

test('Phase 53 workroom search: preview is capped', () => {
  const text = 'x'.repeat(200);
  const preview = _testHelpers.previewText(text);
  assert.ok(preview.length <= 121);
  assert.ok(preview.endsWith('…'));
});

test('Phase 53 workroom search: empty index shape is valid', () => {
  const idx = _testHelpers.emptyIndex('job_test');
  assert.equal(idx.jobId, 'job_test');
  assert.equal(idx.version, 1);
  assert.deepEqual(idx.tokens, {});
  assert.deepEqual(idx.messageMeta, {});
});
