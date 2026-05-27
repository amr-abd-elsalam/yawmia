#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/find-null-json-files.js — Detect JSON files containing NUL bytes
// ═══════════════════════════════════════════════════════════════
// Read-only diagnostic.
// Useful when JSON.parse fails with "Unexpected token '\\u0000'".
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const STRICT = process.argv.includes('--strict');
const MAX_FILES = Number.parseInt(getArg('max-files', '300000'), 10) || 300000;
const DATA_PATH = process.env.YAWMIA_DATA_PATH || './data';

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

function inferCollection(filePath) {
  if (!config || !config.DATABASE || !config.DATABASE.dirs) return null;
  const rel = relative(DATA_PATH, filePath).replace(/\\/g, '/');

  for (const [collection, dir] of Object.entries(config.DATABASE.dirs)) {
    const normalizedDir = String(dir).replace(/\\/g, '/');
    if (rel === normalizedDir || rel.startsWith(normalizedDir + '/')) {
      return collection;
    }
  }

  return null;
}

function isHelp() {
  return process.argv.includes('--help') || process.argv.includes('-h');
}

function printHelp() {
  console.log(`
Usage:
  node scripts/find-null-json-files.js
  node scripts/find-null-json-files.js --json
  node scripts/find-null-json-files.js --strict
  node scripts/find-null-json-files.js --max-files=100000

Read-only:
  Scans JSON files under YAWMIA_DATA_PATH or ./data.
  Reports files containing NUL bytes.
`);
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
      if (nulIndex !== -1) {
        const st = await stat(full).catch(() => ({ size: buf.length }));
        let nulCount = 0;
        for (const b of buf) {
          if (b === 0) nulCount++;
        }

        out.push({
          path: relative(process.cwd(), full),
          collection: inferCollection(full),
          sizeBytes: st.size,
          nulIndex,
          nulCount,
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

if (isHelp()) {
  printHelp();
  process.exit(0);
}

const findings = [];
const state = { scanned: 0, readErrors: [] };

await walk(DATA_PATH, findings, state);

const result = {
  ok: findings.length === 0,
  dataPath: DATA_PATH,
  scannedFiles: state.scanned,
  maxFiles: MAX_FILES,
  nulFileCount: findings.length,
  findings,
  readErrors: state.readErrors.slice(0, 50),
  remediation: {
    quarantineDryRun: 'node scripts/quarantine-corrupt-json.js --dry-run --json',
    quarantineConfirmAfterBackup: 'node scripts/backup.js && node scripts/quarantine-corrupt-json.js --confirm --json',
    verifyAfterQuarantine: 'node scripts/verify-data-json.js --strict --json',
  },
  generatedAt: new Date().toISOString(),
};

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('\n🔎 NUL JSON file scan\n');
  console.log(`Data path: ${DATA_PATH}`);
  console.log(`Scanned: ${state.scanned}`);
  console.log(`Files with NUL bytes: ${findings.length}`);

  if (findings.length > 0) {
    console.log('\nFindings:');
    for (const f of findings.slice(0, 50)) {
      console.log(`- ${f.path} collection=${f.collection || '-'} size=${f.sizeBytes} nulIndex=${f.nulIndex} nulCount=${f.nulCount}`);
    }
  }

  console.log('');
}

if (!result.ok && STRICT) process.exit(1);
process.exit(0);
