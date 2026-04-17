// ═══════════════════════════════════════════════════════════════
// tests/indexes.test.js — Secondary Set-Based Index Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Set up temp directory BEFORE importing services
const tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-idx-'));
process.env.YAWMIA_DATA_PATH = tmpDir;

// Import after env setup
const { initDatabase, readSetIndex, writeSetIndex, addToSetIndex, removeFromSetIndex, getFromSetIndex } = await import('../server/services/database.js');

describe('Secondary Set-Based Index Helpers', async () => {
  before(async () => {
    await initDatabase();
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const testIndex = 'applications/test-index.json';

  await it('I-01: getFromSetIndex returns empty array for non-existent key', async () => {
    const result = await getFromSetIndex(testIndex, 'non_existent_key');
    assert.deepStrictEqual(result, []);
  });

  await it('I-02: addToSetIndex adds ID under a key', async () => {
    await addToSetIndex(testIndex, 'key1', 'app_001');
    const result = await getFromSetIndex(testIndex, 'key1');
    assert.deepStrictEqual(result, ['app_001']);
  });

  await it('I-03: addToSetIndex adds multiple IDs to same key', async () => {
    await addToSetIndex(testIndex, 'key1', 'app_002');
    const result = await getFromSetIndex(testIndex, 'key1');
    assert.deepStrictEqual(result, ['app_001', 'app_002']);
  });

  await it('I-04: addToSetIndex does not add duplicate IDs', async () => {
    await addToSetIndex(testIndex, 'key1', 'app_001');
    const result = await getFromSetIndex(testIndex, 'key1');
    assert.deepStrictEqual(result, ['app_001', 'app_002']);
  });

  await it('I-05: Multiple keys are independent', async () => {
    await addToSetIndex(testIndex, 'key2', 'app_003');
    const key1 = await getFromSetIndex(testIndex, 'key1');
    const key2 = await getFromSetIndex(testIndex, 'key2');
    assert.equal(key1.length, 2);
    assert.equal(key2.length, 1);
    assert.deepStrictEqual(key2, ['app_003']);
  });

  await it('I-06: removeFromSetIndex removes ID from key', async () => {
    await removeFromSetIndex(testIndex, 'key1', 'app_001');
    const result = await getFromSetIndex(testIndex, 'key1');
    assert.deepStrictEqual(result, ['app_002']);
  });

  await it('I-07: removeFromSetIndex deletes key when last ID removed', async () => {
    await removeFromSetIndex(testIndex, 'key1', 'app_002');
    const result = await getFromSetIndex(testIndex, 'key1');
    assert.deepStrictEqual(result, []);
    // Verify key is actually deleted from the index
    const index = await readSetIndex(testIndex);
    assert.equal(index['key1'], undefined);
  });

  await it('I-08: removeFromSetIndex handles non-existent key gracefully', async () => {
    // Should not throw
    await removeFromSetIndex(testIndex, 'non_existent_key', 'app_999');
    const result = await getFromSetIndex(testIndex, 'non_existent_key');
    assert.deepStrictEqual(result, []);
  });

  await it('I-09: readSetIndex/writeSetIndex round-trip preserves data', async () => {
    const roundTripIndex = 'applications/roundtrip-index.json';
    const data = { usr_a: ['id_1', 'id_2'], usr_b: ['id_3'] };
    await writeSetIndex(roundTripIndex, data);
    const result = await readSetIndex(roundTripIndex);
    assert.deepStrictEqual(result, data);
  });

  await it('I-10: readSetIndex returns {} for non-existent file', async () => {
    const result = await readSetIndex('applications/does-not-exist.json');
    assert.deepStrictEqual(result, {});
  });
});
