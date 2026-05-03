// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/admin.js — Admin Dashboard Module (IIFE)
// ═══════════════════════════════════════════════════════════════

var AdminApp = (function () {
  'use strict';

  var token = '';
  var API = '';
  // Phase 47 — Bulk select state
  var bulkSelectedFlags = new Set();

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
      Promise.all([
        loadHealth(),
        loadUsers(),
        loadJobs(),
        loadFinancials(),
        loadReports(),
        loadVerifications(),
        loadAnalytics(),
        loadMonitoring(),
        loadDirectOffersDashboard(),
        loadAbuseSignals(),
      ]).catch(function () {});
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

  async function loadAnalytics() {
    try {
      var data = await api('/api/admin/analytics');
      var container = document.getElementById('analyticsGrid');
      if (!container) return;
      var a = data.analytics || {};
      var u = a.users || {};
      var j = a.jobs || {};
      var f = a.financials || {};

      var cards = [
        { value: u.newRegistrations || 0, label: 'مستخدمين جدد (30 يوم)' },
        { value: j.created || 0, label: 'فرص جديدة' },
        { value: j.completed || 0, label: 'فرص مكتملة' },
        { value: (j.fillRate || 0) + '%', label: 'نسبة الامتلاء' },
        { value: (f.platformRevenue || 0).toLocaleString('ar-EG'), label: 'إيرادات المنصة (جنيه)' },
        { value: (f.totalVolume || 0).toLocaleString('ar-EG'), label: 'حجم الأعمال (جنيه)' },
        { value: (f.disputeRate || 0) + '%', label: 'نسبة النزاعات' },
        { value: (a.engagement || {}).avgApplicationsPerJob || 0, label: 'متوسط طلبات/فرصة' },
      ];

      container.innerHTML = '';
      cards.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML =
          '<div class="stat-card__value">' + escapeHtml(String(c.value)) + '</div>' +
          '<div class="stat-card__label">' + escapeHtml(c.label) + '</div>';
        container.appendChild(card);
      });
    } catch (err) {
      var container = document.getElementById('analyticsGrid');
      if (container) container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في تحميل التحليلات</p>';
    }
  }

  async function loadMonitoring() {
    try {
      var data = await api('/api/admin/monitoring/latest');
      var container = document.getElementById('monitoringInfo');
      if (!container) return;
      if (!data.snapshot) {
        container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا توجد بيانات مراقبة بعد</p>';
        return;
      }
      var s = data.snapshot;
      var alerts = data.alerts || [];

      var rows = [
        { label: 'آخر تحديث', value: s.timestamp ? new Date(s.timestamp).toLocaleString('ar-EG') : '-' },
        { label: 'Heap Used', value: (s.memory ? s.memory.heapUsedMB : 0) + ' MB' },
        { label: 'RSS', value: (s.memory ? s.memory.rssMB : 0) + ' MB' },
        { label: 'الطلبات', value: s.requests ? s.requests.count : 0 },
        { label: 'P95', value: (s.requests ? s.requests.p95Ms : 0) + ' ms' },
        { label: 'Error Rate', value: s.requests ? s.requests.errorRate : '0%' },
        { label: 'Cache Hit Rate', value: s.cache ? s.cache.hitRate : '0%' },
        { label: 'SSE Connections', value: s.connections ? s.connections.sse : 0 },
      ];

      container.innerHTML = '';

      if (alerts.length > 0) {
        var alertHtml = '<div style="margin-bottom:1rem;padding:0.75rem;background:var(--color-error-bg);border:1px solid var(--color-error);border-radius:var(--radius-sm);font-size:0.85rem;">';
        alerts.forEach(function (a) {
          alertHtml += '<div>⚠️ <strong>' + escapeHtml(a.level) + ':</strong> ' + escapeHtml(a.message) + '</div>';
        });
        alertHtml += '</div>';
        container.innerHTML += alertHtml;
      }

      rows.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'health-row';
        row.innerHTML =
          '<span class="health-row__label">' + escapeHtml(r.label) + '</span>' +
          '<span class="health-row__value">' + escapeHtml(String(r.value)) + '</span>';
        container.appendChild(row);
      });

      // Data sizes
      if (s.dataSize) {
        var dsRow = document.createElement('div');
        dsRow.className = 'health-row';
        var dsValues = [];
        Object.entries(s.dataSize).forEach(function (e) { dsValues.push(e[0] + ': ' + e[1]); });
        dsRow.innerHTML = '<span class="health-row__label">ملفات البيانات</span><span class="health-row__value" style="font-size:0.75rem;">' + escapeHtml(dsValues.join(' | ')) + '</span>';
        container.appendChild(dsRow);
      }
    } catch (err) {
      var container = document.getElementById('monitoringInfo');
      if (container) container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في تحميل بيانات المراقبة</p>';
    }
  }

  function exportCSV(type) {
    var url = API + '/api/admin/export/' + type;
    // Open in new tab — browser handles download
    var link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    // Add admin token as query param for auth (since it's a direct download, not fetch)
    link.href = url + '?_token=' + encodeURIComponent(token);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 44 — Admin Direct Offers Operations Console
  // ═══════════════════════════════════════════════════════════════

  async function loadDirectOffersDashboard() {
    try {
      var data = await api('/api/admin/direct-offers/dashboard');
      if (!data || !data.ok) return;

      // ── Funnel cards ──
      var funnelEl = document.getElementById('directOffersFunnel');
      if (funnelEl) {
        var f = data.funnel || {};
        var cards = [
          { value: f.sent || 0, label: 'إجمالي العروض' },
          { value: f.accepted || 0, label: 'مقبولة' },
          { value: (f.acceptRate || 0) + '%', label: 'نسبة القبول' },
          { value: f.declined || 0, label: 'مرفوضة' },
          { value: (f.declineRate || 0) + '%', label: 'نسبة الرفض' },
          { value: f.expired || 0, label: 'منتهية' },
          { value: f.pending || 0, label: 'معلّقة الآن' },
          { value: f.withdrawn || 0, label: 'مسحوبة' },
        ];
        funnelEl.innerHTML = '';
        cards.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'stat-card';
          card.innerHTML =
            '<div class="stat-card__value">' + escapeHtml(String(c.value)) + '</div>' +
            '<div class="stat-card__label">' + escapeHtml(c.label) + '</div>';
          funnelEl.appendChild(card);
        });
      }

      // ── Decline reasons ──
      var drEl = document.getElementById('directOffersDeclineReasons');
      if (drEl) {
        var reasonLabels = {
          busy: 'مشغول',
          wage_low: 'الأجر قليل',
          distance: 'بعيد',
          category_mismatch: 'مش تخصصه',
          other: 'سبب آخر',
          unspecified: 'بدون سبب',
        };
        var dr = data.declineReasons || { total: 0, breakdown: [] };
        if (!dr.total || dr.total === 0) {
          drEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا توجد عروض مرفوضة</p>';
        } else {
          var html = '';
          dr.breakdown.forEach(function (r) {
            html += '<div class="rating-dist-row">' +
              '<span class="rating-dist-label">' + escapeHtml(reasonLabels[r.reason] || r.reason) + '</span>' +
              '<div class="rating-dist-bar"><div class="rating-dist-fill" style="width:' + r.percentage + '%;background:var(--color-error);"></div></div>' +
              '<span class="rating-dist-count">' + r.count + ' (' + r.percentage + '%)</span>' +
            '</div>';
          });
          drEl.innerHTML = html;
        }
      }

      // ── Top employers ──
      var teEl = document.getElementById('topEmployersTable');
      if (teEl) {
        var topEmps = data.topEmployers || [];
        if (topEmps.length === 0) {
          teEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا توجد بيانات كافية</p>';
        } else {
          var html = '<table class="admin-table"><thead><tr>' +
            '<th>صاحب العمل</th><th>عروض</th><th>مقبولة</th><th>نسبة القبول</th>' +
            '</tr></thead><tbody>';
          topEmps.forEach(function (e) {
            html += '<tr>' +
              '<td><a href="/user.html?id=' + escapeHtml(e.employerId) + '" class="worker-link">' + escapeHtml(e.name || e.employerId) + '</a></td>' +
              '<td>' + e.total + '</td>' +
              '<td>' + e.accepted + '</td>' +
              '<td>' + e.acceptRate + '%</td>' +
            '</tr>';
          });
          html += '</tbody></table>';
          teEl.innerHTML = html;
        }
      }

      // ── Top workers ──
      var twEl = document.getElementById('topWorkersTable');
      if (twEl) {
        var topWrks = data.topWorkers || [];
        if (topWrks.length === 0) {
          twEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا توجد بيانات كافية</p>';
        } else {
          var html = '<table class="admin-table"><thead><tr>' +
            '<th>العامل</th><th>عروض مستلمة</th><th>مقبولة</th><th>نسبة القبول</th><th>متوسط الرد</th>' +
            '</tr></thead><tbody>';
          topWrks.forEach(function (w) {
            html += '<tr>' +
              '<td><a href="/user.html?id=' + escapeHtml(w.workerId) + '" class="worker-link">' + escapeHtml(w.name || w.workerId) + '</a></td>' +
              '<td>' + w.total + '</td>' +
              '<td>' + w.accepted + '</td>' +
              '<td>' + w.acceptRate + '%</td>' +
              '<td>' + w.avgResponseSec + 's</td>' +
            '</tr>';
          });
          html += '</tbody></table>';
          twEl.innerHTML = html;
        }
      }
    } catch (err) {
      var funnelEl = document.getElementById('directOffersFunnel');
      if (funnelEl) funnelEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في تحميل dashboard العروض</p>';
    }
  }

  async function loadAbuseSignals() {
    try {
      var statusEl = document.getElementById('flagStatusFilter');
      var status = statusEl ? statusEl.value : 'active';

      // 'all' uses Phase 44 detected flags endpoint (current snapshot of detected abuse)
      // Other statuses use Phase 47 listByStatus endpoint (filtered review states)
      var endpoint = status === 'all'
        ? '/api/admin/direct-offers/abuse'
        : '/api/admin/abuse-flags?status=' + encodeURIComponent(status);

      var data = await api(endpoint);
      var el = document.getElementById('abuseSignalsArea');
      if (!el) return;

      // Reset bulk selection state on reload
      bulkSelectedFlags.clear();
      updateBulkButton();

      // Handle Phase 44 'all' (detected flags) response
      if (status === 'all') {
        if (!data.enabled) {
          el.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">كشف الإساءة غير مفعّل</p>';
          return;
        }

        if (!data.flagCount || data.flagCount === 0) {
          el.innerHTML = '<p style="color: var(--color-success); text-align: center; padding: 1rem;">✓ لا توجد إشارات إساءة</p>';
          return;
        }

        renderDetectedFlags(el, data.flags);
        return;
      }

      // Handle Phase 47 'listByStatus' (filtered review states)
      var flags = data.flags || [];
      if (flags.length === 0) {
        var emptyMsg = status === 'active'
          ? '✓ لا توجد إشارات نشطة'
          : 'لا توجد إشارات بهذه الحالة';
        el.innerHTML = '<p style="color: var(--color-success); text-align: center; padding: 1rem;">' + emptyMsg + '</p>';
        return;
      }

      renderReviewStates(el, flags, status);
    } catch (err) {
      var el = document.getElementById('abuseSignalsArea');
      if (el) el.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في التحميل</p>';
    }
  }

  // Phase 44 — Detected flags renderer (existing behavior)
  function renderDetectedFlags(el, flags) {
    var typeLabels = {
      same_worker_spam: 'صاحب عمل يبعت لنفس العامل بشكل متكرر',
      high_decline_employer: 'صاحب عمل بنسبة رفض عالية',
      worker_offer_bombing: 'عامل يستلم سيل من العروض',
    };

    var html = '<p style="margin-block-end:0.75rem;">عُثر على <strong>' + flags.length + '</strong> إشارة:</p>';

    flags.forEach(function (f) {
      var sevColor = f.severity === 'high' ? 'var(--color-error)' :
                     f.severity === 'medium' ? 'var(--color-warning)' :
                     'var(--color-text-muted)';
      var sevLabel = f.severity === 'high' ? 'عالية' :
                     f.severity === 'medium' ? 'متوسطة' : 'منخفضة';

      var reviewInfo = '';
      if (f.reviewState) {
        var status = f.reviewState.currentStatus;
        var statusLabel = status === 'snoozed' ? 'مؤجلة' :
                         status === 'dismissed' ? 'مرفوضة' :
                         status === 'actioned' ? 'تم الإجراء' : 'نشطة';
        var occCount = f.reviewState.occurrenceCount || 1;
        reviewInfo = '<small style="display:block;margin-block-start:0.4rem;color:var(--color-text-muted);">' +
          '📋 الحالة: ' + escapeHtml(statusLabel) + ' · تكرار ' + occCount + ' مرة';
        if (f.reviewState.reviews && f.reviewState.reviews.length > 0) {
          reviewInfo += ' · ' + f.reviewState.reviews.length + ' مراجعة';
        }
        reviewInfo += '</small>';
      }

      var fingerprint = f.fingerprint || '';

      html += '<div style="border-inline-start:3px solid ' + sevColor + ';padding:0.75rem 1rem;background:var(--color-surface-2);border-radius:var(--radius-sm);margin-block-end:0.5rem;display:flex;align-items:flex-start;gap:0.5rem;">';

      if (fingerprint) {
        html += '<input type="checkbox" class="bulk-flag-check" data-fingerprint="' + escapeHtml(fingerprint) + '" onchange="AdminApp.toggleBulkSelect(\'' + escapeHtml(fingerprint) + '\')" style="margin-top:0.25rem;">';
      }

      html += '<div style="flex:1;">' +
        '<strong>' + escapeHtml(typeLabels[f.type] || f.type) + '</strong> ' +
        '<span style="font-size:0.75rem;color:' + sevColor + ';font-weight:600;">[خطورة ' + sevLabel + ']</span><br>';

      if (f.employerId) {
        html += '<small>صاحب العمل: <a href="/user.html?id=' + escapeHtml(f.employerId) + '" class="worker-link">' + escapeHtml(f.employerId) + '</a></small><br>';
      }
      if (f.workerId) {
        html += '<small>العامل: <a href="/user.html?id=' + escapeHtml(f.workerId) + '" class="worker-link">' + escapeHtml(f.workerId) + '</a></small><br>';
      }

      var details = [];
      if (typeof f.offerCount === 'number') details.push(f.offerCount + ' عروض');
      if (typeof f.uniqueEmployers === 'number') details.push('من ' + f.uniqueEmployers + ' أصحاب عمل');
      if (typeof f.declinedOrExpired === 'number') details.push(f.declinedOrExpired + ' مرفوضة/منتهية');
      if (typeof f.totalOffers === 'number') details.push('إجمالي ' + f.totalOffers + ' عرض');
      if (typeof f.negativeRate === 'number') details.push('نسبة سلبية: ' + f.negativeRate + '%');

      if (details.length > 0) {
        html += '<small style="color:var(--color-text-muted);">' + details.join(' · ') + '</small>';
      }

      html += reviewInfo;

      if (fingerprint) {
        html += '<div style="margin-block-start:0.5rem;">' +
          '<button class="btn btn--sm btn--primary" onclick="AdminApp.showFlagReviewModal(\'' + escapeHtml(fingerprint) + '\')">📋 مراجعة الإشارة</button>' +
          '</div>';
      }

      html += '</div></div>';
    });

    el.innerHTML = html;
  }

  // Phase 47 — Filtered review states renderer
  function renderReviewStates(el, flags, status) {
    var typeLabels = {
      same_worker_spam: 'صاحب عمل يبعت لنفس العامل بشكل متكرر',
      high_decline_employer: 'صاحب عمل بنسبة رفض عالية',
      worker_offer_bombing: 'عامل يستلم سيل من العروض',
    };
    var statusLabels = {
      active: 'نشطة', snoozed: 'مؤجلة', dismissed: 'مرفوضة', actioned: 'تم الإجراء',
    };

    var html = '<p style="margin-block-end:0.75rem;">عرض <strong>' + flags.length + '</strong> إشارة (' + escapeHtml(statusLabels[status] || status) + '):</p>';

    flags.forEach(function (f) {
      var fingerprint = f.fingerprint || '';
      var sevColor = status === 'active'
        ? 'var(--color-warning)'
        : (status === 'snoozed' ? 'var(--color-warning)' : 'var(--color-text-muted)');

      html += '<div style="border-inline-start:3px solid ' + sevColor + ';padding:0.75rem 1rem;background:var(--color-surface-2);border-radius:var(--radius-sm);margin-block-end:0.5rem;display:flex;align-items:flex-start;gap:0.5rem;">';

      // Bulk select checkbox (only for active and snoozed)
      if (fingerprint && (status === 'active' || status === 'snoozed')) {
        html += '<input type="checkbox" class="bulk-flag-check" data-fingerprint="' + escapeHtml(fingerprint) + '" onchange="AdminApp.toggleBulkSelect(\'' + escapeHtml(fingerprint) + '\')" style="margin-top:0.25rem;">';
      } else {
        html += '<span style="width:18px;display:inline-block;"></span>';
      }

      html += '<div style="flex:1;">' +
        '<strong>' + escapeHtml(typeLabels[f.flagType] || f.flagType) + '</strong>';

      if (f.currentStatus === 'snoozed' && f.snoozeUntil) {
        var snoozeDate = new Date(f.snoozeUntil);
        html += ' <span style="color:var(--color-warning);font-size:0.75rem;">⏰ ينتهي ' + snoozeDate.toLocaleDateString('ar-EG') + '</span>';
      }

      html += '<br>';

      if (f.employerId) {
        html += '<small>صاحب العمل: <a href="/user.html?id=' + escapeHtml(f.employerId) + '" class="worker-link">' + escapeHtml(f.employerId) + '</a></small><br>';
      }
      if (f.workerId) {
        html += '<small>العامل: <a href="/user.html?id=' + escapeHtml(f.workerId) + '" class="worker-link">' + escapeHtml(f.workerId) + '</a></small><br>';
      }
      if (f.occurrenceCount > 1) {
        html += '<small style="color:var(--color-warning);">📊 تكرار: ' + f.occurrenceCount + ' مرة</small><br>';
      }
      if (f.reviews && f.reviews.length > 0) {
        html += '<small style="color:var(--color-text-muted);">' + f.reviews.length + ' مراجعة</small><br>';
      }

      if (fingerprint) {
        html += '<div style="margin-block-start:0.5rem;">' +
          '<button class="btn btn--sm btn--primary" onclick="AdminApp.showFlagReviewModal(\'' + escapeHtml(fingerprint) + '\')">📋 مراجعة</button>' +
          '</div>';
      }

      html += '</div></div>';
    });

    el.innerHTML = html;
  }

  // Phase 47 — Bulk select handlers
  function toggleBulkSelect(fingerprint) {
    if (bulkSelectedFlags.has(fingerprint)) {
      bulkSelectedFlags.delete(fingerprint);
    } else {
      bulkSelectedFlags.add(fingerprint);
    }
    updateBulkButton();
  }

  function updateBulkButton() {
    var btn = document.getElementById('btnBulkAction');
    var count = document.getElementById('bulkSelectedCount');
    if (count) count.textContent = bulkSelectedFlags.size;
    if (btn) {
      if (bulkSelectedFlags.size > 0) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    }
  }

  // Phase 47 — Search by notes
  async function searchFlagsByNotes() {
    var inputEl = document.getElementById('flagSearchNotes');
    var q = inputEl ? inputEl.value.trim() : '';
    if (q.length < 2) {
      showError('الاستعلام لازم يكون حرفين على الأقل');
      return;
    }
    try {
      var data = await api('/api/admin/abuse-flags/search?notes=' + encodeURIComponent(q));
      renderSearchResults(data.flags || [], 'نتائج البحث: "' + q + '"');
    } catch (err) {
      showError('خطأ في البحث');
    }
  }

  // Phase 47 — Snooze expiring soon
  async function loadSnoozeExpiring() {
    try {
      var data = await api('/api/admin/abuse-flags/snooze-expiring?days=7');
      var flags = data.flags || [];
      renderSearchResults(flags, 'إشارات مؤجلة قارب انتهاؤها (' + flags.length + ')');
    } catch (err) {
      showError('خطأ');
    }
  }

  // Phase 47 — Generic search/expiring renderer
  function renderSearchResults(flags, title) {
    var el = document.getElementById('abuseSignalsArea');
    if (!el) return;
    if (flags.length === 0) {
      el.innerHTML = '<h4 style="margin-block-end:0.75rem;">' + escapeHtml(title) + '</h4><p style="text-align:center;padding:1rem;color:var(--color-text-muted);">لا توجد نتائج</p>';
      return;
    }

    var typeLabels = {
      same_worker_spam: 'صاحب عمل يبعت لنفس العامل بشكل متكرر',
      high_decline_employer: 'صاحب عمل بنسبة رفض عالية',
      worker_offer_bombing: 'عامل يستلم سيل من العروض',
    };

    var html = '<h4 style="margin-block-end:0.75rem;">' + escapeHtml(title) + '</h4>';

    flags.forEach(function (f) {
      var fingerprint = f.fingerprint || '';
      html += '<div style="padding:0.75rem;background:var(--color-surface-2);border-radius:var(--radius-sm);margin-block-end:0.5rem;">' +
        '<strong>' + escapeHtml(typeLabels[f.flagType] || f.flagType) + '</strong>';

      if (typeof f._hoursUntilExpiry === 'number') {
        html += ' <span style="color:var(--color-warning);font-size:0.75rem;">⏰ ' + f._hoursUntilExpiry + ' ساعة</span>';
      }
      html += '<br>';

      if (f._matchingReview && f._matchingReview.note) {
        html += '<small><em>"' + escapeHtml(f._matchingReview.note) + '"</em></small><br>';
      }

      if (fingerprint) {
        html += '<button class="btn btn--sm btn--primary" onclick="AdminApp.showFlagReviewModal(\'' + escapeHtml(fingerprint) + '\')" style="margin-top:0.5rem;">📋 مراجعة</button>';
      }
      html += '</div>';
    });

    el.innerHTML = html;
  }

  // Phase 47 — Bulk action modal
  function openBulkActionModal() {
    if (bulkSelectedFlags.size === 0) return;
    var modal = document.getElementById('bulkActionModal');
    var count = document.getElementById('bulkActionCount');
    if (count) count.textContent = bulkSelectedFlags.size;
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = '';
    }
  }

  function closeBulkActionModal() {
    var modal = document.getElementById('bulkActionModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    var errorEl = document.getElementById('bulkActionError');
    if (errorEl) {
      errorEl.classList.add('hidden');
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
  }

  function toggleBulkSnoozeDays() {
    var decisionEl = document.getElementById('bulkActionDecision');
    var decision = decisionEl ? decisionEl.value : '';
    var group = document.getElementById('bulkSnoozeDaysGroup');
    if (group) {
      if (decision === 'snoozed') {
        group.classList.remove('hidden');
        group.style.display = '';
      } else {
        group.classList.add('hidden');
        group.style.display = 'none';
      }
    }
  }

  async function confirmBulkAction() {
    var decisionEl = document.getElementById('bulkActionDecision');
    var noteEl = document.getElementById('bulkActionNote');
    var snoozeDaysEl = document.getElementById('bulkSnoozeDays');
    var errorEl = document.getElementById('bulkActionError');

    var decision = decisionEl ? decisionEl.value : '';
    var note = noteEl ? noteEl.value.trim() : '';
    var snoozeDays = snoozeDaysEl ? parseInt(snoozeDaysEl.value) : 7;

    function showBulkError(msg) {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
        errorEl.style.display = '';
      }
    }

    // Confirmation for destructive action
    if (decision === 'actioned') {
      var confirmed = await YawmiaModal.confirm({
        title: 'تأكيد الإجراء الجماعي',
        message: 'سيتم حظر جميع المستخدمين المرتبطين بـ ' + bulkSelectedFlags.size + ' إشارة. متأكد؟',
        confirmText: 'حظر',
        cancelText: 'إلغاء',
        danger: true,
      });
      if (!confirmed) return;
    }

    try {
      var body = {
        fingerprints: Array.from(bulkSelectedFlags),
        decision: decision,
      };
      if (note) body.note = note;
      if (decision === 'snoozed') body.snoozeDays = snoozeDays;

      var result = await apiWrite('POST', '/api/admin/abuse-flags/bulk-action', body);
      if (result.ok) {
        closeBulkActionModal();
        bulkSelectedFlags.clear();
        updateBulkButton();
        loadAbuseSignals();
        if (typeof YawmiaToast !== 'undefined') {
          YawmiaToast.success('تم: ' + result.succeeded + ' نجح، ' + result.failed + ' فشل');
        }
      }
    } catch (err) {
      showBulkError(err.message || 'خطأ في العملية');
    }
  }

  // Phase 47 — Audit log search + export
  async function searchAuditLog() {
    try {
      var qEl = document.getElementById('auditSearchQuery');
      var actionEl = document.getElementById('auditActionFilter');
      var fromEl = document.getElementById('auditFromDate');
      var toEl = document.getElementById('auditToDate');

      var q = qEl ? qEl.value.trim() : '';
      var action = actionEl ? actionEl.value : '';
      var from = fromEl ? fromEl.value : '';
      var to = toEl ? toEl.value : '';

      var query = '/api/admin/audit-log/search?limit=50';
      if (q) query += '&q=' + encodeURIComponent(q);
      if (action) query += '&action=' + encodeURIComponent(action);
      if (from) query += '&from=' + encodeURIComponent(from);
      if (to) query += '&to=' + encodeURIComponent(to + 'T23:59:59');

      var data = await api(query);
      var el = document.getElementById('auditLogResults');
      if (!el) return;

      var entries = data.entries || [];

      if (entries.length === 0) {
        el.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا توجد نتائج</p>';
        return;
      }

      var html = '<p style="margin-block-end:0.5rem;">عُثر على <strong>' + data.total + '</strong> سجل (يعرض ' + entries.length + ')</p>';
      html += '<table class="admin-table"><thead><tr>' +
        '<th>الأدمن</th><th>الإجراء</th><th>الهدف</th><th>التاريخ</th><th>التفاصيل</th>' +
        '</tr></thead><tbody>';

      entries.forEach(function (e) {
        var date = e.createdAt ? new Date(e.createdAt).toLocaleString('ar-EG') : '-';
        var detailsStr = e.details ? JSON.stringify(e.details).substring(0, 80) : '-';
        html += '<tr>' +
          '<td>' + escapeHtml(e.adminId || '') + '</td>' +
          '<td>' + escapeHtml(e.action || '') + '</td>' +
          '<td>' + escapeHtml((e.targetType || '') + ':' + (e.targetId || '')) + '</td>' +
          '<td>' + escapeHtml(date) + '</td>' +
          '<td><small>' + escapeHtml(detailsStr) + '</small></td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      showError('خطأ في البحث');
    }
  }

  function exportAuditLog() {
    var fromEl = document.getElementById('auditFromDate');
    var toEl = document.getElementById('auditToDate');
    var actionEl = document.getElementById('auditActionFilter');

    var from = fromEl ? fromEl.value : '';
    var to = toEl ? toEl.value : '';
    var action = actionEl ? actionEl.value : '';

    var url = API + '/api/admin/audit-log/export?_token=' + encodeURIComponent(token);
    if (from) url += '&from=' + encodeURIComponent(from);
    if (to) url += '&to=' + encodeURIComponent(to + 'T23:59:59');
    if (action) url += '&action=' + encodeURIComponent(action);

    var link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 45 — Abuse Flag Review Modal
  // ═══════════════════════════════════════════════════════════════

  async function showFlagReviewModal(fingerprint) {
    var modal = document.getElementById('abuseFlagReviewModal');
    if (!modal) return;

    var detailsEl = document.getElementById('flagReviewDetails');
    var historyEl = document.getElementById('flagReviewHistory');
    var noteEl = document.getElementById('flagReviewNote');
    var errorEl = document.getElementById('flagReviewError');

    if (detailsEl) detailsEl.innerHTML = 'جاري التحميل...';
    if (historyEl) historyEl.innerHTML = '';
    if (noteEl) noteEl.value = '';
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }

    modal.style.display = '';
    modal.classList.remove('hidden');
    modal.dataset.fingerprint = fingerprint;

    try {
      var data = await api('/api/admin/abuse-flags/' + fingerprint + '/history');
      if (!data.ok || !data.reviewState) {
        if (detailsEl) detailsEl.innerHTML = '<span style="color:var(--color-error);">خطأ في تحميل البيانات</span>';
        return;
      }

      var state = data.reviewState;
      modal.dataset.flagType = state.flagType || '';
      modal.dataset.targetUserId = state.flagType === 'worker_offer_bombing' ? (state.workerId || '') : (state.employerId || '');

      var typeLabels = {
        same_worker_spam: 'صاحب عمل يبعت لنفس العامل بشكل متكرر',
        high_decline_employer: 'صاحب عمل بنسبة رفض عالية',
        worker_offer_bombing: 'عامل يستلم سيل من العروض',
      };

      var statusLabels = {
        active: 'نشطة',
        snoozed: 'مؤجلة',
        dismissed: 'مرفوضة',
        actioned: 'تم الإجراء',
      };

      var detailsHtml = '<strong>النوع:</strong> ' + escapeHtml(typeLabels[state.flagType] || state.flagType) + '<br>' +
        '<strong>أول ظهور:</strong> ' + new Date(state.firstSeenAt).toLocaleString('ar-EG') + '<br>' +
        '<strong>عدد التكرار:</strong> ' + (state.occurrenceCount || 1) + '<br>' +
        '<strong>الحالة الحالية:</strong> ' + escapeHtml(statusLabels[state.currentStatus] || state.currentStatus);

      if (state.snoozeUntil) {
        detailsHtml += '<br><strong>التأجيل ينتهي:</strong> ' + new Date(state.snoozeUntil).toLocaleString('ar-EG');
      }
      if (state.employerId) {
        detailsHtml += '<br><strong>صاحب العمل:</strong> <a href="/user.html?id=' + escapeHtml(state.employerId) + '" class="worker-link">' + escapeHtml(state.employerId) + '</a>';
      }
      if (state.workerId) {
        detailsHtml += '<br><strong>العامل:</strong> <a href="/user.html?id=' + escapeHtml(state.workerId) + '" class="worker-link">' + escapeHtml(state.workerId) + '</a>';
      }

      if (detailsEl) detailsEl.innerHTML = detailsHtml;

      // Phase 47 — Display warnings remaining for target user
      var targetUserId = state.flagType === 'worker_offer_bombing' ? state.workerId : state.employerId;
      if (targetUserId && detailsEl) {
        try {
          var rlData = await api('/api/admin/users/' + targetUserId + '/warnings-remaining');
          if (rlData && rlData.ok) {
            var warningHint = document.createElement('p');
            warningHint.style.cssText = 'margin-block-start:0.5rem;font-size:0.85rem;color:var(--color-warning);';
            warningHint.innerHTML = '⚠️ التحذيرات المتبقية للمستخدم: <strong>' + rlData.remaining + '/' + rlData.max + '</strong>';
            detailsEl.appendChild(warningHint);
          }
        } catch (_) { /* non-fatal */ }
      }

      // History
      if (historyEl) {
        if (!state.reviews || state.reviews.length === 0) {
          historyEl.innerHTML = '<em style="color:var(--color-text-muted);">لا توجد مراجعات سابقة</em>';
        } else {
          var historyHtml = '';
          var decisionLabels = {
            dismissed: 'رفض',
            snoozed: 'تأجيل',
            warning: 'تحذير',
            actioned: 'إجراء',
          };
          state.reviews.slice().reverse().forEach(function (r) {
            historyHtml += '<div style="padding:0.5rem;border-block-end:1px solid var(--color-border);">' +
              '<strong>' + escapeHtml(decisionLabels[r.decision] || r.decision) + '</strong>' +
              ' — <small>' + new Date(r.createdAt).toLocaleString('ar-EG') + '</small>' +
              ' — <small>أدمن: ' + escapeHtml(r.adminId) + '</small>';
            if (r.snoozeUntil) {
              historyHtml += '<br><small>حتى: ' + new Date(r.snoozeUntil).toLocaleString('ar-EG') + '</small>';
            }
            if (r.note) {
              historyHtml += '<br><em>' + escapeHtml(r.note) + '</em>';
            }
            historyHtml += '</div>';
          });
          historyEl.innerHTML = historyHtml;
        }
      }
    } catch (err) {
      if (detailsEl) detailsEl.innerHTML = '<span style="color:var(--color-error);">خطأ في تحميل البيانات</span>';
    }
  }

  function hideFlagReviewModal() {
    var modal = document.getElementById('abuseFlagReviewModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  function showFlagReviewError(msg) {
    var errorEl = document.getElementById('flagReviewError');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  async function handleFlagReview(decision, snoozeDays) {
    var modal = document.getElementById('abuseFlagReviewModal');
    if (!modal) return;
    var fingerprint = modal.dataset.fingerprint;
    if (!fingerprint) return;

    var noteEl = document.getElementById('flagReviewNote');
    var note = noteEl ? noteEl.value.trim() : '';

    if (decision === 'warning') {
      if (!note || note.length < 3) {
        showFlagReviewError('اكتب رسالة التحذير (3 حروف على الأقل) في حقل الملاحظة');
        return;
      }
      await sendWarning(fingerprint, note);
      return;
    }

    if (decision === 'actioned') {
      var targetUserId = modal.dataset.targetUserId;
      if (!targetUserId) {
        showFlagReviewError('لا يمكن تحديد المستخدم للحظر');
        return;
      }
      var confirmed = await YawmiaModal.confirm({
        title: 'تأكيد الحظر',
        message: 'متأكد من حظر هذا المستخدم؟',
        confirmText: 'حظر',
        cancelText: 'إلغاء',
        danger: true,
      });
      if (!confirmed) return;

      try {
        await apiWrite('PUT', '/api/admin/users/' + targetUserId + '/status', { status: 'banned', reason: 'Abuse flag actioned: ' + (note || fingerprint) });
      } catch (err) {
        showFlagReviewError('خطأ في الحظر: ' + (err.message || ''));
        return;
      }

      // Record the actioned decision
      try {
        await apiWrite('POST', '/api/admin/abuse-flags/' + fingerprint + '/review', {
          decision: 'actioned',
          note: note || null,
        });
      } catch (_) { /* non-fatal */ }

      hideFlagReviewModal();
      loadAbuseSignals();
      return;
    }

    // dismissed or snoozed
    var body = { decision: decision, note: note || null };
    if (decision === 'snoozed') {
      var days = parseInt(snoozeDays);
      if (!days || days < 1) {
        showFlagReviewError('مدة التأجيل غير صالحة');
        return;
      }
      body.snoozeDays = days;
    }

    try {
      await apiWrite('POST', '/api/admin/abuse-flags/' + fingerprint + '/review', body);
      hideFlagReviewModal();
      loadAbuseSignals();
    } catch (err) {
      showFlagReviewError(err.message || 'خطأ في تسجيل المراجعة');
    }
  }

  async function sendWarning(fingerprint, message) {
    try {
      await apiWrite('POST', '/api/admin/abuse-flags/' + fingerprint + '/warn', { message: message });
      hideFlagReviewModal();
      loadAbuseSignals();
    } catch (err) {
      showFlagReviewError(err.message || 'خطأ في إرسال التحذير');
    }
  }

  function setupFlagReviewModalHandlers() {
    var modal = document.getElementById('abuseFlagReviewModal');
    if (!modal || modal.dataset.handlersAttached === '1') return;
    modal.dataset.handlersAttached = '1';

    modal.querySelectorAll('[data-decision]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var decision = btn.dataset.decision;
        var snoozeDays = btn.dataset.snoozeDays;
        handleFlagReview(decision, snoozeDays);
      });
    });

    var closeBtn = document.getElementById('closeFlagReviewModal');
    if (closeBtn) closeBtn.addEventListener('click', hideFlagReviewModal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideFlagReviewModal();
    });
  }

  // Initialize modal handlers on first load
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupFlagReviewModalHandlers);
    } else {
      setupFlagReviewModalHandlers();
    }
  }

  // Phase 47 — Wire up filter dropdown change handler
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wirePhase47Handlers);
    } else {
      wirePhase47Handlers();
    }
  }

  function wirePhase47Handlers() {
    var filter = document.getElementById('flagStatusFilter');
    if (filter && !filter.dataset.handlerAttached) {
      filter.dataset.handlerAttached = '1';
      filter.addEventListener('change', loadAbuseSignals);
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
    loadAnalytics: loadAnalytics,
    loadMonitoring: loadMonitoring,
    loadDirectOffersDashboard: loadDirectOffersDashboard,
    loadAbuseSignals: loadAbuseSignals,
    showFlagReviewModal: showFlagReviewModal,
    hideFlagReviewModal: hideFlagReviewModal,
    handleFlagReview: handleFlagReview,
    exportCSV: exportCSV,
    // Phase 47 — Admin Operations Excellence
    toggleBulkSelect: toggleBulkSelect,
    searchFlagsByNotes: searchFlagsByNotes,
    loadSnoozeExpiring: loadSnoozeExpiring,
    openBulkActionModal: openBulkActionModal,
    closeBulkActionModal: closeBulkActionModal,
    toggleBulkSnoozeDays: toggleBulkSnoozeDays,
    confirmBulkAction: confirmBulkAction,
    searchAuditLog: searchAuditLog,
    exportAuditLog: exportAuditLog,
  };
})();
