#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/quarantine-corrupt-json.js — Phase 61.1 Safe Corrupt JSON Quarantine
// ═══════════════════════════════════════════════════════════════
// Dry-run by default.
// Moves invalid JSON / NUL-byte JSON to data/quarantine only with --confirm.
// Never deletes.
// Writes quarantine manifest.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir, readFile, mkdir, rename, stat } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const DATA_PATH = process.env.YAWMIA_DATA_PATH || './data';
const MAX_FILES = Number.parseInt(getArg('max-files', '300000'), 10) || 300000;

let config = null;
try {
  config = (await import('../config.js')).default;
} catch (_) {
  config = null;
}

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function inferCollection(filePath) {
  if (!config?.DATABASE?.dirs) return 'unknown';
  const rel = relative(DATA_PATH, filePath).replace(/\\/g, '/');

  for (const [collection, dir] of Object.entries(config.DATABASE.dirs)) {
    const normalizedDir = String(dir).replace(/\\/g, '/');
    if (rel === normalizedDir || rel.startsWith(normalizedDir + '/')) {
      return collection;
    }
  }

  return 'unknown';
}

function isGeneratedArtifact(collection, filePath) {
  const rel = relative(DATA_PATH, filePath).replace(/\\/g, '/');

  if (collection === 'metrics') return true;
  if (collection === 'audit_indexes') return true;
  if (collection === 'exports') return true;
  if (rel.includes('/search-indexes/')) return true;
  if (rel.includes('/indexes/')) return true;
  if (rel.startsWith('metrics/')) return true;

  return false;
}

function quarantineRoot() {
  return join(DATA_PATH, 'quarantine');
}

function manifestPath() {
  return join(quarantineRoot(), 'manifest.json');
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function readManifest() {
  try {
    const raw = await readFile(manifestPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) return parsed;
  } catch (_) {}

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

async function writeManifest(manifest) {
  const { atomicWrite } = await import('../server/services/database.js');
  manifest.updatedAt = new Date().toISOString();
  await mkdir(dirname(manifestPath()), { recursive: true });
  await atomicWrite(manifestPath(), manifest);
}

async function walk(dir, out, state) {
  if (state.scanned >= MAX_FILES) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    if (state.scanned >= MAX_FILES) return;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (relative(DATA_PATH, full).replace(/\\/g, '/').startsWith('quarantine')) continue;
      await walk(full, out, state);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.json')) continue;
    if (entry.name.endsWith('.tmp')) continue;

    state.scanned++;

    try {
      const buf = await readFile(full);
      const nulIndex = buf.indexOf(0);
      let parseError = null;

      try {
        JSON.parse(buf.toString('utf-8'));
      } catch (err) {
        parseError = err.message;
      }

      if (nulIndex !== -1 || parseError) {
        const st = await stat(full).catch(() => ({ size: buf.length }));
        const collection = inferCollection(full);

        out.push({
          path: full,
          relPath: relative(process.cwd(), full),
          collection,
          sizeBytes: st.size,
          hasNul: nulIndex !== -1,
          nulIndex: nulIndex !== -1 ? nulIndex : null,
          parseError,
          generatedArtifact: isGeneratedArtifact(collection, full),
        });
      }
    } catch (err) {
      state.readErrors.push({
        path: relative(process.cwd(), full),
        error: err.message,
      });
    }

    if (state.scanned % 500 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}

async function quarantineFinding(finding, manifest) {
  const stamp = nowStamp();
  const safeCollection = finding.collection || 'unknown';
  const targetDir = join(quarantineRoot(), safeCollection);
  const targetPath = join(targetDir, `${stamp}-${basename(finding.path)}`);

  const hash = await sha256File(finding.path).catch(() => null);

  const entry = {
    id: `qcor_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
    originalPath: relative(process.cwd(), finding.path),
    quarantinePath: relative(process.cwd(), targetPath),
    collection: safeCollection,
    sizeBytes: finding.sizeBytes,
    sha256: hash,
    hasNul: finding.hasNul,
    nulIndex: finding.nulIndex,
    parseError: finding.parseError,
    generatedArtifact: finding.generatedArtifact,
    quarantinedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
  };

  if (!DRY_RUN) {
    await mkdir(targetDir, { recursive: true });
    await rename(finding.path, targetPath);
  }

  manifest.entries.push(entry);
  return entry;
}

async function main() {
  const findings = [];
  const state = { scanned: 0, readErrors: [] };

  await walk(DATA_PATH, findings, state);

  const manifest = await readManifest();
  const quarantined = [];

  for (const finding of findings) {
    quarantined.push(await quarantineFinding(finding, manifest));
  }

  if (!DRY_RUN && quarantined.length > 0) {
    await writeManifest(manifest);
  }

  const result = {
    ok: findings.length === 0,
    dryRun: DRY_RUN,
    mutationPerformed: !DRY_RUN && quarantined.length > 0,
    dataPath: DATA_PATH,
    scannedFiles: state.scanned,
    corruptFileCount: findings.length,
    quarantinedCount: quarantined.length,
    findings: findings.map(f => ({
      path: f.relPath,
      collection: f.collection,
      sizeBytes: f.sizeBytes,
      hasNul: f.hasNul,
      nulIndex: f.nulIndex,
      parseError: f.parseError,
      generatedArtifact: f.generatedArtifact,
    })),
    quarantined,
    readErrors: state.readErrors.slice(0, 50),
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n🧯 Yawmia Corrupt JSON Quarantine ${DRY_RUN ? '(DRY RUN)' : '(CONFIRMED)'}\n`);
    console.log(`Scanned: ${result.scannedFiles}`);
    console.log(`Corrupt JSON: ${result.corruptFileCount}`);
    console.log(`Mutation performed: ${result.mutationPerformed ? 'yes' : 'no'}`);

    if (result.findings.length > 0) {
      console.log('\nFindings:');
      for (const f of result.findings.slice(0, 50)) {
        console.log(`- ${f.path} collection=${f.collection} nul=${f.hasNul ? 'yes' : 'no'} generated=${f.generatedArtifact ? 'yes' : 'no'}`);
        if (f.parseError) console.log(`  parseError=${f.parseError}`);
      }
    }

    console.log(DRY_RUN
      ? '\n✅ Dry-run complete. Re-run with --confirm to move files into quarantine.\n'
      : '\n✅ Quarantine complete. Review data/quarantine/manifest.json.\n'
    );
  }

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  const failure = {
    ok: false,
    dryRun: DRY_RUN,
    error: err.message,
    stack: err.stack,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) console.log(JSON.stringify(failure, null, 2));
  else {
    console.error('\n❌ Quarantine failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
