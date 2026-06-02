# يوميّة (Yawmia) v0.57.0 — Part 1: Config + Server Core + Router
> Auto-generated: 2026-06-02T02:58:13.322Z
> Files in this part: 6

## Files
1. `.env.example`
2. `.gitignore`
3. `config.js`
4. `package.json`
5. `server.js`
6. `server/router.js`

---

## `.env.example`

```text
# Server
PORT=3002
NODE_ENV=development

# Admin
ADMIN_TOKEN=change-me-in-production

# ── Messaging Channels ─────────────────────────────────
# Set MESSAGING.enabled=true in config.js to activate

# WhatsApp Cloud API (Primary — ~$0.006/OTP in Egypt)
# Get these from Meta Business Suite → WhatsApp → API Setup
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# SMS via Infobip (Fallback — ~$0.04/OTP in Egypt)
INFOBIP_API_KEY=
INFOBIP_BASE_URL=https://xxxxx.api.infobip.com
INFOBIP_SENDER=Yawmia

# ── Web Push (VAPID) ───────────────────────────────────────
# Generate keys: node scripts/generate-vapid-keys.js
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# ── Admin Alert Channels (Phase 49) ─────────────────────────
# Optional: external webhook for critical admin alerts
# Enable via config.ADMIN_ALERT_CHANNELS.enabled=true + webhook.enabled=true
ADMIN_ALERT_WEBHOOK_URL=

# ── Phase 54: Instance Mode / Production Ops ─────────────────
# INSTANCE_MODE=single_writer | read_only_replica | experimental_multi_instance
INSTANCE_MODE=single_writer
# Optional stable ID for this process/container
INSTANCE_ID=
```

---

## `.gitignore`

```text
node_modules/
.env
data/
logs/
*.log
.DS_Store
Thumbs.db
cloudflared.deb
backups/
test-backups/
*.tmp
backups/
test-backups/
*.tmp
```

---

## `config.js`

```javascript
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
    runbookBasePath: './docs/incidents/INCIDENT_RUNBOOKS.md',
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
```

---

## `package.json`

```json
{
  "name": "yawmia",
  "version": "0.57.0",
  "description": "يوميّة — منصة توظيف العمالة اليومية في مصر",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test --test-concurrency=1 tests/**/*.test.js"
  },
  "keywords": ["daily-labor", "egypt", "employment", "platform"],
  "license": "UNLICENSED",
  "private": true,
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "dotenv": "^16.4.0"
  }
}
```

---

## `server.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server.js — يوميّة: Entry Point
// ═══════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Load env
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {
  // dotenv not installed yet — use process.env directly
}

import config from './config.js';
import { createRouter } from './server/router.js';
import { corsMiddleware } from './server/middleware/cors.js';
import { securityMiddleware } from './server/middleware/security.js';
import { requestIdMiddleware } from './server/middleware/requestId.js';
import { readOnlyReplicaMiddleware } from './server/middleware/readOnlyReplica.js';
import { bodyParserMiddleware } from './server/middleware/bodyParser.js';
import { rateLimitMiddleware } from './server/middleware/rateLimit.js';
import { timingMiddleware } from './server/middleware/timing.js';
import { maintenanceMiddleware } from './server/middleware/maintenance.js';
import { logger } from './server/services/logger.js';
import { initDatabase } from './server/services/database.js';
import { staticMiddleware } from './server/middleware/static.js';
import { cleanExpired as cleanExpiredSessions } from './server/services/sessions.js';
import { enforceExpiredJobs, checkExpiryWarnings } from './server/services/jobs.js';
import { cleanExpiredOtps } from './server/services/auth.js';
import { cleanOldNotifications } from './server/services/notifications.js';
import { autoDetectNoShows } from './server/services/attendance.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Initialize Database Directories ──────────────────────────
await initDatabase();

// ── Run Schema Migrations ────────────────────────────────────
try {
  const { runMigrations } = await import('./server/services/migration.js');
  const migrationResult = await runMigrations();
  if (migrationResult.applied > 0) {
    logger.info(`Startup: applied ${migrationResult.applied} migration(s), schema now at v${migrationResult.current}`);
  }
} catch (err) {
  logger.warn('Startup: migration error', { error: err.message });
}

// ── Phase 50 — Audit Log Index Listener Registration ─────────
// Importing the module registers audit:logged/audit:deleted listeners.
// Optional rebuild is controlled by config.AUDIT_INDEX.rebuildOnStartup.
try {
  if (config.AUDIT_INDEX && config.AUDIT_INDEX.enabled) {
    const auditIdx = await import('./server/services/auditLogIndex.js');
    if (config.AUDIT_INDEX.rebuildOnStartup) {
      const result = await auditIdx.rebuildAuditIndex();
      logger.info('Startup: audit index rebuilt', result);
    } else {
      logger.info('Startup: audit index listeners registered');
    }
  }
} catch (err) {
  logger.warn('Startup: audit index init error', { error: err.message });
}

// ── Build Search Index (conditional — skip if recently built) ─
try {
  const searchIdx = await import('./server/services/searchIndex.js');
  const searchStats = searchIdx.getStats();
  const SKIP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  if (searchStats.lastBuilt && (Date.now() - new Date(searchStats.lastBuilt).getTime()) < SKIP_THRESHOLD_MS) {
    logger.info('Startup: search index fresh — skipping rebuild');
  } else {
    await searchIdx.buildIndex();
    logger.info('Startup: search index built');
  }
} catch (err) {
  logger.warn('Startup: search index build error', { error: err.message });
}

// ── Build Query Index (conditional — skip if recently built) ─
try {
  const queryIdx = await import('./server/services/queryIndex.js');
  const queryStats = queryIdx.getStats();
  const SKIP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  if (queryStats.lastBuilt && (Date.now() - new Date(queryStats.lastBuilt).getTime()) < SKIP_THRESHOLD_MS) {
    logger.info('Startup: query index fresh — skipping rebuild');
  } else {
    const qiCount = await queryIdx.buildAllIndexes();
    if (qiCount > 0) logger.info(`Startup: query index built (${qiCount} jobs)`);
  }
} catch (err) {
  logger.warn('Startup: query index build error', { error: err.message });
}

// ── Clean Stale .tmp Files (orphans from crashes) ────────────
try {
  const { cleanStaleTmpFiles } = await import('./server/services/database.js');
  const cleanedTmp = await cleanStaleTmpFiles();
  if (cleanedTmp > 0) logger.warn(`Startup: cleaned ${cleanedTmp} stale .tmp files`);
} catch (_) { /* non-fatal */ }

// ── Create Logs Directory ────────────────────────────────────
try {
  await mkdir(join('.', 'logs'), { recursive: true });
} catch (_) { /* logs dir creation failure is non-fatal */ }

// ── Startup Index Integrity Check (lightweight — warning only) ──
try {
  const { readJSON: readJSONCheck } = await import('./server/services/database.js');
  const { join: joinPath } = await import('node:path');
  const dataPath = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

  const criticalIndexes = [
    { name: 'phone-index', path: config.DATABASE.indexFiles.phoneIndex },
    { name: 'jobs-index', path: config.DATABASE.indexFiles.jobsIndex },
  ];

  for (const idx of criticalIndexes) {
    const fullPath = joinPath(dataPath, idx.path);
    const data = await readJSONCheck(fullPath);
    if (!data) {
      logger.warn(`⚠️ Critical index missing: ${idx.name} (${idx.path}). Run: node scripts/repair-indexes.js`);
    }
  }
} catch (err) {
  logger.warn('Startup index check error', { error: err.message });
}

// ── Create Router ─────────────────────────────────────────────
const router = createRouter();

// ── Middleware Chain ───────────────────────────────────────────
function runMiddleware(middlewares, req, res, done) {
  let idx = 0;
  function next(err) {
    if (err) {
      logger.error('Middleware error', { error: err.message });
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' }));
      }
      return;
    }
    const mw = middlewares[idx++];
    if (!mw) return done();
    try {
      mw(req, res, next);
    } catch (e) {
      next(e);
    }
  }
  next();
}

const globalMiddleware = [
  timingMiddleware,
  corsMiddleware,
  securityMiddleware,
  requestIdMiddleware,
  rateLimitMiddleware,
  maintenanceMiddleware,
  readOnlyReplicaMiddleware,
  bodyParserMiddleware,
];

// ── HTTP Server ───────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  req.pathname = url.pathname;
  req.query = Object.fromEntries(url.searchParams);

  // Static file serving runs BEFORE the API middleware chain
  staticMiddleware(req, res, () => {
    runMiddleware(globalMiddleware, req, res, () => {
      router(req, res);
    });
  });
});

// ── Server Timeouts ───────────────────────────────────────────
server.requestTimeout = 30000;       // 30s max for entire request
server.headersTimeout = 10000;       // 10s max for headers
server.keepAliveTimeout = 65000;     // 65s keep-alive (> typical LB timeout of 60s)

// ── Startup Cleanup ───────────────────────────────────────────
try {
  const expiredSessions = await cleanExpiredSessions();
  if (expiredSessions > 0) logger.info(`Startup: cleaned ${expiredSessions} expired sessions`);
  const expiredJobs = await enforceExpiredJobs();
  if (expiredJobs > 0) logger.info(`Startup: enforced ${expiredJobs} expired jobs`);
  const expiredOtps = await cleanExpiredOtps();
  if (expiredOtps > 0) logger.info(`Startup: cleaned ${expiredOtps} expired OTPs`);
  const oldNotifs = await cleanOldNotifications();
  if (oldNotifs > 0) logger.info(`Startup: cleaned ${oldNotifs} old notifications`);
  const autoNoShows = await autoDetectNoShows();
  if (autoNoShows > 0) logger.info(`Startup: detected ${autoNoShows} auto no-shows`);
  const expiryWarnings = await checkExpiryWarnings();
  if (expiryWarnings > 0) logger.info(`Startup: sent ${expiryWarnings} expiry warning(s)`);
} catch (err) {
  logger.warn('Startup cleanup error', { error: err.message });
}

// ── Startup Index Health Check ────────────────────────────────
try {
  const { checkIndexHealth } = await import('./server/services/indexHealth.js');
  const healthResult = await checkIndexHealth();
  if (healthResult.warnings.length > 0) {
    logger.warn(`Startup: index health check found ${healthResult.warnings.length} warning(s). Run: node scripts/repair-indexes.js`);
  } else {
    logger.info('Startup: index health check passed');
  }
} catch (err) {
  logger.warn('Startup index health check error', { error: err.message });
}

// ── Periodic Cleanup (every 30 minutes) ───────────────────────
const CLEANUP_INTERVAL = 30 * 60 * 1000;
let cleanupCycleCount = 0;
const cleanupTimer = setInterval(async () => {
  try {
    await cleanExpiredSessions();
    await enforceExpiredJobs();
    await cleanExpiredOtps();
    await cleanOldNotifications();
    await autoDetectNoShows();

    // Phase 52 — Alert delivery history cleanup
    try {
      const { cleanupOldDeliveries } = await import('./server/services/alertDeliveryHistory.js');
      const cleanedDeliveries = await cleanupOldDeliveries();
      if (cleanedDeliveries > 0) logger.info(`Periodic: cleaned ${cleanedDeliveries} old alert delivery record(s)`);
    } catch (_) { /* non-fatal */ }

    // Expiry warnings (fire-and-forget)
    try {
      const { checkExpiryWarnings } = await import('./server/services/jobs.js');
      const warnings = await checkExpiryWarnings();
      if (warnings > 0) logger.info(`Periodic: sent ${warnings} expiry warning(s)`);
    } catch (_) { /* non-fatal */ }

    // Index health check every 12 cycles (= 6 hours)
    cleanupCycleCount++;

    // Search index + query index rebuild every 2 cycles (= every hour)
    if (cleanupCycleCount % 2 === 0) {
      try {
        const { buildIndex } = await import('./server/services/searchIndex.js');
        await buildIndex();
      } catch (_) { /* non-fatal */ }
      try {
        const { buildAllIndexes } = await import('./server/services/queryIndex.js');
        await buildAllIndexes();
      } catch (_) { /* non-fatal */ }
    }

    if (cleanupCycleCount % 12 === 0) {
      try {
        const { checkIndexHealth } = await import('./server/services/indexHealth.js');
        await checkIndexHealth();
      } catch (_) { /* non-fatal */ }

      // Monitoring snapshot cleanup (every 6 hours — same as index health)
      try {
        const { cleanOldSnapshots } = await import('./server/services/monitor.js');
        const cleanedSnapshots = await cleanOldSnapshots();
        if (cleanedSnapshots > 0) logger.info(`Periodic: cleaned ${cleanedSnapshots} old monitoring snapshot(s)`);
      } catch (_) { /* non-fatal */ }
    }
  } catch (err) {
    logger.warn('Periodic cleanup error', { error: err.message });
  }
}, CLEANUP_INTERVAL);
if (cleanupTimer.unref) cleanupTimer.unref();

// ── Phase 40 — Presence cleanup timer (every 60s) ─────────────
if (config.PRESENCE && config.PRESENCE.enabled) {
  const presenceTimer = setInterval(async () => {
    try {
      const { cleanupStale } = await import('./server/services/presenceService.js');
      cleanupStale();
    } catch (err) {
      logger.warn('Presence cleanup error', { error: err.message });
    }
  }, config.PRESENCE.cleanupIntervalMs);
  if (presenceTimer.unref) presenceTimer.unref();
}

