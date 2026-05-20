#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-file-health.js — File Health Scanner (Phase 57)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-file-health.js
//   node scripts/verify-file-health.js --strict
//   node scripts/verify-file-health.js --json
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

const config = (await import('../config.js')).default;
const DATA_DIR = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const FH = config.FILE_HEALTH || {};
const BATCH_SIZE = FH.batchSize || 250;
const MAX_FILES = FH.maxFilesPerScan || 200000;

function nowMs() {
  return Date.now();
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
    } else if (entry.isFile()) {
      out.push({ filePath: full, fileName: entry.name });
    }

    if (out.length % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return out;
}

function isLikelyBase64String(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('data:image/') && value.includes(';base64,')) return true;
  if (value.length < (FH.embeddedBase64WarningKB || 256) * 1024) return false;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 2048));
}

function findBase64Fields(obj, prefix = '', out = []) {
  if (!obj || typeof obj !== 'object') return out;

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string' && isLikelyBase64String(value)) {
      out.push(path);
    } else if (value && typeof value === 'object') {
      findBase64Fields(value, path, out);
    }

    if (out.length >= 20) break;
  }

  return out;
}

async function readJsonSafe(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    if (!raw) return { ok: false, zero: true };
    return { ok: true, data: JSON.parse(raw), raw };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkCriticalIndexes(result) {
  const required = [
    config.DATABASE.indexFiles.phoneIndex,
    config.DATABASE.indexFiles.jobsIndex,
  ];

  for (const rel of required) {
    const filePath = join(DATA_DIR, rel);
    const parsed = await readJsonSafe(filePath);
    if (!parsed.ok) {
      result.issues.push({
        type: 'missing_or_invalid_critical_index',
        filePath,
        severity: 'critical',
        error: parsed.error || (parsed.zero ? 'zero-byte' : 'invalid'),
      });
    }
  }
}

async function checkQueueSummary(result) {
  const filePath = join(DATA_DIR, config.QUEUE_STORAGE?.summaryFile || 'metrics/queue/summary.json');
  const parsed = await readJsonSafe(filePath);
  if (!parsed.ok) return;

  if (parsed.data && parsed.data.stale) {
    result.issues.push({
      type: 'queue_summary_stale',
      filePath,
      severity: 'warning',
      staleReason: parsed.data.staleReason || null,
    });
  }
}

async function checkAuditIndex(result) {
  const filePath = join(DATA_DIR, config.AUDIT_INDEX?.basePath || 'audit/indexes', 'meta.json');
  const parsed = await readJsonSafe(filePath);
  if (!parsed.ok) return;

  if (parsed.data && parsed.data.stale) {
    result.issues.push({
      type: 'audit_index_stale',
      filePath,
      severity: 'warning',
      staleReason: parsed.data.staleReason || null,
    });
  }
}

async function checkMarketplaceRollup(result) {
  try {
    const { getMarketplaceRollupFreshness } = await import('../server/services/marketplaceIntelligenceRollups.js');
    const freshness = await getMarketplaceRollupFreshness();
    if (freshness.enabled && freshness.stale) {
      result.issues.push({
        type: 'marketplace_rollup_stale',
        severity: 'warning',
        freshness,
      });
    }
  } catch (_) {
    // optional
  }
}

async function scan() {
  const files = await walk(DATA_DIR);

  const result = {
    ok: true,
    strict: STRICT,
    root: DATA_DIR,
    scanned: 0,
    jsonFiles: 0,
    tmpFiles: 0,
    staleTmp: 0,
    largeJson: 0,
    criticalLargeJson: 0,
    embeddedBase64: 0,
    unreadable: 0,
    unreadableDirs: 0,
    maxFilesReached: files.length >= MAX_FILES,
    issues: [],
    generatedAt: new Date().toISOString(),
  };

  const staleWarnMs = (FH.staleTmpWarningMinutes || 10) * 60 * 1000;
  const staleCritMs = (FH.staleTmpCriticalMinutes || 60) * 60 * 1000;
  const largeWarnBytes = (FH.largeJsonWarningKB || 1024) * 1024;
  const largeCritBytes = (FH.largeJsonCriticalKB || 4096) * 1024;
  const currentMs = nowMs();

  for (let i = 0; i < files.length; i++) {
    const item = files[i];

    if (item.unreadableDir) {
      result.unreadableDirs++;
      result.issues.push({
        type: 'unreadable_dir',
        filePath: item.filePath,
        severity: 'warning',
        error: item.error,
      });
      continue;
    }

    result.scanned++;

    let st;
    try {
      st = await stat(item.filePath);
    } catch (err) {
      result.unreadable++;
      result.issues.push({
        type: 'unreadable_file',
        filePath: item.filePath,
        severity: 'warning',
        error: err.message,
      });
      continue;
    }

    if (item.fileName.endsWith('.tmp')) {
      result.tmpFiles++;
      const ageMs = currentMs - st.mtime.getTime();
      if (ageMs >= staleWarnMs) {
        result.staleTmp++;
        result.issues.push({
          type: 'stale_tmp',
          filePath: item.filePath,
          ageMinutes: Math.round(ageMs / 60000),
          severity: ageMs >= staleCritMs ? 'critical' : 'warning',
        });
      }
      continue;
    }

    if (!item.fileName.endsWith('.json')) continue;
    result.jsonFiles++;

    if (st.size === 0) {
      result.issues.push({
        type: 'zero_byte_json',
        filePath: item.filePath,
        severity: FH.zeroByteJsonIsCritical === false ? 'warning' : 'critical',
      });
      continue;
    }

    if (st.size >= largeWarnBytes) {
      const isCritical = st.size >= largeCritBytes;
      if (isCritical) result.criticalLargeJson++;
      else result.largeJson++;

      result.issues.push({
        type: isCritical ? 'large_json_critical' : 'large_json_warning',
        filePath: item.filePath,
        sizeKB: Math.round(st.size / 1024),
        severity: isCritical ? 'critical' : 'warning',
      });
    }

    if (FH.embeddedBase64DetectionEnabled !== false) {
      const parsed = await readJsonSafe(item.filePath);
      if (parsed.ok) {
        const fields = findBase64Fields(parsed.data);
        if (fields.length > 0) {
          result.embeddedBase64++;
          result.issues.push({
            type: 'embedded_base64',
            filePath: item.filePath,
            fields,
            severity: 'warning',
          });
        }
      }
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  await checkCriticalIndexes(result);
  await checkQueueSummary(result);
  await checkAuditIndex(result);
  await checkMarketplaceRollup(result);

  result.critical = result.issues.filter(i => i.severity === 'critical').length;
  result.warning = result.issues.filter(i => i.severity === 'warning').length;
  result.ok = result.critical === 0;

  return result;
}

function printHuman(result) {
  console.log('\n🩺 يوميّة File Health Scan\n');
  console.log(`Root: ${result.root}\n`);
  console.log(`Scanned files: ${result.scanned}`);
  console.log(`JSON files: ${result.jsonFiles}`);
  console.log(`TMP files: ${result.tmpFiles}`);
  console.log(`Stale TMP: ${result.staleTmp}`);
  console.log(`Large JSON warnings: ${result.largeJson}`);
  console.log(`Large JSON critical: ${result.criticalLargeJson}`);
  console.log(`Embedded base64: ${result.embeddedBase64}`);
  console.log(`Critical: ${result.critical}`);
  console.log(`Warnings: ${result.warning}`);

  if (result.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of result.issues.slice(0, 60)) {
      const icon = issue.severity === 'critical' ? '❌' : '⚠️';
      console.log(`  ${icon} ${issue.type}: ${issue.filePath || ''}${issue.reason ? ` — ${issue.reason}` : ''}`);
    }
    if (result.issues.length > 60) console.log(`  ... ${result.issues.length - 60} more`);
  }

  console.log(result.ok ? '\n✅ File health scan complete\n' : '\n❌ File health critical issues detected\n');
}

const result = await scan();

if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
else printHuman(result);

if (STRICT && result.critical > 0) process.exit(1);
