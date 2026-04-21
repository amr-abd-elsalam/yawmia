// ═══════════════════════════════════════════════════════════════
// tests/phase24-employer-command.test.js
// Phase 24 — Employer Command Center (Frontend-only)
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const STYLE_PATH = './frontend/assets/css/style.css';
const JOBS_JS_PATH = './frontend/assets/js/jobs.js';

let styleContent = '';
let jobsContent = '';

// Load files once
async function loadFiles() {
  if (!styleContent) styleContent = await readFile(STYLE_PATH, 'utf-8');
  if (!jobsContent) jobsContent = await readFile(JOBS_JS_PATH, 'utf-8');
}

describe('Phase 24 — Employer Command Center', async () => {
  await loadFiles();

  // ── CSS Tests ──────────────────────────────────────────────

  describe('CSS — Applications Panel', () => {
    it('P24-01: style.css contains .applications-panel class', () => {
      assert.ok(styleContent.includes('.applications-panel'), 'Missing .applications-panel');
    });

    it('P24-02: style.css contains .app-review-card class', () => {
      assert.ok(styleContent.includes('.app-review-card'), 'Missing .app-review-card');
    });

    it('P24-06: style.css .applications-panel__list has max-height', () => {
      const match = styleContent.match(/\.applications-panel__list\s*\{[^}]*max-height/);
      assert.ok(match, '.applications-panel__list missing max-height');
    });
  });

  describe('CSS — Attendance Panel', () => {
    it('P24-03: style.css contains .attendance-panel class', () => {
      assert.ok(styleContent.includes('.attendance-panel'), 'Missing .attendance-panel');
    });

    it('P24-04: style.css contains .att-worker-card class', () => {
      assert.ok(styleContent.includes('.att-worker-card'), 'Missing .att-worker-card');
    });

    it('P24-07: style.css .attendance-panel__list has max-height', () => {
      const match = styleContent.match(/\.attendance-panel__list\s*\{[^}]*max-height/);
      assert.ok(match, '.attendance-panel__list missing max-height');
    });
  });

  describe('CSS — Message Recipient Picker', () => {
    it('P24-05: style.css contains .msg-recipient-picker class', () => {
      assert.ok(styleContent.includes('.msg-recipient-picker'), 'Missing .msg-recipient-picker');
    });
  });

  describe('CSS — Responsive', () => {
    it('P24-08: @media (max-width: 600px) contains .app-review-card', () => {
      // Find the responsive section
      const mediaMatch = styleContent.match(/@media\s*\(\s*max-width\s*:\s*600px\s*\)\s*\{[\s\S]*\}/);
      assert.ok(mediaMatch, 'Missing @media (max-width: 600px)');
      assert.ok(mediaMatch[0].includes('.app-review-card'), '.app-review-card missing from responsive');
    });

    it('P24-09: @media (max-width: 600px) contains .att-worker-card', () => {
      const mediaMatch = styleContent.match(/@media\s*\(\s*max-width\s*:\s*600px\s*\)\s*\{[\s\S]*\}/);
      assert.ok(mediaMatch, 'Missing @media (max-width: 600px)');
      assert.ok(mediaMatch[0].includes('.att-worker-card'), '.att-worker-card missing from responsive');
    });
  });

  // ── JS Tests ──────────────────────────────────────────────

  describe('JS — New Functions', () => {
    it('P24-10: jobs.js contains toggleApplicationsPanel function', () => {
      assert.ok(jobsContent.includes('toggleApplicationsPanel'), 'Missing toggleApplicationsPanel');
    });

    it('P24-11: jobs.js contains toggleAttendancePanel function', () => {
      assert.ok(jobsContent.includes('toggleAttendancePanel'), 'Missing toggleAttendancePanel');
    });

    it('P24-12: jobs.js contains closeOtherPanels function', () => {
      assert.ok(jobsContent.includes('closeOtherPanels'), 'Missing closeOtherPanels');
    });
  });

  describe('JS — Button Classes', () => {
    it('P24-13: jobs.js contains btn-view-apps class reference', () => {
      assert.ok(jobsContent.includes('btn-view-apps'), 'Missing btn-view-apps');
    });

    it('P24-14: jobs.js contains btn-attendance class reference', () => {
      assert.ok(jobsContent.includes('btn-attendance'), 'Missing btn-attendance');
    });

    it('P24-15: jobs.js contains btn-accept-app class reference', () => {
      assert.ok(jobsContent.includes('btn-accept-app'), 'Missing btn-accept-app');
    });

    it('P24-16: jobs.js contains btn-reject-app class reference', () => {
      assert.ok(jobsContent.includes('btn-reject-app'), 'Missing btn-reject-app');
    });

    it('P24-17: jobs.js contains btn-manual-checkin class reference', () => {
      assert.ok(jobsContent.includes('btn-manual-checkin'), 'Missing btn-manual-checkin');
    });

    it('P24-18: jobs.js contains btn-confirm-att class reference', () => {
      assert.ok(jobsContent.includes('btn-confirm-att'), 'Missing btn-confirm-att');
    });
  });

  describe('JS — Smart Rating Modal', () => {
    it('P24-19: jobs.js contains ratingTargetSelect id reference', () => {
      assert.ok(jobsContent.includes('ratingTargetSelect'), 'Missing ratingTargetSelect');
    });

    it('P24-20: jobs.js does NOT contain ratingTargetId id reference', () => {
      assert.ok(!jobsContent.includes('ratingTargetId'), 'ratingTargetId should be removed');
    });
  });

  describe('JS — Smart Messaging', () => {
    it('P24-21: jobs.js contains msgRecipient- id pattern', () => {
      assert.ok(jobsContent.includes('msgRecipient-'), 'Missing msgRecipient- pattern');
    });

    it('P24-22: jobs.js contains __broadcast__ value', () => {
      assert.ok(jobsContent.includes('__broadcast__'), 'Missing __broadcast__ value');
    });

    it('P24-23: jobs.js sendJobMessage does NOT contain prompt(', () => {
      // Extract the sendJobMessage function body
      const fnMatch = jobsContent.match(/async function sendJobMessage\([^)]*\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(fnMatch, 'Cannot find sendJobMessage function');
      assert.ok(!fnMatch[0].includes('prompt('), 'sendJobMessage should not contain prompt()');
    });
  });

  describe('JS — SSE Handler', () => {
    it('P24-24: jobs.js SSE handler triggers loadJobs on new_application', () => {
      // Check that the notification handler includes new_application check
      assert.ok(jobsContent.includes("e.detail.type === 'new_application'"), 'Missing new_application SSE handler');
      // Check it calls loadJobs
      const sseSection = jobsContent.match(/yawmia:notification[\s\S]{0,300}loadJobs/);
      assert.ok(sseSection, 'SSE handler should call loadJobs');
    });
  });
});