// ── Phase 40 — Instant match cleanup timer (every 30s) ────────
if (config.INSTANT_MATCH && config.INSTANT_MATCH.enabled) {
  const instantMatchTimer = setInterval(async () => {
    try {
      const { cleanupExpired } = await import('./server/services/instantMatch.js');
      const count = await cleanupExpired();
      if (count > 0) logger.info(`Instant match: expired ${count} match(es)`);
    } catch (err) {
      logger.warn('Instant match cleanup error', { error: err.message });
    }
  }, config.INSTANT_MATCH.cleanupIntervalMs);
  if (instantMatchTimer.unref) instantMatchTimer.unref();
}

// ── Phase 41 — Availability ad expiration timer (every 5 min) ─
if (config.AVAILABILITY_ADS && config.AVAILABILITY_ADS.enabled) {
  const adExpirationTimer = setInterval(async () => {
    try {
      const { expireStaleAds } = await import('./server/services/availabilityAd.js');
      await expireStaleAds();
    } catch (err) {
      logger.warn('Ad expiration error', { error: err.message });
    }
  }, config.AVAILABILITY_ADS.expirationCheckIntervalMs || 5 * 60 * 1000);
  if (adExpirationTimer.unref) adExpirationTimer.unref();

  // Phase 41 — adMatcher dedup map cleanup timer (every 1 min)
  const adDedupCleanupTimer = setInterval(async () => {
    try {
      const { cleanupDedup } = await import('./server/services/adMatcher.js');
      cleanupDedup();
    } catch (err) {
      logger.warn('Ad dedup cleanup error', { error: err.message });
    }
  }, 60 * 1000);
  if (adDedupCleanupTimer.unref) adDedupCleanupTimer.unref();
}

// ── Phase 42 — Direct offer expiration timer (every 30s) ─────
if (config.DIRECT_OFFERS && config.DIRECT_OFFERS.enabled) {
  const directOfferTimer = setInterval(async () => {
    try {
      const { cleanupExpired } = await import('./server/services/directOffer.js');
      const count = await cleanupExpired();
      if (count > 0) logger.info(`Direct offers: expired ${count} offer(s)`);
    } catch (err) {
      logger.warn('Direct offer cleanup error', { error: err.message });
    }
  }, config.DIRECT_OFFERS.cleanupIntervalMs || 30 * 1000);
  if (directOfferTimer.unref) directOfferTimer.unref();
}

// ── Activity Summary Timer (separate — checks every hour if weekly digest is due) ──
if (config.ACTIVITY_SUMMARY && config.ACTIVITY_SUMMARY.enabled) {
  const summaryTimer = setInterval(async () => {
    try {
      const { sendWeeklySummaries } = await import('./server/services/activitySummary.js');
      const sent = await sendWeeklySummaries();
      if (sent > 0) logger.info(`Activity summary: sent ${sent} digest(s)`);
    } catch (err) {
      logger.warn('Activity summary error', { error: err.message });
    }
  }, config.ACTIVITY_SUMMARY.intervalCheckMs);
  if (summaryTimer.unref) summaryTimer.unref();
}

// ── Monitoring Snapshot Timer (separate — captures metrics every hour) ──
if (config.MONITORING && config.MONITORING.enabled) {
  const monitorTimer = setInterval(async () => {
    try {
      const { captureSnapshot, checkThresholds } = await import('./server/services/monitor.js');
      const snapshot = await captureSnapshot();
      const alerts = checkThresholds(snapshot);
      if (alerts.length > 0) {
        logger.warn('Monitoring threshold violation(s)', { count: alerts.length, alerts: alerts.slice(0, 3) });
      }
    } catch (err) {
      logger.warn('Monitoring snapshot error', { error: err.message });
    }
  }, config.MONITORING.snapshotIntervalMs);
  if (monitorTimer.unref) monitorTimer.unref();
}

// ── Phase 50 — Export Registry Cleanup Timer ────────────────
if (config.EXPORTS && config.EXPORTS.enabled) {
  const exportCleanupTimer = setInterval(async () => {
    try {
      const { cleanupExpiredExports } = await import('./server/services/exportRegistry.js');
      const cleaned = await cleanupExpiredExports();
      if (cleaned > 0) logger.info(`Exports: cleaned ${cleaned} expired export(s)`);
    } catch (err) {
      logger.warn('Export registry cleanup error', { error: err.message });
    }
  }, config.EXPORTS.cleanupIntervalMs || (60 * 60 * 1000));
  if (exportCleanupTimer.unref) exportCleanupTimer.unref();
}

// ── Phase 59 — Storage Pressure Snapshot Cleanup Timer ──────
if (config.STORAGE_PRESSURE && config.STORAGE_PRESSURE.enabled) {
  const storagePressureCleanupTimer = setInterval(async () => {
    try {
      const { cleanupOldStoragePressureSnapshots } = await import('./server/services/storagePressure.js');
      const cleaned = await cleanupOldStoragePressureSnapshots();
      if (cleaned > 0) logger.info(`Storage pressure: cleaned ${cleaned} old snapshot(s)`);
    } catch (err) {
      logger.warn('Storage pressure cleanup error', { error: err.message });
    }
  }, 24 * 60 * 60 * 1000);
  if (storagePressureCleanupTimer.unref) storagePressureCleanupTimer.unref();
}

// ── Backup Scheduler Timer (separate — checks hourly if backup is due) ──
if (config.BACKUP && config.BACKUP.enabled) {
  const backupTimer = setInterval(async () => {
    try {
      const { checkAndRunBackup } = await import('./server/services/backupScheduler.js');
      await checkAndRunBackup();
    } catch (err) {
      logger.warn('Backup scheduler error', { error: err.message });
    }
  }, 60 * 60 * 1000); // Check every hour
  if (backupTimer.unref) backupTimer.unref();
}

// ── Phase 47 — Snooze Reminders Scanner (admin operations excellence) ──
if (config.ADMIN_OPERATIONS && config.ADMIN_OPERATIONS.snoozeReminderEnabled) {
  try {
    const snoozeReminders = await import('./server/services/snoozeReminders.js');
    snoozeReminders.start();
  } catch (err) {
    logger.warn('Phase 47: snoozeReminders start failed', { error: err.message });
  }
}

// ── Phase 48 — Audit Log Retention Scanner ──
if (config.AUDIT_RETENTION && config.AUDIT_RETENTION.enabled) {
  try {
    const auditRetention = await import('./server/services/auditLogRetention.js');
    auditRetention.start();
  } catch (err) {
    logger.warn('Phase 48: auditLogRetention start failed', { error: err.message });
  }
}

// ── Phase 49 — Multi-Channel Admin Alerting ──
// Register alert listeners before scheduled detection starts so the first emitted
// threshold event can be delivered through webhook/email if enabled.
if (config.ADMIN_ALERT_CHANNELS && config.ADMIN_ALERT_CHANNELS.enabled) {
  try {
    const alertChannels = await import('./server/services/adminAlertChannels.js');
    alertChannels.registerListeners();
  } catch (err) {
    logger.warn('Phase 49: adminAlertChannels register failed', { error: err.message });
  }
}

// ── Phase 54 — Incident Timeline Listeners ──────────────────
if (config.INCIDENT_TIMELINE && config.INCIDENT_TIMELINE.enabled) {
  try {
    const incidentTimeline = await import('./server/services/incidentTimeline.js');
    incidentTimeline.registerIncidentListeners();
    logger.info('Phase 54: incident timeline listeners registered');
  } catch (err) {
    logger.warn('Phase 54: incident timeline init failed', { error: err.message });
  }
}

// ── Phase 54/55 — Persistent Scheduler Registry ─────────────
// Phase 55 starts the scheduler registry runner for heavy/ops recurring jobs.
// Existing legacy timers remain as safety fallback, while queue idempotency keys
// prevent duplicate heavy execution during the transition period.
if (config.SCHEDULER_REGISTRY && config.SCHEDULER_REGISTRY.enabled) {
  try {
    const schedulerRegistry = await import('./server/services/schedulerRegistry.js');
    await schedulerRegistry.registerDefaultSchedulerJobs();
    schedulerRegistry.startSchedulerRegistry();
    logger.info('Phase 55: scheduler registry defaults registered and runner started');
  } catch (err) {
    logger.warn('Phase 55: scheduler registry start failed', { error: err.message });
  }
}

// ── Phase 52 — Persistent Ops Queue Workers ────────────────
if (config.OPS_QUEUE && config.OPS_QUEUE.enabled && config.OPS_QUEUE.workerEnabled) {
  try {
    const queueWorkers = await import('./server/services/queueWorkers.js');
    await queueWorkers.startQueueWorkers();
  } catch (err) {
    logger.warn('Phase 52/54: queueWorkers start failed', { error: err.message });
  }
}

// ── Phase 49 — Scheduled Abuse Detection Scanner ──
if (config.TRUST_ANALYTICS && config.TRUST_ANALYTICS.scheduledDetectionEnabled) {
  try {
    const scheduledDetection = await import('./server/services/scheduledAbuseDetection.js');
    scheduledDetection.start();
  } catch (err) {
    logger.warn('Phase 49: scheduledAbuseDetection start failed', { error: err.message });
  }
}

// ── Phase 51 — Scheduled Predictive Abuse Intelligence Scanner ──
const legacyPredictiveScanSchedulerEnabled = !!(
  config.PREDICTIVE_ABUSE &&
  config.PREDICTIVE_ABUSE.enabled &&
  config.PREDICTIVE_ABUSE.scheduledScanEnabled &&
  !(
    config.SCHEDULER_REGISTRY &&
    config.SCHEDULER_REGISTRY.enabled &&
    config.SCHEDULER_REGISTRY.jobs &&
    config.SCHEDULER_REGISTRY.jobs.predictive_scan &&
    config.SCHEDULER_REGISTRY.jobs.predictive_scan.enabled !== false
  )
);

if (legacyPredictiveScanSchedulerEnabled) {
  const predictiveScanTimer = setInterval(async () => {
    try {
      if (config.OPS_QUEUE && config.OPS_QUEUE.enabled) {
        const { enqueueJob } = await import('./server/services/opsQueue.js');
        const bucket = new Date().toISOString().slice(0, 16); // minute bucket
        const enqueueResult = await enqueueJob({
          type: 'predictive_scan',
          priority: 'normal',
          payload: { force: true, persist: true },
          idempotencyKey: `predictive_scan:scheduled:${bucket}`,
          createdBy: 'scheduler',
        });
        if (enqueueResult.ok && !enqueueResult.deduped) {
          logger.info('Phase 52: predictive abuse scan queued', { queueJobId: enqueueResult.job.id });
        }
      } else {
        const predictive = await import('./server/services/predictiveAbuse.js');
        const result = await predictive.runPredictiveScan({ persist: true });
        if (result && result.signalCount > 0) {
          logger.warn('Phase 51: predictive abuse scan detected signal(s)', {
            signalCount: result.signalCount,
            created: result.created || 0,
            updated: result.updated || 0,
          });
        }
      }
    } catch (err) {
      logger.warn('Phase 51/52: predictive abuse scan scheduling failed', {
        error: err && err.message ? err.message : String(err),
      });
    }
  }, config.PREDICTIVE_ABUSE.scanIntervalMs || (15 * 60 * 1000));
  if (predictiveScanTimer.unref) predictiveScanTimer.unref();

  logger.info('Phase 51: predictive abuse scanner scheduled', {
    intervalMs: config.PREDICTIVE_ABUSE.scanIntervalMs || (15 * 60 * 1000),
  });
}

// ── Phase 53 — Scheduled Trust Score V2 Snapshot Batch ──────
// Heavy-ish operation: never runs synchronously at startup.
// Prefer durable queue job when OPS_QUEUE is enabled; fallback direct batch is still
// batched/yielded inside trustCalibration.createSnapshotsForActiveUsers().
if (config.TRUST_CALIBRATION && config.TRUST_CALIBRATION.enabled && config.TRUST_CALIBRATION.scheduledSnapshotEnabled) {
  const trustSnapshotTimer = setInterval(async () => {
    try {
      const dateBucket = new Date().toISOString().slice(0, 10);

      if (config.OPS_QUEUE && config.OPS_QUEUE.enabled) {
        const { enqueueJob } = await import('./server/services/opsQueue.js');

        const enqueueResult = await enqueueJob({
          type: 'trust_snapshot_batch',
          priority: 'low',
          payload: {
            reason: 'scheduled',
            force: false,
          },
          idempotencyKey: `trust_snapshot_batch:scheduled:${dateBucket}`,
          createdBy: 'scheduler',
        });

        if (enqueueResult.ok && !enqueueResult.deduped) {
          logger.info('Phase 53: trust snapshot batch queued', {
            queueJobId: enqueueResult.job.id,
          });
        }
      } else {
        const { createSnapshotsForActiveUsers } = await import('./server/services/trustCalibration.js');
        const result = await createSnapshotsForActiveUsers({ reason: 'scheduled', force: false });
        if (result && (result.created || result.failed)) {
          logger.info('Phase 53: trust snapshot batch completed', {
            created: result.created || 0,
            deduped: result.deduped || 0,
            failed: result.failed || 0,
          });
        }
      }
    } catch (err) {
      logger.warn('Phase 53: trust snapshot scheduling failed', {
        error: err && err.message ? err.message : String(err),
      });
    }
  }, config.TRUST_CALIBRATION.snapshotIntervalMs || (24 * 60 * 60 * 1000));
  if (trustSnapshotTimer.unref) trustSnapshotTimer.unref();

  logger.info('Phase 53: trust calibration snapshot scheduler started', {
    intervalMs: config.TRUST_CALIBRATION.snapshotIntervalMs || (24 * 60 * 60 * 1000),
  });
}

