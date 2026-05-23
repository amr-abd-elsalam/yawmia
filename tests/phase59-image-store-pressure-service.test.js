import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('image store pressure counts bucketed binary and metadata files without reading contents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-image-pressure-'));
  const oldPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js');
    await db.initDatabase();

    const bucket = join(dir, 'images', 'ab');
    await mkdir(bucket, { recursive: true });

    await writeFile(join(bucket, 'abcdef.jpg'), Buffer.from([1, 2, 3, 4]));
    await writeFile(join(bucket, 'abcdef.meta.json'), JSON.stringify({
      ref: 'img_abcdef',
      uploadedBy: 'usr_secret',
      purpose: 'workroom_attachment',
    }), 'utf-8');

    const storage = await import('../server/services/storagePressure.js');
    const stats = await storage.getImageStorePressureStats();

    assert.equal(stats.bucketCount, 1);
    assert.equal(stats.fileCount, 2);
    assert.equal(stats.binaryFileCount, 1);
    assert.equal(stats.metaFileCount, 1);
    assert.ok(stats.totalSizeKB > 0);
    assert.ok(Array.isArray(stats.largestFiles));

    const serialized = JSON.stringify(stats);
    assert.ok(!serialized.includes('usr_secret'), 'pressure output must not include metadata content');
  } finally {
    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test('storage pressure snapshot includes images pressure section', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-image-snapshot-'));
  const oldPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js');
    await db.initDatabase();

    const bucket = join(dir, 'images', 'cd');
    await mkdir(bucket, { recursive: true });
    await writeFile(join(bucket, 'cd1234.png'), Buffer.from([5, 6, 7]));
    await writeFile(join(bucket, 'cd1234.meta.json'), JSON.stringify({
      ref: 'img_cd1234',
      purpose: 'identity',
    }), 'utf-8');

    const storage = await import('../server/services/storagePressure.js');
    const snapshot = await storage.getStoragePressure({
      force: true,
      persist: false,
      collection: 'users',
    });

    assert.ok(snapshot.images);
    assert.equal(snapshot.images.binaryFileCount, 1);
    assert.equal(snapshot.images.metaFileCount, 1);
  } finally {
    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test('scale thresholds can evaluate image pressure from storage pressure snapshot', async () => {
  const { evaluateImagePressure } = await import('../server/services/scaleThresholds.js');

  const result = evaluateImagePressure({
    binaryFileCount: 10,
    totalSizeKB: 2048,
    largestFileKB: 4096,
  }, {
    totalSizeWarningMB: 1,
    totalSizeCriticalMB: 10,
    largestFileWarningMB: 2,
    largestFileCriticalMB: 10,
    binaryFilesWarning: 5,
    binaryFilesCritical: 100,
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.warnings.some(w => w.code === 'IMAGE_LARGEST_FILE_PRESSURE'));
  assert.ok(result.warnings.some(w => w.code === 'IMAGE_BINARY_FILE_COUNT_PRESSURE'));
});
