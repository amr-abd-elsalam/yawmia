import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin UI contains governance tab and sections', async () => {
  const html = await readFile('frontend/admin.html', 'utf-8');

  assert.match(html, /data-admin-tab="governance"/);
  assert.match(html, /id="governanceOverviewSection"/);
  assert.match(html, /id="rbacSection"/);
  assert.match(html, /id="approvalQueueSection"/);
  assert.match(html, /id="privacyRequestsSection"/);
  assert.match(html, /id="opsReviewRecordsSection"/);
  assert.match(html, /id="postmortemsSection"/);

  assert.match(html, /صلاحيات الأدمن/);
  assert.match(html, /طلبات الخصوصية/);
  assert.match(html, /موافقات الإجراءات/);
  assert.match(html, /مراجعات التشغيل/);
  assert.match(html, /ما بعد الحوادث/);
});

test('admin JS exports governance functions and preserves old functions', async () => {
  const js = await readFile('frontend/assets/js/admin.js', 'utf-8');

  const newFns = [
    'loadGovernanceDashboard',
    'loadRbacMatrix',
    'loadApprovals',
    'approveApproval',
    'rejectApproval',
    'loadPrivacyRequests',
    'createPrivacyExportRequest',
    'createPrivacyAnonymizeRequest',
    'queuePrivacyExport',
    'queuePrivacyAnonymize',
    'loadOpsReviewRecords',
    'createOpsReviewRecord',
    'completeOpsReviewRecord',
    'loadPostmortems',
    'createIncidentPostmortem',
    'updatePostmortemStatus',
  ];

  for (const fn of newFns) {
    assert.match(js, new RegExp(`${fn}:\\s*${fn}`));
  }

  const oldFns = [
    'loadOpsQueueStats',
    'loadScaleHygiene',
    'loadMarketplaceIntelligence',
    'loadTrustDashboard',
    'connectAdminSse',
  ];

  for (const fn of oldFns) {
    assert.match(js, new RegExp(`${fn}:\\s*${fn}`));
  }
});

test('governance CSS classes exist', async () => {
  const css = await readFile('frontend/assets/css/style.css', 'utf-8');

  const classes = [
    '.governance-card',
    '.governance-card--warning',
    '.governance-card--critical',
    '.capability-chip',
    '.approval-status-badge',
    '.privacy-request-status-badge',
    '.review-record-card',
    '.postmortem-card',
    '.action-item-status',
    '.rbac-role-card',
  ];

  for (const cls of classes) {
    assert.ok(css.includes(cls), `Missing CSS class: ${cls}`);
  }
});

test('admin UI does not add unsafe external governance URLs', async () => {
  const html = await readFile('frontend/admin.html', 'utf-8');
  const js = await readFile('frontend/assets/js/admin.js', 'utf-8');

  assert.doesNotMatch(html, /https?:\/\/(?!yowmia\.com)/i);
  assert.doesNotMatch(js, /window\.location\.href\s*=\s*['"]https?:\/\//i);
});