// ── Phase 53 — Predictive Signal Retention Scheduler ────────
// Service is dynamically imported so deployments can disable this config safely.
// Batch service is added in Phase 53 predictive hygiene step.
if (config.PREDICTIVE_SIGNAL_RETENTION && config.PREDICTIVE_SIGNAL_RETENTION.enabled) {
  const predictiveRetentionTimer = setInterval(async () => {
    try {
      const dateBucket = new Date().toISOString().slice(0, 10);

      if (config.OPS_QUEUE && config.OPS_QUEUE.enabled) {
        const { enqueueJob } = await import('./server/services/opsQueue.js');

        const enqueueResult = await enqueueJob({
          type: 'predictive_signal_retention',
          priority: 'low',
          payload: {
            options: { reason: 'scheduled' },
          },
          idempotencyKey: `predictive_signal_retention:scheduled:${dateBucket}`,
          createdBy: 'scheduler',
        });

        if (enqueueResult.ok && !enqueueResult.deduped) {
          logger.info('Phase 53: predictive signal retention queued', {
            queueJobId: enqueueResult.job.id,
          });
        }
      } else {
        const { runPredictiveSignalRetention } = await import('./server/services/predictiveSignalRetention.js');
        const result = await runPredictiveSignalRetention({ reason: 'scheduled' });
        if (result && result.archived > 0) {
          logger.info('Phase 53: predictive signal retention completed', {
            archived: result.archived,
          });
        }
      }
    } catch (err) {
      // The service is added in the predictive hygiene batch. Until then this is non-fatal.
      logger.warn('Phase 53: predictive signal retention scheduling failed', {
        error: err && err.message ? err.message : String(err),
      });
    }
  }, config.PREDICTIVE_SIGNAL_RETENTION.cleanupIntervalMs || (24 * 60 * 60 * 1000));
  if (predictiveRetentionTimer.unref) predictiveRetentionTimer.unref();

  logger.info('Phase 53: predictive signal retention scheduler started', {
    intervalMs: config.PREDICTIVE_SIGNAL_RETENTION.cleanupIntervalMs || (24 * 60 * 60 * 1000),
  });
}

// ── Phase 45 — Counter File Startup Integrity Check + Scheduled Rebuild ──
if (config.COUNTERS && config.COUNTERS.enabled) {
  // Startup integrity check (fire-and-forget — non-blocking)
  (async () => {
    try {
      const counters = await import('./server/services/directOfferCounters.js');
      const c = await counters.readCounters();
      const lastUpdateMs = c.lastUpdatedAt ? new Date(c.lastUpdatedAt).getTime() : 0;
      const totalOffers = c.platform?.total || 0;
      const maxAge = config.COUNTERS.startupRebuildMaxAgeMs || (24 * 60 * 60 * 1000);

      // Trigger rebuild if file is stale AND offers exist (empty system = healthy)
      if (totalOffers > 0 && lastUpdateMs > 0) {
        const ageMs = Date.now() - lastUpdateMs;
        if (ageMs > maxAge) {
          logger.warn('Startup: counter file stale — triggering rebuild', { ageHours: Math.round(ageMs / 3600000) });
          counters.rebuildCounters().catch(err => {
            logger.error('Startup rebuild failed', { error: err.message });
          });
        }
      } else if (totalOffers === 0 && lastUpdateMs === 0) {
        logger.info('Startup: counter file empty — no rebuild needed');
      }
    } catch (err) {
      // Counter file corrupt or missing — trigger rebuild
      logger.warn('Startup: counter file integrity check failed — triggering rebuild', { error: err.message });
      try {
        const counters = await import('./server/services/directOfferCounters.js');
        counters.rebuildCounters().catch(() => {});
      } catch (_) { /* non-fatal */ }
    }
  })();

  // Scheduled rebuild every 24h (defense in depth against drift)
  const rebuildIntervalMs = config.COUNTERS.rebuildIntervalMs || (24 * 60 * 60 * 1000);
  const counterRebuildTimer = setInterval(async () => {
    try {
      const counters = await import('./server/services/directOfferCounters.js');
      const result = await counters.rebuildCounters();
      if (!result.skipped) {
        logger.info('Counters: scheduled rebuild complete', result);
      }
    } catch (err) {
      logger.error('Counters: scheduled rebuild failed', { error: err.message });
    }
  }, rebuildIntervalMs);
  if (counterRebuildTimer.unref) counterRebuildTimer.unref();
}

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  logger.info(`🟢 يوميّة — ${config.BRAND.tagline}`);
  logger.info(`   Server: http://${HOST}:${PORT}`);
  logger.info(`   Health: http://localhost:${PORT}/api/health`);
  logger.info(`   Config: http://localhost:${PORT}/api/config`);
});

