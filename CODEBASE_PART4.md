# يوميّة (Yawmia) v0.22.0 — Part 4: Frontend + PWA + Scripts
> Auto-generated: 2026-04-21T22:24:41.604Z
> Files in this part: 28

## Files
1. `frontend/404.html`
2. `frontend/admin.html`
3. `frontend/assets/css/style.css`
4. `frontend/assets/css/tokens.css`
5. `frontend/assets/js/admin.js`
6. `frontend/assets/js/app.js`
7. `frontend/assets/js/auth.js`
8. `frontend/assets/js/icons.js`
9. `frontend/assets/js/jobs.js`
10. `frontend/assets/js/modal.js`
11. `frontend/assets/js/profile.js`
12. `frontend/assets/js/toast.js`
13. `frontend/assets/js/user.js`
14. `frontend/assets/js/utils.js`
15. `frontend/dashboard.html`
16. `frontend/index.html`
17. `frontend/manifest.json`
18. `frontend/offline.html`
19. `frontend/profile.html`
20. `frontend/robots.txt`
21. `frontend/sitemap.xml`
22. `frontend/sw.js`
23. `frontend/user.html`
24. `scripts/backup.js`
25. `scripts/benchmark.js`
26. `scripts/bundle-for-review.js`
27. `scripts/generate-vapid-keys.js`
28. `scripts/repair-indexes.js`

---

