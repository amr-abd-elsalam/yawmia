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
    },
    indexFiles: {
      phoneIndex: 'users/phone-index.json',
      jobsIndex: 'jobs/index.json',
      workerAppsIndex: 'applications/worker-index.json',
      jobAppsIndex: 'applications/job-index.json',
      userNotificationsIndex: 'notifications/user-index.json',
      employerJobsIndex: 'jobs/employer-index.json',
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

};

export default deepFreeze(config);