// ── Graceful shutdown ─────────────────────────────────────────
async function gracefulShutdown(signal) {
  logger.info(`🔴 ${signal} received — shutting down gracefully...`);

  // 1. Stop accepting new connections
  server.close(() => {});

  // 2. Phase 52: Stop queue workers and drain active jobs briefly.
  try {
    const queueWorkers = await import('./server/services/queueWorkers.js');
    await queueWorkers.stopQueueWorkers({ drainMs: 5000 });
  } catch (err) {
    logger.warn('Phase 52/54: queueWorkers stop failed during shutdown', { error: err && err.message ? err.message : String(err) });
  }

  // 2b. Phase 54: Stop scheduler registry timer if it was started.
  try {
    const schedulerRegistry = await import('./server/services/schedulerRegistry.js');
    schedulerRegistry.stopSchedulerRegistry();
  } catch (err) {
    logger.warn('Phase 54: schedulerRegistry stop failed during shutdown', { error: err && err.message ? err.message : String(err) });
  }

  // 3. Phase 46: Flush counter batch + cache debouncer BEFORE SSE broadcast.
  //    Prevents data loss for events still in in-memory queues.
  try {
    const counters = await import('./server/services/directOfferCounters.js');
    await counters.forceFlush();
  } catch (err) {
    logger.warn('Phase 46: forceFlush failed during shutdown', { error: err && err.message ? err.message : String(err) });
  }

  try {
    const debouncer = await import('./server/services/cacheDebouncer.js');
    debouncer.flushPending();
  } catch (err) {
    logger.warn('Phase 46: flushPending failed during shutdown', { error: err && err.message ? err.message : String(err) });
  }

  // 3. Broadcast SSE shutdown event (fire-and-forget)
  try {
    const { broadcast } = await import('./server/services/sseManager.js');
    broadcast('shutdown', { reason: 'server_restart', message: 'السيرفر هيعيد التشغيل — هتتوصل تاني تلقائياً' });
  } catch (_) { /* SSE broadcast failure is non-fatal */ }

  // 4. Wait 1 second for pending writes to complete
  setTimeout(() => {
    logger.info('🔴 Shutdown complete');
    process.exit(0);
  }, 1000);

  // 5. Force exit after 10 seconds as safety net
  setTimeout(() => {
    logger.warn('🔴 Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── Export for testing ────────────────────────────────────────
export { server, PORT, HOST };
```

---

## `server/router.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// server/router.js — Central Route Registry
// ═══════════════════════════════════════════════════════════════

import config from '../config.js';
import { isValidId } from './services/database.js';
import { requireAuth, requireRole, requireAdmin, requireCapability } from './middleware/auth.js';
import { handleSendOtp, handleVerifyOtp, handleGetMe, handleUpdateProfile, handleLogout, handleLogoutAll, handleAcceptTerms, handleDeleteAccount } from './handlers/authHandler.js';
import { handleCreateJob, handleListJobs, handleGetJob, handleStartJob, handleCompleteJob, handleCancelJob, handleListMyJobs, handleNearbyJobs, handleRenewJob, handleDuplicateJob } from './handlers/jobsHandler.js';
import { handleApplyToJob, handleAcceptWorker, handleRejectWorker, handleListJobApplications, handleListMyApplications, handleWithdrawApplication, handleWorkerConfirm, handleWorkerDecline } from './handlers/applicationsHandler.js';
import {
  handleAdminStats,
  handleAdminUsers,
  handleAdminJobs,
  handleAdminUpdateUserStatus,
  handleAdminDirectOffersDashboard,
  handleAdminDirectOffersFunnel,
  handleAdminDeclineReasons,
  handleAdminAbuseSignals,
  handleAdminFlagReviewHistory,
  handleAdminFlagReview,
  handleSendAbuseWarning,
  // Phase 47 — Admin Operations Excellence
  handleAdminListFlagsByStatus,
  handleAdminSearchFlagsByNotes,
  handleAdminBulkFlagAction,
  handleAdminSnoozeExpiring,
  handleAdminUserWarningsRemaining,
  handleAdminAuditLogSearch,
  handleAdminAuditLogExport,
  // Phase 49 — Marketplace Trust Analytics + Admin Alerting
  handleAdminTrustResolutionTime,
  handleAdminTrustWarningConversion,
  handleAdminTrustPerAdmin,
  handleAdminTrustAbuseTrend,
  handleAdminTrustDashboard,
  handleAdminTestWebhook,
  // Phase 50 — Scale & Search Hygiene
  handleAdminAuditIndexStatus,
  handleAdminAuditIndexRebuild,
  handleAdminAuditIndexVerify,
  handleAdminListExports,
  handleAdminGetExport,
  handleAdminDownloadExport,
  handleAdminCancelExport,
  handleAdminCounterHygiene,
  handleAdminCompactCounters,
  handleAdminRebuildCounters,
  // Phase 51 — Predictive Trust Intelligence
  handleAdminPredictiveAbuseDashboard,
  handleAdminPredictiveAbuseSignals,
  handleAdminRunPredictiveAbuseScan,
  handleAdminDismissPredictiveSignal,
  handleAdminEscalatePredictiveSignal,
  handleAdminUserTrustV2,
  handleAdminTrustDecisionQuality,
  handleAdminTrustBacklogPriority,
} from './handlers/adminHandler.js';
import { handleAdminEventStream } from './handlers/adminSseHandler.js';
import {
  handleAdminTrustCalibrationDashboard,
  handleAdminTrustSnapshots,
  handleAdminRunTrustSnapshotBatch,
  handleAdminRunTrustCalibrationReport,
  handleAdminPredictivePrecision,
  handleAdminRunPredictiveSignalRetention,
  handleAdminMarkPredictiveFalsePositive,
  handleAdminMarkPredictiveConfirmed,
} from './handlers/trustCalibrationHandler.js';
import {
  handleAdminQueueStats,
  handleAdminQueueJobs,
  handleAdminQueueJobDetail,
  handleAdminRetryQueueJob,
  handleAdminCancelQueueJob,
  handleAdminDeadLetterJobs,
  handleAdminRetryDeadLetterJob,
  handleAdminAlertDeliveries,
  handleAdminAlertDeliveryDetail,
  handleAdminRetryAlertDelivery,
  handleAdminAlertDeliveryHealth,
  handleAdminCreateAuditExportJob,
} from './handlers/queueHandler.js';
import {
  handleProductionReadiness,
  handleDeploymentGate,
  handleSchedulerCadence,
  handleOpsReview,
  handleInstanceMode,
  handleProcessLocks,
  handleReleaseProcessLock,
  handleListSchedulers,
  handleGetScheduler,
  handleRunSchedulerNow,
  handleEnableScheduler,
  handleDisableScheduler,
  handleOpsRollups,
  handleOpsSlo,
  handleListIncidents,
  handleGetIncident,
  handleResolveIncident,
  handleRunBackupRestoreDrill,
  handleListBackupRestoreDrills,
  handleGetBackupRestoreDrill,
  handleGetMaintenanceMode,
  handleEnableMaintenanceMode,
  handleDisableMaintenanceMode,
} from './handlers/productionOpsHandler.js';
import {
  handleScaleHygieneOverview,
  handleQueueHealth,
  handleQueueVerify,
  handleQueueCompact,
  handleQueueRepair,
  handleWorkroomHygieneOverview,
  handleWorkroomCompact,
  handleWorkroomVerifyIndexes,
  handleWorkroomCleanupAttachments,
  handleTrustRollups,
  handleRunTrustRollup,
  handlePredictiveArchiveIndexStatus,
  handleRebuildPredictiveArchiveIndex,
  handleSchedulerHistory,
} from './handlers/scaleHygieneHandler.js';
import {
  handleGetStoragePressure,
  handleCaptureStoragePressure,
  handleListStoragePressureSnapshots,
  handleGetScaleThresholds,
  handleVerifyScaleThresholds,
  handleExternalizationReadiness,
  handleMultiInstanceBoundary,
} from './handlers/storagePressureHandler.js';
import {
  handleGetExternalizationDecision,
  handleCaptureExternalizationDecision,
  handleListExternalizationDecisionSnapshots,
  handleValidateMigrationSnapshot,
  handleRunMigrationRehearsal,
  handleBenchmarkHistory,
} from './handlers/externalizationDecisionHandler.js';
import {
  handleGetPhase61Evidence,
  handleCapturePhase61Evidence,
  handleListPhase61EvidenceSnapshots,
  handleGetPilotDecisionGate,
  handleCapturePilotDecisionGate,
  handleRunRollbackRehearsal,
  handleListRollbackRehearsals,
  handleGetRollbackRehearsal,
  handleRepositoryContracts,
} from './handlers/phase61Handler.js';
import {
  handleMarketplaceIntelligenceDashboard,
  handleSearchAnalytics,
  handleZeroResultSearches,
  handleActivationFunnel,
  handleNotificationConversions,
  handleWorkroomAdoption,
  handlePaymentDisputeAnalytics,
  handleMatchingQuality,
  handleRunMarketplaceIntelligenceRollup,
} from './handlers/marketplaceIntelligenceHandler.js';
import {
  handleAdminRbacMatrix,
  handleAdminRbacMe,
  handleListApprovals,
  handleCreateApproval,
  handleApproveApproval,
  handleRejectApproval,
  handleListPrivacyRequests,
  handleCreatePrivacyRequest,
  handleGetPrivacyRequest,
  handleQueuePrivacyExport,
  handleQueuePrivacyAnonymize,
  handlePreviewPrivacyAnonymize,
  handleCancelPrivacyRequest,
  handleListOpsReviews,
  handleCreateOpsReview,
  handleGetOpsReview,
  handleCompleteOpsReview,
  handleGetIncidentPostmortem,
  handleCreateIncidentPostmortem,
  handleUpdatePostmortem,
  handleListPostmortems,
} from './handlers/governanceHandler.js';
import { handleListNotifications, handleMarkAsRead, handleMarkAllAsRead, handleNotificationActionClick } from './handlers/notificationsHandler.js';
import { handleSubmitRating, handleListJobRatings, handleListUserRatings, handleUserRatingSummary, handleGetPendingRatings } from './handlers/ratingsHandler.js';
import { handleCreatePayment, handleConfirmPayment, handleAdminCompletePayment, handleDisputePayment, handleGetJobPayment, handleAdminFinancialSummary } from './handlers/paymentsHandler.js';
import { handleCreateReport, handleAdminListReports, handleAdminReviewReport, handleGetTrustScore, handleGetTrustScoreV2 } from './handlers/reportsHandler.js';
import { handleSubmitVerification, handleGetVerificationStatus, handleGetPublicProfile, handleAdminListVerifications, handleAdminReviewVerification } from './handlers/verificationHandler.js';
import { handleNotificationStream } from './handlers/sseHandler.js';
import { handleGetProfileTasks, handleProfileTaskClick } from './handlers/profileTasksHandler.js';
import { handleCheckIn, handleCheckOut, handleConfirmAttendance, handleReportNoShow, handleEmployerCheckIn, handleListJobAttendance, handleJobAttendanceSummary } from './handlers/attendanceHandler.js';
import { handleSendMessage, handleBroadcastMessage, handleListJobMessages, handleGetUnreadCount, handleMarkMessageRead, handleMarkAllJobMessagesRead } from './handlers/messagesHandler.js';
import { handlePushSubscribe, handlePushUnsubscribe } from './handlers/pushHandler.js';
import { handleCreateAlert, handleListMyAlerts, handleDeleteAlert, handleToggleAlert } from './handlers/alertsHandler.js';
import { handleAddFavorite, handleRemoveFavorite, handleListFavorites, handleCheckFavorite } from './handlers/favoritesHandler.js';
import { handleEmployerAnalytics, handleWorkerAnalytics, handlePlatformAnalytics, handleExportPayments, handleExportJobs, handleExportUsers, handleEmployerExportPayments, handleGetReceipt, handleGetMonitoring, handleGetLatestSnapshot, handleGetErrors } from './handlers/analyticsHandler.js';
import { handleGetImage } from './handlers/imageHandler.js';
import { handleHeartbeat, handleOnlineCount } from './handlers/presenceHandler.js';
import { handleCreateWindow, handleListWindows, handleDeleteWindow } from './handlers/availabilityHandler.js';
import { handleLiveFeedStream, handleInstantAccept } from './handlers/liveFeedHandler.js';
import { handleCreateAd, handleListMyAds, handleWithdrawAd, handleGetAd, handleAdStats } from './handlers/availabilityAdHandler.js';
import { handleDiscoverWorkers, handleGetWorkerCard, handleQuickOffer } from './handlers/workerDiscoveryHandler.js';
import {
  handleListWorkrooms,
  handleGetWorkroom,
  handleListWorkroomMessages,
  handleSendWorkroomMessage,
  handleMarkWorkroomRead,
  handleGetWorkroomTimeline,
  handleSearchWorkroomMessages,
  handleGetWorkroomReadReceipts,
  handleMarkWorkroomMessageRead,
  handleListWorkroomPins,
  handlePinWorkroomMessage,
  handleUnpinWorkroomMessage,
  handleGetWorkroomChecklist,
  handleCreateWorkroomChecklistItem,
  handleUpdateWorkroomChecklistItem,
  handleDeleteWorkroomChecklistItem,
  handleUploadWorkroomAttachment,
  handleGetWorkroomSummary,
} from './handlers/workroomHandler.js';
import { handleCreateOffer, handleAcceptOffer, handleDeclineOffer, handleWithdrawOffer, handleListMyOffers, handleGetOffer, handleEmployerOfferStats, handleWorkerOfferStats } from './handlers/directOfferHandler.js';
import { setupNotificationListeners } from './services/notifications.js';
import { logger } from './services/logger.js';
import { listActions } from './services/auditLog.js';
import { eventBus } from './services/eventBus.js';
import { clearAnalyticsCache } from './services/analytics.js';
import { clearCache as clearDirectOfferAnalyticsCache } from './services/directOfferAnalytics.js';
import * as directOfferCounters from './services/directOfferCounters.js';
import { debouncedClear } from './services/cacheDebouncer.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Route definition format:
 * { method, path, middlewares: [...], handler }
 *
 * Path supports :param patterns (e.g., /api/jobs/:id)
 */
const routes = [
  // ── Public Routes ──
  {
    method: 'GET', path: '/api/health', middlewares: [],
    handler: async (req, res) => {
      const mem = process.memoryUsage();
      const response = {
        status: 'ok',
        brand: config.BRAND.name,
        version: '0.57.0',
        environment: config.ENV ? config.ENV.current : 'development',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
          heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
          heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
          rssMB: +(mem.rss / 1048576).toFixed(1),
        },
        node: process.version,
      };
      // SSE connection stats (non-blocking)
      try {
        const { getStats } = await import('./services/sseManager.js');
        const sseStats = getStats();
        response.connections = { sse: sseStats.totalConnections, sseUsers: sseStats.totalUsers };
      } catch (_) {
        response.connections = { sse: 0, sseUsers: 0 };
      }
      // Active lock count (non-blocking)
      try {
        const { getLockCount } = await import('./services/resourceLock.js');
        response.locks = { active: getLockCount() };
      } catch (_) {
        response.locks = { active: 0 };
      }
      // Cache stats (non-blocking)
      try {
        const { stats: cacheStats } = await import('./services/cache.js');
        response.cache = cacheStats();
      } catch (_) {
        response.cache = { hits: 0, misses: 0, size: 0, hitRate: '0%' };
      }
      // Request metrics (non-blocking)
      try {
        const { getMetrics } = await import('./middleware/timing.js');
        response.requestMetrics = getMetrics();
      } catch (_) {
        response.requestMetrics = { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, errorRate: '0%' };
      }
      // Index health (non-blocking)
      try {
        const { getHealthStatus } = await import('./services/indexHealth.js');
        response.indexHealth = getHealthStatus();
      } catch (_) {
        response.indexHealth = { lastCheck: null, status: 'unknown', warnings: 0 };
      }
      // Search index stats (non-blocking)
      try {
        const { getStats: searchIndexStats } = await import('./services/searchIndex.js');
        response.searchIndex = searchIndexStats();
      } catch (_) {
        response.searchIndex = { size: 0, lastBuilt: null };
      }
      // Phase 50 — Audit index stats (non-blocking)
      try {
        const { getAuditIndexStats } = await import('./services/auditLogIndex.js');
        response.auditIndex = await getAuditIndexStats();
      } catch (_) {
        response.auditIndex = { enabled: false, status: 'unknown', recordCount: 0, lastBuiltAt: null, stale: false };
      }
      // Phase 40 — Presence stats (non-blocking)
      try {
        const { getStats: presenceStats } = await import('./services/presenceService.js');
        response.presence = presenceStats();
      } catch (_) {
        response.presence = { online: 0, away: 0, offline: 0, total: 0 };
      }
      // Phase 40 — Instant match stats (non-blocking)
      try {
        const { getStats: instantMatchStats } = await import('./services/instantMatch.js');
        response.instantMatch = await instantMatchStats();
      } catch (_) {
        response.instantMatch = { activeAttempts: 0, successRateLastHour: 0 };
      }
      // Phase 40 — Live feed stats (non-blocking)
      try {
        const { getStats: liveFeedStats } = await import('./services/liveFeed.js');
        response.liveFeed = liveFeedStats();
      } catch (_) {
        response.liveFeed = { connections: 0, users: 0 };
      }
      // Phase 41 — Availability ads stats (non-blocking)
      try {
        const { getStats: adStats } = await import('./services/availabilityAd.js');
        response.availabilityAds = await adStats();
      } catch (_) {
        response.availabilityAds = { active: 0, totalToday: 0, expiredLastHour: 0, withdrawnLastHour: 0 };
      }
      // Phase 41 — Worker discovery stats (non-blocking)
      try {
        const { getStats: discoveryStats } = await import('./services/workerDiscovery.js');
        response.workerDiscovery = discoveryStats();
      } catch (_) {
        response.workerDiscovery = { tilesCached: 0, totalCachedItems: 0, cardsCached: 0 };
      }
      // Phase 42 — Direct offers stats (non-blocking)
      try {
        const { getStats: offerStats } = await import('./services/directOffer.js');
        response.directOffers = await offerStats();
      } catch (_) {
        response.directOffers = { activePending: 0, expiredLastHour: 0, acceptedLastHour: 0, declinedLastHour: 0 };
      }
      // Phase 50 — Export registry stats (non-blocking)
      try {
        const { getStats: exportStats } = await import('./services/exportRegistry.js');
        response.exports = exportStats();
      } catch (_) {
        response.exports = { enabled: false };
      }

      // Phase 52 — Ops queue stats (non-blocking)
      try {
        const { getQueueStats } = await import('./services/opsQueue.js');
        response.opsQueue = await getQueueStats();
      } catch (_) {
        response.opsQueue = { enabled: false, status: 'unknown' };
      }

      // Phase 52 — Alert delivery stats (non-blocking)
      try {
        const { getAlertDeliveryStats } = await import('./services/alertDeliveryHistory.js');
        response.alertDeliveries = await getAlertDeliveryStats();
      } catch (_) {
        response.alertDeliveries = { enabled: false, status: 'unknown' };
      }

      // Phase 54 — Instance mode visibility (non-blocking)
      try {
        const { getInstanceInfo } = await import('./services/instanceMode.js');
        response.instanceMode = getInstanceInfo();
      } catch (_) {
        response.instanceMode = { enabled: false, mode: 'unknown', warnings: [] };
      }

      // Phase 54 — Process locks visibility (non-blocking)
      try {
        const { listProcessLocks } = await import('./services/processLock.js');
        const locks = await listProcessLocks();
        response.processLocks = {
          total: locks.length,
          stale: locks.filter(l => l.stale).length,
          locks: locks.slice(0, 5).map(l => ({
            lockName: l.lockName,
            ownerId: l.ownerId,
            stale: !!l.stale,
            heartbeatAt: l.heartbeatAt || null,
            expiresAt: l.expiresAt || null,
          })),
        };
      } catch (_) {
        response.processLocks = { total: 0, stale: 0, locks: [] };
      }

      // Phase 54 — Scheduler registry visibility (non-blocking)
      try {
        const { listSchedulerJobs } = await import('./services/schedulerRegistry.js');
        const schedulers = await listSchedulerJobs();
        const staleMs = (config.OPS_METRICS_ROLLUPS && config.OPS_METRICS_ROLLUPS.slo && config.OPS_METRICS_ROLLUPS.slo.schedulerStaleWarningMs) || (2 * 60 * 60 * 1000);
        response.schedulers = {
          total: schedulers.length,
          enabled: schedulers.filter(s => s.enabled).length,
          failed: schedulers.filter(s => s.lastStatus === 'failed').length,
          stale: schedulers.filter(s => s.enabled && s.nextRunAt && (Date.now() - new Date(s.nextRunAt).getTime()) > staleMs).length,
        };
      } catch (_) {
        response.schedulers = { total: 0, enabled: 0, failed: 0, stale: 0 };
      }

      // Phase 54 — Latest ops rollup + SLO (non-blocking)
      try {
        const { computeOpsSlo } = await import('./services/metricsRollups.js');
        response.opsSlo = await computeOpsSlo();
      } catch (_) {
        response.opsSlo = { status: 'unknown', violations: [] };
      }

      // Phase 54 — Latest backup restore drill (non-blocking)
      try {
        const { listRestoreDrills } = await import('./services/backupRestoreDrill.js');
        const drills = await listRestoreDrills({ limit: 1 });
        response.backupRestoreDrill = {
          latest: drills.drills && drills.drills.length > 0 ? {
            id: drills.drills[0].id,
            status: drills.drills[0].status,
            completedAt: drills.drills[0].completedAt || null,
            durationMs: drills.drills[0].durationMs || 0,
            errorCount: Array.isArray(drills.drills[0].errors) ? drills.drills[0].errors.length : 0,
          } : null,
        };
      } catch (_) {
        response.backupRestoreDrill = { latest: null };
      }

      // Phase 51 — Predictive abuse stats (non-blocking)
      try {
        const { getPredictiveStats } = await import('./services/predictiveAbuse.js');
        response.predictiveAbuse = await getPredictiveStats();
      } catch (_) {
        response.predictiveAbuse = { enabled: false, totalSignals: 0, activeSignals: 0 };
      }

      // Phase 51 — Workroom stats (non-blocking)
      try {
        const { getWorkroomStats } = await import('./services/workroom.js');
        response.workrooms = await getWorkroomStats();
      } catch (_) {
        response.workrooms = { enabled: false, totalWorkrooms: 0 };
      }

      // Phase 51 — Trust Score V2 config visibility (non-blocking)
      response.trustScoreV2 = {
        enabled: !!(config.TRUST_SCORE_V2 && config.TRUST_SCORE_V2.enabled),
      };

      // Phase 45 — Counter file integrity + Phase 46 — File size monitoring (non-blocking)
      try {
        const counters = await directOfferCounters.readCounters();
        const now = Date.now();
        const lastUpdateMs = counters.lastUpdatedAt ? new Date(counters.lastUpdatedAt).getTime() : 0;
        const ageMs = lastUpdateMs > 0 ? (now - lastUpdateMs) : null;
        const totalOffers = counters.platform?.total || 0;
        const maxAge = (config.COUNTERS && config.COUNTERS.startupRebuildMaxAgeMs) || (24 * 60 * 60 * 1000);
        let status = 'healthy';
        if (totalOffers === 0 && lastUpdateMs === 0) {
          status = 'empty';
        } else if (ageMs !== null && ageMs > maxAge) {
          status = 'stale';
        }

        // Phase 46: counter file size visibility
        let fileSizeBytes = 0;
        try {
          fileSizeBytes = await directOfferCounters.getFileSize();
        } catch (_) { /* non-fatal */ }

        response.counters = {
          lastUpdatedAt: counters.lastUpdatedAt,
          lastRebuildAt: counters.lastRebuildAt,
          totalOffers,
          hourlyBucketsCount: Object.keys(counters.hourlyBuckets || {}).length,
          fileSizeBytes, // Phase 46
          status,
        };
      } catch (_) {
        response.counters = { lastUpdatedAt: null, lastRebuildAt: null, totalOffers: 0, hourlyBucketsCount: 0, fileSizeBytes: 0, status: 'corrupt' };
      }
      sendJSON(res, 200, response);
    },
  },
  {
    method: 'GET', path: '/api/config', middlewares: [],
    handler: (req, res) => {
      sendJSON(res, 200, {
        BRAND: config.BRAND,
        META: config.META,
        LABOR_CATEGORIES: config.LABOR_CATEGORIES,
        REGIONS: config.REGIONS,
        RATINGS: config.RATINGS,
        FINANCIALS: {
          platformFeePercent: config.FINANCIALS.platformFeePercent,
          minDailyWage: config.FINANCIALS.minDailyWage,
          maxDailyWage: config.FINANCIALS.maxDailyWage,
          compensationEnabled: config.FINANCIALS.compensationEnabled,
          paymentMethods: config.FINANCIALS.paymentMethods,
        },
        WEB_PUSH: {
          vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
        },
      });
    },
  },
  {
    method: 'GET', path: '/api/docs', middlewares: [],
    handler: (req, res) => {
      const docs = routes.map(r => ({
        method: r.method,
        path: r.path,
        auth: r.middlewares.some(m => m === requireAuth) ? 'required' : 'none',
        admin: r.middlewares.some(m => m === requireAdmin) ? true : false,
      }));
      sendJSON(res, 200, { ok: true, routes: docs, total: docs.length, version: '0.57.0' });
    },
  },

  // ── Auth Routes (Public) ──
  { method: 'POST', path: '/api/auth/send-otp', middlewares: [], handler: handleSendOtp },
  { method: 'POST', path: '/api/auth/verify-otp', middlewares: [], handler: handleVerifyOtp },

  // ── Auth Routes (Protected) ──
  { method: 'GET', path: '/api/auth/me', middlewares: [requireAuth], handler: handleGetMe },
  { method: 'PUT', path: '/api/auth/profile', middlewares: [requireAuth], handler: handleUpdateProfile },
  { method: 'GET', path: '/api/profile/tasks', middlewares: [requireAuth], handler: handleGetProfileTasks },
  { method: 'POST', path: '/api/profile/tasks/:id/click', middlewares: [requireAuth], handler: handleProfileTaskClick },
  { method: 'POST', path: '/api/auth/logout', middlewares: [requireAuth], handler: handleLogout },
  { method: 'POST', path: '/api/auth/logout-all', middlewares: [requireAuth], handler: handleLogoutAll },
  { method: 'POST', path: '/api/auth/accept-terms', middlewares: [requireAuth], handler: handleAcceptTerms },
  { method: 'DELETE', path: '/api/auth/account', middlewares: [requireAuth], handler: handleDeleteAccount },
  { method: 'POST', path: '/api/auth/verify-identity', middlewares: [requireAuth], handler: handleSubmitVerification },
  { method: 'GET', path: '/api/auth/verification-status', middlewares: [requireAuth], handler: handleGetVerificationStatus },

  // ── Analytics Routes ──
  { method: 'GET', path: '/api/analytics/employer', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerAnalytics },
  { method: 'GET', path: '/api/analytics/worker', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerAnalytics },

  // ── Employer Export Routes ──
  { method: 'GET', path: '/api/employer/export/payments', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerExportPayments },

  // ── Job Routes ──
  { method: 'POST', path: '/api/jobs', middlewares: [requireAuth, requireRole('employer')], handler: handleCreateJob },
  { method: 'GET', path: '/api/jobs', middlewares: [], handler: handleListJobs },
  { method: 'GET', path: '/api/jobs/mine', middlewares: [requireAuth, requireRole('employer')], handler: handleListMyJobs },
  { method: 'GET', path: '/api/jobs/nearby', middlewares: [requireAuth, requireRole('worker')], handler: handleNearbyJobs },
  { method: 'GET', path: '/api/jobs/live-feed', middlewares: [], handler: handleLiveFeedStream },
  { method: 'GET', path: '/api/jobs/:id', middlewares: [], handler: handleGetJob },
  { method: 'GET', path: '/api/jobs/:id/applications', middlewares: [requireAuth, requireRole('employer')], handler: handleListJobApplications },
  { method: 'POST', path: '/api/jobs/:id/apply', middlewares: [requireAuth, requireRole('worker')], handler: handleApplyToJob },
  { method: 'POST', path: '/api/jobs/:id/accept', middlewares: [requireAuth, requireRole('employer')], handler: handleAcceptWorker },
  { method: 'POST', path: '/api/jobs/:id/reject', middlewares: [requireAuth, requireRole('employer')], handler: handleRejectWorker },
  { method: 'POST', path: '/api/jobs/:id/start', middlewares: [requireAuth, requireRole('employer')], handler: handleStartJob },
  { method: 'POST', path: '/api/jobs/:id/complete', middlewares: [requireAuth, requireRole('employer')], handler: handleCompleteJob },
  { method: 'POST', path: '/api/jobs/:id/cancel', middlewares: [requireAuth, requireRole('employer')], handler: handleCancelJob },
  { method: 'POST', path: '/api/jobs/:id/renew', middlewares: [requireAuth, requireRole('employer')], handler: handleRenewJob },
  { method: 'POST', path: '/api/jobs/:id/duplicate', middlewares: [requireAuth, requireRole('employer')], handler: handleDuplicateJob },

  // ── Messaging Routes ──
  { method: 'POST', path: '/api/jobs/:id/messages/broadcast', middlewares: [requireAuth, requireRole('employer')], handler: handleBroadcastMessage },
  { method: 'POST', path: '/api/jobs/:id/messages/read-all', middlewares: [requireAuth], handler: handleMarkAllJobMessagesRead },
  { method: 'GET', path: '/api/jobs/:id/messages', middlewares: [requireAuth], handler: handleListJobMessages },
  { method: 'POST', path: '/api/jobs/:id/messages', middlewares: [requireAuth], handler: handleSendMessage },

  // ── Attendance Routes ──
  { method: 'POST', path: '/api/jobs/:id/checkin', middlewares: [requireAuth, requireRole('worker')], handler: handleCheckIn },
  { method: 'POST', path: '/api/jobs/:id/checkout', middlewares: [requireAuth, requireRole('worker')], handler: handleCheckOut },
  { method: 'POST', path: '/api/jobs/:id/no-show', middlewares: [requireAuth, requireRole('employer')], handler: handleReportNoShow },
  { method: 'POST', path: '/api/jobs/:id/manual-checkin', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerCheckIn },
  { method: 'GET', path: '/api/jobs/:id/attendance/summary', middlewares: [requireAuth], handler: handleJobAttendanceSummary },
  { method: 'GET', path: '/api/jobs/:id/attendance', middlewares: [requireAuth], handler: handleListJobAttendance },
  { method: 'POST', path: '/api/attendance/:id/confirm', middlewares: [requireAuth, requireRole('employer')], handler: handleConfirmAttendance },

  // ── Rating Routes ──
  { method: 'POST', path: '/api/jobs/:id/rate', middlewares: [requireAuth], handler: handleSubmitRating },
  { method: 'GET', path: '/api/jobs/:id/ratings', middlewares: [], handler: handleListJobRatings },
  { method: 'GET', path: '/api/users/:id/ratings', middlewares: [], handler: handleListUserRatings },
  { method: 'GET', path: '/api/users/:id/rating-summary', middlewares: [], handler: handleUserRatingSummary },
  { method: 'GET', path: '/api/users/:id/trust-score', middlewares: [], handler: handleGetTrustScore },
  { method: 'GET', path: '/api/users/:id/trust-v2', middlewares: [], handler: handleGetTrustScoreV2 },
  { method: 'GET', path: '/api/users/:id/public-profile', middlewares: [], handler: handleGetPublicProfile },

  // ── Report Routes ──
  { method: 'POST', path: '/api/reports', middlewares: [requireAuth], handler: handleCreateReport },

  // ── Notification Routes ──
  { method: 'GET', path: '/api/notifications', middlewares: [requireAuth], handler: handleListNotifications },
  { method: 'GET', path: '/api/notifications/stream', middlewares: [], handler: handleNotificationStream },
  { method: 'POST', path: '/api/notifications/read-all', middlewares: [requireAuth], handler: handleMarkAllAsRead },
  { method: 'POST', path: '/api/notifications/:id/action-click', middlewares: [requireAuth], handler: handleNotificationActionClick },
  { method: 'POST', path: '/api/notifications/:id/read', middlewares: [requireAuth], handler: handleMarkAsRead },

  // ── Message Unread Count ──
  { method: 'GET', path: '/api/messages/unread-count', middlewares: [requireAuth], handler: handleGetUnreadCount },
  { method: 'POST', path: '/api/messages/:id/read', middlewares: [requireAuth], handler: handleMarkMessageRead },

  // ── Push Subscription Routes ──
  { method: 'POST', path: '/api/push/subscribe', middlewares: [requireAuth], handler: handlePushSubscribe },
  { method: 'DELETE', path: '/api/push/subscribe', middlewares: [requireAuth], handler: handlePushUnsubscribe },

  // ── Alert Routes ──
  { method: 'POST', path: '/api/alerts', middlewares: [requireAuth], handler: handleCreateAlert },
  { method: 'GET', path: '/api/alerts', middlewares: [requireAuth], handler: handleListMyAlerts },
  { method: 'DELETE', path: '/api/alerts/:id', middlewares: [requireAuth], handler: handleDeleteAlert },
  { method: 'PUT', path: '/api/alerts/:id', middlewares: [requireAuth], handler: handleToggleAlert },

  // ── Favorite Routes ──
  { method: 'POST', path: '/api/favorites', middlewares: [requireAuth, requireRole('employer')], handler: handleAddFavorite },
  { method: 'GET', path: '/api/favorites', middlewares: [requireAuth, requireRole('employer')], handler: handleListFavorites },
  { method: 'GET', path: '/api/favorites/check/:id', middlewares: [requireAuth, requireRole('employer')], handler: handleCheckFavorite },
  { method: 'DELETE', path: '/api/favorites/:id', middlewares: [requireAuth, requireRole('employer')], handler: handleRemoveFavorite },

  // ── Image Route ──
  { method: 'GET', path: '/api/images/:id', middlewares: [requireAuth], handler: handleGetImage },

  // ── Phase 40 — Live Presence ──
  { method: 'POST', path: '/api/presence/heartbeat', middlewares: [requireAuth, requireRole('worker')], handler: handleHeartbeat },
  { method: 'GET', path: '/api/workers/online-count', middlewares: [requireAuth], handler: handleOnlineCount },

  // ── Phase 40 — Availability Windows ──
  { method: 'POST', path: '/api/availability/windows', middlewares: [requireAuth, requireRole('worker')], handler: handleCreateWindow },
  { method: 'GET', path: '/api/availability/windows', middlewares: [requireAuth, requireRole('worker')], handler: handleListWindows },
  { method: 'DELETE', path: '/api/availability/windows/:id', middlewares: [requireAuth, requireRole('worker')], handler: handleDeleteWindow },

  // ── Phase 40 — Instant Accept (live-feed moved earlier to avoid /:id conflict) ──
  { method: 'POST', path: '/api/jobs/:id/instant-accept', middlewares: [requireAuth, requireRole('worker')], handler: handleInstantAccept },

  // ── Phase 41 — Availability Ads (Worker) ──
  { method: 'POST', path: '/api/availability-ads', middlewares: [requireAuth, requireRole('worker')], handler: handleCreateAd },
  { method: 'GET', path: '/api/availability-ads/mine', middlewares: [requireAuth, requireRole('worker')], handler: handleListMyAds },
  { method: 'DELETE', path: '/api/availability-ads/:id', middlewares: [requireAuth, requireRole('worker')], handler: handleWithdrawAd },
  { method: 'GET', path: '/api/availability-ads/:id', middlewares: [requireAuth], handler: handleGetAd },

  // ── Phase 41 — Worker Discovery (Employer) ──
  { method: 'GET', path: '/api/workers/discover', middlewares: [requireAuth, requireRole('employer')], handler: handleDiscoverWorkers },
  { method: 'GET', path: '/api/workers/:id/card', middlewares: [requireAuth], handler: handleGetWorkerCard },
  { method: 'POST', path: '/api/workers/:id/quick-offer', middlewares: [requireAuth, requireRole('employer')], handler: handleQuickOffer },

  // ── Phase 41 — Admin Ad Stats ──
  { method: 'GET', path: '/api/admin/availability-ads/stats', middlewares: [requireAdmin], handler: handleAdStats },

  // ── Phase 42 — Direct Offers + Phase 43 stats ──
  { method: 'POST', path: '/api/direct-offers', middlewares: [requireAuth, requireRole('employer')], handler: handleCreateOffer },
  { method: 'GET', path: '/api/direct-offers/mine', middlewares: [requireAuth], handler: handleListMyOffers },
  { method: 'GET', path: '/api/direct-offers/stats/employer', middlewares: [requireAuth, requireRole('employer')], handler: handleEmployerOfferStats },
  { method: 'GET', path: '/api/direct-offers/stats/worker', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerOfferStats },
  { method: 'POST', path: '/api/direct-offers/:id/accept', middlewares: [requireAuth, requireRole('worker')], handler: handleAcceptOffer },
  { method: 'POST', path: '/api/direct-offers/:id/decline', middlewares: [requireAuth, requireRole('worker')], handler: handleDeclineOffer },
  { method: 'DELETE', path: '/api/direct-offers/:id', middlewares: [requireAuth, requireRole('employer')], handler: handleWithdrawOffer },
  { method: 'GET', path: '/api/direct-offers/:id', middlewares: [requireAuth], handler: handleGetOffer },

  // ── Phase 51/53 — Workroom Messaging + Collaboration V2 Routes ──
  { method: 'GET', path: '/api/workrooms', middlewares: [requireAuth], handler: handleListWorkrooms },

  // Phase 53 — specific Workroom V2 routes BEFORE generic /:id
  { method: 'GET', path: '/api/workrooms/:id/search', middlewares: [requireAuth], handler: handleSearchWorkroomMessages },
  { method: 'GET', path: '/api/workrooms/:id/read-receipts', middlewares: [requireAuth], handler: handleGetWorkroomReadReceipts },
  { method: 'POST', path: '/api/workrooms/:id/messages/:messageId/read', middlewares: [requireAuth], handler: handleMarkWorkroomMessageRead },
  { method: 'POST', path: '/api/workrooms/:id/attachments', middlewares: [requireAuth], handler: handleUploadWorkroomAttachment },
  { method: 'GET', path: '/api/workrooms/:id/summary', middlewares: [requireAuth], handler: handleGetWorkroomSummary },

  // Phase 53 — Pins
  { method: 'GET', path: '/api/workrooms/:id/pins', middlewares: [requireAuth], handler: handleListWorkroomPins },
  { method: 'POST', path: '/api/workrooms/:id/pins', middlewares: [requireAuth], handler: handlePinWorkroomMessage },
  { method: 'DELETE', path: '/api/workrooms/:id/pins/:messageId', middlewares: [requireAuth], handler: handleUnpinWorkroomMessage },

  // Phase 53 — Checklist
  { method: 'GET', path: '/api/workrooms/:id/checklist', middlewares: [requireAuth], handler: handleGetWorkroomChecklist },
  { method: 'POST', path: '/api/workrooms/:id/checklist', middlewares: [requireAuth], handler: handleCreateWorkroomChecklistItem },
  { method: 'PUT', path: '/api/workrooms/:id/checklist/:itemId', middlewares: [requireAuth], handler: handleUpdateWorkroomChecklistItem },
  { method: 'DELETE', path: '/api/workrooms/:id/checklist/:itemId', middlewares: [requireAuth], handler: handleDeleteWorkroomChecklistItem },

  // Phase 51 existing message routes
  { method: 'GET', path: '/api/workrooms/:id/messages', middlewares: [requireAuth], handler: handleListWorkroomMessages },
  { method: 'POST', path: '/api/workrooms/:id/messages/read-all', middlewares: [requireAuth], handler: handleMarkWorkroomRead },
  { method: 'POST', path: '/api/workrooms/:id/messages', middlewares: [requireAuth], handler: handleSendWorkroomMessage },
  { method: 'GET', path: '/api/workrooms/:id/timeline', middlewares: [requireAuth], handler: handleGetWorkroomTimeline },
  { method: 'GET', path: '/api/workrooms/:id', middlewares: [requireAuth], handler: handleGetWorkroom },

  // ── Rating Pending Route ──
  { method: 'GET', path: '/api/ratings/pending', middlewares: [requireAuth], handler: handleGetPendingRatings },

  // ── Application Management Routes ──
  { method: 'GET', path: '/api/applications/mine', middlewares: [requireAuth, requireRole('worker')], handler: handleListMyApplications },
  { method: 'POST', path: '/api/applications/:id/withdraw', middlewares: [requireAuth, requireRole('worker')], handler: handleWithdrawApplication },
  { method: 'POST', path: '/api/applications/:id/confirm', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerConfirm },
  { method: 'POST', path: '/api/applications/:id/decline', middlewares: [requireAuth, requireRole('worker')], handler: handleWorkerDecline },

  // ── Payment Routes ──
  { method: 'POST', path: '/api/jobs/:id/payment', middlewares: [requireAuth, requireRole('employer')], handler: handleCreatePayment },
  { method: 'GET', path: '/api/jobs/:id/payment', middlewares: [requireAuth], handler: handleGetJobPayment },
  { method: 'GET', path: '/api/jobs/:id/receipt', middlewares: [requireAuth], handler: handleGetReceipt },
  { method: 'POST', path: '/api/payments/:id/confirm', middlewares: [requireAuth, requireRole('employer')], handler: handleConfirmPayment },
  { method: 'POST', path: '/api/payments/:id/dispute', middlewares: [requireAuth], handler: handleDisputePayment },

  // ── Admin Routes ──
  { method: 'GET', path: '/api/admin/analytics', middlewares: [requireAdmin], handler: handlePlatformAnalytics },
  { method: 'GET', path: '/api/admin/export/payments', middlewares: [requireAdmin], handler: handleExportPayments },
  { method: 'GET', path: '/api/admin/export/jobs', middlewares: [requireAdmin], handler: handleExportJobs },
  { method: 'GET', path: '/api/admin/export/users', middlewares: [requireAdmin], handler: handleExportUsers },
  { method: 'GET', path: '/api/admin/monitoring', middlewares: [requireAdmin], handler: handleGetMonitoring },
  { method: 'GET', path: '/api/admin/monitoring/latest', middlewares: [requireAdmin], handler: handleGetLatestSnapshot },
  { method: 'GET', path: '/api/admin/errors', middlewares: [requireAdmin], handler: handleGetErrors },
  { method: 'GET', path: '/api/admin/stats', middlewares: [requireAdmin], handler: handleAdminStats },
  { method: 'GET', path: '/api/admin/users', middlewares: [requireAdmin], handler: handleAdminUsers },
  { method: 'GET', path: '/api/admin/jobs', middlewares: [requireAdmin], handler: handleAdminJobs },
  { method: 'GET', path: '/api/admin/financial-summary', middlewares: [requireAdmin], handler: handleAdminFinancialSummary },
  { method: 'POST', path: '/api/admin/payments/:id/complete', middlewares: [requireCapability('admin.payments.complete')], handler: handleAdminCompletePayment },
  { method: 'PUT', path: '/api/admin/users/:id/status', middlewares: [requireCapability('admin.users.status_limited')], handler: handleAdminUpdateUserStatus },
  { method: 'GET', path: '/api/admin/reports', middlewares: [requireAdmin], handler: handleAdminListReports },
  { method: 'PUT', path: '/api/admin/reports/:id', middlewares: [requireCapability('admin.reports.review')], handler: handleAdminReviewReport },
  { method: 'GET', path: '/api/admin/verifications', middlewares: [requireAdmin], handler: handleAdminListVerifications },
  { method: 'PUT', path: '/api/admin/verifications/:id', middlewares: [requireCapability('admin.verifications.review')], handler: handleAdminReviewVerification },

  // ── Admin Audit Log ──
  {
    method: 'GET', path: '/api/admin/audit-log', middlewares: [requireAdmin],
    handler: async (req, res) => {
      try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const filters = {};
        if (req.query.action) filters.action = req.query.action;
        if (req.query.targetType) filters.targetType = req.query.targetType;
        const result = await listActions({ page, limit, ...filters });
        sendJSON(res, 200, { ok: true, ...result });
      } catch (err) {
        sendJSON(res, 500, { error: 'خطأ في جلب سجل العمليات', code: 'AUDIT_LOG_ERROR' });
      }
    },
  },

  // ── Phase 44 — Admin Direct Offers Operations Console ──
  { method: 'GET', path: '/api/admin/direct-offers/dashboard', middlewares: [requireAdmin], handler: handleAdminDirectOffersDashboard },
  { method: 'GET', path: '/api/admin/direct-offers/funnel', middlewares: [requireAdmin], handler: handleAdminDirectOffersFunnel },
  { method: 'GET', path: '/api/admin/direct-offers/decline-reasons', middlewares: [requireAdmin], handler: handleAdminDeclineReasons },
  { method: 'GET', path: '/api/admin/direct-offers/abuse', middlewares: [requireAdmin], handler: handleAdminAbuseSignals },

  // ── Phase 47 — Admin Operations Excellence (BEFORE :id patterns) ──
  { method: 'GET', path: '/api/admin/abuse-flags', middlewares: [requireAdmin], handler: handleAdminListFlagsByStatus },
  { method: 'GET', path: '/api/admin/abuse-flags/search', middlewares: [requireAdmin], handler: handleAdminSearchFlagsByNotes },
  { method: 'POST', path: '/api/admin/abuse-flags/bulk-action', middlewares: [requireAdmin], handler: handleAdminBulkFlagAction },
  { method: 'GET', path: '/api/admin/abuse-flags/snooze-expiring', middlewares: [requireAdmin], handler: handleAdminSnoozeExpiring },
  { method: 'GET', path: '/api/admin/users/:id/warnings-remaining', middlewares: [requireAdmin], handler: handleAdminUserWarningsRemaining },
  { method: 'GET', path: '/api/admin/users/:id/trust-v2', middlewares: [requireAdmin], handler: handleAdminUserTrustV2 },
  { method: 'GET', path: '/api/admin/audit-log/search', middlewares: [requireAdmin], handler: handleAdminAuditLogSearch },
  { method: 'GET', path: '/api/admin/audit-log/export', middlewares: [requireCapability('admin.audit.export')], handler: handleAdminAuditLogExport },

  // ── Phase 48 — Admin SSE Channel (self-authenticated via header OR query token) ──
  { method: 'GET', path: '/api/admin/events', middlewares: [], handler: handleAdminEventStream },

  // ── Phase 53 — Trust Score V2 Calibration Admin APIs ──
  { method: 'GET', path: '/api/admin/trust/calibration/dashboard', middlewares: [requireAdmin], handler: handleAdminTrustCalibrationDashboard },
  { method: 'GET', path: '/api/admin/trust/snapshots', middlewares: [requireAdmin], handler: handleAdminTrustSnapshots },
  { method: 'POST', path: '/api/admin/trust/calibration/snapshot-batch', middlewares: [requireCapability('admin.trust.calibration')], handler: handleAdminRunTrustSnapshotBatch },
  { method: 'POST', path: '/api/admin/trust/calibration/report', middlewares: [requireCapability('admin.trust.calibration')], handler: handleAdminRunTrustCalibrationReport },

  // ── Phase 49 — Marketplace Trust Analytics + Multi-Channel Admin Alerting ──
  { method: 'GET', path: '/api/admin/trust/resolution-time', middlewares: [requireAdmin], handler: handleAdminTrustResolutionTime },
  { method: 'GET', path: '/api/admin/trust/warning-conversion', middlewares: [requireAdmin], handler: handleAdminTrustWarningConversion },
  { method: 'GET', path: '/api/admin/trust/per-admin', middlewares: [requireAdmin], handler: handleAdminTrustPerAdmin },
  { method: 'GET', path: '/api/admin/trust/abuse-trend', middlewares: [requireAdmin], handler: handleAdminTrustAbuseTrend },
  { method: 'GET', path: '/api/admin/trust/dashboard', middlewares: [requireAdmin], handler: handleAdminTrustDashboard },
  { method: 'POST', path: '/api/admin/alerts/test-webhook', middlewares: [requireAdmin], handler: handleAdminTestWebhook },

  // ── Phase 52 — Persistent Alert Delivery History ──
  { method: 'GET', path: '/api/admin/alerts/health', middlewares: [requireAdmin], handler: handleAdminAlertDeliveryHealth },
  { method: 'GET', path: '/api/admin/alerts/deliveries', middlewares: [requireAdmin], handler: handleAdminAlertDeliveries },
  { method: 'POST', path: '/api/admin/alerts/deliveries/:id/retry', middlewares: [requireAdmin], handler: handleAdminRetryAlertDelivery },
  { method: 'GET', path: '/api/admin/alerts/deliveries/:id', middlewares: [requireAdmin], handler: handleAdminAlertDeliveryDetail },

  // ── Phase 54 — Production Ops Hardening APIs ──
  { method: 'GET', path: '/api/admin/production/readiness', middlewares: [requireAdmin], handler: handleProductionReadiness },
  { method: 'GET', path: '/api/admin/production/deployment-gate', middlewares: [requireAdmin], handler: handleDeploymentGate },
  { method: 'GET', path: '/api/admin/production/scheduler-cadence', middlewares: [requireAdmin], handler: handleSchedulerCadence },
  { method: 'GET', path: '/api/admin/production/ops-review', middlewares: [requireAdmin], handler: handleOpsReview },
  { method: 'GET', path: '/api/admin/production/instance-mode', middlewares: [requireAdmin], handler: handleInstanceMode },
  { method: 'GET', path: '/api/admin/production/multi-instance-boundary', middlewares: [requireCapability('admin.ops.read')], handler: handleMultiInstanceBoundary },
  { method: 'GET', path: '/api/admin/production/process-locks', middlewares: [requireAdmin], handler: handleProcessLocks },
  { method: 'POST', path: '/api/admin/production/process-locks/:name/release', middlewares: [requireCapability('admin.locks.release')], handler: handleReleaseProcessLock },

  // ── Phase 58 — Governance / RBAC / Privacy / Reviews / Postmortems ──
  { method: 'GET', path: '/api/admin/rbac/matrix', middlewares: [requireCapability('admin.read')], handler: handleAdminRbacMatrix },
  { method: 'GET', path: '/api/admin/rbac/me', middlewares: [requireCapability('admin.read')], handler: handleAdminRbacMe },

  { method: 'GET', path: '/api/admin/approvals', middlewares: [requireCapability('admin.read')], handler: handleListApprovals },
  { method: 'POST', path: '/api/admin/approvals', middlewares: [requireCapability('admin.approvals.write')], handler: handleCreateApproval },
  { method: 'POST', path: '/api/admin/approvals/:id/approve', middlewares: [requireCapability('admin.approvals.write')], handler: handleApproveApproval },
  { method: 'POST', path: '/api/admin/approvals/:id/reject', middlewares: [requireCapability('admin.approvals.write')], handler: handleRejectApproval },

  { method: 'GET', path: '/api/admin/privacy/requests', middlewares: [requireCapability('admin.privacy.read')], handler: handleListPrivacyRequests },
  { method: 'POST', path: '/api/admin/privacy/requests', middlewares: [requireCapability('admin.privacy.write')], handler: handleCreatePrivacyRequest },
  { method: 'GET', path: '/api/admin/privacy/requests/:id', middlewares: [requireCapability('admin.privacy.read')], handler: handleGetPrivacyRequest },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/export', middlewares: [requireCapability('admin.privacy.export')], handler: handleQueuePrivacyExport },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/anonymize-preview', middlewares: [requireCapability('admin.privacy.read')], handler: handlePreviewPrivacyAnonymize },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/anonymize', middlewares: [requireCapability('admin.privacy.anonymize')], handler: handleQueuePrivacyAnonymize },
  { method: 'POST', path: '/api/admin/privacy/requests/:id/cancel', middlewares: [requireCapability('admin.privacy.write')], handler: handleCancelPrivacyRequest },

  { method: 'GET', path: '/api/admin/ops/reviews', middlewares: [requireCapability('admin.ops.read')], handler: handleListOpsReviews },
  { method: 'POST', path: '/api/admin/ops/reviews', middlewares: [requireCapability('admin.ops.review')], handler: handleCreateOpsReview },
  { method: 'GET', path: '/api/admin/ops/reviews/:id', middlewares: [requireCapability('admin.ops.read')], handler: handleGetOpsReview },
  { method: 'POST', path: '/api/admin/ops/reviews/:id/complete', middlewares: [requireCapability('admin.ops.review')], handler: handleCompleteOpsReview },

  { method: 'GET', path: '/api/admin/incidents/:id/postmortem', middlewares: [requireCapability('admin.incidents.read')], handler: handleGetIncidentPostmortem },
  { method: 'POST', path: '/api/admin/incidents/:id/postmortem', middlewares: [requireCapability('admin.postmortems.write')], handler: handleCreateIncidentPostmortem },
  { method: 'PUT', path: '/api/admin/postmortems/:id', middlewares: [requireCapability('admin.postmortems.write')], handler: handleUpdatePostmortem },
  { method: 'GET', path: '/api/admin/postmortems', middlewares: [requireCapability('admin.incidents.read')], handler: handleListPostmortems },

  // ── Phase 56 — Marketplace Intelligence Admin APIs ──
  { method: 'GET', path: '/api/admin/marketplace-intelligence/dashboard', middlewares: [requireAdmin], handler: handleMarketplaceIntelligenceDashboard },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/search', middlewares: [requireAdmin], handler: handleSearchAnalytics },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/search/zero-results', middlewares: [requireAdmin], handler: handleZeroResultSearches },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/activation-funnel', middlewares: [requireAdmin], handler: handleActivationFunnel },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/notification-conversions', middlewares: [requireAdmin], handler: handleNotificationConversions },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/workroom-adoption', middlewares: [requireAdmin], handler: handleWorkroomAdoption },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/payment-disputes', middlewares: [requireAdmin], handler: handlePaymentDisputeAnalytics },
  { method: 'GET', path: '/api/admin/marketplace-intelligence/matching-quality', middlewares: [requireAdmin], handler: handleMatchingQuality },
  { method: 'POST', path: '/api/admin/marketplace-intelligence/rollup/run', middlewares: [requireAdmin], handler: handleRunMarketplaceIntelligenceRollup },

  // ── Phase 55 — Scale Hygiene Admin APIs ──
  { method: 'GET', path: '/api/admin/scale-hygiene/overview', middlewares: [requireAdmin], handler: handleScaleHygieneOverview },

  // ── Phase 59 — Storage Pressure + Scale Thresholds + Externalization Readiness ──
  { method: 'GET', path: '/api/admin/storage-pressure', middlewares: [requireCapability('admin.scale.read')], handler: handleGetStoragePressure },
  { method: 'POST', path: '/api/admin/storage-pressure/capture', middlewares: [requireCapability('admin.ops.review')], handler: handleCaptureStoragePressure },
  { method: 'GET', path: '/api/admin/storage-pressure/snapshots', middlewares: [requireCapability('admin.scale.read')], handler: handleListStoragePressureSnapshots },
  { method: 'GET', path: '/api/admin/scale-thresholds', middlewares: [requireCapability('admin.scale.read')], handler: handleGetScaleThresholds },
  { method: 'POST', path: '/api/admin/scale-thresholds/verify', middlewares: [requireCapability('admin.ops.review')], handler: handleVerifyScaleThresholds },
  { method: 'GET', path: '/api/admin/externalization/readiness', middlewares: [requireCapability('admin.scale.read')], handler: handleExternalizationReadiness },

  // ── Phase 60 — Evidence-Based Externalization Decision + Migration Rehearsal ──
  { method: 'GET', path: '/api/admin/externalization/decision', middlewares: [requireCapability('admin.scale.read')], handler: handleGetExternalizationDecision },
  { method: 'POST', path: '/api/admin/externalization/decision/capture', middlewares: [requireCapability('admin.ops.review')], handler: handleCaptureExternalizationDecision },
  { method: 'GET', path: '/api/admin/externalization/decision/snapshots', middlewares: [requireCapability('admin.scale.read')], handler: handleListExternalizationDecisionSnapshots },
  { method: 'POST', path: '/api/admin/migration-snapshots/validate', middlewares: [requireCapability('admin.ops.review')], handler: handleValidateMigrationSnapshot },
  { method: 'POST', path: '/api/admin/migration-rehearsal/run', middlewares: [requireCapability('admin.ops.review')], handler: handleRunMigrationRehearsal },
  { method: 'GET', path: '/api/admin/benchmarks/history', middlewares: [requireCapability('admin.scale.read')], handler: handleBenchmarkHistory },

  // ── Phase 61 — Evidence Cadence + Rollback Rehearsal + Pilot Gate ──
  { method: 'GET', path: '/api/admin/phase61/evidence', middlewares: [requireCapability('admin.scale.read')], handler: handleGetPhase61Evidence },
  { method: 'POST', path: '/api/admin/phase61/evidence/capture', middlewares: [requireCapability('admin.ops.review')], handler: handleCapturePhase61Evidence },
  { method: 'GET', path: '/api/admin/phase61/evidence/snapshots', middlewares: [requireCapability('admin.scale.read')], handler: handleListPhase61EvidenceSnapshots },

  { method: 'GET', path: '/api/admin/phase61/pilot-gate', middlewares: [requireCapability('admin.scale.read')], handler: handleGetPilotDecisionGate },
  { method: 'POST', path: '/api/admin/phase61/pilot-gate/capture', middlewares: [requireCapability('admin.ops.review')], handler: handleCapturePilotDecisionGate },

  { method: 'POST', path: '/api/admin/rollback-rehearsal/run', middlewares: [requireCapability('admin.ops.review')], handler: handleRunRollbackRehearsal },
  { method: 'GET', path: '/api/admin/rollback-rehearsal', middlewares: [requireCapability('admin.scale.read')], handler: handleListRollbackRehearsals },
  { method: 'GET', path: '/api/admin/rollback-rehearsal/:id', middlewares: [requireCapability('admin.scale.read')], handler: handleGetRollbackRehearsal },

  { method: 'GET', path: '/api/admin/repository-contracts', middlewares: [requireCapability('admin.scale.read')], handler: handleRepositoryContracts },

  { method: 'GET', path: '/api/admin/queue/health', middlewares: [requireAdmin], handler: handleQueueHealth },
  { method: 'POST', path: '/api/admin/queue/verify', middlewares: [requireAdmin], handler: handleQueueVerify },
  { method: 'POST', path: '/api/admin/queue/compact', middlewares: [requireAdmin], handler: handleQueueCompact },
  { method: 'POST', path: '/api/admin/queue/repair', middlewares: [requireCapability('admin.queue.repair')], handler: handleQueueRepair },

  { method: 'GET', path: '/api/admin/workroom-hygiene/overview', middlewares: [requireAdmin], handler: handleWorkroomHygieneOverview },
  { method: 'POST', path: '/api/admin/workroom-hygiene/compact', middlewares: [requireAdmin], handler: handleWorkroomCompact },
  { method: 'POST', path: '/api/admin/workroom-hygiene/verify-indexes', middlewares: [requireAdmin], handler: handleWorkroomVerifyIndexes },
  { method: 'POST', path: '/api/admin/workroom-hygiene/cleanup-attachments', middlewares: [requireAdmin], handler: handleWorkroomCleanupAttachments },

  { method: 'GET', path: '/api/admin/trust/rollups', middlewares: [requireAdmin], handler: handleTrustRollups },
  { method: 'POST', path: '/api/admin/trust/rollups/run', middlewares: [requireAdmin], handler: handleRunTrustRollup },

  { method: 'GET', path: '/api/admin/predictive-abuse/archive-index/status', middlewares: [requireAdmin], handler: handlePredictiveArchiveIndexStatus },
  { method: 'POST', path: '/api/admin/predictive-abuse/archive-index/rebuild', middlewares: [requireAdmin], handler: handleRebuildPredictiveArchiveIndex },

  { method: 'GET', path: '/api/admin/schedulers/:name/history', middlewares: [requireAdmin], handler: handleSchedulerHistory },

  { method: 'GET', path: '/api/admin/schedulers', middlewares: [requireAdmin], handler: handleListSchedulers },
  { method: 'POST', path: '/api/admin/schedulers/:name/run', middlewares: [requireCapability('admin.schedulers.run')], handler: handleRunSchedulerNow },
  { method: 'POST', path: '/api/admin/schedulers/:name/enable', middlewares: [requireCapability('admin.schedulers.toggle')], handler: handleEnableScheduler },
  { method: 'POST', path: '/api/admin/schedulers/:name/disable', middlewares: [requireCapability('admin.schedulers.toggle')], handler: handleDisableScheduler },
  { method: 'GET', path: '/api/admin/schedulers/:name', middlewares: [requireAdmin], handler: handleGetScheduler },

  { method: 'GET', path: '/api/admin/ops/rollups', middlewares: [requireAdmin], handler: handleOpsRollups },
  { method: 'GET', path: '/api/admin/ops/slo', middlewares: [requireAdmin], handler: handleOpsSlo },

  { method: 'GET', path: '/api/admin/incidents', middlewares: [requireAdmin], handler: handleListIncidents },
  { method: 'POST', path: '/api/admin/incidents/:id/resolve', middlewares: [requireAdmin], handler: handleResolveIncident },
  { method: 'GET', path: '/api/admin/incidents/:id', middlewares: [requireAdmin], handler: handleGetIncident },

  { method: 'POST', path: '/api/admin/backups/restore-drill', middlewares: [requireAdmin], handler: handleRunBackupRestoreDrill },
  { method: 'GET', path: '/api/admin/backups/restore-drills', middlewares: [requireAdmin], handler: handleListBackupRestoreDrills },
  { method: 'GET', path: '/api/admin/backups/restore-drills/:id', middlewares: [requireAdmin], handler: handleGetBackupRestoreDrill },

  { method: 'GET', path: '/api/admin/maintenance', middlewares: [requireAdmin], handler: handleGetMaintenanceMode },
  { method: 'POST', path: '/api/admin/maintenance/enable', middlewares: [requireCapability('admin.maintenance.toggle')], handler: handleEnableMaintenanceMode },
  { method: 'POST', path: '/api/admin/maintenance/disable', middlewares: [requireCapability('admin.maintenance.toggle')], handler: handleDisableMaintenanceMode },

  // ── Phase 50 — Audit Indexed Search Admin Ops ──
  { method: 'GET', path: '/api/admin/audit-index/status', middlewares: [requireAdmin], handler: handleAdminAuditIndexStatus },
  { method: 'POST', path: '/api/admin/audit-index/rebuild', middlewares: [requireAdmin], handler: handleAdminAuditIndexRebuild },
  { method: 'POST', path: '/api/admin/audit-index/verify', middlewares: [requireAdmin], handler: handleAdminAuditIndexVerify },

  // ── Phase 52 — Persistent Ops Queue Admin APIs ──
  { method: 'GET', path: '/api/admin/ops-queue/stats', middlewares: [requireAdmin], handler: handleAdminQueueStats },
  { method: 'GET', path: '/api/admin/ops-queue/dead-letter', middlewares: [requireAdmin], handler: handleAdminDeadLetterJobs },
  { method: 'POST', path: '/api/admin/ops-queue/dead-letter/:id/retry', middlewares: [requireAdmin], handler: handleAdminRetryDeadLetterJob },
  { method: 'GET', path: '/api/admin/ops-queue/jobs', middlewares: [requireAdmin], handler: handleAdminQueueJobs },
  { method: 'POST', path: '/api/admin/ops-queue/jobs/:id/retry', middlewares: [requireAdmin], handler: handleAdminRetryQueueJob },
  { method: 'POST', path: '/api/admin/ops-queue/jobs/:id/cancel', middlewares: [requireAdmin], handler: handleAdminCancelQueueJob },
  { method: 'GET', path: '/api/admin/ops-queue/jobs/:id', middlewares: [requireAdmin], handler: handleAdminQueueJobDetail },

  // ── Phase 50/52 — Persistent Export Registry + Async Export Jobs ──
  { method: 'POST', path: '/api/admin/exports/audit-log', middlewares: [requireCapability('admin.audit.export')], handler: handleAdminCreateAuditExportJob },
  { method: 'GET', path: '/api/admin/exports', middlewares: [requireAdmin], handler: handleAdminListExports },
  { method: 'GET', path: '/api/admin/exports/:id/download', middlewares: [requireAdmin], handler: handleAdminDownloadExport },
  { method: 'POST', path: '/api/admin/exports/:id/cancel', middlewares: [requireAdmin], handler: handleAdminCancelExport },
  { method: 'GET', path: '/api/admin/exports/:id', middlewares: [requireAdmin], handler: handleAdminGetExport },

  // ── Phase 50 — Counter Hygiene ──
  { method: 'GET', path: '/api/admin/counters/hygiene', middlewares: [requireAdmin], handler: handleAdminCounterHygiene },
  { method: 'POST', path: '/api/admin/counters/compact', middlewares: [requireAdmin], handler: handleAdminCompactCounters },
  { method: 'POST', path: '/api/admin/counters/rebuild', middlewares: [requireAdmin], handler: handleAdminRebuildCounters },

  // ── Phase 51 — Predictive Abuse Intelligence ──
  { method: 'GET', path: '/api/admin/predictive-abuse/dashboard', middlewares: [requireAdmin], handler: handleAdminPredictiveAbuseDashboard },
  { method: 'GET', path: '/api/admin/predictive-abuse/signals', middlewares: [requireAdmin], handler: handleAdminPredictiveAbuseSignals },
  { method: 'GET', path: '/api/admin/predictive-abuse/precision', middlewares: [requireAdmin], handler: handleAdminPredictivePrecision },
  { method: 'POST', path: '/api/admin/predictive-abuse/run-scan', middlewares: [requireAdmin], handler: handleAdminRunPredictiveAbuseScan },
  { method: 'POST', path: '/api/admin/predictive-abuse/retention/run', middlewares: [requireAdmin], handler: handleAdminRunPredictiveSignalRetention },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/false-positive', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminMarkPredictiveFalsePositive },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/confirm', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminMarkPredictiveConfirmed },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/dismiss', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminDismissPredictiveSignal },
  { method: 'POST', path: '/api/admin/predictive-abuse/signals/:id/escalate', middlewares: [requireCapability('admin.predictive.review')], handler: handleAdminEscalatePredictiveSignal },

  // ── Phase 51 — Admin Decision Quality ──
  { method: 'GET', path: '/api/admin/trust/decision-quality', middlewares: [requireAdmin], handler: handleAdminTrustDecisionQuality },
  { method: 'GET', path: '/api/admin/trust/backlog-priority', middlewares: [requireAdmin], handler: handleAdminTrustBacklogPriority },

  // ── Phase 45 — Admin Abuse Flag Review Workflow ──
  { method: 'GET', path: '/api/admin/abuse-flags/:id/history', middlewares: [requireAdmin], handler: handleAdminFlagReviewHistory },
  { method: 'POST', path: '/api/admin/abuse-flags/:id/review', middlewares: [requireAdmin], handler: handleAdminFlagReview },
  { method: 'POST', path: '/api/admin/abuse-flags/:id/warn', middlewares: [requireAdmin], handler: handleSendAbuseWarning },
];