## `frontend/404.html`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>يوميّة — الصفحة غير موجودة</title>
  <meta name="description" content="الصفحة المطلوبة غير موجودة على منصة يوميّة.">
  <meta name="theme-color" content="#2563eb">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif;background:#0f1117;color:#e4e6f0;min-height:100vh;display:flex;align-items:center;justify-content:center;direction:rtl;text-align:center;padding:2rem}
    .container{max-width:480px}
    .code{font-size:6rem;font-weight:700;color:#2563eb;line-height:1}
    .title{font-size:1.5rem;margin-block:1rem;font-weight:600}
    .desc{color:#8b8fa3;margin-block-end:2rem;font-size:0.95rem}
    .link{display:inline-block;padding:0.75rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:1rem;transition:background 0.2s}
    .link:hover{background:#1d4fd8}
  </style>
</head>
<body>
  <div class="container">
    <div class="code">404</div>
    <h1 class="title">الصفحة غير موجودة</h1>
    <p class="desc">الصفحة اللي بتدوّر عليها مش موجودة أو تم نقلها.</p>
    <a href="/" class="link">الرجوع للصفحة الرئيسية</a>
  </div>
</body>
</html>
```

---

## `frontend/admin.html`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>يوميّة — لوحة تحكم الأدمن</title>
  <meta name="description" content="لوحة تحكم الأدمن لمنصة يوميّة — إدارة المستخدمين والفرص والبلاغات.">
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="/assets/img/icon-192.png">
</head>
<body>
  <a href="#main-content" class="skip-link">تخطي إلى المحتوى الرئيسي</a>
  <div class="admin-container">
    <nav aria-label="التنقل الرئيسي">
      <div class="admin-header">
        <h1><span data-icon="shieldCheck" data-icon-size="28"></span> لوحة تحكم يوميّة</h1>
        <p>إدارة ومراقبة المنصة</p>
      </div>
    </nav>
    <main id="main-content">

    <form class="token-form" id="tokenForm" onsubmit="return false;">
      <input type="password" class="form-input" id="adminTokenInput" placeholder="أدخل توكن الأدمن...">
      <button class="btn btn--primary btn--sm" onclick="AdminApp.connect()">اتصال</button>
    </form>

    <div class="error-msg" id="errorMsg"></div>

    <div id="dashboard" class="hidden">
      <div class="stats-grid" id="statsGrid"></div>

      <div class="admin-section">
        <div class="admin-section__header">
          <h2>الماليات</h2>
          <button class="refresh-btn" onclick="AdminApp.loadFinancials()">تحديث</button>
        </div>
        <div id="financialGrid" class="financial-grid">
          <p style="color: var(--color-text-muted); text-align: center;">جاري التحميل...</p>
        </div>
      </div>

      <div class="admin-section">
        <div class="admin-section__header">
          <h2>صحة النظام</h2>
          <button class="refresh-btn" onclick="AdminApp.loadHealth()">تحديث</button>
        </div>
        <div id="healthInfo">
          <p style="color: var(--color-text-muted); text-align: center;">جاري التحميل...</p>
        </div>
      </div>

      <div class="admin-section">
        <div class="admin-section__header">
          <h2>آخر المستخدمين</h2>
          <button class="refresh-btn" onclick="AdminApp.loadUsers()">تحديث</button>
        </div>
        <div id="usersTable">
          <p style="color: var(--color-text-muted); text-align: center;">جاري التحميل...</p>
        </div>
        <div id="users-pagination"></div>
      </div>

      <div class="admin-section">
        <div class="admin-section__header">
          <h2>آخر الفرص</h2>
          <button class="refresh-btn" onclick="AdminApp.loadJobs()">تحديث</button>
        </div>
        <div id="jobsTable">
          <p style="color: var(--color-text-muted); text-align: center;">جاري التحميل...</p>
        </div>
        <div id="jobs-pagination"></div>
      </div>

      <div class="admin-section">
        <div class="admin-section__header">
          <h2>📋 البلاغات</h2>
          <button class="refresh-btn" onclick="AdminApp.loadReports()">تحديث</button>
        </div>
        <div id="reports-filter" style="margin-bottom:1rem;">
          <select id="report-status-filter" onchange="AdminApp.loadReports(1)">
            <option value="">الكل</option>
            <option value="pending" selected>قيد المراجعة</option>
            <option value="action_taken">تم اتخاذ إجراء</option>
            <option value="dismissed">مرفوض</option>
            <option value="reviewed">تمت المراجعة</option>
          </select>
        </div>
        <div id="reportsTable">
          <p style="color: var(--color-text-muted); text-align: center;">جاري التحميل...</p>
        </div>
        <div id="reports-pagination"></div>
      </div>

      <div class="admin-section">
        <div class="admin-section__header">
          <h2>🔐 طلبات التحقق</h2>
          <button class="refresh-btn" onclick="AdminApp.loadVerifications()">تحديث</button>
        </div>
        <div id="verifications-filter" style="margin-bottom:1rem;">
          <select id="verification-status-filter" onchange="AdminApp.loadVerifications(1)">
            <option value="">الكل</option>
            <option value="pending" selected>قيد المراجعة</option>
            <option value="verified">محقق</option>
            <option value="rejected">مرفوض</option>
          </select>
        </div>
        <div id="verificationsTable">
          <p style="color: var(--color-text-muted); text-align: center;">جاري التحميل...</p>
        </div>
        <div id="verifications-pagination"></div>
      </div>
    </div>
    </main>
  </div>

  <script src="/assets/js/icons.js"></script>
  <script src="/assets/js/utils.js"></script>
  <script src="/assets/js/toast.js"></script>
  <script src="/assets/js/modal.js"></script>
  <script src="/assets/js/admin.js"></script>
  <script>if(typeof YawmiaIcons!=='undefined')YawmiaIcons.renderAll();</script>
</body>
</html>
```

---

## `frontend/assets/css/style.css`

```css
/* ═══════════════════════════════════════════════════════════════
   style.css — يوميّة: Dark Theme, RTL-first, Mobile-first
   ═══════════════════════════════════════════════════════════════ */

/* ── @font-face — Cairo (self-hosted) ───────────────────────── */
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/Cairo-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('../fonts/Cairo-SemiBold.woff2') format('woff2');
}

@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../fonts/Cairo-Bold.woff2') format('woff2');
}

/* ── CSS Custom Properties ──────────────────────────────────── */
:root {
  --color-bg:         #0f1117;
  --color-surface:    #1a1d27;
  --color-surface-2:  #242836;
  --color-border:     #2e3347;
  --color-text:       #e4e6f0;
  --color-text-muted: #8b8fa3;
  --color-primary:    #2563eb;
  --color-primary-hover: #1d4fd8;
  --color-success:    #22c55e;
  --color-warning:    #f59e0b;
  --color-error:      #ef4444;
  --color-error-bg:   rgba(239, 68, 68, 0.1);
  --color-success-bg: rgba(34, 197, 94, 0.1);
  --color-warning-bg: rgba(245, 158, 11, 0.1);
  --radius-sm:        6px;
  --radius-md:        10px;
  --radius-lg:        16px;
  --shadow-sm:        0 1px 3px rgba(0,0,0,0.3);
  --shadow-md:        0 4px 12px rgba(0,0,0,0.4);
  --font-family:      'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
  --transition:       0.2s ease;
  --container-max:    800px;
}

/* ── Reset & Base ──────────────────────────────────────────── */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: var(--font-family);
  background: var(--color-bg);
  color: var(--color-text);
  line-height: 1.6;
  min-height: 100vh;
  direction: rtl;
}

/* ── Container ─────────────────────────────────────────────── */
.container {
  max-width: var(--container-max);
  margin-inline: auto;
  padding-inline: 1rem;
}

/* ── Header ────────────────────────────────────────────────── */
.header {
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
  padding-block: 1rem;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.header__brand {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
}

.header__logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  vertical-align: middle;
  margin-inline-end: 0.4rem;
  border-radius: var(--radius-sm);
}

.header__tagline {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.header__left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header__user {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

/* ── Badge ─────────────────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--color-primary);
  color: #fff;
}

.badge--worker { background: var(--color-success); }
.badge--employer { background: var(--color-warning); color: #000; }

/* ── Main ──────────────────────────────────────────────────── */
.main {
  padding-block: 2rem;
  min-height: calc(100vh - 140px);
}

/* ── Card ──────────────────────────────────────────────────── */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-block-end: 1.5rem;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition);
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.card__title {
  font-size: 1.25rem;
  margin-block-end: 0.5rem;
  color: var(--color-text);
}

.card__desc {
  color: var(--color-text-muted);
  margin-block-end: 1.25rem;
  font-size: 0.9rem;
}

/* ── Auth Card ─────────────────────────────────────────────── */
.auth-section {
  max-width: 420px;
  margin-inline: auto;
}

/* ── Form ──────────────────────────────────────────────────── */
.form-group {
  margin-block-end: 1.25rem;
}

.form-label {
  display: block;
  margin-block-end: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 1rem;
  font-family: inherit;
  transition: border-color var(--transition), box-shadow var(--transition);
  outline: none;
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.form-input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.7;
}

.form-input--otp {
  text-align: center;
  font-size: 2rem;
  letter-spacing: 0.5em;
  padding-inline-end: 0;
}

.form-input--sm {
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

select.form-input {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b8fa3' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: left 0.75rem center;
  padding-inline-start: 2.5rem;
}

.form-hint {
  display: block;
  margin-block-start: 0.3rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* ── Radio & Checkbox ──────────────────────────────────────── */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}

.radio-label:hover {
  border-color: var(--color-primary);
}

.radio-label input:checked + span {
  color: var(--color-primary);
  font-weight: 600;
}

.checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color var(--transition);
}

.checkbox-label:hover {
  border-color: var(--color-primary);
}

/* ── Buttons ───────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition), transform var(--transition), opacity var(--transition);
  outline: none;
  text-decoration: none;
}

.btn:active:not(:disabled) {
  transform: scale(0.96);
}

.btn:disabled,
.btn[aria-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
  filter: grayscale(30%);
}

.btn--done {
  background: transparent;
  color: var(--color-success);
  border: 1px solid var(--color-success);
  cursor: default;
  pointer-events: none;
  opacity: 1;
  filter: none;
}

.btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn--ghost {
  background: transparent;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.btn--full {
  width: 100%;
}

.btn--sm {
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
}

/* ── Messages ──────────────────────────────────────────────── */
.message {
  margin-block-start: 0.75rem;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  display: none;
}

.message--error {
  display: block;
  background: var(--color-error-bg);
  color: var(--color-error);
  border: 1px solid var(--color-error);
}

.message--success {
  display: block;
  background: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}

/* ── Jobs List ─────────────────────────────────────────────── */
.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.job-card {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
  transition: border-color var(--transition);
}

.job-card:hover {
  border-color: var(--color-primary);
}

.job-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-block-end: 0.5rem;
}

.job-card__title {
  font-size: 1.05rem;
  font-weight: 600;
}

.job-card__wage {
  color: var(--color-success);
  font-weight: 700;
  font-size: 1rem;
  white-space: nowrap;
}

.job-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin-block-end: 0.5rem;
}

.job-card__desc {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin-block-end: 0.75rem;
}

.job-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.job-card__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
}

.job-card__actions-primary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.job-card__actions-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  opacity: 0.8;
}

.job-card__actions-secondary .btn {
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}

.job-card__workers {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* ── Cost Preview ──────────────────────────────────────────── */
.cost-preview {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem;
  margin-block-end: 1.25rem;
}

.cost-row {
  display: flex;
  justify-content: space-between;
  padding-block: 0.3rem;
  font-size: 0.95rem;
}

.cost-row--fee {
  color: var(--color-warning);
  font-size: 0.85rem;
}

/* ── Section Header ────────────────────────────────────────── */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-block-end: 1.25rem;
}

.filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* ── Welcome Card ──────────────────────────────────────────── */
.welcome-card {
  background: linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%);
  border-color: var(--color-primary);
}

/* ── Empty State ───────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-muted);
  padding: 2rem;
  font-size: 0.95rem;
  gap: 0.5rem;
}

.empty-state__icon {
  font-size: 2.5rem;
  opacity: 0.5;
  margin-block-end: 0.25rem;
}

.empty-state__text {
  font-size: 0.95rem;
  color: var(--color-text-muted);
}

.empty-state__hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  opacity: 0.7;
}

/* ── Footer ────────────────────────────────────────────────── */
.footer {
  text-align: center;
  padding-block: 1.5rem;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  border-block-start: 1px solid var(--color-border);
}

/* ── Utility ───────────────────────────────────────────────── */
.hidden {
  display: none !important;
}

/* ═══ Screen Reader Only ═══ */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* ── Loading Spinner ───────────────────────────────────────── */
.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.6s linear infinite;
  margin-inline-end: 0.4rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Notification Bell ─────────────────────────────────────── */
.notification-bell {
  position: relative;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.6rem;
  font-size: 1.2rem;
  cursor: pointer;
  transition: background var(--transition);
  color: var(--color-text);
}

.notification-bell:hover {
  background: var(--color-surface-2);
}

.notification-bell__badge {
  position: absolute;
  top: -4px;
  inset-inline-end: -4px;
  background: var(--color-error);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* ── Notification Overlay ──────────────────────────────── */
.notification-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 199;
}

.notification-overlay--visible {
  display: block;
}

/* ── Notification Drawer ───────────────────────────────── */
.notification-panel {
  position: fixed;
  top: 0;
  inset-inline-end: 0;
  width: 100%;
  max-width: 400px;
  height: 100vh;
  height: 100dvh;
  background: var(--color-surface);
  border-inline-start: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  z-index: 200;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--duration-slow, 0.3s) var(--ease-out, ease-out), visibility 0s linear var(--duration-slow, 0.3s);
  visibility: hidden;
}

.notification-panel--open {
  transform: translateX(0) !important;
  visibility: visible;
  transition: transform var(--duration-slow, 0.3s) var(--ease-out, ease-out), visibility 0s linear 0s;
}

.notification-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-block-end: 1px solid var(--color-border);
  flex-shrink: 0;
}

.notification-panel__header h3 {
  font-size: 1rem;
  font-weight: 600;
}

.notification-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.notification-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  cursor: pointer;
  padding: 0.4rem 0.5rem;
  min-width: 32px;
  min-height: 32px;
  transition: color var(--transition), background var(--transition);
}

.notification-panel__close:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.notification-panel__list {
  overflow-y: auto;
  flex: 1;
  padding: 0.5rem;
}

.notification-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--color-text-muted);
  gap: 0.75rem;
}

.notification-panel__empty-icon {
  font-size: 2.5rem;
  opacity: 0.5;
}

.notification-panel__empty p {
  font-size: 0.95rem;
}

.notification-item {
  padding: 0.75rem 1rem;
  border-radius: var(--radius-sm);
  margin-block-end: 0.25rem;
  cursor: pointer;
  transition: background var(--transition);
}

.notification-item:hover {
  background: var(--color-surface-2);
}

.notification-item--unread {
  background: rgba(37, 99, 235, 0.08);
  border-inline-start: 3px solid var(--color-primary);
}

.notification-item__msg {
  font-size: 0.85rem;
  margin-block-end: 0.25rem;
}

.notification-item__time {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

/* ── Pagination ────────────────────────────────────────────── */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding-block: 1.5rem;
}

.pagination__info {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

/* ── Status Badges ─────────────────────────────────────────── */
.badge--status {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
}

.badge--open { background: var(--color-primary); color: #fff; }
.badge--filled { background: var(--color-warning); color: #000; }
.badge--in_progress { background: #3b82f6; color: #fff; }
.badge--completed { background: var(--color-success); color: #fff; }
.badge--expired { background: var(--color-text-muted); color: #fff; }
.badge--cancelled { background: var(--color-error); color: #fff; }

/* ── Job Card Header Right ─────────────────────────────────── */
.job-card__header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* ── Start/Complete Buttons ────────────────────────────────── */
.btn--success {
  background: var(--color-success);
  color: #fff;
}

.btn--success:hover:not(:disabled) {
  background: #16a34a;
}

/* ── Rating Display ────────────────────────────────────────── */
.rating-display {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.rating-display__stars {
  color: var(--color-warning);
  font-size: 0.9rem;
  letter-spacing: 1px;
}

.rating-display__count {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

/* ── Rating Modal ──────────────────────────────────────────── */
.rating-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 1rem;
}

.rating-modal__card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  width: 100%;
  max-width: 440px;
  box-shadow: var(--shadow-md);
}

.rating-modal__title {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  margin-block-end: 1.25rem;
  color: var(--color-text);
}

.rating-stars-input {
  display: flex;
  direction: ltr;
  justify-content: center;
  gap: 0.5rem;
  margin-block-end: 1rem;
}

.star-btn {
  background: transparent;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  padding: 0.2rem;
  transition: transform var(--transition), color var(--transition);
  color: var(--color-border);
  line-height: 1;
}

.star-btn:hover {
  transform: scale(1.2);
  color: var(--color-warning);
}

.star-btn.active {
  color: var(--color-warning);
  transform: scale(1.15);
}

.rating-comment-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  min-height: 70px;
  margin-block-end: 1rem;
  outline: none;
  transition: border-color var(--transition);
}

.rating-comment-input:focus {
  border-color: var(--color-primary);
}

.rating-comment-input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.7;
}

.rating-modal__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.rating-modal__error {
  text-align: center;
  color: var(--color-error);
  font-size: 0.85rem;
  margin-block-end: 0.75rem;
  min-height: 1.2em;
}

.btn--warning {
  background: var(--color-warning);
  color: #000;
}

.btn--warning:hover:not(:disabled) {
  background: #d97706;
}

/* ── Header Brand Link ─────────────────────────────────────── */
.header__brand-link {
  text-decoration: none;
  color: inherit;
}

.header__brand-link:hover {
  opacity: 0.85;
}

/* ── Profile Page ──────────────────────────────────────────── */
.profile-header {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.profile-avatar {
  width: 72px;
  height: 72px;
  background: var(--color-surface-2);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  flex-shrink: 0;
}

.profile-details {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 1.4rem;
  font-weight: 700;
  margin-block-end: 0.25rem;
}

.profile-phone {
  color: var(--color-text-muted);
  font-size: 0.9rem;
  direction: ltr;
  display: inline-block;
}

.profile-gov {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.profile-rating-summary {
  flex-shrink: 0;
  text-align: center;
  min-width: 100px;
}

.profile-categories {
  border-block-start: 1px solid var(--color-border);
  padding-block-start: 1rem;
  margin-block-start: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* ── Rating Summary Card ───────────────────────────────────── */
.rating-summary-card {
  text-align: center;
  padding: 1.5rem;
}

.rating-summary-avg {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-warning);
  line-height: 1.2;
}

.rating-summary-stars {
  color: var(--color-warning);
  font-size: 1.2rem;
  letter-spacing: 2px;
  margin-block: 0.25rem;
}

.rating-summary-count {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.rating-summary-msg {
  color: var(--color-text-muted);
  font-size: 0.9rem;
  padding: 1rem 0;
}

/* ── Rating Distribution ───────────────────────────────────── */
.rating-dist {
  max-width: 400px;
  margin-inline: auto;
  padding-block: 1rem;
}

.rating-dist-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-block-end: 0.4rem;
}

.rating-dist-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  min-width: 30px;
  text-align: end;
}

.rating-dist-bar {
  flex: 1;
  height: 8px;
  background: var(--color-surface-2);
  border-radius: 4px;
  overflow: hidden;
}

.rating-dist-fill {
  height: 100%;
  background: var(--color-warning);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.rating-dist-count {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  min-width: 20px;
}

/* ── Ratings List ──────────────────────────────────────────── */
.ratings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.rating-item {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  padding: 1rem;
  border-radius: var(--radius-md);
}

.rating-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-block-end: 0.4rem;
}

.rating-item__stars {
  color: var(--color-warning);
  font-size: 1rem;
  letter-spacing: 1px;
}

.rating-item__date {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.rating-item__comment {
  color: var(--color-text);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rating-item__from {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  margin-block-start: 0.3rem;
}

/* ── Application Card (Profile) ────────────────────────────── */
.app-card {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.app-card__info {
  flex: 1;
  min-width: 0;
}

.app-card__title {
  font-weight: 600;
  font-size: 0.95rem;
  margin-block-end: 0.2rem;
}

.app-card__meta {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.app-card__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* ── My Jobs Card (Profile) ────────────────────────────────── */
.myjob-card {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.myjob-card__info {
  flex: 1;
  min-width: 0;
}

.myjob-card__title {
  font-weight: 600;
  font-size: 0.95rem;
  margin-block-end: 0.2rem;
}

.myjob-card__meta {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

/* ── Section Separator ─────────────────────────────────────── */
.section-divider {
  border: none;
  border-block-start: 1px solid var(--color-border);
  margin-block: 1.5rem;
}

/* ── Payment Badges ──────────────────────────────────────── */
.payment-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
}
.payment-badge--pending {
  background-color: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
.payment-badge--employer_confirmed {
  background-color: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}
.payment-badge--completed {
  background-color: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.payment-badge--disputed {
  background-color: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.payment-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

/* ── Financial Cards ─────────────────────────────────────── */
.financial-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-block-end: 1rem;
}
.financial-card {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  text-align: center;
}
.financial-card__value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-primary);
  margin-block-end: 0.25rem;
}
.financial-card__label {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.financial-card__value--currency::after {
  content: ' جنيه';
  font-size: 0.9rem;
  font-weight: 400;
  opacity: 0.7;
}

/* ── Distance Badge ──────────────────────────────────────── */
.job-distance {
  display: inline-block;
  background: rgba(37, 99, 235, 0.15);
  color: #60a5fa;
  padding: 0.15rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 500;
  margin-inline-start: 0.5rem;
}

/* ── Location Input Group ────────────────────────────────── */
.location-group {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.location-group .form-group {
  flex: 1;
  min-width: 120px;
  margin-block-end: 0;
}

.btn-detect-location {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(37, 99, 235, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(37, 99, 235, 0.3);
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: inherit;
  transition: background 0.2s;
  margin-block-start: 0.5rem;
}
.btn-detect-location:hover {
  background: rgba(37, 99, 235, 0.25);
}
.btn-detect-location:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* ── Focus Visible ─────────────────────────────────────────── */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

button:focus:not(:focus-visible),
a:focus:not(:focus-visible),
input:focus:not(:focus-visible),
select:focus:not(:focus-visible),
textarea:focus:not(:focus-visible) {
  outline: none;
}

/* ── Responsive ────────────────────────────────────────────── */
@media (max-width: 600px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    align-items: stretch;
  }

  .filters {
    flex-direction: column;
  }

  .header__inner {
    flex-direction: row;
    text-align: start;
    flex-wrap: nowrap;
    justify-content: space-between;
  }

  .header__left {
    gap: 0.4rem;
  }

  .header__user,
  .header__tagline {
    display: none;
  }

  .header__logo {
    width: 28px;
    height: 28px;
  }

  .header__brand {
    font-size: 1.2rem;
  }

  .job-card__header {
    flex-direction: column;
    gap: 0.3rem;
  }

  .job-card__actions {
    width: 100%;
    align-items: stretch;
  }

  .job-card__actions-primary,
  .job-card__actions-secondary {
    justify-content: flex-start;
  }

  .notification-panel {
    max-width: 100%;
  }
}

/* ═══ PWA Install Banner ═══ */
.install-banner {
  display: none;
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  right: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1rem;
  z-index: 1000;
  text-align: center;
  box-shadow: var(--shadow-md);
}

.install-banner button {
  margin-top: 0.5rem;
}

/* ═══ Admin Pagination ═══ */
.admin-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
  padding: 0.5rem;
}

.page-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 0.4rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-family: inherit;
  transition: opacity var(--transition);
}

.page-btn:hover {
  opacity: 0.85;
}

.page-info {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

/* ═══ User Status Badges ═══ */
.badge-banned {
  display: inline-block;
  background: var(--color-error);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-active {
  display: inline-block;
  background: var(--color-success);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* ═══ Report System ═══ */
.report-btn {
  background: transparent;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0.5;
}

.job-card:hover .report-btn,
.report-btn:focus-visible {
  opacity: 1;
}

.report-btn:hover {
  color: #ef4444;
  border-color: #ef4444;
  opacity: 1;
}

.report-form {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  margin-top: 0.5rem;
}

.report-form select,
.report-form textarea {
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-family: inherit;
}

.report-form textarea {
  min-height: 80px;
  resize: vertical;
}

.trust-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 0.75rem;
}

.trust-badge.trust-high { border-color: #16a34a; color: #16a34a; }
.trust-badge.trust-medium { border-color: #eab308; color: #eab308; }
.trust-badge.trust-low { border-color: #ef4444; color: #ef4444; }

.report-status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.report-status-pending { background: #eab308; color: #000; }
.report-status-action_taken { background: #ef4444; color: #fff; }
.report-status-dismissed { background: #6b7280; color: #fff; }
.report-status-reviewed { background: #3b82f6; color: #fff; }

#report-status-filter {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  font-family: inherit;
}

/* ═══ Notification Preferences ═══ */
.pref-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-block: 1rem;
}

.pref-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  cursor: pointer;
}

.pref-item input[type="checkbox"] {
  width: 1.2rem;
  height: 1.2rem;
  accent-color: var(--color-primary);
}

.pref-item input[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

#save-prefs-btn {
  align-self: flex-start;
  margin-block-start: 0.5rem;
}

/* ═══ Verification Badges ═══ */
.verification-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.verification-badge--verified {
  background: rgba(34, 197, 94, 0.15);
  color: var(--color-success);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.verification-badge--unverified {
  background: rgba(139, 143, 163, 0.1);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.verification-badge--pending {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-warning);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.verification-badge--rejected {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.verification-status {
  margin-block-end: 1rem;
}

/* ═══ Trust Score Display ═══ */
.trust-score-display {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.3rem;
  padding: 1.5rem;
}

.trust-score-value {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
}

.trust-score-label {
  font-size: 1.2rem;
  color: var(--color-text-muted);
}

.trust-high .trust-score-value { color: var(--color-success); }
.trust-medium .trust-score-value { color: var(--color-warning); }
.trust-low .trust-score-value { color: var(--color-error); }

/* ═══ Public Profile Page ═══ */
.pub-profile-header {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.worker-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.85rem;
}

.worker-link:hover {
  text-decoration: underline;
}

#verification-status-filter {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  font-family: inherit;
}

/* ═══ SSE Notification Badge Animation ═══ */
.notification-badge-live {
  animation: badge-pulse 2s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

/* ═══ Renew Button ═══ */
.btn-renew {
  background: var(--color-warning);
  color: #000;
  border: none;
  font-weight: 600;
}

.btn-renew:hover:not(:disabled) {
  filter: brightness(0.9);
}

/* ═══ Skip Link (Accessibility) ═══ */
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  right: 0;
  background: var(--color-primary);
  color: #fff;
  padding: 0.75rem 1.5rem;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  z-index: 9999;
  text-decoration: none;
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
}

/* ═══ Spacing Scale ═══ */
:root {
  --space-xs:  0.25rem;
  --space-sm:  0.5rem;
  --space-md:  1rem;
  --space-lg:  1.5rem;
  --space-xl:  2rem;
  --space-2xl: 3rem;
}

/* ═══ Icon Utilities ═══ */
.icon-inline {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  flex-shrink: 0;
}

.icon-sm svg {
  width: 16px;
  height: 16px;
}

.icon-md svg {
  width: 20px;
  height: 20px;
}

.icon-lg svg {
  width: 28px;
  height: 28px;
}

.star-icon {
  color: var(--color-warning);
}

.star-filled {
  color: var(--color-warning);
}

.star-empty {
  color: var(--color-border);
}

/* ═══ Admin Styles (migrated from admin.html inline) ═══ */
.admin-container {
  max-width: 1000px;
  margin-inline: auto;
  padding: 2rem 1rem;
}

.admin-header {
  text-align: center;
  margin-block-end: 2rem;
}

.admin-header h1 {
  font-size: 1.8rem;
  color: var(--color-primary);
  margin-block-end: 0.3rem;
}

.admin-header p {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.token-form {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  align-items: center;
  margin-block-end: 1.5rem;
  flex-wrap: wrap;
}

.token-form input {
  max-width: 320px;
  flex: 1;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-block-end: 2rem;
}

.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  text-align: center;
}

.stat-card__value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.2;
}

.stat-card__label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin-block-start: 0.3rem;
}

.admin-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-block-end: 1.5rem;
}

.admin-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-block-end: 1rem;
}

.admin-section__header h2 {
  font-size: 1.15rem;
  color: var(--color-text);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.admin-table th,
.admin-table td {
  padding: 0.6rem 0.75rem;
  border-block-end: 1px solid var(--color-border);
  text-align: start;
}

.admin-table th {
  color: var(--color-text-muted);
  font-weight: 600;
  font-size: 0.8rem;
  background: var(--color-surface-2);
}

.admin-table td {
  color: var(--color-text);
}

.health-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0;
  border-block-end: 1px solid var(--color-border);
  font-size: 0.9rem;
}

.health-row:last-child {
  border-block-end: none;
}

.health-row__label {
  color: var(--color-text-muted);
}

.health-row__value {
  color: var(--color-text);
  font-weight: 600;
}

.badge-worker {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-success);
  color: #fff;
}

.badge-employer {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-warning);
  color: #000;
}

.badge-admin {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-error);
  color: #fff;
}

.badge-open {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-primary);
  color: #fff;
}

.badge-filled {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-success);
  color: #fff;
}

.badge-in_progress {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-warning);
  color: #000;
}

.badge-completed {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: #8b5cf6;
  color: #fff;
}

.badge-cancelled {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-error);
  color: #fff;
}

.badge-expired {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  background: var(--color-text-muted);
  color: #fff;
}

.error-msg {
  text-align: center;
  color: var(--color-error);
  font-size: 0.9rem;
  margin-block-end: 1rem;
  display: none;
}

.refresh-btn {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  background: transparent;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.refresh-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.phone-cell {
  direction: ltr;
  display: inline-block;
}

@media (max-width: 600px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .admin-table {
    font-size: 0.75rem;
  }
  .admin-table th,
  .admin-table td {
    padding: 0.4rem 0.5rem;
  }
}

/* ═══ Attendance Styles ═══ */
.btn-checkin {
  background: #059669;
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  margin-inline-end: 0.5rem;
}
.btn-checkin:hover:not(:disabled) { background: #047857; }

.btn-checkout {
  background: #d97706;
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  margin-inline-end: 0.5rem;
}
.btn-checkout:hover:not(:disabled) { background: #b45309; }

.btn-noshow {
  background: #dc2626;
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
}
.btn-noshow:hover:not(:disabled) { background: #b91c1c; }

.attendance-record {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  margin-block-end: 0.5rem;
  font-size: 0.875rem;
}

.attendance-status-checked_in { color: #34d399; }
.attendance-status-checked_out { color: #fbbf24; }
.attendance-status-confirmed { color: #60a5fa; }
.attendance-status-no_show { color: #f87171; }

/* ═══ Phase 19 — Toast Notification Styles ═══ */
.toast-container {
  position: fixed;
  bottom: calc(var(--space-4, 1rem) + var(--safe-bottom, 0px));
  inset-inline-start: var(--space-4, 1rem);
  inset-inline-end: var(--space-4, 1rem);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: var(--space-2, 0.5rem);
  z-index: var(--z-toast, 400);
  pointer-events: none;
  max-width: 480px;
  margin-inline: auto;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3, 0.75rem);
  width: 100%;
  padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
  background: var(--elevation-2, #242836);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  color: var(--color-text);
  font-size: 0.9rem;
  pointer-events: auto;
  opacity: 0;
  transform: translateY(1rem);
  transition: opacity var(--duration-normal, 0.2s) var(--ease-default, ease),
              transform var(--duration-normal, 0.2s) var(--ease-default, ease);
}

.toast--visible {
  opacity: 1;
  transform: translateY(0);
}

.toast--exit {
  opacity: 0;
  transform: translateY(1rem);
}

.toast__icon-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.toast__message {
  flex: 1;
  min-width: 0;
  line-height: 1.4;
}

.toast__close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: var(--space-1, 0.25rem);
  border-radius: var(--radius-xs, 4px);
  flex-shrink: 0;
  transition: color var(--duration-fast, 0.15s);
}

.toast__close:hover {
  color: var(--color-text);
}

.toast--success {
  border-inline-start: 3px solid var(--color-success);
}
.toast--success .toast__icon-wrap { color: var(--color-success); }

.toast--error {
  border-inline-start: 3px solid var(--color-error);
}
.toast--error .toast__icon-wrap { color: var(--color-error); }

.toast--warning {
  border-inline-start: 3px solid var(--color-warning);
}
.toast--warning .toast__icon-wrap { color: var(--color-warning); }

.toast--info {
  border-inline-start: 3px solid var(--color-primary);
}
.toast--info .toast__icon-wrap { color: var(--color-primary); }

/* ═══ Phase 26 — Custom Modal System ═══ */
.ym-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 1rem;
}

.ym-modal-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  width: 100%;
  max-width: 440px;
  box-shadow: var(--shadow-md);
}

.ym-modal-title {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  margin-block-end: 0.75rem;
  color: var(--color-text);
}

.ym-modal-message {
  text-align: center;
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin-block-end: 1.25rem;
  line-height: 1.6;
}

.ym-modal-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  min-height: 44px;
  margin-block-end: 0.5rem;
  outline: none;
  transition: border-color var(--transition);
}

.ym-modal-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.ym-modal-input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.7;
}

.ym-modal-error {
  text-align: center;
  color: var(--color-error);
  font-size: 0.85rem;
  margin-block-end: 0.75rem;
  min-height: 1.2em;
}

.ym-modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.ym-modal-btn--danger {
  background: var(--color-error);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition);
}

.ym-modal-btn--danger:hover:not(:disabled) {
  background: var(--color-error);
  filter: brightness(0.85);
}

/* ═══ Phase 19 — Skeleton Loading Styles ═══ */
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}

.skeleton {
  background: var(--elevation-2, #242836);
  border-radius: var(--radius-sm, 6px);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-text {
  height: 0.9rem;
  margin-block-end: 0.5rem;
  border-radius: var(--radius-xs, 4px);
}

.skeleton-text--lg {
  height: 1.2rem;
  width: 60%;
}

.skeleton-text--sm {
  height: 0.7rem;
  width: 40%;
}

.skeleton-circle {
  border-radius: var(--radius-full, 9999px);
}

.skeleton-card {
  background: var(--elevation-2, #242836);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

/* ═══ Phase 19 — Bottom Navigation ═══ */
.bottom-nav {
  display: none;
}

@media (max-width: 767px) {
  .bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--elevation-1, #1a1d27);
    border-block-start: 1px solid var(--color-border);
    z-index: var(--z-sticky, 100);
    padding-block-end: var(--safe-bottom, 0px);
    justify-content: space-around;
    align-items: center;
  }

  .bottom-nav__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 0.5rem 0.75rem;
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.65rem;
    font-family: inherit;
    transition: color var(--duration-fast, 0.15s);
    position: relative;
    -webkit-tap-highlight-color: transparent;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .bottom-nav__item--active {
    color: var(--color-primary);
  }

  .bottom-nav__item:hover {
    color: var(--color-text);
  }

  .bottom-nav__label {
    font-size: 0.65rem;
    line-height: 1;
  }

  .bottom-nav__badge {
    position: absolute;
    top: 2px;
    inset-inline-end: 4px;
    background: var(--color-error);
    color: #fff;
    font-size: 0.55rem;
    font-weight: 700;
    min-width: 14px;
    height: 14px;
    border-radius: var(--radius-full, 9999px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
  }

  /* Add padding to main content so bottom nav doesn't overlap */
  .main {
    padding-block-end: 4rem;
  }

  /* Adjust toast container when bottom nav is visible */
  .toast-container {
    bottom: calc(4rem + var(--safe-bottom, 0px));
  }
}

/* ═══ Phase 22 — Messaging Styles ═══ */
.messaging-panel {
  border-top: 1px solid var(--color-border);
  margin-top: 0.75rem;
  padding-top: 0.75rem;
}

.messaging-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.message-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 0.5rem;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  margin-bottom: 0.5rem;
}

.message-bubble {
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  margin-bottom: 0.4rem;
  max-width: 85%;
  font-size: 0.85rem;
}

.message-bubble--mine {
  background: rgba(37, 99, 235, 0.15);
  margin-inline-start: auto;
  border-bottom-left-radius: 4px;
}

.message-bubble--other {
  background: var(--color-surface-2);
  margin-inline-end: auto;
  border-bottom-right-radius: 4px;
}

.message-bubble__sender {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-bottom: 0.15rem;
}

.message-bubble__text {
  line-height: 1.5;
  word-wrap: break-word;
}

.message-bubble__time {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  text-align: end;
  margin-top: 0.15rem;
}

.message-send-form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.message-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
}

.message-input:focus {
  border-color: var(--color-primary);
}

.pending-badge {
  display: inline-block;
  background: rgba(239, 68, 68, 0.15);
  color: var(--color-error);
  padding: 0.15rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* ═══ Phase 24 — Applications Review Panel ═══ */
.applications-panel {
  border-block-start: 1px solid var(--color-border);
  margin-block-start: 0.75rem;
  padding-block-start: 0.75rem;
}

.applications-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-block-end: 0.5rem;
  font-size: 0.9rem;
}

.applications-panel__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
}

.app-review-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.app-review-card__info {
  flex: 1;
  min-width: 0;
}

.app-review-card__name {
  font-weight: 600;
  font-size: 0.9rem;
  margin-block-end: 0.15rem;
}

.app-review-card__meta {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.app-review-card__cats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-block-start: 0.3rem;
}

.app-review-card__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

/* ═══ Phase 24 — Attendance Panel ═══ */
.attendance-panel {
  border-block-start: 1px solid var(--color-border);
  margin-block-start: 0.75rem;
  padding-block-start: 0.75rem;
}

.attendance-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-block-end: 0.5rem;
  font-size: 0.9rem;
}

.attendance-panel__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 350px;
  overflow-y: auto;
}

.att-worker-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.att-worker-card__info {
  flex: 1;
  min-width: 0;
}

.att-worker-card__name {
  font-weight: 600;
  font-size: 0.9rem;
  margin-block-end: 0.15rem;
}

.att-worker-card__status {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.att-worker-card__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

/* ═══ Phase 24 — Message Recipient Picker ═══ */
.msg-recipient-picker {
  padding-block-end: 0.5rem;
}

.msg-recipient-picker select {
  width: 100%;
}

/* ═══ Phase 24 — Responsive ═══ */
@media (max-width: 600px) {
  .app-review-card {
    flex-direction: column;
    align-items: stretch;
  }

  .app-review-card__actions {
    justify-content: flex-start;
  }

  .att-worker-card {
    flex-direction: column;
    align-items: stretch;
  }

  .att-worker-card__actions {
    justify-content: flex-start;
  }
}

/* ═══ Phase 19 — Enhanced Card Animations ═══ */
.card {
  transition: box-shadow var(--duration-normal, 0.2s) var(--ease-default, ease),
              transform var(--duration-normal, 0.2s) var(--ease-default, ease),
              border-color var(--duration-normal, 0.2s) var(--ease-default, ease);
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.btn:active:not(:disabled) {
  transform: scale(0.96);
  transition-duration: var(--duration-fast, 0.15s);
}

.job-card {
  position: relative;
  overflow: hidden;
}

.job-card::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  inset-inline-start: 0;
  width: 3px;
  background: var(--color-border);
  transition: background var(--duration-normal, 0.2s);
}

.job-card[data-status="open"]::before { background: var(--color-primary); }
.job-card[data-status="filled"]::before { background: var(--color-warning); }
.job-card[data-status="in_progress"]::before { background: #3b82f6; }
.job-card[data-status="completed"]::before { background: var(--color-success); }
.job-card[data-status="expired"]::before { background: var(--color-text-muted); }
.job-card[data-status="cancelled"]::before { background: var(--color-error); }

@keyframes slide-up-fade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.jobs-list .job-card {
  animation: slide-up-fade var(--duration-slow, 0.3s) var(--ease-out, ease-out) both;
}

.jobs-list .job-card:nth-child(1) { animation-delay: 0ms; }
.jobs-list .job-card:nth-child(2) { animation-delay: 50ms; }
.jobs-list .job-card:nth-child(3) { animation-delay: 100ms; }
.jobs-list .job-card:nth-child(4) { animation-delay: 150ms; }
.jobs-list .job-card:nth-child(5) { animation-delay: 200ms; }
```

---

## `frontend/assets/css/tokens.css`

```css
/* ═══════════════════════════════════════════════════════════════
   tokens.css — يوميّة: Design Token System
   Phase 19 — Elevation, Colors, Spacing, Typography, Shadows,
              Transitions, Z-Index, Safe Areas
   ═══════════════════════════════════════════════════════════════ */

:root {
  /* ── Elevation Surfaces (Dark Theme) ───────────────────────── */
  --elevation-0: #0f1117;       /* Page background (deepest) */
  --elevation-1: #1a1d27;       /* Cards, panels */
  --elevation-2: #242836;       /* Nested surfaces, inputs */
  --elevation-3: #2e3347;       /* Modals, overlays, tooltips */

  /* ── Primary Color Scale ───────────────────────────────────── */
  --primary-50:  #eff6ff;
  --primary-100: #dbeafe;
  --primary-200: #bfdbfe;
  --primary-300: #93c5fd;
  --primary-400: #60a5fa;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-700: #1d4fd8;
  --primary-800: #1e40af;
  --primary-900: #1e3a8a;

  /* ── Semantic Colors ───────────────────────────────────────── */
  --success-500: #22c55e;
  --success-600: #16a34a;
  --warning-500: #f59e0b;
  --warning-600: #d97706;
  --error-500:   #ef4444;
  --error-600:   #dc2626;

  /* ── Text Hierarchy ────────────────────────────────────────── */
  --text-primary:   #e4e6f0;
  --text-secondary: #8b8fa3;
  --text-tertiary:  #6b7085;
  --text-disabled:  #4b4f63;
  --text-inverse:   #0f1117;

  /* ── Border Scale ──────────────────────────────────────────── */
  --border-subtle:  #252938;
  --border-default: #2e3347;
  --border-strong:  #3d4260;
  --border-focus:   rgba(37, 99, 235, 0.5);

  /* ── Spacing (8px Grid — 16 Steps) ─────────────────────────── */
  --space-1:  0.25rem;    /*  4px */
  --space-2:  0.5rem;     /*  8px */
  --space-3:  0.75rem;    /* 12px */
  --space-4:  1rem;       /* 16px */
  --space-5:  1.25rem;    /* 20px */
  --space-6:  1.5rem;     /* 24px */
  --space-7:  1.75rem;    /* 28px */
  --space-8:  2rem;       /* 32px */
  --space-9:  2.25rem;    /* 36px */
  --space-10: 2.5rem;     /* 40px */
  --space-11: 2.75rem;    /* 44px */
  --space-12: 3rem;       /* 48px */
  --space-13: 3.25rem;    /* 52px */
  --space-14: 3.5rem;     /* 56px */
  --space-15: 3.75rem;    /* 60px */
  --space-16: 4rem;       /* 64px */

  /* ── Typography Scale ──────────────────────────────────────── */
  --text-xs:   0.75rem;   /* 12px */
  --text-sm:   0.875rem;  /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg:   1.125rem;  /* 18px */
  --text-xl:   1.25rem;   /* 20px */
  --text-2xl:  1.5rem;    /* 24px */
  --text-3xl:  1.875rem;  /* 30px */
  --text-4xl:  2.25rem;   /* 36px */

  --leading-tight:   1.25;
  --leading-normal:  1.6;
  --leading-relaxed: 1.75;

  /* ── Radius Scale ──────────────────────────────────────────── */
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   16px;
  --radius-xl:   24px;
  --radius-full: 9999px;

  /* ── Shadow Scale ──────────────────────────────────────────── */
  --shadow-xs:   0 1px 2px rgba(0, 0, 0, 0.25);
  --shadow-sm:   0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md:   0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg:   0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-xl:   0 16px 48px rgba(0, 0, 0, 0.6);
  --shadow-glow: 0 0 16px rgba(37, 99, 235, 0.25);

  /* ── Transition Scale ──────────────────────────────────────── */
  --duration-fast:   0.15s;
  --duration-normal: 0.2s;
  --duration-slow:   0.3s;
  --duration-slower:  0.5s;

  --ease-default: ease;
  --ease-in:      ease-in;
  --ease-out:     ease-out;
  --ease-bounce:  cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ── Z-Index Scale ─────────────────────────────────────────── */
  --z-base:       1;
  --z-dropdown:   10;
  --z-sticky:     100;
  --z-overlay:    200;
  --z-modal:      300;
  --z-toast:      400;
  --z-popover:    500;
  --z-tooltip:    600;

  /* ── Container Widths ──────────────────────────────────────── */
  --container-sm: 480px;
  --container-md: 800px;
  --container-lg: 1000px;

  /* ── Safe Area Insets ──────────────────────────────────────── */
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left:   env(safe-area-inset-left, 0px);
  --safe-right:  env(safe-area-inset-right, 0px);
}
```

---

## `frontend/assets/js/admin.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/admin.js — Admin Dashboard Module (IIFE)
// ═══════════════════════════════════════════════════════════════

var AdminApp = (function () {
  'use strict';

  var token = '';
  var API = '';

  function escapeHtml(str) {
    return (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(str) : (str || '');
  }

  async function api(path) {
    var headers = { 'X-Admin-Token': token };
    var res = await fetch(API + path, { headers: headers });
    if (!res.ok) {
      var data = await res.json().catch(function () { return {}; });
      throw new Error(data.error || 'خطأ في الاتصال');
    }
    return await res.json();
  }

  function renderPagination(containerId, currentPage, totalPages, loadFn) {
    var container = document.getElementById(containerId);
    if (!container || totalPages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }
    var html = '<div class="admin-pagination">';
    if (currentPage > 1) {
      html += '<button class="page-btn" data-page="' + (currentPage - 1) + '">السابق</button>';
    }
    html += '<span class="page-info">صفحة ' + currentPage + ' من ' + totalPages + '</span>';
    if (currentPage < totalPages) {
      html += '<button class="page-btn" data-page="' + (currentPage + 1) + '">التالي</button>';
    }
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        loadFn(parseInt(btn.dataset.page));
      });
    });
  }

  async function apiWrite(method, path, body) {
    var headers = { 'X-Admin-Token': token, 'Content-Type': 'application/json' };
    var res = await fetch(API + path, { method: method, headers: headers, body: JSON.stringify(body) });
    if (!res.ok) {
      var data = await res.json().catch(function () { return {}; });
      throw new Error(data.error || 'خطأ في العملية');
    }
    return await res.json();
  }

  async function toggleBan(userId, newStatus) {
    try {
      var reason = '';
      if (newStatus === 'banned') {
        var promptResult = await YawmiaModal.prompt({ title: 'حظر المستخدم', message: 'سبب الحظر (اختياري)', placeholder: 'اكتب السبب...' });
        if (promptResult === null) return;
        reason = promptResult;
      }
      await apiWrite('PUT', '/api/admin/users/' + userId + '/status', { status: newStatus, reason: reason });
      await loadUsers();
    } catch (err) {
      showError(err.message || 'خطأ في تحديث حالة المستخدم');
    }
  }

  function showError(msg) {
    var el = document.getElementById('errorMsg');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () {
      el.style.display = 'none';
    }, 5000);
  }

  async function connect() {
    var input = document.getElementById('adminTokenInput');
    if (!input || !input.value.trim()) {
      showError('أدخل التوكن');
      return;
    }
    token = input.value.trim();

    try {
      await loadStats();
      // Success — show dashboard, hide form
      document.getElementById('tokenForm').style.display = 'none';
      document.getElementById('errorMsg').style.display = 'none';
      document.getElementById('dashboard').classList.remove('hidden');
      // Load remaining data in parallel
      Promise.all([loadHealth(), loadUsers(), loadJobs(), loadFinancials(), loadReports(), loadVerifications()]).catch(function () {});
    } catch (err) {
      showError('توكن غير صحيح أو خطأ في الاتصال');
    }
  }

  async function loadStats() {
    var data = await api('/api/admin/stats');
    var grid = document.getElementById('statsGrid');
    if (!grid) return;

    var stats = data.stats || data;

    var cards = [
      { value: stats.users ? stats.users.total : 0, label: 'إجمالي المستخدمين' },
      { value: stats.users ? stats.users.worker : 0, label: 'عمال' },
      { value: stats.users ? stats.users.employer : 0, label: 'أصحاب عمل' },
      { value: stats.jobs ? stats.jobs.total : 0, label: 'إجمالي الفرص' },
      { value: stats.jobs ? stats.jobs.open : 0, label: 'فرص مفتوحة' },
      { value: stats.jobs ? stats.jobs.completed : 0, label: 'فرص مكتملة' },
      { value: stats.applications ? stats.applications.total : 0, label: 'إجمالي الطلبات' },
      { value: stats.applications ? stats.applications.accepted : 0, label: 'طلبات مقبولة' },
      { value: stats.payments ? stats.payments.total : 0, label: 'إجمالي المدفوعات' },
      { value: stats.payments ? stats.payments.completed : 0, label: 'مدفوعات مكتملة' },
      { value: stats.payments ? stats.payments.disputed : 0, label: 'مدفوعات في نزاع' },
    ];

    grid.innerHTML = '';
    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML =
        '<div class="stat-card__value">' + escapeHtml(String(c.value)) + '</div>' +
        '<div class="stat-card__label">' + escapeHtml(c.label) + '</div>';
      grid.appendChild(card);
    });
  }

  async function loadHealth() {
    // Health is public — no token needed
    var res = await fetch(API + '/api/health');
    var data = await res.json();
    var container = document.getElementById('healthInfo');
    if (!container) return;

    var rows = [
      { label: 'الحالة', value: data.status === 'ok' ? '🟢 شغّال' : '🔴 متوقف' },
      { label: 'الإصدار', value: data.version || '-' },
      { label: 'الوقت', value: data.timestamp || '-' },
      { label: 'Uptime', value: data.uptime != null ? data.uptime + ' ثانية' : '-' },
      { label: 'Node.js', value: data.node || '-' },
      { label: 'Heap Used', value: data.memory ? data.memory.heapUsedMB + ' MB' : '-' },
      { label: 'RSS', value: data.memory ? data.memory.rssMB + ' MB' : '-' },
    ];

    container.innerHTML = '';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'health-row';
      row.innerHTML =
        '<span class="health-row__label">' + escapeHtml(r.label) + '</span>' +
        '<span class="health-row__value">' + escapeHtml(String(r.value)) + '</span>';
      container.appendChild(row);
    });
  }

  async function loadUsers(page) {
    page = page || 1;
    var data = await api('/api/admin/users?page=' + page + '&limit=20');
    var container = document.getElementById('usersTable');
    if (!container) return;

    var users = data.users || [];

    if (users.length === 0) {
      container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا يوجد مستخدمين</p>';
      renderPagination('users-pagination', 1, 1, loadUsers);
      return;
    }

    var roleLabels = { worker: 'عامل', employer: 'صاحب عمل', admin: 'أدمن' };
    var statusLabels = { active: 'نشط', banned: 'محظور' };

    var html = '<table class="admin-table"><thead><tr>' +
      '<th>الاسم</th><th>الموبايل</th><th>النوع</th><th>الحالة</th><th>المحافظة</th><th>تاريخ التسجيل</th><th>إجراء</th>' +
      '</tr></thead><tbody>';

    users.forEach(function (u) {
      var roleBadgeClass = 'badge-' + (u.role || 'worker');
      var roleText = roleLabels[u.role] || u.role || '-';
      var statusClass = u.status === 'banned' ? 'badge-banned' : 'badge-active';
      var statusText = statusLabels[u.status] || u.status || '-';
      var dateText = u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-EG') : '-';

      var actionBtn = '';
      if (u.role !== 'admin') {
        if (u.status === 'banned') {
          actionBtn = '<button class="btn btn--sm btn--success" onclick="AdminApp.toggleBan(\'' + escapeHtml(u.id) + '\', \'active\')">إلغاء الحظر</button>';
        } else {
          actionBtn = '<button class="btn btn--sm btn--ghost" style="color:var(--color-error);border-color:var(--color-error);" onclick="AdminApp.toggleBan(\'' + escapeHtml(u.id) + '\', \'banned\')">حظر</button>';
        }
      }

      html += '<tr>' +
        '<td>' + escapeHtml(u.name || '-') + '</td>' +
        '<td><span class="phone-cell">' + escapeHtml(u.phone || '-') + '</span></td>' +
        '<td><span class="' + roleBadgeClass + '">' + escapeHtml(roleText) + '</span></td>' +
        '<td><span class="' + statusClass + '">' + escapeHtml(statusText) + '</span></td>' +
        '<td>' + escapeHtml(u.governorate || '-') + '</td>' +
        '<td>' + escapeHtml(dateText) + '</td>' +
        '<td>' + actionBtn + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    renderPagination('users-pagination', data.page || 1, data.totalPages || 1, loadUsers);
  }

  async function loadJobs(page) {
    page = page || 1;
    var data = await api('/api/admin/jobs?page=' + page + '&limit=20');
    var container = document.getElementById('jobsTable');
    if (!container) return;

    var jobs = data.jobs || [];

    if (jobs.length === 0) {
      container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا يوجد فرص</p>';
      renderPagination('jobs-pagination', 1, 1, loadJobs);
      return;
    }

    var statusLabels = {
      open: 'مفتوحة',
      filled: 'مكتملة',
      in_progress: 'جاري التنفيذ',
      completed: 'منتهية',
      cancelled: 'ملغية',
      expired: 'منتهية الصلاحية',
    };

    var html = '<table class="admin-table"><thead><tr>' +
      '<th>العنوان</th><th>المحافظة</th><th>اليومية (ج.م)</th><th>الحالة</th><th>عمال</th><th>تاريخ الإنشاء</th>' +
      '</tr></thead><tbody>';

    jobs.forEach(function (j) {
      var statusClass = 'badge-' + (j.status || 'open');
      var statusText = statusLabels[j.status] || j.status || '-';
      var workersText = (j.workersAccepted || 0) + '/' + (j.workersNeeded || 0);
      var dateText = j.createdAt ? new Date(j.createdAt).toLocaleDateString('ar-EG') : '-';

      html += '<tr>' +
        '<td>' + escapeHtml(j.title || '-') + '</td>' +
        '<td>' + escapeHtml(j.governorate || '-') + '</td>' +
        '<td>' + escapeHtml(String(j.dailyWage || 0)) + '</td>' +
        '<td><span class="' + statusClass + '">' + escapeHtml(statusText) + '</span></td>' +
        '<td>' + escapeHtml(workersText) + '</td>' +
        '<td>' + escapeHtml(dateText) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    renderPagination('jobs-pagination', data.page || 1, data.totalPages || 1, loadJobs);
  }

  async function loadFinancials() {
    try {
      var data = await api('/api/admin/financial-summary');
      var container = document.getElementById('financialGrid');
      if (!container) return;

      var summary = data.summary || {};

      var cards = [
        { value: summary.totalPayments || 0, label: 'إجمالي المدفوعات', isCurrency: false },
        { value: summary.totalAmount || 0, label: 'إجمالي المبالغ', isCurrency: true },
        { value: summary.completedPlatformFee || 0, label: 'عمولة محصّلة', isCurrency: true },
        { value: summary.pendingPlatformFee || 0, label: 'عمولة معلّقة', isCurrency: true },
        { value: summary.disputedCount || 0, label: 'نزاعات مفتوحة', isCurrency: false },
      ];

      container.innerHTML = '';
      cards.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'financial-card';
        card.innerHTML =
          '<div class="financial-card__value' + (c.isCurrency ? ' financial-card__value--currency' : '') + '">' + escapeHtml(String(c.value)) + '</div>' +
          '<div class="financial-card__label">' + escapeHtml(c.label) + '</div>';
        container.appendChild(card);
      });
    } catch (err) {
      var container = document.getElementById('financialGrid');
      if (container) container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في تحميل البيانات المالية</p>';
    }
  }

  async function loadReports(page) {
    page = page || 1;
    var statusFilter = '';
    var filterEl = document.getElementById('report-status-filter');
    if (filterEl) statusFilter = filterEl.value;

    try {
      var query = '/api/admin/reports?page=' + page + '&limit=20';
      if (statusFilter) query += '&status=' + encodeURIComponent(statusFilter);
      var data = await api(query);
      var container = document.getElementById('reportsTable');
      if (!container) return;

      var reports = data.reports || [];

      if (reports.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا يوجد بلاغات</p>';
        renderPagination('reports-pagination', 1, 1, loadReports);
        return;
      }

      var typeLabels = {
        fraud: 'نصب',
        no_show: 'عدم حضور',
        harassment: 'إساءة',
        quality: 'جودة',
        payment_issue: 'مشكلة دفع',
        other: 'أخرى',
      };

      var statusLabels = {
        pending: 'قيد المراجعة',
        reviewed: 'تمت المراجعة',
        action_taken: 'تم اتخاذ إجراء',
        dismissed: 'مرفوض',
      };

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>المُبلِّغ</th><th>المُبلَّغ عنه</th><th>النوع</th><th>السبب</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th>' +
        '</tr></thead><tbody>';

      reports.forEach(function (r) {
        var typeText = typeLabels[r.type] || r.type || '-';
        var statusText = statusLabels[r.status] || r.status || '-';
        var statusClass = 'report-status-' + (r.status || 'pending');
        var reasonText = escapeHtml((r.reason || '').substring(0, 50));
        if ((r.reason || '').length > 50) reasonText += '...';
        var dateText = r.createdAt ? new Date(r.createdAt).toLocaleDateString('ar-EG') : '-';

        var actionBtns = '';
        if (r.status === 'pending') {
          actionBtns =
            '<button class="btn btn--sm btn--primary" onclick="AdminApp.reviewReport(\'' + escapeHtml(r.id) + '\', \'action_taken\')">إجراء</button> ' +
            '<button class="btn btn--sm btn--ghost" onclick="AdminApp.reviewReport(\'' + escapeHtml(r.id) + '\', \'dismissed\')">رفض</button>';
        }

        html += '<tr>' +
          '<td>' + escapeHtml(r.reporterId || '-') + '</td>' +
          '<td>' + escapeHtml(r.targetId || '-') + '</td>' +
          '<td>' + escapeHtml(typeText) + '</td>' +
          '<td>' + reasonText + '</td>' +
          '<td><span class="report-status-badge ' + statusClass + '">' + escapeHtml(statusText) + '</span></td>' +
          '<td>' + escapeHtml(dateText) + '</td>' +
          '<td>' + actionBtns + '</td>' +
          '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      renderPagination('reports-pagination', data.page || 1, data.totalPages || 1, loadReports);
    } catch (err) {
      var container = document.getElementById('reportsTable');
      if (container) container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في تحميل البلاغات</p>';
    }
  }

  async function reviewReport(reportId, newStatus) {
    try {
      var notes = '';
      if (newStatus === 'action_taken') {
        var promptResult = await YawmiaModal.prompt({ title: 'مراجعة البلاغ', message: 'ملاحظات الأدمن (اختياري)', placeholder: 'اكتب الملاحظات...' });
        if (promptResult === null) return;
        notes = promptResult;
      }
      await apiWrite('PUT', '/api/admin/reports/' + reportId, { status: newStatus, adminNotes: notes });
      await loadReports();
    } catch (err) {
      showError(err.message || 'خطأ في مراجعة البلاغ');
    }
  }

  async function loadVerifications(page) {
    page = page || 1;
    var statusFilter = '';
    var filterEl = document.getElementById('verification-status-filter');
    if (filterEl) statusFilter = filterEl.value;

    try {
      var query = '/api/admin/verifications?page=' + page + '&limit=20';
      if (statusFilter) query += '&status=' + encodeURIComponent(statusFilter);
      var data = await api(query);
      var container = document.getElementById('verificationsTable');
      if (!container) return;

      var verifications = data.verifications || [];

      if (verifications.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا يوجد طلبات تحقق</p>';
        renderPagination('verifications-pagination', 1, 1, loadVerifications);
        return;
      }

      var statusLabels = {
        pending: 'قيد المراجعة',
        verified: 'محقق',
        rejected: 'مرفوض',
      };

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>المعرّف</th><th>المستخدم</th><th>الحالة</th><th>التاريخ</th><th>ملاحظات</th><th>إجراء</th>' +
        '</tr></thead><tbody>';

      verifications.forEach(function (v) {
        var statusText = statusLabels[v.status] || v.status || '-';
        var dateText = v.createdAt ? new Date(v.createdAt).toLocaleDateString('ar-EG') : '-';
        var notesText = v.adminNotes ? escapeHtml(v.adminNotes.substring(0, 40)) : '-';

        var actionBtns = '';
        if (v.status === 'pending') {
          actionBtns =
            '<button class="btn btn--sm btn--success" onclick="AdminApp.reviewVerification(\'' + escapeHtml(v.id) + '\', \'verified\')">✓ قبول</button> ' +
            '<button class="btn btn--sm btn--ghost" style="color:var(--color-error);border-color:var(--color-error);" onclick="AdminApp.reviewVerification(\'' + escapeHtml(v.id) + '\', \'rejected\')">✗ رفض</button>';
        }

        html += '<tr>' +
          '<td>' + escapeHtml(v.id || '-') + '</td>' +
          '<td><a href="/user.html?id=' + escapeHtml(v.userId) + '" class="worker-link">' + escapeHtml(v.userId || '-') + '</a></td>' +
          '<td>' + escapeHtml(statusText) + '</td>' +
          '<td>' + escapeHtml(dateText) + '</td>' +
          '<td>' + notesText + '</td>' +
          '<td>' + actionBtns + '</td>' +
          '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      renderPagination('verifications-pagination', data.page || 1, data.totalPages || 1, loadVerifications);
    } catch (err) {
      var container = document.getElementById('verificationsTable');
      if (container) container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في تحميل طلبات التحقق</p>';
    }
  }

  async function reviewVerification(verificationId, newStatus) {
    try {
      var notes = '';
      if (newStatus === 'rejected') {
        var promptResult = await YawmiaModal.prompt({ title: 'رفض طلب التحقق', message: 'سبب الرفض (اختياري)', placeholder: 'اكتب السبب...' });
        if (promptResult === null) return;
        notes = promptResult;
      }
      await apiWrite('PUT', '/api/admin/verifications/' + verificationId, { status: newStatus, adminNotes: notes });
      await loadVerifications();
    } catch (err) {
      showError(err.message || 'خطأ في مراجعة طلب التحقق');
    }
  }

  return {
    connect: connect,
    loadHealth: loadHealth,
    loadUsers: loadUsers,
    loadJobs: loadJobs,
    loadStats: loadStats,
    loadFinancials: loadFinancials,
    toggleBan: toggleBan,
    loadReports: loadReports,
    reviewReport: reviewReport,
    loadVerifications: loadVerifications,
    reviewVerification: reviewVerification,
  };
})();
```

---

## `frontend/assets/js/app.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/app.js — Core Frontend Module (IIFE)
// ═══════════════════════════════════════════════════════════════

var Yawmia = (function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  const state = {
    token: localStorage.getItem('yawmia_token') || null,
    user: JSON.parse(localStorage.getItem('yawmia_user') || 'null'),
    config: null,
  };

  // ── API Base URL ──────────────────────────────────────────
  const API_BASE = window.location.origin;

  // ── API Helper ────────────────────────────────────────────
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
      headers['Authorization'] = 'Bearer ' + state.token;
    }
    const opts = { method, headers };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (!res.ok && res.status === 401) {
      // Session expired
      logout();
    }
    return { status: res.status, data };
  }

  // ── Auth State ────────────────────────────────────────────
  function setAuth(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('yawmia_token', token);
    localStorage.setItem('yawmia_user', JSON.stringify(user));
  }

  function logout() {
    disconnectSSE();
    if (state.token) {
      api('POST', '/api/auth/logout').catch(function () {});
    }
    state.token = null;
    state.user = null;
    localStorage.removeItem('yawmia_token');
    localStorage.removeItem('yawmia_user');
    window.location.href = '/';
  }

  function isLoggedIn() {
    return !!state.token;
  }

  function getUser() {
    return state.user;
  }

  function getToken() {
    return state.token;
  }

  // ── Config ────────────────────────────────────────────────
  async function loadConfig() {
    if (state.config) return state.config;
    var res = await api('GET', '/api/config');
    if (res.status === 200) {
      state.config = res.data;
    }
    return state.config;
  }

  // ── DOM Helpers ───────────────────────────────────────────
  function $(selector) {
    return document.querySelector(selector);
  }

  function $id(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (typeof el === 'string') el = $id(el);
    if (el) el.classList.remove('hidden');
  }

  function hide(el) {
    if (typeof el === 'string') el = $id(el);
    if (el) el.classList.add('hidden');
  }

  function showMessage(elId, text, type) {
    var el = $id(elId);
    if (!el) return;
    el.textContent = text;
    el.className = 'message message--' + type;
  }

  function clearMessage(elId) {
    var el = $id(elId);
    if (!el) return;
    el.textContent = '';
    el.className = 'message';
  }

  function setLoading(btn, loading) {
    if (typeof btn === 'string') btn = $id(btn);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span> جاري...';
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
    }
  }

  // ── Populate Dropdowns ────────────────────────────────────
  async function populateGovernorates(selectId) {
    var config = await loadConfig();
    if (!config || !config.REGIONS) return;
    var select = $id(selectId);
    if (!select) return;
    // Keep first option
    while (select.children.length > 1) select.removeChild(select.lastChild);
    config.REGIONS.governorates.forEach(function (gov) {
      var opt = document.createElement('option');
      opt.value = gov.id;
      opt.textContent = gov.label;
      select.appendChild(opt);
    });
  }

  async function populateCategories(selectId) {
    var config = await loadConfig();
    if (!config || !config.LABOR_CATEGORIES) return;
    var select = $id(selectId);
    if (!select) return;
    while (select.children.length > 1) select.removeChild(select.lastChild);
    config.LABOR_CATEGORIES.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.icon + ' ' + cat.label;
      select.appendChild(opt);
    });
  }

  async function populateCategoriesCheckboxes(containerId) {
    var config = await loadConfig();
    if (!config || !config.LABOR_CATEGORIES) return;
    var container = $id(containerId);
    if (!container) return;
    container.innerHTML = '';
    config.LABOR_CATEGORIES.forEach(function (cat) {
      var label = document.createElement('label');
      label.className = 'checkbox-label';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'categories';
      input.value = cat.id;
      var span = document.createElement('span');
      span.textContent = cat.icon + ' ' + cat.label;
      label.appendChild(input);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  // ── Role Labels ───────────────────────────────────────────
  function roleLabel(role) {
    if (typeof YawmiaUtils !== 'undefined') return YawmiaUtils.roleLabel(role);
    if (role === 'worker') return 'عامل';
    if (role === 'employer') return 'صاحب عمل';
    if (role === 'admin') return 'أدمن';
    return role;
  }

  // ── PWA: Service Worker Registration ──────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) { console.log('SW registered:', reg.scope); })
        .catch(function (err) { console.log('SW registration failed:', err); });
    });
  }

  // ── Render data-icon elements after DOM ready ─────────────
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof YawmiaIcons !== 'undefined') YawmiaIcons.renderAll();
    });
  }

  // ── PWA: Install Prompt Capture ───────────────────────────
  var deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.addEventListener('click', function () {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function () {
          deferredInstallPrompt = null;
          installBtn.style.display = 'none';
        });
      }, { once: true });
    }
  });

  // ── SSE: Real-Time Notifications ──────────────────────────
  var sseConnection = null;

  function connectSSE() {
    if (sseConnection) return; // Already connected
    if (!state.token) return;  // Not logged in

    try {
      var url = API_BASE + '/api/notifications/stream?token=' + encodeURIComponent(state.token);
      sseConnection = new EventSource(url);

      sseConnection.addEventListener('init', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:sse-init', { detail: data }));
        } catch (_) { /* ignore */ }
      });

      sseConnection.addEventListener('notification', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:notification', { detail: data }));
        } catch (_) { /* ignore */ }
      });

      sseConnection.onerror = function () {
        // EventSource auto-reconnects — no manual action needed
      };
    } catch (_) {
      // SSE not supported or connection failed — degrade gracefully
      sseConnection = null;
    }
  }

  function disconnectSSE() {
    if (sseConnection) {
      sseConnection.close();
      sseConnection = null;
    }
  }

  // ── Web Push: Subscribe ───────────────────────────────────
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function subscribeToPush() {
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;
    if (!state.token) return;
    try {
      var registration = await navigator.serviceWorker.ready;
      var existing = await registration.pushManager.getSubscription();
      if (existing) return; // Already subscribed

      var permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Get VAPID public key from server config
      var cfg = await loadConfig();
      var vapidKey = cfg && cfg.WEB_PUSH && cfg.WEB_PUSH.vapidPublicKey;
      if (!vapidKey) return;

      var subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Extract keys
      var p256dhKey = subscription.getKey('p256dh');
      var authKey = subscription.getKey('auth');
      if (!p256dhKey || !authKey) return;

      var p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(p256dhKey)));
      var auth = btoa(String.fromCharCode.apply(null, new Uint8Array(authKey)));

      await api('POST', '/api/push/subscribe', {
        endpoint: subscription.endpoint,
        keys: { p256dh: p256dh, auth: auth },
      });
    } catch (_) {
      // Push subscription failure is non-fatal
    }
  }

  // ── Global Error Boundary ─────────────────────────────────
  window.addEventListener('unhandledrejection', function (e) {
    console.error('[Yawmia] Unhandled rejection:', e.reason);
    if (typeof YawmiaToast !== 'undefined') {
      YawmiaToast.error('حصل خطأ غير متوقع — حاول تاني');
    }
  });

  window.addEventListener('error', function (e) {
    console.error('[Yawmia] Unhandled error:', e.error || e.message);
    if (typeof YawmiaToast !== 'undefined') {
      YawmiaToast.error('حصل خطأ غير متوقع');
    }
  });

  // ── Public API ────────────────────────────────────────────
  return {
    api: api,
    state: state,
    setAuth: setAuth,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getUser: getUser,
    getToken: getToken,
    loadConfig: loadConfig,
    $: $,
    $id: $id,
    show: show,
    hide: hide,
    showMessage: showMessage,
    clearMessage: clearMessage,
    setLoading: setLoading,
    populateGovernorates: populateGovernorates,
    populateCategories: populateCategories,
    populateCategoriesCheckboxes: populateCategoriesCheckboxes,
    roleLabel: roleLabel,
    connectSSE: connectSSE,
    disconnectSSE: disconnectSSE,
    subscribeToPush: subscribeToPush,
  };
})();
```

---

## `frontend/assets/js/auth.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/auth.js — Auth UI Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // If already logged in, redirect to dashboard
  if (Yawmia.isLoggedIn()) {
    window.location.href = '/dashboard.html';
    return;
  }

  var currentPhone = '';
  var currentRole = 'worker';

  // ── Step 1: Send OTP ──────────────────────────────────────
  var btnSendOtp = Yawmia.$id('btnSendOtp');
  if (btnSendOtp) {
    btnSendOtp.addEventListener('click', async function () {
      Yawmia.clearMessage('phoneError');

      var phone = Yawmia.$id('phoneInput').value.trim();
      var roleEl = document.querySelector('input[name="role"]:checked');
      var role = roleEl ? roleEl.value : 'worker';

      if (!phone) {
        return Yawmia.showMessage('phoneError', 'أدخل رقم الموبايل', 'error');
      }

      Yawmia.setLoading(btnSendOtp, true);

      try {
        var res = await Yawmia.api('POST', '/api/auth/send-otp', { phone: phone, role: role });
        if (res.data.ok) {
          currentPhone = phone;
          currentRole = role;
          Yawmia.hide('stepPhone');
          Yawmia.show('stepOtp');
          Yawmia.$id('otpPhone').textContent = phone;
          Yawmia.$id('otpInput').focus();
        } else {
          Yawmia.showMessage('phoneError', res.data.error || 'خطأ في إرسال الكود', 'error');
        }
      } catch (err) {
        Yawmia.showMessage('phoneError', 'خطأ في الاتصال بالسيرفر', 'error');
      } finally {
        Yawmia.setLoading(btnSendOtp, false);
      }
    });
  }

  // ── Step 2: Verify OTP ────────────────────────────────────
  var btnVerifyOtp = Yawmia.$id('btnVerifyOtp');
  if (btnVerifyOtp) {
    btnVerifyOtp.addEventListener('click', async function () {
      Yawmia.clearMessage('otpError');

      var otp = Yawmia.$id('otpInput').value.trim();
      if (!otp) {
        return Yawmia.showMessage('otpError', 'أدخل كود التحقق', 'error');
      }

      Yawmia.setLoading(btnVerifyOtp, true);

      try {
        var res = await Yawmia.api('POST', '/api/auth/verify-otp', { phone: currentPhone, otp: otp });
        if (res.data.ok) {
          Yawmia.setAuth(res.data.token, res.data.user);

          // If user has no name yet → profile completion
          if (!res.data.user.name) {
            Yawmia.hide('stepOtp');
            Yawmia.show('stepProfile');
            setupProfileStep();
            var nameField = Yawmia.$id('nameInput');
            if (nameField) nameField.focus();
          } else {
            window.location.href = '/dashboard.html';
          }
        } else {
          var msg = res.data.error || 'كود التحقق غير صحيح';
          if (res.data.attemptsLeft !== undefined) {
            msg += ' — محاولات متبقية: ' + res.data.attemptsLeft;
          }
          Yawmia.showMessage('otpError', msg, 'error');
        }
      } catch (err) {
        Yawmia.showMessage('otpError', 'خطأ في الاتصال بالسيرفر', 'error');
      } finally {
        Yawmia.setLoading(btnVerifyOtp, false);
      }
    });
  }

  // ── Resend OTP ────────────────────────────────────────────
  var btnResendOtp = Yawmia.$id('btnResendOtp');
  if (btnResendOtp) {
    btnResendOtp.addEventListener('click', async function () {
      Yawmia.clearMessage('otpError');
      Yawmia.setLoading(btnResendOtp, true);

      try {
        var res = await Yawmia.api('POST', '/api/auth/send-otp', { phone: currentPhone, role: currentRole });
        if (res.data.ok) {
          Yawmia.showMessage('otpError', 'تم إعادة إرسال الكود', 'success');
        } else {
          Yawmia.showMessage('otpError', res.data.error || 'خطأ', 'error');
        }
      } catch (err) {
        Yawmia.showMessage('otpError', 'خطأ في الاتصال', 'error');
      } finally {
        Yawmia.setLoading(btnResendOtp, false);
      }
    });
  }

  // ── Step 3: Profile Completion ────────────────────────────
  function setupProfileStep() {
    Yawmia.populateGovernorates('govSelect');

    // Show categories only for workers
    if (currentRole === 'worker') {
      Yawmia.show('categoriesGroup');
      Yawmia.populateCategoriesCheckboxes('categoriesGrid');
    }
  }

  var btnSaveProfile = Yawmia.$id('btnSaveProfile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async function () {
      Yawmia.clearMessage('profileError');

      var name = Yawmia.$id('nameInput').value.trim();
      var governorate = Yawmia.$id('govSelect').value;

      if (!name) {
        return Yawmia.showMessage('profileError', 'أدخل اسمك', 'error');
      }
      if (!governorate) {
        return Yawmia.showMessage('profileError', 'اختار المحافظة', 'error');
      }

      var body = { name: name, governorate: governorate };

      // Get selected categories for workers
      if (currentRole === 'worker') {
        var checked = document.querySelectorAll('input[name="categories"]:checked');
        var categories = Array.from(checked).map(function (el) { return el.value; });
        if (categories.length === 0) {
          return Yawmia.showMessage('profileError', 'اختار تخصص واحد على الأقل', 'error');
        }
        body.categories = categories;
      }

      Yawmia.setLoading(btnSaveProfile, true);

      try {
        var res = await Yawmia.api('PUT', '/api/auth/profile', body);
        if (res.data.ok) {
          // Update stored user
          Yawmia.setAuth(Yawmia.getToken(), res.data.user);
          window.location.href = '/dashboard.html';
        } else {
          Yawmia.showMessage('profileError', res.data.error || 'خطأ في حفظ البيانات', 'error');
        }
      } catch (err) {
        Yawmia.showMessage('profileError', 'خطأ في الاتصال بالسيرفر', 'error');
      } finally {
        Yawmia.setLoading(btnSaveProfile, false);
      }
    });
  }
})();
```

---

## `frontend/assets/js/icons.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/icons.js — SVG Icon System (IIFE)
// Phase 18 — Inline SVG icons, aria-hidden, currentColor, data-icon
// ═══════════════════════════════════════════════════════════════

