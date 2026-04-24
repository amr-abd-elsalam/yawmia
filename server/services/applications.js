// ═══════════════════════════════════════════════════════════════
// server/services/applications.js — Application Lifecycle
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { findById as findJobById, incrementAccepted } from './jobs.js';
import { eventBus } from './eventBus.js';
import { withLock } from './resourceLock.js';

const WORKER_APPS_INDEX = config.DATABASE.indexFiles.workerAppsIndex;
const JOB_APPS_INDEX = config.DATABASE.indexFiles.jobAppsIndex;

/**
 * Apply to a job
 */
export function apply(jobId, workerId) {
  return withLock(`apply:${jobId}:${workerId}`, async () => {
  // Check job exists and is open
  const job = await findJobById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'open') {
    return { ok: false, error: 'الفرصة مش متاحة للتقديم', code: 'JOB_NOT_OPEN' };
  }

  // Check not already applied
  const existing = await findByJobAndWorker(jobId, workerId);
  if (existing) {
    return { ok: false, error: 'أنت تقدمت لهذه الفرصة بالفعل', code: 'ALREADY_APPLIED' };
  }

  const id = 'app_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const application = {
    id,
    jobId,
    workerId,
    status: 'pending',
    appliedAt: now,
    respondedAt: null,
  };

  const appPath = getRecordPath('applications', id);
  await atomicWrite(appPath, application);

  // Update secondary indexes
  await addToSetIndex(WORKER_APPS_INDEX, workerId, id);
  await addToSetIndex(JOB_APPS_INDEX, jobId, id);

  eventBus.emit('application:submitted', { applicationId: id, jobId, workerId, employerId: job.employerId });

  return { ok: true, application };
  }); // end withLock
}

/**
 * Accept a worker application
 */
export function accept(applicationId, employerId) {
  return withLock(`accept:${applicationId}`, async () => {
  const application = await findById(applicationId);
  if (!application) {
    return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
  }

  // Verify employer owns the job
  const job = await findJobById(application.jobId);
  if (!job || job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تتحكم في هذا الطلب', code: 'NOT_JOB_OWNER' };
  }

  if (application.status !== 'pending') {
    return { ok: false, error: 'تم الرد على هذا الطلب بالفعل', code: 'ALREADY_RESPONDED' };
  }

  // Check if job still has room
  if (job.workersAccepted >= job.workersNeeded) {
    return { ok: false, error: 'الفرصة اكتملت بالفعل', code: 'JOB_FILLED' };
  }

  // Update application
  application.status = 'accepted';
  application.respondedAt = new Date().toISOString();

  const appPath = getRecordPath('applications', applicationId);
  await atomicWrite(appPath, application);

  // Increment accepted count
  const updatedJob = await incrementAccepted(application.jobId);

  // Emit rich event for notifications
  eventBus.emit('application:accepted', {
    applicationId,
    jobId: application.jobId,
    workerId: application.workerId,
    employerId,
    jobTitle: job.title,
  });

  // Check if job is now filled
  if (updatedJob && updatedJob.status === 'filled') {
    eventBus.emit('job:filled', {
      jobId: application.jobId,
      employerId,
      jobTitle: job.title,
    });
  }

  return { ok: true, application };
  }); // end withLock
}

/**
 * Reject a worker application
 */
export async function reject(applicationId, employerId) {
  const application = await findById(applicationId);
  if (!application) {
    return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
  }

  // Verify employer owns the job
  const job = await findJobById(application.jobId);
  if (!job || job.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تتحكم في هذا الطلب', code: 'NOT_JOB_OWNER' };
  }

  if (application.status !== 'pending') {
    return { ok: false, error: 'تم الرد على هذا الطلب بالفعل', code: 'ALREADY_RESPONDED' };
  }

  application.status = 'rejected';
  application.respondedAt = new Date().toISOString();

  const appPath = getRecordPath('applications', applicationId);
  await atomicWrite(appPath, application);

  // Emit rich event for notifications
  eventBus.emit('application:rejected', {
    applicationId,
    jobId: application.jobId,
    workerId: application.workerId,
    employerId,
    jobTitle: job.title,
  });

  return { ok: true, application };
}

/**
 * Find application by ID
 */
export async function findById(applicationId) {
  const appPath = getRecordPath('applications', applicationId);
  return await readJSON(appPath);
}

/**
 * Find application by job + worker (index-accelerated with fallback)
 */
export async function findByJobAndWorker(jobId, workerId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(JOB_APPS_INDEX, jobId);
  if (indexedIds.length > 0) {
    for (const appId of indexedIds) {
      const app = await readJSON(getRecordPath('applications', appId));
      if (app && app.workerId === workerId) return app;
    }
    return null;
  }

  // Fallback: full scan (backward compatibility for pre-index data)
  const appsDir = getCollectionPath('applications');
  const all = await listJSON(appsDir);
  return all.find(a => a.jobId === jobId && a.workerId === workerId) || null;
}

/**
 * List all applications for a job (index-accelerated with fallback)
 */
export async function listByJob(jobId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(JOB_APPS_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const appId of indexedIds) {
      const app = await readJSON(getRecordPath('applications', appId));
      if (app) results.push(app);
    }
    return results;
  }

  // Fallback: full scan (backward compatibility for pre-index data)
  const appsDir = getCollectionPath('applications');
  const all = await listJSON(appsDir);
  return all.filter(a => a.jobId === jobId);
}

/**
 * List all applications by a worker (index-accelerated with fallback)
 */
export async function listByWorker(workerId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(WORKER_APPS_INDEX, workerId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const appId of indexedIds) {
      const app = await readJSON(getRecordPath('applications', appId));
      if (app) results.push(app);
    }
    return results;
  }

  // Fallback: full scan (backward compatibility for pre-index data)
  const appsDir = getCollectionPath('applications');
  const all = await listJSON(appsDir);
  return all.filter(a => a.workerId === workerId);
}

