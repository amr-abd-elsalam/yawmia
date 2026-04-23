// ═══════════════════════════════════════════════════════════════
// server/services/notifications.js — In-App Notification System
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, deleteJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex, readSetIndex, writeSetIndex } from './database.js';
import { eventBus } from './eventBus.js';

const USER_NTF_INDEX = config.DATABASE.indexFiles.userNotificationsIndex;

// ── Notification Deduplication (in-memory) ───────────────────
/** @type {Map<string, number>} dedupKey → timestamp */
const recentNotifications = new Map();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup stale dedup entries every 10 minutes
const dedupCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - (DEDUP_WINDOW_MS * 2);
  for (const [key, timestamp] of recentNotifications) {
    if (timestamp < cutoff) {
      recentNotifications.delete(key);
    }
  }
}, 10 * 60 * 1000);
if (dedupCleanupTimer.unref) dedupCleanupTimer.unref();

/**
 * Create a notification
 */
export async function createNotification(userId, type, message, meta = {}) {
  // Dedup check: skip if same userId+type within window
  const dedupKey = `${userId}:${type}`;
  const lastSent = recentNotifications.get(dedupKey);
  if (lastSent && (Date.now() - lastSent) < DEDUP_WINDOW_MS) {
    return null;
  }
  recentNotifications.set(dedupKey, Date.now());

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

  // Update secondary index
  await addToSetIndex(USER_NTF_INDEX, userId, id);

  eventBus.emit('notification:created', { notificationId: id, userId, type });

  // Push notification via SSE (fire-and-forget)
  try {
    const { sendToUser } = await import('./sseManager.js');
    sendToUser(userId, 'notification', notification, id);
  } catch (_) {
    // Fire-and-forget — don't break notification creation flow
  }

  // Enforce max notifications per user (fire-and-forget)
  enforceMaxNotifications(userId).catch(() => {});

  return notification;
}

/**
 * List notifications for a user (index-accelerated, paginated, newest first)
 */
export async function listByUser(userId, { limit = 20, offset = 0 } = {}) {
  let userNotifications;

  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf) results.push(ntf);
    }
    userNotifications = results;
  } else {
    // Fallback: full scan (backward compatibility for pre-index data)
    const ntfDir = getCollectionPath('notifications');
    const allNotifications = await listJSON(ntfDir);
    userNotifications = allNotifications.filter(n => n.userId === userId);
  }

  // Sort newest first
  userNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = userNotifications.length;
  const items = userNotifications.slice(offset, offset + limit);
  const unread = userNotifications.filter(n => !n.read).length;

  return { items, total, unread, limit, offset };
}

/**
 * Count unread notifications for a user (index-accelerated)
 */
export async function countUnread(userId) {
  // Try index-accelerated lookup first
  const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
  if (indexedIds.length > 0) {
    let count = 0;
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf && !ntf.read) count++;
    }
    return count;
  }

  // Fallback: full scan
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
 * Mark all notifications as read for a user (index-accelerated)
 */
