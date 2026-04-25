// ═══════════════════════════════════════════════════════════════
// tests/phase25-accessibility.test.js — Phase 25: Accessibility Fortress
// ═══════════════════════════════════════════════════════════════
// Static analysis tests — verify ARIA attributes, CSS classes,
// keyboard handlers, and focus patterns exist in source files.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

async function read(relPath) {
  return await readFile(resolve(ROOT, relPath), 'utf-8');
}

// ═══════════════════════════════════════════════════════════════
// CSS Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — CSS Accessibility', async () => {
  const css = await read('frontend/assets/css/style.css');

  it('P25-01: style.css contains .sr-only class', () => {
    assert.ok(css.includes('.sr-only'), '.sr-only class not found');
  });

  it('P25-02: .sr-only has position: absolute', () => {
    const srOnlyBlock = css.substring(css.indexOf('.sr-only'));
    assert.ok(srOnlyBlock.includes('position: absolute'), '.sr-only missing position: absolute');
  });

  it('P25-03: .sr-only has clip: rect(0, 0, 0, 0)', () => {
    const srOnlyBlock = css.substring(css.indexOf('.sr-only'));
    assert.ok(srOnlyBlock.includes('clip: rect(0, 0, 0, 0)'), '.sr-only missing clip');
  });

  it('P25-04: style.css contains .btn--done class', () => {
    assert.ok(css.includes('.btn--done'), '.btn--done class not found');
  });

  it('P25-05: .btn--done has color: var(--color-success)', () => {
    const btnDoneBlock = css.substring(css.indexOf('.btn--done'));
    assert.ok(btnDoneBlock.includes('var(--color-success)'), '.btn--done missing success color');
  });

  it('P25-06: btn[aria-disabled="true"] has pointer-events: none', () => {
    assert.ok(css.includes('aria-disabled="true"'), 'aria-disabled selector not found');
    assert.ok(css.includes('pointer-events: none'), 'pointer-events: none not found');
  });

  it('P25-07: btn:disabled has filter: grayscale', () => {
    assert.ok(css.includes('grayscale'), 'grayscale filter not found in disabled styles');
  });
});

// ═══════════════════════════════════════════════════════════════
// jobs.js — Button ARIA Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — Dynamic Button ARIA', async () => {
  const js = await read('frontend/assets/js/jobs.js') + await read('frontend/assets/js/panels.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/ratingModal.js');

  it('P25-08: btn-apply has aria-label in HTML string', () => {
    assert.ok(js.includes('btn-apply') && js.match(/btn-apply[^>]*aria-label=/), 'btn-apply missing aria-label');
  });

  it('P25-09: btn-start has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-start[^>]*aria-label=/), 'btn-start missing aria-label');
  });

  it('P25-10: btn-complete has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-complete[^>]*aria-label=/), 'btn-complete missing aria-label');
  });

  it('P25-11: btn-cancel has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-cancel[^"]*"[^>]*aria-label=/), 'btn-cancel missing aria-label');
  });

  it('P25-12: btn-rate has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-rate[^>]*aria-label=/), 'btn-rate missing aria-label');
  });

  it('P25-13: btn-renew has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-renew[^>]*aria-label=/), 'btn-renew missing aria-label');
  });

  it('P25-14: btn-duplicate has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-duplicate[^>]*aria-label=/), 'btn-duplicate missing aria-label');
  });

  it('P25-15: btn-view-apps has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-view-apps[^>]*aria-label=/), 'btn-view-apps missing aria-label');
  });

  it('P25-16: btn-attendance has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-attendance[^>]*aria-label=/), 'btn-attendance missing aria-label');
  });

  it('P25-17: btn-messages has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-messages[^>]*aria-label=/), 'btn-messages missing aria-label');
  });

  it('P25-18: btn-checkin has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-checkin[^>]*aria-label=/), 'btn-checkin missing aria-label');
  });

  it('P25-19: btn-checkout has aria-label in HTML string', () => {
    assert.ok(js.match(/btn-checkout[^>]*aria-label=/), 'btn-checkout missing aria-label');
  });
});

