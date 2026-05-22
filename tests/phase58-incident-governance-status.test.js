import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-incidentgov-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?incidentgov=${Date.now()}`);
  await db.initDatabase();

  return { dir };
}

test('critical incident governance status requires postmortem until created', async () => {
  const { dir } = await setupTempDb();

  try {
    const incident = await import(`../server/services/incidentTimeline.js?incidentgov=${Date.now()}`);
    const pm = await import(`../server/services/postmortemRecords.js?incidentgov=${Date.now()}`);

    const opened = await incident.openIncident({
      id: 'inc_phase58_critical',
      title: 'Critical test incident',
      severity: 'critical',
      sourceType: 'backup_restore_drill:failed',
      initialEvent: {
        type: 'backup_restore_drill:failed',
        summary: 'Restore drill failed',
      },
    });

    assert.equal(opened.ok, true);

    const before = await incident.getIncidentGovernanceStatus('inc_phase58_critical');
    assert.equal(before.postmortemRequired, true);
    assert.equal(before.postmortemExists, false);
    assert.equal(before.status, 'postmortem_required');

    const created = await pm.createPostmortem({
      incidentId: 'inc_phase58_critical',
      severity: 'critical',
      summary: 'Postmortem created',
      createdBy: 'adm_1',
    });

    assert.equal(created.ok, true);

    const after = await incident.getIncidentGovernanceStatus('inc_phase58_critical');
    assert.equal(after.postmortemRequired, true);
    assert.equal(after.postmortemExists, true);
    assert.equal(after.postmortemId, created.postmortem.id);
    assert.equal(after.status, 'ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getIncident returns additive governance object', async () => {
  const { dir } = await setupTempDb();

  try {
    const incident = await import(`../server/services/incidentTimeline.js?incidentgov2=${Date.now()}`);

    await incident.openIncident({
      id: 'inc_phase58_get',
      title: 'Critical test incident',
      severity: 'critical',
      sourceType: 'ops_slo:violated',
      initialEvent: {
        type: 'ops_slo:violated',
        summary: 'SLO violated',
      },
    });

    const got = await incident.getIncident('inc_phase58_get');
    assert.ok(got);
    assert.ok(got.governance);
    assert.equal(got.governance.postmortemRequired, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