/**
 * Match a path pattern like /api/jobs/:id/apply against /api/jobs/job_abc123/apply
 * Returns params object or null
 */
function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');

  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Run an array of middleware functions in sequence
 */
function runMiddlewares(middlewares, req, res, done) {
  let idx = 0;
  function next(err) {
    if (err) {
      if (!res.writableEnded) {
        sendJSON(res, 500, { error: 'خطأ داخلي', code: 'INTERNAL_ERROR' });
      }
      return;
    }
    if (res.writableEnded) return;  // Middleware already responded
    const mw = middlewares[idx++];
    if (!mw) return done();
    try {
      mw(req, res, next);
    } catch (e) {
      next(e);
    }
  }
  next();
}

// Setup notification event listeners
setupNotificationListeners();

// Phase 41 — Setup ad matcher FIRST (must run before jobMatcher's broad notification)
// adMatcher writes to dedup map → jobMatcher reads it to skip already-notified workers
import { setupAdMatchListeners } from './services/adMatcher.js';
setupAdMatchListeners();

// Phase 41 — Setup worker discovery cache invalidation listeners
import { setupCacheInvalidation } from './services/workerDiscovery.js';
setupCacheInvalidation();

// Setup smart job matching (registers AFTER adMatcher so adMatcher's job:created listener fires first)
import { setupJobMatching } from './services/jobMatcher.js';
setupJobMatching();

