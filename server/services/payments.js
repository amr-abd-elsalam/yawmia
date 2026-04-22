// ═══════════════════════════════════════════════════════════════
// server/services/payments.js — Payment Tracking Service
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, safeReadJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { withLock } from './resourceLock.js';

const JOB_PAYMENTS_INDEX = config.DATABASE.indexFiles.jobPaymentsIndex;

/**
 * Create a payment record for a completed job
 * @param {string} jobId
 * @param {string} employerId
 * @param {{ method?: string, notes?: string }} options
 */
export async function createPayment(jobId, employerId, options = {}) {
  return withLock(`payment:${jobId}`, async () => {
  if (!config.PAYMENTS.enabled) {
    return { ok: false, error: 'نظام المدفوعات غير مفعّل', code: 'PAYMENTS_DISABLED' };
  }

  // Verify job exists and is completed
  const { findById: findJobById } = await import('./jobs.js');
  const job = await findJobById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'completed') {
    return { ok: false, error: 'الفرصة لازم تكون منتهية عشان تنشئ سجل دفع', code: 'JOB_NOT_COMPLETED' };
  }
  if (job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تنشئ سجل دفع لهذه الفرصة', code: 'NOT_JOB_OWNER' };
  }

  // Check no duplicate payment for this job
  const existing = await listByJob(jobId);
  if (existing.length > 0) {
    return { ok: false, error: 'سجل دفع موجود بالفعل لهذه الفرصة', code: 'PAYMENT_EXISTS' };
  }

  // ── Attendance-based amount adjustment (non-blocking) ──
  let attendanceBreakdown = null;
  let adjustedTotalCost = job.totalCost;
  let adjustedPlatformFee = job.platformFee;

  try {
    const { getJobSummary } = await import('./attendance.js');
    const summary = await getJobSummary(jobId);

    if (summary && summary.totalRecords > 0) {
      const expectedWorkerDays = job.workersAccepted * job.durationDays;
      const actualWorkerDays = summary.checkedInCount; // includes checked_in + checked_out + confirmed
      const noShowDays = summary.noShowCount;

      if (expectedWorkerDays > 0) {
        const attendanceRate = Math.min(actualWorkerDays / expectedWorkerDays, 1);
        attendanceBreakdown = {
          expectedWorkerDays,
          actualWorkerDays,
          noShowDays,
          attendanceRate: Math.round(attendanceRate * 100) / 100,
        };

        if (attendanceRate < 1) {
          adjustedTotalCost = Math.round(job.totalCost * attendanceRate);
          adjustedPlatformFee = Math.round(adjustedTotalCost * (config.FINANCIALS.platformFeePercent / 100));
        }
      }
    }
  } catch (err) {
    // Non-blocking: if attendance unavailable, use full calculation
    logger.warn('Attendance data unavailable for payment', { jobId, error: err.message });
  }

  // Validate payment method
  const method = options.method || config.PAYMENTS.defaultMethod;
  if (!config.PAYMENTS.methods.includes(method)) {
    return { ok: false, error: 'طريقة الدفع غير صالحة', code: 'INVALID_PAYMENT_METHOD' };
  }

  const id = 'pay_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const amount = adjustedTotalCost;
  const platformFee = adjustedPlatformFee;
  const workerPayout = amount - platformFee;

  const payment = {
    id,
    jobId,
    employerId,
    amount,
    platformFee,
    workerPayout,
    method,
    status: 'pending',
    workersAccepted: job.workersAccepted,
    dailyWage: job.dailyWage,
    durationDays: job.durationDays,
    createdAt: now,
    confirmedAt: null,
    completedAt: null,
    disputedBy: null,
    disputeReason: null,
    disputedAt: null,
    notes: options.notes || null,
    attendanceBreakdown,
  };

  // Save payment file
  const paymentPath = getRecordPath('payments', id);
  await atomicWrite(paymentPath, payment);

  // Update job-payments index
  await addToSetIndex(JOB_PAYMENTS_INDEX, jobId, id);

  logger.info('Payment created', { paymentId: id, jobId, employerId, amount, platformFee });

  eventBus.emit('payment:created', {
    paymentId: id,
    jobId,
    employerId,
    amount,
    platformFee,
  });

  return { ok: true, payment };
  }); // end withLock
}

