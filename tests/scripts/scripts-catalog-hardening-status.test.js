import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

const HARDENED_SCRIPTS = [
  'scripts/compact-counters.js',
  'scripts/rebuild-counters.js',
  'scripts/rebuild-audit-index.js',
  'scripts/cleanup-attachments.js',
  'scripts/compact-workrooms.js',
];

test('SCRIPTS_CATALOG.md documents Patch 2 hardened maintenance scripts', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  assert.ok(
    catalog.includes('## Patch 2 Hardening Status — Maintenance Scripts'),
    'catalog must include Patch 2 hardening status section'
  );

  for (const scriptPath of HARDENED_SCRIPTS) {
    const idx = catalog.indexOf(`\`${scriptPath}\``);
    assert.notEqual(idx, -1, `${scriptPath} must be cataloged`);

    const nearby = catalog.slice(Math.max(0, idx - 500), idx + 1200);

    assert.match(
      nearby,
      /dry-run default|Dry Run Default|Hardened/i,
      `${scriptPath} must document dry-run default/hardened status`
    );

    assert.match(
      nearby,
      /confirm/i,
      `${scriptPath} must document confirm requirement`
    );

    assert.match(
      nearby,
      /json/i,
      `${scriptPath} must document json output`
    );
  }
});