var YawmiaIcons = (function () {
  'use strict';

  // All icons: 24x24 viewBox, stroke-based, currentColor
  var icons = {

    home: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>',

    user: '<path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>',

    bell: '<path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>',

    logout: '<path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>',

    search: '<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>',

    filter: '<path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>',

    close: '<path d="M6 18L18 6M6 6l12 12"/>',

    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',

    chevronLeft: '<path d="M15 19l-7-7 7-7"/>',

    chevronRight: '<path d="M9 5l7 7-7 7"/>',

    externalLink: '<path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>',

    settings: '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',

    check: '<path d="M5 13l4 4L19 7"/>',

    checkCircle: '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',

    alertTriangle: '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',

    xCircle: '<path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>',

    info: '<path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',

    briefcase: '<path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6a2 2 0 012-2h2"/>',

    plus: '<path d="M12 4v16m8-8H4"/>',

    clock: '<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>',

    calendar: '<path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>',

    workers: '<path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>',

    refresh: '<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>',

    mapPin: '<path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>',

    navigation: '<path d="M12 2l9 18-9-4-9 4 9-18z"/>',

    wallet: '<path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>',

    star: '<path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>',

    starFilled: '<path fill="currentColor" stroke="none" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>',

    shield: '<path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>',

    shieldCheck: '<path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>',

    flag: '<path d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z"/>',

    lock: '<path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>',

    eye: '<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>',

    phone: '<path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>',

    edit: '<path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>',

    trash: '<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>',

    download: '<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>',

    upload: '<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>',

    construction: '<path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>',

    checkin: '<path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>',

    checkout: '<path d="M17 16l4-4m0 0l-4-4m4 4H7"/>',
  };

  /**
   * Get SVG icon as HTML string.
   * @param {string} name — icon name
   * @param {object} [options]
   * @param {number} [options.size=20] — width/height in px
   * @param {string} [options.class] — additional CSS class
   * @param {string} [options.ariaLabel] — if set, adds aria-label + role="img" instead of aria-hidden
   * @returns {string} SVG HTML string, or '' if icon not found
   */
  function get(name, options) {
    var paths = icons[name];
    if (!paths) return '';

    var opts = options || {};
    var size = opts.size || 20;
    var cls = 'icon-inline' + (opts['class'] ? ' ' + opts['class'] : '');

    var ariaAttrs;
    if (opts.ariaLabel) {
      ariaAttrs = 'role="img" aria-label="' + escapeAttr(opts.ariaLabel) + '"';
    } else {
      ariaAttrs = 'aria-hidden="true"';
    }

    return '<svg ' + ariaAttrs + ' class="' + cls + '" xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  /**
   * Render icon into a DOM element.
   * @param {HTMLElement} el
   * @param {string} name
   * @param {object} [options]
   */
  function render(el, name, options) {
    if (!el) return;
    var html = get(name, options);
    if (html) {
      el.innerHTML = html;
    }
  }

  /**
   * Render all elements with [data-icon] attribute.
   * Can be called multiple times safely.
   * Reads: data-icon="name", data-icon-size="20", data-icon-label="..."
   */
  function renderAll() {
    var elements = document.querySelectorAll('[data-icon]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var name = el.getAttribute('data-icon');
      if (!name) continue;

      var opts = {};
      var sizeAttr = el.getAttribute('data-icon-size');
      if (sizeAttr) opts.size = parseInt(sizeAttr, 10) || 20;

      var labelAttr = el.getAttribute('data-icon-label');
      if (labelAttr) opts.ariaLabel = labelAttr;

      var html = get(name, opts);
      if (html) {
        el.innerHTML = html;
      }
    }
  }

  /**
   * Returns array of available icon names.
   * @returns {string[]}
   */
  function list() {
    return Object.keys(icons);
  }

  /**
   * Escape string for use in HTML attributes.
   */
  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    get: get,
    render: render,
    renderAll: renderAll,
    list: list,
  };
})();
```

---

## `frontend/assets/js/jobs.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/jobs.js — Jobs UI Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // If not logged in, redirect
  if (!Yawmia.isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  var user = Yawmia.getUser();

  // ── Setup Header ──────────────────────────────────────────
  var headerName = Yawmia.$id('headerUserName');
  var headerRole = Yawmia.$id('headerUserRole');
  if (headerName) headerName.textContent = user.name || user.phone;
  if (headerRole) {
    headerRole.textContent = Yawmia.roleLabel(user.role);
    headerRole.classList.add('badge--' + user.role);
  }

  // ── Logout ────────────────────────────────────────────────
  var btnLogout = Yawmia.$id('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      Yawmia.logout();
    });
  }

  // ── Welcome Card ──────────────────────────────────────────
  var welcomeTitle = Yawmia.$id('welcomeTitle');
  var welcomeDesc = Yawmia.$id('welcomeDesc');
  if (welcomeTitle) {
    welcomeTitle.textContent = 'أهلاً ' + (user.name || 'بيك') + '!';
  }
  if (welcomeDesc) {
    if (user.role === 'worker') {
      welcomeDesc.textContent = 'شوف الفرص المتاحة قريب منك وتقدّم دلوقتي.';
    } else if (user.role === 'employer') {
      welcomeDesc.textContent = 'انشر فرصة عمل جديدة وأوصل لأفضل العمال.';
    }
  }

  // ── Panel Conflict Prevention ─────────────────────────────
  function closeOtherPanels(card, keepClass) {
    ['applications-panel', 'messaging-panel', 'attendance-panel', 'report-form'].forEach(function (cls) {
      if (cls !== keepClass) {
        var existing = card.querySelector('.' + cls);
        if (existing) existing.remove();
      }
    });
  }

  // ── Show/Hide Sections Based on Role ──────────────────────
  if (user.role === 'employer') {
    Yawmia.show('createJobSection');
    setupCreateJob();
  }

  // ── Populate Filter Dropdowns ─────────────────────────────
  Yawmia.populateGovernorates('filterGov');
  Yawmia.populateCategories('filterCat');

  // ── Inject Search + Sort Controls ─────────────────────────
  (function injectFilterControls() {
    var filtersDiv = document.querySelector('.filters');
    if (!filtersDiv) return;
    var btnFilter = Yawmia.$id('btnFilterJobs');

    // Search input
    var searchLabel = document.createElement('label');
    searchLabel.className = 'sr-only';
    searchLabel.setAttribute('for', 'filterSearch');
    searchLabel.textContent = 'بحث في الفرص';
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'filterSearch';
    searchInput.className = 'form-input form-input--sm';
    searchInput.placeholder = 'بحث بالكلمة...';
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { currentPage = 1; loadJobs(); }
    });
    filtersDiv.insertBefore(searchLabel, btnFilter);
    filtersDiv.insertBefore(searchInput, btnFilter);

    // Sort dropdown
    var sortLabel = document.createElement('label');
    sortLabel.className = 'sr-only';
    sortLabel.setAttribute('for', 'filterSort');
    sortLabel.textContent = 'ترتيب الفرص';
    var sortSelect = document.createElement('select');
    sortSelect.id = 'filterSort';
    sortSelect.className = 'form-input form-input--sm';
    sortSelect.innerHTML =
      '<option value="">ترتيب: الأحدث</option>' +
      '<option value="wage_high">الأجر الأعلى</option>' +
      '<option value="wage_low">الأجر الأقل</option>';
    filtersDiv.insertBefore(sortLabel, btnFilter);
    filtersDiv.insertBefore(sortSelect, btnFilter);
  })();

  // ── SSE: Real-Time Notifications ──────────────────────────
  if (Yawmia.connectSSE) {
    Yawmia.connectSSE();
  }

  // ── Web Push: Subscribe after SSE ─────────────────────────
  if (Yawmia.subscribeToPush) {
    Yawmia.subscribeToPush();
  }

  window.addEventListener('yawmia:notification', function (e) {
    loadNotifications();
    // Refresh job list when a new application arrives (live pending count update)
    if (e.detail && e.detail.type === 'new_application') {
      loadJobs();
    }
  });

  window.addEventListener('yawmia:sse-init', function (e) {
    var countBadge = Yawmia.$id('notificationCount');
    if (countBadge && e.detail && e.detail.unreadCount > 0) {
      countBadge.textContent = e.detail.unreadCount;
      countBadge.classList.remove('hidden');
      countBadge.classList.add('notification-badge-live');
    }
    // Sync bottom nav badge
    var bottomBadge = Yawmia.$id('bottomNavBadge');
    if (bottomBadge && e.detail && e.detail.unreadCount > 0) {
      bottomBadge.textContent = e.detail.unreadCount;
      bottomBadge.classList.remove('hidden');
    } else if (bottomBadge) {
      bottomBadge.classList.add('hidden');
    }
  });

  // ── Notifications (Drawer) ────────────────────────────────
  loadNotifications();

  var notificationBell = Yawmia.$id('notificationBell');
  var notificationPanel = Yawmia.$id('notificationPanel');
  var notificationOverlay = Yawmia.$id('notificationOverlay');
  var btnCloseNotifPanel = Yawmia.$id('btnCloseNotifPanel');

  function openNotifPanel() {
    if (!notificationPanel || !notificationOverlay) return;
    notificationOverlay.classList.add('notification-overlay--visible');
    notificationPanel.classList.add('notification-panel--open');
    document.body.style.overflow = 'hidden';
    loadNotifications();
    // Render icons inside the drawer (close button)
    if (typeof YawmiaIcons !== 'undefined') YawmiaIcons.renderAll();
    // Focus close button for accessibility
    if (btnCloseNotifPanel) btnCloseNotifPanel.focus();
  }

  function closeNotifPanel() {
    if (!notificationPanel || !notificationOverlay) return;
    notificationPanel.classList.remove('notification-panel--open');
    notificationOverlay.classList.remove('notification-overlay--visible');
    document.body.style.overflow = '';
    // Return focus to bell
    if (notificationBell) notificationBell.focus();
  }

  if (notificationBell) {
    notificationBell.addEventListener('click', function () {
      if (notificationPanel && notificationPanel.classList.contains('notification-panel--open')) {
        closeNotifPanel();
      } else {
        openNotifPanel();
      }
    });
  }

  // Overlay click → close
  if (notificationOverlay) {
    notificationOverlay.addEventListener('click', closeNotifPanel);
  }

  // Close button → close
  if (btnCloseNotifPanel) {
    btnCloseNotifPanel.addEventListener('click', closeNotifPanel);
  }

  // Escape key → close drawer
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && notificationPanel && notificationPanel.classList.contains('notification-panel--open')) {
      closeNotifPanel();
    }
  });

  // Bottom nav notification button → open drawer
  var bottomNavNotifBtn = Yawmia.$id('bottomNavNotif');
  if (bottomNavNotifBtn) {
    bottomNavNotifBtn.addEventListener('click', function () {
      openNotifPanel();
    });
  }

  var btnMarkAllRead = Yawmia.$id('btnMarkAllRead');
  if (btnMarkAllRead) {
    btnMarkAllRead.addEventListener('click', async function () {
      try {
        await Yawmia.api('POST', '/api/notifications/read-all');
        loadNotifications();
      } catch (err) { /* ignore */ }
    });
  }

  async function loadNotifications() {
    try {
      var res = await Yawmia.api('GET', '/api/notifications?limit=20&offset=0');
      if (res.data.ok) {
        var countBadge = Yawmia.$id('notificationCount');
        if (countBadge) {
          if (res.data.unread > 0) {
            countBadge.textContent = res.data.unread;
            countBadge.classList.remove('hidden');
          } else {
            countBadge.classList.add('hidden');
          }
          // Sync bottom nav badge
          var bottomBadge2 = Yawmia.$id('bottomNavBadge');
          if (bottomBadge2) {
            if (res.data.unread > 0) {
              bottomBadge2.textContent = res.data.unread;
              bottomBadge2.classList.remove('hidden');
            } else {
              bottomBadge2.classList.add('hidden');
            }
          }
        }
        var ntfList = Yawmia.$id('notificationList');
        if (ntfList && res.data.items.length > 0) {
          ntfList.innerHTML = '';
          res.data.items.forEach(function (ntf) {
            var item = document.createElement('div');
            item.className = 'notification-item' + (ntf.read ? '' : ' notification-item--unread');
            item.setAttribute('aria-label', (ntf.read ? '' : 'غير مقروء: ') + ntf.message);
            item.innerHTML = '<p class="notification-item__msg">' + escapeHtml(ntf.message) + '</p>' +
              '<span class="notification-item__time">' + new Date(ntf.createdAt).toLocaleString('ar-EG') + '</span>';
            if (!ntf.read) {
              item.addEventListener('click', async function () {
                try {
                  await Yawmia.api('POST', '/api/notifications/' + ntf.id + '/read');
                  item.classList.remove('notification-item--unread');
                  loadNotifications();
                } catch (e) { /* ignore */ }
              });
            }
            ntfList.appendChild(item);
          });
        } else if (ntfList) {
          ntfList.innerHTML = '<div class="notification-panel__empty"><span class="notification-panel__empty-icon">🔔</span><p>لا توجد إشعارات</p></div>';
        }
      }
    } catch (err) { /* ignore */ }
  }

  // ── Pagination State ──────────────────────────────────────
  var currentPage = 1;
  var pageLimit = 20;

  // ── Load Jobs ─────────────────────────────────────────────
  loadJobs();

  var btnFilterJobs = Yawmia.$id('btnFilterJobs');
  if (btnFilterJobs) {
    btnFilterJobs.addEventListener('click', function () {
      currentPage = 1;
      loadJobs();
    });
  }

  var btnPrevPage = Yawmia.$id('btnPrevPage');
  var btnNextPage = Yawmia.$id('btnNextPage');
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', function () {
      if (currentPage > 1) {
        currentPage--;
        loadJobs();
      }
    });
  }
  if (btnNextPage) {
    btnNextPage.addEventListener('click', function () {
      currentPage++;
      loadJobs();
    });
  }

  async function loadJobs() {
    var jobsList = Yawmia.$id('jobsList');
    if (!jobsList) return;
    jobsList.innerHTML = YawmiaUtils.skeletonJobCards(3);

    var gov = Yawmia.$id('filterGov') ? Yawmia.$id('filterGov').value : '';
    var cat = Yawmia.$id('filterCat') ? Yawmia.$id('filterCat').value : '';

    var search = Yawmia.$id('filterSearch') ? Yawmia.$id('filterSearch').value.trim() : '';
    var sort = Yawmia.$id('filterSort') ? Yawmia.$id('filterSort').value : '';

    // For employers, also fetch their enriched jobs for pending count
    if (user.role === 'employer') {
      Yawmia.api('GET', '/api/jobs/mine?enrich=applications&limit=100').then(function (mineRes) {
        if (mineRes.data.ok && mineRes.data.jobs) {
          window._enrichedMyJobs = {};
          mineRes.data.jobs.forEach(function (j) {
            if (typeof j.pendingApplicationsCount === 'number') {
              window._enrichedMyJobs[j.id] = j.pendingApplicationsCount;
            }
          });
        }
      }).catch(function () {});
    }

    var query = '/api/jobs?page=' + currentPage + '&limit=' + pageLimit + '&';
    if (gov) query += 'governorate=' + encodeURIComponent(gov) + '&';
    if (cat) query += 'category=' + encodeURIComponent(cat) + '&';
    if (search) query += 'search=' + encodeURIComponent(search) + '&';
    if (sort) query += 'sort=' + encodeURIComponent(sort) + '&';

    try {
      var res = await Yawmia.api('GET', query);
      if (res.data.ok && res.data.jobs.length > 0) {
        jobsList.innerHTML = '';
        res.data.jobs.forEach(function (job) {
          jobsList.appendChild(createJobCard(job));
        });
        updatePagination(res.data);
        var liveRegion = Yawmia.$id('jobsLiveRegion');
        if (liveRegion) liveRegion.textContent = 'تم تحميل ' + res.data.total + ' فرصة';
      } else {
        jobsList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📋</span><p class="empty-state__text">لا توجد فرص متاحة حالياً</p><p class="empty-state__hint">جرّب تغيير الفلاتر أو المحافظة</p></div>';
        Yawmia.hide('paginationControls');
      }
    } catch (err) {
      jobsList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span><p class="empty-state__text">خطأ في تحميل الفرص</p><p class="empty-state__hint">تأكد من اتصالك بالإنترنت وحاول مرة تانية</p></div>';
      Yawmia.hide('paginationControls');
    }
  }

  function updatePagination(data) {
    var controls = Yawmia.$id('paginationControls');
    var info = Yawmia.$id('paginationInfo');
    if (!controls) return;

    if (data.totalPages > 1) {
      Yawmia.show('paginationControls');
      if (info) info.textContent = 'صفحة ' + data.page + ' من ' + data.totalPages + ' (' + data.total + ' فرصة)';
      if (btnPrevPage) btnPrevPage.disabled = (data.page <= 1);
      if (btnNextPage) btnNextPage.disabled = (data.page >= data.totalPages);
    } else {
      Yawmia.hide('paginationControls');
    }
  }

  function getStatusLabel(status) {
    var labels = {
      open: 'متاحة',
      filled: 'مكتملة',
      in_progress: 'جاري التنفيذ',
      completed: 'مكتملة ✓',
      expired: 'منتهية',
      cancelled: 'ملغية'
    };
    return labels[status] || status;
  }

  function createJobCard(job) {
    var card = document.createElement('div');
    card.className = 'job-card';
    card.setAttribute('data-status', job.status);

    var statusBadge = '<span class="badge badge--status badge--' + job.status + '">' + getStatusLabel(job.status) + '</span>';

    // Button building moved into card.innerHTML section below

    // Employer profile link
    var employerProfileLink = '';
    if (job.employerId) {
      employerProfileLink = '<a href="/user.html?id=' + escapeHtml(job.employerId) + '" class="worker-link">عرض بروفايل صاحب العمل</a>';
    }

    // Payment info placeholder for completed jobs
    var paymentBadgeHtml = '';
    if (job.status === 'completed') {
      paymentBadgeHtml = '<span class="payment-badge-placeholder" data-job-id="' + job.id + '"></span>';
    }

    var completedLabel = '';
    if (job.status === 'completed') {
      completedLabel = '<span class="badge badge--status badge--completed">✓ مكتملة</span>';
    }

    var distanceBadge = (job._distance !== undefined && job._distance !== null)
      ? '<span class="job-distance">📍 ' + job._distance + ' كم</span>'
      : '';

    // Inject pending count from enriched data if available
    if (user.role === 'employer' && job.employerId === user.id && window._enrichedMyJobs && window._enrichedMyJobs[job.id] !== undefined) {
      job.pendingApplicationsCount = window._enrichedMyJobs[job.id];
    }

    // Separate primary and secondary buttons
    var primaryButtons = '';
    var secondaryButtons = '';

    // Primary: apply, start, complete, cancel, renew, checkin/checkout
    if (user.role === 'worker' && job.status === 'open') {
      primaryButtons += '<button class="btn btn--primary btn--sm btn-apply" data-job-id="' + job.id + '" aria-label="تقدّم لفرصة ' + escapeHtml(job.title) + '">تقدّم</button>';
    }
    if (user.role === 'employer' && job.employerId === user.id) {
      if (job.status === 'open') {
        primaryButtons += '<button class="btn btn--danger btn--sm btn-cancel" data-job-id="' + job.id + '" aria-label="إلغاء فرصة ' + escapeHtml(job.title) + '">إلغاء الفرصة</button>';
      } else if (job.status === 'filled') {
        primaryButtons += '<button class="btn btn--primary btn--sm btn-start" data-job-id="' + job.id + '" aria-label="ابدأ تنفيذ فرصة ' + escapeHtml(job.title) + '">ابدأ التنفيذ</button>';
      } else if (job.status === 'in_progress') {
        primaryButtons += '<button class="btn btn--success btn--sm btn-complete" data-job-id="' + job.id + '" aria-label="إنهاء فرصة ' + escapeHtml(job.title) + '">إنهاء الفرصة</button>';
      } else if (job.status === 'completed') {
        primaryButtons += '<button class="btn btn--warning btn--sm btn-rate" data-job-id="' + job.id + '" aria-label="قيّم العمال في فرصة ' + escapeHtml(job.title) + '">⭐ قيّم العمال</button>';
      } else if (job.status === 'expired' || job.status === 'cancelled') {
        primaryButtons += '<button class="btn btn-renew btn--sm" data-job-id="' + job.id + '" aria-label="تجديد فرصة ' + escapeHtml(job.title) + '">🔄 تجديد الفرصة</button>';
      }
    }
    if (user.role === 'worker' && job.status === 'in_progress') {
      primaryButtons += '<button class="btn btn-checkin btn--sm" data-job-id="' + job.id + '" aria-label="تسجيل حضور في فرصة ' + escapeHtml(job.title) + '">📍 تسجيل حضور</button>';
      primaryButtons += '<button class="btn btn-checkout btn--sm" data-job-id="' + job.id + '" aria-label="تسجيل انصراف من فرصة ' + escapeHtml(job.title) + '">🏁 تسجيل انصراف</button>';
    }
    if (user.role === 'worker' && job.status === 'completed') {
      primaryButtons += '<button class="btn btn--warning btn--sm btn-rate" data-job-id="' + job.id + '" data-target="' + (job.employerId || '') + '" aria-label="قيّم صاحب العمل في فرصة ' + escapeHtml(job.title) + '">⭐ قيّم صاحب العمل</button>';
    }

    // Secondary: view applications, attendance, duplicate, messages, report, pending badge
    var messagingStatuses = ['filled', 'in_progress', 'completed'];
    if (user.role === 'employer' && job.employerId === user.id && (job.status === 'open' || job.status === 'filled')) {
      secondaryButtons += '<button class="btn btn--ghost btn--sm btn-view-apps" data-job-id="' + job.id + '" aria-label="عرض طلبات فرصة ' + escapeHtml(job.title) + '">📋 عرض الطلبات</button>';
    }
    if (user.role === 'employer' && job.employerId === user.id && job.status === 'in_progress') {
      secondaryButtons += '<button class="btn btn--ghost btn--sm btn-attendance" data-job-id="' + job.id + '" aria-label="حضور عمال فرصة ' + escapeHtml(job.title) + '">📊 الحضور</button>';
    }
    if (user.role === 'employer' && job.employerId === user.id && job.status !== 'open') {
      secondaryButtons += '<button class="btn btn--ghost btn--sm btn-duplicate" data-job-id="' + job.id + '" aria-label="نسخ فرصة ' + escapeHtml(job.title) + '">📋 نسخ الفرصة</button>';
    }
    if (messagingStatuses.indexOf(job.status) !== -1) {
      var isInvolved = (user.role === 'employer' && job.employerId === user.id) || user.role === 'worker';
      if (isInvolved) {
        secondaryButtons += '<button class="btn btn--ghost btn--sm btn-messages" data-job-id="' + job.id + '" aria-label="رسائل فرصة ' + escapeHtml(job.title) + '">💬 رسائل</button>';
      }
    }
    if (job.employerId && job.employerId !== user.id) {
      secondaryButtons += '<button class="btn report-btn btn--sm btn-report" data-job-id="' + job.id + '" data-target="' + escapeHtml(job.employerId) + '" aria-label="بلّغ عن مخالفة في فرصة ' + escapeHtml(job.title) + '">🚩 بلّغ</button>';
    }

    // Pending applications badge for employer
    if (user.role === 'employer' && job.employerId === user.id && typeof job.pendingApplicationsCount === 'number' && job.pendingApplicationsCount > 0) {
      secondaryButtons += ' <span class="pending-badge">' + job.pendingApplicationsCount + ' طلب معلّق</span>';
    }

    // Inject pending count from enriched data if available
    if (user.role === 'employer' && job.employerId === user.id && window._enrichedMyJobs && window._enrichedMyJobs[job.id] !== undefined) {
      job.pendingApplicationsCount = window._enrichedMyJobs[job.id];
    }

    var actionsHtml = '';
    if (primaryButtons || secondaryButtons) {
      actionsHtml = '<div class="job-card__actions">';
      if (primaryButtons) actionsHtml += '<div class="job-card__actions-primary">' + primaryButtons + '</div>';
      if (secondaryButtons) actionsHtml += '<div class="job-card__actions-secondary">' + secondaryButtons + '</div>';
      actionsHtml += '</div>';
    }

    card.innerHTML =
      '<div class="job-card__header">' +
        '<span class="job-card__title">' + escapeHtml(job.title) + '</span>' +
        '<div class="job-card__header-right">' +
          statusBadge +
          distanceBadge +
          '<span class="job-card__wage">' + job.dailyWage + ' جنيه/يوم</span>' +
        '</div>' +
      '</div>' +
      '<div class="job-card__meta">' +
        '<span>' + YawmiaIcons.get('mapPin', {size:14}) + ' ' + escapeHtml(job.governorate) + '</span>' +
        '<span>' + YawmiaIcons.get('calendar', {size:14}) + ' ' + job.startDate + '</span>' +
        '<span>' + YawmiaIcons.get('clock', {size:14}) + ' ' + job.durationDays + ' يوم</span>' +
      '</div>' +
      (job.description ? '<p class="job-card__desc">' + escapeHtml(job.description) + '</p>' : '') +
      (employerProfileLink ? '<div style="margin-block-end:0.5rem;">' + employerProfileLink + '</div>' : '') +
      paymentBadgeHtml +
      '<div class="job-card__footer">' +
        '<span class="job-card__workers">' + YawmiaIcons.get('workers', {size:14}) + ' ' + job.workersAccepted + '/' + job.workersNeeded + ' عامل</span>' +
        completedLabel +
        actionsHtml +
      '</div>';

    // Apply button handler
    var applyBtn = card.querySelector('.btn-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', async function () {
        Yawmia.setLoading(applyBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/apply');
          if (res.data.ok) {
            applyBtn.textContent = 'تم التقديم ✓';
            applyBtn.disabled = true;
            applyBtn.setAttribute('aria-disabled', 'true');
            applyBtn.classList.remove('btn--primary');
            applyBtn.classList.add('btn--done');
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في التقديم');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(applyBtn, false);
        }
      });
    }

    // Start button handler (employer)
    var startBtn = card.querySelector('.btn-start');
    if (startBtn) {
      startBtn.addEventListener('click', async function () {
        Yawmia.setLoading(startBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/start');
          if (res.data.ok) {
            loadJobs();
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في بدء الفرصة');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(startBtn, false);
        }
      });
    }

    // Complete button handler (employer)
    var completeBtn = card.querySelector('.btn-complete');
    if (completeBtn) {
      completeBtn.addEventListener('click', async function () {
        Yawmia.setLoading(completeBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/complete');
          if (res.data.ok) {
            loadJobs();
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في إنهاء الفرصة');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(completeBtn, false);
        }
      });
    }

    // Cancel button handler (employer)
    var cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'إلغاء الفرصة', message: 'متأكد إنك عايز تلغي هذه الفرصة؟ الطلبات المعلقة هتترفض تلقائياً.', confirmText: 'إلغاء الفرصة', cancelText: 'رجوع', danger: true });
        if (!confirmed) return;
        Yawmia.setLoading(cancelBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/cancel');
          if (res.data.ok) {
            loadJobs();
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في إلغاء الفرصة');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(cancelBtn, false);
        }
      });
    }

    // Renew button handler (employer)
    var renewBtn = card.querySelector('.btn-renew');
    if (renewBtn) {
      renewBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'تجديد الفرصة', message: 'هل تريد تجديد هذه الفرصة؟', confirmText: 'تجديد', cancelText: 'إلغاء' });
        if (!confirmed) return;
        Yawmia.setLoading(renewBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/renew');
          if (res.data.ok) {
            loadJobs();
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في تجديد الفرصة');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(renewBtn, false);
        }
      });
    }

    // Duplicate button handler (employer)
    var duplicateBtn = card.querySelector('.btn-duplicate');
    if (duplicateBtn) {
      duplicateBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'نسخ الفرصة', message: 'هل تريد نسخ هذه الفرصة؟', confirmText: 'نسخ', cancelText: 'إلغاء' });
        if (!confirmed) return;
        Yawmia.setLoading(duplicateBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/duplicate');
          if (res.data.ok) {
            YawmiaToast.success('تم نسخ الفرصة بنجاح ✓');
            loadJobs();
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في نسخ الفرصة');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(duplicateBtn, false);
        }
      });
    }

    // Applications panel toggle handler (employer)
    var viewAppsBtn = card.querySelector('.btn-view-apps');
    if (viewAppsBtn) {
      viewAppsBtn.addEventListener('click', function () {
        toggleApplicationsPanel(card, job);
      });
    }

    // Attendance panel toggle handler (employer)
    var attendanceBtn = card.querySelector('.btn-attendance');
    if (attendanceBtn) {
      attendanceBtn.addEventListener('click', function () {
        toggleAttendancePanel(card, job);
      });
    }

    // Messaging toggle handler
    var messagesBtn = card.querySelector('.btn-messages');
    if (messagesBtn) {
      messagesBtn.addEventListener('click', function () {
        toggleMessagingPanel(card, job);
      });
    }

    // Check-in button handler (worker)
    var checkinBtn = card.querySelector('.btn-checkin');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', function () {
        handleCheckInClick(job.id, checkinBtn);
      });
    }

    // Check-out button handler (worker)
    var checkoutBtn = card.querySelector('.btn-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        handleCheckOutClick(job.id, checkoutBtn);
      });
    }

    // Load payment info for completed jobs
    var paymentPlaceholder = card.querySelector('.payment-badge-placeholder');
    if (paymentPlaceholder && job.status === 'completed') {
      (async function loadPaymentInfo() {
        try {
          var payRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/payment');
          if (payRes.data.ok && payRes.data.payment) {
            var pay = payRes.data.payment;
            var statusLabels = {
              pending: 'في انتظار التأكيد',
              employer_confirmed: 'تم تأكيد الدفع',
              completed: 'مكتمل',
              disputed: 'نزاع'
            };
            var badgeLabel = statusLabels[pay.status] || pay.status;
            var html = '<div class="payment-info" style="margin-block-end: 0.5rem;">' +
              '<span class="payment-badge payment-badge--' + pay.status + '">' + escapeHtml(badgeLabel) + '</span>' +
              '<span style="font-size:0.8rem;color:var(--color-text-muted);margin-inline-start:0.5rem;">' + pay.amount + ' جنيه</span>';

            // Confirm button for employer on pending payments
            if (pay.status === 'pending' && user.role === 'employer' && job.employerId === user.id) {
              html += ' <button class="btn btn--primary btn--sm btn-confirm-payment" data-pay-id="' + pay.id + '">أكد الدفع</button>';
            }

            // Dispute button for involved users (pending or employer_confirmed)
            if (pay.status === 'pending' || pay.status === 'employer_confirmed') {
              html += ' <button class="btn btn--ghost btn--sm btn-dispute-payment" data-pay-id="' + pay.id + '">فتح نزاع</button>';
            }

            html += '</div>';
            paymentPlaceholder.innerHTML = html;

            // Confirm handler
            var confirmBtn = paymentPlaceholder.querySelector('.btn-confirm-payment');
            if (confirmBtn) {
              confirmBtn.addEventListener('click', async function () {
                Yawmia.setLoading(confirmBtn, true);
                try {
                  var cRes = await Yawmia.api('POST', '/api/payments/' + pay.id + '/confirm');
                  if (cRes.data.ok) {
                    loadJobs();
                  } else {
                    YawmiaToast.error(cRes.data.error || 'خطأ في تأكيد الدفع');
                  }
                } catch (e) {
                  YawmiaToast.error('خطأ في الاتصال');
                } finally {
                  Yawmia.setLoading(confirmBtn, false);
                }
              });
            }

            // Dispute handler
            var disputeBtn = paymentPlaceholder.querySelector('.btn-dispute-payment');
            if (disputeBtn) {
              disputeBtn.addEventListener('click', async function () {
                var reason = await YawmiaModal.prompt({ title: 'فتح نزاع', message: 'اكتب سبب النزاع', placeholder: 'اكتب السبب هنا...', minLength: 5, required: true });
                if (!reason) return;
                Yawmia.setLoading(disputeBtn, true);
                try {
                  var dRes = await Yawmia.api('POST', '/api/payments/' + pay.id + '/dispute', { reason: reason });
                  if (dRes.data.ok) {
                    loadJobs();
                  } else {
                    YawmiaToast.error(dRes.data.error || 'خطأ في فتح النزاع');
                  }
                } catch (e) {
                  YawmiaToast.error('خطأ في الاتصال');
                } finally {
                  Yawmia.setLoading(disputeBtn, false);
                }
              });
            }
          }
        } catch (e) { /* ignore — payment may not exist */ }
      })();
    }

    // Report button handler
    var reportBtn = card.querySelector('.btn-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', function () {
        showReportForm(card, job.id, reportBtn.getAttribute('data-target'));
      });
    }

    // Rate button handler
    var rateBtn = card.querySelector('.btn-rate');
    if (rateBtn) {
      rateBtn.addEventListener('click', function () {
        var targetUserId = rateBtn.getAttribute('data-target') || '';
        showRatingModal(job, targetUserId);
      });
    }

    return card;
  }

  // ── Create Job Form ───────────────────────────────────────
  function setupCreateJob() {
    Yawmia.populateCategories('jobCategory');
    Yawmia.populateGovernorates('jobGovernorate');

    // Cost preview
    var workerInput = Yawmia.$id('jobWorkers');
    var wageInput = Yawmia.$id('jobWage');
    var durationInput = Yawmia.$id('jobDuration');

    function updateCost() {
      var workers = parseInt(workerInput ? workerInput.value : 0) || 0;
      var wage = parseInt(wageInput ? wageInput.value : 0) || 0;
      var duration = parseInt(durationInput ? durationInput.value : 0) || 0;

      if (workers > 0 && wage > 0 && duration > 0) {
        var total = workers * wage * duration;
        var fee = Math.round(total * 0.15);
        Yawmia.$id('costTotal').textContent = total.toLocaleString('ar-EG') + ' جنيه';
        Yawmia.$id('costFee').textContent = fee.toLocaleString('ar-EG') + ' جنيه';
        Yawmia.show('costPreview');
      } else {
        Yawmia.hide('costPreview');
      }
    }

    if (workerInput) workerInput.addEventListener('input', updateCost);
    if (wageInput) wageInput.addEventListener('input', updateCost);
    if (durationInput) durationInput.addEventListener('input', updateCost);

    // Submit Job
    var btnCreateJob = Yawmia.$id('btnCreateJob');
    if (btnCreateJob) {
      btnCreateJob.addEventListener('click', async function () {
        Yawmia.clearMessage('createJobError');

        var body = {
          title: (Yawmia.$id('jobTitle') || {}).value || '',
          category: (Yawmia.$id('jobCategory') || {}).value || '',
          governorate: (Yawmia.$id('jobGovernorate') || {}).value || '',
          workersNeeded: parseInt((Yawmia.$id('jobWorkers') || {}).value) || 0,
          dailyWage: parseInt((Yawmia.$id('jobWage') || {}).value) || 0,
          startDate: (Yawmia.$id('jobStartDate') || {}).value || '',
          durationDays: parseInt((Yawmia.$id('jobDuration') || {}).value) || 0,
          description: (Yawmia.$id('jobDescription') || {}).value || '',
        };

        Yawmia.setLoading(btnCreateJob, true);

        try {
          var res = await Yawmia.api('POST', '/api/jobs', body);
          if (res.data.ok) {
            Yawmia.showMessage('createJobError', 'تم نشر الفرصة بنجاح!', 'success');
            // Clear form
            Yawmia.$id('jobTitle').value = '';
            Yawmia.$id('jobCategory').value = '';
            Yawmia.$id('jobGovernorate').value = '';
            Yawmia.$id('jobWorkers').value = '';
            Yawmia.$id('jobWage').value = '';
            Yawmia.$id('jobStartDate').value = '';
            Yawmia.$id('jobDuration').value = '';
            Yawmia.$id('jobDescription').value = '';
            Yawmia.hide('costPreview');
            // Reload jobs
            loadJobs();
          } else {
            Yawmia.showMessage('createJobError', res.data.error || 'خطأ في نشر الفرصة', 'error');
          }
        } catch (err) {
          Yawmia.showMessage('createJobError', 'خطأ في الاتصال بالسيرفر', 'error');
        } finally {
          Yawmia.setLoading(btnCreateJob, false);
        }
      });
    }
  }

  // ── Applications Review Panel (Employer) ──────────────────
  function toggleApplicationsPanel(card, job) {
    closeOtherPanels(card, 'applications-panel');
    var existing = card.querySelector('.applications-panel');
    if (existing) { existing.remove(); return; }

    var panel = document.createElement('div');
    panel.className = 'applications-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'طلبات التقدم لفرصة ' + escapeHtml(job.title));
    panel.innerHTML =
      '<div class="applications-panel__header">' +
        '<strong>📋 طلبات التقدم</strong>' +
        '<button class="btn btn--ghost btn--sm btn-close-apps" aria-label="إغلاق لوحة الطلبات">✕</button>' +
      '</div>' +
      '<div class="applications-panel__list">' +
        '<p class="empty-state">جاري تحميل الطلبات...</p>' +
      '</div>';

    card.appendChild(panel);

    panel.querySelector('.btn-close-apps').addEventListener('click', function () { panel.remove(); });

    // Load applications
    (async function () {
      try {
        var res = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
        var listEl = panel.querySelector('.applications-panel__list');
        if (!res.data.ok || !res.data.applications || res.data.applications.length === 0) {
          listEl.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📭</span><p class="empty-state__text">لا توجد طلبات بعد</p></div>';
          return;
        }
        listEl.innerHTML = '';
        res.data.applications.forEach(function (app) {
          var w = app.worker || {};
          var statusLabels = { pending: 'في الانتظار', accepted: 'مقبول ✓', rejected: 'مرفوض ✗', withdrawn: 'تم السحب' };
          var statusLabel = statusLabels[app.status] || app.status;

          var verBadge = '';
          if (w.verificationStatus === 'verified') {
            verBadge = ' <span class="verification-badge verification-badge--verified">✓ محقق</span>';
          }

          var ratingHtml = '';
          if (w.rating && w.rating.count > 0) {
            ratingHtml = '<span style="color:var(--color-warning);font-size:0.8rem;">⭐ ' + w.rating.avg + ' (' + w.rating.count + ')</span>';
          }

          var catsHtml = '';
          if (w.categories && w.categories.length > 0) {
            catsHtml = '<div class="app-review-card__cats">' + w.categories.map(function (c) { return '<span class="badge badge--worker" style="font-size:0.7rem;padding:0.1rem 0.4rem;">' + escapeHtml(c) + '</span>'; }).join(' ') + '</div>';
          }

          var actionsHtml = '';
          if (app.status === 'pending') {
            actionsHtml =
              '<div class="app-review-card__actions">' +
                '<button class="btn btn--success btn--sm btn-accept-app" data-app-id="' + app.id + '">✓ قبول</button>' +
                '<button class="btn btn--ghost btn--sm btn-reject-app" data-app-id="' + app.id + '" style="color:var(--color-error);border-color:var(--color-error);">✗ رفض</button>' +
              '</div>';
          } else {
            actionsHtml = '<div class="app-review-card__actions"><span class="badge badge--status badge--' + app.status + '">' + escapeHtml(statusLabel) + '</span></div>';
          }

          var appCard = document.createElement('div');
          appCard.className = 'app-review-card';
          appCard.innerHTML =
            '<div class="app-review-card__info">' +
              '<div class="app-review-card__name">' +
                '<a href="/user.html?id=' + escapeHtml(w.id || app.workerId) + '" class="worker-link">' + escapeHtml(w.name || 'بدون اسم') + '</a>' +
                verBadge +
              '</div>' +
              '<div class="app-review-card__meta">' +
                '<span class="phone-cell">' + escapeHtml(w.phone || '') + '</span>' +
                (w.governorate ? ' • 📍 ' + escapeHtml(w.governorate) : '') +
                (ratingHtml ? ' • ' + ratingHtml : '') +
              '</div>' +
              catsHtml +
            '</div>' +
            actionsHtml;

          // Accept handler
          var acceptBtn = appCard.querySelector('.btn-accept-app');
          if (acceptBtn) {
            acceptBtn.addEventListener('click', async function () {
              Yawmia.setLoading(acceptBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/accept', { applicationId: app.id });
                if (r.data.ok) {
                  YawmiaToast.success('تم قبول العامل ✓');
                  panel.remove();
                  toggleApplicationsPanel(card, job);
                  loadJobs();
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ في قبول العامل');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(acceptBtn, false); }
            });
          }

          // Reject handler
          var rejectBtn = appCard.querySelector('.btn-reject-app');
          if (rejectBtn) {
            rejectBtn.addEventListener('click', async function () {
              Yawmia.setLoading(rejectBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/reject', { applicationId: app.id });
                if (r.data.ok) {
                  YawmiaToast.success('تم رفض الطلب');
                  panel.remove();
                  toggleApplicationsPanel(card, job);
                  loadJobs();
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ في رفض الطلب');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(rejectBtn, false); }
            });
          }

          listEl.appendChild(appCard);
        });
      } catch (err) {
        var listEl = panel.querySelector('.applications-panel__list');
        if (listEl) listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الطلبات</p>';
      }
    })();
  }

  // ── Report Form ───────────────────────────────────────────
  function showReportForm(card, jobId, targetId) {
    // Remove existing form in this card if any
    var existing = card.querySelector('.report-form');
    if (existing) { existing.remove(); return; }

    var form = document.createElement('div');
    form.className = 'report-form';
    form.innerHTML =
      '<select class="report-type-select">' +
        '<option value="">اختر نوع البلاغ...</option>' +
        '<option value="fraud">نصب أو احتيال</option>' +
        '<option value="no_show">عدم حضور</option>' +
        '<option value="harassment">إساءة أو تحرش</option>' +
        '<option value="quality">جودة عمل سيئة</option>' +
        '<option value="payment_issue">مشكلة في الدفع</option>' +
        '<option value="other">أخرى</option>' +
      '</select>' +
      '<textarea placeholder="اكتب سبب البلاغ (10 حروف على الأقل)..." maxlength="500"></textarea>' +
      '<div style="display:flex;gap:0.5rem;">' +
        '<button class="btn btn--primary btn--sm btn-submit-report">إرسال البلاغ</button>' +
        '<button class="btn btn--ghost btn--sm btn-cancel-report" aria-label="إغلاق نموذج البلاغ">إلغاء</button>' +
      '</div>' +
      '<div class="report-form-msg" style="margin-top:0.5rem;font-size:0.85rem;"></div>';

    card.appendChild(form);

    form.querySelector('.btn-cancel-report').addEventListener('click', function () {
      form.remove();
    });

    form.querySelector('.btn-submit-report').addEventListener('click', async function () {
      var typeSelect = form.querySelector('.report-type-select');
      var reasonTextarea = form.querySelector('textarea');
      var msgEl = form.querySelector('.report-form-msg');
      var type = typeSelect.value;
      var reason = reasonTextarea.value.trim();

      if (!type) { msgEl.textContent = 'اختر نوع البلاغ'; msgEl.style.color = 'var(--color-error)'; return; }
      if (reason.length < 10) { msgEl.textContent = 'السبب لازم يكون 10 حروف على الأقل'; msgEl.style.color = 'var(--color-error)'; return; }

      var submitBtn = form.querySelector('.btn-submit-report');
      Yawmia.setLoading(submitBtn, true);
      try {
        var res = await Yawmia.api('POST', '/api/reports', { targetId: targetId, type: type, reason: reason, jobId: jobId });
        if (res.data.ok) {
          msgEl.textContent = 'تم إرسال البلاغ بنجاح ✓';
          msgEl.style.color = 'var(--color-success)';
          setTimeout(function () { form.remove(); }, 2000);
        } else {
          msgEl.textContent = res.data.error || 'خطأ في إرسال البلاغ';
          msgEl.style.color = 'var(--color-error)';
        }
      } catch (err) {
        msgEl.textContent = 'خطأ في الاتصال';
        msgEl.style.color = 'var(--color-error)';
      } finally {
        Yawmia.setLoading(submitBtn, false);
      }
    });
  }

  // ── Attendance Panel (Employer) ───────────────────────────
  function toggleAttendancePanel(card, job) {
    closeOtherPanels(card, 'attendance-panel');
    var existing = card.querySelector('.attendance-panel');
    if (existing) { existing.remove(); return; }

    var panel = document.createElement('div');
    panel.className = 'attendance-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'حضور عمال فرصة ' + escapeHtml(job.title));
    panel.innerHTML =
      '<div class="attendance-panel__header">' +
        '<strong>📊 حضور العمال</strong>' +
        '<button class="btn btn--ghost btn--sm btn-close-att" aria-label="إغلاق لوحة الحضور">✕</button>' +
      '</div>' +
      '<div class="attendance-panel__list">' +
        '<p class="empty-state">جاري تحميل بيانات الحضور...</p>' +
      '</div>';

    card.appendChild(panel);

    panel.querySelector('.btn-close-att').addEventListener('click', function () { panel.remove(); });

    // Load attendance data
    (async function () {
      try {
        var appsRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
        var attRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/attendance');

        var listEl = panel.querySelector('.attendance-panel__list');
        if (!appsRes.data.ok || !appsRes.data.applications) {
          listEl.innerHTML = '<p class="empty-state">لا يوجد عمال مقبولين</p>';
          return;
        }

        var accepted = appsRes.data.applications.filter(function (a) { return a.status === 'accepted'; });
        if (accepted.length === 0) {
          listEl.innerHTML = '<div class="empty-state"><span class="empty-state__icon">👷</span><p class="empty-state__text">لا يوجد عمال مقبولين بعد</p></div>';
          return;
        }

        var attRecords = (attRes.data.ok && attRes.data.records) ? attRes.data.records : [];

        // Build a map: workerId → latest attendance record
        var attMap = {};
        attRecords.forEach(function (r) {
          if (!attMap[r.workerId] || new Date(r.createdAt) > new Date(attMap[r.workerId].createdAt)) {
            attMap[r.workerId] = r;
          }
        });

        var attStatusLabels = {
          checked_in: '✓ حاضر',
          checked_out: '🏁 انصرف',
          confirmed: '✓✓ مؤكد',
          no_show: '✗ غائب',
          pending: '⏳ في الانتظار'
        };
        var attStatusClasses = {
          checked_in: 'attendance-status-checked_in',
          checked_out: 'attendance-status-checked_out',
          confirmed: 'attendance-status-confirmed',
          no_show: 'attendance-status-no_show'
        };

        listEl.innerHTML = '';
        accepted.forEach(function (app) {
          var w = app.worker || {};
          var att = attMap[app.workerId];
          var attStatus = att ? att.status : 'none';
          var attLabel = att ? (attStatusLabels[attStatus] || attStatus) : 'لم يسجل بعد';
          var attClass = att ? (attStatusClasses[attStatus] || '') : '';

          var actionsHtml = '';
          if (!att || attStatus === 'no_show') {
            // Can do manual check-in
            actionsHtml += '<button class="btn btn-checkin btn--sm btn-manual-checkin" data-worker-id="' + app.workerId + '">📍 تسجيل يدوي</button>';
          }
          if (!att) {
            // Can report no-show
            actionsHtml += '<button class="btn btn-noshow btn--sm btn-noshow-att" data-worker-id="' + app.workerId + '">✗ غياب</button>';
          }
          if (att && (attStatus === 'checked_in' || attStatus === 'checked_out') && !att.employerConfirmed) {
            // Can confirm
            actionsHtml += '<button class="btn btn--primary btn--sm btn-confirm-att" data-att-id="' + att.id + '">✓ تأكيد</button>';
          }

          var workerCard = document.createElement('div');
          workerCard.className = 'att-worker-card';
          workerCard.innerHTML =
            '<div class="att-worker-card__info">' +
              '<div class="att-worker-card__name">' +
                '<a href="/user.html?id=' + escapeHtml(w.id || app.workerId) + '" class="worker-link">' + escapeHtml(w.name || 'بدون اسم') + '</a>' +
              '</div>' +
              '<div class="att-worker-card__status ' + attClass + '">' + attLabel +
                (att && att.hoursWorked ? ' • ' + att.hoursWorked + ' ساعة' : '') +
              '</div>' +
            '</div>' +
            '<div class="att-worker-card__actions">' + actionsHtml + '</div>';

          // Manual check-in handler
          var manualBtn = workerCard.querySelector('.btn-manual-checkin');
          if (manualBtn) {
            manualBtn.addEventListener('click', async function () {
              Yawmia.setLoading(manualBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/manual-checkin', { workerId: app.workerId });
                if (r.data.ok) {
                  YawmiaToast.success('تم تسجيل الحضور ✓');
                  panel.remove();
                  toggleAttendancePanel(card, job);
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ في تسجيل الحضور');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(manualBtn, false); }
            });
          }

          // No-show handler
          var noshowBtn = workerCard.querySelector('.btn-noshow-att');
          if (noshowBtn) {
            noshowBtn.addEventListener('click', async function () {
              Yawmia.setLoading(noshowBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/no-show', { workerId: app.workerId });
                if (r.data.ok) {
                  YawmiaToast.success('تم تسجيل الغياب');
                  panel.remove();
                  toggleAttendancePanel(card, job);
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ في تسجيل الغياب');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(noshowBtn, false); }
            });
          }

          // Confirm handler
          var confirmBtn = workerCard.querySelector('.btn-confirm-att');
          if (confirmBtn) {
            confirmBtn.addEventListener('click', async function () {
              Yawmia.setLoading(confirmBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/attendance/' + att.id + '/confirm');
                if (r.data.ok) {
                  YawmiaToast.success('تم تأكيد الحضور ✓');
                  panel.remove();
                  toggleAttendancePanel(card, job);
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ في تأكيد الحضور');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(confirmBtn, false); }
            });
          }

          listEl.appendChild(workerCard);
        });
      } catch (err) {
        var listEl = panel.querySelector('.attendance-panel__list');
        if (listEl) listEl.innerHTML = '<p class="empty-state">خطأ في تحميل بيانات الحضور</p>';
      }
    })();
  }

  // ── Escape HTML — delegated to YawmiaUtils ───────────────
  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

  // ── Attendance Handlers ───────────────────────────────────
  function handleCheckInClick(jobId, btn) {
    if (!navigator.geolocation) {
      YawmiaToast.error('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    Yawmia.setLoading(btn, true);
    navigator.geolocation.getCurrentPosition(
      async function (pos) {
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + jobId + '/checkin', {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          if (res.data.ok) {
            btn.textContent = 'تم الحضور ✓';
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            btn.classList.remove('btn-checkin');
            btn.classList.add('btn--done');
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في تسجيل الحضور');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(btn, false);
        }
      },
      function (err) {
        Yawmia.setLoading(btn, false);
        YawmiaToast.error('فشل تحديد الموقع — تأكد من تفعيل GPS');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleCheckOutClick(jobId, btn) {
    Yawmia.setLoading(btn, true);
    (async function () {
      try {
        var body = {};
        // Optionally capture GPS for check-out
        if (navigator.geolocation) {
          try {
            var pos = await new Promise(function (resolve, reject) {
              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
            });
            body.lat = pos.coords.latitude;
            body.lng = pos.coords.longitude;
          } catch (_) {
            // GPS optional for check-out — continue without
          }
        }
        var res = await Yawmia.api('POST', '/api/jobs/' + jobId + '/checkout', body);
          if (res.data.ok) {
          btn.textContent = 'تم الانصراف ✓';
          btn.disabled = true;
          btn.setAttribute('aria-disabled', 'true');
          btn.classList.remove('btn-checkout');
          btn.classList.add('btn--done');
          if (res.data.attendance && res.data.attendance.hoursWorked != null) {
            YawmiaToast.success('تم تسجيل الانصراف — ساعات العمل: ' + res.data.attendance.hoursWorked + ' ساعة');
          }
        } else {
          YawmiaToast.error(res.data.error || 'خطأ في تسجيل الانصراف');
        }
      } catch (err) {
        YawmiaToast.error('خطأ في الاتصال');
      } finally {
        Yawmia.setLoading(btn, false);
      }
    })();
  }

  // ── Messaging Panel ───────────────────────────────────────
  function toggleMessagingPanel(card, job) {
    closeOtherPanels(card, 'messaging-panel');
    var existing = card.querySelector('.messaging-panel');
    if (existing) { existing.remove(); return; }

    var isJobEmployer = user.role === 'employer' && job.employerId === user.id;

    var recipientPickerHtml = '';
    if (isJobEmployer) {
      recipientPickerHtml =
        '<div class="msg-recipient-picker">' +
          '<select class="form-input form-input--sm" id="msgRecipient-' + job.id + '" aria-label="اختار المستلم">' +
            '<option value="__broadcast__">📢 بث لكل العمال</option>' +
          '</select>' +
        '</div>';
    }

    var panel = document.createElement('div');
    panel.className = 'messaging-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'رسائل فرصة ' + escapeHtml(job.title));
    panel.innerHTML =
      '<div class="messaging-panel__header">' +
        '<strong>💬 رسائل الفرصة</strong>' +
        '<button class="btn btn--ghost btn--sm btn-close-msgs" aria-label="إغلاق لوحة الرسائل">✕</button>' +
      '</div>' +
      recipientPickerHtml +
      '<div class="message-list" id="msgList-' + job.id + '">' +
        '<p class="empty-state">جاري التحميل...</p>' +
      '</div>' +
      '<div class="message-send-form">' +
        '<input type="text" class="message-input" placeholder="اكتب رسالة..." maxlength="500">' +
        '<button class="btn btn--primary btn--sm btn-send-msg">إرسال</button>' +
      '</div>';

    card.appendChild(panel);

    // Close
    panel.querySelector('.btn-close-msgs').addEventListener('click', function () { panel.remove(); });

    // Populate recipient picker for employer
    if (isJobEmployer) {
      (async function () {
        try {
          var appsRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
          var selectEl = panel.querySelector('#msgRecipient-' + job.id);
          if (selectEl && appsRes.data.ok && appsRes.data.applications) {
            var accepted = appsRes.data.applications.filter(function (a) { return a.status === 'accepted'; });
            accepted.forEach(function (a) {
              var w = a.worker || {};
              var label = (w.name || 'بدون اسم') + ' — ' + (w.phone || a.workerId);
              var opt = document.createElement('option');
              opt.value = a.workerId;
              opt.textContent = label;
              selectEl.appendChild(opt);
            });
          }
        } catch (_) { /* non-blocking */ }
      })();
    }

    // Load messages
    loadJobMessages(panel, job);

    // Unified send handler
    var sendBtn = panel.querySelector('.btn-send-msg');
    var input = panel.querySelector('.message-input');

    async function handleSend() {
      var text = input.value.trim();
      if (!text) return;

      if (isJobEmployer) {
        var selectEl = panel.querySelector('#msgRecipient-' + job.id);
        var selectedValue = selectEl ? selectEl.value : '__broadcast__';

        Yawmia.setLoading(sendBtn, true);
        try {
          var res;
          if (selectedValue === '__broadcast__') {
            res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/messages/broadcast', { text: text });
          } else {
            res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/messages', { recipientId: selectedValue, text: text });
          }
          if (res.data.ok) {
            input.value = '';
            loadJobMessages(panel, job);
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في إرسال الرسالة');
          }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(sendBtn, false); }
      } else {
        // Worker sends to employer directly
        sendJobMessage(panel, job, input);
      }
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleSend();
      });
    }
  }

  async function loadJobMessages(panel, job) {
    var listEl = panel.querySelector('.message-list');
    try {
      var res = await Yawmia.api('GET', '/api/jobs/' + job.id + '/messages?limit=50&offset=0');
      if (res.data.ok && res.data.items && res.data.items.length > 0) {
        listEl.innerHTML = '';
        // Reverse to show oldest first (chat order)
        var items = res.data.items.slice().reverse();
        items.forEach(function (msg) {
          var isMine = msg.senderId === user.id;
          var bubble = document.createElement('div');
          bubble.className = 'message-bubble' + (isMine ? ' message-bubble--mine' : ' message-bubble--other');
          var roleLabel = msg.senderRole === 'employer' ? 'صاحب العمل' : 'عامل';
          var broadcastLabel = msg.recipientId === null ? ' 📢' : '';
          bubble.innerHTML =
            '<div class="message-bubble__sender">' + escapeHtml(roleLabel) + broadcastLabel + '</div>' +
            '<div class="message-bubble__text">' + escapeHtml(msg.text) + '</div>' +
            '<div class="message-bubble__time">' + new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + '</div>';
          listEl.appendChild(bubble);
        });
        // Scroll to bottom
        listEl.scrollTop = listEl.scrollHeight;

        // Mark all as read (fire-and-forget)
        Yawmia.api('POST', '/api/jobs/' + job.id + '/messages/read-all').catch(function () {});
      } else {
        listEl.innerHTML = '<p class="empty-state">لا توجد رسائل بعد</p>';
      }
    } catch (err) {
      listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الرسائل</p>';
    }
  }

  async function sendJobMessage(panel, job, input) {
    var text = input.value.trim();
    if (!text) return;

    // Worker always sends to employer
    var recipientId = job.employerId;

    try {
      var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/messages', {
        recipientId: recipientId,
        text: text,
      });
      if (res.data.ok) {
        input.value = '';
        loadJobMessages(panel, job);
      } else {
        YawmiaToast.error(res.data.error || 'خطأ في إرسال الرسالة');
      }
    } catch (err) {
      YawmiaToast.error('خطأ في الاتصال');
    }
  }

  // ── Load jobs with enrichment for employer ─────────────────
  // Override loadJobs to fetch enriched data for employers
  var originalLoadJobs = loadJobs;

  // ── Rating Modal ──────────────────────────────────────────
  function showRatingModal(job, prefilledTargetId) {
    // Remove existing modal if any
    var existingModal = document.querySelector('.rating-modal');
    if (existingModal) existingModal.remove();

    var selectedStars = 0;

    var modal = document.createElement('div');
    modal.className = 'rating-modal';

    var isEmployer = user.role === 'employer' && job.employerId === user.id;

    var targetField = '';
    if (isEmployer) {
      targetField =
        '<div class="form-group">' +
          '<label class="form-label">اختار العامل</label>' +
          '<select class="form-input form-input--sm" id="ratingTargetSelect">' +
            '<option value="">جاري تحميل العمال...</option>' +
          '</select>' +
        '</div>';
    }

    modal.innerHTML =
      '<div class="rating-modal__card">' +
        '<h3 class="rating-modal__title">⭐ قيّم تجربتك في: ' + escapeHtml(job.title) + '</h3>' +
        '<div class="rating-stars-input" id="ratingStarsInput" role="radiogroup" aria-label="اختار عدد النجوم">' +
          '<button class="star-btn" data-star="1" role="radio" aria-checked="false" aria-label="نجمة واحدة من 5" tabindex="0">★</button>' +
          '<button class="star-btn" data-star="2" role="radio" aria-checked="false" aria-label="نجمتين من 5" tabindex="-1">★</button>' +
          '<button class="star-btn" data-star="3" role="radio" aria-checked="false" aria-label="3 نجوم من 5" tabindex="-1">★</button>' +
          '<button class="star-btn" data-star="4" role="radio" aria-checked="false" aria-label="4 نجوم من 5" tabindex="-1">★</button>' +
          '<button class="star-btn" data-star="5" role="radio" aria-checked="false" aria-label="5 نجوم من 5" tabindex="-1">★</button>' +
        '</div>' +
        targetField +
        '<textarea class="rating-comment-input" id="ratingComment" placeholder="تعليق (اختياري)..." maxlength="500"></textarea>' +
        '<div class="rating-modal__error" id="ratingError"></div>' +
        '<div class="rating-modal__actions">' +
          '<button class="btn btn--primary btn--sm" id="btnSubmitRating">إرسال التقييم</button>' +
          '<button class="btn btn--ghost btn--sm" id="btnCancelRating">إلغاء</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    // Load accepted workers into dropdown (employer only)
    if (isEmployer) {
      (async function () {
        try {
          var appsRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
          var selectEl = modal.querySelector('#ratingTargetSelect');
          if (selectEl && appsRes.data.ok && appsRes.data.applications) {
            var accepted = appsRes.data.applications.filter(function (a) { return a.status === 'accepted'; });
            if (accepted.length === 0) {
              selectEl.innerHTML = '<option value="">لا يوجد عمال مقبولين</option>';
            } else {
              selectEl.innerHTML = '<option value="">اختار العامل...</option>';
              accepted.forEach(function (a) {
                var w = a.worker || {};
                var label = (w.name || 'بدون اسم') + ' — ' + (w.phone || a.workerId);
                var opt = document.createElement('option');
                opt.value = a.workerId;
                opt.textContent = label;
                selectEl.appendChild(opt);
              });
            }
          }
        } catch (_) {
          var selectEl = modal.querySelector('#ratingTargetSelect');
          if (selectEl) selectEl.innerHTML = '<option value="">خطأ في تحميل العمال</option>';
        }
      })();
    }

    // Focus trap
    var releaseTrap = YawmiaUtils.trapFocus(modal.querySelector('.rating-modal__card'), function () {
      modal.remove();
    });

    // Star selection
    var starBtns = modal.querySelectorAll('.star-btn');
    function selectStar(starNum) {
      selectedStars = starNum;
      starBtns.forEach(function (b) {
        var s = parseInt(b.getAttribute('data-star'));
        if (s <= selectedStars) {
          b.classList.add('active');
          b.setAttribute('aria-checked', 'true');
        } else {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        }
        b.setAttribute('tabindex', s === selectedStars ? '0' : '-1');
      });
    }
    starBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectStar(parseInt(btn.getAttribute('data-star')));
      });
    });

    // Arrow key navigation for stars (RTL-aware: Right=decrease, Left=increase)
    var starsContainer = modal.querySelector('#ratingStarsInput');
    if (starsContainer) {
      starsContainer.addEventListener('keydown', function (e) {
        var current = selectedStars || 1;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          var next = Math.min(current + 1, 5);
          selectStar(next);
          starBtns[next - 1].focus();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          var prev = Math.max(current - 1, 1);
          selectStar(prev);
          starBtns[prev - 1].focus();
        }
      });
    }

    // Cancel
    modal.querySelector('#btnCancelRating').addEventListener('click', function () {
      releaseTrap();
      modal.remove();
    });

    // Click outside card to close
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        releaseTrap();
        modal.remove();
      }
    });

    // Submit
    modal.querySelector('#btnSubmitRating').addEventListener('click', async function () {
      var errorEl = modal.querySelector('#ratingError');
      errorEl.textContent = '';

      if (selectedStars < 1) {
        errorEl.textContent = 'اختار عدد النجوم';
        return;
      }

      var toUserId = prefilledTargetId;
      if (isEmployer) {
        toUserId = (modal.querySelector('#ratingTargetSelect') || {}).value || '';
        if (!toUserId) {
          errorEl.textContent = 'اختار العامل';
          return;
        }
      }

      var comment = (modal.querySelector('#ratingComment') || {}).value || '';

      var submitBtn = modal.querySelector('#btnSubmitRating');
      Yawmia.setLoading(submitBtn, true);

      try {
        var body = { toUserId: toUserId, stars: selectedStars };
        if (comment.trim()) body.comment = comment.trim();

        var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/rate', body);
        if (res.data.ok) {
          releaseTrap();
          modal.remove();
          YawmiaToast.success('تم إرسال التقييم بنجاح ⭐');
          loadJobs();
        } else {
          errorEl.textContent = res.data.error || 'خطأ في إرسال التقييم';
        }
      } catch (err) {
        errorEl.textContent = 'خطأ في الاتصال بالسيرفر';
      } finally {
        Yawmia.setLoading(submitBtn, false);
      }
    });
  }

})();
```

---

## `frontend/assets/js/modal.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/modal.js — Custom Modal System (IIFE)
// Phase 26 — Promise-based confirm() + prompt() replacements
// Dark theme, RTL-aware, accessible, focus-trapped
// ═══════════════════════════════════════════════════════════════

var YawmiaModal = (function () {
  'use strict';

  var escapeHtml = (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml : function (s) { return s || ''; };

  /**
   * Show a confirmation modal (replaces native confirm()).
   *
   * @param {object} options
   * @param {string} options.title — modal title (Arabic)
   * @param {string} options.message — description text (Arabic)
   * @param {string} [options.confirmText='تأكيد'] — confirm button label
   * @param {string} [options.cancelText='إلغاء'] — cancel button label
   * @param {boolean} [options.danger=false] — if true, confirm button is red
   * @returns {Promise<boolean>} — true if confirmed, false if cancelled
   */
  function confirm(options) {
    var opts = options || {};
    var title = opts.title || 'تأكيد';
    var message = opts.message || '';
    var confirmText = opts.confirmText || 'تأكيد';
    var cancelText = opts.cancelText || 'إلغاء';
    var danger = !!opts.danger;

    return new Promise(function (resolve) {
      var previousFocus = document.activeElement;

      // Build modal DOM
      var overlay = document.createElement('div');
      overlay.className = 'ym-modal-overlay';

      var titleId = 'ym-modal-title-' + Date.now();
      var messageId = 'ym-modal-msg-' + Date.now();

      var card = document.createElement('div');
      card.className = 'ym-modal-card';
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', titleId);
      if (message) card.setAttribute('aria-describedby', messageId);

      var btnClass = danger ? 'btn btn--sm ym-modal-btn--danger' : 'btn btn--sm btn--primary';

      card.innerHTML =
        '<h3 class="ym-modal-title" id="' + titleId + '">' + escapeHtml(title) + '</h3>' +
        (message ? '<p class="ym-modal-message" id="' + messageId + '">' + escapeHtml(message) + '</p>' : '') +
        '<div class="ym-modal-actions">' +
          '<button class="' + btnClass + '" data-ym-role="confirm">' + escapeHtml(confirmText) + '</button>' +
          '<button class="btn btn--sm btn--ghost" data-ym-role="cancel">' + escapeHtml(cancelText) + '</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Focus trap
      var releaseTrap = null;
      if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.trapFocus) {
        releaseTrap = YawmiaUtils.trapFocus(card, function () {
          cleanup(false);
        });
      }

      function cleanup(result) {
        if (releaseTrap) releaseTrap();
        document.body.style.overflow = '';
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // Restore focus
        if (previousFocus && typeof previousFocus.focus === 'function') {
          try { previousFocus.focus(); } catch (_) {}
        }
        resolve(result);
      }

      // Button handlers
      var confirmBtn = card.querySelector('[data-ym-role="confirm"]');
      var cancelBtn = card.querySelector('[data-ym-role="cancel"]');

      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () { cleanup(true); });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { cleanup(false); });
      }

      // Click outside card → cancel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          cleanup(false);
        }
      });
    });
  }

  /**
   * Show a prompt modal (replaces native prompt()).
   *
   * @param {object} options
   * @param {string} options.title — modal title (Arabic)
   * @param {string} [options.message] — description text (Arabic)
   * @param {string} [options.placeholder=''] — input placeholder
   * @param {string} [options.inputType='text'] — input type
   * @param {number} [options.minLength] — minimum input length for validation
   * @param {boolean} [options.required=false] — if true, empty input shows error
   * @param {string} [options.confirmText='إرسال'] — submit button label
   * @param {string} [options.cancelText='إلغاء'] — cancel button label
   * @returns {Promise<string|null>} — submitted string or null if cancelled
   */
  function prompt(options) {
    var opts = options || {};
    var title = opts.title || 'إدخال';
    var message = opts.message || '';
    var placeholder = opts.placeholder || '';
    var inputType = opts.inputType || 'text';
    var minLength = typeof opts.minLength === 'number' ? opts.minLength : 0;
    var required = !!opts.required;
    var confirmText = opts.confirmText || 'إرسال';
    var cancelText = opts.cancelText || 'إلغاء';

    return new Promise(function (resolve) {
      var previousFocus = document.activeElement;

      // Build modal DOM
      var overlay = document.createElement('div');
      overlay.className = 'ym-modal-overlay';

      var titleId = 'ym-modal-title-' + Date.now();
      var messageId = 'ym-modal-msg-' + Date.now();
      var errorId = 'ym-modal-error-' + Date.now();

      var card = document.createElement('div');
      card.className = 'ym-modal-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', titleId);
      if (message) card.setAttribute('aria-describedby', messageId);

      var inputTag = inputType === 'textarea'
        ? '<textarea class="ym-modal-input" placeholder="' + escapeHtml(placeholder) + '" aria-describedby="' + errorId + '"></textarea>'
        : '<input type="' + escapeHtml(inputType) + '" class="ym-modal-input" placeholder="' + escapeHtml(placeholder) + '" aria-describedby="' + errorId + '">';

      card.innerHTML =
        '<h3 class="ym-modal-title" id="' + titleId + '">' + escapeHtml(title) + '</h3>' +
        (message ? '<p class="ym-modal-message" id="' + messageId + '">' + escapeHtml(message) + '</p>' : '') +
        inputTag +
        '<div class="ym-modal-error" id="' + errorId + '" aria-live="polite"></div>' +
        '<div class="ym-modal-actions">' +
          '<button class="btn btn--sm btn--primary" data-ym-role="submit">' + escapeHtml(confirmText) + '</button>' +
          '<button class="btn btn--sm btn--ghost" data-ym-role="cancel">' + escapeHtml(cancelText) + '</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Auto-focus input
      var inputEl = card.querySelector('.ym-modal-input');
      var errorEl = card.querySelector('.ym-modal-error');

      // Focus trap
      var releaseTrap = null;
      if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.trapFocus) {
        releaseTrap = YawmiaUtils.trapFocus(card, function () {
          cleanup(null);
        });
      }

      // Override auto-focus from trapFocus to focus input instead
      if (inputEl) {
        setTimeout(function () { inputEl.focus(); }, 0);
      }

      function cleanup(result) {
        if (releaseTrap) releaseTrap();
        document.body.style.overflow = '';
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // Restore focus
        if (previousFocus && typeof previousFocus.focus === 'function') {
          try { previousFocus.focus(); } catch (_) {}
        }
        resolve(result);
      }

      function trySubmit() {
        var value = inputEl ? inputEl.value.trim() : '';

        // Validation
        if (required && !value) {
          if (errorEl) errorEl.textContent = 'هذا الحقل مطلوب';
          if (inputEl) inputEl.focus();
          return;
        }
        if (minLength > 0 && value.length > 0 && value.length < minLength) {
          if (errorEl) errorEl.textContent = 'لازم يكون ' + minLength + ' حروف على الأقل';
          if (inputEl) inputEl.focus();
          return;
        }

        cleanup(value || null);
      }

      // Button handlers
      var submitBtn = card.querySelector('[data-ym-role="submit"]');
      var cancelBtn = card.querySelector('[data-ym-role="cancel"]');

      if (submitBtn) {
        submitBtn.addEventListener('click', trySubmit);
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { cleanup(null); });
      }

      // Enter key in input → submit
      if (inputEl && inputType !== 'textarea') {
        inputEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            trySubmit();
          }
        });
      }

      // Clear error on input
      if (inputEl && errorEl) {
        inputEl.addEventListener('input', function () {
          errorEl.textContent = '';
        });
      }

      // Click outside card → cancel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          cleanup(null);
        }
      });
    });
  }

  return {
    confirm: confirm,
    prompt: prompt,
  };
})();
```

---

## `frontend/assets/js/profile.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/profile.js — Profile UI Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Auth check — redirect if not logged in
  if (!Yawmia.isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  var user = Yawmia.getUser();

  // ── Setup Header ──────────────────────────────────────────
  var headerName = Yawmia.$id('headerUserName');
  var headerRole = Yawmia.$id('headerUserRole');
  if (headerName) headerName.textContent = user.name || user.phone;
  if (headerRole) {
    headerRole.textContent = Yawmia.roleLabel(user.role);
    headerRole.classList.add('badge--' + user.role);
  }

  // ── Logout ────────────────────────────────────────────────
  var btnLogout = Yawmia.$id('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      Yawmia.logout();
    });
  }

  // ── minRatingsToShow from config ──────────────────────────
  var minRatingsToShow = 3; // default fallback

  // ── Load Profile ──────────────────────────────────────────
  loadProfile();

  async function loadProfile() {
    try {
      // Load config for minRatingsToShow
      var cfg = await Yawmia.loadConfig();
      if (cfg && cfg.RATINGS && typeof cfg.RATINGS.minRatingsToShow === 'number') {
        minRatingsToShow = cfg.RATINGS.minRatingsToShow;
      }

      // Fetch fresh user data
      var res = await Yawmia.api('GET', '/api/auth/me');
      if (res.data.ok) {
        user = res.data.user;
        // Update stored user
        Yawmia.setAuth(Yawmia.getToken(), user);
        renderProfile(user);
        renderEditForm(user);
        renderNotificationPreferences(user);
        renderVerificationSection(user);

        // Role-specific sections
        if (user.role === 'worker') {
          Yawmia.show('myApplicationsSection');
          loadMyApplications();
          loadAttendanceHistory();
        } else if (user.role === 'employer') {
          Yawmia.show('myJobsSection');
          loadMyJobs();
        }

        // Load ratings
        loadRatings(user.id);
      }
    } catch (err) {
      // Ignore — will show cached data
    }
  }

  // ── Render Profile Card ───────────────────────────────────
  function renderProfile(u) {
    var avatarEl = Yawmia.$id('profileAvatar');
    var nameEl = Yawmia.$id('profileName');
    var phoneEl = Yawmia.$id('profilePhone');
    var govEl = Yawmia.$id('profileGov');
    var ratingSummaryEl = Yawmia.$id('profileRatingSummary');
    var categoriesEl = Yawmia.$id('profileCategories');

    if (avatarEl) avatarEl.textContent = u.role === 'worker' ? '👷' : '🏢';
    if (nameEl) nameEl.textContent = u.name || 'بدون اسم';
    if (phoneEl) phoneEl.textContent = u.phone;
    if (govEl) govEl.textContent = u.governorate ? '📍 ' + u.governorate : '';

    // Rating summary in profile header
    if (ratingSummaryEl) {
      var rating = u.rating || { avg: 0, count: 0 };
      if (rating.count >= minRatingsToShow) {
        ratingSummaryEl.innerHTML =
          '<div class="rating-summary-avg">' + rating.avg + '</div>' +
          '<div class="rating-summary-stars">' + starsDisplay(rating.avg) + '</div>' +
          '<div class="rating-summary-count">' + rating.count + ' تقييم</div>';
      } else if (rating.count > 0) {
        var needed = minRatingsToShow - rating.count;
        ratingSummaryEl.innerHTML =
          '<div class="rating-summary-msg">محتاج ' + needed + ' تقييمات كمان لعرض المتوسط</div>';
      } else {
        ratingSummaryEl.innerHTML =
          '<div class="rating-summary-msg">لا توجد تقييمات بعد</div>';
      }
    }

    // Categories (worker only)
    if (categoriesEl && u.categories && u.categories.length > 0) {
      Yawmia.show('profileCategories');
      categoriesEl.innerHTML = '';
      u.categories.forEach(function (catId) {
        var span = document.createElement('span');
        span.className = 'badge badge--worker';
        span.textContent = catId;
        categoriesEl.appendChild(span);
      });
    }
  }

  // ── Render Edit Form ──────────────────────────────────────
  async function renderEditForm(u) {
    var nameInput = Yawmia.$id('editName');
    var govSelect = Yawmia.$id('editGov');

    if (nameInput) nameInput.value = u.name || '';

    // Populate governorates
    await Yawmia.populateGovernorates('editGov');
    if (govSelect && u.governorate) govSelect.value = u.governorate;

    // Categories for workers
    if (u.role === 'worker') {
      Yawmia.show('editCategoriesGroup');
      await Yawmia.populateCategoriesCheckboxes('editCategoriesGrid');
      // Pre-check existing categories
      if (u.categories && u.categories.length > 0) {
        u.categories.forEach(function (catId) {
          var cb = document.querySelector('#editCategoriesGrid input[value="' + catId + '"]');
          if (cb) cb.checked = true;
        });
      }
    }

    // Location fields (lat/lng) — inject after governorate
    var editForm = govSelect ? govSelect.closest('.card') : null;
    if (editForm) {
      var existingLocGroup = editForm.querySelector('.location-group');
      if (!existingLocGroup) {
        var locGroup = document.createElement('div');
        locGroup.className = 'form-group';
        locGroup.innerHTML =
          '<label class="form-label">الموقع الجغرافي</label>' +
          '<div class="location-group">' +
            '<div class="form-group">' +
              '<input type="number" step="any" id="editLat" class="form-input form-input--sm" placeholder="خط العرض (مثال: 30.04)" value="' + (u.lat || '') + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<input type="number" step="any" id="editLng" class="form-input form-input--sm" placeholder="خط الطول (مثال: 31.23)" value="' + (u.lng || '') + '">' +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn-detect-location" id="btnDetectLocation">📍 استخدم موقعي الحالي</button>';

        // Insert before the save button or at end of form
        var btnUpdateEl = editForm.querySelector('#btnUpdateProfile');
        if (btnUpdateEl) {
          btnUpdateEl.parentNode.insertBefore(locGroup, btnUpdateEl);
        } else {
          editForm.appendChild(locGroup);
        }

        // Detect location button handler
        var btnDetect = editForm.querySelector('#btnDetectLocation');
        if (btnDetect) {
          btnDetect.addEventListener('click', function () {
            if (!navigator.geolocation) {
              YawmiaToast.error('المتصفح لا يدعم تحديد الموقع');
              return;
            }
            btnDetect.textContent = '⏳ جاري تحديد الموقع...';
            btnDetect.disabled = true;
            navigator.geolocation.getCurrentPosition(
              function (pos) {
                var latInput = Yawmia.$id('editLat');
                var lngInput = Yawmia.$id('editLng');
                if (latInput) latInput.value = pos.coords.latitude.toFixed(6);
                if (lngInput) lngInput.value = pos.coords.longitude.toFixed(6);
                btnDetect.textContent = '📍 تم تحديد الموقع ✓';
                btnDetect.disabled = false;
              },
              function (err) {
                YawmiaToast.error('تعذّر تحديد الموقع: ' + (err.message || 'خطأ غير معروف'));
                btnDetect.textContent = '📍 استخدم موقعي الحالي';
                btnDetect.disabled = false;
              },
              { enableHighAccuracy: true, timeout: 10000 }
            );
          });
        }
      }
    }
  }

  // ── Update Profile Handler ────────────────────────────────
  var btnUpdate = Yawmia.$id('btnUpdateProfile');
  if (btnUpdate) {
    btnUpdate.addEventListener('click', async function () {
      Yawmia.clearMessage('editProfileMsg');

      var name = (Yawmia.$id('editName') || {}).value || '';
      var governorate = (Yawmia.$id('editGov') || {}).value || '';

      if (!name.trim()) {
        return Yawmia.showMessage('editProfileMsg', 'أدخل اسمك', 'error');
      }
      if (!governorate) {
        return Yawmia.showMessage('editProfileMsg', 'اختار المحافظة', 'error');
      }

      var body = { name: name.trim(), governorate: governorate };

      // Include lat/lng if provided
      var latVal = (Yawmia.$id('editLat') || {}).value;
      var lngVal = (Yawmia.$id('editLng') || {}).value;
      if (latVal !== undefined && latVal !== '') body.lat = parseFloat(latVal);
      if (lngVal !== undefined && lngVal !== '') body.lng = parseFloat(lngVal);

      if (user.role === 'worker') {
        var checked = document.querySelectorAll('#editCategoriesGrid input[name="categories"]:checked');
        var categories = Array.from(checked).map(function (el) { return el.value; });
        if (categories.length === 0) {
          return Yawmia.showMessage('editProfileMsg', 'اختار تخصص واحد على الأقل', 'error');
        }
        body.categories = categories;
      }

      Yawmia.setLoading(btnUpdate, true);

      try {
        var res = await Yawmia.api('PUT', '/api/auth/profile', body);
        if (res.data.ok) {
          user = res.data.user;
          Yawmia.setAuth(Yawmia.getToken(), user);
          renderProfile(user);
          // Update header
          if (headerName) headerName.textContent = user.name || user.phone;
          Yawmia.showMessage('editProfileMsg', 'تم حفظ التعديلات بنجاح', 'success');
        } else {
          Yawmia.showMessage('editProfileMsg', res.data.error || 'خطأ في الحفظ', 'error');
        }
      } catch (err) {
        Yawmia.showMessage('editProfileMsg', 'خطأ في الاتصال بالسيرفر', 'error');
      } finally {
        Yawmia.setLoading(btnUpdate, false);
      }
    });
  }

  // ── Load My Applications (Worker) ─────────────────────────
  async function loadMyApplications() {
    var listEl = Yawmia.$id('myApplicationsList');
    if (!listEl) return;

    try {
      var res = await Yawmia.api('GET', '/api/applications/mine');
      if (res.data.ok && res.data.applications.length > 0) {
        listEl.innerHTML = '';
        res.data.applications.forEach(function (app) {
          listEl.appendChild(createApplicationCard(app));
        });
      } else {
        listEl.innerHTML = '<p class="empty-state">لا توجد طلبات بعد</p>';
      }
    } catch (err) {
      listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الطلبات</p>';
    }
  }

  function createApplicationCard(app) {
    var card = document.createElement('div');
    card.className = 'app-card';

    var statusLabels = {
      pending: 'في الانتظار',
      accepted: 'مقبول ✓',
      rejected: 'مرفوض ✗',
      withdrawn: 'تم السحب'
    };
    var statusClasses = {
      pending: 'badge--filled',
      accepted: 'badge--completed',
      rejected: 'badge--cancelled',
      withdrawn: 'badge--expired'
    };

    var statusLabel = statusLabels[app.status] || app.status;
    var statusClass = statusClasses[app.status] || '';

    var jobTitle = app.job ? escapeHtml(app.job.title) : 'فرصة محذوفة';
    var jobWage = app.job ? app.job.dailyWage + ' جنيه/يوم' : '';
    var jobGov = app.job ? app.job.governorate : '';

    var infoHtml =
      '<div class="app-card__info">' +
        '<div class="app-card__title">' + jobTitle + '</div>' +
        '<div class="app-card__meta">' +
          (jobWage ? jobWage + ' • ' : '') +
          (jobGov ? '📍 ' + escapeHtml(jobGov) + ' • ' : '') +
          new Date(app.appliedAt).toLocaleDateString('ar-EG') +
        '</div>' +
      '</div>';

    var actionsHtml =
      '<div class="app-card__actions">' +
        '<span class="badge badge--status ' + statusClass + '">' + statusLabel + '</span>';

    if (app.status === 'pending') {
      actionsHtml += ' <button class="btn btn--ghost btn--sm btn-withdraw" data-app-id="' + app.id + '">سحب الطلب</button>';
    }

    actionsHtml += '</div>';

    card.innerHTML = infoHtml + actionsHtml;

    // Withdraw handler
    var withdrawBtn = card.querySelector('.btn-withdraw');
    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'سحب الطلب', message: 'متأكد إنك عايز تسحب الطلب؟', confirmText: 'سحب الطلب', cancelText: 'رجوع', danger: true });
        if (!confirmed) return;
        Yawmia.setLoading(withdrawBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/applications/' + app.id + '/withdraw');
          if (res.data.ok) {
            loadMyApplications(); // Reload list
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في سحب الطلب');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(withdrawBtn, false);
        }
      });
    }

    return card;
  }

  // ── Load My Jobs (Employer) ───────────────────────────────
  async function loadMyJobs() {
    var listEl = Yawmia.$id('myJobsList');
    if (!listEl) return;

    try {
      var res = await Yawmia.api('GET', '/api/jobs/mine');
      if (res.data.ok && res.data.jobs.length > 0) {
        listEl.innerHTML = '';
        res.data.jobs.forEach(function (job) {
          listEl.appendChild(createMyJobCard(job));
        });
      } else {
        listEl.innerHTML = '<p class="empty-state">لا توجد فرص منشورة بعد</p>';
      }
    } catch (err) {
      listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الفرص</p>';
    }
  }

  function createMyJobCard(job) {
    var card = document.createElement('div');
    card.className = 'myjob-card';

    var statusLabels = {
      open: 'متاحة',
      filled: 'مكتملة العدد',
      in_progress: 'جاري التنفيذ',
      completed: 'مكتملة ✓',
      expired: 'منتهية',
      cancelled: 'ملغية'
    };
    var statusLabel = statusLabels[job.status] || job.status;

    card.innerHTML =
      '<div class="myjob-card__info">' +
        '<div class="myjob-card__title">' + escapeHtml(job.title) + '</div>' +
        '<div class="myjob-card__meta">' +
          job.dailyWage + ' جنيه/يوم • ' +
          '👷 ' + job.workersAccepted + '/' + job.workersNeeded + ' عامل • ' +
          new Date(job.createdAt).toLocaleDateString('ar-EG') +
        '</div>' +
      '</div>' +
      '<span class="badge badge--status badge--' + job.status + '">' + statusLabel + '</span>';

    return card;
  }

  // ── Load Ratings ──────────────────────────────────────────
  async function loadRatings(userId) {
    var summaryArea = Yawmia.$id('ratingSummaryArea');
    var listArea = Yawmia.$id('ratingsListArea');

    // Load summary + distribution
    try {
      var summaryRes = await Yawmia.api('GET', '/api/users/' + userId + '/rating-summary');
      if (summaryRes.data) {
        renderRatingSummary(summaryArea, summaryRes.data);
      }
    } catch (err) {
      if (summaryArea) summaryArea.innerHTML = '';
    }

    // Load individual ratings
    try {
      var ratingsRes = await Yawmia.api('GET', '/api/users/' + userId + '/ratings?limit=10&offset=0');
      if (ratingsRes.data && ratingsRes.data.items && ratingsRes.data.items.length > 0) {
        renderRatingsList(listArea, ratingsRes.data.items);
      } else {
        if (listArea) listArea.innerHTML = '<p class="empty-state">لا توجد تقييمات تفصيلية بعد</p>';
      }
    } catch (err) {
      if (listArea) listArea.innerHTML = '<p class="empty-state">خطأ في تحميل التقييمات</p>';
    }
  }

  function renderRatingSummary(container, summary) {
    if (!container) return;

    var html = '<div class="rating-summary-card">';

    if (summary.count >= minRatingsToShow) {
      html +=
        '<div class="rating-summary-avg">' + summary.avg + '</div>' +
        '<div class="rating-summary-stars">' + starsDisplay(summary.avg) + '</div>' +
        '<div class="rating-summary-count">' + summary.count + ' تقييم</div>';
    } else if (summary.count > 0) {
      var needed = minRatingsToShow - summary.count;
      html += '<div class="rating-summary-msg">محتاج ' + needed + ' تقييمات كمان لعرض المتوسط</div>';
    } else {
      html += '<div class="rating-summary-msg">لا توجد تقييمات بعد</div>';
    }

    html += '</div>';

    // Distribution bars (always show if there are any ratings)
    if (summary.count > 0 && summary.distribution) {
      html += '<div class="rating-dist">';
      for (var star = 5; star >= 1; star--) {
        var count = summary.distribution[star] || 0;
        var pct = summary.count > 0 ? Math.round((count / summary.count) * 100) : 0;
        html +=
          '<div class="rating-dist-row">' +
            '<span class="rating-dist-label">' + star + ' ★</span>' +
            '<div class="rating-dist-bar"><div class="rating-dist-fill" style="width:' + pct + '%"></div></div>' +
            '<span class="rating-dist-count">' + count + '</span>' +
          '</div>';
      }
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function renderRatingsList(container, items) {
    if (!container) return;
    container.innerHTML = '';

    var list = document.createElement('div');
    list.className = 'ratings-list';

    items.forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'rating-item';

      var headerHtml =
        '<div class="rating-item__header">' +
          '<span class="rating-item__stars">' + starsDisplay(r.stars) + '</span>' +
          '<span class="rating-item__date">' + new Date(r.createdAt).toLocaleDateString('ar-EG') + '</span>' +
        '</div>';

      var commentHtml = r.comment
        ? '<div class="rating-item__comment">' + escapeHtml(r.comment) + '</div>'
        : '';

      var fromHtml = '<div class="rating-item__from">من: ' + (r.fromRole === 'worker' ? 'عامل' : 'صاحب عمل') + '</div>';

      item.innerHTML = headerHtml + commentHtml + fromHtml;
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  // ── Notification Preferences ──────────────────────────────
  function renderNotificationPreferences(u) {
    var container = Yawmia.$id('notification-prefs');
    if (!container) return;

    var prefs = u.notificationPreferences || { inApp: true, whatsapp: true, sms: false };

    container.innerHTML =
      '<section class="card">' +
        '<h2 class="card__title">إعدادات الإشعارات</h2>' +
        '<div class="pref-group">' +
          '<label class="pref-item">' +
            '<input type="checkbox" checked disabled />' +
            '<span>إشعارات داخل التطبيق (دايماً مفعّلة)</span>' +
          '</label>' +
          '<label class="pref-item">' +
            '<input type="checkbox" id="pref-whatsapp" ' + (prefs.whatsapp ? 'checked' : '') + ' />' +
            '<span>إشعارات واتساب للأحداث المهمة</span>' +
          '</label>' +
          '<label class="pref-item">' +
            '<input type="checkbox" id="pref-sms" ' + (prefs.sms ? 'checked' : '') + ' />' +
            '<span>إشعارات SMS للأحداث المهمة</span>' +
          '</label>' +
          '<label class="pref-item">' +
            '<input type="checkbox" id="pref-push" checked />' +
            '<span>إشعارات Push (حتى لو التطبيق مقفول)</span>' +
          '</label>' +
          '<button class="btn btn--ghost" id="save-prefs-btn">حفظ إعدادات الإشعارات</button>' +
        '</div>' +
      '</section>';

    var saveBtn = Yawmia.$id('save-prefs-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var whatsapp = Yawmia.$id('pref-whatsapp').checked;
        var sms = Yawmia.$id('pref-sms').checked;
        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';

        try {
          var res = await Yawmia.api('PUT', '/api/auth/profile', {
            notificationPreferences: { whatsapp: whatsapp, sms: sms }
          });
          if (res.data.ok) {
            saveBtn.textContent = 'تم الحفظ ✓';
            setTimeout(function () { saveBtn.textContent = 'حفظ إعدادات الإشعارات'; saveBtn.disabled = false; }, 2000);
          } else {
            saveBtn.textContent = 'خطأ — حاول مرة تانية';
            saveBtn.disabled = false;
          }
        } catch (err) {
          saveBtn.textContent = 'خطأ — حاول مرة تانية';
          saveBtn.disabled = false;
        }
      });
    }
  }

  // ── Verification Section ──────────────────────────────────
  function renderVerificationSection(u) {
    var container = Yawmia.$id('verification-section');
    if (!container) return;

    var status = u.verificationStatus || 'unverified';
    var html = '<section class="card">' +
      '<h2 class="card__title">🔐 التحقق من الهوية</h2>';

    if (status === 'verified') {
      html += '<div class="verification-status verification-status--verified">' +
        '<span class="verification-badge verification-badge--verified">✓ تم التحقق من هويتك</span>' +
        '</div>';
    } else if (status === 'pending') {
      html += '<div class="verification-status verification-status--pending">' +
        '<span class="verification-badge verification-badge--pending">⏳ طلب التحقق قيد المراجعة</span>' +
        '</div>';
    } else {
      if (status === 'rejected') {
        html += '<div class="verification-status verification-status--rejected">' +
          '<span class="verification-badge verification-badge--rejected">✗ تم رفض طلب التحقق — يمكنك إعادة المحاولة</span>' +
          '</div>';
      }
      html += '<p class="card__desc">ارفع صورة البطاقة الشخصية للتحقق من هويتك والحصول على علامة "محقق"</p>' +
        '<div class="form-group">' +
          '<label class="form-label">صورة البطاقة الشخصية</label>' +
          '<input type="file" id="nationalIdInput" accept="image/*" class="form-input">' +
        '</div>' +
        '<button class="btn btn--primary" id="btnSubmitVerification">إرسال طلب التحقق</button>' +
        '<div class="message" id="verificationMsg"></div>';
    }

    html += '</section>';
    container.innerHTML = html;

    var submitBtn = Yawmia.$id('btnSubmitVerification');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleVerificationSubmit);
    }
  }

  async function handleVerificationSubmit() {
    Yawmia.clearMessage('verificationMsg');
    var fileInput = Yawmia.$id('nationalIdInput');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      return Yawmia.showMessage('verificationMsg', 'اختار صورة البطاقة', 'error');
    }

    var file = fileInput.files[0];
    if (file.size > 2 * 1024 * 1024) {
      return Yawmia.showMessage('verificationMsg', 'حجم الصورة أكبر من 2MB', 'error');
    }

    var submitBtn = Yawmia.$id('btnSubmitVerification');
    Yawmia.setLoading(submitBtn, true);

    try {
      var base64 = await fileToBase64(file);
      var res = await Yawmia.api('POST', '/api/auth/verify-identity', {
        nationalIdImage: base64
      });
      if (res.data.ok) {
        Yawmia.showMessage('verificationMsg', 'تم إرسال طلب التحقق بنجاح — سيتم مراجعته قريباً', 'success');
        setTimeout(function() { location.reload(); }, 2000);
      } else {
        Yawmia.showMessage('verificationMsg', res.data.error || 'خطأ في إرسال الطلب', 'error');
      }
    } catch (err) {
      Yawmia.showMessage('verificationMsg', 'خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      Yawmia.setLoading(submitBtn, false);
    }
  }

  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(new Error('فشل قراءة الملف')); };
      reader.readAsDataURL(file);
    });
  }

  // ── Attendance History (Worker) ───────────────────────────
  async function loadAttendanceHistory() {
    var section = Yawmia.$id('attendanceHistorySection');
    var summaryArea = Yawmia.$id('attendanceSummaryArea');
    var listArea = Yawmia.$id('attendanceHistoryList');
    if (!section || !listArea) return;

    Yawmia.show('attendanceHistorySection');

    try {
      // Get accepted applications (last 10)
      var appsRes = await Yawmia.api('GET', '/api/applications/mine');
      if (!appsRes.data.ok || !appsRes.data.applications) {
        listArea.innerHTML = '<p class="empty-state">لا يوجد سجل حضور بعد</p>';
        return;
      }

      var acceptedApps = appsRes.data.applications
        .filter(function (a) { return a.status === 'accepted'; })
        .slice(0, 10);

      if (acceptedApps.length === 0) {
        listArea.innerHTML = '<p class="empty-state">لا يوجد سجل حضور بعد</p>';
        return;
      }

      var allRecords = [];
      var totalRecords = 0;
      var attendedRecords = 0;

      for (var i = 0; i < acceptedApps.length; i++) {
        var app = acceptedApps[i];
        try {
          var attRes = await Yawmia.api('GET', '/api/jobs/' + app.jobId + '/attendance');
          if (attRes.data.ok && attRes.data.records) {
            var myRecords = attRes.data.records.filter(function (r) { return r.workerId === user.id; });
            for (var j = 0; j < myRecords.length; j++) {
              myRecords[j]._jobTitle = app.job ? app.job.title : 'فرصة';
              allRecords.push(myRecords[j]);
              totalRecords++;
              if (myRecords[j].status === 'checked_in' || myRecords[j].status === 'checked_out' || myRecords[j].status === 'confirmed') {
                attendedRecords++;
              }
            }
          }
        } catch (e) {
          // Skip failed fetch
        }
      }

      // Render summary
      if (summaryArea && totalRecords > 0) {
        var rate = Math.round((attendedRecords / totalRecords) * 100);
        summaryArea.innerHTML =
          '<div class="attendance-summary">' +
            '<div class="attendance-summary__rate">' + rate + '%</div>' +
            '<div class="attendance-summary__label">نسبة الحضور</div>' +
            '<div class="attendance-summary__detail">' + attendedRecords + ' حضور من ' + totalRecords + ' سجل</div>' +
          '</div>';
      }

      // Render records
      if (allRecords.length === 0) {
        listArea.innerHTML = '<p class="empty-state">لا يوجد سجل حضور بعد</p>';
        return;
      }

      // Sort newest first
      allRecords.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

      listArea.innerHTML = '';
      var statusLabels = {
        pending: 'في الانتظار',
        checked_in: 'حاضر ✓',
        checked_out: 'انصرف',
        confirmed: 'مؤكد ✓✓',
        no_show: 'غائب ✗'
      };
      var statusClasses = {
        pending: 'badge--filled',
        checked_in: 'badge--completed',
        checked_out: 'badge--expired',
        confirmed: 'badge--completed',
        no_show: 'badge--cancelled'
      };

      allRecords.forEach(function (record) {
        var card = document.createElement('div');
        card.className = 'app-card';
        var statusLabel = statusLabels[record.status] || record.status;
        var statusClass = statusClasses[record.status] || '';
        card.innerHTML =
          '<div class="app-card__info">' +
            '<div class="app-card__title">' + escapeHtml(record._jobTitle || '') + '</div>' +
            '<div class="app-card__meta">' +
              '📅 ' + (record.date || '') +
              (record.hoursWorked ? ' • ⏱ ' + record.hoursWorked + ' ساعة' : '') +
              (record.employerConfirmed ? ' • ✓ مؤكد من صاحب العمل' : '') +
            '</div>' +
          '</div>' +
          '<div class="app-card__actions">' +
            '<span class="badge badge--status ' + statusClass + '">' + statusLabel + '</span>' +
          '</div>';
        listArea.appendChild(card);
      });

    } catch (err) {
      listArea.innerHTML = '<p class="empty-state">خطأ في تحميل سجل الحضور</p>';
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  // ── Helpers — delegated to YawmiaUtils ────────────────────
  function starsDisplay(rating) {
    return YawmiaUtils.starsDisplay(rating);
  }

  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

})();
```

---

## `frontend/assets/js/toast.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/toast.js — Toast Notification System (IIFE)
// Phase 19 — 4 types, SVG icons, aria-live, auto-dismiss
// ═══════════════════════════════════════════════════════════════

