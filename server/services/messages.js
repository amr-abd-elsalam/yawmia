// ═══════════════════════════════════════════════════════════════
// server/services/messages.js — Job-Scoped In-App Messaging
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, getRecordPath, getWriteRecordPath, getCollectionPath,
  listJSON, addToSetIndex, getFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { sanitizeText } from './sanitizer.js';
import { logger } from './logger.js';

const MESSAGE_JOB_INDEX = config.DATABASE.indexFiles.messageJobIndex;
const MESSAGE_USER_INDEX = config.DATABASE.indexFiles.messageUserIndex;

/**
 * Check if a user can send/receive messages on a job
 * Rules:
 *   1. MESSAGES feature enabled
 *   2. Job exists
 *   3. Job status in ['filled', 'in_progress', 'completed']
 *   4. User is employer OR accepted worker on the job
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<{ allowed: boolean, error?: string, code?: string, job?: object }>}
 */
export async function canMessage(jobId, userId) {
  // 1. Feature flag
  if (!config.MESSAGES || !config.MESSAGES.enabled) {
    return { allowed: false, error: 'خدمة الرسائل غير مفعّلة', code: 'MESSAGES_DISABLED' };
  }

  // 2. Job exists
  const { findById: findJob } = await import('./jobs.js');
  const job = await findJob(jobId);
  if (!job) {
    return { allowed: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }

  // 3. Job status check
  const allowedStatuses = ['filled', 'in_progress', 'completed'];
  if (!allowedStatuses.includes(job.status)) {
    return { allowed: false, error: 'الرسائل غير متاحة في هذه المرحلة', code: 'JOB_STATUS_NOT_ELIGIBLE' };
  }

  // 4. User involvement check
  const isEmployer = job.employerId === userId;

  if (!isEmployer) {
    // Check if user is an accepted worker
    if (config.MESSAGES.onlyAfterAcceptance) {
      const { listByJob: listApps } = await import('./applications.js');
      const apps = await listApps(jobId);
      const accepted = apps.find(a => a.workerId === userId && a.status === 'accepted');
      if (!accepted) {
        return { allowed: false, error: 'أنت مش مشارك في هذه الفرصة', code: 'NOT_INVOLVED' };
      }
    }
  }

  return { allowed: true, job };
}

/**
 * Send a message from one user to another on a specific job
 *
 * @param {string} jobId
 * @param {string} senderId
 * @param {{ recipientId: string, text: string }} fields
 * @returns {Promise<{ ok: boolean, message?: object, error?: string, code?: string }>}
 */
export async function sendMessage(jobId, senderId, { recipientId, text }) {
  // 1. canMessage check for sender
  const senderCheck = await canMessage(jobId, senderId);
  if (!senderCheck.allowed) {
    return { ok: false, error: senderCheck.error, code: senderCheck.code };
  }
  const job = senderCheck.job;

  // 2. Validate text
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'نص الرسالة مطلوب', code: 'TEXT_REQUIRED' };
  }

  const sanitized = sanitizeText(text.trim());
  const maxLen = config.MESSAGES.maxLengthChars || 500;
  if (sanitized.length > maxLen) {
    return { ok: false, error: `الرسالة لا تتجاوز ${maxLen} حرف`, code: 'TEXT_TOO_LONG' };
  }

  // 2b. Content filter check
  if (config.CONTENT_FILTER && config.CONTENT_FILTER.enabled && config.CONTENT_FILTER.checkMessages) {
    try {
      const { isContentSafe } = await import('./contentFilter.js');
      if (!isContentSafe(sanitized)) {
        return { ok: false, error: 'الرسالة تحتوي على محتوى غير مسموح', code: 'CONTENT_BLOCKED' };
      }
    } catch (_) { /* content filter failure is non-blocking */ }
  }

  // 3. Validate recipient
  if (!recipientId || typeof recipientId !== 'string') {
    return { ok: false, error: 'معرّف المستلم مطلوب', code: 'RECIPIENT_REQUIRED' };
  }

  // 4. Recipient must also be involved
  const recipientCheck = await canMessage(jobId, recipientId);
  if (!recipientCheck.allowed) {
    return { ok: false, error: 'المستلم مش مشارك في هذه الفرصة', code: 'RECIPIENT_NOT_INVOLVED' };
  }

  // 5. Cannot message self
  if (senderId === recipientId) {
    return { ok: false, error: 'لا يمكنك مراسلة نفسك', code: 'CANNOT_MESSAGE_SELF' };
  }

  // 6. Daily limit per user per job
  const todayCount = await countTodayByUserJob(senderId, jobId);
  const dailyLimit = config.MESSAGES.maxMessagesPerJobPerDay || 50;
  if (todayCount >= dailyLimit) {
    return { ok: false, error: 'وصلت للحد اليومي للرسائل في هذه الفرصة', code: 'DAILY_MESSAGE_LIMIT' };
  }

  // 7. Determine sender role
  const senderRole = job.employerId === senderId ? 'employer' : 'worker';

  // 8. Create message record
  const id = 'msg_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const message = {
    id,
    jobId,
    senderId,
    senderRole,
    recipientId,
    text: sanitized,
    read: false,
    readAt: null,
    createdAt: now,
  };

  const msgPath = getWriteRecordPath('messages', id);
  await atomicWrite(msgPath, message);

  // 9. Update secondary indexes
  await addToSetIndex(MESSAGE_JOB_INDEX, jobId, id);
  await addToSetIndex(MESSAGE_USER_INDEX, recipientId, id);

  // 10. Emit event
  eventBus.emit('message:created', {
    messageId: id,
    jobId,
    senderId,
    senderRole,
    recipientId,
    jobTitle: job.title,
    preview: sanitized.substring(0, 100),
  });

  return { ok: true, message };
}