import { setupJobAlerts } from './services/jobAlerts.js';
setupJobAlerts();

// Phase 40 — Setup instant match + live feed listeners
import { setupInstantMatchListeners } from './services/instantMatch.js';
setupInstantMatchListeners();

import { setupLiveFeedListeners } from './services/liveFeed.js';
setupLiveFeedListeners();

// Phase 43 — Setup direct offer reconciliation listener (5s delayed re-sync)
import { setupDirectOfferListeners } from './services/directOffer.js';
setupDirectOfferListeners();

// Phase 45 + Phase 46 — Counter applyEvent listeners (registered FIRST — before cache invalidation)
// Each direct_offer:* event triggers an incremental counter file update.
// Phase 46: uses applyEventBatched (synchronous push to in-memory queue + scheduled flush).
// Throughput: ~10 evt/sec → 100+ evt/sec sustained.
// Fire-and-forget: failures logged, scheduled rebuild (every 24h) catches drift.
if (config.COUNTERS && config.COUNTERS.enabled) {
  const counterEvents = ['direct_offer:created', 'direct_offer:accepted', 'direct_offer:declined', 'direct_offer:expired', 'direct_offer:withdrawn'];
  for (const eventName of counterEvents) {
    eventBus.on(eventName, (data) => {
      const eventType = eventName.split(':')[1];
      try {
        // Phase 46: use applyEventBatched (was applyEvent in Phase 45)
        directOfferCounters.applyEventBatched(eventType, data);
      } catch (err) {
        logger.warn('Phase 46: counter applyEventBatched failed', { eventName, error: err.message });
      }
    });
  }
  logger.info(`Direct offer counters: enabled (${counterEvents.length} event listeners, Phase 46 batched)`);
} else {
  logger.info('Direct offer counters: disabled via config');
}

