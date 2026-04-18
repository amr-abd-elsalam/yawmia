// ═══════════════════════════════════════════════════════════════
// server/services/reports.js — User Reporting System
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { eventBus } from './eventBus.js';

const TARGET_INDEX = config.DATABASE.indexFiles.targetReportsIndex;
const REPORTER_INDEX = config.DATABASE.indexFiles.reporterReportsIndex;

/**
 * Create a new report
 * @param {string} reporterId
 * @param {string} targetId
 * @param {{ type: string, reason: string, jobId?: string }} fields
 * @returns {Promise<{ ok: boolean, report?: object, code?: string, error?: string }>}
 */
export async function createReport(reporterId, targetId, { type, reason, jobId }) {
  // Feature flag
  if (!config.REPORTS.enabled) {
    return { ok: false, error: 'نظام البلاغات غير مفعّل', code: 'REPORTS_DISABLED' };
  }

  // Cannot report self
  if (reporterId === targetId) {
    return { ok: false, error: 'لا يمكنك الإبلاغ عن نفسك', code: 'CANNOT_REPORT_SELF' };
  }

  // Validate type
  if (!type || !config.REPORTS.types.includes(type)) {
    return { ok: false, error: 'نوع البلاغ غير صحيح', code: 'INVALID_REPORT_TYPE' };
  }

  // Validate reason
  if (!reason || typeof reason !== 'string') {
    return { ok: false, error: 'سبب البلاغ مطلوب', code: 'REASON_REQUIRED' };
  }
  if (reason.length < config.REPORTS.minReasonLength) {
    return { ok: false, error: `سبب البلاغ لازم يكون ${config.REPORTS.minReasonLength} حروف على الأقل`, code: 'REASON_TOO_SHORT' };
  }
  if (reason.length > config.REPORTS.maxReasonLength) {
    return { ok: false, error: `سبب البلاغ لا يتجاوز ${config.REPORTS.maxReasonLength} حرف`, code: 'REASON_TOO_LONG' };
  }

  // Validate target exists
  const { findById } = await import('./users.js');
  const targetUser = await findById(targetId);
  if (!targetUser) {
    return { ok: false, error: 'المستخدم المُبلَّغ عنه غير موجود', code: 'TARGET_NOT_FOUND' };
  }

  // Daily limit check (non-blocking on failure)
  try {
    const todayCount = await countTodayByReporter(reporterId);
    if (todayCount >= config.REPORTS.maxReportsPerUserPerDay) {
      return { ok: false, error: 'تجاوزت الحد اليومي للبلاغات', code: 'DAILY_REPORT_LIMIT' };
    }
  } catch (_) {
    // Non-blocking — allow on count failure
  }

  // Duplicate check (same reporter + same target + same jobId)
  if (jobId) {
    const existingReports = await listByTarget(targetId);
    const duplicate = existingReports.find(
      r => r.reporterId === reporterId && r.targetId === targetId && r.jobId === jobId
    );
    if (duplicate) {
      return { ok: false, error: 'تم تقديم بلاغ مماثل مسبقاً', code: 'DUPLICATE_REPORT' };
    }
  }

  const id = 'rpt_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const report = {
    id,
    reporterId,
    targetId,
    type,
    reason,
    jobId: jobId || null,
    status: 'pending',
    adminNotes: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: now,
  };

  const reportPath = getRecordPath('reports', id);
  await atomicWrite(reportPath, report);

  // Update secondary indexes
  await addToSetIndex(TARGET_INDEX, targetId, id);
  await addToSetIndex(REPORTER_INDEX, reporterId, id);

  // Emit event (fire-and-forget notification)
  eventBus.emit('report:created', { reportId: id, reporterId, targetId, type });

  return { ok: true, report };
}

/**
 * Review a report (admin action)
 * @param {string} reportId
 * @param {{ status: string, adminNotes?: string }} fields
 * @returns {Promise<{ ok: boolean, report?: object, code?: string, error?: string }>}
 */
