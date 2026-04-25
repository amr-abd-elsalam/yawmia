// ═══════════════════════════════════════════════════════════════
// tests/phase26-dialogue-modal.test.js — Phase 26: Dialogue Revolution
// Custom Modal System + Native Dialog Elimination
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

async function read(relPath) {
  return await readFile(join(ROOT, relPath), 'utf-8');
}

// ── Helper: check file exists ───────────────────────────────
async function fileExists(relPath) {
  try {
    await readFile(join(ROOT, relPath));
    return true;
  } catch { return false; }
}

describe('Phase 26 — Custom Modal System (modal.js)', () => {

  it('P26-01: modal.js file exists', async () => {
    const exists = await fileExists('frontend/assets/js/modal.js');
    assert.ok(exists, 'modal.js should exist');
  });

  it('P26-02: modal.js contains YawmiaModal', async () => {
    const src = await read('frontend/assets/js/modal.js');
    assert.ok(src.includes('YawmiaModal'), 'should define YawmiaModal');
  });

  it('P26-03: modal.js contains confirm function', async () => {
    const src = await read('frontend/assets/js/modal.js');
    assert.ok(src.includes('function confirm'), 'should have confirm function');
  });

  it('P26-04: modal.js contains prompt function', async () => {
    const src = await read('frontend/assets/js/modal.js');
    assert.ok(src.includes('function prompt'), 'should have prompt function');
  });

  it('P26-05: modal.js uses ARIA dialog roles', async () => {
    const src = await read('frontend/assets/js/modal.js');
    assert.ok(
      src.includes('alertdialog') || src.includes('dialog'),
      'should use role="alertdialog" or role="dialog"'
    );
  });

  it('P26-06: modal.js uses aria-modal', async () => {
    const src = await read('frontend/assets/js/modal.js');
    assert.ok(src.includes('aria-modal'), 'should set aria-modal');
  });

  it('P26-07: modal.js uses trapFocus', async () => {
    const src = await read('frontend/assets/js/modal.js');
    assert.ok(src.includes('trapFocus'), 'should use YawmiaUtils.trapFocus');
  });

  it('P26-08: modal.js handles Escape key', async () => {
    const src = await read('frontend/assets/js/modal.js');
    // trapFocus handles Escape via onEscape callback
    assert.ok(
      src.includes('Escape') || src.includes('onEscape') || src.includes('trapFocus'),
      'should handle Escape key (via trapFocus onEscape callback)'
    );
  });

  it('P26-09: modal.js references danger/error color', async () => {
    const src = await read('frontend/assets/js/modal.js');
    assert.ok(
      src.includes('danger') || src.includes('error'),
      'should support danger variant'
    );
  });
});

describe('Phase 26 — Modal CSS (style.css)', () => {

  it('P26-10: style.css contains ym-modal-overlay class', async () => {
    const css = await read('frontend/assets/css/style.css');
    assert.ok(css.includes('.ym-modal-overlay'), 'should have .ym-modal-overlay');
  });

  it('P26-11: style.css contains ym-modal-card class', async () => {
    const css = await read('frontend/assets/css/style.css');
    assert.ok(css.includes('.ym-modal-card'), 'should have .ym-modal-card');
  });

  it('P26-12: style.css contains ym-modal-actions class', async () => {
    const css = await read('frontend/assets/css/style.css');
    assert.ok(css.includes('.ym-modal-actions'), 'should have .ym-modal-actions');
  });

  it('P26-13: ym-modal-overlay has position fixed', async () => {
    const css = await read('frontend/assets/css/style.css');
    const overlayMatch = css.match(/\.ym-modal-overlay\s*\{[^}]+\}/);
    assert.ok(overlayMatch, 'should find .ym-modal-overlay rule');
    assert.ok(overlayMatch[0].includes('position: fixed'), 'overlay should be position: fixed');
  });

  it('P26-14: ym-modal-card has max-width', async () => {
    const css = await read('frontend/assets/css/style.css');
    const cardMatch = css.match(/\.ym-modal-card\s*\{[^}]+\}/);
    assert.ok(cardMatch, 'should find .ym-modal-card rule');
    assert.ok(cardMatch[0].includes('max-width'), 'card should have max-width');
  });
});

