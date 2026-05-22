import test from 'node:test';
import assert from 'node:assert/strict';
import { access, constants, readFile } from 'node:fs/promises';

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

test('Phase 58 governance docs exist', async () => {
  const docs = [
    'ADMIN_RBAC_MODEL.md',
    'DATA_GOVERNANCE_RUNBOOK.md',
    'PRIVACY_REQUEST_RUNBOOK.md',
    'POSTMORTEM_TEMPLATE.md',
  ];

  for (const doc of docs) {
    assert.equal(await exists(doc), true, `Missing doc: ${doc}`);
  }
});

test('ADMIN_RBAC_MODEL documents what not to do', async () => {
  const raw = await readFile('ADMIN_RBAC_MODEL.md', 'utf-8');

  assert.match(raw, /Do not share ADMIN_TOKEN broadly/);
  assert.match(raw, /Do not use super_admin for daily support/);
  assert.match(raw, /Do not allow support admins to run ops queue repair/);
  assert.match(raw, /Do not allow trust admins to force release process locks/);
  assert.match(raw, /Do not allow finance admins to review predictive abuse signals/);
});

test('PRIVACY_REQUEST_RUNBOOK documents export and anonymization workflows', async () => {
  const raw = await readFile('PRIVACY_REQUEST_RUNBOOK.md', 'utf-8');

  assert.match(raw, /User data export workflow/);
  assert.match(raw, /User anonymization workflow/);
  assert.match(raw, /Do not delete financial records blindly/);
  assert.match(raw, /Do not include raw secrets\/tokens/);
});

test('POSTMORTEM_TEMPLATE contains required fields', async () => {
  const raw = await readFile('POSTMORTEM_TEMPLATE.md', 'utf-8');

  const fields = [
    'Incident ID',
    'Severity',
    'Summary',
    'Impact',
    'Timeline',
    'Root cause',
    'What went well',
    'What went wrong',
    'Detection',
    'Resolution',
    'Action items',
    'Owners',
    'Due dates',
    'Prevention',
  ];

  for (const field of fields) {
    assert.ok(raw.includes(field), `Missing postmortem field: ${field}`);
  }
});
