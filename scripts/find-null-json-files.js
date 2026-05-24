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

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
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
        out.push({
          path: relative(process.cwd(), full),
          sizeBytes: st.size,
          nulIndex,
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
      console.log(`- ${f.path} size=${f.sizeBytes} nulIndex=${f.nulIndex}`);
    }
  }

  console.log('');
}

if (!result.ok && STRICT) process.exit(1);
process.exit(0);
