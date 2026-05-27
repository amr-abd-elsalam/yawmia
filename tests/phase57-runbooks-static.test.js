import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('DEPLOYMENT_RUNBOOK documents single-writer production discipline', async () => {
  const md = await readFile(new URL('../docs/deployment/DEPLOYMENT_RUNBOOK.md', import.meta.url), 'utf-8');

  assert.match(md, /Do not run PM2 cluster mode/);
  assert.match(md, /Do not run multiple writer instances/);
  assert.match(md, /Do not cache \/api\/\*/);
  assert.match(md, /Do not deploy without backup/);
  assert.match(md, /experimental_multi_instance/);
});

test('OPERATIONS_RUNBOOK contains daily weekly monthly workflows and commands', async () => {
  const md = await readFile(new URL('../docs/operations/OPERATIONS_RUNBOOK.md', import.meta.url), 'utf-8');

  assert.match(md, /Daily checks/);
  assert.match(md, /Weekly checks/);
  assert.match(md, /Monthly checks/);
  assert.match(md, /node scripts\/verify-queue\.js/);
  assert.match(md, /node scripts\/run-backup-restore-drill\.js/);
  assert.match(md, /node scripts\/rollup-product-intelligence\.js/);
});

test('INCIDENT_RUNBOOKS contains Phase 57 incident taxonomy', async () => {
  const md = await readFile(new URL('../docs/incidents/INCIDENT_RUNBOOKS.md', import.meta.url), 'utf-8');

  const keys = [
    'QUEUE_DLQ_SPIKE',
    'QUEUE_STALE_RUNNING',
    'QUEUE_SUMMARY_MISMATCH',
    'SCHEDULER_STALE',
    'ALERT_DELIVERY_DEAD_LETTER',
    'BACKUP_RESTORE_DRILL_FAILED',
    'JSON_CORRUPTION',
    'SEARCH_REBUILD_FAILED',
    'AUDIT_INDEX_STALE',
    'COUNTER_FILE_CRITICAL',
    'WORKROOM_SIDECAR_CRITICAL',
    'MARKETPLACE_ROLLUP_STALE',
    'MAINTENANCE_ENABLED_TOO_LONG',
    'PROCESS_LOCK_STALE',
    'PRODUCTION_READINESS_FAILED',
  ];

  for (const key of keys) {
    assert.match(md, new RegExp(key));
  }
});
