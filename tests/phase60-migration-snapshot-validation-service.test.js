import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

async function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

test('missing manifest fails snapshot validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p60-snap-'));
  const mod = await import('../server/services/migrationSnapshotValidation.js');
  const report = await mod.validateMigrationSnapshot(dir);

  assert.equal(report.ok, false);
  assert.equal(report.status, 'failed');
  assert.ok(report.errors.some(e => e.code === 'MANIFEST_READ_FAILED'));
});

test('valid NDJSON snapshot passes basic validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p60-snap-'));

  const users = '{"id":"usr_1","role":"worker"}\n{"id":"usr_2","role":"employer"}\n';
  const jobs = '{"id":"job_1","employerId":"usr_2"}\n';

  await writeFile(join(dir, 'users.ndjson'), users, 'utf-8');
  await writeFile(join(dir, 'jobs.ndjson'), jobs, 'utf-8');

  const manifest = {
    formatVersion: 1,
    phase: 60,
    createdAt: new Date().toISOString(),
    source: { app: 'yawmia', version: '0.56.0' },
    collections: {
      users: { file: 'users.ndjson', count: 2, sha256: await sha256(users) },
      jobs: { file: 'jobs.ndjson', count: 1, sha256: await sha256(jobs) },
    },
  };

  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  const mod = await import('../server/services/migrationSnapshotValidation.js');
  const report = await mod.validateMigrationSnapshot(dir);

  assert.equal(report.ok, true);
  assert.equal(report.status, 'passed');
  assert.equal(report.counts.users.actualCount, 2);
  assert.equal(report.counts.jobs.actualCount, 1);
});

test('forbidden key detection fails validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p60-snap-'));

  const users = '{"id":"usr_1","sessionToken":"secret"}\n';
  await writeFile(join(dir, 'users.ndjson'), users, 'utf-8');

  const manifest = {
    formatVersion: 1,
    phase: 60,
    createdAt: new Date().toISOString(),
    source: { app: 'yawmia', version: '0.56.0' },
    collections: {
      users: { file: 'users.ndjson', count: 1, sha256: await sha256(users) },
    },
  };

  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  const mod = await import('../server/services/migrationSnapshotValidation.js');
  const report = await mod.validateMigrationSnapshot(dir);

  assert.equal(report.ok, false);
  assert.ok(report.errors.some(e => e.code === 'FORBIDDEN_KEY'));
});
