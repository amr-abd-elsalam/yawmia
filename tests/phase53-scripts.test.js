import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';

const scripts = [
  '../scripts/rebuild-workroom-search.js',
  '../scripts/run-trust-calibration.js',
  '../scripts/compact-predictive-signals.js',
];

test('Phase 53 scripts exist and are ESM executable scripts', async () => {
  for (const script of scripts) {
    const url = new URL(script, import.meta.url);
    const s = await stat(url);
    assert.equal(s.isFile(), true);

    const src = await readFile(url, 'utf-8');
    assert.match(src, /^#!\/usr\/bin\/env node/);
  }
});
