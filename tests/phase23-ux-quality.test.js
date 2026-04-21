// ═══════════════════════════════════════════════════════════════
// tests/phase23-ux-quality.test.js — Phase 23: UX/UI Quality Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function readFrontendFile(relativePath) {
  const fullPath = resolve(relativePath);
  return await readFile(fullPath, 'utf-8');
}

describe('Phase 23 — UX/UI Quality Revolution', () => {

  // ── Logo Tests ──────────────────────────────────────────────

  describe('Logo Integration', () => {
    it('P23-01: dashboard.html contains header__logo img tag', async () => {
      const html = await readFrontendFile('frontend/dashboard.html');
      assert.ok(html.includes('class="header__logo"'), 'dashboard.html should contain header__logo class');
      assert.ok(html.includes('logo.png'), 'dashboard.html should reference logo.png');
    });

    it('P23-02: profile.html contains header__logo img tag', async () => {
      const html = await readFrontendFile('frontend/profile.html');
      assert.ok(html.includes('class="header__logo"'), 'profile.html should contain header__logo class');
      assert.ok(html.includes('logo.png'), 'profile.html should reference logo.png');
    });

    it('P23-03: index.html contains header__logo img tag', async () => {
      const html = await readFrontendFile('frontend/index.html');
      assert.ok(html.includes('class="header__logo"'), 'index.html should contain header__logo class');
      assert.ok(html.includes('logo.png'), 'index.html should reference logo.png');
    });

    it('P23-04: user.html contains header__logo img tag', async () => {
      const html = await readFrontendFile('frontend/user.html');
      assert.ok(html.includes('class="header__logo"'), 'user.html should contain header__logo class');
      assert.ok(html.includes('logo.png'), 'user.html should reference logo.png');
    });

    it('P23-05: No data-icon="construction" in any header brand', async () => {
      const pages = ['frontend/dashboard.html', 'frontend/profile.html', 'frontend/index.html', 'frontend/user.html'];
      for (const page of pages) {
        const html = await readFrontendFile(page);
        // Check that construction icon is NOT inside the header brand h1
        const brandMatch = html.match(/<h1[^>]*class="header__brand"[^>]*>([\s\S]*?)<\/h1>/);
        if (brandMatch) {
          assert.ok(!brandMatch[1].includes('data-icon="construction"'), `${page} header brand should not contain construction icon`);
        }
      }
    });

    it('P23-06: style.css contains .header__logo class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.header__logo'), 'style.css should contain .header__logo class');
      assert.ok(css.includes('object-fit'), '.header__logo should have object-fit property');
    });
  });

  // ── Notification Drawer Tests ───────────────────────────────

  describe('Notification Drawer', () => {
    it('P23-07: dashboard.html contains notificationOverlay element', async () => {
      const html = await readFrontendFile('frontend/dashboard.html');
      assert.ok(html.includes('id="notificationOverlay"'), 'dashboard.html should contain notificationOverlay');
    });

    it('P23-08: dashboard.html notification panel has aria-modal="true"', async () => {
      const html = await readFrontendFile('frontend/dashboard.html');
      assert.ok(html.includes('aria-modal="true"'), 'notification panel should have aria-modal="true"');
    });

    it('P23-09: style.css contains .notification-overlay class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.notification-overlay'), 'style.css should contain .notification-overlay');
      assert.ok(css.includes('.notification-overlay--visible'), 'style.css should contain .notification-overlay--visible');
    });

    it('P23-10: style.css contains .notification-panel--open class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.notification-panel--open'), 'style.css should contain .notification-panel--open');
    });

    it('P23-11: style.css contains .notification-panel__close class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.notification-panel__close'), 'style.css should contain .notification-panel__close');
    });

    it('P23-12: style.css contains .notification-panel__empty class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.notification-panel__empty'), 'style.css should contain .notification-panel__empty');
    });

    it('P23-13: jobs.js contains openNotifPanel function', async () => {
      const js = await readFrontendFile('frontend/assets/js/jobs.js');
      assert.ok(js.includes('function openNotifPanel'), 'jobs.js should contain openNotifPanel function');
    });

    it('P23-14: jobs.js contains closeNotifPanel function', async () => {
      const js = await readFrontendFile('frontend/assets/js/jobs.js');
      assert.ok(js.includes('function closeNotifPanel'), 'jobs.js should contain closeNotifPanel function');
    });

    it('P23-15: jobs.js contains Escape key handler for notifications', async () => {
      const js = await readFrontendFile('frontend/assets/js/jobs.js');
      assert.ok(js.includes('Escape') || js.includes('keyCode === 27'), 'jobs.js should handle Escape key for notification drawer');
      assert.ok(js.includes('notification-panel--open'), 'Escape handler should check for notification-panel--open class');
    });
  });

  // ── Job Card Actions Tests ──────────────────────────────────

  describe('Job Card Actions Organization', () => {
    it('P23-16: style.css contains .job-card__actions-primary class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.job-card__actions-primary'), 'style.css should contain .job-card__actions-primary');
    });

    it('P23-17: style.css contains .job-card__actions-secondary class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.job-card__actions-secondary'), 'style.css should contain .job-card__actions-secondary');
    });
  });

  // ── Empty State Tests ───────────────────────────────────────

  describe('Enhanced Empty States', () => {
    it('P23-18: style.css contains .empty-state__icon class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.empty-state__icon'), 'style.css should contain .empty-state__icon');
    });

    it('P23-19: style.css contains .empty-state__hint class', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes('.empty-state__hint'), 'style.css should contain .empty-state__hint');
    });
  });

  // ── Accessibility Tests ─────────────────────────────────────

  describe('Accessibility', () => {
    it('P23-20: style.css contains :focus-visible rule', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      assert.ok(css.includes(':focus-visible'), 'style.css should contain :focus-visible rule');
    });

    it('P23-21: dashboard.html bottom nav has aria-current attribute', async () => {
      const html = await readFrontendFile('frontend/dashboard.html');
      assert.ok(html.includes('aria-current="page"'), 'dashboard.html should have aria-current="page" on active nav item');
    });
  });

  // ── Report Button Tests ─────────────────────────────────────

  describe('Report Button Subtlety', () => {
    it('P23-22: style.css .report-btn has opacity rule', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      // Check that report-btn has opacity (either via .report-btn or .btn-report)
      const reportBtnSection = css.substring(css.indexOf('.report-btn'));
      assert.ok(reportBtnSection.includes('opacity'), '.report-btn should have opacity rule');
    });
  });

  // ── Mobile Responsive Tests ─────────────────────────────────

  describe('Mobile Responsive', () => {
    it('P23-23: style.css has .header__logo responsive rule', async () => {
      const css = await readFrontendFile('frontend/assets/css/style.css');
      // Check that there's a responsive rule for header__logo
      const mobileSection = css.substring(css.lastIndexOf('@media (max-width: 600px)'));
      assert.ok(mobileSection.includes('.header__logo'), 'style.css should have responsive .header__logo rule');
    });
  });

  // ── Skeleton Loading Tests ──────────────────────────────────

  describe('Skeleton Loading', () => {
    it('P23-24: utils.js skeletonJobCards generates multiple rows', async () => {
      const js = await readFrontendFile('frontend/assets/js/utils.js');
      const fnMatch = js.substring(js.indexOf('function skeletonJobCards'));
      // Check for multiple flex rows (header row + meta row + footer row)
      const flexCount = (fnMatch.match(/display:flex/g) || []).length;
      assert.ok(flexCount >= 3, 'skeletonJobCards should generate at least 3 flex rows (header, meta, footer)');
    });
  });

  // ── Profile Bottom Nav Tests ────────────────────────────────

  describe('Profile Bottom Nav', () => {
    it('P23-25: profile.html has aria-current on profile nav item', async () => {
      const html = await readFrontendFile('frontend/profile.html');
      // Profile page should have aria-current on the profile nav item
      assert.ok(html.includes('aria-current="page"'), 'profile.html should have aria-current="page" on active nav item');
    });
  });

});