export async function reviewReport(reportId, { status, adminNotes }) {
  const report = await findById(reportId);
  if (!report) {
    return { ok: false, error: 'البلاغ غير موجود', code: 'REPORT_NOT_FOUND' };
  }

  const validStatuses = ['reviewed', 'action_taken', 'dismissed'];
  if (!status || !validStatuses.includes(status)) {
    return { ok: false, error: 'حالة البلاغ غير صحيحة', code: 'INVALID_REPORT_STATUS' };
  }

  const now = new Date().toISOString();
  report.status = status;
  report.adminNotes = adminNotes || null;
  report.reviewedAt = now;

  const reportPath = getRecordPath('reports', reportId);
  await atomicWrite(reportPath, report);

  // Emit event
  eventBus.emit('report:reviewed', {
    reportId,
    reporterId: report.reporterId,
    targetId: report.targetId,
    status,
  });

  // Auto-ban check (fire-and-forget)
  if (status === 'action_taken') {
    checkAutoban(report.targetId).catch(() => {});
  }

  return { ok: true, report };
}

/**
 * Find report by ID
 */
export async function findById(reportId) {
  const reportPath = getRecordPath('reports', reportId);
  return await readJSON(reportPath);
}

/**
 * List reports by target user (index-accelerated with fallback)
 */
export async function listByTarget(targetId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(TARGET_INDEX, targetId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const rptId of indexedIds) {
      const rpt = await readJSON(getRecordPath('reports', rptId));
      if (rpt) results.push(rpt);
    }
    return results;
  }

  // Fallback: full scan
  const reportsDir = getCollectionPath('reports');
  const allReports = await listJSON(reportsDir);
  return allReports.filter(r => r.id && r.id.startsWith('rpt_') && r.targetId === targetId);
}

/**
 * List pending reports (admin — sorted newest first)
 */
export async function listPending() {
  const reportsDir = getCollectionPath('reports');
  const allReports = await listJSON(reportsDir);
  return allReports
    .filter(r => r.id && r.id.startsWith('rpt_') && r.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * List all reports (admin — sorted newest first)
 */
export async function listAll() {
  const reportsDir = getCollectionPath('reports');
  const allReports = await listJSON(reportsDir);
  return allReports
    .filter(r => r.id && r.id.startsWith('rpt_'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Count action_taken reports against a target user
 */
export async function countActionTakenAgainst(targetId) {
  const reports = await listByTarget(targetId);
  return reports.filter(r => r.status === 'action_taken').length;
}

/**
 * Count reports submitted by a reporter today (Egypt midnight reset)
 */
export async function countTodayByReporter(reporterId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(REPORTER_INDEX, reporterId);
  let reporterReports;

  if (indexedIds.length > 0) {
    const results = [];
    for (const rptId of indexedIds) {
      const rpt = await readJSON(getRecordPath('reports', rptId));
      if (rpt) results.push(rpt);
    }
    reporterReports = results;
  } else {
    // Fallback: full scan
    const reportsDir = getCollectionPath('reports');
    const allReports = await listJSON(reportsDir);
    reporterReports = allReports.filter(r => r.id && r.id.startsWith('rpt_') && r.reporterId === reporterId);
  }

  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  return reporterReports.filter(r => new Date(r.createdAt) >= todayMidnight).length;
}

/**
 * Auto-ban check — fires when action_taken count reaches threshold
 * Fire-and-forget — must not break the review flow
 */
async function checkAutoban(targetId) {
  try {
    const count = await countActionTakenAgainst(targetId);
    if (count >= config.REPORTS.autobanThreshold) {
      const { banUser } = await import('./users.js');
      await banUser(targetId, `تم الحظر تلقائياً — ${count} بلاغات مؤكدة`);
      eventBus.emit('report:autoban', { targetId, reportCount: count });
    }
  } catch (_) {
    // Fire-and-forget
  }
}
