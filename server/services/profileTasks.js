// ═══════════════════════════════════════════════════════════════
// server/services/profileTasks.js — Actionable Profile Completion Tasks (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Converts profile completeness gaps into actionable tasks.
// Protected/user-specific only — no PII leakage.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { sanitizeActionUrl } from './notificationActions.js';
import { calculateCompleteness } from './profileCompleteness.js';
import { logger } from './logger.js';

function isEnabled() {
  return !!(config.PROFILE_TASKS && config.PROFILE_TASKS.enabled);
}

export function taskUrl(taskId) {
  const urls = {
    accept_terms: '/terms.html?accept=1',
    add_name: '/profile.html#editProfileSection',
    select_governorate: '/profile.html#editProfileSection',
    select_categories: '/profile.html#editCategoriesGroup',
    add_location: '/profile.html#editProfileSection',
    verify_identity: '/profile.html#verification-section',
    enable_notifications: '/profile.html#notification-prefs',
    create_availability_ad: '/profile.html#adFormMount',
    create_availability_window: '/profile.html#availability-windows-section',
  };

  return sanitizeActionUrl(urls[taskId] || '/profile.html');
}

export function taskPriority(taskId) {
  const priorities = {
    accept_terms: 'critical',
    add_name: 'high',
    select_governorate: 'high',
    select_categories: 'high',
    add_location: 'medium',
    verify_identity: 'medium',
    enable_notifications: 'low',
    create_availability_ad: 'low',
    create_availability_window: 'low',
  };

  return priorities[taskId] || 'low';
}

function makeTask(id, label, description, completed = false) {
  return {
    id,
    label,
    description,
    url: taskUrl(id),
    priority: taskPriority(id),
    completed: !!completed,
  };
}

function sortTasks(tasks) {
  const order = {};
  const configured = config.PROFILE_TASKS?.priorities || ['critical', 'high', 'medium', 'low'];
  configured.forEach((p, i) => { order[p] = i; });

  return tasks.slice().sort((a, b) => {
    const pa = order[a.priority] ?? 99;
    const pb = order[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}

export function buildTasksFromUser(user, completeness) {
  if (!user) return [];

  const tasks = [];
  const missing = new Set((completeness && completeness.missing) || []);

  if (!user.termsAcceptedAt || missing.has('terms')) {
    tasks.push(makeTask(
      'accept_terms',
      'اقبل شروط الاستخدام',
      'مطلوب لتفعيل الحساب بالكامل واستخدام كل مزايا المنصة'
    ));
  }

  if (missing.has('name')) {
    tasks.push(makeTask(
      'add_name',
      'أضف اسمك',
      'الاسم يساعد الطرف الآخر يعرفك بثقة داخل المنصة'
    ));
  }

  if (missing.has('governorate')) {
    tasks.push(makeTask(
      'select_governorate',
      'اختار المحافظة',
      'المحافظة تساعدنا نعرضلك فرص أو عمال أقرب لك'
    ));
  }

  if (user.role === 'worker' && missing.has('categories')) {
    tasks.push(makeTask(
      'select_categories',
      'اختار تخصصاتك',
      'اختار التخصصات اللي تقدر تشتغل فيها عشان توصلك فرص مناسبة'
    ));
  }

  if (missing.has('location')) {
    tasks.push(makeTask(
      'add_location',
      'حدّد موقعك الجغرافي',
      'الموقع يساعد في الفرص القريبة والمطابقة الفورية'
    ));
  }

  if (missing.has('verification')) {
    const status = user.verificationStatus || 'unverified';
    if (status !== 'pending') {
      tasks.push(makeTask(
        'verify_identity',
        'فعّل التحقق من الهوية',
        'الحسابات المحققة تظهر بثقة أعلى للطرف الآخر'
      ));
    }
  }

  const prefs = user.notificationPreferences;
  if (!prefs || prefs.whatsapp === undefined || prefs.sms === undefined) {
    tasks.push(makeTask(
      'enable_notifications',
      'راجع إعدادات الإشعارات',
      'فعّل القنوات المناسبة عشان توصلك التحديثات المهمة بسرعة'
    ));
  }

  return sortTasks(tasks);
}

/**
 * Add optional worker activation tasks that are not part of the base score.
 */
async function addWorkerActivationTasks(user, tasks) {
  if (!user || user.role !== 'worker') return tasks;

  const existingIds = new Set(tasks.map(t => t.id));
  const next = tasks.slice();

  // Availability ad task — only if worker has no active ad.
  if (!existingIds.has('create_availability_ad') && config.AVAILABILITY_ADS?.enabled) {
    try {
      const { findActiveByWorker } = await import('./availabilityAd.js');
      const activeAd = await findActiveByWorker(user.id);
      if (!activeAd) {
        next.push(makeTask(
          'create_availability_ad',
          'انشر إعلان إتاحة',
          'قول لأصحاب العمل إنك متاح للشغل الآن واستقبل عروض مباشرة'
        ));
      }
    } catch (err) {
      logger.warn('profileTasks: availability ad check failed', { userId: user.id, error: err.message });
    }
  }

  // Availability window task — only if no windows exist.
  if (!existingIds.has('create_availability_window') && config.AVAILABILITY_WINDOWS?.enabled) {
    try {
      const { listByUser } = await import('./availabilityWindow.js');
      const windows = await listByUser(user.id);
      if (!windows || windows.length === 0) {
        next.push(makeTask(
          'create_availability_window',
          'حدّد أوقات إتاحتك',
          'ساعد المنصة تعرف إمتى تكون جاهز للشغل'
        ));
      }
    } catch (err) {
      logger.warn('profileTasks: availability windows check failed', { userId: user.id, error: err.message });
    }
  }

  return sortTasks(next);
}

export async function getProfileTasks(userId) {
  if (!isEnabled()) {
    return { enabled: false, completionScore: 0, tasks: [] };
  }

  if (!userId || typeof userId !== 'string') {
    return { enabled: true, completionScore: 0, tasks: [] };
  }

  const { findById } = await import('./users.js');
  const user = await findById(userId);

  if (!user || user.status !== 'active') {
    return { enabled: true, completionScore: 0, tasks: [] };
  }

  const completeness = calculateCompleteness(user);
  let tasks = buildTasksFromUser(user, completeness);
  tasks = await addWorkerActivationTasks(user, tasks);

  return {
    enabled: true,
    completionScore: completeness.score,
    missing: completeness.missing || [],
    tasks,
  };
}

export const _testHelpers = {
  isEnabled,
  makeTask,
  sortTasks,
  addWorkerActivationTasks,
};