var YawmiaToast = (function () {
  'use strict';

  var container = null;
  var toastCounter = 0;

  var defaultIcons = {
    success: 'checkCircle',
    error: 'xCircle',
    warning: 'alertTriangle',
    info: 'info',
  };

  var defaultDuration = 4000;

  /**
   * Lazily create and return the toast container element.
   */
  function getContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
    return container;
  }

  /**
   * Show a toast notification.
   * @param {string} message — text to display
   * @param {object} [options]
   * @param {string} [options.type='info'] — 'success'|'error'|'warning'|'info'
   * @param {number} [options.duration=4000] — auto-dismiss delay in ms (0 = no auto-dismiss)
   * @param {string} [options.icon] — icon name override from YawmiaIcons
   * @returns {string} — toast ID
   */
  function show(message, options) {
    var opts = options || {};
    var type = opts.type || 'info';
    var duration = typeof opts.duration === 'number' ? opts.duration : defaultDuration;
    var iconName = opts.icon || defaultIcons[type] || 'info';

    var id = 'toast-' + (++toastCounter);
    var cont = getContainer();

    var toast = document.createElement('div');
    toast.id = id;
    toast.className = 'toast toast--' + type;
    toast.setAttribute('role', 'alert');

    // Icon
    var iconHtml = '';
    if (typeof YawmiaIcons !== 'undefined') {
      iconHtml = YawmiaIcons.get(iconName, { size: 20, 'class': 'toast__icon' });
    }

    // Message (escaped)
    var safeMsg = (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(message) : message;

    // Close button icon
    var closeIconHtml = '';
    if (typeof YawmiaIcons !== 'undefined') {
      closeIconHtml = YawmiaIcons.get('close', { size: 16 });
    } else {
      closeIconHtml = '✕';
    }

    toast.innerHTML =
      (iconHtml ? '<span class="toast__icon-wrap">' + iconHtml + '</span>' : '') +
      '<span class="toast__message">' + safeMsg + '</span>' +
      '<button class="toast__close" aria-label="إغلاق">' + closeIconHtml + '</button>';

    // Close button handler
    var closeBtn = toast.querySelector('.toast__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        dismiss(id);
      });
    }

    cont.appendChild(toast);

    // Entrance animation via rAF
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('toast--visible');
      });
    });

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(function () {
        dismiss(id);
      }, duration);
    }

    return id;
  }

  /**
   * Dismiss a toast by ID.
   * @param {string} id
   */
  function dismiss(id) {
    var toast = document.getElementById(id);
    if (!toast) return;

    toast.classList.remove('toast--visible');
    toast.classList.add('toast--exit');

    // Remove from DOM after exit animation
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // ── Convenience Methods ───────────────────────────────────
  function success(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'success' }));
  }

  function error(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'error' }));
  }

  function warning(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'warning' }));
  }

  function info(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'info' }));
  }

  return {
    show: show,
    dismiss: dismiss,
    success: success,
    error: error,
    warning: warning,
    info: info,
  };
})();
```

---

## `frontend/assets/js/user.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/user.js — Public Profile Page Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var minRatingsToShow = 3;

  // Get userId from URL
  var params = new URLSearchParams(window.location.search);
  var userId = params.get('id');

  if (!userId) {
    showError();
    return;
  }

  loadPublicProfile(userId);

  async function loadPublicProfile(uid) {
    try {
      // Load config
      var cfg = await Yawmia.loadConfig();
      if (cfg && cfg.RATINGS && typeof cfg.RATINGS.minRatingsToShow === 'number') {
        minRatingsToShow = cfg.RATINGS.minRatingsToShow;
      }

      var res = await Yawmia.api('GET', '/api/users/' + uid + '/public-profile');
      if (!res.data.ok || !res.data.profile) {
        showError();
        return;
      }

      var profile = res.data.profile;
      renderProfile(profile);

      // Load ratings
      loadRatings(uid);

      Yawmia.hide('profileLoading');
      Yawmia.show('profileContent');

    } catch (err) {
      showError();
    }
  }

  function renderProfile(p) {
    var avatarEl = Yawmia.$id('pubAvatar');
    var nameEl = Yawmia.$id('pubName');
    var govEl = Yawmia.$id('pubGov');
    var roleBadgeEl = Yawmia.$id('pubRoleBadge');
    var verBadgeEl = Yawmia.$id('pubVerificationBadge');
    var ratingEl = Yawmia.$id('pubRatingSummary');
    var categoriesEl = Yawmia.$id('pubCategories');
    var trustSection = Yawmia.$id('pubTrustSection');
    var trustScoreEl = Yawmia.$id('pubTrustScore');
    var memberEl = Yawmia.$id('pubMemberSince');

    if (avatarEl) avatarEl.textContent = p.role === 'worker' ? '👷' : '🏢';
    if (nameEl) nameEl.textContent = p.name || 'بدون اسم';
    if (govEl) govEl.textContent = p.governorate ? '📍 ' + p.governorate : '';

    // Role badge
    if (roleBadgeEl) {
      var roleText = p.role === 'worker' ? 'عامل' : (p.role === 'employer' ? 'صاحب عمل' : p.role);
      roleBadgeEl.innerHTML = '<span class="badge badge--' + escapeHtml(p.role) + '">' + escapeHtml(roleText) + '</span>';
    }

    // Verification badge
    if (verBadgeEl) {
      var verLabels = {
        verified: '✓ هوية محققة',
        pending: '⏳ قيد التحقق',
        rejected: '',
        unverified: '',
      };
      var verClasses = {
        verified: 'verification-badge--verified',
        pending: 'verification-badge--pending',
        rejected: '',
        unverified: '',
      };
      var vStatus = p.verificationStatus || 'unverified';
      if (verLabels[vStatus]) {
        verBadgeEl.innerHTML = '<span class="verification-badge ' + verClasses[vStatus] + '">' + escapeHtml(verLabels[vStatus]) + '</span>';
      }
    }

    // Rating
    if (ratingEl) {
      var rating = p.rating || { avg: 0, count: 0 };
      if (rating.count >= minRatingsToShow) {
        ratingEl.innerHTML =
          '<div class="rating-summary-avg">' + rating.avg + '</div>' +
          '<div class="rating-summary-stars">' + starsDisplay(rating.avg) + '</div>' +
          '<div class="rating-summary-count">' + rating.count + ' تقييم</div>';
      } else if (rating.count > 0) {
        ratingEl.innerHTML = '<div class="rating-summary-msg">تقييمات غير كافية لعرض المتوسط</div>';
      } else {
        ratingEl.innerHTML = '<div class="rating-summary-msg">لا توجد تقييمات</div>';
      }
    }

    // Categories
    if (categoriesEl && p.categories && p.categories.length > 0) {
      Yawmia.show('pubCategories');
      categoriesEl.innerHTML = '';
      p.categories.forEach(function (catId) {
        var span = document.createElement('span');
        span.className = 'badge badge--worker';
        span.textContent = catId;
        categoriesEl.appendChild(span);
      });
    }

    // Trust score
    if (trustSection && trustScoreEl && typeof p.trustScore === 'number') {
      var trustClass = p.trustScore >= 0.7 ? 'trust-high' : (p.trustScore >= 0.4 ? 'trust-medium' : 'trust-low');
      trustScoreEl.innerHTML =
        '<div class="trust-score-display ' + trustClass + '">' +
          '<span class="trust-score-value">' + Math.round(p.trustScore * 100) + '</span>' +
          '<span class="trust-score-label">/ 100</span>' +
        '</div>';
      trustSection.classList.remove('hidden');
    } else if (trustSection) {
      trustSection.classList.add('hidden');
    }

    // Member since
    if (memberEl && p.memberSince) {
      memberEl.textContent = 'عضو منذ ' + new Date(p.memberSince).toLocaleDateString('ar-EG');
    }
  }

  async function loadRatings(uid) {
    var summaryArea = Yawmia.$id('pubRatingSummaryArea');
    var listArea = Yawmia.$id('pubRatingsListArea');

    try {
      var summaryRes = await Yawmia.api('GET', '/api/users/' + uid + '/rating-summary');
      if (summaryRes.data) {
        renderRatingSummary(summaryArea, summaryRes.data);
      }
    } catch (err) {
      if (summaryArea) summaryArea.innerHTML = '';
    }

    try {
      var ratingsRes = await Yawmia.api('GET', '/api/users/' + uid + '/ratings?limit=10&offset=0');
      if (ratingsRes.data && ratingsRes.data.items && ratingsRes.data.items.length > 0) {
        renderRatingsList(listArea, ratingsRes.data.items);
      } else {
        if (listArea) listArea.innerHTML = '<p class="empty-state">لا توجد تقييمات تفصيلية</p>';
      }
    } catch (err) {
      if (listArea) listArea.innerHTML = '<p class="empty-state">خطأ في تحميل التقييمات</p>';
    }
  }

  function renderRatingSummary(container, summary) {
    if (!container) return;
    var html = '<div class="rating-summary-card">';
    if (summary.count >= minRatingsToShow) {
      html +=
        '<div class="rating-summary-avg">' + summary.avg + '</div>' +
        '<div class="rating-summary-stars">' + starsDisplay(summary.avg) + '</div>' +
        '<div class="rating-summary-count">' + summary.count + ' تقييم</div>';
    } else if (summary.count > 0) {
      html += '<div class="rating-summary-msg">تقييمات غير كافية لعرض المتوسط</div>';
    } else {
      html += '<div class="rating-summary-msg">لا توجد تقييمات</div>';
    }
    html += '</div>';

    if (summary.count > 0 && summary.distribution) {
      html += '<div class="rating-dist">';
      for (var star = 5; star >= 1; star--) {
        var count = summary.distribution[star] || 0;
        var pct = summary.count > 0 ? Math.round((count / summary.count) * 100) : 0;
        html +=
          '<div class="rating-dist-row">' +
            '<span class="rating-dist-label">' + star + ' ★</span>' +
            '<div class="rating-dist-bar"><div class="rating-dist-fill" style="width:' + pct + '%"></div></div>' +
            '<span class="rating-dist-count">' + count + '</span>' +
          '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  }

  function renderRatingsList(container, items) {
    if (!container) return;
    container.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'ratings-list';
    items.forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'rating-item';
      item.innerHTML =
        '<div class="rating-item__header">' +
          '<span class="rating-item__stars">' + starsDisplay(r.stars) + '</span>' +
          '<span class="rating-item__date">' + new Date(r.createdAt).toLocaleDateString('ar-EG') + '</span>' +
        '</div>' +
        (r.comment ? '<div class="rating-item__comment">' + escapeHtml(r.comment) + '</div>' : '') +
        '<div class="rating-item__from">من: ' + (r.fromRole === 'worker' ? 'عامل' : 'صاحب عمل') + '</div>';
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  function showError() {
    Yawmia.hide('profileLoading');
    Yawmia.show('profileError');
  }

  // ── Helpers — delegated to YawmiaUtils ────────────────────
  function starsDisplay(rating) {
    return YawmiaUtils.starsDisplay(rating);
  }

  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

})();
```

---

## `frontend/assets/js/utils.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/utils.js — Shared Frontend Utilities (IIFE)
// Phase 18 — Deduplicated escapeHtml, starsDisplay, timeAgo, etc.
// ═══════════════════════════════════════════════════════════════

var YawmiaUtils = (function () {
  'use strict';

  /**
   * Escape HTML entities in a string.
   * Same implementation as previously duplicated across modules.
   */
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Star rating display using SVG icons from YawmiaIcons.
   * @param {number} rating — 0 to 5
   * @returns {string} HTML string with SVG star icons
   */
  function starsDisplay(rating) {
    var full = Math.floor(rating);
    var half = (rating - full) >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    var html = '';
    var filledIcon = (typeof YawmiaIcons !== 'undefined') ? YawmiaIcons.get('starFilled', { size: 16, 'class': 'star-icon star-filled' }) : '★';
    var emptyIcon = (typeof YawmiaIcons !== 'undefined') ? YawmiaIcons.get('star', { size: 16, 'class': 'star-icon star-empty' }) : '☆';
    for (var i = 0; i < full; i++) html += filledIcon;
    for (var j = 0; j < half; j++) html += emptyIcon;
    for (var k = 0; k < empty; k++) html += emptyIcon;
    return html;
  }

  /**
   * Unicode text-based star rating (for non-SVG contexts like admin tables).
   * @param {number} rating — 0 to 5
   * @returns {string} Unicode star string
   */
  function starsText(rating) {
    var full = Math.floor(rating);
    var half = (rating - full) >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    var str = '';
    for (var i = 0; i < full; i++) str += '★';
    if (half) str += '☆';
    for (var j = 0; j < empty; j++) str += '☆';
    return str;
  }

  /**
   * Relative time in Arabic (e.g., "منذ 5 دقائق").
   * @param {string} isoDate — ISO date string
   * @returns {string}
   */
  function timeAgo(isoDate) {
    if (!isoDate) return '';
    var now = Date.now();
    var then = new Date(isoDate).getTime();
    var diffMs = now - then;
    if (diffMs < 0) return 'الآن';

    var seconds = Math.floor(diffMs / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);

    if (seconds < 60) return 'منذ لحظات';
    if (minutes < 60) return 'منذ ' + minutes + ' دقيقة';
    if (hours < 24) return 'منذ ' + hours + ' ساعة';
    if (days < 30) return 'منذ ' + days + ' يوم';
    return formatDate(isoDate);
  }

  /**
   * Format date in Arabic locale.
   * @param {string} isoDate
   * @returns {string}
   */
  function formatDate(isoDate) {
    if (!isoDate) return '';
    try {
      return new Date(isoDate).toLocaleDateString('ar-EG');
    } catch (e) {
      return isoDate;
    }
  }

  /**
   * Format date+time in Arabic locale.
   * @param {string} isoDate
   * @returns {string}
   */
  function formatDateTime(isoDate) {
    if (!isoDate) return '';
    try {
      return new Date(isoDate).toLocaleString('ar-EG');
    } catch (e) {
      return isoDate;
    }
  }

  /**
   * Human-readable status label in Arabic.
   * Covers: job, application, payment, attendance, verification, user statuses.
   * @param {string} status
   * @returns {string}
   */
  function statusLabel(status) {
    var labels = {
      // Job statuses
      open: 'متاحة',
      filled: 'مكتملة العدد',
      in_progress: 'جاري التنفيذ',
      completed: 'مكتملة',
      expired: 'منتهية',
      cancelled: 'ملغية',
      // Application statuses
      pending: 'في الانتظار',
      accepted: 'مقبول',
      rejected: 'مرفوض',
      withdrawn: 'تم السحب',
      // Payment statuses
      employer_confirmed: 'تم تأكيد الدفع',
      disputed: 'نزاع',
      // Attendance statuses
      checked_in: 'حاضر',
      checked_out: 'انصرف',
      confirmed: 'مؤكد',
      no_show: 'غائب',
      // Verification statuses
      verified: 'محقق',
      unverified: 'غير محقق',
      // User statuses
      active: 'نشط',
      banned: 'محظور',
      deleted: 'محذوف',
    };
    return labels[status] || status || '';
  }

  /**
   * Role label in Arabic.
   * @param {string} role
   * @returns {string}
   */
  function roleLabel(role) {
    if (role === 'worker') return 'عامل';
    if (role === 'employer') return 'صاحب عمل';
    if (role === 'admin') return 'أدمن';
    return role || '';
  }

  /**
   * Generate skeleton loading HTML for job cards.
   * @param {number} count — number of skeleton cards to generate
   * @returns {string} HTML string
   */
  function skeletonJobCards(count) {
    var html = '';
    for (var i = 0; i < count; i++) {
      html +=
        '<div class="skeleton-card" style="margin-block-end: 1rem; padding: 1.25rem;">' +
          '<div style="display:flex;justify-content:space-between;margin-block-end:0.75rem;">' +
            '<div class="skeleton skeleton-text--lg" style="width: 50%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 20%;"></div>' +
          '</div>' +
          '<div style="display:flex;gap:0.75rem;margin-block-end:0.75rem;">' +
            '<div class="skeleton skeleton-text--sm" style="width: 25%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 20%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 15%;"></div>' +
          '</div>' +
          '<div class="skeleton skeleton-text" style="width: 90%;"></div>' +
          '<div class="skeleton skeleton-text" style="width: 70%;"></div>' +
          '<div style="display:flex;justify-content:space-between;margin-block-start:0.75rem;">' +
            '<div class="skeleton skeleton-text--sm" style="width: 30%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 20%;"></div>' +
          '</div>' +
        '</div>';
    }
    return html;
  }

  /**
   * Trap focus within a container element.
   * Handles Tab cycling and Escape key to close.
   * @param {HTMLElement} container — the element to trap focus within
   * @param {Function} [onEscape] — callback when Escape is pressed
   * @returns {Function} cleanup — call to release the trap
   */
  function trapFocus(container, onEscape) {
    if (!container) return function () {};

    var focusableSelector = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

    function getFocusable() {
      return container.querySelectorAll(focusableSelector);
    }

    function handleKeydown(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (typeof onEscape === 'function') {
          onEscape();
        }
        return;
      }

      if (e.key !== 'Tab' && e.keyCode !== 9) return;

      var focusable = getFocusable();
      if (focusable.length === 0) return;

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener('keydown', handleKeydown);

    // Focus first focusable element
    var initial = getFocusable();
    if (initial.length > 0) {
      initial[0].focus();
    }

    // Return cleanup function
    return function () {
      container.removeEventListener('keydown', handleKeydown);
    };
  }

  return {
    escapeHtml: escapeHtml,
    starsDisplay: starsDisplay,
    starsText: starsText,
    timeAgo: timeAgo,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    statusLabel: statusLabel,
    roleLabel: roleLabel,
    skeletonJobCards: skeletonJobCards,
    trapFocus: trapFocus,
  };
})();
```

---

## `frontend/dashboard.html`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>يوميّة — لوحة التحكم</title>
  <meta name="description" content="لوحة التحكم الرئيسية لمنصة يوميّة — تصفح فرص العمل اليومية أو انشر فرصة جديدة.">
  <meta property="og:title" content="يوميّة — لوحة التحكم">
  <meta property="og:description" content="لوحة التحكم الرئيسية لمنصة يوميّة — تصفح فرص العمل اليومية أو انشر فرصة جديدة.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://yowmia.com/dashboard.html">
  <meta property="og:image" content="https://yowmia.com/assets/img/icon-512.png">
  <meta property="og:locale" content="ar_EG">
  <link rel="canonical" href="https://yowmia.com/dashboard.html">
  <link rel="stylesheet" href="./assets/css/tokens.css">
  <link rel="stylesheet" href="./assets/css/style.css">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="/assets/img/icon-192.png">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
</head>
<body>
  <a href="#main-content" class="skip-link">تخطي إلى المحتوى الرئيسي</a>
  <div class="app" id="app">
    <!-- Header -->
    <header class="header">
      <nav aria-label="التنقل الرئيسي">
        <div class="container header__inner">
          <div class="header__right">
            <h1 class="header__brand"><img src="/assets/img/logo.png" alt="يوميّة" class="header__logo" width="32" height="32" onerror="this.style.display='none'"> يوميّة</h1>
          </div>
          <div class="header__left">
            <button class="notification-bell" id="notificationBell" title="الإشعارات" aria-label="الإشعارات">
              <span data-icon="bell" data-icon-size="20"></span>
              <span class="notification-bell__badge hidden" id="notificationCount" aria-live="polite">0</span>
            </button>
            <span class="header__user" id="headerUserName"></span>
            <span class="badge" id="headerUserRole"></span>
            <a href="/profile.html" class="btn btn--ghost btn--sm">ملفي</a>
            <button class="btn btn--ghost btn--sm" id="btnLogout">خروج</button>
          </div>
        </div>
      </nav>
    </header>

    <!-- Main Content -->
    <main class="main" id="main-content">
      <div class="container">

        <!-- Welcome Card -->
        <section class="card welcome-card" id="welcomeCard">
          <h2 id="welcomeTitle">أهلاً بيك!</h2>
          <p id="welcomeDesc"></p>
        </section>

        <!-- Employer Section: Create Job -->
        <section class="card hidden" id="createJobSection">
          <h2 class="card__title">نشر فرصة عمل جديدة</h2>

          <div class="form-group">
            <label class="form-label" for="jobTitle">عنوان الفرصة</label>
            <input type="text" id="jobTitle" class="form-input" placeholder="مثال: جمع محصول قمح" aria-required="true" aria-describedby="createJobError">
          </div>

          <div class="form-group">
            <label class="form-label" for="jobCategory">التخصص</label>
            <select id="jobCategory" class="form-input">
              <option value="">اختار التخصص</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="jobGovernorate">المحافظة</label>
            <select id="jobGovernorate" class="form-input">
              <option value="">اختار المحافظة</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="jobWorkers">عدد العمال</label>
              <input type="number" id="jobWorkers" class="form-input" min="1" max="100" placeholder="20">
            </div>
            <div class="form-group">
              <label class="form-label" for="jobWage">اليومية (جنيه)</label>
              <input type="number" id="jobWage" class="form-input" min="150" max="1000" placeholder="250">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="jobStartDate">تاريخ البدء</label>
              <input type="date" id="jobStartDate" class="form-input" dir="ltr">
            </div>
            <div class="form-group">
              <label class="form-label" for="jobDuration">المدة (أيام)</label>
              <input type="number" id="jobDuration" class="form-input" min="1" max="30" placeholder="3">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="jobDescription">وصف الفرصة</label>
            <textarea id="jobDescription" class="form-input form-textarea" rows="3" maxlength="500" placeholder="تفاصيل عن الشغل..."></textarea>
          </div>

          <!-- Cost Preview -->
          <div class="cost-preview hidden" id="costPreview">
            <div class="cost-row">
              <span>إجمالي التكلفة:</span>
              <span id="costTotal">0 جنيه</span>
            </div>
            <div class="cost-row cost-row--fee">
              <span>عمولة المنصة (15%):</span>
              <span id="costFee">0 جنيه</span>
            </div>
          </div>

          <button class="btn btn--primary btn--full" id="btnCreateJob">نشر الفرصة</button>
          <div class="message" id="createJobError"></div>
        </section>

        <!-- Job Listings -->
        <section class="card" id="jobsSection">
          <div class="section-header">
            <h2 class="card__title">الفرص المتاحة</h2>
            <div class="filters">
              <select id="filterGov" class="form-input form-input--sm">
                <option value="">كل المحافظات</option>
              </select>
              <select id="filterCat" class="form-input form-input--sm">
                <option value="">كل التخصصات</option>
              </select>
              <button class="btn btn--sm btn--primary" id="btnFilterJobs">بحث</button>
            </div>
          </div>
          <div id="jobsList" class="jobs-list">
            <p class="empty-state">جاري تحميل الفرص...</p>
          </div>
          <div id="jobsLiveRegion" class="sr-only" aria-live="polite" aria-atomic="true"></div>
        </section>

        <!-- Pagination -->
        <div class="pagination hidden" id="paginationControls">
          <button class="btn btn--ghost btn--sm" id="btnPrevPage" disabled>السابق</button>
          <span class="pagination__info" id="paginationInfo"></span>
          <button class="btn btn--ghost btn--sm" id="btnNextPage">التالي</button>
        </div>

      </div>
    </main>

    <!-- Notification Overlay -->
    <div class="notification-overlay" id="notificationOverlay"></div>

    <!-- Notifications Drawer -->
    <div class="notification-panel" id="notificationPanel" role="dialog" aria-modal="true" aria-label="الإشعارات">
      <div class="notification-panel__header">
        <h3>الإشعارات</h3>
        <div class="notification-panel__header-actions">
          <button class="btn btn--ghost btn--sm" id="btnMarkAllRead">تعليم الكل كمقروء</button>
          <button class="notification-panel__close" id="btnCloseNotifPanel" aria-label="إغلاق"><span data-icon="close" data-icon-size="20"></span></button>
        </div>
      </div>
      <div class="notification-panel__list" id="notificationList">
        <div class="notification-panel__empty">
          <span class="notification-panel__empty-icon">🔔</span>
          <p>لا توجد إشعارات</p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>يوميّة &copy; 2026 — جميع الحقوق محفوظة</p>
      </div>
    </footer>

    <!-- Bottom Navigation (Mobile) -->
    <nav class="bottom-nav" aria-label="التنقل السريع">
      <a href="/dashboard.html" class="bottom-nav__item bottom-nav__item--active" aria-current="page">
        <span data-icon="home" data-icon-size="20"></span>
        <span class="bottom-nav__label">الرئيسية</span>
      </a>
      <a href="/dashboard.html#jobsSection" class="bottom-nav__item">
        <span data-icon="search" data-icon-size="20"></span>
        <span class="bottom-nav__label">بحث</span>
      </a>
      <button class="bottom-nav__item" id="bottomNavNotif" aria-label="الإشعارات">
        <span data-icon="bell" data-icon-size="20"></span>
        <span class="bottom-nav__label">إشعارات</span>
        <span class="bottom-nav__badge hidden" id="bottomNavBadge">0</span>
      </button>
      <a href="/profile.html" class="bottom-nav__item">
        <span data-icon="user" data-icon-size="20"></span>
        <span class="bottom-nav__label">ملفي</span>
      </a>
    </nav>
  </div>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "يوميّة",
    "alternateName": "Yowmia",
    "url": "https://yowmia.com",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": "منصة توظيف العمالة اليومية في مصر",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EGP"
    }
  }
  </script>
  <script src="./assets/js/app.js"></script>
  <script src="./assets/js/icons.js"></script>
  <script src="./assets/js/utils.js"></script>
  <script src="./assets/js/toast.js"></script>
  <script src="./assets/js/modal.js"></script>
  <script src="./assets/js/jobs.js"></script>
</body>
</html>
```

---

## `frontend/index.html`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>يوميّة — شغلك قريب منّك</title>
  <meta name="description" content="منصة توظيف العمالة اليومية في مصر. اعرض فرص شغل أو اشتغل بالقرب منك.">
  <meta property="og:title" content="يوميّة — شغلك قريب منّك">
  <meta property="og:description" content="منصة توظيف العمالة اليومية في مصر. اعرض فرص شغل أو اشتغل بالقرب منك.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://yowmia.com/">
  <meta property="og:image" content="https://yowmia.com/assets/img/icon-512.png">
  <meta property="og:locale" content="ar_EG">
  <link rel="canonical" href="https://yowmia.com/">
  <link rel="stylesheet" href="./assets/css/tokens.css">
  <link rel="stylesheet" href="./assets/css/style.css">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="/assets/img/icon-192.png">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
</head>
<body>
  <a href="#main-content" class="skip-link">تخطي إلى المحتوى الرئيسي</a>
  <div class="app" id="app">
    <!-- Header -->
    <header class="header">
      <nav aria-label="التنقل الرئيسي">
        <div class="container header__inner">
          <h1 class="header__brand"><img src="/assets/img/logo.png" alt="يوميّة" class="header__logo" width="32" height="32" onerror="this.style.display='none'"> يوميّة</h1>
          <p class="header__tagline">شغلك قريب منّك</p>
        </div>
      </nav>
    </header>

    <!-- Main Content -->
    <main class="main" id="main-content">
      <div class="container">

        <!-- Auth Section -->
        <section class="auth-section" id="authSection">
          <!-- Step 1: Phone Input -->
          <div class="card auth-card" id="stepPhone">
            <h2 class="card__title">تسجيل الدخول</h2>
            <p class="card__desc">أدخل رقم موبايلك للبدء</p>

            <div class="form-group">
              <label class="form-label" for="phoneInput">رقم الموبايل</label>
              <input
                type="tel"
                id="phoneInput"
                class="form-input"
                placeholder="01XXXXXXXXX"
                maxlength="11"
                autocomplete="tel"
                dir="ltr"
                inputmode="numeric"
                aria-required="true"
                aria-describedby="phoneError"
              >
              <span class="form-hint">مثال: 01012345678</span>
            </div>

            <div class="form-group">
              <label class="form-label">أنا:</label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" name="role" value="worker" checked>
                  <span>عامل — بدور على شغل</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="role" value="employer">
                  <span>صاحب عمل — محتاج عمال</span>
                </label>
              </div>
            </div>

            <button class="btn btn--primary btn--full" id="btnSendOtp">
              إرسال كود التحقق
            </button>

            <div class="message" id="phoneError"></div>
          </div>

          <!-- Step 2: OTP Verification -->
          <div class="card auth-card hidden" id="stepOtp">
            <h2 class="card__title">أدخل كود التحقق</h2>
            <p class="card__desc">تم إرسال كود مكوّن من 4 أرقام على رقم <span id="otpPhone"></span></p>

            <div class="form-group">
              <label class="form-label" for="otpInput">كود التحقق</label>
              <input
                type="text"
                id="otpInput"
                class="form-input form-input--otp"
                placeholder="0000"
                maxlength="4"
                autocomplete="one-time-code"
                dir="ltr"
                inputmode="numeric"
                aria-required="true"
                aria-describedby="otpError"
              >
            </div>

            <button class="btn btn--primary btn--full" id="btnVerifyOtp">
              تأكيد الكود
            </button>

            <button class="btn btn--ghost btn--full" id="btnResendOtp">
              إعادة إرسال الكود
            </button>

            <div class="message" id="otpError"></div>
          </div>

          <!-- Step 3: Profile Completion -->
          <div class="card auth-card hidden" id="stepProfile">
            <h2 class="card__title">أكمل بياناتك</h2>
            <p class="card__desc">محتاجين بيانات بسيطة عشان نوصّلك بالفرص المناسبة</p>

            <div class="form-group">
              <label class="form-label" for="nameInput">الاسم</label>
              <input
                type="text"
                id="nameInput"
                class="form-input"
                placeholder="اسمك بالكامل"
                aria-required="true"
                aria-describedby="profileError"
              >
            </div>

            <div class="form-group">
              <label class="form-label" for="govSelect">المحافظة</label>
              <select id="govSelect" class="form-input">
                <option value="">اختار المحافظة</option>
              </select>
            </div>

            <div class="form-group hidden" id="categoriesGroup">
              <label class="form-label">التخصصات (للعمّال)</label>
              <div class="checkbox-grid" id="categoriesGrid"></div>
            </div>

            <button class="btn btn--primary btn--full" id="btnSaveProfile">
              حفظ البيانات
            </button>

            <div class="message" id="profileError"></div>
          </div>
        </section>

      </div>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>يوميّة &copy; 2026 — جميع الحقوق محفوظة</p>
      </div>
    </footer>
  </div>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "يوميّة",
    "alternateName": "Yowmia",
    "url": "https://yowmia.com",
    "logo": "https://yowmia.com/assets/img/icon-512.png",
    "description": "منصة توظيف العمالة اليومية في مصر",
    "foundingDate": "2026",
    "areaServed": {
      "@type": "Country",
      "name": "مصر"
    }
  }
  </script>
  <script src="./assets/js/app.js"></script>
  <script src="./assets/js/icons.js"></script>
  <script src="./assets/js/utils.js"></script>
  <script src="./assets/js/toast.js"></script>
  <script src="./assets/js/auth.js"></script>
</body>
</html>
```

---

## `frontend/manifest.json`

```json
{
  "name": "يوميّة — شغلك قريب منّك",
  "short_name": "يوميّة",
  "description": "منصة توظيف العمالة اليومية في مصر",
  "start_url": "/dashboard.html",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#2563eb",
  "dir": "rtl",
  "lang": "ar",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/assets/img/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/assets/img/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

---

## `frontend/offline.html`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>يوميّة — غير متصل</title>
  <meta name="description" content="أنت غير متصل بالإنترنت حالياً.">
  <meta name="theme-color" content="#2563eb">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif;background:#0f1117;color:#e4e6f0;min-height:100vh;display:flex;align-items:center;justify-content:center;direction:rtl;text-align:center;padding:2rem}
    .container{max-width:480px}
    .icon{font-size:4rem;margin-block-end:1rem}
    .title{font-size:1.5rem;margin-block-end:0.75rem;font-weight:600}
    .desc{color:#8b8fa3;margin-block-end:2rem;font-size:0.95rem;line-height:1.7}
    .btn{display:inline-block;padding:0.75rem 2rem;background:#2563eb;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:1rem;cursor:pointer;font-family:inherit;transition:background 0.2s}
    .btn:hover{background:#1d4fd8}
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📡</div>
    <h1 class="title">أنت غير متصل بالإنترنت</h1>
    <p class="desc">تأكد من اتصالك بالإنترنت وحاول مرة تانية.<br>بعض الصفحات المحفوظة ممكن تكون متاحة.</p>
    <button class="btn" onclick="location.reload()">إعادة المحاولة</button>
  </div>
</body>
</html>
```

---

## `frontend/profile.html`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>يوميّة — ملفي الشخصي</title>
  <meta name="description" content="ملفك الشخصي على منصة يوميّة — تعديل البيانات والتقييمات وطلبات التوظيف.">
  <meta property="og:title" content="يوميّة — ملفي الشخصي">
  <meta property="og:description" content="ملفك الشخصي على منصة يوميّة — تعديل البيانات والتقييمات وطلبات التوظيف.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://yowmia.com/profile.html">
  <meta property="og:image" content="https://yowmia.com/assets/img/icon-512.png">
  <meta property="og:locale" content="ar_EG">
  <link rel="canonical" href="https://yowmia.com/profile.html">
  <link rel="stylesheet" href="./assets/css/tokens.css">
  <link rel="stylesheet" href="./assets/css/style.css">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="/assets/img/icon-192.png">
</head>
<body>
  <a href="#main-content" class="skip-link">تخطي إلى المحتوى الرئيسي</a>
  <div class="app" id="app">
    <!-- Header -->
    <header class="header">
      <nav aria-label="التنقل الرئيسي">
        <div class="container header__inner">
          <div class="header__right">
            <a href="/dashboard.html" class="header__brand-link">
              <h1 class="header__brand"><img src="/assets/img/logo.png" alt="يوميّة" class="header__logo" width="32" height="32" onerror="this.style.display='none'"> يوميّة</h1>
            </a>
          </div>
          <div class="header__left">
            <span class="header__user" id="headerUserName"></span>
            <span class="badge" id="headerUserRole"></span>
            <a href="/dashboard.html" class="btn btn--ghost btn--sm">الرئيسية</a>
            <button class="btn btn--ghost btn--sm" id="btnLogout">خروج</button>
          </div>
        </div>
      </nav>
    </header>

    <!-- Main Content -->
    <main class="main" id="main-content">
      <div class="container">

        <!-- Profile Card -->
        <section class="card" id="profileCard">
          <div class="profile-header">
            <div class="profile-avatar" id="profileAvatar"></div>
            <div class="profile-details">
              <div class="profile-name" id="profileName"></div>
              <div><span class="profile-phone" id="profilePhone"></span></div>
              <div class="profile-gov" id="profileGov"></div>
            </div>
            <div class="profile-rating-summary" id="profileRatingSummary"></div>
          </div>
          <div class="profile-categories hidden" id="profileCategories"></div>
        </section>

        <!-- Edit Profile -->
        <section class="card" id="editProfileSection">
          <h2 class="card__title">تعديل البيانات</h2>

          <div class="form-group">
            <label class="form-label" for="editName">الاسم</label>
            <input type="text" id="editName" class="form-input" placeholder="اسمك بالكامل" aria-required="true" aria-describedby="editProfileMsg">
          </div>

          <div class="form-group">
            <label class="form-label" for="editGov">المحافظة</label>
            <select id="editGov" class="form-input">
              <option value="">اختار المحافظة</option>
            </select>
          </div>

          <div class="form-group hidden" id="editCategoriesGroup">
            <label class="form-label">التخصصات</label>
            <div class="checkbox-grid" id="editCategoriesGrid"></div>
          </div>

          <button class="btn btn--primary" id="btnUpdateProfile">حفظ التعديلات</button>
          <div class="message" id="editProfileMsg"></div>
        </section>

        <!-- Notification Preferences -->
        <div id="notification-prefs"></div>

        <!-- Verification Section -->
        <div id="verification-section"></div>

        <!-- Attendance History (worker only) -->
        <section class="card hidden" id="attendanceHistorySection">
          <h2 class="card__title">📋 سجل الحضور</h2>
          <div id="attendanceSummaryArea"></div>
          <div id="attendanceHistoryList" class="jobs-list">
            <p class="empty-state">جاري التحميل...</p>
          </div>
        </section>

        <!-- My Applications (worker only) -->
        <section class="card hidden" id="myApplicationsSection">
          <h2 class="card__title">طلباتي</h2>
          <div id="myApplicationsList" class="jobs-list">
            <p class="empty-state">جاري التحميل...</p>
          </div>
        </section>

        <!-- My Jobs (employer only) -->
        <section class="card hidden" id="myJobsSection">
          <h2 class="card__title">فرصي المنشورة</h2>
          <div id="myJobsList" class="jobs-list">
            <p class="empty-state">جاري التحميل...</p>
          </div>
        </section>

        <!-- Ratings Received -->
        <section class="card" id="myRatingsSection">
          <h2 class="card__title">التقييمات</h2>

          <!-- Rating Summary + Distribution -->
          <div id="ratingSummaryArea"></div>

          <hr class="section-divider">

          <!-- Individual Ratings -->
          <div id="ratingsListArea">
            <p class="empty-state">جاري التحميل...</p>
          </div>
        </section>

      </div>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>يوميّة &copy; 2026 — جميع الحقوق محفوظة</p>
      </div>
    </footer>

    <!-- Bottom Navigation (Mobile) -->
    <nav class="bottom-nav" aria-label="التنقل السريع">
      <a href="/dashboard.html" class="bottom-nav__item">
        <span data-icon="home" data-icon-size="20"></span>
        <span class="bottom-nav__label">الرئيسية</span>
      </a>
      <a href="/dashboard.html#jobsSection" class="bottom-nav__item">
        <span data-icon="search" data-icon-size="20"></span>
        <span class="bottom-nav__label">بحث</span>
      </a>
      <a href="/dashboard.html" class="bottom-nav__item">
        <span data-icon="bell" data-icon-size="20"></span>
        <span class="bottom-nav__label">إشعارات</span>
      </a>
      <a href="/profile.html" class="bottom-nav__item bottom-nav__item--active" aria-current="page">
        <span data-icon="user" data-icon-size="20"></span>
        <span class="bottom-nav__label">ملفي</span>
      </a>
    </nav>
  </div>

  <script src="./assets/js/app.js"></script>
  <script src="./assets/js/icons.js"></script>
  <script src="./assets/js/utils.js"></script>
  <script src="./assets/js/toast.js"></script>
  <script src="./assets/js/modal.js"></script>
  <script src="./assets/js/profile.js"></script>
</body>
</html>
```

---

## `frontend/robots.txt`

```text
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin.html
Sitemap: https://yowmia.com/sitemap.xml
```

---

## `frontend/sitemap.xml`

```text
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yowmia.com/</loc>
    <lastmod>2026-04-20</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://yowmia.com/dashboard.html</loc>
    <lastmod>2026-04-20</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://yowmia.com/profile.html</loc>
    <lastmod>2026-04-20</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

---

## `frontend/sw.js`

```javascript
// ═══════════════════════════════════════════════════════════════
// sw.js — يوميّة Service Worker (PWA)
// Strategy: Cache-first for static assets, Network-first for API
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'yawmia-v0.22.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/profile.html',
  '/admin.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/js/auth.js',
  '/assets/js/jobs.js',
  '/assets/js/profile.js',
  '/assets/js/admin.js',
  '/user.html',
  '/assets/js/user.js',
  '/assets/js/icons.js',
  '/assets/js/utils.js',
  '/assets/js/toast.js',
  '/assets/js/modal.js',
  '/assets/css/tokens.css',
  '/assets/fonts/Cairo-Regular.woff2',
  '/assets/fonts/Cairo-SemiBold.woff2',
  '/assets/fonts/Cairo-Bold.woff2',
  '/robots.txt',
  '/sitemap.xml',
  '/404.html',
  '/offline.html',
];

// ── Install: pre-cache static assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: strategy per request type ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network-first (never cache API responses)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(
          JSON.stringify({ error: 'أنت offline حالياً', code: 'OFFLINE' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // Static assets: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          // Cache successful GET responses for future use
          if (networkResponse.ok && event.request.method === 'GET') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Offline fallback for HTML pages
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/offline.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// ── Push: display notification ──
self.addEventListener('push', (event) => {
  let data = { title: 'يوميّة', body: 'إشعار جديد', icon: '/assets/img/icon-192.png', url: '/dashboard.html' };

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.title) data.title = payload.title;
      if (payload.body) data.body = payload.body;
      if (payload.icon) data.icon = payload.icon;
      if (payload.url) data.url = payload.url;
    } catch (_) {
      // Invalid JSON or no payload — use defaults
      try {
        const text = event.data.text();
        if (text) data.body = text;
      } catch (_2) { /* ignore */ }
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: '/assets/img/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url },
    })
  );
});

// ── Notification Click: navigate to URL ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

---

## `frontend/user.html`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>يوميّة — بروفايل</title>
  <meta name="description" content="بروفايل المستخدم على منصة يوميّة — التقييمات ونقاط الثقة.">
  <meta property="og:title" content="يوميّة — بروفايل المستخدم">
  <meta property="og:description" content="بروفايل المستخدم على منصة يوميّة — التقييمات ونقاط الثقة.">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="https://yowmia.com/user.html">
  <meta property="og:image" content="https://yowmia.com/assets/img/icon-512.png">
  <meta property="og:locale" content="ar_EG">
  <link rel="canonical" href="https://yowmia.com/user.html">
  <link rel="stylesheet" href="./assets/css/tokens.css">
  <link rel="stylesheet" href="./assets/css/style.css">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="/assets/img/icon-192.png">
</head>
<body>
  <a href="#main-content" class="skip-link">تخطي إلى المحتوى الرئيسي</a>
  <div class="app" id="app">
    <!-- Header -->
    <header class="header">
      <nav aria-label="التنقل الرئيسي">
        <div class="container header__inner">
          <div class="header__right">
            <a href="/" class="header__brand-link">
              <h1 class="header__brand"><img src="/assets/img/logo.png" alt="يوميّة" class="header__logo" width="32" height="32" onerror="this.style.display='none'"> يوميّة</h1>
            </a>
          </div>
          <div class="header__left">
            <a href="/" class="btn btn--ghost btn--sm">الرئيسية</a>
          </div>
        </div>
      </nav>
    </header>

    <!-- Main Content -->
    <main class="main" id="main-content">
      <div class="container">

        <!-- Loading State -->
        <div id="profileLoading">
          <p class="empty-state">جاري تحميل البروفايل...</p>
        </div>

        <!-- Error State -->
        <div id="profileError" class="hidden">
          <p class="empty-state">المستخدم غير موجود</p>
        </div>

        <!-- Profile Content -->
        <div id="profileContent" class="hidden">

          <!-- Profile Card -->
          <section class="card">
            <div class="pub-profile-header">
              <div class="profile-avatar" id="pubAvatar"></div>
              <div class="profile-details">
                <div class="profile-name" id="pubName"></div>
                <div id="pubRoleBadge"></div>
                <div class="profile-gov" id="pubGov"></div>
                <div id="pubVerificationBadge" style="margin-block-start: 0.5rem;"></div>
              </div>
              <div class="profile-rating-summary" id="pubRatingSummary"></div>
            </div>
            <div class="profile-categories hidden" id="pubCategories"></div>
          </section>

          <!-- Trust Score -->
          <section class="card" id="pubTrustSection" class="hidden">
            <h2 class="card__title">نقاط الثقة</h2>
            <div id="pubTrustScore"></div>
          </section>

          <!-- Ratings -->
          <section class="card">
            <h2 class="card__title">التقييمات</h2>
            <div id="pubRatingSummaryArea"></div>
            <hr class="section-divider">
            <div id="pubRatingsListArea">
              <p class="empty-state">جاري التحميل...</p>
            </div>
          </section>

          <!-- Member Since -->
          <div style="text-align: center; padding: 1rem; color: var(--color-text-muted); font-size: 0.85rem;">
            <span id="pubMemberSince"></span>
          </div>

        </div>

      </div>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>يوميّة &copy; 2026 — جميع الحقوق محفوظة</p>
      </div>
    </footer>
  </div>

  <script src="./assets/js/app.js"></script>
  <script src="./assets/js/icons.js"></script>
  <script src="./assets/js/utils.js"></script>
  <script src="./assets/js/toast.js"></script>
  <script src="./assets/js/user.js"></script>
</body>
</html>
```

---

## `scripts/backup.js`

```javascript
#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/backup.js — يوميّة: Data Backup Utility
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/backup.js [target-dir]
// Creates a timestamped copy of the data/ directory
// ═══════════════════════════════════════════════════════════════

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env.YAWMIA_DATA_PATH || './data';
const BACKUP_BASE = process.argv[2] || './backups';

async function backup() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = join(BACKUP_BASE, `yawmia-backup-${timestamp}`);

  console.log(`📦 يوميّة Backup`);
  console.log(`   Source: ${DATA_DIR}`);
  console.log(`   Target: ${backupDir}`);

  // Check source exists
  try {
    await stat(DATA_DIR);
  } catch {
    console.error(`❌ Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  // Create backup
  await mkdir(backupDir, { recursive: true });
  await cp(DATA_DIR, backupDir, { recursive: true });

  // Count files
  let fileCount = 0;
  async function countFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await countFiles(join(dir, entry.name));
      } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
        fileCount++;
      }
    }
  }
  await countFiles(backupDir);

  console.log(`✅ Backup complete: ${fileCount} JSON files`);
  console.log(`   Location: ${backupDir}`);
}

backup().catch(err => {
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
});
```

---

## `scripts/benchmark.js`

```javascript
#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/benchmark.js — يوميّة: Performance Benchmark
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/benchmark.js
// Measures response times for key API endpoints
// Server must be running on PORT 3002 (or set PORT env)
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3002;
const BASE = `http://localhost:${PORT}`;

async function measure(label, fn, iterations = 10) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const min = times[0];
  const max = times[times.length - 1];
  console.log(`  ${label}: avg=${avg.toFixed(1)}ms  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  min=${min.toFixed(1)}ms  max=${max.toFixed(1)}ms`);
}

async function main() {
  console.log(`\n📊 يوميّة Performance Benchmark`);
  console.log(`   Target: ${BASE}\n`);

  // Check server is running
  try {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json();
    console.log(`   Server: ${data.status} (v${data.version})\n`);
  } catch {
    console.error(`❌ Server not reachable at ${BASE}`);
    console.error(`   Start server first: npm start`);
    process.exit(1);
  }

  console.log('── Health Endpoint ──');
  await measure('GET /api/health', () => fetch(`${BASE}/api/health`));

  console.log('── Config Endpoint ──');
  await measure('GET /api/config', () => fetch(`${BASE}/api/config`));

  console.log('── Job Listing ──');
  await measure('GET /api/jobs', () => fetch(`${BASE}/api/jobs`));
  await measure('GET /api/jobs?governorate=cairo', () => fetch(`${BASE}/api/jobs?governorate=cairo`));

  console.log('── Concurrent Requests ──');
  await measure('10 parallel /api/health', async () => {
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/api/health`)));
  }, 5);

  await measure('10 parallel /api/jobs', async () => {
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/api/jobs`)));
  }, 5);

  console.log('\n✅ Benchmark complete\n');
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
```

---

## `scripts/bundle-for-review.js`

```javascript
#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/bundle-for-review.js
// يجمع كل ملفات المشروع في 4 ملفات للمراجعة
// Usage: node scripts/bundle-for-review.js
// Output: CODEBASE_PART1.md ... CODEBASE_PART4.md
// ═══════════════════════════════════════════════════════════════

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const IGNORE = new Set([
  'node_modules', '.git', 'data', 'backups', 'test-backups',
  '.env', 'package-lock.json', '.DS_Store', 'Thumbs.db',
  'cloudflared.deb', 'tests',
]);

const IGNORE_FILES = new Set([
  'CODEBASE_PART1.md', 'CODEBASE_PART2.md',
  'CODEBASE_PART3.md', 'CODEBASE_PART4.md',
]);

const IGNORE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.svg', '.log', '.tmp', '.deb',
]);

