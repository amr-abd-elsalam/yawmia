// ═══════════════════════════════════════════════════════════════
// server/services/notifications.js — In-App Notification System
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath } from './database.js';
import { eventBus } from './eventBus.js';

/**
 * Create a notification
 */
export async function createNotification(userId, type, message, meta = {}) {
  const id = 'ntf_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const notification = {
    id,
    userId,
    type,
    message,
    meta,
    read: false,
    createdAt: now,
    readAt: null,
  };

  const ntfPath = getRecordPath('notifications', id);
  await atomicWrite(ntfPath, notification);

  eventBus.emit('notification:created', { notificationId: id, userId, type });

  return notification;
}

/**
 * List notifications for a user (paginated, newest first)
 */
export async function listByUser(userId, { limit = 20, offset = 0 } = {}) {
  const ntfDir = getCollectionPath('notifications');
  const allNotifications = await listJSON(ntfDir);

  // Filter by user
  const userNotifications = allNotifications
    .filter(n => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = userNotifications.length;
  const items = userNotifications.slice(offset, offset + limit);
  const unread = userNotifications.filter(n => !n.read).length;

  return { items, total, unread, limit, offset };
}

/**
 * Count unread notifications for a user
 */
export async function countUnread(userId) {
  const ntfDir = getCollectionPath('notifications');
  const allNotifications = await listJSON(ntfDir);
  return allNotifications.filter(n => n.userId === userId && !n.read).length;
}

/**
 * Mark a notification as read (with ownership check)
 */
export async function markAsRead(notificationId, userId) {
  const ntfPath = getRecordPath('notifications', notificationId);
  const notification = await readJSON(ntfPath);

  if (!notification) {
    return { ok: false, error: 'الإشعار غير موجود', code: 'NOTIFICATION_NOT_FOUND' };
  }

  if (notification.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تعدّل هذا الإشعار', code: 'NOT_NOTIFICATION_OWNER' };
  }

  if (notification.read) {
    return { ok: true, notification };
  }

  notification.read = true;
  notification.readAt = new Date().toISOString();
  await atomicWrite(ntfPath, notification);

  return { ok: true, notification };
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId) {
  const ntfDir = getCollectionPath('notifications');
  const allNotifications = await listJSON(ntfDir);

  let count = 0;
  const now = new Date().toISOString();

  for (const notification of allNotifications) {
    if (notification.userId === userId && !notification.read) {
      notification.read = true;
      notification.readAt = now;
      const ntfPath = getRecordPath('notifications', notification.id);
      await atomicWrite(ntfPath, notification);
      count++;
    }
  }

  return { ok: true, count };
}

/**
 * Setup EventBus listeners for automatic notification creation
 */
export function setupNotificationListeners() {
  if (!config.NOTIFICATIONS.enabled) return;

  // Worker gets notification when their application is accepted
  if (config.NOTIFICATIONS.workerNotifications.applicationAccepted) {
    eventBus.on('application:accepted', (data) => {
      createNotification(
        data.workerId,
        'application_accepted',
        `تم قبولك في الفرصة: ${data.jobTitle}`,
        { jobId: data.jobId, applicationId: data.applicationId }
      ).catch(() => {});
    });
  }

  // Worker gets notification when their application is rejected
  if (config.NOTIFICATIONS.workerNotifications.applicationRejected) {
    eventBus.on('application:rejected', (data) => {
      createNotification(
        data.workerId,
        'application_rejected',
        `للأسف لم يتم قبولك في الفرصة: ${data.jobTitle}`,
        { jobId: data.jobId, applicationId: data.applicationId }
      ).catch(() => {});
    });
  }

  // Employer gets notification when a worker applies to their job
  if (config.NOTIFICATIONS.employerNotifications.newApplication) {
    eventBus.on('application:submitted', (data) => {
      if (data.employerId) {
        createNotification(
          data.employerId,
          'new_application',
          'عامل جديد تقدّم على فرصتك',
          { jobId: data.jobId, applicationId: data.applicationId }
        ).catch(() => {});
      }
    });
  }

  // Employer gets notification when their job is filled
  if (config.NOTIFICATIONS.employerNotifications.jobFilled) {
    eventBus.on('job:filled', (data) => {
      createNotification(
        data.employerId,
        'job_filled',
        `الفرصة اكتملت العدد المطلوب: ${data.jobTitle}`,
        { jobId: data.jobId }
      ).catch(() => {});
    });
  }
}