/**
 * Broadcast a message from employer to all accepted workers on a job
 *
 * @param {string} jobId
 * @param {string} employerId
 * @param {string} text
 * @returns {Promise<{ ok: boolean, message?: object, error?: string, code?: string }>}
 */
export async function broadcastMessage(jobId, employerId, text) {
  // 1. Feature flag for broadcast
  if (config.MESSAGES && config.MESSAGES.allowBroadcast === false) {
    return { ok: false, error: 'البث غير مفعّل', code: 'BROADCAST_DISABLED' };
  }

  // 2. canMessage check
  const check = await canMessage(jobId, employerId);
  if (!check.allowed) {
    return { ok: false, error: check.error, code: check.code };
  }
  const job = check.job;

  // 3. Must be employer
  if (job.employerId !== employerId) {
    return { ok: false, error: 'البث متاح لصاحب العمل فقط', code: 'NOT_JOB_OWNER' };
  }

  // 4. Validate text
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'نص الرسالة مطلوب', code: 'TEXT_REQUIRED' };
  }

  const sanitized = sanitizeText(text.trim());
  const maxLen = config.MESSAGES.maxLengthChars || 500;
  if (sanitized.length > maxLen) {
    return { ok: false, error: `الرسالة لا تتجاوز ${maxLen} حرف`, code: 'TEXT_TOO_LONG' };
  }

  // 4b. Content filter check
  if (config.CONTENT_FILTER && config.CONTENT_FILTER.enabled && config.CONTENT_FILTER.checkMessages) {
    try {
      const { isContentSafe } = await import('./contentFilter.js');
      if (!isContentSafe(sanitized)) {
        return { ok: false, error: 'الرسالة تحتوي على محتوى غير مسموح', code: 'CONTENT_BLOCKED' };
      }
    } catch (_) { /* content filter failure is non-blocking */ }
  }

  // 5. Daily limit
  const todayCount = await countTodayByUserJob(employerId, jobId);
  const dailyLimit = config.MESSAGES.maxMessagesPerJobPerDay || 50;
  if (todayCount >= dailyLimit) {
    return { ok: false, error: 'وصلت للحد اليومي للرسائل في هذه الفرصة', code: 'DAILY_MESSAGE_LIMIT' };
  }

  // 6. Get all accepted worker IDs
  const { listByJob: listApps } = await import('./applications.js');
  const apps = await listApps(jobId);
  const workerIds = apps
    .filter(a => a.status === 'accepted')
    .map(a => a.workerId);

  if (workerIds.length === 0) {
    return { ok: false, error: 'لا يوجد عمال مقبولين في هذه الفرصة', code: 'NO_ACCEPTED_WORKERS' };
  }

  // 7. Create ONE broadcast message (recipientId: null)
  const id = 'msg_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const message = {
    id,
    jobId,
    senderId: employerId,
    senderRole: 'employer',
    recipientId: null, // broadcast
    text: sanitized,
    read: false,
    readAt: null,
    createdAt: now,
  };

  const msgPath = getWriteRecordPath('messages', id);
  await atomicWrite(msgPath, message);

  // 8. Update job index
  await addToSetIndex(MESSAGE_JOB_INDEX, jobId, id);

  // 9. Update user index for each worker (so they can find it via countUnread)
  for (const workerId of workerIds) {
    await addToSetIndex(MESSAGE_USER_INDEX, workerId, id);
  }

  // 10. Emit event
  eventBus.emit('message:broadcast', {
    messageId: id,
    jobId,
    senderId: employerId,
    workerIds,
    jobTitle: job.title,
    preview: sanitized.substring(0, 100),
  });

  return { ok: true, message };
}

