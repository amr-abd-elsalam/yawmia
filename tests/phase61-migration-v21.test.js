import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Migration v21 is registered and does not run heavy operations', async () => {
  const raw = await readFile('./server/services/migration.js', 'utf-8');

  assert.match(raw, /version:\s*21/);
  assert.match(raw, /Phase 61: Evidence Cadence, Rollback Rehearsal, and Pilot Decision Gate/);

  const v21Start = raw.indexOf('version: 21');
  assert.ok(v21Start > 0);

  const v21Block = raw.slice(v21Start, raw.indexOf('];', v21Start));

  assert.match(v21Block, /does NOT/i);
  assert.match(v21Block, /run storage pressure scans/i);
  assert.match(v21Block, /run benchmarks/i);
  assert.match(v21Block, /run rollback rehearsals/i);
  assert.match(v21Block, /externalize any data/i);

  assert.doesNotMatch(v21Block, /benchmark-file-paths|measure-storage-pressure|export-migration-snapshot|runMigration|validateMigrationSnapshot/i);
});