// Phase 44 + 45 — Analytics cache invalidation (debounced, registered AFTER counter listeners)
// Listeners registered AFTER setupDirectOfferListeners + counter listeners to ensure proper event ordering.
// Phase 45: uses debouncedClear to prevent thundering herd during event bursts.
// Fire-and-forget: failure tolerated, TTL (5min) catches stale data eventually.
if (config.ANALYTICS && config.ANALYTICS.cacheInvalidationEnabled) {
  const invalidationEvents = config.ANALYTICS.cacheInvalidationEvents || [];
  for (const eventName of invalidationEvents) {
    eventBus.on(eventName, (data) => {
      try {
        // Per-employer analytics cache (if event payload has employerId)
        if (data && data.employerId) {
          debouncedClear(`emp:${data.employerId}`, () => {
            clearAnalyticsCache(`analytics:employer:${data.employerId}:`);
          });
        }
        // Per-worker analytics cache (if event payload has workerId)
        if (data && data.workerId) {
          debouncedClear(`wrk:${data.workerId}`, () => {
            clearAnalyticsCache(`analytics:worker:${data.workerId}:`);
          });
        }
        // Platform-wide analytics cache (always invalidate)
        debouncedClear('platform', () => {
          clearAnalyticsCache('analytics:platform:');
          clearDirectOfferAnalyticsCache();
        });
      } catch (_) { /* fire-and-forget */ }
    });
  }
  logger.info(`Analytics cache invalidation: enabled (${invalidationEvents.length} events, debounced)`);
} else {
  logger.info('Analytics cache invalidation: disabled via config');
}

