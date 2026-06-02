import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

test('queue-retry-dlq defaults to dry-run and requires --confirm for mutation', async () => {
  const source = await readScript('scripts/queue-retry-dlq.js');

  assert.match(source, /--json/, 'queue-retry-dlq must support --json');
  assert.match(source, /--dry-run/, 'queue-retry-dlq must support --dry-run');
  assert.match(source, /--confirm/, 'queue-retry-dlq must support --confirm');

  assert.match(
    source,
    /const DRY_RUN = process\.argv\.includes\('--dry-run'\)\s*\|\|\s*!CONFIRM/,
    'queue-retry-dlq must default to dry-run when --confirm is absent'
  );

  assert.match(source, /mutationPerformed/, 'queue-retry-dlq must expose mutationPerformed');
  assert.match(source, /confirmCommand/, 'queue-retry-dlq must expose confirmCommand guidance');

  assert.match(
    source,
    /if \(!DRY_RUN\)/,
    'queue-retry-dlq must only call retryJob in non-dry-run mode'
  );
});

test('queue-drain documents and guards confirmed due-job processing', async () => {
  const source = await readScript('scripts/queue-drain.js');

  assert.match(source, /--json/, 'queue-drain must support --json');
  assert.match(source, /--dry-run/, 'queue-drain must support --dry-run');
  assert.match(source, /--confirm/, 'queue-drain must support --confirm');

  assert.match(
    source,
    /const DRY_RUN = process\.argv\.includes\('--dry-run'\)\s*\|\|\s*!CONFIRM/,
    'queue-drain must default to dry-run when --confirm is absent'
  );

  assert.match(source, /buildConfirmPreflight/, 'queue-drain must include confirm preflight');
  assert.match(source, /ACTIVE_YAWMIA_SERVER_PROCESS/, 'queue-drain must block active Yawmia server processes');
  assert.match(source, /PM2_MANAGED_YAWMIA_ACTIVE/, 'queue-drain must block active PM2-managed Yawmia apps');
  assert.match(source, /processDueJobs/, 'queue-drain confirmed mode must clearly document/process due jobs');
  assert.match(source, /mutationPerformed/, 'queue-drain must expose mutationPerformed');
});

test('recover-stale-running-jobs is dry-run auditor only and blocks --confirm', async () => {
  const source = await readScript('scripts/recover-stale-running-jobs.js');

  assert.match(source, /--json/, 'recover-stale-running-jobs must support --json');
  assert.match(source, /--dry-run/, 'recover-stale-running-jobs must support --dry-run');
  assert.match(source, /--confirm/, 'recover-stale-running-jobs must parse --confirm');

  assert.match(source, /CONFIRM_NOT_IMPLEMENTED/, 'recover-stale-running-jobs must block confirmed mutation');
  assert.match(source, /mutationPerformed:\s*false/, 'recover-stale-running-jobs must remain non-mutating');

  assert.doesNotMatch(
    source,
    /await\s+\w+\.processDueJobs\(/,
    'recover-stale-running-jobs must not call processDueJobs'
  );

  assert.doesNotMatch(
    source,
    /await\s+\w+\.retryJob\(/,
    'recover-stale-running-jobs must not retry jobs'
  );
});

test('quarantine-corrupt-json is dry-run by default and never deletes files', async () => {
  const source = await readScript('scripts/quarantine-corrupt-json.js');

  assert.match(source, /--json/, 'quarantine-corrupt-json must support --json');
  assert.match(source, /--dry-run/, 'quarantine-corrupt-json must support --dry-run');
  assert.match(source, /--confirm/, 'quarantine-corrupt-json must support --confirm');

  assert.match(
    source,
    /const DRY_RUN = process\.argv\.includes\('--dry-run'\)\s*\|\|\s*!CONFIRM/,
    'quarantine-corrupt-json must default to dry-run when --confirm is absent'
  );

  assert.match(source, /mutationPerformed/, 'quarantine-corrupt-json must expose mutationPerformed');
  assert.match(source, /rename\(/, 'quarantine-corrupt-json may move files to quarantine in confirmed mode');

  assert.doesNotMatch(source, /\bunlink\(/, 'quarantine-corrupt-json must not delete files with unlink');
  assert.doesNotMatch(source, /\brm\(/, 'quarantine-corrupt-json must not delete files with rm');
});
