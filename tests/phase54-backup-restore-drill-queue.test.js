import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function createValidBackup(root) {
  await mkdir(join(root, 'users'), { recursive: true });
  await mkdir(join(root, 'jobs'), { recursive: true });

  await writeFile(join(root, 'users', 'phone-index.json'), JSON.stringify({ '01012345678': 'usr_test' }, null, 2));
  await writeFile(join(root, 'jobs', 'index.json'), JSON.stringify({}, null, 2));
  await writeFile(join(root, 'migration.json'), JSON.stringify({ version: 14, migrations: [] }, null, 2));
}

test('backup_restore_drill queue handler completes valid drill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-brd-queue-'));
  process.env.YAWMIA_DATA_PATH = join(dir, 'data');
  process.env.INSTANCE_MODE = 'single_writer';
  process.env.INSTANCE_ID = 'queue_handler_test';

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const backupPath = join(dir, 'backup');
    await createValidBackup(backupPath);

    const { enqueueJob, getJob } = await import(`../server/services/opsQueue.js?q=${Date.now()}`);
    const workers = await import(`../server/services/queueWorkers.js?w=${Date.now()}`);

    const enq = await enqueueJob({
      type: 'backup_restore_drill',
      priority: 'normal',
      payload: {
        options: {
          backupPath,
          restoreTargetDir: join(dir, 'restore'),
          keepRestoreTarget: false,
        },
      },
      idempotencyKey: 'unit:backup_restore_drill',
      createdBy: 'test',
    });

    assert.equal(enq.ok, true);

    const processResult = await workers.processDueJobs();
    assert.equal(processResult.claimed >= 1, true);

    await new Promise(resolve => setTimeout(resolve, 500));

    const job = await getJob(enq.job.id);
    assert.equal(job.status, 'completed');
    assert.equal(job.result.drill.status, 'passed');

    await workers.stopQueueWorkers({ drainMs: 1000 });
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
    delete process.env.INSTANCE_MODE;
    delete process.env.INSTANCE_ID;
  }
});