/**
 * Creates the router function
 */
export function createRouter() {
  return function router(req, res) {
    const method = req.method;
    const pathname = req.pathname;
    const startTime = Date.now();

    // Find matching route
    for (const route of routes) {
      if (route.method !== method) continue;

      const params = matchPath(route.path, pathname);
      if (params === null) continue;

      // Attach params
      req.params = params;

      // Validate URL parameters (path traversal prevention)
      for (const [paramName, paramValue] of Object.entries(params)) {
        if (paramValue && !isValidId(paramValue)) {
          sendJSON(res, 400, { error: 'معرّف غير صالح', code: 'INVALID_ID', param: paramName });
          return;
        }
      }

      // Run route-specific middleware then handler
      runMiddlewares(route.middlewares, req, res, () => {
        Promise.resolve(route.handler(req, res)).catch((err) => {
          logger.error('Handler error', { error: err.message, path: pathname });
          if (!res.writableEnded) {
            sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
          }
          // Record error for aggregation (fire-and-forget)
          try {
            import('./services/errorAggregator.js').then(({ recordError }) => {
              recordError(pathname, 500, err.message);
            }).catch(() => {});
          } catch (_) { /* non-fatal */ }
        }).finally(() => {
          const duration = Date.now() - startTime;
          logger.request(req, res.statusCode, duration);
        });
      });

      return;
    }

    // No route matched — 404
    sendJSON(res, 404, { error: 'المسار غير موجود', code: 'NOT_FOUND' });
    const duration = Date.now() - startTime;
    logger.request(req, 404, duration);
  };
}
```

---