// ── التقسيم المنطقي ──
const PART_RULES = [
  {
    file: 'CODEBASE_PART1.md',
    title: 'Part 1: Config + Server Core + Router',
    match: (f) => [
      'config.js', 'package.json', 'server.js',
      '.env.example', '.gitignore',
      'server/router.js',
    ].includes(f),
  },
  {
    file: 'CODEBASE_PART2.md',
    title: 'Part 2: Backend Services (21 services + 2 adapters)',
    match: (f) => f.startsWith('server/services/'),
  },
  {
    file: 'CODEBASE_PART3.md',
    title: 'Part 3: Middleware (7) + Handlers (11)',
    match: (f) => f.startsWith('server/middleware/') || f.startsWith('server/handlers/'),
  },
  {
    file: 'CODEBASE_PART4.md',
    title: 'Part 4: Frontend + PWA + Scripts',
    match: (f) => f.startsWith('frontend/') || f.startsWith('scripts/'),
  },
];

function getLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  return { '.js': 'javascript', '.json': 'json', '.html': 'html', '.css': 'css', '.sh': 'bash' }[ext] || 'text';
}

async function collectFiles(dir, base = ROOT) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORE.has(entry.name) || IGNORE_FILES.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    const relPath = relative(base, fullPath);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, base));
    } else if (entry.isFile()) {
      if (IGNORE_EXT.has(extname(entry.name).toLowerCase())) continue;
      files.push(relPath);
    }
  }
  return files;
}