/**
 * Employer confirms cash payment
 * @param {string} paymentId
 * @param {string} employerId
 */
export async function confirmPayment(paymentId, employerId) {
  const payment = await findById(paymentId);
  if (!payment) {
    return { ok: false, error: 'سجل الدفع غير موجود', code: 'PAYMENT_NOT_FOUND' };
  }
  if (payment.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تأكد هذه الدفعة', code: 'NOT_PAYMENT_OWNER' };
  }
  if (payment.status !== 'pending') {
    return { ok: false, error: 'لا يمكن تأكيد هذه الدفعة — الحالة الحالية: ' + payment.status, code: 'INVALID_PAYMENT_STATUS' };
  }

  payment.status = 'employer_confirmed';
  payment.confirmedAt = new Date().toISOString();

  const paymentPath = getRecordPath('payments', paymentId);
  await atomicWrite(paymentPath, payment);

  logger.info('Payment confirmed', { paymentId, employerId });

  eventBus.emit('payment:confirmed', {
    paymentId,
    jobId: payment.jobId,
    employerId,
    amount: payment.amount,
  });

  return { ok: true, payment };
}

/**
 * Admin completes/finalizes a payment
 * Requires status: employer_confirmed OR disputed (resolve)
 * @param {string} paymentId
 */
export async function completePayment(paymentId) {
  const payment = await findById(paymentId);
  if (!payment) {
    return { ok: false, error: 'سجل الدفع غير موجود', code: 'PAYMENT_NOT_FOUND' };
  }
  if (payment.status !== 'employer_confirmed' && payment.status !== 'disputed') {
    return { ok: false, error: 'لا يمكن إنهاء هذه الدفعة — الحالة الحالية: ' + payment.status, code: 'INVALID_PAYMENT_STATUS' };
  }

  payment.status = 'completed';
  payment.completedAt = new Date().toISOString();

  const paymentPath = getRecordPath('payments', paymentId);
  await atomicWrite(paymentPath, payment);

  logger.info('Payment completed', { paymentId, jobId: payment.jobId });

  eventBus.emit('payment:completed', {
    paymentId,
    jobId: payment.jobId,
    employerId: payment.employerId,
    amount: payment.amount,
    platformFee: payment.platformFee,
  });

  return { ok: true, payment };
}

/**
 * Raise a dispute on a payment
 * @param {string} paymentId
 * @param {string} userId — employer or accepted worker
 * @param {string} reason — dispute reason (min 5 chars)
 */
export async function disputePayment(paymentId, userId, reason) {
  const payment = await findById(paymentId);
  if (!payment) {
    return { ok: false, error: 'سجل الدفع غير موجود', code: 'PAYMENT_NOT_FOUND' };
  }
  if (payment.status === 'completed') {
    return { ok: false, error: 'لا يمكن فتح نزاع على دفعة مكتملة', code: 'PAYMENT_ALREADY_COMPLETED' };
  }
  if (payment.status === 'disputed') {
    return { ok: false, error: 'تم فتح نزاع على هذه الدفعة بالفعل', code: 'ALREADY_DISPUTED' };
  }

  // Check dispute window
  const { findById: findJobById } = await import('./jobs.js');
  const job = await findJobById(payment.jobId);
  if (job && job.completedAt) {
    const completedDate = new Date(job.completedAt);
    const windowMs = config.PAYMENTS.disputeWindowDays * 24 * 60 * 60 * 1000;
    if (Date.now() - completedDate.getTime() > windowMs) {
      return { ok: false, error: 'انتهت مهلة فتح النزاع', code: 'DISPUTE_WINDOW_CLOSED' };
    }
  }

  // Check user involvement — employer or accepted worker
  let isInvolved = false;
  if (payment.employerId === userId) {
    isInvolved = true;
  } else {
    // Check if user is an accepted worker on this job
    const { listByJob: listAppsByJob } = await import('./applications.js');
    const apps = await listAppsByJob(payment.jobId);
    isInvolved = apps.some(a => a.workerId === userId && a.status === 'accepted');
  }

  if (!isInvolved) {
    return { ok: false, error: 'مش مسموحلك تفتح نزاع على هذه الدفعة', code: 'NOT_INVOLVED' };
  }

  payment.status = 'disputed';
  payment.disputedBy = userId;
  payment.disputeReason = reason;
  payment.disputedAt = new Date().toISOString();

  const paymentPath = getRecordPath('payments', paymentId);
  await atomicWrite(paymentPath, payment);

  logger.info('Payment disputed', { paymentId, userId, reason });

  eventBus.emit('payment:disputed', {
    paymentId,
    jobId: payment.jobId,
    employerId: payment.employerId,
    disputedBy: userId,
    reason,
  });

  return { ok: true, payment };
}

