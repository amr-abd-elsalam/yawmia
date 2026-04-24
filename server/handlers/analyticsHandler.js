// ═══════════════════════════════════════════════════════════════
// server/handlers/analyticsHandler.js — Analytics, Export, Monitoring
// ═══════════════════════════════════════════════════════════════

import { getEmployerAnalytics, getWorkerAnalytics, getPlatformAnalytics } from '../services/analytics.js';
import { exportPaymentsCSV, exportJobsCSV, exportUsersCSV, generateReceipt } from '../services/financialExport.js';
import { getSnapshots, checkThresholds } from '../services/monitor.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendCSV(res, csv, filename) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': Buffer.byteLength(csv, 'utf-8'),
  });
  res.end(csv);
}

function parseDateRange(query) {
  const from = query.from || '';
  const to = query.to || '';
  return { from: from || undefined, to: to || undefined };
}

// ── Analytics Endpoints ──────────────────────────────────────

/**
 * GET /api/analytics/employer
 */
export async function handleEmployerAnalytics(req, res) {
  try {
    const { from, to } = parseDateRange(req.query);
    const analytics = await getEmployerAnalytics(req.user.id, { from, to });
    sendJSON(res, 200, { ok: true, analytics });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب التحليلات', code: 'ANALYTICS_ERROR' });
  }
}

/**
 * GET /api/analytics/worker
 */
export async function handleWorkerAnalytics(req, res) {
  try {
    const { from, to } = parseDateRange(req.query);
    const analytics = await getWorkerAnalytics(req.user.id, { from, to });
    sendJSON(res, 200, { ok: true, analytics });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب التحليلات', code: 'ANALYTICS_ERROR' });
  }
}

/**
 * GET /api/admin/analytics
 */
export async function handlePlatformAnalytics(req, res) {
  try {
    const { from, to } = parseDateRange(req.query);
    const analytics = await getPlatformAnalytics({ from, to });
    sendJSON(res, 200, { ok: true, analytics });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب تحليلات المنصة', code: 'PLATFORM_ANALYTICS_ERROR' });
  }
}

// ── Export Endpoints ─────────────────────────────────────────

/**
 * GET /api/admin/export/payments
 */
export async function handleExportPayments(req, res) {
  try {
    const filters = {
      from: req.query.from,
      to: req.query.to,
      status: req.query.status,
    };
    const result = await exportPaymentsCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير المدفوعات', code: 'EXPORT_ERROR' });
  }
}

/**
 * GET /api/admin/export/jobs
 */
export async function handleExportJobs(req, res) {
  try {
    const filters = {
      from: req.query.from,
      to: req.query.to,
      status: req.query.status,
      governorate: req.query.governorate,
      category: req.query.category,
    };
    const result = await exportJobsCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير الفرص', code: 'EXPORT_ERROR' });
  }
}

/**
 * GET /api/admin/export/users
 */
export async function handleExportUsers(req, res) {
  try {
    const filters = {
      role: req.query.role,
      status: req.query.status,
      governorate: req.query.governorate,
      from: req.query.from,
      to: req.query.to,
    };
    const result = await exportUsersCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير المستخدمين', code: 'EXPORT_ERROR' });
  }
}

/**
 * GET /api/employer/export/payments — employer-scoped
 */
export async function handleEmployerExportPayments(req, res) {
  try {
    const filters = {
      employerId: req.user.id,
      from: req.query.from,
      to: req.query.to,
    };
    const result = await exportPaymentsCSV(filters);
    sendCSV(res, result.csv, result.filename);
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في تصدير المدفوعات', code: 'EXPORT_ERROR' });
  }
}

// ── Receipt Endpoint ─────────────────────────────────────────

/**
 * GET /api/jobs/:id/receipt
 */
export async function handleGetReceipt(req, res) {
  try {
    const jobId = req.params.id;

    // Load job to verify access
    const { findById: findJob } = await import('../services/jobs.js');
    const job = await findJob(jobId);
    if (!job) {
      return sendJSON(res, 404, { error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' });
    }

    // Job must be completed
    if (job.status !== 'completed') {
      return sendJSON(res, 400, { error: 'الفرصة لازم تكون مكتملة', code: 'JOB_NOT_COMPLETED' });
    }

    // Access check: employer who owns job OR accepted worker
    const userId = req.user.id;
    let allowed = false;

    if (job.employerId === userId) {
      allowed = true;
    } else {
      const { listByJob: listApps } = await import('../services/applications.js');
      const apps = await listApps(jobId);
      allowed = apps.some(a => a.workerId === userId && a.status === 'accepted');
    }

    if (!allowed) {
      return sendJSON(res, 403, { error: 'مش مسموحلك تشوف إيصال هذه الفرصة', code: 'NOT_AUTHORIZED' });
    }

    // Find payment for this job
    const { listByJob: listPayments } = await import('../services/payments.js');
    const payments = await listPayments(jobId);
    if (payments.length === 0) {
      return sendJSON(res, 404, { error: 'لا يوجد سجل دفع لهذه الفرصة', code: 'PAYMENT_NOT_FOUND' });
    }

    const receipt = await generateReceipt(payments[0].id);
    if (!receipt) {
      return sendJSON(res, 500, { error: 'خطأ في إنشاء الإيصال', code: 'RECEIPT_ERROR' });
    }

    sendJSON(res, 200, { ok: true, receipt });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب الإيصال', code: 'RECEIPT_ERROR' });
  }
}

// ── Monitoring Endpoints ─────────────────────────────────────

/**
 * GET /api/admin/monitoring
 */
export async function handleGetMonitoring(req, res) {
  try {
    const options = {
      from: req.query.from,
      to: req.query.to,
      limit: parseInt(req.query.limit) || 24,
    };
    const snapshots = await getSnapshots(options);
    sendJSON(res, 200, { ok: true, snapshots, count: snapshots.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب بيانات المراقبة', code: 'MONITORING_ERROR' });
  }
}

/**
 * GET /api/admin/monitoring/latest
 */
export async function handleGetLatestSnapshot(req, res) {
  try {
    const snapshots = await getSnapshots({ limit: 1 });
    if (snapshots.length === 0) {
      return sendJSON(res, 200, { ok: true, snapshot: null, alerts: [] });
    }
    const snapshot = snapshots[0];
    const alerts = checkThresholds(snapshot);
    sendJSON(res, 200, { ok: true, snapshot, alerts });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب آخر snapshot', code: 'MONITORING_ERROR' });
  }
}

/**
 * GET /api/admin/errors
 */
export async function handleGetErrors(req, res) {
  try {
    const { getErrorSummary } = await import('../services/errorAggregator.js');
    const summary = getErrorSummary();
    sendJSON(res, 200, { ok: true, ...summary });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب ملخص الأخطاء', code: 'ERROR_SUMMARY_ERROR' });
  }
}
