import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('storagePressure service is shallow-first and uses fs stat/readdir scanning', async () => {
  const raw = await readFile('server/services/storagePressure.js', 'utf-8');

  assert.ok(raw.includes("from 'node:fs/promises'"));
  assert.ok(raw.includes('readdir'));
  assert.ok(raw.includes('stat'));
  assert.ok(raw.includes('scanFlatJsonDir'));
  assert.ok(raw.includes('getCollectionStorageStats'));
  assert.ok(raw.includes('getImageStorePressureStats'));

  // Ensure the collection scanner is not implemented as listJSON(collection) full parse.
  const scanStart = raw.indexOf('export async function getCollectionStorageStats');
  const scanEnd = raw.indexOf('/**', scanStart + 50);
  const scanBlock = raw.slice(scanStart, scanEnd > scanStart ? scanEnd : scanStart + 5000);

  assert.ok(!scanBlock.includes('listJSON('), 'getCollectionStorageStats should not use listJSON full parse');
});

test('storagePressure service avoids PII previews and only returns relative paths', async () => {
  const raw = await readFile('server/services/storagePressure.js', 'utf-8');

  assert.ok(raw.includes('safeRelative'));
  assert.ok(raw.includes('no file content previews') || raw.includes('no PII') || raw.includes('Avoid PII'));
  assert.ok(!raw.includes('textPreview'));
  assert.ok(!raw.includes('phonePreview'));
});
