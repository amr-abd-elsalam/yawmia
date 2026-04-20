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
        reason = prompt('سبب الحظر (اختياري):') || '';
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
        notes = prompt('ملاحظات الأدمن (اختياري):') || '';
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
        notes = prompt('سبب الرفض (اختياري):') || '';
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