export async function markAllAsRead(userId) {
  let userNotifications;

  // Try index-accelerated lookup first (same pattern as listByUser/countUnread)
  const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
  if (indexedIds.length > 0) {
    const results = [];
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf) results.push(ntf);
    }
    userNotifications = results;
  } else {
    // Fallback: full scan (backward compatibility for pre-index data)
    const ntfDir = getCollectionPath('notifications');
    const allNotifications = await listJSON(ntfDir);
    userNotifications = allNotifications.filter(n => n.userId === userId);
  }

  let count = 0;
  const now = new Date().toISOString();

  for (const notification of userNotifications) {
    if (!notification.read) {
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
 * Clean old notifications beyond TTL (startup + periodic)
 * Only deletes READ notifications — unread always survive regardless of age
 * Uses batch processing with event loop yielding to avoid blocking
 * @returns {Promise<number>} count of cleaned notifications
 */
export async function cleanOldNotifications() {
  const ttlDays = config.CLEANUP?.notificationTtlDays;
  if (!ttlDays || ttlDays <= 0) return 0;

  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
  const ntfDir = getCollectionPath('notifications');

  let files;
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(ntfDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp') && f.startsWith('ntf_'));
  let cleaned = 0;
  const affectedUsers = new Set();
  const cleanedIds = new Set();
  const BATCH_SIZE = 100;
  const { join: joinPath } = await import('node:path');

  for (let i = 0; i < jsonFiles.length; i++) {
    const ntf = await readJSON(joinPath(ntfDir, jsonFiles[i]));
    if (ntf && ntf.createdAt && new Date(ntf.createdAt) < cutoff && ntf.read) {
      const ntfPath = getRecordPath('notifications', ntf.id);
      await deleteJSON(ntfPath);
      if (ntf.userId) affectedUsers.add(ntf.userId);
      cleanedIds.add(ntf.id);
      cleaned++;
    }
    // Yield to event loop every BATCH_SIZE files
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  // Update user notification indexes — remove cleaned notification IDs (batch)
  if (cleaned > 0 && affectedUsers.size > 0) {
    const indexPath = config.DATABASE.indexFiles.userNotificationsIndex;
    const index = await readSetIndex(indexPath);

    for (const userId of affectedUsers) {
      if (index[userId]) {
        index[userId] = index[userId].filter(id => !cleanedIds.has(id));
        if (index[userId].length === 0) delete index[userId];
      }
    }
    await writeSetIndex(indexPath, index);
  }

  return cleaned;
}

/**
 * Enforce max notifications per user — delete oldest read notifications if exceeding limit.
 * Fire-and-forget safe — NEVER throws.
 * Only deletes READ notifications — unread are always protected.
 * @param {string} userId
 */
async function enforceMaxNotifications(userId) {
  try {
    const maxPerUser = config.CLEANUP?.maxNotificationsPerUser;
    if (!maxPerUser || maxPerUser <= 0) return;

    // Get all notification IDs for user from index
    const indexedIds = await getFromSetIndex(USER_NTF_INDEX, userId);
    if (indexedIds.length <= maxPerUser) return;

    // Load all notifications
    const notifications = [];
    for (const ntfId of indexedIds) {
      const ntf = await readJSON(getRecordPath('notifications', ntfId));
      if (ntf) notifications.push(ntf);
    }

    if (notifications.length <= maxPerUser) return;

    // Sort oldest first
    notifications.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Calculate excess
    const excess = notifications.length - maxPerUser;

    // Collect oldest READ notifications to delete
    const toDelete = [];
    for (const ntf of notifications) {
      if (toDelete.length >= excess) break;
      if (ntf.read) {
        toDelete.push(ntf.id);
      }
    }

    if (toDelete.length === 0) return;

    // Delete files
    for (const ntfId of toDelete) {
      await deleteJSON(getRecordPath('notifications', ntfId));
    }

    // Batch update index — single read + single write
    const deletedSet = new Set(toDelete);
    const indexPath = USER_NTF_INDEX;
    const index = await readSetIndex(indexPath);
    if (index[userId]) {
      index[userId] = index[userId].filter(id => !deletedSet.has(id));
      if (index[userId].length === 0) delete index[userId];
      await writeSetIndex(indexPath, index);
    }
  } catch (_) {
    // Fire-and-forget — NEVER throws
  }
}

/**
 * Setup EventBus listeners for automatic notification creation
 */
export function setupNotificationListeners() {
  if (!config.NOTIFICATIONS.enabled) return;

  // Worker gets notification when their application is accepted
  if (config.NOTIFICATIONS.workerNotifications.applicationAccepted) {
    eventBus.on('application:accepted', (data) => {
      const message = `تم قبولك في الفرصة: ${data.jobTitle}`;
      createNotification(
        data.workerId,
        'application_accepted',
        message,
        { jobId: data.jobId, applicationId: data.applicationId }
      ).catch(() => {});

      // Send WhatsApp/SMS for critical event (fire-and-forget)
      import('./notificationMessenger.js').then(({ sendNotificationMessage }) => {
        import('./users.js').then(({ findById: findUser }) => {
          findUser(data.workerId).then(user => {
            if (user && user.phone) {
              sendNotificationMessage({
                userId: data.workerId,
                phone: user.phone,
                eventType: 'application_accepted',
                message: `يوميّة: ${message}`,
                user,
              }).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});

      // Web Push (fire-and-forget)
      import('./webpush.js').then(({ sendPush }) => {
        sendPush(data.workerId, {
          title: 'يوميّة',
          body: message,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
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
      const message = `الفرصة اكتملت العدد المطلوب: ${data.jobTitle}`;
      createNotification(
        data.employerId,
        'job_filled',
        message,
        { jobId: data.jobId }
      ).catch(() => {});

      // Send WhatsApp/SMS for critical event (fire-and-forget)
      import('./notificationMessenger.js').then(({ sendNotificationMessage }) => {
        import('./users.js').then(({ findById: findUser }) => {
          findUser(data.employerId).then(user => {
            if (user && user.phone) {
              sendNotificationMessage({
                userId: data.employerId,
                phone: user.phone,
                eventType: 'job_filled',
                message: `يوميّة: ${message}`,
                user,
              }).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});

      // Web Push (fire-and-forget)
      import('./webpush.js').then(({ sendPush }) => {
        sendPush(data.employerId, {
          title: 'يوميّة',
          body: message,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    });
  }

  // Workers get notified when a job they applied to is cancelled
  eventBus.on('job:cancelled', async (data) => {
    try {
      // Dynamic imports to avoid circular dependencies
      const { listByJob } = await import('./applications.js');
      const { atomicWrite: write, getRecordPath: recPath } = await import('./database.js');

      const apps = await listByJob(data.jobId);
      const now = new Date().toISOString();
      const affectedWorkerIds = new Set();

      for (const app of apps) {
        // Track workers who were pending or accepted
        if (app.status === 'pending' || app.status === 'accepted') {
          affectedWorkerIds.add(app.workerId);
        }
        // Auto-reject pending applications
        if (app.status === 'pending') {
          app.status = 'rejected';
          app.respondedAt = now;
          const appPath = recPath('applications', app.id);
          await write(appPath, app);
        }
      }

      // Notify all affected workers
      const cancelMessage = `تم إلغاء الفرصة: ${data.jobTitle}`;
      for (const workerId of affectedWorkerIds) {
        await createNotification(
          workerId,
          'job_cancelled',
          cancelMessage,
          { jobId: data.jobId }
        );
      }

      // Send WhatsApp/SMS to affected workers (fire-and-forget)
      try {
        const { sendNotificationMessage } = await import('./notificationMessenger.js');
        const { findById: findUser } = await import('./users.js');
        for (const workerId of affectedWorkerIds) {
          const worker = await findUser(workerId);
          if (worker && worker.phone) {
            sendNotificationMessage({
              userId: workerId,
              phone: worker.phone,
              eventType: 'job_cancelled',
              message: `يوميّة: ${cancelMessage}`,
              user: worker,
            }).catch(() => {});
          }
        }
      } catch (_) {
        // Fire-and-forget
      }
    } catch (err) {
      // Fire-and-forget — errors don't break the cancel flow
    }
  });

  // User gets notification when they receive a rating
  eventBus.on('rating:submitted', (data) => {
    const starText = '⭐'.repeat(Math.min(data.stars, 5));
    createNotification(
      data.toUserId,
      'rating_received',
      `تم تقييمك ${starText} (${data.stars}/5) في الفرصة: ${data.jobTitle}`,
      { jobId: data.jobId, ratingId: data.ratingId, stars: data.stars }
    ).catch(() => {});
  });

  // Employer gets notification when payment record is created
  eventBus.on('payment:created', (data) => {
    const message = `تم إنشاء سجل دفع للفرصة — المبلغ: ${data.amount} جنيه (عمولة المنصة: ${data.platformFee} جنيه)`;
    createNotification(
      data.employerId,
      'payment_created',
      message,
      { jobId: data.jobId, paymentId: data.paymentId, amount: data.amount, platformFee: data.platformFee }
    ).catch(() => {});

    // Send WhatsApp/SMS for critical event (fire-and-forget)
    import('./notificationMessenger.js').then(({ sendNotificationMessage }) => {
      import('./users.js').then(({ findById: findUser }) => {
        findUser(data.employerId).then(user => {
          if (user && user.phone) {
            sendNotificationMessage({
              userId: data.employerId,
              phone: user.phone,
              eventType: 'payment_created',
              message: `يوميّة: ${message}`,
              user,
            }).catch(() => {});
          }
        }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});

    // Web Push (fire-and-forget)
    import('./webpush.js').then(({ sendPush }) => {
      sendPush(data.employerId, {
        title: 'يوميّة',
        body: message,
        icon: '/assets/img/icon-192.png',
        url: '/dashboard.html',
      }).catch(() => {});
    }).catch(() => {});
  });

  // Employer gets notification when payment is disputed
  eventBus.on('payment:disputed', (data) => {
    if (data.disputedBy !== data.employerId) {
      createNotification(
        data.employerId,
        'payment_disputed',
        'تم فتح نزاع على دفعة — برجاء مراجعة التفاصيل',
        { jobId: data.jobId, paymentId: data.paymentId }
      ).catch(() => {});
    }
  });

  // Target user gets notification when reported
  eventBus.on('report:created', (data) => {
    createNotification(
      data.targetId,
      'report_received',
      'تم تقديم بلاغ بخصوص حسابك — يُرجى الالتزام بسياسة المنصة',
      { reportId: data.reportId, type: data.type }
    ).catch(() => {});
  });

  // Reporter gets notification when their report is reviewed
  eventBus.on('report:reviewed', (data) => {
    const statusMessages = {
      reviewed: 'تمت مراجعة بلاغك',
      action_taken: 'تم اتخاذ إجراء بناءً على بلاغك',
      dismissed: 'تم رفض بلاغك — لم يتم العثور على مخالفة',
    };
    createNotification(
      data.reporterId,
      'report_reviewed',
      statusMessages[data.status] || 'تم تحديث حالة بلاغك',
      { reportId: data.reportId, status: data.status }
    ).catch(() => {});
  });

  // User gets notification when verification is reviewed
  eventBus.on('verification:reviewed', (data) => {
    const statusMessages = {
      verified: 'تم التحقق من هويتك بنجاح ✓',
      rejected: 'لم يتم قبول طلب التحقق — يُرجى إعادة المحاولة',
    };
    createNotification(
      data.userId,
      'verification_reviewed',
      statusMessages[data.status] || 'تم تحديث حالة طلب التحقق',
      { verificationId: data.verificationId, status: data.status }
    ).catch(() => {});
  });

  // Workers get notified when a job they applied to is renewed
  eventBus.on('job:renewed', async (data) => {
    try {
      const { listByJob } = await import('./applications.js');
      const apps = await listByJob(data.jobId);
      const renewMessage = `الفرصة "${data.jobTitle}" تم تجديدها وهي متاحة مرة تانية`;

      for (const app of apps) {
        if (app.status === 'pending' || app.status === 'accepted') {
          await createNotification(
            app.workerId,
            'job_renewed',
            renewMessage,
            { jobId: data.jobId }
          ).catch(() => {});
        }
      }
    } catch (_) {
      // Fire-and-forget
    }
  });

  // Disconnect banned user from SSE (on auto-ban from reports)
  eventBus.on('report:autoban', async (data) => {
    try {
      const { disconnectUser } = await import('./sseManager.js');
      disconnectUser(data.targetId);
    } catch (_) {
      // Fire-and-forget
    }
  });

  // ── Attendance Notifications ────────────────────────────────

  // Employer gets notification when worker checks in
  eventBus.on('attendance:checkin', (data) => {
    createNotification(
      data.employerId,
      'worker_checked_in',
      'عامل سجّل حضوره في موقع العمل',
      { jobId: data.jobId, workerId: data.workerId, attendanceId: data.attendanceId }
    ).catch(() => {});
  });

  // Worker gets notification when reported as no-show
  eventBus.on('attendance:noshow', (data) => {
    createNotification(
      data.workerId,
      'attendance_noshow',
      'تم تسجيلك غائب عن العمل — تواصل مع صاحب العمل لو في خطأ',
      { jobId: data.jobId, attendanceId: data.attendanceId }
    ).catch(() => {});
  });

  // Worker gets notification when employer confirms attendance
  eventBus.on('attendance:confirmed', (data) => {
    createNotification(
      data.workerId,
      'attendance_confirmed',
      'صاحب العمل أكّد حضورك ✓',
      { jobId: data.jobId, attendanceId: data.attendanceId }
    ).catch(() => {});
  });

  // ── Messaging Notifications ─────────────────────────────────

  // Recipient gets notification when they receive a direct message
  eventBus.on('message:created', (data) => {
    if (data.recipientId) {
      const msgText = `رسالة جديدة في الفرصة: ${data.jobTitle || 'فرصة عمل'}`;
      createNotification(
        data.recipientId,
        'new_message',
        msgText,
        { jobId: data.jobId, messageId: data.messageId, senderId: data.senderId }
      ).catch(() => {});

      // Web Push (fire-and-forget)
      import('./webpush.js').then(({ sendPush }) => {
        sendPush(data.recipientId, {
          title: 'يوميّة — رسالة جديدة',
          body: data.preview || msgText,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    }
  });

  // All accepted workers get notification on broadcast message
  eventBus.on('message:broadcast', (data) => {
    if (data.workerIds && data.workerIds.length > 0) {
      const msgText = `رسالة جديدة من صاحب العمل في الفرصة: ${data.jobTitle || 'فرصة عمل'}`;
      for (const workerId of data.workerIds) {
        createNotification(
          workerId,
          'new_message',
          msgText,
          { jobId: data.jobId, messageId: data.messageId, senderId: data.senderId }
        ).catch(() => {});
      }

      // Web Push to all workers (fire-and-forget)
      import('./webpush.js').then(({ sendPushToMany }) => {
        sendPushToMany(data.workerIds, {
          title: 'يوميّة — رسالة جديدة',
          body: data.preview || msgText,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    }
  });

  // ── Job Expiry Warning Notifications ────────────────────────

  // Employer + pending applicants get warned before job expires
  eventBus.on('job:expiry_warning', async (data) => {
    try {
      // Notify employer
      createNotification(
        data.employerId,
        'job_expiry_warning',
        `فرصتك "${data.jobTitle}" هتنتهي خلال 24 ساعة — جدّدها أو أكملها`,
        { jobId: data.jobId }
      ).catch(() => {});

      // Notify pending applicants
      if (data.pendingWorkerIds && data.pendingWorkerIds.length > 0) {
        for (const workerId of data.pendingWorkerIds) {
          createNotification(
            workerId,
            'job_expiry_warning',
            `الفرصة "${data.jobTitle}" هتنتهي قريب`,
            { jobId: data.jobId }
          ).catch(() => {});
        }
      }
    } catch (_) {
      // Fire-and-forget
    }
  });
}
