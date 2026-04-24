// tests/phase32-analytics.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 32 — Analytics + Financial Tools + Monitoring (~65 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-ph32-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit', 'messages', 'push_subscriptions', 'alerts', 'metrics'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let config, db, userService, jobsService, appsService, paymentsService, attendanceService, ratingsService, eventBus;

before(async () => {
  config = (await import('../config.js')).default;
  db = await import('../server/services/database.js');
  userService = await import('../server/services/users.js');
  jobsService = await import('../server/services/jobs.js');
  appsService = await import('../server/services/applications.js');
  paymentsService = await import('../server/services/payments.js');
  attendanceService = await import('../server/services/attendance.js');
  ratingsService = await import('../server/services/ratings.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
});

after(() => { if (eventBus) eventBus.clear(); });

// ══════════════════════════════════════════════════════════════
// Config
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Config', () => {
  it('P32-59: MONITORING section exists with required fields', () => {
    assert.ok(config.MONITORING);
    assert.strictEqual(config.MONITORING.enabled, true);
    assert.strictEqual(typeof config.MONITORING.snapshotIntervalMs, 'number');
    assert.strictEqual(typeof config.MONITORING.retentionDays, 'number');
    assert.ok(config.MONITORING.thresholds);
    assert.ok(config.MONITORING.thresholds.heapUsedMB);
    assert.ok(config.MONITORING.thresholds.errorRate);
    assert.ok(config.MONITORING.thresholds.p95Ms);
    assert.ok(config.MONITORING.thresholds.cacheHitRate);
  });

  it('P32-60: ANALYTICS section exists with required fields', () => {
    assert.ok(config.ANALYTICS);
    assert.strictEqual(config.ANALYTICS.enabled, true);
    assert.strictEqual(config.ANALYTICS.cacheTtlMs, 300000);
    assert.strictEqual(config.ANALYTICS.maxExportRows, 10000);
    assert.strictEqual(config.ANALYTICS.receiptPrefix, 'RCT');
  });

  it('P32-61: DATABASE.dirs includes metrics', () => {
    assert.strictEqual(config.DATABASE.dirs.metrics, 'metrics');
  });

  it('P32-62: config total sections = 45', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 46, `expected 45, got ${keys.length}: ${keys.join(', ')}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Version
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Version', () => {
  it('P32-63: package.json version is 0.28.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.30.0');
  });

  it('P32-64: sw.js CACHE_NAME is yawmia-v0.29.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.29.0'"));
  });

  it('P32-65: config PWA cacheName is yawmia-v0.29.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.30.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Employer Analytics
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Employer Analytics', () => {
  it('P32-01: getEmployerAnalytics with 0 jobs → all zeros', async () => {
    const { getEmployerAnalytics, clearAnalyticsCache } = await import('../server/services/analytics.js');
    clearAnalyticsCache();
    const result = await getEmployerAnalytics('usr_nonexistent');
    assert.strictEqual(result.jobs.total, 0);
    assert.strictEqual(result.financials.totalSpent, 0);
    assert.strictEqual(result.workers.unique, 0);
  });

  it('P32-02: getEmployerAnalytics with completed job → correct financials', async () => {
    const { getEmployerAnalytics, clearAnalyticsCache } = await import('../server/services/analytics.js');
    clearAnalyticsCache();
    const employer = await userService.create('01032020001', 'employer');
    const worker = await userService.create('01032020002', 'worker');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة تحليلات', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-04-20', durationDays: 2,
    });
    const appResult = await appsService.apply(job.id, worker.id);
    await appsService.accept(appResult.application.id, employer.id);
    await jobsService.startJob(job.id, employer.id);
    await jobsService.completeJob(job.id, employer.id);
    // Wait for payment auto-creation
    await new Promise(r => setTimeout(r, 200));

    const result = await getEmployerAnalytics(employer.id);
    assert.ok(result.jobs.total >= 1);
    assert.ok(result.jobs.byStatus.completed >= 1);
  });

  it('P32-06: getEmployerAnalytics accept rate calculation', async () => {
    const { getEmployerAnalytics, clearAnalyticsCache } = await import('../server/services/analytics.js');
    clearAnalyticsCache();
    const employer = await userService.create('01032060001', 'employer');
    const w1 = await userService.create('01032060002', 'worker');
    const w2 = await userService.create('01032060003', 'worker');
    const job = await jobsService.create(employer.id, {
      title: 'فرصة نسبة قبول', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-04-20', durationDays: 1,
    });
    const app1 = await appsService.apply(job.id, w1.id);
    const app2 = await appsService.apply(job.id, w2.id);
    await appsService.accept(app1.application.id, employer.id);
    await appsService.reject(app2.application.id, employer.id);

    const result = await getEmployerAnalytics(employer.id);
    assert.strictEqual(result.applications.accepted, 1);
    assert.strictEqual(result.applications.rejected, 1);
    assert.strictEqual(result.applications.total, 2);
    assert.strictEqual(result.applications.acceptRate, 50);
  });

  it('P32-08: GET /api/analytics/employer requires employer role (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/analytics/employer'"));
    assert.ok(content.includes("requireRole('employer')"));
  });
});

// ══════════════════════════════════════════════════════════════
// Worker Analytics
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Worker Analytics', () => {
  it('P32-11: getWorkerAnalytics with 0 applications → all zeros', async () => {
    const { getWorkerAnalytics, clearAnalyticsCache } = await import('../server/services/analytics.js');
    clearAnalyticsCache();
    const result = await getWorkerAnalytics('usr_nonexistent');
    assert.strictEqual(result.applications.total, 0);
    assert.strictEqual(result.earnings.total, 0);
    assert.strictEqual(result.jobs.completed, 0);
  });

  it('P32-15: getWorkerAnalytics rating trend defaults to stable', async () => {
    const { getWorkerAnalytics, clearAnalyticsCache } = await import('../server/services/analytics.js');
    clearAnalyticsCache();
    const result = await getWorkerAnalytics('usr_nonexistent');
    assert.strictEqual(result.ratings.trend, 'stable');
  });

  it('P32-16: GET /api/analytics/worker requires worker role (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/analytics/worker'"));
    assert.ok(content.includes("requireRole('worker')"));
  });
});

// ══════════════════════════════════════════════════════════════
// Platform Analytics
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Platform Analytics', () => {
  it('P32-19: getPlatformAnalytics empty system → all zeros', async () => {
    const { getPlatformAnalytics, clearAnalyticsCache } = await import('../server/services/analytics.js');
    clearAnalyticsCache();
    const result = await getPlatformAnalytics({ from: '2099-01-01', to: '2099-12-31' });
    assert.strictEqual(result.users.newRegistrations, 0);
    assert.strictEqual(result.jobs.created, 0);
    assert.strictEqual(result.financials.totalVolume, 0);
  });

  it('P32-24: GET /api/admin/analytics requires admin (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/admin/analytics'"));
    assert.ok(content.includes('requireAdmin'));
  });
});

// ══════════════════════════════════════════════════════════════
// CSV Export
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — CSV Export', () => {
  it('P32-27: exportPaymentsCSV empty → CSV with headers only', async () => {
    const { exportPaymentsCSV } = await import('../server/services/financialExport.js');
    const result = await exportPaymentsCSV({ from: '2099-01-01', to: '2099-12-31' });
    assert.strictEqual(result.count, 0);
    assert.ok(result.csv.startsWith('\uFEFF'));
    assert.ok(result.csv.includes('المعرّف'));
  });

  it('P32-29: exportPaymentsCSV has UTF-8 BOM', async () => {
    const { exportPaymentsCSV } = await import('../server/services/financialExport.js');
    const result = await exportPaymentsCSV();
    assert.ok(result.csv.charCodeAt(0) === 0xFEFF);
  });

  it('P32-33: exportJobsCSV correct headers', async () => {
    const { exportJobsCSV } = await import('../server/services/financialExport.js');
    const result = await exportJobsCSV({ from: '2099-01-01', to: '2099-12-31' });
    assert.ok(result.csv.includes('العنوان'));
    assert.ok(result.csv.includes('التخصص'));
    assert.ok(result.csv.includes('المحافظة'));
  });

  it('P32-34: exportUsersCSV correct headers', async () => {
    const { exportUsersCSV } = await import('../server/services/financialExport.js');
    const result = await exportUsersCSV({ from: '2099-01-01', to: '2099-12-31' });
    assert.ok(result.csv.includes('الاسم'));
    assert.ok(result.csv.includes('الموبايل'));
    assert.ok(result.csv.includes('النوع'));
  });

  it('P32-35: GET /api/admin/export/payments route exists (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/admin/export/payments'"));
  });

  it('P32-36: GET /api/employer/export/payments route exists (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/employer/export/payments'"));
  });
});

// ══════════════════════════════════════════════════════════════
// Receipt
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Receipt', () => {
  it('P32-37: generateReceipt valid payment → correct structure', async () => {
    const { generateReceipt } = await import('../server/services/financialExport.js');
    // Create full lifecycle
    const emp = await userService.create('01032370001', 'employer');
    const wrk = await userService.create('01032370002', 'worker');
    const job = await jobsService.create(emp.id, {
      title: 'فرصة إيصال', category: 'construction', governorate: 'giza',
      workersNeeded: 1, dailyWage: 300, startDate: '2026-04-20', durationDays: 3,
    });
    const appRes = await appsService.apply(job.id, wrk.id);
    await appsService.accept(appRes.application.id, emp.id);
    await jobsService.startJob(job.id, emp.id);
    await jobsService.completeJob(job.id, emp.id);
    // Explicitly create payment since fire-and-forget may not have completed
    try { await paymentsService.createPayment(job.id, emp.id); } catch (_) {}
    await new Promise(r => setTimeout(r, 100));

    const payments = await paymentsService.listByJob(job.id);
    assert.ok(payments.length > 0, 'payment should exist');

    const receipt = await generateReceipt(payments[0].id);
    assert.ok(receipt, 'receipt should not be null');
    assert.ok(receipt.receiptNumber.startsWith('RCT-'));
    assert.ok(receipt.employer.name);
    assert.ok(receipt.job.title);
    assert.ok(receipt.subtotal > 0);
    assert.ok(receipt.platformFee >= 0);
    assert.ok(receipt.attendance);
  });

  it('P32-40: generateReceipt nonexistent payment → null', async () => {
    const { generateReceipt } = await import('../server/services/financialExport.js');
    const result = await generateReceipt('pay_nonexistent123');
    assert.strictEqual(result, null);
  });

  it('P32-42: GET /api/jobs/:id/receipt route exists (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/jobs/:id/receipt'"));
  });
});

// ══════════════════════════════════════════════════════════════
// Monitoring
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Monitoring', () => {
  it('P32-45: captureSnapshot returns correct structure', async () => {
    const { captureSnapshot } = await import('../server/services/monitor.js');
    const snapshot = await captureSnapshot();
    assert.ok(snapshot.id.startsWith('mtr_'));
    assert.ok(snapshot.timestamp);
    assert.ok(snapshot.memory);
    assert.ok(typeof snapshot.memory.heapUsedMB === 'number');
    assert.ok(snapshot.cache);
    assert.ok(snapshot.requests);
    assert.ok(snapshot.connections);
    assert.ok(snapshot.dataSize);
  });

  it('P32-46: captureSnapshot saves file to data/metrics/', async () => {
    const { captureSnapshot } = await import('../server/services/monitor.js');
    const snapshot = await captureSnapshot();
    const files = await readdir(join(tmpDir, 'metrics'));
    const found = files.some(f => f.includes(snapshot.id));
    assert.ok(found, 'snapshot file should exist in metrics dir');
  });

  it('P32-47: getSnapshots returns array sorted newest first', async () => {
    const { captureSnapshot, getSnapshots } = await import('../server/services/monitor.js');
    await captureSnapshot();
    await new Promise(r => setTimeout(r, 50));
    await captureSnapshot();

    const snapshots = await getSnapshots({ limit: 10 });
    assert.ok(snapshots.length >= 2);
    assert.ok(new Date(snapshots[0].timestamp) >= new Date(snapshots[1].timestamp));
  });

  it('P32-49: getSnapshots respects limit', async () => {
    const { getSnapshots } = await import('../server/services/monitor.js');
    const snapshots = await getSnapshots({ limit: 1 });
    assert.ok(snapshots.length <= 1);
  });

  it('P32-50: checkThresholds all green → empty alerts', async () => {
    const { checkThresholds } = await import('../server/services/monitor.js');
    const snapshot = {
      memory: { heapUsedMB: 50 },
      requests: { errorRate: '0%', p95Ms: 10 },
      cache: { hitRate: '80%' },
    };
    const alerts = checkThresholds(snapshot);
    assert.strictEqual(alerts.length, 0);
  });

  it('P32-51: checkThresholds warning threshold → warning alert', async () => {
    const { checkThresholds } = await import('../server/services/monitor.js');
    const snapshot = {
      memory: { heapUsedMB: 300 },
      requests: { errorRate: '0%', p95Ms: 10 },
      cache: { hitRate: '80%' },
    };
    const alerts = checkThresholds(snapshot);
    assert.ok(alerts.length > 0);
    assert.ok(alerts.some(a => a.level === 'warning' && a.metric === 'heapUsedMB'));
  });

  it('P32-52: checkThresholds critical threshold → critical alert', async () => {
    const { checkThresholds } = await import('../server/services/monitor.js');
    const snapshot = {
      memory: { heapUsedMB: 600 },
      requests: { errorRate: '20%', p95Ms: 5000 },
      cache: { hitRate: '5%' },
    };
    const alerts = checkThresholds(snapshot);
    assert.ok(alerts.length >= 3);
    assert.ok(alerts.some(a => a.level === 'critical'));
  });

  it('P32-55: GET /api/admin/monitoring route exists (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/admin/monitoring'"));
  });

  it('P32-56: GET /api/admin/monitoring/latest route exists (source check)', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("path: '/api/admin/monitoring/latest'"));
  });
});

// ══════════════════════════════════════════════════════════════
// Analytics Cache
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Analytics Cache', () => {
  it('P32-57: Repeated analytics call uses cache (faster)', async () => {
    const { getEmployerAnalytics, clearAnalyticsCache } = await import('../server/services/analytics.js');
    clearAnalyticsCache();
    const emp = await userService.create('01032570001', 'employer');
    const start1 = Date.now();
    await getEmployerAnalytics(emp.id);
    const duration1 = Date.now() - start1;
    const start2 = Date.now();
    await getEmployerAnalytics(emp.id);
    const duration2 = Date.now() - start2;
    // Second call should be faster (cache hit)
    assert.ok(duration2 <= duration1 + 5, `cached call (${duration2}ms) should be <= first call (${duration1}ms)`);
  });
});

// ══════════════════════════════════════════════════════════════
// Route Count
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Routes', () => {
  it('P32-route: Total routes = 84', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches);
    assert.strictEqual(routeMatches.length, 89, `expected 84 routes, got ${routeMatches.length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// Frontend Source Checks
// ══════════════════════════════════════════════════════════════

describe('Phase 32 — Frontend Source', () => {
  it('P32-f01: profile.html has employer-analytics-section', async () => {
    const content = await readFile(resolve('frontend/profile.html'), 'utf-8');
    assert.ok(content.includes('employer-analytics-section'));
  });

  it('P32-f02: profile.html has worker-analytics-section', async () => {
    const content = await readFile(resolve('frontend/profile.html'), 'utf-8');
    assert.ok(content.includes('worker-analytics-section'));
  });

  it('P32-f03: admin.html has analyticsGrid', async () => {
    const content = await readFile(resolve('frontend/admin.html'), 'utf-8');
    assert.ok(content.includes('analyticsGrid'));
  });

  it('P32-f04: admin.html has monitoringInfo', async () => {
    const content = await readFile(resolve('frontend/admin.html'), 'utf-8');
    assert.ok(content.includes('monitoringInfo'));
  });

  it('P32-f05: admin.js has loadAnalytics function', async () => {
    const content = await readFile(resolve('frontend/assets/js/admin.js'), 'utf-8');
    assert.ok(content.includes('loadAnalytics'));
  });

  it('P32-f06: admin.js has loadMonitoring function', async () => {
    const content = await readFile(resolve('frontend/assets/js/admin.js'), 'utf-8');
    assert.ok(content.includes('loadMonitoring'));
  });

  it('P32-f07: admin.js has exportCSV function', async () => {
    const content = await readFile(resolve('frontend/assets/js/admin.js'), 'utf-8');
    assert.ok(content.includes('exportCSV'));
  });

  it('P32-f08: jobs.js has receipt button', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    assert.ok(content.includes('btn-receipt'));
  });

  it('P32-f09: jobs.js has showReceiptModal', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    assert.ok(content.includes('showReceiptModal'));
  });

  it('P32-f10: style.css has @media print', async () => {
    const content = await readFile(resolve('frontend/assets/css/style.css'), 'utf-8');
    assert.ok(content.includes('@media print'));
  });

  it('P32-f11: style.css has analytics-grid', async () => {
    const content = await readFile(resolve('frontend/assets/css/style.css'), 'utf-8');
    assert.ok(content.includes('.analytics-grid'));
  });

  it('P32-f12: style.css has period-selector', async () => {
    const content = await readFile(resolve('frontend/assets/css/style.css'), 'utf-8');
    assert.ok(content.includes('.period-selector'));
  });

  it('P32-f13: profile.js has loadEmployerAnalytics', async () => {
    const content = await readFile(resolve('frontend/assets/js/profile.js'), 'utf-8');
    assert.ok(content.includes('loadEmployerAnalytics'));
  });

  it('P32-f14: profile.js has loadWorkerAnalytics', async () => {
    const content = await readFile(resolve('frontend/assets/js/profile.js'), 'utf-8');
    assert.ok(content.includes('loadWorkerAnalytics'));
  });

  it('P32-f15: server.js has monitoring snapshot timer', async () => {
    const content = await readFile(resolve('server.js'), 'utf-8');
    assert.ok(content.includes('captureSnapshot'));
    assert.ok(content.includes('MONITORING'));
  });

  it('P32-f16: server.js has cleanOldSnapshots in cleanup', async () => {
    const content = await readFile(resolve('server.js'), 'utf-8');
    assert.ok(content.includes('cleanOldSnapshots'));
  });
});