async function main() {
  console.log('📦 جاري تجميع ملفات المشروع...');

  const allFiles = (await collectFiles(ROOT)).sort();

  let version = '?';
  try {
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf-8'));
    version = pkg.version;
  } catch (_) {}

  let totalFiles = 0;

  for (const part of PART_RULES) {
    const partFiles = allFiles.filter(f => part.match(f));
    if (partFiles.length === 0) continue;

    const lines = [];
    lines.push(`# يوميّة (Yawmia) v${version} — ${part.title}`);
    lines.push(`> Auto-generated: ${new Date().toISOString()}`);
    lines.push(`> Files in this part: ${partFiles.length}`);
    lines.push('');

    // Table of contents
    lines.push('## Files');
    partFiles.forEach((f, i) => lines.push(`${i + 1}. \`${f}\``));
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const filePath of partFiles) {
      try {
        const content = await readFile(join(ROOT, filePath), 'utf-8');
        lines.push(`## \`${filePath}\``);
        lines.push('');
        lines.push(`\`\`\`${getLanguage(filePath)}`);
        lines.push(content.trimEnd());
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
      } catch (err) {
        lines.push(`## \`${filePath}\``);
        lines.push(`> ⚠️ Error: ${err.message}`);
        lines.push('---');
        lines.push('');
      }
    }

    const outputPath = join(ROOT, part.file);
    await writeFile(outputPath, lines.join('\n'), 'utf-8');
    const sizeKB = (Buffer.byteLength(lines.join('\n')) / 1024).toFixed(1);
    console.log(`  ✅ ${part.file} — ${partFiles.length} files (${sizeKB} KB)`);
    totalFiles += partFiles.length;
  }

  // Catch unmatched files
  const matched = new Set();
  for (const part of PART_RULES) {
    allFiles.filter(f => part.match(f)).forEach(f => matched.add(f));
  }
  const unmatched = allFiles.filter(f => !matched.has(f));
  if (unmatched.length > 0) {
    console.log(`  ⚠️ Unmatched files (not in any part): ${unmatched.join(', ')}`);
  }

  console.log(`\n📊 Total: ${totalFiles} files across ${PART_RULES.length} parts`);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
