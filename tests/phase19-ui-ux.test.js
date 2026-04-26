// tests/phase19-ui-ux.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 19 — UI/UX Revolution: Design Tokens + Toast + Skeleton +
//            Bottom Nav + Animations + Payment Concurrency Fix (~30 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

let config;

before(async () => {
  config = (await import('../config.js')).default;
});

// ── Helper ──────────────────────────────────────────────────
async function fileExists(path) {
  try {
    await access(resolve(path));
    return true;
  } catch {
    return false;
  }
}

async function readFrontend(relativePath) {
  return await readFile(resolve('frontend', relativePath), 'utf-8');
}

// ══════════════════════════════════════════════════════════════
// Config & Version
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — Config & Version', () => {

  it('P19-01: package.json version is 0.25.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.36.0');
  });

  it('P19-02: PWA cacheName is yawmia-v0.25.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.36.0');
  });

  it('P19-03: Router has 59 routes (unchanged)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 93, `expected 74 routes, got ${routeMatches.length}`);
  });

  it('P19-04: Config has 38 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 52, `expected 43 config sections, got ${keys.length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// New File Existence
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — New Files', () => {

  it('P19-05: tokens.css exists', async () => {
    assert.ok(await fileExists('frontend/assets/css/tokens.css'));
  });

  it('P19-06: toast.js exists', async () => {
    assert.ok(await fileExists('frontend/assets/js/toast.js'));
  });
});

// ══════════════════════════════════════════════════════════════
// tokens.css Content
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — Design Tokens', () => {

  it('P19-07: tokens.css contains --elevation-0', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--elevation-0'), 'should define --elevation-0');
  });

  it('P19-08: tokens.css contains --elevation-3', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--elevation-3'), 'should define --elevation-3');
  });

  it('P19-09: tokens.css contains --space-1 through --space-16', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--space-1:'), 'should define --space-1');
    assert.ok(content.includes('--space-16:'), 'should define --space-16');
  });

  it('P19-10: tokens.css contains --text-xs through --text-4xl', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--text-xs:'), 'should define --text-xs');
    assert.ok(content.includes('--text-4xl:'), 'should define --text-4xl');
  });

  it('P19-11: tokens.css contains --radius-full', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--radius-full:'), 'should define --radius-full');
  });

  it('P19-12: tokens.css contains --shadow-glow', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--shadow-glow:'), 'should define --shadow-glow');
  });

  it('P19-13: tokens.css contains --z-toast', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--z-toast:'), 'should define --z-toast');
  });

  it('P19-14: tokens.css contains --safe-bottom', async () => {
    const content = await readFrontend('assets/css/tokens.css');
    assert.ok(content.includes('--safe-bottom:'), 'should define --safe-bottom');
  });
});

// ══════════════════════════════════════════════════════════════
// SW Integration
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — Service Worker', () => {

  it('P19-15: sw.js STATIC_ASSETS includes tokens.css', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes('/assets/css/tokens.css'), 'should cache tokens.css');
  });

  it('P19-16: sw.js STATIC_ASSETS includes toast.js', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes('/assets/js/toast.js'), 'should cache toast.js');
  });

  it('P19-17: sw.js CACHE_NAME is yawmia-v0.25.0', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes("'yawmia-v0.36.0'"), 'cache name should be yawmia-v0.25.0');
  });
});

// ══════════════════════════════════════════════════════════════
// CSS New Styles
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — CSS New Styles', () => {

  it('P19-18: style.css contains .toast-container', async () => {
    const content = await readFrontend('assets/css/style.css');
    assert.ok(content.includes('.toast-container'), 'should have toast-container styles');
  });

  it('P19-19: style.css contains .skeleton', async () => {
    const content = await readFrontend('assets/css/style.css');
    assert.ok(content.includes('.skeleton'), 'should have skeleton styles');
  });

  it('P19-20: style.css contains @keyframes skeleton-pulse', async () => {
    const content = await readFrontend('assets/css/style.css');
    assert.ok(content.includes('@keyframes skeleton-pulse'), 'should have skeleton-pulse animation');
  });

  it('P19-21: style.css contains .bottom-nav', async () => {
    const content = await readFrontend('assets/css/style.css');
    assert.ok(content.includes('.bottom-nav'), 'should have bottom-nav styles');
  });

  it('P19-22: style.css contains @keyframes slide-up-fade', async () => {
    const content = await readFrontend('assets/css/style.css');
    assert.ok(content.includes('@keyframes slide-up-fade'), 'should have slide-up-fade animation');
  });

  it('P19-23: style.css contains .job-card[data-status]', async () => {
    const content = await readFrontend('assets/css/style.css');
    assert.ok(content.includes('.job-card[data-status='), 'should have data-status styles');
  });
});

// ══════════════════════════════════════════════════════════════
// HTML Structure
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — HTML Structure', () => {

  it('P19-24: dashboard.html contains bottom-nav element', async () => {
    const content = await readFrontend('dashboard.html');
    assert.ok(content.includes('bottom-nav'), 'should have bottom-nav');
  });

  it('P19-25: profile.html contains bottom-nav element', async () => {
    const content = await readFrontend('profile.html');
    assert.ok(content.includes('bottom-nav'), 'should have bottom-nav');
  });

  it('P19-26: dashboard.html includes tokens.css link', async () => {
    const content = await readFrontend('dashboard.html');
    assert.ok(content.includes('tokens.css'), 'should link tokens.css');
  });

  it('P19-27: dashboard.html includes toast.js script', async () => {
    const content = await readFrontend('dashboard.html');
    assert.ok(content.includes('toast.js'), 'should include toast.js');
  });
});

// ══════════════════════════════════════════════════════════════
// Code Quality
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — Code Quality', () => {

  it('P19-28: jobs.js does NOT contain alert(', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    // Should not have any raw alert() calls
    const alertMatches = content.match(/[^.]alert\s*\(/g);
    assert.ok(!alertMatches, `jobs.js should have 0 alert() calls, found: ${alertMatches ? alertMatches.length : 0}`);
  });

  it('P19-29: profile.js does NOT contain alert(', async () => {
    const content = await readFile(resolve('frontend/assets/js/profile.js'), 'utf-8');
    const alertMatches = content.match(/[^.]alert\s*\(/g);
    assert.ok(!alertMatches, `profile.js should have 0 alert() calls, found: ${alertMatches ? alertMatches.length : 0}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Payment Concurrency
// ══════════════════════════════════════════════════════════════

describe('Phase 19 — Payment Concurrency', () => {

  it('P19-30: payments.js imports withLock', async () => {
    const content = await readFile(resolve('server/services/payments.js'), 'utf-8');
    assert.ok(content.includes("import { withLock } from './resourceLock.js'"), 'should import withLock');
  });
});
