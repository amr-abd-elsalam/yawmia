// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/admin.js — Admin Dashboard Module (IIFE)
// ═══════════════════════════════════════════════════════════════

var AdminApp = (function () {
  'use strict';

  var token = '';
  var API = '';

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
      Promise.all([loadHealth(), loadUsers(), loadJobs()]).catch(function () {});
    } catch (err) {
      showError('توكن غير صحيح أو خطأ في الاتصال');
    }
  }

  async function loadStats() {
    var data = await api('/api/admin/stats');
    var grid = document.getElementById('statsGrid');
    if (!grid) return;

    var cards = [
      { value: data.users ? data.users.total : 0, label: 'إجمالي المستخدمين' },
      { value: data.users ? data.users.worker : 0, label: 'عمال' },
      { value: data.users ? data.users.employer : 0, label: 'أصحاب عمل' },
      { value: data.jobs ? data.jobs.total : 0, label: 'إجمالي الفرص' },
      { value: data.jobs ? data.jobs.open : 0, label: 'فرص مفتوحة' },
      { value: data.jobs ? data.jobs.completed : 0, label: 'فرص مكتملة' },
      { value: data.applications ? data.applications.total : 0, label: 'إجمالي الطلبات' },
      { value: data.applications ? data.applications.accepted : 0, label: 'طلبات مقبولة' },
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

  async function loadUsers() {
    var data = await api('/api/admin/users');
    var container = document.getElementById('usersTable');
    if (!container) return;

    var users = (data.users || []).slice(0, 20);

    if (users.length === 0) {
      container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا يوجد مستخدمين</p>';
      return;
    }

    var roleLabels = { worker: 'عامل', employer: 'صاحب عمل', admin: 'أدمن' };

    var html = '<table class="admin-table"><thead><tr>' +
      '<th>الاسم</th><th>الموبايل</th><th>النوع</th><th>المحافظة</th><th>تقييم</th><th>تاريخ التسجيل</th>' +
      '</tr></thead><tbody>';

    users.forEach(function (u) {
      var roleBadgeClass = 'badge-' + (u.role || 'worker');
      var roleText = roleLabels[u.role] || u.role || '-';
      var ratingText = u.rating && u.rating.avg ? u.rating.avg.toFixed(1) + ' ⭐' : '-';
      var dateText = u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-EG') : '-';

      html += '<tr>' +
        '<td>' + escapeHtml(u.name || '-') + '</td>' +
        '<td><span class="phone-cell">' + escapeHtml(u.phone || '-') + '</span></td>' +
        '<td><span class="' + roleBadgeClass + '">' + escapeHtml(roleText) + '</span></td>' +
        '<td>' + escapeHtml(u.governorate || '-') + '</td>' +
        '<td>' + escapeHtml(ratingText) + '</td>' +
        '<td>' + escapeHtml(dateText) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  async function loadJobs() {
    var data = await api('/api/admin/jobs');
    var container = document.getElementById('jobsTable');
    if (!container) return;

    var jobs = (data.jobs || []).slice(0, 20);

    if (jobs.length === 0) {
      container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا يوجد فرص</p>';
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
  }

  return {
    connect: connect,
    loadHealth: loadHealth,
    loadUsers: loadUsers,
    loadJobs: loadJobs,
    loadStats: loadStats,
  };
})();
