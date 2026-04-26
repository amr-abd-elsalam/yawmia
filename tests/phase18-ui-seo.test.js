// tests/phase18-ui-seo.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 18 — UI/UX Foundation: SVG Icons + Semantic HTML + ARIA + SEO (~25 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
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

describe('Phase 18 — Config & Version', () => {

  it('P18-01: package.json version is 0.25.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.36.0');
  });

  it('P18-02: PWA cacheName is yawmia-v0.36.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.36.0');
  });

  it('P18-03: Router has 89 routes', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 100, `expected 89 routes, got ${routeMatches.length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// New Files Existence
// ══════════════════════════════════════════════════════════════

describe('Phase 18 — New Files', () => {

  it('P18-04: robots.txt exists', async () => {
    assert.ok(await fileExists('frontend/robots.txt'));
  });

  it('P18-05: sitemap.xml exists', async () => {
    assert.ok(await fileExists('frontend/sitemap.xml'));
  });

  it('P18-06: 404.html exists', async () => {
    assert.ok(await fileExists('frontend/404.html'));
  });

  it('P18-07: offline.html exists', async () => {
    assert.ok(await fileExists('frontend/offline.html'));
  });

  it('P18-08: icons.js exists', async () => {
    assert.ok(await fileExists('frontend/assets/js/icons.js'));
  });

  it('P18-09: utils.js exists', async () => {
    assert.ok(await fileExists('frontend/assets/js/utils.js'));
  });
});

// ══════════════════════════════════════════════════════════════
// robots.txt Content
// ══════════════════════════════════════════════════════════════

describe('Phase 18 — robots.txt', () => {

  it('P18-10: robots.txt contains Disallow: /api/', async () => {
    const content = await readFrontend('robots.txt');
    assert.ok(content.includes('Disallow: /api/'), 'should disallow /api/');
  });

  it('P18-11: robots.txt contains Sitemap:', async () => {
    const content = await readFrontend('robots.txt');
    assert.ok(content.includes('Sitemap:'), 'should reference sitemap');
  });
});

// ══════════════════════════════════════════════════════════════
// Service Worker Integration
// ══════════════════════════════════════════════════════════════

describe('Phase 18 — Service Worker', () => {

  it('P18-12: sw.js STATIC_ASSETS includes icons.js', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes('/assets/js/icons.js'), 'should cache icons.js');
  });

  it('P18-13: sw.js STATIC_ASSETS includes utils.js', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes('/assets/js/utils.js'), 'should cache utils.js');
  });

  it('P18-14: sw.js STATIC_ASSETS includes robots.txt', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes('/robots.txt'), 'should cache robots.txt');
  });

  it('P18-15: sw.js STATIC_ASSETS includes 404.html', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes('/404.html'), 'should cache 404.html');
  });

  it('P18-16: sw.js STATIC_ASSETS includes offline.html', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes('/offline.html'), 'should cache offline.html');
  });

  it('P18-17: sw.js offline fallback uses offline.html', async () => {
    const content = await readFrontend('sw.js');
    assert.ok(content.includes("caches.match('/offline.html')"), 'should fallback to offline.html');
  });
});

// ══════════════════════════════════════════════════════════════
// Semantic HTML + ARIA
// ══════════════════════════════════════════════════════════════

describe('Phase 18 — Semantic HTML & ARIA', () => {

  it('P18-18: index.html has skip-link', async () => {
    const content = await readFrontend('index.html');
    assert.ok(content.includes('skip-link'), 'should have skip-link class');
    assert.ok(content.includes('#main-content'), 'should link to main-content');
  });

  it('P18-19: dashboard.html has aria-label on nav', async () => {
    const content = await readFrontend('dashboard.html');
    assert.ok(content.includes('aria-label="التنقل الرئيسي"'), 'nav should have aria-label');
  });

  it('P18-20: dashboard.html notification panel has role="dialog"', async () => {
    const content = await readFrontend('dashboard.html');
    assert.ok(content.includes('role="dialog"'), 'notification panel should have role=dialog');
  });

  it('P18-21: dashboard.html notification badge has aria-live', async () => {
    const content = await readFrontend('dashboard.html');
    assert.ok(content.includes('aria-live="polite"'), 'badge should have aria-live');
  });
});

// ══════════════════════════════════════════════════════════════
// SEO Meta Tags
// ══════════════════════════════════════════════════════════════

describe('Phase 18 — SEO', () => {

  it('P18-22: dashboard.html has meta description', async () => {
    const content = await readFrontend('dashboard.html');
    assert.ok(content.includes('<meta name="description"'), 'should have meta description');
  });

  it('P18-23: index.html has og:title meta tag', async () => {
    const content = await readFrontend('index.html');
    assert.ok(content.includes('og:title'), 'should have og:title');
  });

  it('P18-24: index.html has Schema.org JSON-LD', async () => {
    const content = await readFrontend('index.html');
    assert.ok(content.includes('application/ld+json'), 'should have JSON-LD script');
    assert.ok(content.includes('"@type": "Organization"') || content.includes('"@type":"Organization"'), 'should have Organization schema');
  });
});

// ══════════════════════════════════════════════════════════════
// Code Deduplication
// ══════════════════════════════════════════════════════════════

describe('Phase 18 — Code Deduplication', () => {

  it('P18-25: jobs.js does NOT contain local escapeHtml function body', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    // Should NOT have the original implementation with createElement
    assert.ok(!content.includes('var div = document.createElement(\'div\');\n    div.textContent = str;\n    return div.innerHTML;'),
      'jobs.js should not have the original escapeHtml implementation');
    // But should still have the delegation wrapper
    assert.ok(content.includes('YawmiaUtils.escapeHtml'), 'should delegate to YawmiaUtils');
  });
});
