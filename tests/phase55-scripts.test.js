import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';

const scripts = [
  'scripts/compact-queue.js',
  'scripts/verify-queue.js',
  'scripts/repair-queue.js',
  'scripts/compact-workrooms.js',
  'scripts/verify-workroom-indexes.js',
  'scripts/cleanup-attachments.js',
  'scripts/rollup-trust-snapshots.js',
  'scripts/rebuild-predictive-archive-index.js',
];

test('Phase 55: operational scripts exist', async () => {
  for (const path of scripts) {
    const exists = await stat(new URL('../' + path, import.meta.url)).then(s => s.isFile()).catch(() => false);
    assert.equal(exists, true, `${path} should exist`);
  }
});
