import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 61.1: jobs.list remains stable with one corrupt job file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p611-jobs-'));
  const previous = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js?' + Date.now());
    await db.initDatabase();

    const jobsDir = db.getCollectionPath('jobs');
    await mkdir(jobsDir, { recursive: true });

    await writeFile(join(jobsDir, 'job_valid.json'), JSON.stringify({
      id: 'job_valid',
      employerId: 'usr_emp',
      title: 'Valid open job',
      category: 'general',
      governorate: 'cairo',
      workersNeeded: 1,
      workersAccepted: 0,
      dailyWage: 250,
      startDate: '2026-05-26',
      durationDays: 1,
      status: 'open',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }, null, 2));

    await writeFile(join(jobsDir, 'job_corrupt.json'), Buffer.from([
      0x7b, 0x22, 0x69, 0x64, 0x22, 0x3a, 0x00
    ]));

    const jobs = await import('../server/services/jobs.js?' + Date.now());
    const rows = await jobs.list({ status: 'open' });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'job_valid');
  } finally {
    if (previous === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
