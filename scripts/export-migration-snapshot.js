#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/export-migration-snapshot.js — NDJSON Snapshot Export (Phase 59)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/export-migration-snapshot.js --dry-run
//   node scripts/export-migration-snapshot.js --out=./migration-snapshots/test --confirm
//   node scripts/export-migration-snapshot.js --collections=users,jobs,applications --out=./migration-snapshots/test --confirm
//   node scripts/export-migration-snapshot.js --overwrite --out=./migration-snapshots/test --confirm
//
// Default is dry-run unless --confirm is provided.
// Does NOT import into any external database.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { appendFile, mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--confirm');
const CONFIRM = process.argv.includes('--confirm');
const JSON_OUT = process.argv.includes('--json');
const OVERWRITE = process.argv.includes('--overwrite');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function nowSnapshotName() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function fileSha256(filePath) {
  const raw = await readFile(filePath);
  return sha256(raw);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

function parseCollections(config) {
  const raw = getArg('collections', '');
  if (raw) {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  return [
    'users',
    'jobs',
    'applications',
    'attendance',
    'payments',
    'ratings',
    'reports',
    'verifications',
    'messages',
    'workrooms',
    'notifications',
    'direct_offers',
    'availability_ads',
    'alerts',
    'favorites',
    'audit',
    'privacy_requests',
    'admin_approvals',
    'ops_reviews',
    'postmortems',
  ].filter(c => config.DATABASE.dirs[c]);
}

function sanitizeKeyValue(key, value) {
  if (value === undefined) return undefined;

  if (/token|secret|password|apikey|api_key|authorization|vapid_private|private_key/i.test(key)) {
    return '[redacted]';
  }

  if (
    key === 'nationalIdImage' ||
    key === 'selfieImage' ||
    key === 'rawImage' ||
    key === 'base64' ||
    key === 'dataUri'
  ) {
    return '[omitted]';
  }

  if (typeof value === 'string') {
    // Avoid carrying huge embedded base64 accidentally.
    if (value.length > 4096 && /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 200))) {
      return '[large-string-omitted]';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, idx) => sanitizeRecord(item, `${key}_${idx}`));
  }

  if (value && typeof value === 'object') {
    return sanitizeRecord(value, key);
  }

  return value;
}

function sanitizeRecord(record, contextKey = '') {
  if (!record || typeof record !== 'object') return record;

  const out = {};
  for (const [key, value] of Object.entries(record)) {
    const clean = sanitizeKeyValue(key, value);
    if (clean !== undefined) out[key] = clean;
  }

  // Sessions are special: never export raw token.
  if (contextKey === 'sessions' || out.token) {
    if (out.token) out.token = '[redacted]';
  }

  return out;
}

async function appendNdjson(filePath, record) {
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
}

async function exportCollection({ collection, outDir, config, includeChecksums }) {
  const { getCollectionPath, listJSON } = await import('../server/services/database.js');

  const dir = getCollectionPath(collection);
  const fileName = `${collection}.ndjson`;
  const filePath = join(outDir, fileName);

  let rows = [];
  try {
    rows = await listJSON(dir);
  } catch (_) {
    rows = [];
  }

  let count = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') {
      skipped++;
      continue;
    }

    const sanitized = sanitizeRecord(row, collection);

    if (!DRY_RUN) {
      await appendNdjson(filePath, sanitized);
    }

    count++;

    if ((i + 1) % 250 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  const meta = {
    file: fileName,
    count,
    skipped,
    sizeBytes: 0,
    sha256: null,
  };

  if (!DRY_RUN) {
    const st = await stat(filePath).catch(() => null);
    meta.sizeBytes = st ? st.size : 0;
    if (includeChecksums) meta.sha256 = await fileSha256(filePath);
  }

  return meta;
}

