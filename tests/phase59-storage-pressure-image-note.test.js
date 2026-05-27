import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('data migration formats document image/object reference constraints', async () => {
  const raw = await readFile('docs/operations/DATA_MIGRATION_FORMATS.md', 'utf-8');

  assert.ok(raw.includes('Image / object references'));
  assert.ok(raw.includes('Do not inline base64'));
  assert.ok(raw.includes('imageRef'));
  assert.ok(raw.includes('external object storage'));
});

test('externalization readiness includes images as Phase 60+ candidate but not implementation', async () => {
  const raw = await readFile('docs/operations/EXTERNALIZATION_READINESS.md', 'utf-8');

  assert.ok(raw.includes('images'));
  assert.ok(raw.includes('external object storage'));
  assert.ok(raw.includes('Do not implement PostgreSQL in Phase 59.'));
  assert.ok(raw.includes('Do not add external queue in Phase 59.'));
});
