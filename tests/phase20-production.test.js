// tests/phase20-production.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 20 — Production Infrastructure: Config, Audit, Health,
//            SafeReadJSON, API Docs (~25 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

let config;
let tmpDir;

before(async () => {
  config = (await import('../config.js')).default;
});

async function fileExists(path) {
  try {
    await access(resolve(path));
    return true;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// Config & Version
// ══════════════════════════════════════════════════════════════

describe('Phase 20 — Config & Version', () => {

  it('P20-01: package.json version is 0.21.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.23.0');
  });

  it('P20-02: PWA cacheName is yawmia-v0.23.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.23.0');
  });

  it('P20-03: Config has 34 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 36, `expected 36 config sections, got ${keys.length}`);
  });

  it('P20-04: ENV section exists with correct fields', () => {
    assert.ok(config.ENV, 'ENV section should exist');
    assert.strictEqual(typeof config.ENV.current, 'string');
    assert.strictEqual(typeof config.ENV.isProduction, 'boolean');
    assert.strictEqual(typeof config.ENV.isDevelopment, 'boolean');
    assert.strictEqual(typeof config.ENV.isStaging, 'boolean');
  });

  it('P20-05: AUDIT section exists with correct fields', () => {
    assert.ok(config.AUDIT, 'AUDIT section should exist');
    assert.strictEqual(config.AUDIT.enabled, true);
    assert.strictEqual(typeof config.AUDIT.maxEntriesPerPage, 'number');
    assert.strictEqual(typeof config.AUDIT.retentionDays, 'number');
  });

  it('P20-06: DATABASE.dirs has audit key', () => {
    assert.ok(config.DATABASE.dirs.audit, 'DATABASE.dirs should have audit key');
    assert.strictEqual(config.DATABASE.dirs.audit, 'audit');
  });

  it('P20-07: Router has 62 routes', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 70, `expected 70 routes, got ${routeMatches.length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Audit Log Service
// ══════════════════════════════════════════════════════════════

describe('Phase 20 — Audit Log Service', () => {

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-audit-test-'));
    const dirs = ['audit'];
    for (const d of dirs) {
      await mkdir(join(tmpDir, d), { recursive: true });
    }
    process.env.YAWMIA_DATA_PATH = tmpDir;
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  });

  it('P20-08: auditLog.js exports logAction', async () => {
    const mod = await import('../server/services/auditLog.js');
    assert.strictEqual(typeof mod.logAction, 'function');
  });

  it('P20-09: auditLog.js exports listActions', async () => {
    const mod = await import('../server/services/auditLog.js');
    assert.strictEqual(typeof mod.listActions, 'function');
  });

  it('P20-10: logAction creates audit record with aud_ prefix', async () => {
    // Need fresh import with tmp data path
    const db = await import('../server/services/database.js');
    await db.initDatabase();
    const { logAction } = await import('../server/services/auditLog.js');
    const record = await logAction({
      adminId: 'admin_test',
      action: 'user_banned',
      targetType: 'user',
      targetId: 'usr_testuser',
      details: { reason: 'test ban' },
      ip: '127.0.0.1',
    });
    assert.ok(record);
    assert.ok(record.id.startsWith('aud_'), 'ID should start with aud_');
  });

  it('P20-11: listActions returns paginated results', async () => {
    const { listActions } = await import('../server/services/auditLog.js');
    const result = await listActions({ page: 1, limit: 10 });
    assert.ok(result);
    assert.ok(Array.isArray(result.actions));
    assert.strictEqual(typeof result.total, 'number');
    assert.strictEqual(typeof result.totalPages, 'number');
    assert.strictEqual(typeof result.page, 'number');
    assert.strictEqual(typeof result.limit, 'number');
  });

  it('P20-12: audit record has required fields', async () => {
    const { listActions } = await import('../server/services/auditLog.js');
    const result = await listActions({ page: 1, limit: 10 });
    assert.ok(result.actions.length > 0, 'should have at least one record');
    const record = result.actions[0];
    assert.ok(record.id, 'should have id');
    assert.ok(record.adminId, 'should have adminId');
    assert.ok(record.action, 'should have action');
    assert.ok(record.targetType, 'should have targetType');
    assert.ok(record.targetId, 'should have targetId');
    assert.ok(record.createdAt, 'should have createdAt');
  });
});

// ══════════════════════════════════════════════════════════════
// Database Enhancement — safeReadJSON
// ══════════════════════════════════════════════════════════════

describe('Phase 20 — safeReadJSON', () => {
  let safeTmpDir;

  before(async () => {
    safeTmpDir = await mkdtemp(join(tmpdir(), 'yawmia-safe-json-test-'));
  });

  after(async () => {
    if (safeTmpDir) await rm(safeTmpDir, { recursive: true, force: true });
  });

  it('P20-13: database.js exports safeReadJSON', async () => {
    const db = await import('../server/services/database.js');
    assert.strictEqual(typeof db.safeReadJSON, 'function');
  });

  it('P20-14: safeReadJSON returns null for ENOENT', async () => {
    const db = await import('../server/services/database.js');
    const result = await db.safeReadJSON(join(safeTmpDir, 'nonexistent.json'));
    assert.strictEqual(result, null);
  });

  it('P20-15: safeReadJSON recovers from corrupted JSON when .tmp exists', async () => {
    const db = await import('../server/services/database.js');
    const filePath = join(safeTmpDir, 'corrupted.json');
    const tmpPath = filePath + '.tmp';

    // Write corrupted main file
    await writeFile(filePath, '{"broken":', 'utf-8');
    // Write valid .tmp backup
    await writeFile(tmpPath, '{"name":"recovered","value":42}', 'utf-8');

    const result = await db.safeReadJSON(filePath);
    assert.ok(result, 'should recover data');
    assert.strictEqual(result.name, 'recovered');
    assert.strictEqual(result.value, 42);

    // Verify the main file was restored
    const restored = await db.readJSON(filePath);
    assert.strictEqual(restored.name, 'recovered');
  });

  it('P20-16: safeReadJSON returns null for unrecoverable corruption', async () => {
    const db = await import('../server/services/database.js');
    const filePath = join(safeTmpDir, 'unrecoverable.json');

    // Write corrupted main file (no .tmp exists)
    await writeFile(filePath, '{bad json!!!', 'utf-8');

    const result = await db.safeReadJSON(filePath);
    assert.strictEqual(result, null);
  });
});

// ══════════════════════════════════════════════════════════════
// Logger Enhancement
// ══════════════════════════════════════════════════════════════

describe('Phase 20 — Logger', () => {

  it('P20-17: logger.js formatMessage handles production mode', async () => {
    const content = await readFile(resolve('server/services/logger.js'), 'utf-8');
    assert.ok(content.includes('config.ENV'), 'should reference config.ENV');
    assert.ok(content.includes('isProduction'), 'should check isProduction');
    assert.ok(content.includes('JSON.stringify(entry)'), 'should JSON stringify in production');
  });

  it('P20-18: logger.js preserves human-readable format for development', async () => {
    const content = await readFile(resolve('server/services/logger.js'), 'utf-8');
    assert.ok(content.includes('[${level.toUpperCase()}]'), 'should have human-readable format');
  });
});

// ══════════════════════════════════════════════════════════════
// Health Endpoint & API Docs (Static Analysis)
// ══════════════════════════════════════════════════════════════

describe('Phase 20 — Health & Docs (Source Check)', () => {

  it('P20-19: health handler includes environment field', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("environment:"), 'health should include environment');
  });

  it('P20-20: health handler version is 0.21.0', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("version: '0.23.0'"), 'version should be 0.23.0');
  });

  it('P20-21: /api/docs route exists', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/docs'"), 'should have /api/docs route');
  });

  it('P20-22: /api/docs handler returns method and path', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes('r.method'), 'docs should map method');
    assert.ok(content.includes('r.path'), 'docs should map path');
  });

  it('P20-23: /api/admin/audit-log route exists', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/admin/audit-log'"), 'should have audit-log route');
  });
});

// ══════════════════════════════════════════════════════════════
// File Existence
// ══════════════════════════════════════════════════════════════

describe('Phase 20 — File Existence', () => {

  it('P20-24: server/services/auditLog.js exists', async () => {
    assert.ok(await fileExists('server/services/auditLog.js'));
  });

  it('P20-25: sw.js CACHE_NAME is yawmia-v0.22.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.23.0'"), 'cache name should be yawmia-v0.23.0');
  });
});
