import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

test('anonymize-user-data is dry-run by default and requires confirm plus approval and backup evidence', async () => {
  const source = await readScript('scripts/anonymize-user-data.js');

  assert.match(source, /--json/, 'anonymize-user-data must support --json');
  assert.match(source, /--dry-run/, 'anonymize-user-data must support --dry-run');
  assert.match(source, /--confirm/, 'anonymize-user-data must support --confirm');

  assert.match(
    source,
    /const DRY_RUN = process\.argv\.includes\('--dry-run'\)\s*\|\|\s*!CONFIRM/,
    'anonymize-user-data must default to dry-run when --confirm is absent'
  );

  assert.match(source, /mutationPerformed/, 'anonymize-user-data must expose mutationPerformed');
  assert.match(source, /confirmCommand/, 'anonymize-user-data must expose confirmCommand guidance');

  assert.match(source, /approvalId/, 'anonymize-user-data must require approvalId evidence');
  assert.match(source, /backupRef/, 'anonymize-user-data must require backupRef evidence');
  assert.match(source, /isApprovalValid/, 'anonymize-user-data must validate approval');
  assert.match(source, /consumeApproval/, 'anonymize-user-data must consume approval after mutation');

  assert.match(
    source,
    /APPROVAL_ID_REQUIRED/,
    'anonymize-user-data must block confirmed mode without approvalId'
  );

  assert.match(
    source,
    /BACKUP_REFERENCE_REQUIRED/,
    'anonymize-user-data must block confirmed mode without backupRef'
  );
});

test('reset-dev-data remains dev-only, dry-run-first, and production guarded', async () => {
  const source = await readScript('scripts/reset-dev-data.js');

  assert.match(source, /--json/, 'reset-dev-data must support --json');
  assert.match(source, /--dry-run/, 'reset-dev-data must support --dry-run');
  assert.match(source, /--confirm/, 'reset-dev-data must support --confirm');

  assert.match(
    source,
    /const DRY_RUN = ARGS\.has\('--dry-run'\)\s*\|\|\s*!CONFIRM/,
    'reset-dev-data must default to dry-run when --confirm is absent'
  );

  assert.match(source, /PRODUCTION_RESET_BLOCKED/, 'reset-dev-data must block production reset by default');
  assert.match(source, /--allow-production/, 'reset-dev-data must require explicit production override flag');
  assert.match(source, /--confirm-production-reset/, 'reset-dev-data must require explicit production reset confirmation');
  assert.match(source, /PROTECTED_NAMES/, 'reset-dev-data must protect source directories/files');
  assert.match(source, /mutationPerformed/, 'reset-dev-data must expose mutationPerformed');
});

test('export-user-data has explicit json semantics and does not mutate source data', async () => {
  const source = await readScript('scripts/export-user-data.js');

  assert.match(source, /--json/, 'export-user-data must support --json');
  assert.match(source, /mutationPerformed/, 'export-user-data must expose mutationPerformed');
  assert.match(source, /sourceDataMutated:\s*false/, 'export-user-data must declare sourceDataMutated:false');
  assert.match(source, /artifactWritten/, 'export-user-data must distinguish export artifact writes');

  assert.doesNotMatch(source, /anonymizeUserData/, 'export-user-data must not anonymize');
  assert.doesNotMatch(source, /deleteJSON/, 'export-user-data must not delete records');
  assert.doesNotMatch(source, /\brm\(/, 'export-user-data must not rm records');
  assert.doesNotMatch(source, /\bunlink\(/, 'export-user-data must not unlink records');
});

test('verify-privacy-governance remains read-only verification tooling', async () => {
  const source = await readScript('scripts/verify-privacy-governance.js');

  assert.match(source, /--json/, 'verify-privacy-governance must support --json');
  assert.match(source, /--strict/, 'verify-privacy-governance must support --strict');

  assert.doesNotMatch(source, /writeFile/, 'verify-privacy-governance must not write files');
  assert.doesNotMatch(source, /atomicWrite/, 'verify-privacy-governance must not atomicWrite');
  assert.doesNotMatch(source, /deleteJSON/, 'verify-privacy-governance must not delete JSON');
  assert.doesNotMatch(source, /\brm\(/, 'verify-privacy-governance must not rm files');
  assert.doesNotMatch(source, /\brename\(/, 'verify-privacy-governance must not rename files');
});
