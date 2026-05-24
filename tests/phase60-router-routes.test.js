import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 60 admin routes are registered', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  assert.match(router, /\/api\/admin\/externalization\/decision/);
  assert.match(router, /\/api\/admin\/externalization\/decision\/capture/);
  assert.match(router, /\/api\/admin\/externalization\/decision\/snapshots/);
  assert.match(router, /\/api\/admin\/migration-snapshots\/validate/);
  assert.match(router, /\/api\/admin\/migration-rehearsal\/run/);
  assert.match(router, /\/api\/admin\/benchmarks\/history/);
});
