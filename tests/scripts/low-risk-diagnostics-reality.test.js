import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

const PATCH10_SCRIPTS = [
  'scripts/postdeploy-smoke.js',
  'scripts/predeploy-check.js',
  'scripts/ops-weekly-review.js',
  'scripts/capture-phase61-evidence.js',
  'scripts/capture-externalization-decision.js',
  'scripts/evaluate-pilot-gate.js',
  'scripts/phase61-1-remediation-status.js',
  'scripts/benchmark-file-paths.js',
  'scripts/measure-storage-pressure.js',
  'scripts/verify-scale-thresholds.js',
  'scripts/verify-marketplace-intelligence.js',
  'scripts/verify-repository-contracts.js',
  'scripts/scheduler-cadence-report.js',
];

const JSON_CAPABLE_PATCH10_SCRIPTS = [
  'scripts/postdeploy-smoke.js',
  'scripts/predeploy-check.js',
  'scripts/capture-phase61-evidence.js',
  'scripts/capture-externalization-decision.js',
  'scripts/evaluate-pilot-gate.js',
  'scripts/phase61-1-remediation-status.js',
  'scripts/benchmark-file-paths.js',
  'scripts/measure-storage-pressure.js',
  'scripts/verify-scale-thresholds.js',
  'scripts/verify-marketplace-intelligence.js',
  'scripts/verify-repository-contracts.js',
  'scripts/scheduler-cadence-report.js',
];

test('Patch 10 low-risk/diagnostic scripts are cataloged as reviewed', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  assert.ok(
    catalog.includes('## Patch 10 Remaining Low-Risk / Diagnostic Scripts Reality Check'),
    'catalog must include Patch 10 low-risk diagnostic review section'
  );

  assert.ok(
    catalog.includes('## Patch 10 Low-Risk / Diagnostic Dependency Map'),
    'catalog must include Patch 10 dependency map'
  );

  for (const scriptPath of PATCH10_SCRIPTS) {
    const idx = catalog.indexOf(`\`${scriptPath}\``);
    assert.notEqual(idx, -1, `${scriptPath} must be cataloged`);

    const nearby = catalog.slice(Math.max(0, idx - 500), idx + 1500);

    assert.match(
      nearby,
      /Reviewed|Keep|Safe Read-Only|Manual With Caution|Low|Medium|Partial/i,
      `${scriptPath} must have an explicit reviewed/keep/safety classification`
    );
  }
});

test('Patch 10 json-capable diagnostic scripts declare --json', async () => {
  for (const scriptPath of JSON_CAPABLE_PATCH10_SCRIPTS) {
    const source = await readScript(scriptPath);
    assert.match(source, /--json/, `${scriptPath} must support --json or document a --json mode`);
  }
});

test('ops-weekly-review is intentionally documented as missing --json for future polish', async () => {
  const source = await readScript('scripts/ops-weekly-review.js');
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  assert.doesNotMatch(source, /--json/, 'ops-weekly-review.js currently has no --json mode');

  const idx = catalog.indexOf('`scripts/ops-weekly-review.js`');
  assert.notEqual(idx, -1, 'ops-weekly-review.js must be cataloged');

  const nearby = catalog.slice(Math.max(0, idx - 500), idx + 1500);

  assert.match(
    nearby,
    /Add `--json` later|add `--json` later|Keep \+ Add `--json` later/i,
    'catalog must explicitly document that ops-weekly-review.js should gain --json later'
  );
});

test('Patch 10 diagnostic scripts avoid direct destructive filesystem calls', async () => {
  const destructiveForbidden = [
    /\brm\(/,
    /\bunlink\(/,
    /\brename\(/,
    /\bdeleteJSON\(/,
    /\bwriteIndex\(/,
    /\bretryJob\(/,
    /\bcancelJob\(/,
  ];

  const scriptsToCheck = [
    'scripts/postdeploy-smoke.js',
    'scripts/predeploy-check.js',
    'scripts/capture-phase61-evidence.js',
    'scripts/capture-externalization-decision.js',
    'scripts/evaluate-pilot-gate.js',
    'scripts/phase61-1-remediation-status.js',
    'scripts/verify-repository-contracts.js',
    'scripts/scheduler-cadence-report.js',
  ];

  for (const scriptPath of scriptsToCheck) {
    const source = await readScript(scriptPath);

    for (const pattern of destructiveForbidden) {
      assert.doesNotMatch(
        source,
        pattern,
        `${scriptPath} must not use direct destructive operation ${pattern}`
      );
    }
  }
});

test('catalog documents known Patch 10 side effects instead of claiming pure read-only', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const expectedPhrases = [
    'possible service-layer lazy expiry through jobs service',
    'may capture dashboard rollup if missing',
    'May register default scheduler records',
    'Storage pressure metrics snapshot by default unless `--no-persist`',
    'optional ops review record via `--persist`',
  ];

  for (const phrase of expectedPhrases) {
    assert.ok(
      catalog.includes(phrase),
      `catalog must document Patch 10 side effect: ${phrase}`
    );
  }
});
