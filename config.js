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
    workerConfirmationRequired: true, // العامل لازم يأكد بعد القبول
    workerConfirmationTimeoutHours: 4, // مهلة تأكيد العامل (4 ساعات)
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
    maxAdsPerWorkerPerDay: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // 11. الجلسات (SESSIONS)
  // ═══════════════════════════════════════════════════════════
  SESSIONS: {
    enabled: true,
    ttlDays: 30,
    maxSessions: 50000,
    rotateOnAuth: true,                      // تدوير التوكن بعد التحقق
    trackMetadata: true,                     // تتبع IP و user-agent
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
      favorites: 'favorites',
      images: 'images',
      availability_windows: 'availability_windows',
      instant_matches: 'instant_matches',
      availability_ads: 'availability_ads',
      direct_offers: 'direct_offers',
      abuse_flag_reviews: 'abuse_flag_reviews',
      audit_indexes: 'audit/indexes',
      exports: 'exports',
      counter_archives: 'metrics/counter-archives',
      predictive_signals: 'predictive_signals',
      workrooms: 'workrooms',
      trust_snapshots: 'metrics/trust-v2-snapshots',
      ops_queue: 'ops_queue',
      ops_queue_idempotency: 'ops_queue/idempotency',
      ops_queue_dead_letter: 'ops_queue/dead-letter',
      alert_deliveries: 'alert_deliveries',
      queue_metrics: 'metrics/queue',
      workroom_receipts: 'workrooms/receipts',
      workroom_pins: 'workrooms/pins',
      workroom_checklists: 'workrooms/checklists',
      workroom_search_indexes: 'workrooms/search-indexes',
      workroom_template_metrics: 'metrics/workroom-template-usage',
      trust_calibration: 'metrics/trust-calibration',
      predictive_signal_archives: 'metrics/predictive-signal-archives',
      ops_locks: 'ops_locks',
      scheduler: 'scheduler',
      ops_rollups: 'metrics/ops-rollups',
      incidents: 'metrics/incidents',
      backup_restore_drills: 'metrics/backup-restore-drills',
      ops: 'ops',

      // Phase 58 — Governance, Privacy, RBAC, Operational Maturity
      privacy_requests: 'privacy_requests',
      ops_reviews: 'ops/reviews',
      postmortems: 'ops/postmortems',
      admin_approvals: 'ops/admin-approvals',

      // Phase 55 — File-Based Scale Hygiene
      queue_pending: 'ops_queue/pending',
      queue_running: 'ops_queue/running',
      queue_completed: 'ops_queue/completed',
      queue_failed: 'ops_queue/failed',
      queue_cancelled: 'ops_queue/cancelled',
      queue_archive: 'ops_queue/archive',
      scheduler_history: 'scheduler/history',
      workroom_hygiene: 'metrics/workroom-hygiene',
      trust_rollups: 'metrics/trust-calibration/rollups',
      predictive_archive_indexes: 'metrics/predictive-signal-archives/index',
      scale_hygiene: 'metrics/scale-hygiene',

      // Phase 56 — Marketplace Intelligence + Product UX Maturity
      search_analytics: 'metrics/search-analytics',
      product_intelligence: 'metrics/product-intelligence',
      matching_metrics: 'metrics/matching',
      payment_dispute_analytics: 'metrics/payment-disputes',

      // Phase 59 — File-Based Scale Limits + Externalization Readiness
      storage_pressure: 'metrics/storage-pressure',
      scale_thresholds: 'metrics/scale-thresholds',
      migration_snapshots: 'migration-snapshots',

      // Phase 60 — Evidence-Based Externalization Decision + Migration Rehearsal
      benchmark_history: 'metrics/benchmarks',
      migration_rehearsals: 'migration-snapshots/rehearsals',
      externalization_decisions: 'metrics/externalization-decisions',

      // Phase 61 — Evidence Cadence + Rollback Rehearsal + Pilot Gate
      phase61_evidence: 'metrics/phase61-evidence',
      rollback_rehearsals: 'migration-snapshots/rehearsals/rollback',
      pilot_decisions: 'metrics/pilot-decisions',
      repository_contract_reports: 'metrics/repository-contracts',
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
      userFavoritesIndex: 'favorites/user-index.json',
      workerAdsIndex: 'availability_ads/worker-index.json',
      employerOffersIndex: 'direct_offers/employer-index.json',
      workerOffersIndex: 'direct_offers/worker-index.json',
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
    perUserEnabled: true,                    // تحديد معدل لكل مستخدم
    perUserMaxRequests: 60,                  // أقصى طلبات لكل مستخدم في الدقيقة
    perUserWindowMs: 60000,                  // نافذة المستخدم (1 دقيقة)
    penaltyThreshold: 3,                     // عدد المخالفات قبل العقوبة
    penaltyWindowMs: 600000,                 // نافذة المخالفات (10 دقائق)
    penaltyCooldownMs: 300000,               // مدة العقوبة (5 دقائق)
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

  // ═══════════════════════════════════════════════════════════════
  // 24. تطبيق الويب التدريجي (PWA)
  // ═══════════════════════════════════════════════════════════════
  PWA: {
    enabled: true,
    cacheName: 'yawmia-v0.57.0',
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
    defaultStartHour: 8,                     // ساعة البدء الافتراضية (8 صباحاً) — تُستخدم لحساب الغياب التلقائي
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

  // ═══════════════════════════════════════════════════════════════
  // 44. المراقبة (MONITORING)
  // ═══════════════════════════════════════════════════════════════
  MONITORING: {
    enabled: true,
    snapshotIntervalMs: 3600000,             // snapshot كل ساعة (مللي ثانية)
    retentionDays: 30,                       // حذف snapshots أقدم من 30 يوم
    thresholds: {
      heapUsedMB: { warning: 256, critical: 512 },
      errorRate: { warning: 5, critical: 15 },        // نسبة مئوية
      p95Ms: { warning: 1000, critical: 3000 },       // مللي ثانية
      cacheHitRate: { warning: 30, critical: 10 },     // نسبة مئوية (أقل = أسوأ)
      directOfferAcceptRate: { warning: 30, critical: 10 },     // Phase 44 — نسبة مئوية (أقل = أسوأ)
      directOfferAvgResponseSec: { warning: 60, critical: 90 }, // Phase 44 — ثوانى (أعلى = أسوأ)
      counterFileSizeMB: { warning: 40, critical: 70 }, // Phase 46 — counter file size (MB)
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 45. التحليلات (ANALYTICS)
  // ═══════════════════════════════════════════════════════════════
  ANALYTICS: {
    enabled: true,
    cacheTtlMs: 300000,                      // 5 دقائق cache للـ analytics
    maxExportRows: 10000,                    // أقصى عدد صفوف في CSV export
    receiptPrefix: 'RCT',                    // بادئة رقم الإيصال
    cacheInvalidationEnabled: true,          // Phase 44 — clear analytics cache on direct_offer:* events
    cacheInvalidationEvents: [               // Phase 44 — events that trigger cache clearing
      'direct_offer:created',
      'direct_offer:accepted',
      'direct_offer:declined',
      'direct_offer:expired',
      'direct_offer:withdrawn',
    ],
    debounceMs: 10000,                       // Phase 45 — debounce window for cache invalidation
    minIntervalMs: 5000,                     // Phase 45 — minimum interval between clears per key
  },

  // ═══════════════════════════════════════════════════════════
  // 46. المفضّلة (FAVORITES)
  // ═══════════════════════════════════════════════════════════
  FAVORITES: {
    enabled: true,
    maxPerUser: 50,                          // أقصى عدد مفضّلة لكل صاحب عمل
  },

  // ═══════════════════════════════════════════════════════════
  // 47. إعادة تشغيل أحداث SSE (SSE_REPLAY)
  // ═══════════════════════════════════════════════════════════
  SSE_REPLAY: {
    enabled: true,
    maxEventsPerUser: 100,                   // أقصى عدد أحداث مخزّنة لكل مستخدم
    maxEventAgeMs: 30 * 60 * 1000,           // أقصى عمر حدث (30 دقيقة)
    cleanupIntervalMs: 10 * 60 * 1000,       // تنظيف كل 10 دقائق
  },

  // ═══════════════════════════════════════════════════════════════
  // 48. النسخ الاحتياطي التلقائي (BACKUP)
  // ═══════════════════════════════════════════════════════════════
  BACKUP: {
    enabled: false,                          // false by default — enable in production
    hourEgypt: 3,                            // 3 صباحاً بتوقيت مصر
    retentionCount: 7,                       // الاحتفاظ بآخر 7 نسخ
    targetDir: './backups',
    verifyIntegrity: true,                   // فحص سلامة الملفات بعد النسخ
  },

  // ═══════════════════════════════════════════════════════════════
  // 49. نموذج الاستعجال (URGENCY)
  // ═══════════════════════════════════════════════════════════════
  URGENCY: {
    enabled: true,
    levels: ['normal', 'urgent', 'immediate'],
    defaultLevel: 'normal',
    immediateExpiryHours: 6,                 // الفرص الفورية تنتهي بعد 6 ساعات
    urgentExpiryHours: 24,                   // الفرص العاجلة تنتهي بعد 24 ساعة
    immediateStartWindowMinutes: 30,         // نافذة البدء للفرص الفورية (دقيقة)
  },

  // ═══════════════════════════════════════════════════════════════
  // 50. فهرس الاستعلام السريع (QUERY_INDEX)
  // ═══════════════════════════════════════════════════════════════
  QUERY_INDEX: {
    enabled: true,
    rebuildOnStartup: true,                  // إعادة بناء الفهرس عند بدء السيرفر
    incrementalUpdates: true,                // تحديثات تزايدية عبر EventBus
  },

  // ═══════════════════════════════════════════════════════════════
  // 51. تقسيم البيانات (SHARDING)
  // ═══════════════════════════════════════════════════════════════
  SHARDING: {
    enabled: true,
    collections: ['jobs', 'applications', 'notifications', 'attendance', 'messages', 'ratings', 'payments', 'instant_matches', 'availability_ads', 'direct_offers'],
    strategy: 'monthly',                     // YYYY-MM subdirectories
    readScanMonths: 6,                       // عدد الأشهر للبحث الخلفي عند عدم وجود cache
    locationCacheMax: 50000,                 // أقصى عدد entries في shard location cache
  },

  // ═══════════════════════════════════════════════════════════════
  // 52. تخزين الصور (IMAGE_STORAGE)
  // ═══════════════════════════════════════════════════════════════
  IMAGE_STORAGE: {
    enabled: true,
    basePath: './data/images',
    maxSizeBytes: 2 * 1024 * 1024,           // 2MB max per image
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    hashAlgorithm: 'sha256',
    bucketPrefixLength: 2,                   // أول حرفين من الـ hash كـ directory bucketing
  },

  // ═══════════════════════════════════════════════════════════════
  // 53. حضور العامل اللحظي (PRESENCE)
  // ═══════════════════════════════════════════════════════════════
  PRESENCE: {
    enabled: true,
    heartbeatIntervalMs: 30000,              // worker pings every 30s (foreground)
    heartbeatBackgroundMs: 60000,            // 60s when tab hidden (battery saving)
    awayAfterMs: 90000,                      // 1.5 min no heartbeat → status='away'
    offlineAfterMs: 300000,                  // 5 min no heartbeat → removed from map
    cleanupIntervalMs: 60000,                // cleanup stale entries every 60s
    maxOnlineWorkers: 100000,                // soft Map size limit (FIFO eviction)
    rateLimitMs: 25000,                      // throttle: max 1 heartbeat per 25s per user
  },

  // ═══════════════════════════════════════════════════════════════
  // 54. المطابقة الفورية (INSTANT_MATCH)
  // ═══════════════════════════════════════════════════════════════
  INSTANT_MATCH: {
    enabled: true,
    topNCandidates: 5,                       // pick top 5 online workers
    acceptanceWindowSeconds: 90,             // worker has 90s to accept
    searchRadiusKm: 5,                       // search radius for candidates
    fallbackToBroadcast: true,               // after expiry: job stays open for normal flow
    cleanupIntervalMs: 30000,                // expire pending matches every 30s
    scoreWeights: {
      distance: 0.6,
      trustScore: 0.3,
      ratingAvg: 0.1,
    },
    notifyChannels: ['sse', 'push'],         // delivery channels for instant offers
  },

  // ═══════════════════════════════════════════════════════════════
  // 55. نوافذ الإتاحة الزمنية (AVAILABILITY_WINDOWS)
  // ═══════════════════════════════════════════════════════════════
  AVAILABILITY_WINDOWS: {
    enabled: true,
    maxWindowsPerUser: 10,
    defaultBehavior: 'always_available',     // when no windows → always available
  },

  // ═══════════════════════════════════════════════════════════════
  // 56. خلاصة الفرص الحية (LIVE_FEED)
  // ═══════════════════════════════════════════════════════════════
  LIVE_FEED: {
    enabled: true,
    initialDumpSize: 20,                     // top N nearby jobs sent on connection
    maxRadiusKm: 30,                         // worker sees jobs within this radius
  },

  // ═══════════════════════════════════════════════════════════════
  // 57. إعلانات إتاحة العامل (AVAILABILITY_ADS)
  // ═══════════════════════════════════════════════════════════════
  AVAILABILITY_ADS: {
    enabled: true,
    maxActivePerWorker: 1,                   // عامل = إعلان نشط واحد (auto-expire previous)
    maxAdvanceDays: 7,                       // ما يقدرش يحدد إتاحة بعد أسبوع من اليوم
    maxDurationHours: 12,                    // أقصى مدة الإعلان (نهار شغل واحد)
    defaultRadiusKm: 20,
    maxRadiusKm: 50,
    maxNotesLength: 200,
    maxCategories: 3,                        // 1-3 categories
    autoExpireBufferMinutes: 30,             // expire قبل availableUntil بنص ساعة
    expirationCheckIntervalMs: 5 * 60 * 1000, // every 5 min
  },

  // ═══════════════════════════════════════════════════════════════
  // 58. اكتشاف العمال (WORKER_DISCOVERY)
  // ═══════════════════════════════════════════════════════════════
  WORKER_DISCOVERY: {
    enabled: true,
    defaultRadiusKm: 30,
    maxRadiusKm: 100,
    cacheKeyTileSize: 0.01,                  // ~1km tile للـ caching
    cacheTtlMs: 30000,                       // 30 ثانية cache TTL
    scoreWeights: {
      distance: 0.4,
      trustScore: 0.3,
      ratingAvg: 0.2,
      recency: 0.1,
    },
    activeAdBonus: 0.1,                      // bonus للعمال عندهم active ad
    includeRecentlyOfflineHours: 24,         // TIER 3: recently online window
    privacyMode: true,                       // redact full names + phones in public cards
  },

  // ═══════════════════════════════════════════════════════════════════
  // 59. العروض المباشرة (DIRECT_OFFERS) — Phase 42 active + Phase 43 hardening + Phase 44 abuse detection + Phase 45 review workflow
  // ═══════════════════════════════════════════════════════════════════
  DIRECT_OFFERS: {
    enabled: true,                            // Phase 42 — closed Talent Exchange loop
    acceptanceWindowSeconds: 120,             // worker has 120s to accept
    maxPendingPerEmployer: 5,                 // anti-spam: max 5 concurrent pending offers per employer
    maxPendingPerWorker: 3,                   // anti-overwhelm: max 3 concurrent pending offers per worker
    maxPerEmployerPerDay: 20,                 // daily ceiling per employer (Egypt timezone reset)
    perWorkerDailyReceiveCap: 50,             // Phase 43 — anti-spam: max offers a single worker can receive per day
    cleanupIntervalMs: 30 * 1000,             // sweep stale pending offers every 30s
    expiryBufferMs: 5 * 1000,                 // 5s grace period for race conditions
    declineReasons: ['busy', 'wage_low', 'distance', 'category_mismatch', 'other'],
    enableTwoPhaseReveal: true,               // hide identity (name+phone) before accept
    syntheticJobUrgency: 'immediate',         // synthetic jobs urgency level
    maxMessageLength: 200,                    // optional employer message ≤ 200 chars
    abuse: {                                  // Phase 44 — rule-based abuse detection (admin review, no auto-ban)
      enabled: true,
      sameWorkerOfferThreshold: 5,            // employer→same worker > N offers in window = suspicious
      sameWorkerWindowHours: 24,              // window for same-worker spam detection
      employerHighDeclineRateThreshold: 0.8,  // employer with >=80% decline rate = suspicious
      employerDeclineWindowDays: 7,           // window for employer decline rate check
      employerMinOffersForRateCheck: 10,      // statistical significance threshold
      workerOfferBombingThreshold: 30,        // worker receives >=N offers = bombing
      workerOfferBombingWindowMinutes: 60,    // window for offer-bombing detection
      workerOfferBombingMinUniqueEmployers: 5, // min unique employers (rules out same_worker_spam overlap)
      reviewWorkflowEnabled: true,            // Phase 45 — admin can dismiss/snooze/warn flags
      maxWarningsPerUserPerWeek: 3,           // Phase 45 — rate limit for soft warnings
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 60. عدّادات العروض المباشرة (COUNTERS) — Phase 45 rolling counter file + Phase 46 batching
  // ═══════════════════════════════════════════════════════════════════
  COUNTERS: {
    enabled: true,
    filePath: 'metrics/direct-offer-counters.json',  // relative to data/
    rebuildIntervalMs: 24 * 60 * 60 * 1000,           // 24 hours
    startupRebuildMaxAgeMs: 24 * 60 * 60 * 1000,      // rebuild on startup if file > 24h old
    maxDecisionTimesArrayLength: 1000,                 // for p50/p95 calculation
    hourlyBucketsRetentionHours: 48,                   // keep last 48 hours of buckets
    minRebuildIntervalMs: 23 * 60 * 60 * 1000,         // skip rebuild if last < 23h ago
    // Phase 46 — Event batching + replay queue
    batchFlushIntervalMs: 1000,                        // Flush queue every 1s
    batchMaxSize: 100,                                 // OR when queue reaches 100 events
    replayQueueMax: 1000,                              // Max events queued during rebuild
  },

  // ═══════════════════════════════════════════════════════════════════
  // 61. عمليات الأدمن (ADMIN_OPERATIONS) — Phase 47 Admin Operations Excellence
  // ═══════════════════════════════════════════════════════════════════
  ADMIN_OPERATIONS: {
    enabled: true,
    // Snooze reminder scanner (Phase 47)
    snoozeReminderEnabled: true,
    snoozeReminderHoursBefore: 24,                    // notify admin 24h before snooze expires
    snoozeReminderCheckIntervalMs: 60 * 60 * 1000,    // check every hour
    // Bulk actions (Phase 47)
    bulkActionMaxFlags: 50,                            // max flags per bulk request
    bulkActionTimeoutMs: 30 * 1000,                    // bulk operation timeout
    // Audit log search (Phase 47)
    auditLogSearchMaxResults: 200,
    auditLogExportMaxRows: 100000,                     // Phase 48 — bumped from 10000 (streaming export)
    auditLogRuntimeCleanupEnabled: false,
    // Rate limit visibility (Phase 47)
    exposeWarningRateLimitToFrontend: true,
    // Phase 48 — SnoozeReminders staleness thresholds
    snoozeReminderStaleWarningMs: 2 * 60 * 60 * 1000,    // 2 hours
    snoozeReminderStaleCriticalMs: 6 * 60 * 60 * 1000,   // 6 hours
  },

  // ═══════════════════════════════════════════════════════════════════
  // 62. حفظ سجل العمليات (AUDIT_RETENTION) — Phase 48 Audit Log Retention Enforcement
  // ═══════════════════════════════════════════════════════════════════
  AUDIT_RETENTION: {
    enabled: true,
    retentionDays: 365,                              // delete entries older than 365 days
    cleanupHourEgypt: 2,                             // run at 2AM Egypt time
    cleanupBatchSize: 100,                           // yield event loop every 100 files
    cleanupCheckIntervalMs: 60 * 60 * 1000,          // check every hour
  },

  // ═══════════════════════════════════════════════════════════════
  // 63. تحليلات الثقة (TRUST_ANALYTICS) — Phase 49
  // ═══════════════════════════════════════════════════════════════
  TRUST_ANALYTICS: {
    enabled: true,
    scheduledDetectionEnabled: true,
    scheduledDetectionIntervalMs: 15 * 60 * 1000,    // every 15 min
    cacheTtlMs: 300000,                              // 5 min cache
    warningConversionWindowDays: 30,
    resolutionHistogramBuckets: [
      { label: '<1h',  maxMs: 60 * 60 * 1000 },
      { label: '<6h',  maxMs: 6 * 60 * 60 * 1000 },
      { label: '<24h', maxMs: 24 * 60 * 60 * 1000 },
      { label: '<3d',  maxMs: 3 * 24 * 60 * 60 * 1000 },
      { label: '<7d',  maxMs: 7 * 24 * 60 * 60 * 1000 },
      { label: '>7d',  maxMs: Infinity },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 64. قنوات تنبيهات الأدمن (ADMIN_ALERT_CHANNELS) — Phase 49
  // ═══════════════════════════════════════════════════════════════
  ADMIN_ALERT_CHANNELS: {
    enabled: false,                                  // false by default — enable per deployment
    channels: ['webhook'],                           // ['webhook', 'email']
    webhook: {
      enabled: false,
      url: '',                                       // Slack/Discord/Telegram/custom webhook URL
      timeoutMs: 5000,
      retryCount: 3,
    },
    email: {
      enabled: false,                                // placeholder for transactional email service
      apiKey: '',
      fromEmail: 'alerts@yowmia.com',
      toEmails: [],
    },
    rateLimitPerEventType: 5,                        // max alerts per event type per hour
    rateLimitWindowMs: 60 * 60 * 1000,
    queueMaxSize: 100,                               // bounded in-memory queue
    eventRouting: {
      'abuse_flag:detected_high_severity': { enabled: true, minSeverity: 'high' },
      'direct_offer:abuse_threshold_crossed': { enabled: true, minSeverity: 'high' },
      'counters:auto_rebuild_triggered': { enabled: true, minSeverity: 'medium' },
      'audit_retention:cleanup_failed_threshold': { enabled: true, minSeverity: 'medium' },
      'counters:file_size_critical': { enabled: true, minSeverity: 'high' },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 65. فهرسة سجل العمليات (AUDIT_INDEX) — Phase 50
  // ═══════════════════════════════════════════════════════════════
  AUDIT_INDEX: {
    enabled: true,
    incrementalUpdates: true,
    basePath: 'audit/indexes',
    tokenIndexEnabled: true,
    tokenMinLength: 2,
    tokenMaxPerRecord: 50,
    maxCandidateIds: 5000,
    fallbackToFullScan: true,
    rebuildOnStartup: false,
    verifySampleSize: 100,
  },

  // ═══════════════════════════════════════════════════════════════
  // 66. سجل التصديرات (EXPORTS) — Phase 50
  // ═══════════════════════════════════════════════════════════════
  EXPORTS: {
    enabled: true,
    basePath: 'exports',
    retentionHours: 48,
    maxConcurrentExports: 2,
    cancellationEnabled: true,
    persistCsvFiles: true,
    cleanupIntervalMs: 60 * 60 * 1000,
  },

  // ═══════════════════════════════════════════════════════════════
  // 67. نظافة ملف العدادات (COUNTER_HYGIENE) — Phase 50
  // ═══════════════════════════════════════════════════════════════
  COUNTER_HYGIENE: {
    enabled: true,
    compactOnSnapshot: true,
    compactIfFileSizeMB: 40,
    inactiveEntityDays: 90,
    maxEntitiesPerCompactRun: 10000,
    archiveEnabled: true,
    archivePath: 'metrics/counter-archives',
  },

  // ═══════════════════════════════════════════════════════════════
  // 68. الذكاء التنبؤي للإساءة (PREDICTIVE_ABUSE) — Phase 51
  // ═══════════════════════════════════════════════════════════════
  PREDICTIVE_ABUSE: {
    enabled: true,
    scheduledScanEnabled: true,
    scanIntervalMs: 15 * 60 * 1000,
    cacheTtlMs: 5 * 60 * 1000,
    minSamples: {
      employerOffers: 10,
      workerReceivedOffers: 10,
      sameWorkerPairOffers: 4,
    },
    windows: {
      shortHours: 24,
      baselineDays: 14,
      bombingMinutes: 60,
    },
    thresholds: {
      zScoreWarning: 2.0,
      zScoreCritical: 3.0,
      riskMedium: 0.5,
      riskHigh: 0.75,
      riskCritical: 0.9,
    },
    maxSignalsPerScan: 100,
    noAutoBan: true,
    persistSignals: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 69. مؤشر الثقة V2 (TRUST_SCORE_V2) — Phase 51
  // ═══════════════════════════════════════════════════════════════
  TRUST_SCORE_V2: {
    enabled: true,
    cacheTtlMs: 5 * 60 * 1000,
    minRatingConfidenceCount: 5,
    publicExposeComponents: true,
    weights: {
      worker: {
        ratingConfidence: 0.20,
        attendanceReliability: 0.25,
        completionReliability: 0.20,
        abusePenalty: 0.15,
        verification: 0.10,
        accountAge: 0.05,
        profileCompleteness: 0.05,
      },
      employer: {
        ratingConfidence: 0.20,
        paymentReliability: 0.25,
        disputeRate: 0.15,
        cancellationRate: 0.10,
        offerBehavior: 0.15,
        abusePenalty: 0.05,
        verification: 0.05,
        accountAge: 0.05,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 70. مساحة العمل والرسائل (WORKROOM) — Phase 51
  // ═══════════════════════════════════════════════════════════════
  WORKROOM: {
    enabled: true,
    quickTemplatesEnabled: true,
    showTimelineEvents: true,
    retainAfterCompletionDays: 365,
    maxTimelineEvents: 200,
    messageTabEnabled: true,
    positiveTemplates: {
      worker: [
        'أنا في الطريق',
        'وصلت للموقع',
        'محتاج توضيح للمكان',
        'تم استلام اليومية',
      ],
      employer: [
        'تمام، مستنيك في المعاد',
        'لو وصلت ابعتلي رسالة',
        'تم تأكيد حضورك',
        'شكراً على الشغل النهارده',
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 71. طابور العمليات التشغيلية (OPS_QUEUE) — Phase 52
  // ═══════════════════════════════════════════════════════════════
  OPS_QUEUE: {
    enabled: true,
    basePath: 'ops_queue',
    workerEnabled: true,
    workerConcurrency: 2,
    scanIntervalMs: 5000,
    leaseMs: 5 * 60 * 1000,
    staleRunningMs: 10 * 60 * 1000,
    maxAttempts: 5,
    defaultBackoffMs: 30 * 1000,
    maxBackoffMs: 30 * 60 * 1000,
    maxPayloadBytes: 256 * 1024,
    idempotencyTtlHours: 24,
    cleanupCompletedAfterHours: 48,
    cleanupFailedAfterDays: 14,
    deadLetterRetentionDays: 90,
    maxJobsPerScan: 10,
    priorityLevels: ['low', 'normal', 'high', 'critical'],
  },

  // ═══════════════════════════════════════════════════════════════
  // 72. سجل تسليم تنبيهات الأدمن (ALERT_DELIVERY) — Phase 52
  // ═══════════════════════════════════════════════════════════════
  ALERT_DELIVERY: {
    enabled: true,
    persistHistory: true,
    historyRetentionDays: 90,
    maxAttempts: 5,
    retryBackoffMs: 30 * 1000,
    deadLetterEnabled: true,
    manualRetryEnabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 73. إجراءات الإشعارات (NOTIFICATION_ACTIONS) — Phase 53
  // ═══════════════════════════════════════════════════════════════
  NOTIFICATION_ACTIONS: {
    enabled: true,
    defaultUrl: '/dashboard.html',
    allowedUrlPrefixes: [
      '/dashboard.html',
      '/profile.html',
      '/job.html',
      '/user.html',
      '/terms.html',
    ],
    trackActionClicks: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 74. مهام إكمال الملف الشخصي (PROFILE_TASKS) — Phase 53
  // ═══════════════════════════════════════════════════════════════
  PROFILE_TASKS: {
    enabled: true,
    showOnDashboard: true,
    maxTasksVisible: 5,
    priorities: ['critical', 'high', 'medium', 'low'],
  },

  // ═══════════════════════════════════════════════════════════════
  // 75. مساحة العمل V2 (WORKROOM_V2) — Phase 53
  // ═══════════════════════════════════════════════════════════════
  WORKROOM_V2: {
    enabled: true,
    readReceiptsEnabled: true,
    searchEnabled: true,
    pinsEnabled: true,
    checklistEnabled: true,
    attachmentsEnabled: true,
    summaryCardsEnabled: true,
    timelineFiltersEnabled: true,
    templateAnalyticsEnabled: true,
    maxPinnedMessagesPerWorkroom: 5,
    maxChecklistItems: 30,
    maxAttachmentsPerMessage: 3,
    messageSearchMaxResults: 100,
  },

  // ═══════════════════════════════════════════════════════════════
  // 76. معايرة مؤشر الثقة (TRUST_CALIBRATION) — Phase 53
  // ═══════════════════════════════════════════════════════════════
  TRUST_CALIBRATION: {
    enabled: true,
    snapshotOnEvents: true,
    scheduledSnapshotEnabled: true,
    snapshotIntervalMs: 24 * 60 * 60 * 1000,
    outcomeWindowDays: 30,
    driftWarningThreshold: 0.15,
    minSamplesForCalibration: 20,
    cacheTtlMs: 5 * 60 * 1000,
  },

  // ═══════════════════════════════════════════════════════════════
  // 77. نظافة إشارات المخاطر التنبؤية (PREDICTIVE_SIGNAL_RETENTION) — Phase 53
  // ═══════════════════════════════════════════════════════════════
  PREDICTIVE_SIGNAL_RETENTION: {
    enabled: true,
    resolvedRetentionDays: 90,
    archiveEnabled: true,
    archivePath: 'metrics/predictive-signal-archives',
    cleanupIntervalMs: 24 * 60 * 60 * 1000,
    batchSize: 100,
  },

  // ═══════════════════════════════════════════════════════════════
  // 78. وضع التشغيل متعدد النسخ (INSTANCE_MODE) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  INSTANCE_MODE: {
    enabled: true,
    mode: process.env.INSTANCE_MODE || 'single_writer', // 'single_writer' | 'read_only_replica' | 'experimental_multi_instance'
    instanceId: process.env.INSTANCE_ID || null,
    allowQueueWorkers: true,
    allowSchedulers: true,
    allowAdminSse: true,
    warnOnUnsafeMultiInstance: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 79. أقفال العمليات (PROCESS_LOCKS) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  PROCESS_LOCKS: {
    enabled: true,
    basePath: 'ops_locks',
    staleAfterMs: 2 * 60 * 1000,
    heartbeatMs: 30 * 1000,
    lockAcquireTimeoutMs: 5000,
    autoRecoverStaleLocks: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 80. سجل الجدولة الدائم (SCHEDULER_REGISTRY) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  SCHEDULER_REGISTRY: {
    enabled: true,
    basePath: 'scheduler',
    leaseMs: 10 * 60 * 1000,
    checkIntervalMs: 60 * 1000,
    maxManualRunPayloadBytes: 64 * 1024,
    jobs: {
      predictive_scan: { enabled: true },
      trust_snapshot_batch: { enabled: true },
      predictive_signal_retention: { enabled: true },
      audit_retention_cleanup: { enabled: true },
      backup_daily: { enabled: false },
      export_cleanup: { enabled: true },
      alert_delivery_cleanup: { enabled: true },
      ops_rollup_capture: { enabled: true },
      backup_restore_drill: { enabled: true },

      // Phase 61 — Evidence cadence / rollback rehearsal / pilot gate
      phase61_evidence_capture: { enabled: true },
      phase61_pilot_gate_capture: { enabled: true },
      phase61_rollback_rehearsal: { enabled: false },

      // Phase 56 — Marketplace/Product Intelligence schedulers
      marketplace_intelligence_daily: { enabled: true },
      search_analytics_rollup: { enabled: true },
      payment_dispute_analytics_rollup: { enabled: true },
      workroom_adoption_rollup: { enabled: true },
      notification_conversion_rollup: { enabled: true },
      activation_funnel_rollup: { enabled: true },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 81. Rollups تشغيلية (OPS_METRICS_ROLLUPS) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  OPS_METRICS_ROLLUPS: {
    enabled: true,
    basePath: 'metrics/ops-rollups',
    intervalMs: 60 * 60 * 1000,
    retentionDays: 30,
    slo: {
      queueDeadLetterWarning: 5,
      queueFailedRateWarningPercent: 10,
      alertDeliveryRateWarningPercent: 90,
      alertDeliveryP95WarningMs: 30000,
      schedulerStaleWarningMs: 2 * 60 * 60 * 1000,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 82. سجل الحوادث التشغيلية (INCIDENT_TIMELINE) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  INCIDENT_TIMELINE: {
    enabled: true,
    basePath: 'metrics/incidents',
    autoOpenForCriticalEvents: true,
    maxEventsPerIncident: 500,
    retentionDays: 90,
  },

  // ═══════════════════════════════════════════════════════════════
  // 83. تجربة استعادة النسخ الاحتياطي (BACKUP_RESTORE_DRILL) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  BACKUP_RESTORE_DRILL: {
    enabled: true,
    basePath: 'metrics/backup-restore-drills',
    restoreTargetDir: './test-backups/restore-drills',
    retentionCount: 10,
    verifyJsonParse: true,
    verifyCriticalIndexes: true,
    verifyMigrationState: true,
    cleanupRestoreTarget: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 84. وضع الصيانة (MAINTENANCE_MODE) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  MAINTENANCE_MODE: {
    enabled: false,
    filePath: 'ops/maintenance.json',
    allowReadOnlyApi: true,
    allowAdminBypass: true,
    message: 'المنصة تحت الصيانة مؤقتاً. حاول بعد قليل.',
  },

  // ═══════════════════════════════════════════════════════════════
  // 85. جاهزية الإنتاج (PRODUCTION_READINESS) — Phase 54
  // ═══════════════════════════════════════════════════════════════
  PRODUCTION_READINESS: {
    enabled: true,
    requireNonDefaultAdminToken: true,
    requireRestrictedOriginsInProduction: true,
    requireBackupPlanInProduction: true,
    requireVapidIfWebPushEnabled: true,
    requireAlertWebhookIfAlertChannelsEnabled: false,
  },

  // ═══════════════════════════════════════════════════════════════
  // 86. تخزين الطابور المقسم (QUEUE_STORAGE) — Phase 55
  // ═══════════════════════════════════════════════════════════════
  QUEUE_STORAGE: {
    enabled: true,
    segmentByStatus: true,
    monthlySharding: true,
    basePath: 'ops_queue',
    statusDirs: {
      pending: 'pending',
      running: 'running',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
      deadLetter: 'dead-letter',
    },
    summaryFile: 'metrics/queue/summary.json',
    legacyReadFallback: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 87. نظافة الطابور (QUEUE_HYGIENE) — Phase 55
  // ═══════════════════════════════════════════════════════════════
  QUEUE_HYGIENE: {
    enabled: true,
    archiveCompletedAfterHours: 48,
    archiveFailedAfterDays: 14,
    archiveCancelledAfterHours: 48,
    archiveDeadLetterAfterDays: 90,
    archivePath: 'ops_queue/archive',
    compactIntervalMs: 24 * 60 * 60 * 1000,
    verifySampleSize: 100,
    slowJobThresholdMs: 5 * 60 * 1000,
    idempotencyCleanupEnabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 88. نظافة Workroom (WORKROOM_HYGIENE) — Phase 55
  // ═══════════════════════════════════════════════════════════════
  WORKROOM_HYGIENE: {
    enabled: true,
    sidecarSizeWarningKB: 512,
    sidecarSizeCriticalKB: 2048,
    receiptCompactionEnabled: true,
    receiptRetentionDays: 365,
    timelineCompactionEnabled: true,
    timelineMaxEvents: 500,
    attachmentOrphanCleanupEnabled: true,
    attachmentGraceHours: 24,
    searchVerifySampleSize: 50,
    cleanupIntervalMs: 24 * 60 * 60 * 1000,
  },

  // ═══════════════════════════════════════════════════════════════
  // 89. احتفاظ و Rollups الثقة (TRUST_RETENTION) — Phase 55
  // ═══════════════════════════════════════════════════════════════
  TRUST_RETENTION: {
    enabled: true,
    snapshotRetentionDays: 90,
    rollupEnabled: true,
    rollupPath: 'metrics/trust-calibration/rollups',
    calibrationReportRetentionDays: 180,
    cleanupIntervalMs: 24 * 60 * 60 * 1000,
  },

  // ═══════════════════════════════════════════════════════════════
  // 90. فهرسة أرشيف المخاطر التنبؤية (PREDICTIVE_ARCHIVE_INDEX) — Phase 55
  // ═══════════════════════════════════════════════════════════════
  PREDICTIVE_ARCHIVE_INDEX: {
    enabled: true,
    basePath: 'metrics/predictive-signal-archives/index',
    rebuildOnRetention: true,
    monthlyPrecisionRollups: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 91. سجل تشغيل الجدولة (SCHEDULER_HISTORY) — Phase 55
  // ═══════════════════════════════════════════════════════════════
  SCHEDULER_HISTORY: {
    enabled: true,
    basePath: 'scheduler/history',
    maxRunsPerJob: 100,
    retentionDays: 90,
  },

  // ═══════════════════════════════════════════════════════════════
  // 92. نظافة التوسع (SCALE_HYGIENE) — Phase 55
  // ═══════════════════════════════════════════════════════════════
  SCALE_HYGIENE: {
    enabled: true,
    dashboardEnabled: true,
    slowQueryLogEnabled: true,
    auditSlowQueryMs: 1000,
    fileSizeWarningKB: 1024,
    fileSizeCriticalKB: 4096,
  },

  // ═══════════════════════════════════════════════════════════════
  // 93. تحسين البحث والملاءمة (SEARCH_RELEVANCE) — Phase 56
  // ═══════════════════════════════════════════════════════════════
  SEARCH_RELEVANCE: {
    enabled: true,
    useWeightedRanking: true,
    maxResults: 200,
    weights: {
      exactTitleMatch: 0.30,
      titleTokenMatch: 0.20,
      descriptionTokenMatch: 0.10,
      categoryMatch: 0.15,
      governorateMatch: 0.10,
      urgencyBoost: 0.05,
      recencyBoost: 0.05,
      wageFit: 0.05,
    },
    recencyHalfLifeHours: 72,
  },

  // ═══════════════════════════════════════════════════════════════
  // 94. البحث العربي المتقدم (ARABIC_SEARCH) — Phase 56
  // ═══════════════════════════════════════════════════════════════
  ARABIC_SEARCH: {
    enabled: true,
    stopwordsEnabled: true,
    lightStemmingEnabled: true,
    minTokenLength: 2,
    maxTokensPerQuery: 12,
    preserveNumbers: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 95. تحليلات البحث (SEARCH_ANALYTICS) — Phase 56
  // ═══════════════════════════════════════════════════════════════
  SEARCH_ANALYTICS: {
    enabled: true,
    basePath: 'metrics/search-analytics',
    hashQueries: true,
    trackZeroResults: true,
    trackClicks: true,
    trackApplicationsAfterSearch: true,
    retentionDays: 90,
    rollupIntervalMs: 24 * 60 * 60 * 1000,
  },

  // ═══════════════════════════════════════════════════════════════
  // 96. ذكاء المطابقة القابل للتفسير (MATCHING_INTELLIGENCE) — Phase 56
  // ═══════════════════════════════════════════════════════════════
  MATCHING_INTELLIGENCE: {
    enabled: true,
    explainabilityEnabled: true,
    maxExplanationReasons: 5,
    scoreWeights: {
      category: 0.25,
      distance: 0.20,
      availability: 0.15,
      activeAd: 0.10,
      trustScore: 0.15,
      rating: 0.05,
      responseSpeed: 0.10,
    },
    fairness: {
      maxSameWorkerRecommendationsPerEmployerPerDay: 10,
      diversifyResults: true,
      noPunitiveAutomation: true,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 97. ذكاء المنتج والسوق (PRODUCT_INTELLIGENCE) — Phase 56
  // ═══════════════════════════════════════════════════════════════
  PRODUCT_INTELLIGENCE: {
    enabled: true,
    basePath: 'metrics/product-intelligence',
    cacheTtlMs: 5 * 60 * 1000,
    rollupEnabled: true,
    rollupIntervalMs: 24 * 60 * 60 * 1000,
    retentionDays: 180,
  },

  // ═══════════════════════════════════════════════════════════════
  // 98. تحليلات النزاعات المالية (PAYMENT_DISPUTE_ANALYTICS) — Phase 56
  // ═══════════════════════════════════════════════════════════════
  PAYMENT_DISPUTE_ANALYTICS: {
    enabled: true,
    cacheTtlMs: 5 * 60 * 1000,
    minSamplesForTrend: 5,
    groupBy: ['category', 'governorate', 'employer', 'worker'],
  },

  // ═══════════════════════════════════════════════════════════════
  // 99. تنظيم لوحة الأدمن (ADMIN_DASHBOARD_IA) — Phase 56
  // ═══════════════════════════════════════════════════════════════
  ADMIN_DASHBOARD_IA: {
    enabled: true,
    defaultTab: 'overview',
    lazyLoadTabs: true,
    tabs: ['overview', 'marketplace', 'trust', 'ops', 'scale', 'audit', 'governance', 'settings'],
  },

  // ═══════════════════════════════════════════════════════════════
  // 100. انضباط النشر والإنتاج (DEPLOYMENT_DISCIPLINE) — Phase 57
  // ═══════════════════════════════════════════════════════════════
  DEPLOYMENT_DISCIPLINE: {
    enabled: true,
    requirePredeployCheck: true,
    requirePostdeploySmoke: true,
    requireRecentBackupRestoreDrillInProduction: true,
    restoreDrillMaxAgeDays: 7,
    requireQueueHealthyInProduction: true,
    requireNoCriticalScaleWarningsInProduction: true,
    requireMarketplaceRollupFreshInProduction: false,
    marketplaceRollupMaxAgeHours: 48,
    allowDeployWithWarnings: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 101. فحص صحة الملفات (FILE_HEALTH) — Phase 57
  // ═══════════════════════════════════════════════════════════════
  FILE_HEALTH: {
    enabled: true,
    jsonParseCheckEnabled: true,
    zeroByteJsonIsCritical: true,
    staleTmpWarningMinutes: 10,
    staleTmpCriticalMinutes: 60,
    largeJsonWarningKB: 1024,
    largeJsonCriticalKB: 4096,
    embeddedBase64DetectionEnabled: true,
    embeddedBase64WarningKB: 256,
    maxFilesPerScan: 200000,
    batchSize: 250,
  },

  // ═══════════════════════════════════════════════════════════════
  // 102. حوكمة التشغيل (OPS_GOVERNANCE) — Phase 57
  // ═══════════════════════════════════════════════════════════════
  OPS_GOVERNANCE: {
    enabled: true,
    weeklyReviewEnabled: true,
    queueDlqReviewEnabled: true,
    incidentRunbooksEnabled: true,
    maintenanceApprovalRequired: false,
    marketplaceReviewEnabled: true,
    trustReviewEnabled: true,
    restoreDrillReviewEnabled: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 103. التحكم في النسخ القراءة فقط (READ_ONLY_REPLICA_GUARD) — Phase 57
  // ═══════════════════════════════════════════════════════════════
  READ_ONLY_REPLICA_GUARD: {
    enabled: true,
    blockWriteApisInReadOnlyReplica: true,
    allowHealthAndConfig: true,
    allowPublicReadApis: true,
    allowAdminReadOnlyOps: true,
    allowMaintenanceRead: true,
    message: 'هذه النسخة للقراءة فقط. حاول من النسخة الرئيسية.',
  },

  // ═══════════════════════════════════════════════════════════════
  // 104. تصنيف الحوادث (INCIDENT_TAXONOMY) — Phase 57
  // ═══════════════════════════════════════════════════════════════
  INCIDENT_TAXONOMY: {
    enabled: true,
    runbookBasePath: './INCIDENT_RUNBOOKS.md',
    defaultSeverity: 'medium',
    categories: [
      'queue',
      'scheduler',
      'backup',
      'json_corruption',
      'search',
      'audit',
      'counter',
      'workroom',
      'marketplace_rollup',
      'alert_delivery',
      'maintenance',
      'security',
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 105. صلاحيات الأدمن (ADMIN_RBAC) — Phase 58
  // ═══════════════════════════════════════════════════════════════
  ADMIN_RBAC: {
    enabled: true,
    tokenRole: 'super_admin',
    defaultSessionAdminRole: 'super_admin',
    roles: [
      'super_admin',
      'ops_admin',
      'trust_admin',
      'support_admin',
      'finance_admin',
      'read_only_admin',
    ],
    dangerousActionsRequireApproval: true,
    allowSuperAdminBypassApproval: true,
    approvalExpiryHours: 24,
    capabilities: {
      super_admin: ['*'],
      ops_admin: [
        'admin.read',
        'admin.ops.read',
        'admin.queue.read',
        'admin.queue.retry',
        'admin.queue.cancel',
        'admin.queue.repair',
        'admin.schedulers.read',
        'admin.schedulers.run',
        'admin.schedulers.toggle',
        'admin.incidents.read',
        'admin.incidents.resolve',
        'admin.postmortems.write',
        'admin.maintenance.toggle',
        'admin.locks.release',
        'admin.readiness.read',
        'admin.scale.read',
        'admin.ops.review',
      ],
      trust_admin: [
        'admin.read',
        'admin.trust.read',
        'admin.reports.review',
        'admin.abuse.review',
        'admin.abuse.warn',
        'admin.predictive.review',
        'admin.trust.calibration',
        'admin.decision_quality.read',
      ],
      support_admin: [
        'admin.read',
        'admin.users.read',
        'admin.users.status_limited',
        'admin.verifications.review',
        'admin.notifications.read',
      ],
      finance_admin: [
        'admin.read',
        'admin.finance.read',
        'admin.payments.complete',
        'admin.disputes.read',
        'admin.exports.finance',
      ],
      read_only_admin: [
        'admin.read',
        'admin.ops.read',
        'admin.trust.read',
        'admin.finance.read',
        'admin.marketplace.read',
        'admin.audit.read',
        'admin.privacy.read',
        'admin.scale.read',
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 106. طلبات الخصوصية (PRIVACY_REQUESTS) — Phase 58
  // ═══════════════════════════════════════════════════════════════
  PRIVACY_REQUESTS: {
    enabled: true,
    basePath: 'privacy_requests',
    exportEnabled: true,
    anonymizeEnabled: true,
    maxConcurrentPrivacyJobs: 1,
    exportRetentionHours: 72,
    requestRetentionDays: 365,
    includeMessagesInExport: true,
    includeAuditRefsInExport: false,
    deleteVerificationImagesOnAnonymize: true,
    deleteSessionsOnAnonymize: true,
    anonymizeUserIdPrefix: 'anon_',
  },

  // ═══════════════════════════════════════════════════════════════
  // 107. سجلات المراجعات التشغيلية (OPS_REVIEW_RECORDS) — Phase 58
  // ═══════════════════════════════════════════════════════════════
  OPS_REVIEW_RECORDS: {
    enabled: true,
    basePath: 'ops/reviews',
    requiredWeeklyReview: true,
    weeklyReviewMaxAgeDays: 7,
    reviewTypes: [
      'weekly_ops_review',
      'dlq_review',
      'restore_drill_review',
      'marketplace_review',
      'trust_calibration_review',
      'predictive_precision_review',
      'payment_dispute_review',
      'slo_breach_review',
      'privacy_review',
      'externalization_pilot_review',
      'rollback_rehearsal_review',
      'phase61_evidence_review',
    ],
    retentionDays: 365,
  },

  // ═══════════════════════════════════════════════════════════════
  // 108. سجلات ما بعد الحوادث (POSTMORTEMS) — Phase 58
  // ═══════════════════════════════════════════════════════════════
  POSTMORTEMS: {
    enabled: true,
    basePath: 'ops/postmortems',
    requireForCriticalIncidents: true,
    requireForHighIncidents: false,
    actionItemRetentionDays: 365,
    maxActionItems: 50,
  },

  // ═══════════════════════════════════════════════════════════════
  // 109. موافقات إجراءات الأدمن الخطيرة (ADMIN_APPROVALS) — Phase 58
  // ═══════════════════════════════════════════════════════════════
  ADMIN_APPROVALS: {
    enabled: true,
    basePath: 'ops/admin-approvals',
    expiryHours: 24,
    dangerousActions: [
      'user_ban',
      'bulk_abuse_action',
      'process_lock_force_release',
      'maintenance_enable',
      'queue_repair',
      'scheduler_disable',
      'payment_complete',
      'audit_export',
      'privacy_anonymize',
      'externalization_pilot',
    ],
    retentionDays: 365,
  },

  // ═══════════════════════════════════════════════════════════════
  // 110. حدود التوسع للتخزين الملفي (SCALE_LIMITS) — Phase 59
  // ═══════════════════════════════════════════════════════════════
  SCALE_LIMITS: {
    enabled: true,
    mode: 'advisory', // advisory | strict
    shallowScanMaxFiles: 250000,
    deepScanDefaultEnabled: false,
    thresholds: {
      collections: {
        users: {
          warningFiles: 50000,
          criticalFiles: 100000,
          warningLargestJsonKB: 512,
          criticalLargestJsonKB: 2048,
        },
        jobs: {
          warningFilesPerShard: 20000,
          criticalFilesPerShard: 50000,
        },
        applications: {
          warningFilesPerShard: 50000,
          criticalFilesPerShard: 100000,
        },
        messages: {
          warningFilesPerShard: 100000,
          criticalFilesPerShard: 250000,
        },
        notifications: {
          warningFilesPerShard: 100000,
          criticalFilesPerShard: 250000,
        },
        audit: {
          warningFiles: 100000,
          criticalFiles: 250000,
        },
        direct_offers: {
          warningFilesPerShard: 50000,
          criticalFilesPerShard: 100000,
        },
        privacy_requests: {
          warningFiles: 5000,
          criticalFiles: 20000,
        },
        admin_approvals: {
          warningFiles: 5000,
          criticalFiles: 20000,
        },
        ops_reviews: {
          warningFiles: 5000,
          criticalFiles: 20000,
        },
        postmortems: {
          warningFiles: 2000,
          criticalFiles: 10000,
        },
      },
      indexes: {
        setIndexWarningKB: 2048,
        setIndexCriticalKB: 8192,
        auditTokenFilesWarning: 50000,
        auditTokenFilesCritical: 150000,
        searchIndexWarningKB: 4096,
        searchIndexCriticalKB: 16384,
      },
      queue: {
        pendingWarning: 1000,
        pendingCritical: 5000,
        runningWarning: 100,
        runningCritical: 500,
        deadLetterWarning: 10,
        deadLetterCritical: 50,
        staleSummaryWarningMinutes: 30,
        staleSummaryCriticalHours: 6,
      },
      workrooms: {
        sidecarWarningKB: 512,
        sidecarCriticalKB: 2048,
        searchIndexWarningKB: 1024,
        searchIndexCriticalKB: 4096,
      },
      images: {
        totalSizeWarningMB: 1024,       // 1GB image/object store warning
        totalSizeCriticalMB: 5120,      // 5GB image/object store critical
        largestFileWarningMB: 2,        // mirrors current max image size
        largestFileCriticalMB: 10,      // unexpected large binary/object
        binaryFilesWarning: 50000,
        binaryFilesCritical: 200000,
      },
      analytics: {
        searchAnalyticsWarningFiles: 5000,
        searchAnalyticsCriticalFiles: 20000,
        productIntelligenceWarningFiles: 5000,
        productIntelligenceCriticalFiles: 20000,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 111. مراقبة ضغط التخزين (STORAGE_PRESSURE) — Phase 59
  // ═══════════════════════════════════════════════════════════════
  STORAGE_PRESSURE: {
    enabled: true,
    basePath: 'metrics/storage-pressure',
    snapshotRetentionDays: 30,
    shallowScanEnabled: true,
    deepScanEnabled: false,
    sampleJsonParseCount: 100,
    largestFilesLimit: 20,
    recommendationLimit: 10,
    cacheTtlMs: 5 * 60 * 1000,
  },

  // ═══════════════════════════════════════════════════════════════
  // 112. جاهزية النقل المستقبلي للخارج (EXTERNALIZATION_READINESS) — Phase 59
  // ═══════════════════════════════════════════════════════════════
  EXTERNALIZATION_READINESS: {
    enabled: true,
    noExternalizationBeforePhase: 60,
    candidates: [
      'users',
      'jobs',
      'applications',
      'payments',
      'messages',
      'ops_queue',
      'audit',
      'search',
      'images',
    ],
    migrationSnapshotBasePath: './migration-snapshots',
    ndjsonExportEnabled: true,
    includeChecksums: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 113. حدود التشغيل متعدد النسخ (MULTI_INSTANCE_BOUNDARY) — Phase 59
  // ═══════════════════════════════════════════════════════════════
  MULTI_INSTANCE_BOUNDARY: {
    enabled: true,
    documentSafeReadOnlyApis: true,
    documentUnsafeWriterApis: true,
    requireSingleWriterForQueueAndSchedulers: true,
    eventBusBridgeRequiredForMultiInstance: true,
    sseFanoutRequiredForMultiInstance: true,
    externalQueueRequiredForMultiWriter: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // 114. قرار النقل المستقبلي المبني على الدليل (EXTERNALIZATION_DECISION) — Phase 60
  // ═══════════════════════════════════════════════════════════════
  EXTERNALIZATION_DECISION: {
    enabled: true,
    advisoryOnly: true,
    requireRepeatedEvidence: true,
    repeatedWarningMinSnapshots: 3,
    repeatedCriticalMinSnapshots: 2,
    evidenceWindowDays: 30,
    benchmarkHistoryRetentionDays: 90,
    decisionStatuses: [
      'no_action',
      'monitor',
      'mitigate_file_based',
      'rehearsal_required',
      'pilot_candidate',
      'deferred',
    ],
    noImplementationBeforeApproval: true,
    basePath: 'metrics/externalization-decisions',
  },

  // ═══════════════════════════════════════════════════════════════
  // 115. تحقق لقطات الهجرة (MIGRATION_SNAPSHOT_VALIDATION) — Phase 60
  // ═══════════════════════════════════════════════════════════════
  MIGRATION_SNAPSHOT_VALIDATION: {
    enabled: true,
    requireManifest: true,
    requireChecksums: true,
    validateNdjson: true,
    validateRedaction: true,
    validateReferentialIntegrity: true,
    sampleReferenceCheckLimit: 1000,
    forbiddenKeysRegex: '(token|secret|password|apiKey|api_key|authorization|vapidPrivateKey)',
    rawBase64WarningKB: 32,
  },

  // ═══════════════════════════════════════════════════════════════
  // 116. تدريب الهجرة والرجوع (MIGRATION_REHEARSAL) — Phase 60
  // ═══════════════════════════════════════════════════════════════
  MIGRATION_REHEARSAL: {
    enabled: true,
    basePath: 'migration-snapshots/rehearsals',
    requireBackupBeforeRehearsal: true,
    requireRollbackPlan: true,
    persistReports: true,
    retentionCount: 10,
  },

  // ═══════════════════════════════════════════════════════════════
  // 117. تاريخ Benchmarks (BENCHMARK_HISTORY) — Phase 60
  // ═══════════════════════════════════════════════════════════════
  BENCHMARK_HISTORY: {
    enabled: true,
    basePath: 'metrics/benchmarks',
    retentionDays: 90,
    persistJsonArtifacts: true,
    p95WarningMs: 1000,
    p95CriticalMs: 3000,
  },

  // ═══════════════════════════════════════════════════════════════
  // 118. إيقاع أدلة Phase 61 (PHASE61_EVIDENCE_CADENCE)
  // ═══════════════════════════════════════════════════════════════
  PHASE61_EVIDENCE_CADENCE: {
    enabled: true,
    advisoryOnly: true,
    storagePressureCadenceDays: 7,
    benchmarkCadenceDays: 7,
    scaleThresholdCadenceDays: 7,
    externalizationDecisionCadenceDays: 7,
    migrationRehearsalCadenceDays: 30,
    rollbackRehearsalCadenceDays: 30,
    requireWeeklyOpsReviewLink: true,
    staleEvidenceWarningDays: 14,
    staleEvidenceCriticalDays: 30,
    basePath: 'metrics/phase61-evidence',
  },

  // ═══════════════════════════════════════════════════════════════
  // 119. بوابة مرشح Pilot (PHASE61_PILOT_GATE)
  // ═══════════════════════════════════════════════════════════════
  PHASE61_PILOT_GATE: {
    enabled: true,
    advisoryOnly: true,
    requireRepeatedEvidence: true,
    requireMigrationRehearsalPassed: true,
    requireRollbackRehearsalPassed: true,
    requireFreshRestoreDrill: true,
    restoreDrillMaxAgeDays: 7,
    requireAdminApproval: true,
    approvalAction: 'externalization_pilot',
    requirePrivacyReview: true,
    privacyReviewType: 'privacy_review',
    requireNoCriticalOpenIncidents: true,
    requireNoOverdueCriticalPostmortemActions: true,
    maxPilotCandidatesAtOnce: 1,
    implementationAllowedByDefault: false,
    basePath: 'metrics/pilot-decisions',
  },

  // ═══════════════════════════════════════════════════════════════
  // 120. تدريب الرجوع (PHASE61_ROLLBACK_REHEARSAL)
  // ═══════════════════════════════════════════════════════════════
  PHASE61_ROLLBACK_REHEARSAL: {
    enabled: true,
    basePath: 'migration-snapshots/rehearsals/rollback',
    persistReports: true,
    requireBackupReference: true,
    requireRestoreDrillReference: true,
    verifyIndexesPlan: true,
    verifyQueuePlan: true,
    verifySmokePlan: true,
    retentionCount: 10,
  },

  // ═══════════════════════════════════════════════════════════════
  // 121. عقود Repository Adapters (REPOSITORY_CONTRACTS)
  // ═══════════════════════════════════════════════════════════════
  REPOSITORY_CONTRACTS: {
    enabled: true,
    docsOnly: true,
    runtimeSwitchEnabled: false,
    contractTestsEnabled: true,
    basePath: 'metrics/repository-contracts',
    candidates: [
      'users',
      'jobs',
      'applications',
      'payments',
      'messages',
      'workrooms',
      'ops_queue',
      'audit',
      'search',
      'images',
    ],
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