/**
 * List messages for a job that the user can see
 * A user sees: messages where they are sender OR recipient OR broadcast (recipientId: null)
 *
 * @param {string} jobId
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
export async function listByJob(jobId, userId, { limit = 50, offset = 0 } = {}) {
  // Get all messages for job
  let jobMessages;

  const indexedIds = await getFromSetIndex(MESSAGE_JOB_INDEX, jobId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const msgId of indexedIds) {
      const msg = await readJSON(getRecordPath('messages', msgId));
      if (msg) results.push(msg);
    }
    jobMessages = results;
  } else {
    // Fallback: full scan
    const msgsDir = getCollectionPath('messages');
    const all = await listJSON(msgsDir);
    jobMessages = all.filter(m => m.jobId === jobId);
  }

  // Filter: user can see messages where they are sender, recipient, or broadcast
  const visible = jobMessages.filter(m =>
    m.senderId === userId ||
    m.recipientId === userId ||
    m.recipientId === null // broadcast
  );

  // Sort newest first
  visible.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = visible.length;
  const items = visible.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

/**
 * Mark a single message as read
 * User must be the recipient (or a broadcast recipient)
 *
 * @param {string} messageId
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, message?: object, error?: string, code?: string }>}
 */
export async function markAsRead(messageId, userId) {
  const msgPath = getRecordPath('messages', messageId);
  const message = await readJSON(msgPath);

  if (!message) {
    return { ok: false, error: 'الرسالة غير موجودة', code: 'MESSAGE_NOT_FOUND' };
  }

  // Ownership: recipient or broadcast recipient
  if (message.recipientId !== null && message.recipientId !== userId) {
    return { ok: false, error: 'مش مسموحلك تعدّل هذه الرسالة', code: 'NOT_MESSAGE_RECIPIENT' };
  }

  // For broadcasts, verify user is involved via index
  if (message.recipientId === null && message.senderId !== userId) {
    // Check if user is in the user-index for this message
    const userMsgIds = await getFromSetIndex(MESSAGE_USER_INDEX, userId);
    if (!userMsgIds.includes(messageId)) {
      return { ok: false, error: 'مش مسموحلك تعدّل هذه الرسالة', code: 'NOT_MESSAGE_RECIPIENT' };
    }
  }

  // Don't re-mark sender's own messages
  if (message.senderId === userId) {
    return { ok: true, message };
  }

  if (message.read) {
    return { ok: true, message };
  }

  message.read = true;
  message.readAt = new Date().toISOString();
  await atomicWrite(msgPath, message);

  return { ok: true, message };
}

/**
 * Mark all unread messages for a user in a specific job as read
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, count: number }>}
 */
export async function markAllAsRead(jobId, userId) {
  const { items } = await listByJob(jobId, userId, { limit: 10000, offset: 0 });

  let count = 0;
  const now = new Date().toISOString();

  for (const msg of items) {
    // Only mark messages where the user is the recipient (not sender)
    if (msg.senderId === userId) continue;
    if (msg.read) continue;

    msg.read = true;
    msg.readAt = now;
    await atomicWrite(getRecordPath('messages', msg.id), msg);
    count++;
  }

  return { ok: true, count };
}

/**
 * Count total unread messages across all jobs for a user
 * Used for notification badge
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countUnread(userId) {
  // Get all message IDs from user index
  const indexedIds = await getFromSetIndex(MESSAGE_USER_INDEX, userId);

  if (indexedIds.length > 0) {
    let count = 0;
    for (const msgId of indexedIds) {
      const msg = await readJSON(getRecordPath('messages', msgId));
      if (msg && !msg.read && msg.senderId !== userId) count++;
    }
    return count;
  }

  // Fallback: full scan
  const msgsDir = getCollectionPath('messages');
  const all = await listJSON(msgsDir);
  return all.filter(m =>
    (m.recipientId === userId || (m.recipientId === null && m.senderId !== userId)) &&
    !m.read
  ).length;
}

/**
 * Count messages sent by a user on a specific job today (Egypt midnight reset)
 *
 * @param {string} userId
 * @param {string} jobId
 * @returns {Promise<number>}
 */
export async function countTodayByUserJob(userId, jobId) {
  // Get messages for this job
  const indexedIds = await getFromSetIndex(MESSAGE_JOB_INDEX, jobId);

  let jobMessages;
  if (indexedIds.length > 0) {
    const results = [];
    for (const msgId of indexedIds) {
      const msg = await readJSON(getRecordPath('messages', msgId));
      if (msg) results.push(msg);
    }
    jobMessages = results;
  } else {
    const msgsDir = getCollectionPath('messages');
    const all = await listJSON(msgsDir);
    jobMessages = all.filter(m => m.jobId === jobId);
  }

  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();

  return jobMessages.filter(m =>
    m.senderId === userId &&
    new Date(m.createdAt) >= todayMidnight
  ).length;
}