```

---

## `scripts/generate-vapid-keys.js`

```javascript
#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/generate-vapid-keys.js — VAPID Key Pair Generation
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/generate-vapid-keys.js
// Generates P-256 ECDH key pair for Web Push VAPID authentication
// Output: base64url-encoded keys ready for .env file
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

function base64urlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate P-256 (prime256v1) key pair
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const publicKey = ecdh.getPublicKey(); // 65 bytes uncompressed (0x04 || x || y)
const privateKey = ecdh.getPrivateKey(); // 32 bytes

const publicKeyB64 = base64urlEncode(publicKey);
const privateKeyB64 = base64urlEncode(privateKey);

console.log('\n🔑 VAPID Key Pair Generated (P-256)\n');
console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKeyB64}`);
console.log(`VAPID_PRIVATE_KEY=${privateKeyB64}`);
console.log('\n⚠️  Keep VAPID_PRIVATE_KEY secret! Never commit it to git.');
console.log('⚠️  If you regenerate keys, all existing push subscriptions will become invalid.\n');
```

---

## `scripts/repair-indexes.js`

```javascript
#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/repair-indexes.js — يوميّة: Index Repair Utility
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/repair-indexes.js [--dry-run]
// Rebuilds all secondary indexes from source record files
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const DATA_DIR = process.env.YAWMIA_DATA_PATH || './data';
const DRY_RUN = process.argv.includes('--dry-run');

async function readJSON(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function atomicWrite(filePath, data) {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmpPath, filePath);
}

async function listRecords(dir, prefix) {
  try {
    const files = await readdir(dir);
    const results = [];
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.json')) {
        const data = await readJSON(join(dir, f));
        if (data) results.push(data);
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function repair() {
  console.log(`🔧 يوميّة Index Repair${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`   Data: ${DATA_DIR}\n`);

  let totalFixed = 0;

  // 1. Phone Index (users/phone-index.json)
  console.log('1️⃣  Phone Index...');
  const users = await listRecords(join(DATA_DIR, 'users'), 'usr_');
  const phoneIndex = {};
  for (const user of users) {
    if (user.phone && user.id) phoneIndex[user.phone] = user.id;
  }
  const existingPhoneIndex = await readJSON(join(DATA_DIR, 'users/phone-index.json')) || {};
  const phoneIndexChanged = JSON.stringify(phoneIndex) !== JSON.stringify(existingPhoneIndex);
  if (phoneIndexChanged) {
    console.log(`   ⚠️  Phone index needs repair (${Object.keys(phoneIndex).length} entries)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'users/phone-index.json'), phoneIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Phone index OK (${Object.keys(phoneIndex).length} entries)`);
  }

  // 2. Jobs Index (jobs/index.json)
  console.log('2️⃣  Jobs Index...');
  const jobs = await listRecords(join(DATA_DIR, 'jobs'), 'job_');
  const jobsIndex = {};
  for (const job of jobs) {
    jobsIndex[job.id] = {
      id: job.id,
      employerId: job.employerId,
      category: job.category,
      governorate: job.governorate,
      status: job.status,
      createdAt: job.createdAt,
    };
  }
  const existingJobsIndex = await readJSON(join(DATA_DIR, 'jobs/index.json')) || {};
  const jobsIndexChanged = JSON.stringify(jobsIndex) !== JSON.stringify(existingJobsIndex);
  if (jobsIndexChanged) {
    console.log(`   ⚠️  Jobs index needs repair (${Object.keys(jobsIndex).length} entries)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'jobs/index.json'), jobsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Jobs index OK (${Object.keys(jobsIndex).length} entries)`);
  }

  // 3. Employer-Jobs Index (jobs/employer-index.json)
  console.log('3️⃣  Employer-Jobs Index...');
  const employerJobsIndex = {};
  for (const job of jobs) {
    if (!employerJobsIndex[job.employerId]) employerJobsIndex[job.employerId] = [];
    employerJobsIndex[job.employerId].push(job.id);
  }
  const existingEmpIndex = await readJSON(join(DATA_DIR, 'jobs/employer-index.json')) || {};
  const empIndexChanged = JSON.stringify(employerJobsIndex) !== JSON.stringify(existingEmpIndex);
  if (empIndexChanged) {
    console.log(`   ⚠️  Employer-Jobs index needs repair (${Object.keys(employerJobsIndex).length} employers)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'jobs/employer-index.json'), employerJobsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Employer-Jobs index OK (${Object.keys(employerJobsIndex).length} employers)`);
  }

  // 4. Worker-Apps Index (applications/worker-index.json)
  console.log('4️⃣  Worker-Apps Index...');
  const apps = await listRecords(join(DATA_DIR, 'applications'), 'app_');
  const workerAppsIndex = {};
  for (const app of apps) {
    if (!workerAppsIndex[app.workerId]) workerAppsIndex[app.workerId] = [];
    workerAppsIndex[app.workerId].push(app.id);
  }
  const existingWorkerIndex = await readJSON(join(DATA_DIR, 'applications/worker-index.json')) || {};
  const workerIndexChanged = JSON.stringify(workerAppsIndex) !== JSON.stringify(existingWorkerIndex);
  if (workerIndexChanged) {
    console.log(`   ⚠️  Worker-Apps index needs repair (${Object.keys(workerAppsIndex).length} workers)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'applications/worker-index.json'), workerAppsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Worker-Apps index OK (${Object.keys(workerAppsIndex).length} workers)`);
  }

  // 5. Job-Apps Index (applications/job-index.json)
  console.log('5️⃣  Job-Apps Index...');
  const jobAppsIndex = {};
  for (const app of apps) {
    if (!jobAppsIndex[app.jobId]) jobAppsIndex[app.jobId] = [];
    jobAppsIndex[app.jobId].push(app.id);
  }
  const existingJobAppsIndex = await readJSON(join(DATA_DIR, 'applications/job-index.json')) || {};
  const jobAppsIndexChanged = JSON.stringify(jobAppsIndex) !== JSON.stringify(existingJobAppsIndex);
  if (jobAppsIndexChanged) {
    console.log(`   ⚠️  Job-Apps index needs repair (${Object.keys(jobAppsIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'applications/job-index.json'), jobAppsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Job-Apps index OK (${Object.keys(jobAppsIndex).length} jobs)`);
  }

  // 6. User-Notifications Index (notifications/user-index.json)
  console.log('6️⃣  User-Notifications Index...');
  const notifs = await listRecords(join(DATA_DIR, 'notifications'), 'ntf_');
  const userNtfIndex = {};
  for (const ntf of notifs) {
    if (!userNtfIndex[ntf.userId]) userNtfIndex[ntf.userId] = [];
    userNtfIndex[ntf.userId].push(ntf.id);
  }
  const existingNtfIndex = await readJSON(join(DATA_DIR, 'notifications/user-index.json')) || {};
  const ntfIndexChanged = JSON.stringify(userNtfIndex) !== JSON.stringify(existingNtfIndex);
  if (ntfIndexChanged) {
    console.log(`   ⚠️  User-Notifications index needs repair (${Object.keys(userNtfIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'notifications/user-index.json'), userNtfIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ User-Notifications index OK (${Object.keys(userNtfIndex).length} users)`);
  }

  // 7. Job-Payments Index (payments/job-index.json)
  console.log('7️⃣  Job-Payments Index...');
  const payments = await listRecords(join(DATA_DIR, 'payments'), 'pay_');
  const jobPaymentsIndex = {};
  for (const pay of payments) {
    if (!jobPaymentsIndex[pay.jobId]) jobPaymentsIndex[pay.jobId] = [];
    jobPaymentsIndex[pay.jobId].push(pay.id);
  }
  const existingPaymentsIndex = await readJSON(join(DATA_DIR, 'payments/job-index.json')) || {};
  const paymentsIndexChanged = JSON.stringify(jobPaymentsIndex) !== JSON.stringify(existingPaymentsIndex);
  if (paymentsIndexChanged) {
    console.log(`   ⚠️  Job-Payments index needs repair (${Object.keys(jobPaymentsIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'payments/job-index.json'), jobPaymentsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Job-Payments index OK (${Object.keys(jobPaymentsIndex).length} jobs)`);
  }

  // 8. Target-Reports Index (reports/target-index.json)
  console.log('8️⃣  Target-Reports Index...');
  const reports = await listRecords(join(DATA_DIR, 'reports'), 'rpt_');
  const targetReportsIndex = {};
  for (const rpt of reports) {
    if (!targetReportsIndex[rpt.targetId]) targetReportsIndex[rpt.targetId] = [];
    targetReportsIndex[rpt.targetId].push(rpt.id);
  }
  const existingTargetIndex = await readJSON(join(DATA_DIR, 'reports/target-index.json')) || {};
  const targetIndexChanged = JSON.stringify(targetReportsIndex) !== JSON.stringify(existingTargetIndex);
  if (targetIndexChanged) {
    console.log(`   ⚠️  Target-Reports index needs repair (${Object.keys(targetReportsIndex).length} targets)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'reports/target-index.json'), targetReportsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Target-Reports index OK (${Object.keys(targetReportsIndex).length} targets)`);
  }

  // 9. Reporter-Reports Index (reports/reporter-index.json)
  console.log('9️⃣  Reporter-Reports Index...');
  const reporterReportsIndex = {};
  for (const rpt of reports) {
    if (!reporterReportsIndex[rpt.reporterId]) reporterReportsIndex[rpt.reporterId] = [];
    reporterReportsIndex[rpt.reporterId].push(rpt.id);
  }
  const existingReporterIndex = await readJSON(join(DATA_DIR, 'reports/reporter-index.json')) || {};
  const reporterIndexChanged = JSON.stringify(reporterReportsIndex) !== JSON.stringify(existingReporterIndex);
  if (reporterIndexChanged) {
    console.log(`   ⚠️  Reporter-Reports index needs repair (${Object.keys(reporterReportsIndex).length} reporters)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'reports/reporter-index.json'), reporterReportsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Reporter-Reports index OK (${Object.keys(reporterReportsIndex).length} reporters)`);
  }

  // 10. User-Verifications Index (verifications/user-index.json)
  console.log('🔟 User-Verifications Index...');
  const verifications = await listRecords(join(DATA_DIR, 'verifications'), 'vrf_');
  const userVerificationsIndex = {};
  for (const vrf of verifications) {
    if (!userVerificationsIndex[vrf.userId]) userVerificationsIndex[vrf.userId] = [];
    userVerificationsIndex[vrf.userId].push(vrf.id);
  }
  const existingVrfIndex = await readJSON(join(DATA_DIR, 'verifications/user-index.json')) || {};
  const vrfIndexChanged = JSON.stringify(userVerificationsIndex) !== JSON.stringify(existingVrfIndex);
  if (vrfIndexChanged) {
    console.log(`   ⚠️  User-Verifications index needs repair (${Object.keys(userVerificationsIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'verifications/user-index.json'), userVerificationsIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ User-Verifications index OK (${Object.keys(userVerificationsIndex).length} users)`);
  }

  // 11. Job-Attendance Index (attendance/job-index.json)
  console.log('1️⃣1️⃣ Job-Attendance Index...');
  const attendanceRecords = await listRecords(join(DATA_DIR, 'attendance'), 'att_');
  const jobAttendanceIndex = {};
  for (const att of attendanceRecords) {
    if (!jobAttendanceIndex[att.jobId]) jobAttendanceIndex[att.jobId] = [];
    jobAttendanceIndex[att.jobId].push(att.id);
  }
  const existingJobAttIndex = await readJSON(join(DATA_DIR, 'attendance/job-index.json')) || {};
  const jobAttIndexChanged = JSON.stringify(jobAttendanceIndex) !== JSON.stringify(existingJobAttIndex);
  if (jobAttIndexChanged) {
    console.log(`   ⚠️  Job-Attendance index needs repair (${Object.keys(jobAttendanceIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'attendance/job-index.json'), jobAttendanceIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Job-Attendance index OK (${Object.keys(jobAttendanceIndex).length} jobs)`);
  }

  // 12. Worker-Attendance Index (attendance/worker-index.json)
  console.log('1️⃣2️⃣ Worker-Attendance Index...');
  const workerAttendanceIndex = {};
  for (const att of attendanceRecords) {
    if (!workerAttendanceIndex[att.workerId]) workerAttendanceIndex[att.workerId] = [];
    workerAttendanceIndex[att.workerId].push(att.id);
  }
  const existingWorkerAttIndex = await readJSON(join(DATA_DIR, 'attendance/worker-index.json')) || {};
  const workerAttIndexChanged = JSON.stringify(workerAttendanceIndex) !== JSON.stringify(existingWorkerAttIndex);
  if (workerAttIndexChanged) {
    console.log(`   ⚠️  Worker-Attendance index needs repair (${Object.keys(workerAttendanceIndex).length} workers)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'attendance/worker-index.json'), workerAttendanceIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Worker-Attendance index OK (${Object.keys(workerAttendanceIndex).length} workers)`);
  }

  // 13. Message-Job Index (messages/job-index.json)
  console.log('1️⃣3️⃣ Message-Job Index...');
  const messages = await listRecords(join(DATA_DIR, 'messages'), 'msg_');
  const messageJobIndex = {};
  for (const msg of messages) {
    if (!messageJobIndex[msg.jobId]) messageJobIndex[msg.jobId] = [];
    messageJobIndex[msg.jobId].push(msg.id);
  }
  const existingMsgJobIndex = await readJSON(join(DATA_DIR, 'messages/job-index.json')) || {};
  const msgJobIndexChanged = JSON.stringify(messageJobIndex) !== JSON.stringify(existingMsgJobIndex);
  if (msgJobIndexChanged) {
    console.log(`   ⚠️  Message-Job index needs repair (${Object.keys(messageJobIndex).length} jobs)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'messages/job-index.json'), messageJobIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Message-Job index OK (${Object.keys(messageJobIndex).length} jobs)`);
  }

  // 14. Message-User Index (messages/user-index.json)
  console.log('1️⃣4️⃣ Message-User Index...');
  const messageUserIndex = {};
  for (const msg of messages) {
    if (msg.recipientId) {
      if (!messageUserIndex[msg.recipientId]) messageUserIndex[msg.recipientId] = [];
      messageUserIndex[msg.recipientId].push(msg.id);
    }
    // For broadcasts (recipientId: null), we'd need to resolve accepted workers — skip in repair
  }
  const existingMsgUserIndex = await readJSON(join(DATA_DIR, 'messages/user-index.json')) || {};
  const msgUserIndexChanged = JSON.stringify(messageUserIndex) !== JSON.stringify(existingMsgUserIndex);
  if (msgUserIndexChanged) {
    console.log(`   ⚠️  Message-User index needs repair (${Object.keys(messageUserIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'messages/user-index.json'), messageUserIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Message-User index OK (${Object.keys(messageUserIndex).length} users)`);
  }

  // 15. Push-User Index (push_subscriptions/user-index.json)
  console.log('1️⃣5️⃣ Push-User Index...');
  const pushSubs = await listRecords(join(DATA_DIR, 'push_subscriptions'), 'psub_');
  const pushUserIndex = {};
  for (const sub of pushSubs) {
    if (!pushUserIndex[sub.userId]) pushUserIndex[sub.userId] = [];
    pushUserIndex[sub.userId].push(sub.id);
  }
  const existingPushIndex = await readJSON(join(DATA_DIR, 'push_subscriptions/user-index.json')) || {};
  const pushIndexChanged = JSON.stringify(pushUserIndex) !== JSON.stringify(existingPushIndex);
  if (pushIndexChanged) {
    console.log(`   ⚠️  Push-User index needs repair (${Object.keys(pushUserIndex).length} users)`);
    if (!DRY_RUN) await atomicWrite(join(DATA_DIR, 'push_subscriptions/user-index.json'), pushUserIndex);
    totalFixed++;
  } else {
    console.log(`   ✅ Push-User index OK (${Object.keys(pushUserIndex).length} users)`);
  }

  console.log(`\n${DRY_RUN ? '📋' : '✅'} Done! ${totalFixed} indexes ${DRY_RUN ? 'would be ' : ''}repaired/rebuilt.`);
}

repair().catch(err => {
  console.error('❌ Repair failed:', err.message);
  process.exit(1);
});
```

---