async function exportIndexes({ outDir, config, includeChecksums }) {
  const indexDir = join(outDir, 'indexes');
  const indexes = {};

  if (!DRY_RUN) {
    await mkdir(indexDir, { recursive: true });
  }

  for (const [name, relPath] of Object.entries(config.DATABASE.indexFiles || {})) {
    const sourcePath = join(process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath, relPath);
    const targetName = `${name}.json`;
    const targetPath = join(indexDir, targetName);

    try {
      const raw = await readFile(sourcePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const sanitized = sanitizeRecord(parsed, `index_${name}`);
      const serialized = JSON.stringify(sanitized, null, 2);

      if (!DRY_RUN) {
        await writeFile(targetPath, serialized, 'utf-8');
      }

      indexes[name] = {
        file: `indexes/${targetName}`,
        sizeBytes: Buffer.byteLength(serialized, 'utf-8'),
        sha256: includeChecksums ? sha256(serialized) : null,
      };
    } catch (_) {
      indexes[name] = {
        file: `indexes/${targetName}`,
        missing: true,
        sizeBytes: 0,
        sha256: null,
      };
    }
  }

  return indexes;
}

async function main() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  if (JSON_OUT) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const config = (await import('../config.js')).default;
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const collections = parseCollections(config);
  const includeChecksums = config.EXTERNALIZATION_READINESS?.includeChecksums !== false;

  const outArg = getArg('out', '');
  const baseOut = config.EXTERNALIZATION_READINESS?.migrationSnapshotBasePath || './migration-snapshots';
  const outDir = outArg || join(baseOut, nowSnapshotName());

  const manifest = {
    formatVersion: 1,
    phase: 59,
    implementationAllowed: false,
    dryRun: DRY_RUN,
    createdAt: new Date().toISOString(),
    completedAt: null,
    source: {
      app: 'yawmia',
      version: config.PWA?.cacheName || 'unknown',
      dataPath: process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath,
    },
    options: {
      collections,
      includeChecksums,
      redactSecrets: true,
      overwrite: OVERWRITE,
    },
    outputDir: outDir,
    collections: {},
    indexes: {},
    warnings: [],
  };

  if (DRY_RUN) {
    manifest.warnings.push('Dry run: no files were written. Add --confirm to create snapshot files.');
  } else {
    if (await pathExists(outDir)) {
      if (!OVERWRITE) {
        throw new Error(`Output directory already exists: ${outDir}. Use --overwrite to replace it.`);
      }
      await rm(outDir, { recursive: true, force: true });
    }

    await mkdir(outDir, { recursive: true });
  }

  for (const collection of collections) {
    if (!config.DATABASE.dirs[collection]) {
      manifest.warnings.push(`Unknown collection skipped: ${collection}`);
      continue;
    }

    const meta = await exportCollection({
      collection,
      outDir,
      config,
      includeChecksums,
    });

    manifest.collections[collection] = meta;
  }

  manifest.indexes = await exportIndexes({
    outDir,
    config,
    includeChecksums,
  });

  manifest.completedAt = new Date().toISOString();

  if (!DRY_RUN) {
    const manifestPath = join(outDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    if (includeChecksums) {
      const raw = await readFile(manifestPath);
      manifest.manifestSha256 = sha256(raw);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    }
  }

  const result = {
    ok: true,
    dryRun: DRY_RUN,
    outDir,
    collectionCount: Object.keys(manifest.collections).length,
    totalRecords: Object.values(manifest.collections).reduce((sum, c) => sum + (c.count || 0), 0),
    manifest,
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n📦 يوميّة Migration Snapshot ${DRY_RUN ? '(DRY RUN)' : '(CONFIRMED)'}\n`);
    console.log(`Output: ${outDir}`);
    console.log(`Collections: ${collections.join(', ')}`);
    console.log(`Checksums: ${includeChecksums ? 'yes' : 'no'}`);

    console.log('\n── Collection Counts ──');
    for (const [name, meta] of Object.entries(manifest.collections)) {
      console.log(`  ${name}: ${meta.count || 0} records`);
    }

    if (DRY_RUN) {
      console.log('\nNo files were written.');
      console.log('To write snapshot:');
      console.log(`  node scripts/export-migration-snapshot.js --out=${outDir} --confirm`);
    } else {
      console.log('\n✅ Snapshot written');
      console.log(`   manifest: ${join(outDir, 'manifest.json')}`);
    }

    console.log('');
  }
}

main().catch(err => {
  const payload = {
    ok: false,
    error: err.message,
    dryRun: DRY_RUN,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error('\n❌ Migration snapshot export failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
