# يوميّة (Yawmia) v0.29.0 — Part 1: Config + Server Core + Router
> Auto-generated: 2026-04-23T18:45:15.173Z
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
```

---

## `package.json`

```json
{
  "name": "yawmia",
  "version": "0.29.0",
  "description": "يوميّة — منصة توظيف العمالة اليومية في مصر",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/**/*.test.js"
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
import { bodyParserMiddleware } from './server/middleware/bodyParser.js';
import { rateLimitMiddleware } from './server/middleware/rateLimit.js';
import { timingMiddleware } from './server/middleware/timing.js';
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

// ── Build Search Index ───────────────────────────────────────
try {
  const { buildIndex } = await import('./server/services/searchIndex.js');
  await buildIndex();
  logger.info('Startup: search index built');
} catch (err) {
  logger.warn('Startup: search index build error', { error: err.message });
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

    // Expiry warnings (fire-and-forget)
    try {
      const { checkExpiryWarnings } = await import('./server/services/jobs.js');
      const warnings = await checkExpiryWarnings();
      if (warnings > 0) logger.info(`Periodic: sent ${warnings} expiry warning(s)`);
    } catch (_) { /* non-fatal */ }

    // Index health check every 12 cycles (= 6 hours)
    cleanupCycleCount++;

    // Search index rebuild every 2 cycles (= every hour)
    if (cleanupCycleCount % 2 === 0) {
      try {
        const { buildIndex } = await import('./server/services/searchIndex.js');
        await buildIndex();
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

  // 2. Broadcast SSE shutdown event (fire-and-forget)
  try {
    const { broadcast } = await import('./server/services/sseManager.js');
    broadcast('shutdown', { reason: 'server_restart', message: 'السيرفر هيعيد التشغيل — هتتوصل تاني تلقائياً' });
  } catch (_) { /* SSE broadcast failure is non-fatal */ }

  // 3. Wait 1 second for pending writes to complete
  setTimeout(() => {
    logger.info('🔴 Shutdown complete');
    process.exit(0);
  }, 1000);

  // 4. Force exit after 10 seconds as safety net
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
import { requireAuth, requireRole, requireAdmin } from './middleware/auth.js';
import { handleSendOtp, handleVerifyOtp, handleGetMe, handleUpdateProfile, handleLogout, handleLogoutAll, handleAcceptTerms, handleDeleteAccount } from './handlers/authHandler.js';
import { handleCreateJob, handleListJobs, handleGetJob, handleStartJob, handleCompleteJob, handleCancelJob, handleListMyJobs, handleNearbyJobs, handleRenewJob, handleDuplicateJob } from './handlers/jobsHandler.js';
import { handleApplyToJob, handleAcceptWorker, handleRejectWorker, handleListJobApplications, handleListMyApplications, handleWithdrawApplication } from './handlers/applicationsHandler.js';
import { handleAdminStats, handleAdminUsers, handleAdminJobs, handleAdminUpdateUserStatus } from './handlers/adminHandler.js';
import { handleListNotifications, handleMarkAsRead, handleMarkAllAsRead } from './handlers/notificationsHandler.js';
import { handleSubmitRating, handleListJobRatings, handleListUserRatings, handleUserRatingSummary } from './handlers/ratingsHandler.js';
import { handleCreatePayment, handleConfirmPayment, handleAdminCompletePayment, handleDisputePayment, handleGetJobPayment, handleAdminFinancialSummary } from './handlers/paymentsHandler.js';
import { handleCreateReport, handleAdminListReports, handleAdminReviewReport, handleGetTrustScore } from './handlers/reportsHandler.js';
import { handleSubmitVerification, handleGetVerificationStatus, handleGetPublicProfile, handleAdminListVerifications, handleAdminReviewVerification } from './handlers/verificationHandler.js';
import { handleNotificationStream } from './handlers/sseHandler.js';
import { handleCheckIn, handleCheckOut, handleConfirmAttendance, handleReportNoShow, handleEmployerCheckIn, handleListJobAttendance, handleJobAttendanceSummary } from './handlers/attendanceHandler.js';
import { handleSendMessage, handleBroadcastMessage, handleListJobMessages, handleGetUnreadCount, handleMarkMessageRead, handleMarkAllJobMessagesRead } from './handlers/messagesHandler.js';
import { handlePushSubscribe, handlePushUnsubscribe } from './handlers/pushHandler.js';
import { handleCreateAlert, handleListMyAlerts, handleDeleteAlert, handleToggleAlert } from './handlers/alertsHandler.js';
import { handleEmployerAnalytics, handleWorkerAnalytics, handlePlatformAnalytics, handleExportPayments, handleExportJobs, handleExportUsers, handleEmployerExportPayments, handleGetReceipt, handleGetMonitoring, handleGetLatestSnapshot } from './handlers/analyticsHandler.js';
import { setupNotificationListeners } from './services/notifications.js';
import { logger } from './services/logger.js';
import { listActions } from './services/auditLog.js';

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
        version: '0.29.0',
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
      sendJSON(res, 200, { ok: true, routes: docs, total: docs.length, version: '0.29.0' });
    },
  },

  // ── Auth Routes (Public) ──
  { method: 'POST', path: '/api/auth/send-otp', middlewares: [], handler: handleSendOtp },
  { method: 'POST', path: '/api/auth/verify-otp', middlewares: [], handler: handleVerifyOtp },

  // ── Auth Routes (Protected) ──
  { method: 'GET', path: '/api/auth/me', middlewares: [requireAuth], handler: handleGetMe },
  { method: 'PUT', path: '/api/auth/profile', middlewares: [requireAuth], handler: handleUpdateProfile },
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
  { method: 'GET', path: '/api/users/:id/public-profile', middlewares: [], handler: handleGetPublicProfile },

  // ── Report Routes ──
  { method: 'POST', path: '/api/reports', middlewares: [requireAuth], handler: handleCreateReport },

  // ── Notification Routes ──
  { method: 'GET', path: '/api/notifications', middlewares: [requireAuth], handler: handleListNotifications },
  { method: 'GET', path: '/api/notifications/stream', middlewares: [], handler: handleNotificationStream },
  { method: 'POST', path: '/api/notifications/read-all', middlewares: [requireAuth], handler: handleMarkAllAsRead },
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

  // ── Application Management Routes ──
  { method: 'GET', path: '/api/applications/mine', middlewares: [requireAuth, requireRole('worker')], handler: handleListMyApplications },
  { method: 'POST', path: '/api/applications/:id/withdraw', middlewares: [requireAuth, requireRole('worker')], handler: handleWithdrawApplication },

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
  { method: 'GET', path: '/api/admin/stats', middlewares: [requireAdmin], handler: handleAdminStats },
  { method: 'GET', path: '/api/admin/users', middlewares: [requireAdmin], handler: handleAdminUsers },
  { method: 'GET', path: '/api/admin/jobs', middlewares: [requireAdmin], handler: handleAdminJobs },
  { method: 'GET', path: '/api/admin/financial-summary', middlewares: [requireAdmin], handler: handleAdminFinancialSummary },
  { method: 'POST', path: '/api/admin/payments/:id/complete', middlewares: [requireAdmin], handler: handleAdminCompletePayment },
  { method: 'PUT', path: '/api/admin/users/:id/status', middlewares: [requireAdmin], handler: handleAdminUpdateUserStatus },
  { method: 'GET', path: '/api/admin/reports', middlewares: [requireAdmin], handler: handleAdminListReports },
  { method: 'PUT', path: '/api/admin/reports/:id', middlewares: [requireAdmin], handler: handleAdminReviewReport },
  { method: 'GET', path: '/api/admin/verifications', middlewares: [requireAdmin], handler: handleAdminListVerifications },
  { method: 'PUT', path: '/api/admin/verifications/:id', middlewares: [requireAdmin], handler: handleAdminReviewVerification },

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

// Setup smart job matching
import { setupJobMatching } from './services/jobMatcher.js';
setupJobMatching();

import { setupJobAlerts } from './services/jobAlerts.js';
setupJobAlerts();

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
      if (params.id && !isValidId(params.id)) {
        sendJSON(res, 400, { error: 'معرّف غير صالح', code: 'INVALID_ID' });
        return;
      }

      // Run route-specific middleware then handler
      runMiddlewares(route.middlewares, req, res, () => {
        Promise.resolve(route.handler(req, res)).catch((err) => {
          logger.error('Handler error', { error: err.message, path: pathname });
          if (!res.writableEnded) {
            sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
          }
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
