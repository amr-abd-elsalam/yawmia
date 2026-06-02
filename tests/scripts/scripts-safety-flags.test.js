import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

const HARDENED_SCRIPTS = [
  'scripts/compact-counters.js',
  'scripts/rebuild-counters.js',
  'scripts/rebuild-audit-index.js',
  'scripts/cleanup-attachments.js',
  'scripts/compact-workrooms.js',
];

const MUST_DEFAULT_DRY_RUN = [
  'scripts/compact-counters.js',
  'scripts/rebuild-counters.js',
  'scripts/rebuild-audit-index.js',
  'scripts/cleanup-attachments.js',
  'scripts/compact-workrooms.js',
];

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

test('hardened scripts support --json, --dry-run, and --confirm', async () => {
  for (const scriptPath of HARDENED_SCRIPTS) {
    const source = await readScript(scriptPath);

    assert.match(source, /--json/, `${scriptPath} must support --json`);
    assert.match(source, /--dry-run/, `${scriptPath} must support --dry-run`);
    assert.match(source, /--confirm/, `${scriptPath} must support --confirm`);
  }
});

test('hardened scripts default to dry-run unless --confirm is present', async () => {
  for (const scriptPath of MUST_DEFAULT_DRY_RUN) {
    const source = await readScript(scriptPath);

    assert.match(
      source,
      /process\.argv\.includes\('--dry-run'\)\s*\|\|\s*!CONFIRM/,
      `${scriptPath} must default to dry-run when --confirm is absent`
    );
  }
});

test('hardened scripts expose mutationPerformed in JSON result', async () => {
  for (const scriptPath of HARDENED_SCRIPTS) {
    const source = await readScript(scriptPath);

    assert.match(
      source,
      /mutationPerformed/,
      `${scriptPath} must include mutationPerformed in its result payload`
    );
  }
});

test('hardened scripts include confirmCommand guidance', async () => {
  for (const scriptPath of HARDENED_SCRIPTS) {
    const source = await readScript(scriptPath);

    assert.match(
      source,
      /confirmCommand/,
      `${scriptPath} must include confirmCommand guidance`
    );
  }
});