/**
 * Count applications submitted by a worker today
 * @param {string} workerId
 * @returns {Promise<number>}
 */
export async function countTodayByWorker(workerId) {
  const apps = await listByWorker(workerId);
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  return apps.filter(a => new Date(a.appliedAt) >= todayMidnight).length;
}

/**
 * List all applications (for admin)
 */
export async function listAll() {
  const appsDir = getCollectionPath('applications');
  return await listJSON(appsDir);
}

/**
 * Count applications by status
 */
export async function countByStatus() {
  const apps = await listAll();
  const counts = { pending: 0, accepted: 0, rejected: 0, withdrawn: 0, total: apps.length };
  for (const app of apps) {
    if (counts[app.status] !== undefined) counts[app.status]++;
  }
  return counts;
}

/**
 * Worker confirms acceptance (two-phase acceptance)
 * @param {string} applicationId
 * @param {string} workerId
 * @returns {Promise<{ ok: boolean, application?: object, error?: string, code?: string }>}
 */
export function workerConfirm(applicationId, workerId) {
  return withLock(`confirm:${applicationId}`, async () => {
    const application = await findById(applicationId);
    if (!application) {
      return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
    }
    if (application.workerId !== workerId) {
      return { ok: false, error: 'مش مسموحلك تأكد هذا الطلب', code: 'NOT_APPLICATION_OWNER' };
    }
    if (application.status !== 'accepted') {
      return { ok: false, error: 'الطلب مش في حالة مقبول', code: 'INVALID_STATUS' };
    }

    // Deadline check
    if (application.respondedAt && config.JOBS.workerConfirmationTimeoutHours) {
      const deadline = new Date(new Date(application.respondedAt).getTime() + config.JOBS.workerConfirmationTimeoutHours * 60 * 60 * 1000);
      if (new Date() > deadline) {
        return { ok: false, error: 'انتهت مهلة التأكيد', code: 'DEADLINE_PASSED' };
      }
    }

    application.status = 'worker_confirmed';
    application.workerConfirmedAt = new Date().toISOString();
    const appPath = getRecordPath('applications', applicationId);
    await atomicWrite(appPath, application);

    eventBus.emit('application:worker_confirmed', {
      applicationId,
      jobId: application.jobId,
      workerId,
    });

    return { ok: true, application };
  });
}

/**
 * Worker declines acceptance (two-phase acceptance)
 * @param {string} applicationId
 * @param {string} workerId
 * @returns {Promise<{ ok: boolean, application?: object, error?: string, code?: string }>}
 */
export function workerDecline(applicationId, workerId) {
  return withLock(`decline:${applicationId}`, async () => {
    const application = await findById(applicationId);
    if (!application) {
      return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
    }
    if (application.workerId !== workerId) {
      return { ok: false, error: 'مش مسموحلك ترفض هذا الطلب', code: 'NOT_APPLICATION_OWNER' };
    }
    if (application.status !== 'accepted') {
      return { ok: false, error: 'الطلب مش في حالة مقبول', code: 'INVALID_STATUS' };
    }

    application.status = 'worker_declined';
    application.workerDeclinedAt = new Date().toISOString();
    const appPath = getRecordPath('applications', applicationId);
    await atomicWrite(appPath, application);

    // Decrement workersAccepted on the job
    const job = await findJobById(application.jobId);
    if (job && job.workersAccepted > 0) {
      job.workersAccepted -= 1;
      // Revert job status from filled → open if needed
      if (job.status === 'filled' && job.workersAccepted < job.workersNeeded) {
        job.status = 'open';
        // Update jobs index
        const { readIndex, writeIndex } = await import('./database.js');
        const jobsIndex = await readIndex('jobsIndex');
        if (jobsIndex[job.id]) {
          jobsIndex[job.id].status = 'open';
          await writeIndex('jobsIndex', jobsIndex);
        }
      }
      const jobPath = getRecordPath('jobs', job.id);
      await atomicWrite(jobPath, job);
    }

    eventBus.emit('application:worker_declined', {
      applicationId,
      jobId: application.jobId,
      workerId,
      employerId: job ? job.employerId : null,
    });

    return { ok: true, application };
  });
}

/**
 * Withdraw a pending application (worker action)
 * @param {string} applicationId
 * @param {string} workerId - the requesting worker's ID (ownership check)
 * @returns {Promise<{ ok: boolean, application?: object, error?: string, code?: string }>}
 */
export async function withdraw(applicationId, workerId) {
  // Rule 1: APPLICATION_EXISTS
  const application = await findById(applicationId);
  if (!application) {
    return { ok: false, error: 'الطلب غير موجود', code: 'APPLICATION_NOT_FOUND' };
  }

  // Rule 2: OWNERSHIP_CHECK
  if (application.workerId !== workerId) {
    return { ok: false, error: 'مش مسموحلك تسحب هذا الطلب', code: 'NOT_APPLICATION_OWNER' };
  }

  // Rule 3: STATUS_CHECK — can only withdraw pending
  if (application.status !== 'pending') {
    return { ok: false, error: 'لا يمكن سحب هذا الطلب', code: 'CANNOT_WITHDRAW' };
  }

  // Rule 4: UPDATE
  application.status = 'withdrawn';
  application.respondedAt = new Date().toISOString();

  const appPath = getRecordPath('applications', applicationId);
  await atomicWrite(appPath, application);

  eventBus.emit('application:withdrawn', {
    applicationId,
    jobId: application.jobId,
    workerId,
  });

  return { ok: true, application };
}
