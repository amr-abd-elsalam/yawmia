// ═══════════════════════════════════════════════════════════════
// server/services/migrationSnapshotValidation.js — Snapshot Validation (Phase 60)
// ═══════════════════════════════════════════════════════════════
// Validates Phase 59 migration snapshots without mutating source data.
// Checks manifest, NDJSON, counts, checksums, redaction, reference samples.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import config from '../../config.js';

function nowIso() {
  return new Date().toISOString();
}

function cfg() {
  return config.MIGRATION_SNAPSHOT_VALIDATION || {};
}

function forbiddenRegex() {
  return new RegExp(cfg().forbiddenKeysRegex || '(token|secret|password|apiKey|api_key|authorization|vapidPrivateKey)', 'i');
}

function sha256File(filePath) {
  return new Promise((resolvePromise, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

async function lineByLine(filePath, onLine) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (!line.trim()) continue;
    await onLine(line, lineNo);
    if (lineNo % 500 === 0) {
      await new Promise(resolvePromise => setImmediate(resolvePromise));
    }
  }

  return lineNo;
}

function hasForbiddenKeys(obj, path = '') {
  const hits = [];
  const rx = forbiddenRegex();

  function walk(value, currentPath) {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${currentPath}[${i}]`);
      }
      return;
    }

    for (const [key, val] of Object.entries(value)) {
      const p = currentPath ? `${currentPath}.${key}` : key;

      if (rx.test(key)) {
        hits.push({ path: p, key });
      }

      if (typeof val === 'string') {
        const looksBase64Image =
          val.startsWith('data:image/') ||
          (/^[A-Za-z0-9+/=]{200,}$/.test(val) && val.length > (cfg().rawBase64WarningKB || 32) * 1024);

        if (looksBase64Image) {
          hits.push({ path: p, key, reason: 'raw_base64_or_image_payload' });
        }
      }

      walk(val, p);
    }
  }

  walk(obj, path);
  return hits;
}

export async function validateManifest(snapshotPath, options = {}) {
  const errors = [];
  const warnings = [];
  const full = resolve(snapshotPath || '');
  const manifestPath = join(full, 'manifest.json');

  let manifest = null;

  try {
    const raw = await readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch (err) {
    errors.push({
      check: 'manifest',
      code: 'MANIFEST_READ_FAILED',
      message: err.message,
    });
    return { ok: false, manifest: null, errors, warnings };
  }

  if (!manifest || typeof manifest !== 'object') {
    errors.push({ check: 'manifest', code: 'MANIFEST_INVALID', message: 'manifest is not an object' });
  }

  if (!manifest.collections || typeof manifest.collections !== 'object') {
    errors.push({ check: 'manifest', code: 'MANIFEST_COLLECTIONS_MISSING', message: 'manifest.collections missing' });
  }

  if (cfg().requireChecksums && manifest.collections) {
    for (const [name, row] of Object.entries(manifest.collections)) {
      if (!row.sha256) {
        errors.push({
          check: 'manifest',
          code: 'COLLECTION_CHECKSUM_MISSING',
          collection: name,
        });
      }
      if (!row.file) {
        errors.push({
          check: 'manifest',
          code: 'COLLECTION_FILE_MISSING',
          collection: name,
        });
      }
    }
  }

  return { ok: errors.length === 0, manifest, errors, warnings };
}

export async function validateNdjsonFile(filePath, options = {}) {
  const errors = [];
  const warnings = [];
  let count = 0;

  try {
    await stat(filePath);
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      count: 0,
      errors: [{ check: 'ndjson', code: 'FILE_NOT_FOUND', filePath, message: err.message }],
      warnings,
    };
  }

  try {
    await lineByLine(filePath, async (line, lineNo) => {
      try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          warnings.push({ check: 'ndjson', code: 'LINE_NOT_OBJECT', filePath, lineNo });
        }
        count++;
      } catch (err) {
        errors.push({
          check: 'ndjson',
          code: 'INVALID_JSON_LINE',
          filePath,
          lineNo,
          message: err.message,
        });
      }
    });
  } catch (err) {
    errors.push({ check: 'ndjson', code: 'READ_FAILED', filePath, message: err.message });
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? 'passed' : 'failed',
    count,
    errors,
    warnings,
  };
}

export async function validateSnapshotChecksums(snapshotPath, manifest, options = {}) {
  const errors = [];
  const warnings = [];
  const checksums = {};

  if (!manifest || !manifest.collections) {
    return { ok: false, checksums, errors: [{ check: 'checksums', code: 'MANIFEST_MISSING' }], warnings };
  }

  for (const [name, row] of Object.entries(manifest.collections)) {
    if (!row || !row.file) continue;
    const filePath = join(snapshotPath, row.file);

    if (!row.sha256) {
      warnings.push({ check: 'checksums', code: 'CHECKSUM_NOT_DECLARED', collection: name });
      continue;
    }

    try {
      const actual = await sha256File(filePath);
      checksums[name] = { expected: row.sha256, actual };
      if (actual !== row.sha256) {
        errors.push({
          check: 'checksums',
          code: 'CHECKSUM_MISMATCH',
          collection: name,
          expected: row.sha256,
          actual,
        });
      }
    } catch (err) {
      errors.push({
        check: 'checksums',
        code: 'CHECKSUM_FAILED',
        collection: name,
        message: err.message,
      });
    }
  }

  return { ok: errors.length === 0, checksums, errors, warnings };
}

export async function validateSnapshotRedaction(snapshotPath, manifest, options = {}) {
  const errors = [];
  const warnings = [];
  const redaction = { scannedRecords: 0, hits: [] };

  if (!manifest || !manifest.collections) {
    return { ok: false, redaction, errors: [{ check: 'redaction', code: 'MANIFEST_MISSING' }], warnings };
  }

  for (const [name, row] of Object.entries(manifest.collections)) {
    if (!row || !row.file || !row.file.endsWith('.ndjson')) continue;

    const filePath = join(snapshotPath, row.file);

    try {
      await lineByLine(filePath, async (line, lineNo) => {
        let obj;
        try {
          obj = JSON.parse(line);
        } catch (_) {
          return;
        }

        redaction.scannedRecords++;
        const hits = hasForbiddenKeys(obj);
        for (const hit of hits) {
          const item = { collection: name, lineNo, ...hit };
          redaction.hits.push(item);
          errors.push({
            check: 'redaction',
            code: hit.reason === 'raw_base64_or_image_payload' ? 'RAW_BASE64_PAYLOAD' : 'FORBIDDEN_KEY',
            ...item,
          });
        }
      });
    } catch (err) {
      errors.push({
        check: 'redaction',
        code: 'REDACTION_SCAN_FAILED',
        collection: name,
        message: err.message,
      });
    }
  }

  return { ok: errors.length === 0, redaction, errors, warnings };
}

export async function validateReferentialIntegrity(snapshotPath, manifest, options = {}) {
  const errors = [];
  const warnings = [];
  const references = {
    users: new Set(),
    jobs: new Set(),
    checked: 0,
    missing: [],
  };

  const sampleLimit = Number(options.sampleReferenceCheckLimit || cfg().sampleReferenceCheckLimit || 1000);

  async function loadIds(collectionName, set) {
    const row = manifest.collections?.[collectionName];
    if (!row || !row.file) return;

    const filePath = join(snapshotPath, row.file);
    await lineByLine(filePath, async (line) => {
      if (set.size >= sampleLimit) return;
      try {
        const obj = JSON.parse(line);
        if (obj && obj.id) set.add(obj.id);
      } catch (_) {}
    });
  }

  if (!manifest || !manifest.collections) {
    return { ok: false, references: {}, errors: [{ check: 'references', code: 'MANIFEST_MISSING' }], warnings };
  }

  try {
    await loadIds('users', references.users);
    await loadIds('jobs', references.jobs);
  } catch (err) {
    warnings.push({ check: 'references', code: 'REFERENCE_ID_LOAD_FAILED', message: err.message });
  }

  async function checkCollection(collectionName, rules) {
    const row = manifest.collections?.[collectionName];
    if (!row || !row.file) return;

    const filePath = join(snapshotPath, row.file);
    let checkedInCollection = 0;

    await lineByLine(filePath, async (line, lineNo) => {
      if (checkedInCollection >= sampleLimit) return;
      let obj;
      try { obj = JSON.parse(line); } catch (_) { return; }

      checkedInCollection++;
      references.checked++;

      for (const rule of rules) {
        const value = obj[rule.field];
        if (!value) continue;
        const targetSet = rule.target === 'users' ? references.users : references.jobs;
        if (targetSet.size > 0 && !targetSet.has(value)) {
          const miss = {
            collection: collectionName,
            lineNo,
            field: rule.field,
            value,
            target: rule.target,
          };
          references.missing.push(miss);
          warnings.push({ check: 'references', code: 'REFERENCE_NOT_FOUND_IN_SAMPLE', ...miss });
        }
      }
    });
  }

  try {
    await checkCollection('jobs', [{ field: 'employerId', target: 'users' }]);
    await checkCollection('applications', [
      { field: 'jobId', target: 'jobs' },
      { field: 'workerId', target: 'users' },
    ]);
    await checkCollection('payments', [
      { field: 'jobId', target: 'jobs' },
      { field: 'employerId', target: 'users' },
    ]);
    await checkCollection('messages', [
      { field: 'jobId', target: 'jobs' },
      { field: 'senderId', target: 'users' },
      { field: 'recipientId', target: 'users' },
    ]);
    await checkCollection('direct_offers', [
      { field: 'employerId', target: 'users' },
      { field: 'workerId', target: 'users' },
    ]);
  } catch (err) {
    warnings.push({ check: 'references', code: 'REFERENCE_SCAN_FAILED', message: err.message });
  }

  return {
    ok: errors.length === 0,
    references: {
      usersSample: references.users.size,
      jobsSample: references.jobs.size,
      checked: references.checked,
      missing: references.missing.slice(0, 100),
    },
    errors,
    warnings,
  };
}

export async function validateMigrationSnapshot(snapshotPath, options = {}) {
  const started = Date.now();
  const fullPath = resolve(snapshotPath || '');
  const errors = [];
  const warnings = [];
  const counts = {};

  const manifestResult = await validateManifest(fullPath, options);
  errors.push(...manifestResult.errors);
  warnings.push(...manifestResult.warnings);

  const manifest = manifestResult.manifest;

  if (!manifest) {
    return {
      ok: false,
      status: 'failed',
      snapshotPath: fullPath,
      errors,
      warnings,
      counts,
      generatedAt: nowIso(),
      durationMs: Date.now() - started,
    };
  }

  if (cfg().validateNdjson !== false && manifest.collections) {
    for (const [name, row] of Object.entries(manifest.collections)) {
      if (!row || !row.file || !row.file.endsWith('.ndjson')) continue;

      const filePath = join(fullPath, row.file);
      const result = await validateNdjsonFile(filePath, options);

      counts[name] = {
        manifestCount: row.count || 0,
        actualCount: result.count,
      };

      if (typeof row.count === 'number' && row.count !== result.count) {
        warnings.push({
          check: 'counts',
          code: 'COUNT_MISMATCH',
          collection: name,
          manifestCount: row.count,
          actualCount: result.count,
        });
      }

      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }

  let checksumResult = { ok: true, checksums: {}, errors: [], warnings: [] };
  if (cfg().requireChecksums !== false) {
    checksumResult = await validateSnapshotChecksums(fullPath, manifest, options);
    errors.push(...checksumResult.errors);
    warnings.push(...checksumResult.warnings);
  }

  let redactionResult = { ok: true, redaction: {}, errors: [], warnings: [] };
  if (cfg().validateRedaction !== false) {
    redactionResult = await validateSnapshotRedaction(fullPath, manifest, options);
    errors.push(...redactionResult.errors);
    warnings.push(...redactionResult.warnings);
  }

  let referenceResult = { ok: true, references: {}, errors: [], warnings: [] };
  if (cfg().validateReferentialIntegrity !== false) {
    referenceResult = await validateReferentialIntegrity(fullPath, manifest, options);
    errors.push(...referenceResult.errors);
    warnings.push(...referenceResult.warnings);
  }

  const status = errors.length > 0 ? 'failed' : (warnings.length > 0 ? 'warning' : 'passed');

  return {
    ok: errors.length === 0,
    status,
    snapshotPath: fullPath,
    manifest: {
      formatVersion: manifest.formatVersion || null,
      phase: manifest.phase || null,
      createdAt: manifest.createdAt || null,
      source: manifest.source || null,
    },
    errors,
    warnings,
    counts,
    checksums: checksumResult.checksums,
    redaction: redactionResult.redaction,
    references: referenceResult.references,
    generatedAt: nowIso(),
    durationMs: Date.now() - started,
  };
}

export const _testHelpers = {
  forbiddenRegex,
  hasForbiddenKeys,
  sha256File,
};
