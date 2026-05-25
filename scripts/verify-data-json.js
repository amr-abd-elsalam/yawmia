#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-data-json.js — JSON Corruption Scanner (Phase 57)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-data-json.js
//   node scripts/verify-data-json.js --collection=jobs
//   node scripts/verify-data-json.js --strict
//   node scripts/verify-data-json.js --json
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');
const JSON_OUT = args.has('--json');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

let config = null;
try {
  config = (await import('../config.js')).default;
} catch (_) {
  config = null;
}

const DATA_DIR = process.env.YAWMIA_DATA_PATH || config?.DATABASE?.basePath || './data';
const COLLECTION = getArg('collection', '');
const BATCH_SIZE = config?.FILE_HEALTH?.batchSize || 250;
const MAX_FILES = config?.FILE_HEALTH?.maxFilesPerScan || 200000;

function collectionPath(collection) {
  if (!collection) return DATA_DIR;
  const rel = config?.DATABASE?.dirs?.[collection] || collection;
  return join(DATA_DIR, rel);
}

async function walk(dir, out = []) {
  if (out.length >= MAX_FILES) return out;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    out.push({ filePath: dir, unreadableDir: true, error: err.message });
    return out;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) break;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
      out.push({ filePath: full });
    }

    if (out.length % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return out;
}

async function scan() {
  const root = collectionPath(COLLECTION);
  const files = await walk(root);

  const result = {
    ok: true,
    strict: STRICT,
    collection: COLLECTION || null,
    root,
    scanned: 0,
    invalid: 0,
    zeroByte: 0,
    nullByte: 0,
    unreadable: 0,
    unreadableDirs: 0,
    maxFilesReached: files.length >= MAX_FILES,
    issues: [],
    generatedAt: new Date().toISOString(),
  };

  for (let i = 0; i < files.length; i++) {
    const item = files[i];

    if (item.unreadableDir) {
      result.unreadableDirs++;
      result.issues.push({
        type: 'unreadable_dir',
        filePath: item.filePath,
        error: item.error,
        severity: 'warning',
      });
      continue;
    }

    result.scanned++;

    try {
      const st = await stat(item.filePath);
      if (st.size === 0) {
        result.zeroByte++;
        result.issues.push({
          type: 'zero_byte_json',
          filePath: item.filePath,
          severity: config?.FILE_HEALTH?.zeroByteJsonIsCritical === false ? 'warning' : 'critical',
        });
        continue;
      }

      const rawBuffer = await readFile(item.filePath);
      const firstNullByteIndex = rawBuffer.indexOf(0);
      if (firstNullByteIndex !== -1) {
        let nullByteCount = 0;
        for (const b of rawBuffer) {
          if (b === 0) nullByteCount++;
        }

        result.nullByte++;
        result.issues.push({
          type: 'null_byte_json',
          filePath: item.filePath,
          sizeBytes: st.size,
          nullByteCount,
          firstNullByteIndex,
          severity: 'critical',
        });
        continue;
      }

      const raw = rawBuffer.toString('utf-8');
      JSON.parse(raw);
    } catch (err) {
      if (err.name === 'SyntaxError') {
        result.invalid++;
        result.issues.push({
          type: 'invalid_json',
          filePath: item.filePath,
          error: err.message,
          severity: 'critical',
        });
      } else {
        result.unreadable++;
        result.issues.push({
          type: 'unreadable_json',
          filePath: item.filePath,
          error: err.message,
          severity: 'warning',
        });
      }
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  result.critical = result.issues.filter(i => i.severity === 'critical').length;
  result.warning = result.issues.filter(i => i.severity === 'warning').length;
  result.ok = result.critical === 0 && result.invalid === 0 && result.zeroByte === 0 && result.nullByte === 0;

  return result;
}

function printHuman(result) {
  console.log('\n🧪 يوميّة JSON Health Scan\n');
  console.log(`Root: ${result.root}`);
  if (result.collection) console.log(`Collection: ${result.collection}`);
  console.log('');
  console.log(`Scanned: ${result.scanned}`);
  console.log(`Invalid: ${result.invalid}`);
  console.log(`Zero-byte: ${result.zeroByte}`);
  console.log(`Null-byte: ${result.nullByte}`);
  console.log(`Unreadable: ${result.unreadable}`);
  console.log(`Unreadable dirs: ${result.unreadableDirs}`);
  console.log(`Critical: ${result.critical}`);
  console.log(`Warnings: ${result.warning}`);

  if (result.maxFilesReached) {
    console.log(`\n⚠️ Max files reached; scan was capped.`);
  }

  if (result.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of result.issues.slice(0, 50)) {
      const icon = issue.severity === 'critical' ? '❌' : '⚠️';
      console.log(`  ${icon} ${issue.type}: ${issue.filePath}${issue.error ? ` — ${issue.error}` : ''}`);
    }
    if (result.issues.length > 50) {
      console.log(`  ... ${result.issues.length - 50} more`);
    }
  }

  console.log(result.ok ? '\n✅ JSON health scan complete\n' : '\n❌ JSON health issues detected\n');
}

const result = await scan();

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}

if (STRICT && result.critical > 0) {
  process.exit(1);
}
