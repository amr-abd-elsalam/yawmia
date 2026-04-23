// ═══════════════════════════════════════════════════════════════
// config.js — يوميّة: ملف الإعدادات الرئيسي
// ═══════════════════════════════════════════════════════════════

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

const config = {

  // ═══════════════════════════════════════════════════════════
  // 1. هوية العلامة التجارية (BRAND)
  // ═══════════════════════════════════════════════════════════
  BRAND: {
    name: "يوميّة",
    nameEn: "Yawmia",
    tagline: "شغلك قريب منّك",
    logo: "./assets/img/logo.png",
    primaryColor: "#2563eb",
    domain: "yawmia.com",
  },

  // ═══════════════════════════════════════════════════════════
  // 2. بيانات الصفحة (META)
  // ═══════════════════════════════════════════════════════════
  META: {
    title: "يوميّة — شغلك قريب منّك",
    description: "منصة توظيف العمالة اليومية في مصر. اعرض فرص شغل أو اشتغل بالقرب منك.",
    lang: "ar",
    dir: "rtl",
  },

  // ═══════════════════════════════════════════════════════════
  // 3. فئات العمالة (LABOR_CATEGORIES)
  // ═══════════════════════════════════════════════════════════
  LABOR_CATEGORIES: [
    { id: "farming",       label: "زراعة وحصاد",       icon: "🌾" },
    { id: "construction",  label: "بناء وتشييد",       icon: "🏗️" },
    { id: "cleaning",      label: "نظافة وتنظيف",      icon: "🧹" },
    { id: "loading",       label: "شحن وتحميل",       icon: "📦" },
    { id: "painting",      label: "دهانات ونقاشة",     icon: "🎨" },
    { id: "plumbing",      label: "سباكة",            icon: "🔧" },
    { id: "electrical",    label: "كهرباء",           icon: "⚡" },
    { id: "carpentry",     label: "نجارة",            icon: "🪚" },
    { id: "driving",       label: "قيادة ونقل",       icon: "🚛" },
    { id: "cooking",       label: "طبخ وتقديم",       icon: "🍳" },
    { id: "security",      label: "حراسة وأمن",       icon: "🛡️" },
    { id: "general",       label: "أعمال عامة",       icon: "👷" },
  ],

  // ═══════════════════════════════════════════════════════════
  // 4. المناطق الجغرافية (REGIONS)
  // ═══════════════════════════════════════════════════════════
  REGIONS: {
    enabled: true,
    // المحافظات الرئيسية — يتوسع لاحقاً
    governorates: [
      { id: "cairo",       label: "القاهرة" },
      { id: "giza",        label: "الجيزة" },
      { id: "alex",        label: "الإسكندرية" },
      { id: "qalyubia",    label: "القليوبية" },
      { id: "sharqia",     label: "الشرقية" },
      { id: "dakahlia",    label: "الدقهلية" },
      { id: "gharbia",     label: "الغربية" },
      { id: "monufia",     label: "المنوفية" },
      { id: "beheira",     label: "البحيرة" },
      { id: "fayoum",      label: "الفيوم" },
      { id: "minya",       label: "المنيا" },
      { id: "asyut",       label: "أسيوط" },
      { id: "sohag",       label: "سوهاج" },
      { id: "qena",        label: "قنا" },
      { id: "luxor",       label: "الأقصر" },
      { id: "aswan",       label: "أسوان" },
      { id: "ismailia",    label: "الإسماعيلية" },
      { id: "suez",        label: "السويس" },
      { id: "portsaid",    label: "بورسعيد" },
      { id: "damietta",    label: "دمياط" },
      { id: "kafr_elsheikh", label: "كفر الشيخ" },
      { id: "beni_suef",   label: "بني سويف" },
      { id: "new_valley",  label: "الوادي الجديد" },
      { id: "red_sea",     label: "البحر الأحمر" },
      { id: "north_sinai", label: "شمال سيناء" },
      { id: "south_sinai", label: "جنوب سيناء" },
      { id: "matrouh",     label: "مطروح" },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 5. النموذج المالي (FINANCIALS)
  // ═══════════════════════════════════════════════════════════
  FINANCIALS: {
    platformFeePercent: 15,        // نسبة المنصة من اليومية (%)
    minDailyWage: 150,             // أقل يومية مسموحة (جنيه)
    maxDailyWage: 1000,            // أعلى يومية مسموحة (جنيه)
    compensationEnabled: true,     // نظام التعويضات مفعّل
    compensationDailyRate: 0.75,   // نسبة اليومية المدفوعة كتعويض عن كل يوم إصابة (75%)
    maxCompensationDays: 30,       // أقصى أيام تعويض
    paymentMethods: ['cash', 'wallet', 'instapay'],
  },

  // ═══════════════════════════════════════════════════════════
  // 6. إعدادات المصادقة (AUTH)
  // ═══════════════════════════════════════════════════════════
  AUTH: {
    otpEnabled: true,              // التحقق عبر OTP على الموبايل
    otpLength: 4,                  // عدد أرقام الكود
    otpExpiryMs: 300000,           // مدة صلاحية الكود (5 دقائق)
    maxOtpAttempts: 3,             // أقصى محاولات خاطئة
    sessionTtlDays: 30,            // مدة الجلسة (يوم)
    roles: ['worker', 'employer', 'admin'],
  },

  // ═══════════════════════════════════════════════════════════
  // 7. إعدادات الإعلانات/فرص العمل (JOBS)
  // ═══════════════════════════════════════════════════════════
  JOBS: {
    maxWorkersPerJob: 100,         // أقصى عدد عمال مطلوبين في فرصة واحدة
    minWorkersPerJob: 1,
    maxDescriptionLength: 500,
    expiryHours: 72,               // الفرصة تنتهي بعد 72 ساعة لو مش مكتملة
    autoMatchByLocation: true,     // مطابقة تلقائية حسب الموقع الجغرافي
    maxDistanceKm: 30,             // أقصى مسافة للمطابقة التلقائية (كم)
  },

  // ═══════════════════════════════════════════════════════════
  // 8. إعدادات التقييم (RATINGS)
  // ═══════════════════════════════════════════════════════════
  RATINGS: {
    enabled: true,
    maxStars: 5,
    minRatingsToShow: 3,           // أقل عدد تقييمات لعرض المتوسط
    canWorkerRateEmployer: true,
    canEmployerRateWorker: true,
  },

  // ═══════════════════════════════════════════════════════════
  // 9. مسارات API (API)
  // ═══════════════════════════════════════════════════════════
  API: {
    // Auth
    sendOtp:          "/api/auth/send-otp",
    verifyOtp:        "/api/auth/verify-otp",
    profile:          "/api/auth/profile",

    // Jobs
    createJob:        "/api/jobs",
    listJobs:         "/api/jobs",
    jobDetail:        "/api/jobs/:id",
    applyJob:         "/api/jobs/:id/apply",
    acceptWorker:     "/api/jobs/:id/accept",

    // Workers
    workerProfile:    "/api/workers/:id",
    nearbyJobs:       "/api/workers/nearby",

    // Admin
    adminStats:       "/api/admin/stats",
    adminUsers:       "/api/admin/users",
    adminJobs:        "/api/admin/jobs",

    // Health
    health:           "/api/health",
    config:           "/api/config",
  },

  // ═══════════════════════════════════════════════════════════
  // 10. حدود الاستخدام (LIMITS)
  // ═══════════════════════════════════════════════════════════
  LIMITS: {
    maxJobsPerEmployerPerDay: 10,
    maxApplicationsPerWorkerPerDay: 20,
    rateLimitPerMinute: 60,
  },

  // ═══════════════════════════════════════════════════════════
  // 11. الجلسات (SESSIONS)
  // ═══════════════════════════════════════════════════════════
  SESSIONS: {
    enabled: true,
    ttlDays: 30,
    maxSessions: 50000,
  },

  // ═══════════════════════════════════════════════════════════
  // 12. التسجيل والمراقبة (LOGGING)
  // ═══════════════════════════════════════════════════════════
  LOGGING: {
    level: 'info',
    operationalLog: true,
    maxEntries: 500,
    fileEnabled: false,                      // true in production via env override
    filePath: './logs',
    retentionDays: 30,
  },

  // ═══════════════════════════════════════════════════════════
  // 13. لوحة التحكم (ADMIN)
  // ═══════════════════════════════════════════════════════════
  ADMIN: {
    refreshIntervalMs: 60000,
    showFinancials: true,
    showHealth: true,
  },

  // ═══════════════════════════════════════════════════════════
  // 14. إعدادات الإشعارات (NOTIFICATIONS)
  // ═══════════════════════════════════════════════════════════
  NOTIFICATIONS: {
    enabled: true,
    channels: ['sms', 'push', 'in_app'],
    // إشعارات للعامل
    workerNotifications: {
      newJobNearby: true,           // فرصة شغل جديدة قريبة منك
      applicationAccepted: true,    // تم قبولك في الفرصة
      applicationRejected: true,    // لم يتم قبولك
      paymentReceived: true,        // تم استلام المبلغ
      ratingReceived: true,         // تم تقييمك
      ratePrompt: true,             // قيّم تجربتك
    },
    // إشعارات لصاحب العمل
    employerNotifications: {
      newApplication: true,         // عامل جديد تقدّم
      jobFilled: true,              // الفرصة اكتملت
      workerNoShow: true,           // العامل لم يحضر
      ratingReceived: true,         // تم تقييمك
      ratePrompt: true,             // قيّم تجربتك
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 15. قاعدة البيانات (DATABASE)
  // ═══════════════════════════════════════════════════════════
  DATABASE: {
    basePath: './data',
    dirs: {
      users: 'users',
      sessions: 'sessions',
      jobs: 'jobs',
      applications: 'applications',
      otp: 'otp',
      notifications: 'notifications',
      ratings: 'ratings',
      payments: 'payments',
      reports: 'reports',
      verifications: 'verifications',
      attendance: 'attendance',
      audit: 'audit',
      messages: 'messages',
      push_subscriptions: 'push_subscriptions',
      alerts: 'alerts',
      metrics: 'metrics',
    },
    indexFiles: {
      phoneIndex: 'users/phone-index.json',
      jobsIndex: 'jobs/index.json',
      workerAppsIndex: 'applications/worker-index.json',
      jobAppsIndex: 'applications/job-index.json',
      userNotificationsIndex: 'notifications/user-index.json',
      employerJobsIndex: 'jobs/employer-index.json',
      jobPaymentsIndex: 'payments/job-index.json',
      targetReportsIndex: 'reports/target-index.json',
      reporterReportsIndex: 'reports/reporter-index.json',
      userVerificationIndex: 'verifications/user-index.json',
      jobAttendanceIndex: 'attendance/job-index.json',
      workerAttendanceIndex: 'attendance/worker-index.json',
      messageJobIndex: 'messages/job-index.json',
      messageUserIndex: 'messages/user-index.json',
      pushUserIndex: 'push_subscriptions/user-index.json',
      userAlertsIndex: 'alerts/user-index.json',
    },
    encoding: 'utf-8',
  },

  // ═══════════════════════════════════════════════════════════
  // 16. قواعد التحقق (VALIDATION)
  // ═══════════════════════════════════════════════════════════
  VALIDATION: {
    phoneRegex: '^01[0125]\\d{8}$',      // Egyptian mobile format
    nameMinLength: 2,
    nameMaxLength: 50,
    descriptionMaxLength: 500,
    titleMinLength: 5,
    titleMaxLength: 100,
    minDurationDays: 1,
    maxDurationDays: 30,
  },

  // ═══════════════════════════════════════════════════════════
  // 17. تحديد المعدل (RATE_LIMIT)
  // ═══════════════════════════════════════════════════════════
  RATE_LIMIT: {
    enabled: true,
    windowMs: 60000,                     // نافذة زمنية (1 دقيقة)
    maxRequests: 60,                     // أقصى طلبات في النافذة
    otpMaxRequests: 5,                   // أقصى طلبات OTP في النافذة
    otpWindowMs: 300000,                 // نافذة OTP (5 دقائق)
    message: 'تم تجاوز الحد المسموح من الطلبات. حاول بعد قليل.',
  },

  // ═══════════════════════════════════════════════════════════
  // 18. الملفات الثابتة (STATIC)
  // ═══════════════════════════════════════════════════════════
  STATIC: {
    root: './frontend',
    maxAge: 86400,                       // Cache-Control max-age (ثانية) — يوم واحد
    indexFile: 'index.html',
    mimeTypes: {
      '.html': 'text/html; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.svg':  'image/svg+xml',
      '.ico':  'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf':  'font/ttf',
      '.webp': 'image/webp',
      '.xml':  'application/xml; charset=utf-8',
      '.txt':  'text/plain; charset=utf-8',
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 19. الأمان (SECURITY)
  // ═══════════════════════════════════════════════════════════
  SECURITY: {
    allowedOrigins: ['*'],             // في production غيّرها: ['https://yawmia.com']
    sanitizeInput: true,               // تنظيف المدخلات من HTML tags
    headers: {
      xContentTypeOptions: 'nosniff',
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 20. خدمة المراسلة المتعددة القنوات (MESSAGING)
  // ═══════════════════════════════════════════════════════════
  MESSAGING: {
    enabled: false,                    // false = mock mode (console.log only)
    preferredChannel: 'whatsapp',      // 'whatsapp' | 'sms' | 'mock'
    fallbackChannel: 'sms',           // fallback if preferred fails; null = no fallback
    whatsapp: {
      enabled: false,                  // enable WhatsApp Cloud API
      apiVersion: 'v22.0',            // Meta Graph API version
      templateName: 'yawmia_otp',     // pre-approved authentication template name
      templateLanguage: 'ar',          // template language code
      codeTtlSeconds: 300,             // message TTL (set at template creation)
    },
    sms: {
      enabled: false,                  // enable SMS (Infobip)
      gateway: 'infobip',             // 'infobip'
      senderId: 'Yawmia',            // SMS sender ID
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 21. التنظيف الدوري (CLEANUP)
  // ═══════════════════════════════════════════════════════════
  CLEANUP: {
    notificationTtlDays: 90,         // حذف الإشعارات المقروءة بعد 90 يوم
    maxNotificationsPerUser: 500,    // أقصى عدد إشعارات لكل مستخدم (مرجع مستقبلي)
    otpCleanupEnabled: true,         // تنظيف OTP files المنتهية
  },

  // ═══════════════════════════════════════════════════════════
  // 22. المدفوعات (PAYMENTS)
  // ═══════════════════════════════════════════════════════════
  PAYMENTS: {
    enabled: true,
    autoCreateOnComplete: true,      // إنشاء سجل دفع تلقائي عند إنهاء الفرصة
    methods: ['cash', 'wallet', 'instapay'],
    defaultMethod: 'cash',
    statuses: ['pending', 'employer_confirmed', 'completed', 'disputed'],
    confirmationRequired: true,      // صاحب العمل لازم يأكد الدفع
    adminApprovalRequired: true,     // الأدمن لازم يوافق على الإنهاء
    disputeWindowDays: 7,            // مهلة فتح نزاع بعد الإنهاء (أيام)
  },

  // ═══════════════════════════════════════════════════════════
  // 23. الموقع الجغرافي (GEOLOCATION)
  // ═══════════════════════════════════════════════════════════
  GEOLOCATION: {
    enabled: true,
    defaultRadiusKm: 30,             // نطاق البحث الافتراضي (كم)
    maxRadiusKm: 100,                // أقصى نطاق بحث مسموح (كم)
    earthRadiusKm: 6371,             // نصف قطر الأرض (للحساب)
    // مراكز المحافظات — تُستخدم كـ fallback لو المستخدم/الفرصة مفيش lat/lng
    governorateCenters: {
      cairo:         { lat: 30.0444, lng: 31.2357 },
      giza:          { lat: 30.0131, lng: 31.2089 },
      alex:          { lat: 31.2001, lng: 29.9187 },
      qalyubia:      { lat: 30.3292, lng: 31.2422 },
      sharqia:       { lat: 30.5877, lng: 31.5020 },
      dakahlia:      { lat: 31.0364, lng: 31.3807 },
      gharbia:       { lat: 30.8754, lng: 31.0297 },
      monufia:       { lat: 30.5972, lng: 30.9876 },
      beheira:       { lat: 30.8481, lng: 30.3436 },
      fayoum:        { lat: 29.3084, lng: 30.8428 },
      minya:         { lat: 28.1099, lng: 30.7503 },
      asyut:         { lat: 27.1783, lng: 31.1859 },
      sohag:         { lat: 26.5591, lng: 31.6948 },
      qena:          { lat: 26.1551, lng: 32.7160 },
      luxor:         { lat: 25.6872, lng: 32.6396 },
      aswan:         { lat: 24.0889, lng: 32.8998 },
      ismailia:      { lat: 30.5965, lng: 32.2715 },
      suez:          { lat: 29.9668, lng: 32.5498 },
      portsaid:      { lat: 31.2565, lng: 32.2841 },
      damietta:      { lat: 31.4175, lng: 31.8144 },
      kafr_elsheikh: { lat: 31.1117, lng: 30.9388 },
      beni_suef:     { lat: 29.0661, lng: 31.0994 },
      new_valley:    { lat: 25.4390, lng: 30.0423 },
      red_sea:       { lat: 27.1783, lng: 33.7998 },
      north_sinai:   { lat: 31.0603, lng: 33.8357 },
      south_sinai:   { lat: 28.4973, lng: 33.9558 },
      matrouh:       { lat: 31.3525, lng: 27.2453 },
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 24. تطبيق الويب التدريجي (PWA)
  // ═══════════════════════════════════════════════════════════
  PWA: {
    enabled: true,
    cacheName: 'yawmia-v0.29.0',
    swPath: '/sw.js',
    manifestPath: '/manifest.json',
    themeColor: '#2563eb',
    backgroundColor: '#0f172a',
  },

  // ═══════════════════════════════════════════════════════════
  // 25. نظام البلاغات (REPORTS)
  // ═══════════════════════════════════════════════════════════
  REPORTS: {
    enabled: true,
    maxReportsPerUserPerDay: 5,
    minReasonLength: 10,
    maxReasonLength: 500,
    statuses: ['pending', 'reviewed', 'action_taken', 'dismissed'],
    types: ['fraud', 'no_show', 'harassment', 'quality', 'payment_issue', 'other'],
    autobanThreshold: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // 26. نظام الثقة (TRUST)
  // ═══════════════════════════════════════════════════════════
  TRUST: {
    enabled: true,
    weights: {
      ratingAvg: 0.3,
      completionRate: 0.2,
      attendanceRate: 0.2,
      reportScore: 0.2,
      accountAge: 0.1,
    },
    minScoreToShow: 0.3,
    accountAgeCap: 365,
    termsRequired: true,
    termsVersion: '1.0',
    softDeleteRetentionDays: 90,
  },

  // ═══════════════════════════════════════════════════════════
  // 27. إشعارات عبر المراسلة (NOTIFICATION_MESSAGING)
  // ═══════════════════════════════════════════════════════════
  NOTIFICATION_MESSAGING: {
    enabled: false,                    // false = in_app only (no external messages)
    criticalEvents: {
      application_accepted: true,      // العامل يوصلله رسالة لما يتقبل
      application_rejected: false,     // الرفض — in_app فقط افتراضياً
      job_filled: true,                // صاحب العمل — الفرصة اكتملت
      payment_created: true,           // صاحب العمل — سجل دفع جديد
      report_action: false,            // إجراء على بلاغ — in_app فقط
      job_cancelled: true,             // العامل — الفرصة اتلغت
    },
    cooldownMs: 60000,                 // دقيقة واحدة بين رسالتين لنفس اليوزر
    maxDailyMessagesPerUser: 20,       // أقصى عدد رسائل إشعار يومي لمستخدم واحد
    whatsappTemplates: {
      application_accepted: 'yawmia_accepted',
      job_filled: 'yawmia_job_filled',
      payment_created: 'yawmia_payment',
      job_cancelled: 'yawmia_job_cancelled',
    },
    defaultPreferences: {
      inApp: true,                     // دايماً مفعّل — مش قابل للتعطيل
      whatsapp: true,                  // WhatsApp مفعّل افتراضياً
      sms: false,                      // SMS مش مفعّل افتراضياً (غالي)
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 28. التحقق من الهوية (VERIFICATION)
  // ═══════════════════════════════════════════════════════════
  VERIFICATION: {
    enabled: true,
    maxImageSizeBytes: 2 * 1024 * 1024,    // 2MB max per image (base64)
    allowedStatuses: ['unverified', 'pending', 'verified', 'rejected'],
    requiredForApplication: false,           // لو true: العامل لازم يكون verified عشان يتقدم
    requiredForJobCreation: false,           // لو true: صاحب العمل لازم يكون verified عشان ينشر
    adminAutoApproveThreshold: null,         // null = manual review always
    rejectionCooldownHours: 48,             // بعد رفض، لازم يستنى 48 ساعة قبل إعادة التقديم
    maxSubmissionsPerDay: 3,                // أقصى عدد طلبات تحقق في اليوم
  },

  // ═══════════════════════════════════════════════════════════
  // 29. الأحداث المُرسَلة من السيرفر (SSE)
  // ═══════════════════════════════════════════════════════════
  SSE: {
    enabled: true,
    heartbeatIntervalMs: 30000,            // 30 ثانية بين كل heartbeat
    maxConnectionsPerUser: 3,              // أقصى 3 اتصالات لكل مستخدم (tabs/devices)
    reconnectMs: 5000,                     // اقتراح retry للـ EventSource (5 ثوانٍ)
    cleanupIntervalMs: 60000,              // تنظيف الاتصالات الميتة كل 60 ثانية
  },

  // ═══════════════════════════════════════════════════════════
  // 30. تجديد الفرص (JOB_RENEWAL)
  // ═══════════════════════════════════════════════════════════
  JOB_RENEWAL: {
    enabled: true,
    allowedFromStatuses: ['expired', 'cancelled'],
    renewalExpiryHours: 72,                // مدة صلاحية الفرصة المُجدَّدة (72 ساعة)
    maxRenewalsPerJob: 3,                  // أقصى عدد تجديدات لكل فرصة
    resetApplications: false,              // false = الطلبات الموجودة تبقى كما هي
  },

  // ═══════════════════════════════════════════════════════════
  // 31. نظام الحضور (ATTENDANCE)
  // ═══════════════════════════════════════════════════════════
  ATTENDANCE: {
    enabled: true,
    checkInRadiusKm: 0.5,                   // 500 متر — أقصى مسافة لتسجيل الحضور
    allowEmployerOverride: true,             // صاحب العمل يقدر يأكد بدون GPS
    autoNoShowAfterHours: 2,                 // عدد ساعات قبل اعتبار العامل غائب (مرجع مستقبلي)
    statuses: ['pending', 'checked_in', 'checked_out', 'confirmed', 'no_show'],
    requireGpsForCheckIn: true,              // GPS مطلوب لتسجيل الحضور
    requireGpsForCheckOut: false,            // GPS اختياري لتسجيل الانصراف
    maxCheckInDistanceOverrideKm: 2,         // أقصى مسافة حتى مع override (شبكة أمان)
  },

  // ═══════════════════════════════════════════════════════════
  // 32. بيئة التشغيل (ENV)
  // ═══════════════════════════════════════════════════════════
  ENV: {
    current: process.env.NODE_ENV || 'development',
    isProduction: (process.env.NODE_ENV || 'development') === 'production',
    isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
    isStaging: (process.env.NODE_ENV || 'development') === 'staging',
  },

  // ═══════════════════════════════════════════════════════════
  // 33. سجل العمليات الإدارية (AUDIT)
  // ═══════════════════════════════════════════════════════════
  AUDIT: {
    enabled: true,
    maxEntriesPerPage: 50,
    retentionDays: 365,                      // مدة الاحتفاظ بالسجلات (يوم)
  },

  // ═══════════════════════════════════════════════════════════
  // 34. التخزين المؤقت (CACHE)
  // ═══════════════════════════════════════════════════════════
  CACHE: {
    enabled: true,
    defaultTtlMs: 60000,                     // 1 minute default TTL
    maxEntries: 10000,                       // max cached items (soft limit)
    cleanupIntervalMs: 300000,               // cleanup expired entries every 5 min
    ttl: {
      phoneIndex: 300000,                    // 5 minutes — most read, least written
      user: 120000,                          // 2 minutes
      job: 60000,                            // 1 minute
      session: 60000,                        // 1 minute
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 35. الرسائل الداخلية (MESSAGES)
  // ═══════════════════════════════════════════════════════════
  MESSAGES: {
    enabled: true,
    maxLengthChars: 500,                     // أقصى طول رسالة (حرف)
    maxMessagesPerJobPerDay: 50,             // أقصى رسائل لكل مستخدم في كل فرصة/يوم
    allowBroadcast: true,                    // صاحب العمل يقدر يبعت لكل العمال المقبولين
    allowWorkerInitiate: true,               // العامل يقدر يبدأ محادثة
    onlyAfterAcceptance: true,               // الرسائل بس بعد القبول
  },

  // ═══════════════════════════════════════════════════════════
  // 36. إشعارات الويب (WEB_PUSH)
  // ═══════════════════════════════════════════════════════════
  WEB_PUSH: {
    enabled: true,
    maxSubscriptionsPerUser: 5,              // أقصى 5 أجهزة لكل مستخدم
    events: {
      application_accepted: true,            // العامل اتقبل
      job_filled: true,                      // الفرصة اكتملت
      new_message: true,                     // رسالة جديدة
      payment_created: true,                 // سجل دفع جديد
      job_cancelled: true,                   // الفرصة اتلغت
      attendance_noshow: true,               // تسجيل غياب
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 37. إتاحة العامل (WORKER_AVAILABILITY)
  // ═══════════════════════════════════════════════════════════
  WORKER_AVAILABILITY: {
    enabled: true,
    defaultAvailable: true,                  // المستخدمين الجدد متاحين افتراضياً
  },

  // ═══════════════════════════════════════════════════════════
  // 38. المطابقة الذكية للفرص (JOB_MATCHING)
  // ═══════════════════════════════════════════════════════════
  JOB_MATCHING: {
    enabled: true,
    maxNotificationsPerJob: 50,              // أقصى عدد إشعارات لكل فرصة جديدة
    matchByCategory: true,                   // مطابقة حسب التخصص (مطلوب)
    matchByProximity: true,                  // مطابقة حسب القرب الجغرافي
    proximityRadiusKm: 50,                   // نطاق المطابقة الجغرافية (كم)
  },

  // ═══════════════════════════════════════════════════════════
  // 39. ترحيل البيانات (MIGRATION)
  // ═══════════════════════════════════════════════════════════
  MIGRATION: {
    enabled: true,
    dataFile: 'migration.json',              // ملف تتبع إصدار الـ schema
    runOnStartup: true,                      // تشغيل الترحيل تلقائياً عند بدء السيرفر
  },

  // ═══════════════════════════════════════════════════════════
  // 40. فلترة المحتوى (CONTENT_FILTER)
  // ═══════════════════════════════════════════════════════════
  CONTENT_FILTER: {
    enabled: true,
    blockThreshold: 0.7,                     // حد المنع (0.0–1.0)
    warnThreshold: 0.4,                      // حد التحذير (تسجيل فقط)
    checkJobDescription: true,               // فحص وصف الفرص
    checkMessages: true,                     // فحص الرسائل
    checkReportReason: false,                // لا تفحص أسباب البلاغات (تحتاج وصف المخالفة)
    logFlagged: true,                        // تسجيل المحتوى المرفوض في اللوج
  },

  // ═══════════════════════════════════════════════════════════
  // 41. فهرس البحث (SEARCH_INDEX)
  // ═══════════════════════════════════════════════════════════
  SEARCH_INDEX: {
    enabled: true,
    rebuildIntervalMs: 3600000,              // إعادة بناء الفهرس كل ساعة (مللي ثانية)
  },

  // ═══════════════════════════════════════════════════════════
  // 42. تنبيهات الفرص (JOB_ALERTS)
  // ═══════════════════════════════════════════════════════════
  JOB_ALERTS: {
    enabled: true,
    maxAlertsPerUser: 5,                     // أقصى عدد تنبيهات لكل مستخدم
    cooldownMinutes: 60,                     // مدة الانتظار بين إشعارين لنفس التنبيه (دقيقة)
    matchOnCreation: true,                   // مطابقة التنبيهات عند إنشاء فرصة جديدة
  },

  // ═══════════════════════════════════════════════════════════
  // 43. ملخص النشاط الأسبوعي (ACTIVITY_SUMMARY)
  // ═══════════════════════════════════════════════════════════
  ACTIVITY_SUMMARY: {
    enabled: true,
    dayOfWeek: 0,                            // 0 = الأحد
    hourEgypt: 10,                           // 10:00 صباحاً بتوقيت مصر
    intervalCheckMs: 3600000,                // فحص كل ساعة إذا حان وقت الإرسال
  },

  // ═══════════════════════════════════════════════════════════
  // 44. المراقبة (MONITORING)
  // ═══════════════════════════════════════════════════════════
  MONITORING: {
    enabled: true,
    snapshotIntervalMs: 3600000,             // snapshot كل ساعة (مللي ثانية)
    retentionDays: 30,                       // حذف snapshots أقدم من 30 يوم
    thresholds: {
      heapUsedMB: { warning: 256, critical: 512 },
      errorRate: { warning: 5, critical: 15 },        // نسبة مئوية
      p95Ms: { warning: 1000, critical: 3000 },       // مللي ثانية
      cacheHitRate: { warning: 30, critical: 10 },     // نسبة مئوية (أقل = أسوأ)
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 45. التحليلات (ANALYTICS)
  // ═══════════════════════════════════════════════════════════
  ANALYTICS: {
    enabled: true,
    cacheTtlMs: 300000,                      // 5 دقائق cache للـ analytics
    maxExportRows: 10000,                    // أقصى عدد صفوف في CSV export
    receiptPrefix: 'RCT',                    // بادئة رقم الإيصال
  },

};

// ═══════════════════════════════════════════════════════════════
// Environment Overrides — applied BEFORE deepFreeze
// ═══════════════════════════════════════════════════════════════
const _ENV = process.env.NODE_ENV || 'development';
const envOverrides = {
  production: {
    SECURITY: {
      allowedOrigins: [process.env.ALLOWED_ORIGIN || 'https://yowmia.com'],
      sanitizeInput: true,
      headers: config.SECURITY.headers,
    },
    LOGGING: { level: 'warn', operationalLog: true, maxEntries: 500, fileEnabled: true, filePath: './logs', retentionDays: 30 },
    STATIC: {
      root: config.STATIC.root,
      maxAge: 604800,
      indexFile: config.STATIC.indexFile,
      mimeTypes: config.STATIC.mimeTypes,
    },
  },
  staging: {
    SECURITY: {
      allowedOrigins: [process.env.ALLOWED_ORIGIN || 'https://staging.yowmia.com'],
      sanitizeInput: true,
      headers: config.SECURITY.headers,
    },
  },
};

if (envOverrides[_ENV]) {
  for (const [key, overrides] of Object.entries(envOverrides[_ENV])) {
    if (config[key] && typeof config[key] === 'object' && typeof overrides === 'object') {
      config[key] = { ...config[key], ...overrides };
    }
  }
}

export default deepFreeze(config);
