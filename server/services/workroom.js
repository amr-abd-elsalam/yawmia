// ═══════════════════════════════════════════════════════════════
// server/services/workroom.js — Job Workroom Abstraction (Phase 51)
// ═══════════════════════════════════════════════════════════════
// First-class job-scoped workroom wrapper.
// Built on top of existing jobs/applications/messages/attendance/payments.
//
// Access rules:
//   - employer owns job
//   - accepted/worker_confirmed worker on job
//   - synthetic direct_offer job accepted worker
//
// This service does NOT break existing messages APIs.
// It adds workroom list/detail/timeline/quick-template support.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  getFromSetIndex,
} from './database.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isEnabled() {
  return !!(config.WORKROOM && config.WORKROOM.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function isActiveWorkroomStatus(status) {
  return status === 'filled' || status === 'in_progress' || status === 'completed';
}

function isWorkerAcceptedStatus(status) {
  return status === 'accepted' || status === 'worker_confirmed';
}

function sortNewestFirst(a, b) {
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

function sortTimeline(a, b) {
  return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
}

function publicJobSummary(job) {
  if (!job) return null;
  return {
    id: job.id,
    title: job.title,
    category: job.category,
    governorate: job.governorate,
    status: job.status,
    urgency: job.urgency || 'normal',
    dailyWage: job.dailyWage,
    startDate: job.startDate,
    durationDays: job.durationDays,
    workersNeeded: job.workersNeeded,
    workersAccepted: job.workersAccepted,
    sourceType: job.sourceType || null,
    sourceOfferId: job.sourceOfferId || null,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
  };
}

function getTemplateKey(text, role) {
  if (!text || !role) return null;
  const templates = config.WORKROOM?.positiveTemplates?.[role] || [];
  const idx = templates.indexOf(text);
  if (idx === -1) return null;
  return `${role}_${idx}`;
}

// ─────────────────────────────────────────────────────────────
// Persistent metadata
// ─────────────────────────────────────────────────────────────

/**
 * Ensure a workroom metadata record exists for a job.
 * Metadata is lightweight and rebuildable.
 *
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function ensureWorkroomForJob(jobId) {
  if (!isEnabled()) return null;
  if (!jobId) return null;

  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);
  if (!job) return null;

  const path = getRecordPath('workrooms', jobId);
  let record = await readJSON(path);

  if (!record) {
    record = {
      id: jobId,
      jobId,
      employerId: job.employerId,
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastOpenedAt: null,
      lastMessageAt: null,
      metadata: {},
    };
    await atomicWrite(path, record);
    return record;
  }

  let changed = false;
  if (record.employerId !== job.employerId) {
    record.employerId = job.employerId;
    changed = true;
  }
  if (!record.updatedAt) {
    record.updatedAt = nowIso();
    changed = true;
  }

  if (changed) await atomicWrite(path, record);
  return record;
}

async function updateWorkroomMetadata(jobId, patch = {}) {
  if (!isEnabled()) return null;

  const path = getRecordPath('workrooms', jobId);
  let record = await readJSON(path);

  if (!record) {
    record = await ensureWorkroomForJob(jobId);
  }

  if (!record) return null;

  const next = {
    ...record,
    ...patch,
    updatedAt: nowIso(),
    metadata: {
      ...(record.metadata || {}),
      ...(patch.metadata || {}),
    },
  };

  await atomicWrite(path, next);
  return next;
}

// ─────────────────────────────────────────────────────────────
// Access control
// ─────────────────────────────────────────────────────────────

/**
 * Resolve workroom access for a user.
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<{ allowed: boolean, code?: string, error?: string, job?: object, role?: 'worker'|'employer', workerIds?: string[] }>}
 */
async function resolveAccess(jobId, userId) {
  if (!isEnabled()) {
    return { allowed: false, code: 'WORKROOM_DISABLED', error: 'مساحة العمل غير مفعّلة' };
  }

  if (!jobId || !userId) {
    return { allowed: false, code: 'INVALID_REQUEST', error: 'طلب غير صالح' };
  }

  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);

  if (!job) {
    return { allowed: false, code: 'JOB_NOT_FOUND', error: 'الفرصة غير موجودة' };
  }

  if (!isActiveWorkroomStatus(job.status)) {
    return { allowed: false, code: 'WORKROOM_NOT_AVAILABLE', error: 'مساحة العمل غير متاحة لهذه الفرصة حالياً' };
  }

  if (job.employerId === userId) {
    const workerIds = await getAcceptedWorkerIds(job);
    return { allowed: true, job, role: 'employer', workerIds };
  }

  // Direct offer synthetic job fast path.
  if (job.sourceType === 'direct_offer' && job.sourceOfferId) {
    try {
      const { findById: findOffer } = await import('./directOffer.js');
      const offer = await findOffer(job.sourceOfferId);
      if (offer && offer.status === 'accepted' && offer.workerId === userId) {
        return { allowed: true, job, role: 'worker', workerIds: [userId] };
      }
    } catch (_) {
      // fall through to application lookup
    }
  }

  const { listByJob } = await import('./applications.js');
  const apps = await listByJob(jobId);
  const accepted = apps.find(a => a.workerId === userId && isWorkerAcceptedStatus(a.status));

  if (!accepted) {
    return { allowed: false, code: 'NOT_WORKROOM_PARTICIPANT', error: 'أنت غير مشترك في مساحة العمل هذه' };
  }

  const workerIds = apps
    .filter(a => isWorkerAcceptedStatus(a.status))
    .map(a => a.workerId);

  return { allowed: true, job, role: 'worker', workerIds };
}

/**
 * Return accepted worker IDs for a job.
 */
async function getAcceptedWorkerIds(job) {
  if (!job) return [];

  // Direct offer synthetic job.
  if (job.sourceType === 'direct_offer' && job.sourceOfferId) {
    try {
      const { findById: findOffer } = await import('./directOffer.js');
      const offer = await findOffer(job.sourceOfferId);
      if (offer && offer.status === 'accepted' && offer.workerId) {
        return [offer.workerId];
      }
    } catch (_) {
      // continue
    }
  }

  try {
    const { listByJob } = await import('./applications.js');
    const apps = await listByJob(job.id);
    return apps
      .filter(a => isWorkerAcceptedStatus(a.status))
      .map(a => a.workerId);
  } catch (_) {
    return [];
  }
}

/**
 * Count unread messages in a job for a user.
 */
async function countUnreadWorkroomMessages(jobId, userId) {
  try {
    const { listByJob } = await import('./messages.js');
    const result = await listByJob(jobId, userId, { limit: 10000, offset: 0 });
    const items = result.items || [];
    return items.filter(m => !m.read && m.senderId !== userId).length;
  } catch (_) {
    return 0;
  }
}

/**
 * Get latest message timestamp for a job visible to user.
 */
async function getLastMessageAt(jobId, userId) {
  try {
    const { listByJob } = await import('./messages.js');
    const result = await listByJob(jobId, userId, { limit: 1, offset: 0 });
    const item = result.items && result.items[0];
    return item ? item.createdAt : null;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Workroom computed model
// ─────────────────────────────────────────────────────────────

async function buildWorkroom(job, userId, role, workerIds, options = {}) {
  const unreadMessages = await countUnreadWorkroomMessages(job.id, userId);
  const lastMessageAt = await getLastMessageAt(job.id, userId);

  const workroom = {
    jobId: job.id,
    title: job.title,
    status: job.status,
    employerId: job.employerId,
    workerIds: workerIds || [],
    userRoleInWorkroom: role,
    unreadMessages,
    lastMessageAt,
    job: publicJobSummary(job),
    quickTemplates: config.WORKROOM?.quickTemplatesEnabled
      ? (config.WORKROOM.positiveTemplates?.[role] || [])
      : [],
  };

  if (options.includeTimeline) {
    workroom.timeline = await getWorkroomTimeline(job.id, userId);
  }

  return workroom;
}

// ─────────────────────────────────────────────────────────────
// Public service API
// ─────────────────────────────────────────────────────────────

/**
 * List workrooms for a user.
 *
 * @param {string} userId
 * @param {{ status?: string, activeOnly?: boolean, limit?: number, offset?: number }} options
 */
export async function getUserWorkrooms(userId, options = {}) {
  if (!isEnabled()) {
    return { workrooms: [], total: 0, limit: 20, offset: 0 };
  }

  const { findById: findUser } = await import('./users.js');
  const user = await findUser(userId);
  if (!user || user.status !== 'active') {
    return { workrooms: [], total: 0, limit: 20, offset: 0 };
  }

  let jobs = [];

  if (user.role === 'employer') {
    try {
      const jobIds = await getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, userId);
      const { readJSON: readJSONFn, getRecordPath: getRecordPathFn } = await import('./database.js');
      for (const jobId of jobIds) {
        const job = await readJSONFn(getRecordPathFn('jobs', jobId));
        if (job) jobs.push(job);
      }
    } catch (err) {
      logger.warn('workroom: employer jobs lookup failed', { userId, error: err.message });
    }
  } else if (user.role === 'worker') {
    try {
      const { listByWorker } = await import('./applications.js');
      const { findById: findJob } = await import('./jobs.js');

      const apps = await listByWorker(userId);
      const acceptedApps = apps.filter(a => isWorkerAcceptedStatus(a.status));
      for (const app of acceptedApps) {
        const job = await findJob(app.jobId);
        if (job) jobs.push(job);
      }
    } catch (err) {
      logger.warn('workroom: worker apps lookup failed', { userId, error: err.message });
    }
  }

  // Filter by workroom-eligible status.
  jobs = jobs.filter(j => isActiveWorkroomStatus(j.status));

  if (options.status) {
    jobs = jobs.filter(j => j.status === options.status);
  }

  if (options.activeOnly !== false) {
    jobs = jobs.filter(j => j.status === 'filled' || j.status === 'in_progress');
  }

  const workrooms = [];
  for (const job of jobs) {
    try {
      const access = await resolveAccess(job.id, userId);
      if (!access.allowed) continue;
      await ensureWorkroomForJob(job.id);
      workrooms.push(await buildWorkroom(access.job, userId, access.role, access.workerIds));
    } catch (_) {
      // Per-job isolation.
    }
  }

  workrooms.sort((a, b) => {
    const at = a.lastMessageAt || a.job.startedAt || a.job.createdAt || '';
    const bt = b.lastMessageAt || b.job.startedAt || b.job.createdAt || '';
    return new Date(bt) - new Date(at);
  });

  const total = workrooms.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    workrooms: workrooms.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Get one workroom.
 *
 * @param {string} jobId
 * @param {string} userId
 */
export async function getWorkroom(jobId, userId) {
  const access = await resolveAccess(jobId, userId);
  if (!access.allowed) {
    return { ok: false, error: access.error, code: access.code };
  }

  await ensureWorkroomForJob(jobId);
  await updateWorkroomMetadata(jobId, { lastOpenedAt: nowIso() }).catch(() => {});

  const workroom = await buildWorkroom(access.job, userId, access.role, access.workerIds, {
    includeTimeline: false,
  });

  return { ok: true, workroom };
}

/**
 * List messages in a workroom.
 */
export async function listWorkroomMessages(jobId, userId, options = {}) {
  const access = await resolveAccess(jobId, userId);
  if (!access.allowed) {
    return { ok: false, error: access.error, code: access.code };
  }

  const { listByJob } = await import('./messages.js');
  const result = await listByJob(jobId, userId, {
    limit: options.limit || 50,
    offset: options.offset || 0,
  });

  return { ok: true, ...result };
}

/**
 * Send a message through workroom wrapper.
 *
 * fields:
 *   - text
 *   - recipientId? (required for employer if multiple accepted workers)
 *   - templateKey?
 */
export async function sendWorkroomMessage(jobId, senderId, fields = {}) {
  const access = await resolveAccess(jobId, senderId);
  if (!access.allowed) {
    return { ok: false, error: access.error, code: access.code };
  }

  const text = typeof fields.text === 'string' ? fields.text.trim() : '';
  if (!text) {
    return { ok: false, error: 'نص الرسالة مطلوب', code: 'TEXT_REQUIRED' };
  }

  let recipientId = fields.recipientId || null;

  if (access.role === 'worker') {
    recipientId = access.job.employerId;
  } else if (access.role === 'employer') {
    if (!recipientId && access.workerIds.length === 1) {
      recipientId = access.workerIds[0];
    }

    if (!recipientId && access.workerIds.length > 1) {
      return {
        ok: false,
        error: 'اختار العامل المستلم للرسالة',
        code: 'RECIPIENT_REQUIRED',
      };
    }

    if (!access.workerIds.includes(recipientId)) {
      return {
        ok: false,
        error: 'المستلم غير مشترك في مساحة العمل',
        code: 'RECIPIENT_NOT_INVOLVED',
      };
    }
  }

  const templateKey = fields.templateKey || getTemplateKey(text, access.role);

  const { sendMessage } = await import('./messages.js');
  const result = await sendMessage(jobId, senderId, {
    recipientId,
    text,
    source: 'workroom',
    templateKey,
  });

  if (!result.ok) return result;

  await updateWorkroomMetadata(jobId, { lastMessageAt: result.message.createdAt }).catch(() => {});

  eventBus.emit('workroom:message_sent', {
    jobId,
    messageId: result.message.id,
    senderId,
    recipientId,
    templateKey: templateKey || null,
    timestamp: result.message.createdAt,
  });

  return { ok: true, message: result.message };
}

/**
 * Mark all workroom messages as read.
 */
export async function markWorkroomRead(jobId, userId) {
  const access = await resolveAccess(jobId, userId);
  if (!access.allowed) {
    return { ok: false, error: access.error, code: access.code };
  }

  const { markAllAsRead } = await import('./messages.js');
  const result = await markAllAsRead(jobId, userId);

  return { ok: true, count: result.count || 0 };
}

/**
 * Build timeline for a workroom.
 *
 * @param {string} jobId
 * @param {string} userId
 * @param {{ limit?: number }} options
 */
export async function getWorkroomTimeline(jobId, userId, options = {}) {
  const access = await resolveAccess(jobId, userId);
  if (!access.allowed) {
    return { ok: false, error: access.error, code: access.code, timeline: [] };
  }

  if (!config.WORKROOM?.showTimelineEvents) {
    return { ok: true, timeline: [] };
  }

  const timeline = [];
  const job = access.job;

  // Job created.
  if (job.createdAt) {
    timeline.push({
      type: 'job_created',
      label: 'تم إنشاء الفرصة',
      timestamp: job.createdAt,
      meta: { jobId: job.id },
    });
  }

  // Applications accepted.
  try {
    const { listByJob } = await import('./applications.js');
    const apps = await listByJob(jobId);
    for (const app of apps) {
      if (isWorkerAcceptedStatus(app.status)) {
        timeline.push({
          type: 'application_accepted',
          label: 'تم قبول عامل في الفرصة',
          timestamp: app.workerConfirmedAt || app.respondedAt || app.appliedAt,
          meta: {
            applicationId: app.id,
            workerId: app.workerId,
          },
        });
      }
    }
  } catch (_) {
    // optional
  }

  // Job started/completed.
  if (job.startedAt) {
    timeline.push({
      type: 'job_started',
      label: 'بدأ تنفيذ الفرصة',
      timestamp: job.startedAt,
      meta: { jobId: job.id },
    });
  }

  // Attendance.
  try {
    const { listByJob } = await import('./attendance.js');
    const records = await listByJob(jobId);
    for (const r of records) {
      if (r.checkInAt) {
        timeline.push({
          type: 'attendance_checkin',
          label: 'عامل سجّل حضوره',
          timestamp: r.checkInAt,
          meta: {
            attendanceId: r.id,
            workerId: r.workerId,
            status: r.status,
          },
        });
      }
      if (r.employerConfirmedAt) {
        timeline.push({
          type: 'attendance_confirmed',
          label: 'تم تأكيد الحضور',
          timestamp: r.employerConfirmedAt,
          meta: {
            attendanceId: r.id,
            workerId: r.workerId,
          },
        });
      }
      if (r.noShowReportedAt) {
        timeline.push({
          type: 'attendance_noshow',
          label: 'تم تسجيل غياب',
          timestamp: r.noShowReportedAt,
          meta: {
            attendanceId: r.id,
            workerId: r.workerId,
          },
        });
      }
    }
  } catch (_) {
    // optional
  }

  // Payments.
  try {
    const { listByJob } = await import('./payments.js');
    const payments = await listByJob(jobId);
    for (const p of payments) {
      if (p.createdAt) {
        timeline.push({
          type: 'payment_created',
          label: 'تم إنشاء سجل دفع',
          timestamp: p.createdAt,
          meta: {
            paymentId: p.id,
            amount: p.amount,
            status: p.status,
          },
        });
      }
      if (p.confirmedAt) {
        timeline.push({
          type: 'payment_confirmed',
          label: 'صاحب العمل أكد الدفع',
          timestamp: p.confirmedAt,
          meta: {
            paymentId: p.id,
            amount: p.amount,
          },
        });
      }
      if (p.completedAt) {
        timeline.push({
          type: 'payment_completed',
          label: 'تم إنهاء الدفع',
          timestamp: p.completedAt,
          meta: {
            paymentId: p.id,
            amount: p.amount,
          },
        });
      }
      if (p.disputedAt) {
        timeline.push({
          type: 'payment_disputed',
          label: 'تم فتح نزاع على الدفع',
          timestamp: p.disputedAt,
          meta: {
            paymentId: p.id,
            disputedBy: p.disputedBy,
          },
        });
      }
    }
  } catch (_) {
    // optional
  }

  if (job.completedAt) {
    timeline.push({
      type: 'job_completed',
      label: 'تم إنهاء الفرصة',
      timestamp: job.completedAt,
      meta: { jobId: job.id },
    });

    timeline.push({
      type: 'rating_prompt',
      label: 'يمكنك تقييم التجربة',
      timestamp: job.completedAt,
      meta: { jobId: job.id },
    });
  }

  timeline.sort(sortTimeline);

  const max = Math.min(
    config.WORKROOM.maxTimelineEvents || 200,
    Math.max(1, parseInt(options.limit) || config.WORKROOM.maxTimelineEvents || 200)
  );

  return {
    ok: true,
    timeline: timeline.slice(-max),
    total: timeline.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Stats / diagnostics
// ─────────────────────────────────────────────────────────────

export async function getWorkroomStats() {
  try {
    const dir = getCollectionPath('workrooms');
    const all = await listJSON(dir);
    const records = all.filter(w => w && w.id);
    return {
      enabled: isEnabled(),
      totalWorkrooms: records.length,
      activeMetadataRecords: records.filter(w => w.status === 'active').length,
    };
  } catch (_) {
    return { enabled: isEnabled(), totalWorkrooms: 0, activeMetadataRecords: 0 };
  }
}

// ─────────────────────────────────────────────────────────────
// EventBus integration
// ─────────────────────────────────────────────────────────────

eventBus.on('job:filled', (data) => {
  if (!data || !data.jobId) return;
  ensureWorkroomForJob(data.jobId).catch(() => {});
});

eventBus.on('job:started', (data) => {
  if (!data || !data.jobId) return;
  ensureWorkroomForJob(data.jobId).catch(() => {});
});

eventBus.on('direct_offer:accepted', (data) => {
  if (!data || !data.jobId) return;
  ensureWorkroomForJob(data.jobId).catch(() => {});
});

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

export const _testHelpers = {
  isEnabled,
  isActiveWorkroomStatus,
  isWorkerAcceptedStatus,
  publicJobSummary,
  getTemplateKey,
  resolveAccess,
  getAcceptedWorkerIds,
  countUnreadWorkroomMessages,
  getLastMessageAt,
  buildWorkroom,
};
