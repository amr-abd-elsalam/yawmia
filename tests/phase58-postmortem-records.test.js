import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-postmortem-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?pm=${Date.now()}`);
  await db.initDatabase();

  return { dir };
}

test('postmortem lifecycle with action item', async () => {
  const { dir } = await setupTempDb();

  try {
    const svc = await import(`../server/services/postmortemRecords.js?pm=${Date.now()}`);

    const created = await svc.createPostmortem({
      incidentId: 'inc_test',
      severity: 'critical',
      summary: 'Critical incident summary',
      createdBy: 'adm_1',
    });

    assert.equal(created.ok, true);
    assert.equal(created.postmortem.incidentId, 'inc_test');

    const same = await svc.createPostmortem({
      incidentId: 'inc_test',
      severity: 'critical',
      summary: 'Duplicate',
      createdBy: 'adm_1',
    });

    assert.equal(same.ok, true);
    assert.equal(same.alreadyExists, true);
    assert.equal(same.postmortem.id, created.postmortem.id);

    const added = await svc.addActionItem(created.postmortem.id, {
      title: 'Fix queue retry',
      owner: 'ops',
      dueDate: '2026-06-01',
    });

    assert.equal(added.ok, true);
    assert.equal(added.actionItem.status, 'open');

    const updated = await svc.updateActionItem(created.postmortem.id, added.actionItem.id, {
      status: 'done',
    });

    assert.equal(updated.ok, true);
    assert.equal(updated.actionItem.status, 'done');

    const completed = await svc.updatePostmortem(created.postmortem.id, {
      status: 'completed',
      rootCause: 'Root cause',
    });

    assert.equal(completed.ok, true);
    assert.equal(completed.postmortem.status, 'completed');
    assert.ok(completed.postmortem.completedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('critical incident requires postmortem', async () => {
  const svc = await import(`../server/services/postmortemRecords.js?pmreq=${Date.now()}`);

  assert.equal(svc.isPostmortemRequired({ severity: 'critical' }), true);
  assert.equal(svc.isPostmortemRequired({ severity: 'medium' }), false);
});
