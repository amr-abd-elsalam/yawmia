import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('incident event types map to Phase 57 runbook keys', async () => {
  const mod = await import('../server/services/incidentTimeline.js');

  assert.equal(mod.getIncidentRunbookKey('ops_queue:job_dead_lettered'), 'QUEUE_DLQ_SPIKE');
  assert.equal(mod.getIncidentRunbookKey('alert_delivery:dead_lettered'), 'ALERT_DELIVERY_DEAD_LETTER');
  assert.equal(mod.getIncidentRunbookKey('backup_restore_drill:failed'), 'BACKUP_RESTORE_DRILL_FAILED');
  assert.equal(mod.getIncidentRunbookKey('scheduler:stale'), 'SCHEDULER_STALE');
  assert.equal(mod.getIncidentRunbookKey('unknown:event'), 'GENERAL_OPERATIONAL_INCIDENT');
});

test('opened incident includes runbookKey additively', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-incident-tax-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const mod = await import('../server/services/incidentTimeline.js');
  const result = await mod.openIncident({
    title: 'DLQ spike',
    severity: 'high',
    sourceType: 'ops_queue:job_dead_lettered',
    initialEvent: {
      type: 'ops_queue:job_dead_lettered',
      data: { jobId: 'q_test' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.incident.runbookKey, 'QUEUE_DLQ_SPIKE');

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});

test('incident taxonomy exposes runbook list', async () => {
  const mod = await import('../server/services/incidentTimeline.js');
  const taxonomy = mod.getIncidentTaxonomy();

  assert.equal(taxonomy.enabled, true);
  assert.ok(taxonomy.runbooks.includes('JSON_CORRUPTION'));
  assert.ok(taxonomy.runbooks.includes('PRODUCTION_READINESS_FAILED'));
});
