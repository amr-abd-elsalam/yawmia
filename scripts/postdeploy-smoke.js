#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/postdeploy-smoke.js — Post-Deploy Smoke Tests (Phase 57)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/postdeploy-smoke.js --base=http://localhost:3002
//   ADMIN_TOKEN=xxx node scripts/postdeploy-smoke.js --base=https://example.com
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

const BASE = (getArg('base', '') || `http://localhost:${process.env.PORT || 3002}`).replace(/\/+$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const JSON_OUT = process.argv.includes('--json');
const DEFAULT_TIMEOUT_MS = Number.parseInt(getArg('timeout-ms', '5000'), 10) || 5000;
const ADMIN_TIMEOUT_MS = Number.parseInt(getArg('admin-timeout-ms', '3500'), 10) || 3500;

async function check(name, path, options = {}) {
  const url = BASE + path;
  const started = Date.now();

  try {
    const headers = options.admin && ADMIN_TOKEN ? { 'X-Admin-Token': ADMIN_TOKEN } : {};
    const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS) });
    const durationMs = Date.now() - started;

    const ok = options.allowStatuses
      ? options.allowStatuses.includes(res.status)
      : res.status >= 200 && res.status < 400;

    return {
      name,
      path,
      ok,
      status: res.status,
      durationMs,
    };
  } catch (err) {
    return {
      name,
      path,
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      error: err.message,
    };
  }
}

async function main() {
  if (!JSON_OUT) {
    console.log(`\n🚬 يوميّة Post-Deploy Smoke\n`);
    console.log(`Base: ${BASE}\n`);
  }

  const checks = [
    ['health', '/api/health'],
    ['config', '/api/config'],
    ['docs', '/api/docs'],
    ['home', '/'],
    ['dashboard', '/dashboard.html'],
    ['manifest', '/manifest.json'],
  ];

  if (ADMIN_TOKEN) {
    checks.push(['admin readiness', '/api/admin/production/readiness', { admin: true, timeoutMs: ADMIN_TIMEOUT_MS }]);
    checks.push(['admin ops slo', '/api/admin/ops/slo', { admin: true, timeoutMs: ADMIN_TIMEOUT_MS }]);
    checks.push(['admin scale hygiene', '/api/admin/scale-hygiene/overview', { admin: true, timeoutMs: ADMIN_TIMEOUT_MS }]);
    checks.push(['admin marketplace intelligence', '/api/admin/marketplace-intelligence/dashboard', { admin: true, timeoutMs: ADMIN_TIMEOUT_MS }]);
  }

  const results = [];
  for (const row of checks) {
    const [name, path, options] = row;
    const result = await check(name, path, options || {});
    results.push(result);

    if (!JSON_OUT) {
      const icon = result.ok ? '✅' : '❌';
      console.log(`${icon} ${name}: ${result.status} (${result.durationMs}ms) ${result.error || ''}`);
    }
  }

  const failed = results.filter(r => !r.ok);

  const output = {
    ok: failed.length === 0,
    base: BASE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    adminTimeoutMs: ADMIN_TIMEOUT_MS,
    results,
    failed,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('');
    if (failed.length > 0) {
      console.log(`❌ Smoke failed: ${failed.length} check(s) failed`);
      process.exit(1);
    }

    console.log('✅ Post-deploy smoke passed\n');
  }

  if (failed.length > 0) process.exit(1);
}

main().catch(err => {
  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: false,
      base: BASE,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      adminTimeoutMs: ADMIN_TIMEOUT_MS,
      error: err.message,
      stack: err.stack,
      generatedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    console.error('\n❌ Smoke script failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