// ═══════════════════════════════════════════════════════════════
// jobs.js — Rating Stars ARIA Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — Rating Stars Accessibility', async () => {
  const js = await read('frontend/assets/js/jobs.js') + await read('frontend/assets/js/panels.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/ratingModal.js');

  it('P25-20: rating stars container has role="radiogroup"', () => {
    assert.ok(js.includes('role="radiogroup"'), 'role="radiogroup" not found');
  });

  it('P25-21: star buttons have role="radio"', () => {
    assert.ok(js.includes('role="radio"'), 'role="radio" not found');
  });

  it('P25-22: star buttons have aria-checked in HTML', () => {
    assert.ok(js.includes('aria-checked="false"'), 'aria-checked not found in star HTML');
  });

  it('P25-23: star click handler sets aria-checked attribute', () => {
    assert.ok(js.includes("setAttribute('aria-checked'"), 'aria-checked setAttribute not found in star handler');
  });

  it('P25-24: arrow key handler exists for stars (ArrowRight or ArrowLeft)', () => {
    assert.ok(js.includes('ArrowLeft') && js.includes('ArrowRight'), 'Arrow key handler not found for stars');
  });
});

// ═══════════════════════════════════════════════════════════════
// jobs.js — Panel ARIA Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — Panel ARIA', async () => {
  const js = await read('frontend/assets/js/jobs.js') + await read('frontend/assets/js/panels.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/ratingModal.js');

  it('P25-25: toggleApplicationsPanel sets role on panel', () => {
    assert.ok(js.includes("'applications-panel'") && js.includes("'role', 'region'"), 'applications-panel missing role="region"');
  });

  it('P25-26: toggleAttendancePanel sets role on panel', () => {
    assert.ok(js.includes("'attendance-panel'") && js.includes("'role', 'region'"), 'attendance-panel missing role="region"');
  });
});

// ═══════════════════════════════════════════════════════════════
// jobs.js — Notification Drawer Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — Notification Drawer', async () => {
  const js = await read('frontend/assets/js/jobs.js') + await read('frontend/assets/js/panels.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/ratingModal.js');

  it('P25-27: openNotifPanel sets body.style.overflow', () => {
    assert.ok(js.includes("document.body.style.overflow = 'hidden'"), 'scroll lock not found in openNotifPanel');
  });

  it('P25-28: closeNotifPanel restores body.style.overflow', () => {
    assert.ok(js.includes("document.body.style.overflow = ''"), 'scroll unlock not found in closeNotifPanel');
  });

  it('P25-29: loadNotifications sets aria-label on notification items', () => {
    assert.ok(js.includes("setAttribute('aria-label'") && js.includes('غير مقروء'), 'notification item aria-label not found');
  });
});

// ═══════════════════════════════════════════════════════════════
// jobs.js — aria-live + Search Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — aria-live + Search', async () => {
  const js = await read('frontend/assets/js/jobs.js') + await read('frontend/assets/js/panels.js') + await read('frontend/assets/js/jobCard.js') + await read('frontend/assets/js/ratingModal.js');

  it('P25-30: jobs.js references jobsLiveRegion for aria-live', () => {
    assert.ok(js.includes('jobsLiveRegion'), 'jobsLiveRegion reference not found');
  });

  it('P25-31: search input has keydown listener for Enter key', () => {
    assert.ok(js.includes("e.key === 'Enter'") || js.includes("'Enter'"), 'Enter key handler not found on search');
  });
});

// ═══════════════════════════════════════════════════════════════
// auth.js — Focus Management Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — Auth Focus Management', async () => {
  const auth = await read('frontend/assets/js/auth.js');

  it('P25-32: auth.js focuses nameInput after showing stepProfile', () => {
    assert.ok(auth.includes('nameInput') && auth.includes('.focus()'), 'nameInput focus not found after stepProfile');
  });
});

// ═══════════════════════════════════════════════════════════════
// dashboard.html — aria-live Region Tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 25 — Dashboard HTML', async () => {
  const html = await read('frontend/dashboard.html');

  it('P25-33: dashboard.html contains id="jobsLiveRegion"', () => {
    assert.ok(html.includes('id="jobsLiveRegion"'), 'jobsLiveRegion element not found');
  });

  it('P25-34: jobsLiveRegion has aria-live="polite"', () => {
    assert.ok(html.includes('jobsLiveRegion') && html.includes('aria-live="polite"'), 'aria-live="polite" not found on jobsLiveRegion');
  });

  it('P25-35: jobsLiveRegion has class="sr-only"', () => {
    const regionLine = html.split('\n').find(l => l.includes('jobsLiveRegion'));
    assert.ok(regionLine && regionLine.includes('sr-only'), 'sr-only class not found on jobsLiveRegion');
  });
});