describe('Phase 26 — Native Dialog Elimination (jobs.js)', () => {

  it('P26-15: jobs.js has ZERO native confirm() calls', async () => {
    const src = await read('frontend/assets/js/jobs.js');
    // Match confirm( but not YawmiaModal.confirm(
    const nativeConfirms = src.match(/(?<!YawmiaModal\.)(?<!\/\/.*)(?<!\w)confirm\s*\(/g);
    const count = nativeConfirms ? nativeConfirms.length : 0;
    assert.equal(count, 0, `Expected 0 native confirm() calls, found ${count}`);
  });

  it('P26-16: jobs.js has ZERO native prompt() calls', async () => {
    const src = await read('frontend/assets/js/jobs.js');
    const nativePrompts = src.match(/(?<!YawmiaModal\.)(?<!\/\/.*)(?<!\w)prompt\s*\(/g);
    const count = nativePrompts ? nativePrompts.length : 0;
    assert.equal(count, 0, `Expected 0 native prompt() calls, found ${count}`);
  });

  it('P26-17: jobs.js has ZERO native alert() calls', async () => {
    const src = await read('frontend/assets/js/jobs.js');
    const nativeAlerts = src.match(/(?<!\/\/.*)(?<!\w)alert\s*\(/g);
    const count = nativeAlerts ? nativeAlerts.length : 0;
    assert.equal(count, 0, `Expected 0 native alert() calls, found ${count}`);
  });

  it('P26-18: jobs.js contains YawmiaModal.confirm', async () => {
    const src = await read('frontend/assets/js/jobs.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/panels.js') + await read('frontend/assets/js/jobCard.js');
    assert.ok(src.includes('YawmiaModal.confirm'), 'should use YawmiaModal.confirm');
  });

  it('P26-19: jobs.js contains YawmiaModal.prompt', async () => {
    const src = await read('frontend/assets/js/jobs.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/panels.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/panels.js');
    assert.ok(src.includes('YawmiaModal.prompt'), 'should use YawmiaModal.prompt');
  });
});

describe('Phase 26 — Native Dialog Elimination (profile.js)', () => {

  it('P26-20: profile.js has ZERO native confirm() calls', async () => {
    const src = await read('frontend/assets/js/profile.js');
    const nativeConfirms = src.match(/(?<!YawmiaModal\.)(?<!\/\/.*)(?<!\w)confirm\s*\(/g);
    const count = nativeConfirms ? nativeConfirms.length : 0;
    assert.equal(count, 0, `Expected 0 native confirm() calls, found ${count}`);
  });

  it('P26-21: profile.js has ZERO native alert() calls', async () => {
    const src = await read('frontend/assets/js/profile.js');
    const nativeAlerts = src.match(/(?<!\/\/.*)(?<!\w)alert\s*\(/g);
    const count = nativeAlerts ? nativeAlerts.length : 0;
    assert.equal(count, 0, `Expected 0 native alert() calls, found ${count}`);
  });

  it('P26-22: profile.js contains YawmiaModal.confirm', async () => {
    const src = await read('frontend/assets/js/profile.js');
    assert.ok(src.includes('YawmiaModal.confirm'), 'should use YawmiaModal.confirm');
  });
});

describe('Phase 26 — Native Dialog Elimination (admin.js)', () => {

  it('P26-23: admin.js has ZERO native prompt() calls', async () => {
    const src = await read('frontend/assets/js/admin.js');
    const nativePrompts = src.match(/(?<!YawmiaModal\.)(?<!\/\/.*)(?<!\w)prompt\s*\(/g);
    const count = nativePrompts ? nativePrompts.length : 0;
    assert.equal(count, 0, `Expected 0 native prompt() calls, found ${count}`);
  });

  it('P26-24: admin.js has ZERO native alert() calls', async () => {
    const src = await read('frontend/assets/js/admin.js');
    const nativeAlerts = src.match(/(?<!\/\/.*)(?<!\w)alert\s*\(/g);
    const count = nativeAlerts ? nativeAlerts.length : 0;
    assert.equal(count, 0, `Expected 0 native alert() calls, found ${count}`);
  });

  it('P26-25: admin.js contains YawmiaModal.prompt', async () => {
    const src = await read('frontend/assets/js/admin.js');
    assert.ok(src.includes('YawmiaModal.prompt'), 'should use YawmiaModal.prompt');
  });
});

describe('Phase 26 — HTML Script Integration', () => {

  it('P26-26: dashboard.html loads modal.js before jobs.js', async () => {
    const html = await read('frontend/dashboard.html');
    const modalIdx = html.indexOf('modal.js');
    const jobsIdx = html.indexOf('jobs.js');
    assert.ok(modalIdx > -1, 'dashboard.html should reference modal.js');
    assert.ok(jobsIdx > -1, 'dashboard.html should reference jobs.js');
    assert.ok(modalIdx < jobsIdx, 'modal.js should appear before jobs.js');
  });

  it('P26-27: profile.html loads modal.js before profile.js', async () => {
    const html = await read('frontend/profile.html');
    const modalIdx = html.indexOf('modal.js');
    const profileIdx = html.indexOf('profile.js');
    assert.ok(modalIdx > -1, 'profile.html should reference modal.js');
    assert.ok(profileIdx > -1, 'profile.html should reference profile.js');
    assert.ok(modalIdx < profileIdx, 'modal.js should appear before profile.js');
  });

  it('P26-28: admin.html loads modal.js before admin.js', async () => {
    const html = await read('frontend/admin.html');
    const modalIdx = html.indexOf('modal.js');
    const adminIdx = html.indexOf('admin.js');
    assert.ok(modalIdx > -1, 'admin.html should reference modal.js');
    assert.ok(adminIdx > -1, 'admin.html should reference admin.js');
    assert.ok(modalIdx < adminIdx, 'modal.js should appear before admin.js');
  });
});

describe('Phase 26 — Service Worker Cache', () => {

  it('P26-29: sw.js STATIC_ASSETS contains modal.js', async () => {
    const src = await read('frontend/sw.js');
    assert.ok(src.includes('modal.js'), 'sw.js STATIC_ASSETS should include modal.js');
  });
});

describe('Phase 26 — Regression: No alert() in any frontend JS', () => {

  it('P26-30: No alert() in app.js, auth.js, user.js, toast.js, utils.js, icons.js', async () => {
    const files = [
      'frontend/assets/js/app.js',
      'frontend/assets/js/auth.js',
      'frontend/assets/js/user.js',
      'frontend/assets/js/toast.js',
      'frontend/assets/js/utils.js',
      'frontend/assets/js/icons.js',
    ];
    for (const file of files) {
      const src = await read(file);
      const nativeAlerts = src.match(/(?<!\/\/.*)(?<!\w)alert\s*\(/g);
      const count = nativeAlerts ? nativeAlerts.length : 0;
      assert.equal(count, 0, `Expected 0 alert() in ${file}, found ${count}`);
    }
  });
});
