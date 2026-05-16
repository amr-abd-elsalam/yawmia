import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-attachments-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const hygiene = await import(`../server/services/workroomHygiene.js?x=${Date.now()}`);

  return { dir, database, hygiene };
}

test('Phase 55: orphan workroom attachments are detected in dry-run', async () => {
  const { dir, hygiene } = await setup();

  try {
    const bucket = join(dir, 'images', 'ab');
    await mkdir(bucket, { recursive: true });

    const meta = {
      ref: 'img_abcdef12',
      hash: 'abcdef1234567890',
      contentType: 'image/jpeg',
      sizeBytes: 10,
      uploadedBy: 'usr_a',
      uploadedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      purpose: 'workroom_attachment',
    };

    await writeFile(join(bucket, 'abcdef1234567890.meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
    await writeFile(join(bucket, 'abcdef1234567890.jpg'), 'fake', 'utf-8');

    const result = await hygiene.cleanupOrphanAttachments({ dryRun: true, graceHours: 1 });

    assert.equal(result.orphanCandidates, 1);
    assert.equal(result.deleted, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: raw base64 in message attachment is flagged by inspection', async () => {
  const { dir, database, hygiene } = await setup();

  try {
    const jobId = 'job_raw_base64';

    await database.atomicWrite(database.getRecordPath('messages', 'msg_raw_base64'), {
      id: 'msg_raw_base64',
      jobId,
      senderId: 'usr_a',
      senderRole: 'worker',
      recipientId: 'usr_b',
      text: 'photo',
      source: 'workroom',
      attachments: [
        { type: 'image', imageRef: 'img_safe', dataUri: 'data:image/png;base64,AAAA' },
      ],
      createdAt: new Date().toISOString(),
    });

    const inspection = await hygiene.inspectWorkroomSidecars(jobId);

    assert.equal(inspection.warnings.some(w => w.kind === 'attachments'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
