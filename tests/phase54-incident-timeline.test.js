import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-inc-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?db=${Date.now()}`);
  await db.initDatabase();

  const incidents = await import(`../server/services/incidentTimeline.js?i=${Date.now()}`);

  return { dir, incidents };
}

test('incident timeline opens, appends and resolves incident', async () => {
  const { dir, incidents } = await setup();

  try {
    const opened = await incidents.openIncident({
      title: 'Unit test incident',
      severity: 'high',
      refs: { queueJobId: 'q_test' },
      initialEvent: {
        type: 'unit:start',
        summary: 'Unit start',
        refs: { queueJobId: 'q_test' },
      },
    });

    assert.equal(opened.ok, true);
    assert.equal(opened.incident.status, 'open');

    const appended = await incidents.appendIncidentEvent(opened.incident.id, {
      type: 'unit:event',
      summary: 'Unit event',
      data: { token: 'secret_should_be_redacted' },
    });

    assert.equal(appended.ok, true);
    assert.equal(appended.incident.events.length, 2);
    assert.equal(appended.incident.events[1].data.token, '[redacted]');

    const resolved = await incidents.resolveIncident(opened.incident.id, 'admin_test', 'done');
    assert.equal(resolved.ok, true);
    assert.equal(resolved.incident.status, 'resolved');
    assert.equal(resolved.incident.resolvedBy, 'admin_test');

    const list = await incidents.listIncidents({ status: 'resolved' });
    assert.equal(list.total, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});

test('incident timeline auto-opens for critical events and dedupes by fingerprint', async () => {
  const { dir, incidents } = await setup();

  try {
    const first = await incidents.autoOpenIncidentForEvent('ops_queue:job_dead_lettered', {
      jobId: 'q_dead_1',
      type: 'counter_rebuild',
    });

    assert.equal(first.ok, true);

    const second = await incidents.autoOpenIncidentForEvent('ops_queue:job_dead_lettered', {
      jobId: 'q_dead_1',
      type: 'counter_rebuild',
    });

    assert.equal(second.ok, true);

    const list = await incidents.listIncidents({ status: 'open' });
    assert.equal(list.total, 1);

    const full = await incidents.getIncident(list.incidents[0].id);
    assert.ok(full.events.length >= 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