/**
 * Find payment by ID
 * @param {string} paymentId
 */
export async function findById(paymentId) {
  const paymentPath = getRecordPath('payments', paymentId);
  return await safeReadJSON(paymentPath);
}

/**
 * List payments for a job (index-accelerated with fallback)
 * @param {string} jobId
 */
export async function listByJob(jobId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(JOB_PAYMENTS_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const payId of indexedIds) {
      const pay = await readJSON(getRecordPath('payments', payId));
      if (pay) results.push(pay);
    }
    return results;
  }

  // Fallback: full scan
  const paymentsDir = getCollectionPath('payments');
  const all = await listJSON(paymentsDir);
  return all.filter(p => p.id && p.id.startsWith('pay_') && p.jobId === jobId);
}

/**
 * List all payments (for admin)
 */
export async function listAll() {
  const paymentsDir = getCollectionPath('payments');
  const all = await listJSON(paymentsDir);
  return all.filter(p => p.id && p.id.startsWith('pay_'));
}

/**
 * Get aggregated financial summary
 */
export async function getFinancialSummary() {
  const payments = await listAll();

  const summary = {
    totalPayments: payments.length,
    byStatus: { pending: 0, employer_confirmed: 0, completed: 0, disputed: 0 },
    totalAmount: 0,
    totalPlatformFee: 0,
    totalWorkerPayout: 0,
    completedAmount: 0,
    completedPlatformFee: 0,
    completedWorkerPayout: 0,
    pendingAmount: 0,
    pendingPlatformFee: 0,
    disputedCount: 0,
  };

  for (const pay of payments) {
    // Status counts
    if (summary.byStatus[pay.status] !== undefined) {
      summary.byStatus[pay.status]++;
    }

    // Totals
    summary.totalAmount += pay.amount || 0;
    summary.totalPlatformFee += pay.platformFee || 0;
    summary.totalWorkerPayout += pay.workerPayout || 0;

    // Completed money
    if (pay.status === 'completed') {
      summary.completedAmount += pay.amount || 0;
      summary.completedPlatformFee += pay.platformFee || 0;
      summary.completedWorkerPayout += pay.workerPayout || 0;
    }

    // Pending money (pending + employer_confirmed)
    if (pay.status === 'pending' || pay.status === 'employer_confirmed') {
      summary.pendingAmount += pay.amount || 0;
      summary.pendingPlatformFee += pay.platformFee || 0;
    }

    // Disputed
    if (pay.status === 'disputed') {
      summary.disputedCount++;
    }
  }

  return summary;
}

/**
 * Count payments by status
 */
export async function countByStatus() {
  const payments = await listAll();
  const counts = { pending: 0, employer_confirmed: 0, completed: 0, disputed: 0, total: payments.length };
  for (const pay of payments) {
    if (counts[pay.status] !== undefined) counts[pay.status]++;
  }
  return counts;
}
