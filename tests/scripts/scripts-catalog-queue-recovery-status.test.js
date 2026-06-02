import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

const QUEUE_RECOVERY_SCRIPTS = [
  'scripts/queue-drain.js',
  'scripts/queue-retry-dlq.js',
  'scripts/recover-stale-running-jobs.js',
  'scripts/quarantine-corrupt-json.js',
];

function extractSection(catalog, heading) {
  const start = catalog.indexOf(heading);
  assert.notEqual(start, -1, `Missing section: ${heading}`);

  const rest = catalog.slice(start + heading.length);
  const next = rest.search(/\n## /);

  if (next === -1) return rest;
  return rest.slice(0, next);
}

test('SCRIPTS_CATALOG.md documents Patch 4 queue/recovery safety status', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');
  const section = extractSection(catalog, '## Patch 4 Queue / Recovery Safety Status');

  for (const scriptPath of QUEUE_RECOVERY_SCRIPTS) {
    assert.ok(
      section.includes(`\`${scriptPath}\``),
      `${scriptPath} must be listed in Patch 4 queue/recovery safety status`
    );
  }

  assert.match(section, /dry-run default|Dry Run Default|Hardened/i);
  assert.match(section, /confirm/i);
  assert.match(section, /json/i);
  assert.match(section, /mutation/i);
});

test('SCRIPTS_CATALOG.md documents queue-drain as critical due-job processing, not stale recovery', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');
  const section = extractSection(catalog, '## Patch 4 Queue / Recovery Safety Status');

  const idx = section.indexOf('`scripts/queue-drain.js`');
  assert.notEqual(idx, -1, 'queue-drain must be listed');

  const nearby = section.slice(idx, idx + 1200);

  assert.match(nearby, /processDueJobs|due queue jobs|due pending jobs/i);
  assert.match(nearby, /active-worker preflight|server\/worker|server\/queue worker|PM2/i);
  assert.match(nearby, /Critical/i);
});

test('SCRIPTS_CATALOG.md documents recover-stale-running-jobs as non-mutating auditor', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');
  const section = extractSection(catalog, '## Patch 4 Queue / Recovery Safety Status');

  const idx = section.indexOf('`scripts/recover-stale-running-jobs.js`');
  assert.notEqual(idx, -1, 'recover-stale-running-jobs must be listed');

  const nearby = section.slice(idx, idx + 1000);

  assert.match(nearby, /read-only|auditor|audit/i);
  assert.match(nearby, /Confirm intentionally not implemented|confirm workflow is intentionally blocked/i);
  assert.match(nearby, /No queue mutation|no mutation/i);
});

test('SCRIPTS_CATALOG.md includes queue/recovery dependency map', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');
  const section = extractSection(catalog, '## Queue / Recovery Dependency Map');

  for (const scriptPath of QUEUE_RECOVERY_SCRIPTS) {
    assert.ok(
      section.includes(`\`${scriptPath}\``),
      `${scriptPath} must be listed in Queue / Recovery Dependency Map`
    );
  }

  assert.match(section, /Imports Services/i);
  assert.match(section, /Reads/i);
  assert.match(section, /Writes \/ Mutates/i);
  assert.match(section, /Queue Touch/i);
  assert.match(section, /Runtime Impact/i);
});
