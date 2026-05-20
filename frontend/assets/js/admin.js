// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/admin.js — Admin Dashboard Module (IIFE)
// ═══════════════════════════════════════════════════════════════

var AdminApp = (function () {
  'use strict';

  var token = '';
  var API = '';
  // Phase 47 — Bulk select state
  var bulkSelectedFlags = new Set();

  // Phase 48 — Admin SSE + cursor pagination state
  var adminSseSource = null;
  var auditSearchCursor = null;

  // Phase 49 — Trust Analytics dashboard state
  var trustPeriodDays = 7;

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

  function renderRecommendedActions(containerId, actions) {
    var el = document.getElementById(containerId);
    if (!el) return;

    actions = Array.isArray(actions) ? actions : [];

    if (actions.length === 0) {
      el.innerHTML =
        '<div class="recommended-actions recommended-actions--empty">' +
          '<div class="recommended-action-card recommended-action-card--ok">' +
            '<strong>✅ لا توجد إجراءات عاجلة</strong>' +
            '<p>كل المؤشرات الأساسية في هذا القسم تبدو مستقرة حالياً.</p>' +
          '</div>' +
        '</div>';
      return;
    }

    var top = actions.slice(0, 3);

    var html = '<div class="recommended-actions__title">الإجراءات المقترحة</div>';

    top.forEach(function (a) {
      var sev = a.severity || a.level || 'warning';
      var cls = sev === 'critical' || sev === 'error'
        ? 'recommended-action-card--critical'
        : (sev === 'info' ? 'recommended-action-card--info' : 'recommended-action-card--warning');

      var icon = sev === 'critical' || sev === 'error' ? '🚨' : (sev === 'info' ? 'ℹ️' : '⚠️');

      html += '<div class="recommended-action-card ' + cls + '">' +
        '<div class="recommended-action-card__header">' +
          '<strong>' + icon + ' ' + escapeHtml(a.label || 'راجع الحالة') + '</strong>' +
          '<span class="recommended-action-card__severity">' + escapeHtml(sev) + '</span>' +
        '</div>' +
        (a.reason ? '<p>' + escapeHtml(a.reason) + '</p>' : '') +
        (a.command ? '<code class="ops-command-chip">' + escapeHtml(a.command) + '</code>' : '') +
        (a.adminRoute ? '<small class="runbook-link">Admin route: ' + escapeHtml(a.adminRoute) + '</small>' : '') +
      '</div>';
    });

    if (actions.length > 3) {
      html += '<p class="ops-help-text">+' + (actions.length - 3) + ' إجراءات أخرى موجودة في التفاصيل أسفل الصفحة.</p>';
    }

    el.innerHTML = html;
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
      initAdminTabs();
      // Phase 48 — Connect to admin SSE channel
      connectAdminSse();
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
        loadProductionReadiness(),
        loadInstanceOps(),
        loadSchedulers(),
        loadOpsSlo(),
        loadRestoreDrills(),
        loadIncidents(),
        loadMaintenanceMode(),
        loadDirectOffersDashboard(),
        loadAbuseSignals(),
        loadPredictiveAbuseDashboard(),
        loadPredictivePrecision(),
        loadDecisionQuality(),
        loadOpsQueueStats(),
        loadAlertDeliveries(),
        loadAuditIndexStatus(),
        loadExports(),
        loadCounterHygiene(),
        loadTrustDashboard(),
        loadTrustCalibrationDashboard(),
        loadScaleHygiene(),
      ]).catch(function () {});
    } catch (err) {
      showError('توكن غير صحيح أو خطأ في الاتصال');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 48 — Admin SSE Channel
  // ═══════════════════════════════════════════════════════════════

  function connectAdminSse() {
    if (adminSseSource) return;
    if (!token) return;

    try {
      var url = '/api/admin/events?token=' + encodeURIComponent(token);
      adminSseSource = new EventSource(url);

      var statusEl = document.getElementById('adminSseStatus');

      adminSseSource.addEventListener('init', function (e) {
        if (statusEl) {
          statusEl.classList.remove('admin-sse-status--disconnected');
          statusEl.classList.add('admin-sse-status--connected');
          statusEl.title = 'متصل — استلام الأحداث الفورية';
        }
      });

      adminSseSource.addEventListener('abuse_flag:snooze_expiring', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('⏰ snooze flag ينتهي خلال ' + (data.hoursUntilExpiry || '?') + ' ساعة');
          }
          // Auto-refresh abuse signals
          if (typeof loadAbuseSignals === 'function') loadAbuseSignals();
        } catch (_) {}
      });

      adminSseSource.addEventListener('abuse_flag:snooze_expired', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.info('انتهى snooze لإشارة (' + (data.flagType || '?') + ')');
          }
          if (typeof loadAbuseSignals === 'function') loadAbuseSignals();
        } catch (_) {}
      });

      adminSseSource.addEventListener('abuse_flag:detected_high_severity', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('🚨 إشارة إساءة عالية: ' + (data.flagType || '?'));
          }
          if (typeof loadAbuseSignals === 'function') loadAbuseSignals();
        } catch (_) {}
      });

      adminSseSource.addEventListener('counters:auto_rebuild_triggered', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.info('🔄 counter file يُعاد بناؤه (size: ' + (data.sizeMB || '?') + 'MB)');
          }
        } catch (_) {}
      });

      adminSseSource.addEventListener('direct_offer:abuse_threshold_crossed', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('⚠️ تجاوز عتبة العروض المباشرة');
          }
          if (typeof loadAbuseSignals === 'function') loadAbuseSignals();
          if (typeof loadTrustDashboard === 'function') loadTrustDashboard();
        } catch (_) {}
      });

      // Phase 51 — Predictive Abuse Intelligence events
      adminSseSource.addEventListener('predictive_abuse:signal_created', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('🧠 إشارة خطر تنبؤية: ' + (data.riskType || '?'));
          }
          if (typeof loadPredictiveAbuseDashboard === 'function') loadPredictiveAbuseDashboard();
          if (typeof loadDecisionQuality === 'function') loadDecisionQuality();
        } catch (_) {}
      });

      adminSseSource.addEventListener('predictive_abuse:signal_escalated', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('🚨 تم تصعيد إشارة تنبؤية: ' + (data.riskType || '?'));
          }
          if (typeof loadPredictiveAbuseDashboard === 'function') loadPredictiveAbuseDashboard();
          if (typeof loadDecisionQuality === 'function') loadDecisionQuality();
        } catch (_) {}
      });

      adminSseSource.addEventListener('predictive_abuse:scan_failed', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('فشل فحص المخاطر التنبؤية');
          }
        } catch (_) {}
      });

      // Phase 52 — Ops Queue + Alert Delivery events
      adminSseSource.addEventListener('ops_queue:job_failed', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('فشلت وظيفة Queue: ' + (data.type || data.jobId || ''));
          }
          loadOpsQueueStats();
        } catch (_) {}
      });

      adminSseSource.addEventListener('ops_queue:job_dead_lettered', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('DLQ: وظيفة وصلت Dead Letter');
          }
          loadOpsQueueStats();
          loadDeadLetterJobs();
        } catch (_) {}
      });

      adminSseSource.addEventListener('alert_delivery:failed', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('فشل تسليم تنبيه أدمن — سيتم إعادة المحاولة');
          }
          loadAlertDeliveries();
        } catch (_) {}
      });

      adminSseSource.addEventListener('alert_delivery:dead_lettered', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('تنبيه أدمن وصل Dead Letter');
          }
          loadAlertDeliveries();
        } catch (_) {}
      });

      adminSseSource.addEventListener('export:job_completed', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.success('اكتمل تصدير الخلفية: ' + (data.exportId || ''));
          }
          loadExports();
          loadOpsQueueStats();
        } catch (_) {}
      });

      adminSseSource.addEventListener('export:job_failed', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('فشل تصدير الخلفية');
          }
          loadExports();
          loadOpsQueueStats();
        } catch (_) {}
      });

      // Phase 54 — Production Ops events
      adminSseSource.addEventListener('ops_slo:violated', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('⚠️ تم رصد مخالفة SLO تشغيلية');
          }
          loadOpsSlo();
          loadIncidents();
        } catch (_) {}
      });

      adminSseSource.addEventListener('incident:opened', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('🚨 تم فتح حادث تشغيلي جديد');
          }
          loadIncidents();
        } catch (_) {}
      });

      adminSseSource.addEventListener('incident:resolved', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.success('تم حل حادث تشغيلي');
          }
          loadIncidents();
        } catch (_) {}
      });

      adminSseSource.addEventListener('backup_restore_drill:passed', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.success('نجح Restore Drill للنسخة الاحتياطية');
          }
          loadRestoreDrills();
        } catch (_) {}
      });

      adminSseSource.addEventListener('backup_restore_drill:failed', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('فشل Restore Drill — راجع التفاصيل');
          }
          loadRestoreDrills();
          loadIncidents();
        } catch (_) {}
      });

      adminSseSource.addEventListener('process_lock:stale_recovered', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('تم استرداد قفل عملية stale');
          }
          loadInstanceOps();
        } catch (_) {}
      });

      adminSseSource.addEventListener('maintenance:enabled', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.warning('تم تفعيل وضع الصيانة');
          }
          loadMaintenanceMode();
        } catch (_) {}
      });

      adminSseSource.addEventListener('maintenance:disabled', function (e) {
        try {
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.success('تم تعطيل وضع الصيانة');
          }
          loadMaintenanceMode();
        } catch (_) {}
      });

      // Phase 55 — Scale Hygiene events
      [
        'queue:compaction_completed',
        'queue:compaction_failed',
        'queue:idempotency_cleanup_completed',
        'queue:slow_jobs_detected',
        'queue:health_verified',
        'queue:repair_completed',
        'queue:summary_rebuilt',
        'workroom_hygiene:compaction_completed',
        'workroom_hygiene:attachment_cleanup_completed',
        'workroom_hygiene:warning_detected',
        'workroom_search:verified',
        'audit_index:token_compaction_completed',
        'trust_retention:rollup_created',
        'predictive_archive_index:rebuilt',
        'scheduler:run_history_recorded',
        'scheduler:history_cleanup_completed',
        'marketplace_intelligence:rollup_captured',
        'search_analytics:rollup_completed',
        'activation_funnel:rollup_completed',
        'workroom_adoption:rollup_completed',
        'payment_dispute_analytics:rollup_completed',
      ].forEach(function (eventName) {
        adminSseSource.addEventListener(eventName, function (e) {
          try {
            if (eventName.indexOf('failed') !== -1 && typeof YawmiaToast !== 'undefined') {
              YawmiaToast.error('فشل حدث نظافة التوسع: ' + eventName);
            } else if (eventName.indexOf('warning') !== -1 && typeof YawmiaToast !== 'undefined') {
              YawmiaToast.warning('تحذير نظافة التوسع: ' + eventName);
            }

            if (eventName.indexOf('marketplace_intelligence') !== -1 ||
                eventName.indexOf('search_analytics') !== -1 ||
                eventName.indexOf('activation_funnel') !== -1 ||
                eventName.indexOf('workroom_adoption') !== -1 ||
                eventName.indexOf('payment_dispute_analytics') !== -1) {
              if (typeof loadMarketplaceIntelligence === 'function') loadMarketplaceIntelligence();
            }

            if (typeof loadScaleHygiene === 'function') loadScaleHygiene();
            if (typeof loadOpsQueueStats === 'function') loadOpsQueueStats();
          } catch (_) {}
        });
      });

      // Phase 49 — CSV export progress events
      adminSseSource.addEventListener('csv_export:progress', function (e) {
        try {
          var data = JSON.parse(e.data);
          renderCsvExportProgress(data);
        } catch (_) {}
      });

      adminSseSource.onerror = function () {
        // EventSource auto-reconnects natively
        if (statusEl) {
          statusEl.classList.remove('admin-sse-status--connected');
          statusEl.classList.add('admin-sse-status--disconnected');
          statusEl.title = 'محاولة إعادة الاتصال...';
        }
      };
    } catch (err) {
      console.error('Admin SSE connection failed', err);
    }
  }

  function renderAuditRow(e) {
    var date = e.createdAt ? new Date(e.createdAt).toLocaleString('ar-EG') : '-';
    var detailsStr = e.details ? JSON.stringify(e.details).substring(0, 80) : '-';
    return '<tr>' +
      '<td>' + escapeHtml(e.adminId || '') + '</td>' +
      '<td>' + escapeHtml(e.action || '') + '</td>' +
      '<td>' + escapeHtml((e.targetType || '') + ':' + (e.targetId || '')) + '</td>' +
      '<td>' + escapeHtml(date) + '</td>' +
      '<td><small>' + escapeHtml(detailsStr) + '</small></td>' +
      '</tr>';
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

  // Phase 47 + 48 — Audit log search with cursor pagination
  async function searchAuditLog(reset) {
    if (reset === undefined) reset = true;
    if (reset) auditSearchCursor = null;

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
      if (auditSearchCursor) query += '&cursor=' + encodeURIComponent(auditSearchCursor);

      var data = await api(query);
      var el = document.getElementById('auditLogResults');
      if (!el) return;

      // Phase 49 — cursor expired after audit retention cleanup.
      if (data.cursorExpired) {
        auditSearchCursor = null;
        if (typeof YawmiaToast !== 'undefined') {
          YawmiaToast.warning('الصفحة قديمة — تم إعادة التحميل من البداية');
        }
      }

      var entries = data.entries || [];

      if (reset) {
        // Fresh search — clear and render full structure
        if (entries.length === 0) {
          el.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا توجد نتائج</p>';
          auditSearchCursor = null;
          return;
        }

        var html = '<p style="margin-block-end:0.5rem;">عُثر على <strong>' + data.total + '</strong> سجل (يعرض ' + entries.length + ')</p>';
        html += '<table class="admin-table" id="auditTable"><thead><tr>' +
          '<th>الأدمن</th><th>الإجراء</th><th>الهدف</th><th>التاريخ</th><th>التفاصيل</th>' +
          '</tr></thead><tbody>';

        entries.forEach(function (e) {
          html += renderAuditRow(e);
        });

        html += '</tbody></table>';
        html += '<div id="auditLoadMoreContainer" style="text-align:center;margin-block-start:1rem;"></div>';
        el.innerHTML = html;
      } else {
        // Append rows to existing tbody
        var tbody = document.querySelector('#auditTable tbody');
        if (tbody) {
          entries.forEach(function (e) {
            tbody.insertAdjacentHTML('beforeend', renderAuditRow(e));
          });
        }
      }

      // Render or update Load More button
      var loadMoreContainer = document.getElementById('auditLoadMoreContainer');
      if (loadMoreContainer) {
        loadMoreContainer.innerHTML = '';
        if (data.hasMore && data.nextCursor) {
          auditSearchCursor = data.nextCursor;
          var btn = document.createElement('button');
          btn.className = 'btn btn--ghost btn--sm audit-load-more';
          btn.textContent = '🔽 تحميل المزيد';
          btn.addEventListener('click', function () { searchAuditLog(false); });
          loadMoreContainer.appendChild(btn);
        } else {
          auditSearchCursor = null;
        }
      }
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

  // ═══════════════════════════════════════════════════════════════
  // Phase 51 — Predictive Abuse Intelligence + Decision Quality
  // ═══════════════════════════════════════════════════════════════

  async function loadPredictiveAbuseDashboard() {
    var metricsEl = document.getElementById('predictiveAbuseMetrics');
    var signalsEl = document.getElementById('predictiveAbuseSignals');

    if (metricsEl) {
      metricsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }
    if (signalsEl) {
      signalsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }

    try {
      var data = await api('/api/admin/predictive-abuse/dashboard?status=active&limit=20');
      var metrics = data.metrics || {};

      if (metricsEl) {
        var cards = [
          { value: metrics.activeSignals || 0, label: 'إشارات نشطة' },
          { value: metrics.highOrCritical || 0, label: 'عالية/حرجة' },
          { value: Math.round((metrics.avgRiskScore || 0) * 100) + '%', label: 'متوسط الخطر' },
          { value: metrics.lastScanDurationMs || 0, label: 'مدة آخر فحص ms' },
        ];

        metricsEl.innerHTML = '';
        cards.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'trust-metric-card';
          card.innerHTML =
            '<div class="trust-metric-value">' + escapeHtml(String(c.value)) + '</div>' +
            '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
          metricsEl.appendChild(card);
        });
      }

      renderPredictiveSignals(data.signals || []);
    } catch (err) {
      if (metricsEl) metricsEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل المؤشرات</p>';
      if (signalsEl) signalsEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل الإشارات</p>';
    }
  }

  function renderPredictiveSignals(signals) {
    var el = document.getElementById('predictiveAbuseSignals');
    if (!el) return;

    if (!signals || signals.length === 0) {
      el.innerHTML = '<p style="color:var(--color-success);text-align:center;padding:1rem;">✓ لا توجد إشارات خطر تنبؤية نشطة</p>';
      return;
    }

    var riskLabels = {
      employer_decline_spike: 'ارتفاع مفاجئ في رفض/انتهاء عروض صاحب العمل',
      worker_offer_bombing_probability: 'احتمال ضغط عروض على عامل',
      same_worker_harassment_likelihood: 'احتمال مضايقة عامل بعروض متكررة',
      employer_toxic_offer_behavior: 'سلوك عروض سلبي لصاحب العمل',
      worker_reliability_anomaly: 'انحراف في موثوقية رد العامل',
    };

    var html = '';
    signals.forEach(function (s) {
      var sev = s.severity || 'medium';
      var scorePct = Math.round((s.riskScore || 0) * 100);

      html += '<div class="risk-signal-card risk-signal-card--' + escapeHtml(sev) + '">' +
        '<div class="risk-signal-card__header">' +
          '<div>' +
            '<strong>' + escapeHtml(riskLabels[s.riskType] || s.riskType || 'Signal') + '</strong>' +
            '<div style="font-size:0.8rem;color:var(--color-text-muted);margin-block-start:0.25rem;">' +
              escapeHtml(s.entityType || '') + ': <a href="/user.html?id=' + escapeHtml(s.entityId || '') + '" class="worker-link">' + escapeHtml(s.entityId || '-') + '</a>' +
              (s.relatedUserId ? ' · related: <a href="/user.html?id=' + escapeHtml(s.relatedUserId) + '" class="worker-link">' + escapeHtml(s.relatedUserId) + '</a>' : '') +
            '</div>' +
          '</div>' +
          '<span class="risk-score-pill risk-score-pill--' + escapeHtml(sev) + '">' + scorePct + '%</span>' +
        '</div>';

      if (s.explanations && s.explanations.length > 0) {
        html += '<ul class="risk-signal-card__explanations">';
        s.explanations.slice(0, 4).forEach(function (ex) {
          html += '<li>' + escapeHtml(ex) + '</li>';
        });
        html += '</ul>';
      }

      html += '<div class="risk-signal-card__actions">' +
        '<button class="btn btn--ghost btn--sm" onclick="AdminApp.dismissPredictiveSignal(\'' + escapeHtml(s.id) + '\')">رفض</button>' +
        '<button class="btn btn--primary btn--sm" onclick="AdminApp.escalatePredictiveSignal(\'' + escapeHtml(s.id) + '\')">تصعيد للمراجعة</button>' +
        '<button class="btn btn--ghost btn--sm" onclick="AdminApp.markPredictiveFalsePositive(\'' + escapeHtml(s.id) + '\')" style="color:var(--color-warning);border-color:var(--color-warning);">False Positive</button>' +
        '<button class="btn btn--success btn--sm" onclick="AdminApp.markPredictiveConfirmed(\'' + escapeHtml(s.id) + '\')">Confirmed</button>' +
      '</div>' +
      '</div>';
    });

    el.innerHTML = html;
  }

  async function runPredictiveAbuseScan() {
    try {
      if (typeof YawmiaToast !== 'undefined') {
        YawmiaToast.info('جاري تشغيل فحص المخاطر...');
      }

      var data = await apiWrite('POST', '/api/admin/predictive-abuse/run-scan?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') {
          YawmiaToast.success('تم وضع فحص المخاطر في الطابور — Job: ' + (data.queueJobId || ''));
        }
        loadOpsQueueStats();
        loadPredictiveAbuseDashboard();
        loadDecisionQuality();
      }
    } catch (err) {
      showError(err.message || 'خطأ في تشغيل الفحص');
    }
  }

  async function dismissPredictiveSignal(signalId) {
    try {
      var note = await YawmiaModal.prompt({
        title: 'رفض الإشارة',
        message: 'ملاحظة اختيارية لسبب الرفض',
        placeholder: 'مثال: نشاط طبيعي أو false positive...',
      });
      if (note === null) note = '';

      await apiWrite('POST', '/api/admin/predictive-abuse/signals/' + signalId + '/dismiss', { note: note });

      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم رفض الإشارة');
      loadPredictiveAbuseDashboard();
      loadDecisionQuality();
    } catch (err) {
      showError(err.message || 'خطأ في رفض الإشارة');
    }
  }

  async function escalatePredictiveSignal(signalId) {
    try {
      var note = await YawmiaModal.prompt({
        title: 'تصعيد الإشارة',
        message: 'اكتب سبب التصعيد أو الإجراء المطلوب',
        placeholder: 'مثال: يحتاج مراجعة فورية...',
        required: false,
      });
      if (note === null) return;

      await apiWrite('POST', '/api/admin/predictive-abuse/signals/' + signalId + '/escalate', { note: note });

      if (typeof YawmiaToast !== 'undefined') YawmiaToast.warning('تم تصعيد الإشارة');
      loadPredictiveAbuseDashboard();
      loadDecisionQuality();
    } catch (err) {
      showError(err.message || 'خطأ في تصعيد الإشارة');
    }
  }

  async function loadPredictivePrecision() {
    var el = document.getElementById('predictivePrecisionMetrics');
    if (!el) return;

    el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';

    try {
      var data = await api('/api/admin/predictive-abuse/precision');
      var stats = data.stats || {};
      var byStatus = stats.byStatus || {};

      var cards = [
        { value: stats.total || 0, label: 'إجمالي الإشارات' },
        { value: byStatus.active || 0, label: 'نشطة' },
        { value: byStatus.confirmed || 0, label: 'Confirmed' },
        { value: byStatus.false_positive || 0, label: 'False Positive' },
        { value: (stats.precisionRate || 0) + '%', label: 'Precision' },
        { value: (stats.falsePositiveRate || 0) + '%', label: 'False Positive Rate' },
      ];

      el.innerHTML = '';
      cards.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'trust-metric-card';
        card.innerHTML =
          '<div class="trust-metric-value">' + escapeHtml(String(c.value)) + '</div>' +
          '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
        el.appendChild(card);
      });
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل دقة الإشارات</p>';
    }
  }

  async function runPredictiveSignalRetention() {
    try {
      var data = await apiWrite('POST', '/api/admin/predictive-abuse/retention/run?async=1', { force: false });

      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') {
          YawmiaToast.success('تم وضع Predictive Retention في الطابور — Job: ' + (data.queueJobId || ''));
        }
        loadOpsQueueStats();
        loadPredictivePrecision();
      }
    } catch (err) {
      showError(err.message || 'خطأ في تشغيل retention');
    }
  }

  async function markPredictiveFalsePositive(signalId) {
    try {
      var note = await YawmiaModal.prompt({
        title: 'False Positive',
        message: 'اكتب سبب اعتبار الإشارة false positive',
        placeholder: 'مثال: نشاط طبيعي أو بيانات غير كافية...',
      });
      if (note === null) note = '';

      await apiWrite('POST', '/api/admin/predictive-abuse/signals/' + signalId + '/false-positive', { note: note });

      if (typeof YawmiaToast !== 'undefined') YawmiaToast.warning('تم تعليم الإشارة كـ False Positive');
      loadPredictiveAbuseDashboard();
      loadPredictivePrecision();
      loadDecisionQuality();
    } catch (err) {
      showError(err.message || 'خطأ في تحديث الإشارة');
    }
  }

  async function markPredictiveConfirmed(signalId) {
    try {
      var note = await YawmiaModal.prompt({
        title: 'Confirmed Signal',
        message: 'اكتب ملاحظة اختيارية عن تأكيد الإشارة',
        placeholder: 'مثال: الإشارة تطابقت مع سلوك مؤكد...',
      });
      if (note === null) note = '';

      await apiWrite('POST', '/api/admin/predictive-abuse/signals/' + signalId + '/confirm', { note: note });

      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم تأكيد الإشارة');
      loadPredictiveAbuseDashboard();
      loadPredictivePrecision();
      loadDecisionQuality();
    } catch (err) {
      showError(err.message || 'خطأ في تأكيد الإشارة');
    }
  }

  async function loadDecisionQuality() {
    var metricsEl = document.getElementById('decisionQualityMetrics');
    var backlogEl = document.getElementById('backlogPriorityTable');

    if (metricsEl) {
      metricsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }
    if (backlogEl) {
      backlogEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }

    try {
      var data = await api('/api/admin/trust/decision-quality');

      var warning = data.warningEffectiveness || {};
      var calibration = data.calibration || {};
      var backlog = data.backlogSummary || {};

      if (metricsEl) {
        var cards = [
          { value: warning.totalWarnings || 0, label: 'تحذيرات مرسلة' },
          { value: (warning.effectivenessRate || 0) + '%', label: 'فعالية التحذير' },
          { value: (warning.conversionRate || 0) + '%', label: 'تحذير → إجراء' },
          { value: calibration.avgCalibrationScore || 0, label: 'متوسط calibration' },
          { value: backlog.total || 0, label: 'عناصر backlog' },
          { value: backlog.highPriority || 0, label: 'أولوية عالية' },
        ];

        metricsEl.innerHTML = '';
        cards.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'trust-metric-card';
          card.innerHTML =
            '<div class="trust-metric-value">' + escapeHtml(String(c.value)) + '</div>' +
            '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
          metricsEl.appendChild(card);
        });
      }

      await loadBacklogPriority();
    } catch (err) {
      if (metricsEl) metricsEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل جودة القرارات</p>';
      if (backlogEl) backlogEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل أولوية المراجعة</p>';
    }
  }

  async function loadBacklogPriority() {
    var el = document.getElementById('backlogPriorityTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/trust/backlog-priority?limit=20');
      var items = data.items || [];

      if (items.length === 0) {
        el.innerHTML = '<p style="color:var(--color-success);text-align:center;padding:1rem;">✓ لا توجد عناصر مراجعة عاجلة</p>';
        return;
      }

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>النوع</th><th>الخطر</th><th>الأولوية</th><th>المستخدم</th><th>العمر</th><th>شرح</th>' +
      '</tr></thead><tbody>';

      items.forEach(function (item) {
        html += '<tr>' +
          '<td>' + escapeHtml(item.type || '-') + '<br><small>' + escapeHtml(item.riskType || '') + '</small></td>' +
          '<td><span class="risk-score-pill risk-score-pill--' + escapeHtml(item.severity || 'medium') + '">' + Math.round((item.riskScore || 0) * 100) + '%</span></td>' +
          '<td>' + Math.round((item.priorityScore || 0) * 100) + '%</td>' +
          '<td><a href="/user.html?id=' + escapeHtml(item.entityId || '') + '" class="worker-link">' + escapeHtml(item.entityId || '-') + '</a></td>' +
          '<td>' + escapeHtml(String(item.ageHours || 0)) + ' س</td>' +
          '<td><small>' + escapeHtml((item.explanations || []).slice(0, 2).join(' · ')) + '</small></td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل أولوية المراجعة</p>';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 52 — Ops Queue + Alert Delivery + Async Export
  // ═══════════════════════════════════════════════════════════════

  function queueStatusBadge(status) {
    var s = status || 'pending';
    return '<span class="queue-status-badge queue-status-badge--' + escapeHtml(s) + '">' + escapeHtml(s) + '</span>';
  }

  function deliveryStatusBadge(status) {
    var s = status || 'queued';
    return '<span class="alert-delivery-status-badge alert-delivery-status-badge--' + escapeHtml(s) + '">' + escapeHtml(s) + '</span>';
  }

  async function loadOpsQueueStats() {
    var statsEl = document.getElementById('opsQueueStats');
    if (statsEl) statsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';

    try {
      var data = await api('/api/admin/ops-queue/stats');
      var stats = data.stats || {};
      var byStatus = stats.byStatus || {};
      var workers = data.workers || {};

      if (statsEl) {
        var cards = [
          { value: byStatus.pending || 0, label: 'Pending' },
          { value: byStatus.running || 0, label: 'Running' },
          { value: byStatus.completed || 0, label: 'Completed' },
          { value: byStatus.failed || 0, label: 'Failed' },
          { value: byStatus['dead-letter'] || 0, label: 'Dead Letter' },
          { value: workers.activeCount || 0, label: 'Active Workers' },
        ];

        statsEl.innerHTML = '';
        cards.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'trust-metric-card';
          card.innerHTML =
            '<div class="trust-metric-value">' + escapeHtml(String(c.value)) + '</div>' +
            '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
          statsEl.appendChild(card);
        });
      }

      loadOpsQueueJobs();
    } catch (err) {
      if (statsEl) statsEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل حالة الطابور</p>';
    }
  }

  async function loadOpsQueueJobs() {
    var el = document.getElementById('opsQueueJobsTable');
    if (!el) return;

    try {
      var statusEl = document.getElementById('opsQueueStatusFilter');
      var status = statusEl ? statusEl.value : '';

      var url = '/api/admin/ops-queue/jobs?limit=20';
      if (status) url += '&status=' + encodeURIComponent(status);

      var data = await api(url);
      renderQueueJobsTable(el, data.jobs || [], false);
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل وظائف الطابور</p>';
    }
  }

  async function loadDeadLetterJobs() {
    var el = document.getElementById('opsQueueJobsTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/ops-queue/dead-letter?limit=20');
      renderQueueJobsTable(el, data.jobs || [], true);
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل DLQ</p>';
    }
  }

  function renderQueueJobsTable(el, jobs, isDlq) {
    if (!jobs || jobs.length === 0) {
      el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد وظائف</p>';
      return;
    }

    var html = '<table class="admin-table"><thead><tr>' +
      '<th>Job</th><th>النوع</th><th>الحالة</th><th>الأولوية</th><th>محاولات</th><th>Next Run</th><th>خطأ</th><th>إجراء</th>' +
      '</tr></thead><tbody>';

    jobs.forEach(function (j) {
      var nextRun = j.nextRunAt ? new Date(j.nextRunAt).toLocaleString('ar-EG') : '-';
      var errText = j.lastError ? String(j.lastError).slice(0, 60) : '-';

      var actions = '';
      if (j.status === 'failed' || j.status === 'dead-letter' || isDlq || j.status === 'cancelled') {
        actions += '<button class="btn btn--primary btn--sm" onclick="AdminApp.retryQueueJob(\'' + escapeHtml(j.id) + '\')">Retry</button> ';
      }
      if (j.status === 'pending' || j.status === 'running') {
        actions += '<button class="btn btn--ghost btn--sm" style="color:var(--color-error);border-color:var(--color-error);" onclick="AdminApp.cancelQueueJob(\'' + escapeHtml(j.id) + '\')">Cancel</button>';
      }

      html += '<tr>' +
        '<td><small>' + escapeHtml(j.id || '') + '</small></td>' +
        '<td>' + escapeHtml(j.type || '-') + '</td>' +
        '<td>' + queueStatusBadge(j.status) + '</td>' +
        '<td>' + escapeHtml(j.priority || 'normal') + '</td>' +
        '<td>' + escapeHtml(String(j.attempts || 0)) + '/' + escapeHtml(String(j.maxAttempts || 0)) + '</td>' +
        '<td><small>' + escapeHtml(nextRun) + '</small></td>' +
        '<td><small>' + escapeHtml(errText) + '</small></td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  }

  async function retryQueueJob(id) {
    try {
      await apiWrite('POST', '/api/admin/ops-queue/jobs/' + id + '/retry', {});
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تمت إعادة وظيفة الطابور');
      loadOpsQueueStats();
    } catch (err) {
      showError(err.message || 'خطأ في retry');
    }
  }

  async function cancelQueueJob(id) {
    var confirmed = await YawmiaModal.confirm({
      title: 'إلغاء وظيفة الطابور',
      message: 'متأكد إنك عايز تلغي الوظيفة؟',
      confirmText: 'إلغاء الوظيفة',
      cancelText: 'رجوع',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await apiWrite('POST', '/api/admin/ops-queue/jobs/' + id + '/cancel', { reason: 'cancelled_from_admin_ui' });
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم إلغاء الوظيفة');
      loadOpsQueueStats();
    } catch (err) {
      showError(err.message || 'خطأ في cancel');
    }
  }

  async function loadAlertDeliveries() {
    await loadAlertDeliveryHealth();

    var el = document.getElementById('alertDeliveriesTable');
    if (!el) return;

    try {
      var statusEl = document.getElementById('alertDeliveryStatusFilter');
      var status = statusEl ? statusEl.value : '';

      var url = '/api/admin/alerts/deliveries?limit=20';
      if (status) url += '&status=' + encodeURIComponent(status);

      var data = await api(url);
      var rows = data.deliveries || [];

      if (rows.length === 0) {
        el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد سجلات تسليم</p>';
        return;
      }

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>Delivery</th><th>Event</th><th>Channel</th><th>Status</th><th>Attempts</th><th>Created</th><th>Action</th>' +
      '</tr></thead><tbody>';

      rows.forEach(function (d) {
        var attempts = Array.isArray(d.attempts) ? d.attempts.length : 0;
        var created = d.createdAt ? new Date(d.createdAt).toLocaleString('ar-EG') : '-';
        var actions = '';

        if (d.status === 'failed' || d.status === 'dead-letter') {
          actions += '<button class="btn btn--primary btn--sm" onclick="AdminApp.retryAlertDelivery(\'' + escapeHtml(d.id) + '\')">Retry</button>';
        }

        html += '<tr>' +
          '<td><small>' + escapeHtml(d.id || '') + '</small></td>' +
          '<td><small>' + escapeHtml(d.eventType || '-') + '</small></td>' +
          '<td>' + escapeHtml(d.channel || '-') + '</td>' +
          '<td>' + deliveryStatusBadge(d.status) + '</td>' +
          '<td>' + attempts + '</td>' +
          '<td><small>' + escapeHtml(created) + '</small></td>' +
          '<td>' + actions + '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل سجل التسليم</p>';
    }
  }

  async function loadAlertDeliveryHealth() {
    var el = document.getElementById('alertDeliveryHealth');
    if (!el) return;

    try {
      var data = await api('/api/admin/alerts/health');
      var stats = data.stats || {};
      var byStatus = stats.byStatus || {};

      var cards = [
        { value: stats.total || 0, label: 'إجمالي التسليمات' },
        { value: byStatus.queued || 0, label: 'Queued' },
        { value: byStatus.delivered || 0, label: 'Delivered' },
        { value: byStatus.failed || 0, label: 'Failed' },
        { value: byStatus['dead-letter'] || 0, label: 'Dead Letter' },
        { value: (stats.deliveredRate || 0) + '%', label: 'Delivery Rate' },
      ];

      el.innerHTML = '';
      cards.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'trust-metric-card';
        card.innerHTML =
          '<div class="trust-metric-value">' + escapeHtml(String(c.value)) + '</div>' +
          '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
        el.appendChild(card);
      });
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل صحة التنبيهات</p>';
    }
  }

  async function retryAlertDelivery(id) {
    try {
      await apiWrite('POST', '/api/admin/alerts/deliveries/' + id + '/retry', {});
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تمت إعادة تسليم التنبيه');
      loadAlertDeliveries();
    } catch (err) {
      showError(err.message || 'خطأ في retry alert delivery');
    }
  }

  async function createAuditExportJob() {
    try {
      var fromEl = document.getElementById('auditFromDate');
      var toEl = document.getElementById('auditToDate');
      var actionEl = document.getElementById('auditActionFilter');

      var body = {};
      if (fromEl && fromEl.value) body.from = fromEl.value;
      if (toEl && toEl.value) body.to = toEl.value + 'T23:59:59';
      if (actionEl && actionEl.value) body.action = actionEl.value;

      var data = await apiWrite('POST', '/api/admin/exports/audit-log', body);

      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') {
          YawmiaToast.success('تم إنشاء تصدير بالخلفية: ' + data.exportId);
        }
        loadExports();
        loadOpsQueueStats();
      }
    } catch (err) {
      showError(err.message || 'خطأ في إنشاء تصدير الخلفية');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 50 — Audit Index + Export Registry + Counter Hygiene
  // ═══════════════════════════════════════════════════════════════

  async function loadAuditIndexStatus() {
    var el = document.getElementById('auditIndexStatus');
    if (!el) return;

    try {
      var data = await api('/api/admin/audit-index/status');
      var idx = data.auditIndex || {};

      var statusClass = idx.status === 'healthy'
        ? 'admin-health-pill--ok'
        : (idx.status === 'stale' ? 'admin-health-pill--warn' : 'admin-health-pill--bad');

      el.innerHTML =
        '<div class="health-row">' +
          '<span class="health-row__label">الحالة</span>' +
          '<span class="admin-health-pill ' + statusClass + '">' + escapeHtml(idx.status || 'unknown') + '</span>' +
        '</div>' +
        '<div class="health-row">' +
          '<span class="health-row__label">عدد السجلات المفهرسة</span>' +
          '<span class="health-row__value">' + escapeHtml(String(idx.recordCount || 0)) + '</span>' +
        '</div>' +
        '<div class="health-row">' +
          '<span class="health-row__label">آخر بناء</span>' +
          '<span class="health-row__value">' + escapeHtml(idx.lastBuiltAt ? new Date(idx.lastBuiltAt).toLocaleString('ar-EG') : '-') + '</span>' +
        '</div>' +
        '<div class="health-row">' +
          '<span class="health-row__label">Stale</span>' +
          '<span class="health-row__value">' + (idx.stale ? 'نعم — ' + escapeHtml(idx.staleReason || '') : 'لا') + '</span>' +
        '</div>';
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل حالة الفهرس</p>';
    }
  }

  async function rebuildAuditIndex() {
    var resultEl = document.getElementById('auditIndexActionResult');
    if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-text-muted);">جاري إضافة إعادة بناء الفهرس للطابور...</p>';

    try {
      var data = await apiWrite('POST', '/api/admin/audit-index/rebuild?async=1', {});
      if (resultEl) {
        resultEl.innerHTML =
          '<p style="color:var(--color-success);">✓ تم وضع إعادة بناء الفهرس في الطابور — Job: ' +
          escapeHtml(data.queueJobId || '') +
          '</p>';
      }
      loadAuditIndexStatus();
      loadOpsQueueStats();
    } catch (err) {
      if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-error);">خطأ: ' + escapeHtml(err.message || '') + '</p>';
    }
  }

  async function verifyAuditIndex() {
    var resultEl = document.getElementById('auditIndexActionResult');
    if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-text-muted);">جاري فحص الفهرس...</p>';

    try {
      var data = await apiWrite('POST', '/api/admin/audit-index/verify', {});
      if (resultEl) {
        if (data.ok && (!data.warnings || data.warnings.length === 0)) {
          resultEl.innerHTML = '<p style="color:var(--color-success);">✓ الفهرس سليم — تم فحص ' + escapeHtml(String(data.checked || 0)) + ' سجل</p>';
        } else {
          var warnings = data.warnings || [];
          resultEl.innerHTML =
            '<p style="color:var(--color-warning);">⚠️ تحذيرات: ' + warnings.length + '</p>' +
            '<ul style="font-size:0.8rem;color:var(--color-text-muted);">' +
            warnings.slice(0, 5).map(function (w) { return '<li>' + escapeHtml(w) + '</li>'; }).join('') +
            '</ul>';
        }
      }
      loadAuditIndexStatus();
    } catch (err) {
      if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-error);">خطأ: ' + escapeHtml(err.message || '') + '</p>';
    }
  }

  async function loadExports() {
    var el = document.getElementById('exportsTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/exports?limit=20');
      var rows = data.exports || [];

      if (rows.length === 0) {
        el.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">لا توجد تصديرات بعد</p>';
        return;
      }

      var statusLabels = {
        pending: 'في الانتظار',
        running: 'جاري',
        completed: 'مكتمل',
        failed: 'فشل',
        cancelled: 'ملغي',
        expired: 'منتهي',
      };

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>المعرّف</th><th>النوع</th><th>الحالة</th><th>التقدم</th><th>الصفوف</th><th>التاريخ</th><th>إجراء</th>' +
        '</tr></thead><tbody>';

      rows.forEach(function (x) {
        var status = x.status || 'pending';
        var canDownload = status === 'completed' && x.filePath;
        var canCancel = status === 'pending' || status === 'running';

        var actions = '';
        if (canDownload) {
          actions += '<button class="btn btn--ghost btn--sm" onclick="AdminApp.downloadExport(\'' + escapeHtml(x.id) + '\')">تحميل</button> ';
        }
        if (canCancel) {
          actions += '<button class="btn btn--ghost btn--sm" style="color:var(--color-error);border-color:var(--color-error);" onclick="AdminApp.cancelExport(\'' + escapeHtml(x.id) + '\')">إلغاء</button>';
        }

        html += '<tr>' +
          '<td><small>' + escapeHtml(x.id || '') + '</small></td>' +
          '<td>' + escapeHtml(x.type || '-') + '</td>' +
          '<td><span class="export-status-badge export-status-badge--' + escapeHtml(status) + '">' + escapeHtml(statusLabels[status] || status) + '</span></td>' +
          '<td>' + escapeHtml(String(x.percentage || 0)) + '%</td>' +
          '<td>' + escapeHtml(String(x.rowsProcessed || 0)) + '/' + escapeHtml(String(x.totalEstimate || 0)) + '</td>' +
          '<td>' + escapeHtml(x.createdAt ? new Date(x.createdAt).toLocaleString('ar-EG') : '-') + '</td>' +
          '<td>' + actions + '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل سجل التصديرات</p>';
    }
  }

  async function cancelExport(exportId) {
    var confirmed = await YawmiaModal.confirm({
      title: 'إلغاء التصدير',
      message: 'متأكد إنك عايز تلغي هذا التصدير؟',
      confirmText: 'إلغاء',
      cancelText: 'رجوع',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await apiWrite('POST', '/api/admin/exports/' + exportId + '/cancel', {});
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم طلب إلغاء التصدير');
      loadExports();
    } catch (err) {
      showError(err.message || 'خطأ في إلغاء التصدير');
    }
  }

  function downloadExport(exportId) {
    var url = API + '/api/admin/exports/' + encodeURIComponent(exportId) + '/download?_token=' + encodeURIComponent(token);
    var link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function loadCounterHygiene() {
    var el = document.getElementById('counterHygieneInfo');
    if (!el) return;

    try {
      var data = await api('/api/admin/counters/hygiene');
      var mb = data.fileSizeMB || 0;
      var sizeClass = mb >= 70 ? 'counter-size-critical' : (mb >= 40 ? 'counter-size-warning' : '');
      var last = data.lastCompaction || null;

      el.innerHTML =
        '<div class="health-row">' +
          '<span class="health-row__label">حجم ملف العدادات</span>' +
          '<span class="health-row__value ' + sizeClass + '">' + escapeHtml(String(mb)) + ' MB</span>' +
        '</div>' +
        '<div class="health-row">' +
          '<span class="health-row__label">آخر ضغط</span>' +
          '<span class="health-row__value">' + escapeHtml(last && last.completedAt ? new Date(last.completedAt).toLocaleString('ar-EG') : '-') + '</span>' +
        '</div>' +
        '<div class="health-row">' +
          '<span class="health-row__label">أرشفة آخر تشغيل</span>' +
          '<span class="health-row__value">' +
            escapeHtml(last ? ((last.archivedEmployers || 0) + ' أصحاب عمل، ' + (last.archivedWorkers || 0) + ' عمال') : '-') +
          '</span>' +
        '</div>';
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل حالة العدادات</p>';
    }
  }

  async function compactCounters() {
    var resultEl = document.getElementById('counterHygieneActionResult');
    if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-text-muted);">جاري ضغط العدادات...</p>';

    try {
      var data = await apiWrite('POST', '/api/admin/counters/compact?async=1', {});

      if (resultEl) {
        resultEl.innerHTML =
          '<p style="color:var(--color-success);">✓ تم وضع ضغط العدادات في الطابور — Job: ' +
          escapeHtml(data.queueJobId || '') +
          '</p>';
      }

      loadCounterHygiene();
      loadOpsQueueStats();
    } catch (err) {
      if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-error);">خطأ: ' + escapeHtml(err.message || '') + '</p>';
    }
  }

  async function rebuildCounters() {
    var resultEl = document.getElementById('counterHygieneActionResult');
    if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-text-muted);">جاري إضافة إعادة البناء للطابور...</p>';

    try {
      var data = await apiWrite('POST', '/api/admin/counters/rebuild?async=1', {});

      if (resultEl) {
        resultEl.innerHTML =
          '<p style="color:var(--color-success);">✓ تم وضع إعادة بناء العدادات في الطابور — Job: ' +
          escapeHtml(data.queueJobId || '') +
          '</p>';
      }

      loadCounterHygiene();
      loadOpsQueueStats();
    } catch (err) {
      if (resultEl) resultEl.innerHTML = '<p style="color:var(--color-error);">خطأ: ' + escapeHtml(err.message || '') + '</p>';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 49 — Trust Analytics Dashboard
  // ═══════════════════════════════════════════════════════════════

  function setTrustPeriod(days) {
    trustPeriodDays = days || 7;

    var selector = document.getElementById('trustPeriodSelector');
    if (selector) {
      selector.querySelectorAll('button[data-days]').forEach(function (btn) {
        var isActive = parseInt(btn.getAttribute('data-days'), 10) === trustPeriodDays;
        if (isActive) {
          btn.classList.add('btn--primary');
          btn.classList.remove('btn--ghost');
        } else {
          btn.classList.remove('btn--primary');
          btn.classList.add('btn--ghost');
        }
      });
    }

    loadTrustDashboard();
  }

  function getTrustPeriod() {
    var toDate = new Date();
    var fromDate = new Date(Date.now() - trustPeriodDays * 24 * 60 * 60 * 1000);
    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }

  function formatDuration(ms) {
    if (!ms || ms <= 0) return '-';
    var sec = Math.round(ms / 1000);
    if (sec < 60) return sec + ' ث';
    var min = Math.round(sec / 60);
    if (min < 60) return min + ' د';
    var hr = Math.round(min / 60);
    if (hr < 24) return hr + ' س';
    var days = Math.round(hr / 24);
    return days + ' يوم';
  }

  async function loadTrustDashboard() {
    var period = getTrustPeriod();

    try {
      var data = await api(
        '/api/admin/trust/dashboard?from=' +
        encodeURIComponent(period.from) +
        '&to=' +
        encodeURIComponent(period.to)
      );

      if (!data || !data.ok) {
        throw new Error('TRUST_DASHBOARD_FAILED');
      }

      renderTrustMetrics(data);
      renderResolutionHistogram(data.histogram || []);
      renderPerAdminTable(data.perAdmin || []);
      renderAbuseTrendChart(data.abuseTrend || []);
    } catch (err) {
      var grid = document.getElementById('trustMetricsGrid');
      if (grid) {
        grid.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">خطأ في تحميل تحليلات الثقة</p>';
      }
    }
  }

  function renderTrustMetrics(data) {
    var grid = document.getElementById('trustMetricsGrid');
    if (!grid) return;

    var avgResolution = data.avgResolution || {};
    var warningConversion = data.warningConversion || {};
    var perAdmin = data.perAdmin || [];
    var abuseTrend = data.abuseTrend || [];

    var totalDetected = abuseTrend.reduce(function (sum, row) {
      return sum + (row.totalDetected || 0);
    }, 0);

    var cards = [
      { value: formatDuration(avgResolution.avgMs || 0), label: 'متوسط وقت الحل' },
      { value: formatDuration(avgResolution.p95Ms || 0), label: 'P95 وقت الحل' },
      { value: (warningConversion.conversionRate || 0) + '%', label: 'تحذير → حظر' },
      { value: String(perAdmin.length || 0), label: 'أدمن نشطين' },
      { value: String(totalDetected || 0), label: 'إشارات في الفترة' },
    ];

    grid.innerHTML = '';
    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'trust-metric-card';
      card.innerHTML =
        '<div class="trust-metric-value">' + escapeHtml(String(c.value)) + '</div>' +
        '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
      grid.appendChild(card);
    });
  }

  function renderResolutionHistogram(histogram) {
    var el = document.getElementById('resolutionHistogramChart');
    if (!el) return;

    if (!histogram || histogram.length === 0) {
      el.innerHTML = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">توزيع وقت الحل</h3><p style="color:var(--color-text-muted);text-align:center;">لا توجد بيانات</p>';
      return;
    }

    var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">توزيع وقت الحل</h3>';
    histogram.forEach(function (b) {
      html += '<div class="rating-dist-row">' +
        '<span class="rating-dist-label">' + escapeHtml(b.bucket || '') + '</span>' +
        '<div class="rating-dist-bar"><div class="rating-dist-fill" style="width:' + (b.percentage || 0) + '%;"></div></div>' +
        '<span class="rating-dist-count">' + (b.count || 0) + ' (' + (b.percentage || 0) + '%)</span>' +
      '</div>';
    });

    el.innerHTML = html;
  }

  function renderPerAdminTable(perAdmin) {
    var el = document.getElementById('perAdminTable');
    if (!el) return;

    if (!perAdmin || perAdmin.length === 0) {
      el.innerHTML = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">إنتاجية الأدمن</h3><p style="color:var(--color-text-muted);text-align:center;">لا توجد مراجعات في الفترة</p>';
      return;
    }

    var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">إنتاجية الأدمن</h3>';
    html += '<table class="admin-table"><thead><tr>' +
      '<th>الأدمن</th><th>إجمالي</th><th>رفض</th><th>تأجيل</th><th>تحذير</th><th>إجراء</th><th>متوسط القرار</th>' +
      '</tr></thead><tbody>';

    perAdmin.forEach(function (a) {
      var byDecision = a.byDecision || {};
      html += '<tr>' +
        '<td>' + escapeHtml(a.adminId || 'unknown') + '</td>' +
        '<td>' + (a.totalReviews || 0) + '</td>' +
        '<td>' + (byDecision.dismissed || 0) + '</td>' +
        '<td>' + (byDecision.snoozed || 0) + '</td>' +
        '<td>' + (byDecision.warning || 0) + '</td>' +
        '<td>' + (byDecision.actioned || 0) + '</td>' +
        '<td>' + escapeHtml(formatDuration(a.avgTimeToDecisionMs || 0)) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderAbuseTrendChart(trend) {
    var el = document.getElementById('abuseTrendChart');
    if (!el) return;

    if (!trend || trend.length === 0) {
      el.innerHTML = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">اتجاه إشارات الإساءة</h3><p style="color:var(--color-text-muted);text-align:center;">لا توجد بيانات</p>';
      return;
    }

    var width = 640;
    var height = 220;
    var padding = 24;
    var maxVal = Math.max.apply(null, trend.map(function (d) { return d.totalDetected || 0; }));
    if (maxVal <= 0) maxVal = 1;

    var points = trend.map(function (d, i) {
      var x = padding + (trend.length === 1 ? 0 : (i / (trend.length - 1)) * (width - padding * 2));
      var y = height - padding - ((d.totalDetected || 0) / maxVal) * (height - padding * 2);
      return x + ',' + y;
    }).join(' ');

    var circles = trend.map(function (d, i) {
      var x = padding + (trend.length === 1 ? 0 : (i / (trend.length - 1)) * (width - padding * 2));
      var y = height - padding - ((d.totalDetected || 0) / maxVal) * (height - padding * 2);
      return '<circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--color-primary)"><title>' +
        escapeHtml(d.date + ': ' + (d.totalDetected || 0)) +
      '</title></circle>';
    }).join('');

    var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">اتجاه إشارات الإساءة</h3>';
    html += '<div class="abuse-trend-chart-wrap">';
    html += '<svg class="abuse-trend-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="اتجاه إشارات الإساءة">' +
      '<line x1="' + padding + '" y1="' + (height - padding) + '" x2="' + (width - padding) + '" y2="' + (height - padding) + '" stroke="var(--color-border)" />' +
      '<line x1="' + padding + '" y1="' + padding + '" x2="' + padding + '" y2="' + (height - padding) + '" stroke="var(--color-border)" />' +
      '<polyline points="' + points + '" fill="none" stroke="var(--color-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />' +
      circles +
    '</svg>';
    html += '</div>';

    el.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 49 — CSV Export Progress
  // ═══════════════════════════════════════════════════════════════

  function renderCsvExportProgress(data) {
    if (!data) return;

    var container = document.getElementById('csvExportProgressContainer');
    var fill = document.getElementById('csvProgressFill');
    var text = document.getElementById('csvProgressText');

    if (container) container.classList.remove('hidden');

    var pct = typeof data.percentage === 'number' ? data.percentage : 0;
    if (fill) fill.style.width = pct + '%';

    if (text) {
      var rowsText = data.rowsProcessed != null ? ' — ' + data.rowsProcessed + ' صف' : '';
      text.textContent = pct + '%' + rowsText;
    }

    if (data.completed) {
      if (fill) fill.style.width = '100%';
      if (text) text.textContent = '100% — اكتمل التصدير';

      // Phase 50/52: refresh persistent export registry + queue view after completion.
      try {
        if (typeof loadExports === 'function') loadExports();
        if (typeof loadOpsQueueStats === 'function') loadOpsQueueStats();
      } catch (_) {}

      setTimeout(function () {
        if (container) container.classList.add('hidden');
        if (fill) fill.style.width = '0%';
        if (text) text.textContent = '0%';
      }, 3000);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 53 — Trust Calibration Dashboard
  // ═══════════════════════════════════════════════════════════════

  async function loadTrustCalibrationDashboard() {
    var metricsEl = document.getElementById('trustCalibrationMetrics');
    var warningsEl = document.getElementById('trustCalibrationWarnings');
    var snapshotsEl = document.getElementById('trustSnapshotsTable');

    if (metricsEl) {
      metricsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }
    if (warningsEl) {
      warningsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }
    if (snapshotsEl) {
      snapshotsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }

    try {
      var data = await api('/api/admin/trust/calibration/dashboard');
      var metrics = data.metrics || {};
      var latestReport = data.latestReport || null;

      if (metricsEl) {
        var cards = [
          { value: metrics.snapshotCount || 0, label: 'Snapshots' },
          { value: metrics.reportCount || 0, label: 'تقارير معايرة' },
          { value: metrics.latestSampleCount || 0, label: 'عينات آخر تقرير' },
          { value: metrics.driftWarningCount || 0, label: 'تحذيرات Drift' },
          { value: metrics.noAutomaticWeightChanges ? 'لا' : 'نعم', label: 'تعديل أوزان تلقائي؟' },
        ];

        metricsEl.innerHTML = '';
        cards.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'trust-metric-card';
          card.innerHTML =
            '<div class="trust-metric-value">' + escapeHtml(String(c.value)) + '</div>' +
            '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
          metricsEl.appendChild(card);
        });
      }

      renderTrustCalibrationWarnings(latestReport);
      renderTrustSnapshots(data.latestSnapshots || []);
    } catch (err) {
      if (metricsEl) metricsEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل معايرة الثقة</p>';
      if (warningsEl) warningsEl.innerHTML = '';
      if (snapshotsEl) snapshotsEl.innerHTML = '';
    }
  }

  function renderTrustCalibrationWarnings(latestReport) {
    var el = document.getElementById('trustCalibrationWarnings');
    if (!el) return;

    if (!latestReport) {
      el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد تقارير معايرة بعد</p>';
      return;
    }

    var warnings = latestReport.driftWarnings || [];

    if (warnings.length === 0) {
      el.innerHTML =
        '<div style="padding:0.75rem;border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);border-radius:var(--radius-sm);color:var(--color-success);">' +
          '✓ لا توجد تحذيرات Drift في آخر تقرير' +
        '</div>';
      return;
    }

    var html =
      '<div style="padding:0.75rem;border:1px solid rgba(245,158,11,0.35);background:rgba(245,158,11,0.08);border-radius:var(--radius-sm);">' +
        '<strong style="color:var(--color-warning);">⚠️ تحذيرات Drift في آخر تقرير:</strong>' +
        '<div style="margin-block-start:0.5rem;">';

    warnings.forEach(function (w) {
      html +=
        '<div class="drift-warning drift-warning--' + escapeHtml(w.severity || 'medium') + '">' +
          '<strong>Bucket ' + escapeHtml(w.label || w.bucket) + '</strong>: ' +
          'score=' + escapeHtml(String(w.avgScore)) +
          ' / success=' + escapeHtml(String(w.avgSuccessRate)) +
          ' / delta=' + escapeHtml(String(w.delta)) +
        '</div>';
    });

    html += '</div></div>';
    el.innerHTML = html;
  }

  function renderTrustSnapshots(snapshots) {
    var el = document.getElementById('trustSnapshotsTable');
    if (!el) return;

    if (!snapshots || snapshots.length === 0) {
      el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد snapshots بعد</p>';
      return;
    }

    var html = '<table class="admin-table"><thead><tr>' +
      '<th>المستخدم</th><th>الدور</th><th>Score</th><th>Grade</th><th>التاريخ</th>' +
      '</tr></thead><tbody>';

    snapshots.forEach(function (s) {
      html += '<tr>' +
        '<td><a class="worker-link" href="/user.html?id=' + escapeHtml(s.userId || '') + '">' + escapeHtml(s.userId || '-') + '</a></td>' +
        '<td>' + escapeHtml(s.role || '-') + '</td>' +
        '<td>' + escapeHtml(String(s.score100 || Math.round((s.score || 0) * 100))) + '/100</td>' +
        '<td>' + escapeHtml(s.grade || '-') + '</td>' +
        '<td><small>' + escapeHtml(s.createdAt ? new Date(s.createdAt).toLocaleString('ar-EG') : '-') + '</small></td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  }

  async function runTrustSnapshotBatch() {
    var resultEl = document.getElementById('trustCalibrationActionResult');
    if (resultEl) {
      resultEl.innerHTML = '<p style="color:var(--color-text-muted);">جاري إضافة Snapshot Batch للطابور...</p>';
    }

    try {
      var data = await apiWrite('POST', '/api/admin/trust/calibration/snapshot-batch?async=1', {
        force: false,
      });

      if (resultEl) {
        resultEl.innerHTML =
          '<p style="color:var(--color-success);">✓ تم وضع Snapshot Batch في الطابور — Job: ' +
          escapeHtml(data.queueJobId || '') +
          '</p>';
      }

      if (typeof YawmiaToast !== 'undefined') {
        YawmiaToast.success('تم وضع snapshot batch في الطابور');
      }

      loadOpsQueueStats();
      loadTrustCalibrationDashboard();
    } catch (err) {
      if (resultEl) {
        resultEl.innerHTML = '<p style="color:var(--color-error);">خطأ: ' + escapeHtml(err.message || '') + '</p>';
      }
      showError(err.message || 'خطأ في تشغيل snapshot batch');
    }
  }

  async function runTrustCalibrationReport() {
    var resultEl = document.getElementById('trustCalibrationActionResult');
    if (resultEl) {
      resultEl.innerHTML = '<p style="color:var(--color-text-muted);">جاري إضافة تقرير المعايرة للطابور...</p>';
    }

    try {
      var to = new Date().toISOString();
      var from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      var data = await apiWrite('POST', '/api/admin/trust/calibration/report?async=1', {
        from: from,
        to: to,
        outcomeWindowDays: 30,
      });

      if (resultEl) {
        resultEl.innerHTML =
          '<p style="color:var(--color-success);">✓ تم وضع تقرير المعايرة في الطابور — Job: ' +
          escapeHtml(data.queueJobId || '') +
          '</p>';
      }

      if (typeof YawmiaToast !== 'undefined') {
        YawmiaToast.success('تم وضع تقرير المعايرة في الطابور');
      }

      loadOpsQueueStats();
      loadTrustCalibrationDashboard();
    } catch (err) {
      if (resultEl) {
        resultEl.innerHTML = '<p style="color:var(--color-error);">خطأ: ' + escapeHtml(err.message || '') + '</p>';
      }
      showError(err.message || 'خطأ في تشغيل تقرير المعايرة');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 49 — Webhook Test
  // ═══════════════════════════════════════════════════════════════

  async function testWebhook() {
    var resultEl = document.getElementById('webhookTestResult');
    if (resultEl) {
      resultEl.innerHTML = '<p style="color:var(--color-text-muted);">جاري إرسال الاختبار...</p>';
    }

    try {
      var headers = { 'X-Admin-Token': token, 'Content-Type': 'application/json' };
      var res = await fetch(API + '/api/admin/alerts/test-webhook', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({}),
      });

      var data = await res.json().catch(function () { return {}; });

      if (resultEl) {
        if (data.ok && data.delivered) {
          resultEl.innerHTML = '<p style="color:var(--color-success);">✓ تم توصيل الاختبار بنجاح</p>';
        } else if (data.ok && data.queued) {
          resultEl.innerHTML = '<p style="color:var(--color-success);">✓ تم وضع الاختبار في طابور التسليم</p>';
          loadAlertDeliveries();
          loadOpsQueueStats();
        } else if (data.rateLimited) {
          resultEl.innerHTML = '<p style="color:var(--color-warning);">⚠️ تم تجاوز حد الاختبارات مؤقتاً</p>';
        } else {
          var reason = data.results && data.results[0] && data.results[0].error
            ? data.results[0].error
            : (data.error || 'لم يتم التوصيل — تأكد من إعدادات السيرفر');
          resultEl.innerHTML = '<p style="color:var(--color-error);">✗ فشل الاختبار: ' + escapeHtml(reason) + '</p>';
        }
      }
    } catch (err) {
      if (resultEl) {
        resultEl.innerHTML = '<p style="color:var(--color-error);">خطأ في الاتصال</p>';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 54 — Production Ops UI
  // ═══════════════════════════════════════════════════════════════

  function readinessBadge(status) {
    var s = status || 'warn';
    return '<span class="readiness-check readiness-check--' + escapeHtml(s) + '">' + escapeHtml(s) + '</span>';
  }

  function opsStatusPill(status) {
    var cls = status === 'ready' || status === 'healthy' || status === 'passed'
      ? 'ops-status-pill--ready'
      : (status === 'not_ready' || status === 'failed' || status === 'violations'
        ? 'ops-status-pill--bad'
        : 'ops-status-pill--warning');

    return '<span class="ops-status-pill ' + cls + '">' + escapeHtml(status || 'unknown') + '</span>';
  }

  async function loadDeploymentGate() {
    try {
      var data = await api('/api/admin/production/deployment-gate');

      renderRecommendedActions('opsRecommendedActions', data.recommendedActions || []);

      var summaryEl = document.getElementById('productionReadinessSummary');
      if (summaryEl && data.status) {
        var existing = summaryEl.innerHTML || '';
        var statusClass = data.status === 'ready'
          ? 'deployment-gate-status ops-status-pill--ready'
          : (data.status === 'blocked' ? 'deployment-gate-status ops-status-pill--bad' : 'deployment-gate-status ops-status-pill--warning');

        summaryEl.insertAdjacentHTML('afterbegin',
          '<div class="trust-metric-card">' +
            '<div class="trust-metric-value"><span class="' + statusClass + '">' + escapeHtml(data.status) + '</span></div>' +
            '<div class="trust-metric-label">Deployment Gate</div>' +
          '</div>'
        );
      }
    } catch (_) {
      // Non-fatal; readiness loader still works.
    }
  }

  async function loadProductionReadiness() {
    var summaryEl = document.getElementById('productionReadinessSummary');
    var checksEl = document.getElementById('productionReadinessChecks');

    if (summaryEl) summaryEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    if (checksEl) checksEl.innerHTML = '';

    try {
      var data = await api('/api/admin/production/readiness');
      var r = data.readiness || {};
      var summary = r.summary || {};

      if (summaryEl) {
        var cards = [
          { value: opsStatusPill(r.status || 'unknown'), label: 'الحالة' },
          { value: summary.pass || 0, label: 'Pass' },
          { value: summary.warn || 0, label: 'Warn' },
          { value: summary.fail || 0, label: 'Fail' },
        ];

        summaryEl.innerHTML = '';
        cards.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'trust-metric-card';
          card.innerHTML =
            '<div class="trust-metric-value">' + c.value + '</div>' +
            '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
          summaryEl.appendChild(card);
        });
      }

      if (checksEl) {
        var checks = r.checks || [];
        if (checks.length === 0) {
          checksEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد checks</p>';
          return;
        }

        var html = '<table class="admin-table"><thead><tr>' +
          '<th>Check</th><th>Status</th><th>Message</th>' +
          '</tr></thead><tbody>';

        checks.forEach(function (c) {
          html += '<tr>' +
            '<td><small>' + escapeHtml(c.id || '-') + '</small></td>' +
            '<td>' + readinessBadge(c.status) + '</td>' +
            '<td>' + escapeHtml(c.message || '-') + '</td>' +
          '</tr>';
        });

        html += '</tbody></table>';
        checksEl.innerHTML = html;
      }
    } catch (err) {
      if (summaryEl) summaryEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل جاهزية الإنتاج</p>';
    }
  }

  async function loadInstanceOps() {
    await Promise.all([
      loadInstanceModeInfo(),
      loadProcessLocks(),
    ]).catch(function () {});
  }

  async function loadInstanceModeInfo() {
    var el = document.getElementById('instanceModeInfo');
    if (!el) return;

    try {
      var data = await api('/api/admin/production/instance-mode');
      var inst = data.instance || {};
      var worker = data.queueWorker || {};
      var warnings = inst.warnings || [];

      var html =
        '<div class="health-row"><span class="health-row__label">Instance ID</span><span class="health-row__value"><small>' + escapeHtml(inst.instanceId || '-') + '</small></span></div>' +
        '<div class="health-row"><span class="health-row__label">Mode</span><span class="health-row__value">' + opsStatusPill(inst.mode || '-') + '</span></div>' +
        '<div class="health-row"><span class="health-row__label">Queue Workers</span><span class="health-row__value">' + (inst.canRunQueueWorkers ? 'مسموح' : 'ممنوع') + ' · ' + (worker.started ? 'Started' : 'Stopped') + '</span></div>' +
        '<div class="health-row"><span class="health-row__label">Schedulers</span><span class="health-row__value">' + (inst.canRunSchedulers ? 'مسموح' : 'ممنوع') + '</span></div>';

      if (warnings.length > 0) {
        html += '<div style="margin-block-start:0.75rem;">';
        warnings.forEach(function (w) {
          html += '<div class="drift-warning drift-warning--' + (w.level === 'critical' ? 'high' : 'medium') + '">' +
            escapeHtml(w.code || 'warning') + ': ' + escapeHtml(w.message || '') +
          '</div>';
        });
        html += '</div>';
      }

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل وضع التشغيل</p>';
    }
  }

  async function loadProcessLocks() {
    var el = document.getElementById('processLocksTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/production/process-locks');
      var locks = data.locks || [];

      if (locks.length === 0) {
        el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;margin-block-start:1rem;">لا توجد أقفال نشطة</p>';
        return;
      }

      var html = '<table class="admin-table" style="margin-block-start:1rem;"><thead><tr>' +
        '<th>Lock</th><th>Owner</th><th>Status</th><th>Heartbeat</th><th>Action</th>' +
        '</tr></thead><tbody>';

      locks.forEach(function (l) {
        html += '<tr>' +
          '<td>' + escapeHtml(l.lockName || '-') + '</td>' +
          '<td><small>' + escapeHtml(l.ownerId || '-') + '</small></td>' +
          '<td><span class="lock-status-badge ' + (l.stale ? 'lock-status-badge--stale' : 'lock-status-badge--active') + '">' + (l.stale ? 'stale' : 'active') + '</span></td>' +
          '<td><small>' + escapeHtml(l.heartbeatAt ? new Date(l.heartbeatAt).toLocaleString('ar-EG') : '-') + '</small></td>' +
          '<td><button class="btn btn--ghost btn--sm" style="color:var(--color-error);border-color:var(--color-error);" onclick="AdminApp.releaseProcessLock(\'' + escapeHtml(l.lockName) + '\')">Force Release</button></td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل الأقفال</p>';
    }
  }

  async function releaseProcessLock(name) {
    var confirmed = await YawmiaModal.confirm({
      title: 'تحرير قفل عملية',
      message: 'تحرير القفل بالقوة قد يسبب تشغيل مكرر لو العملية المالكة ما زالت تعمل. متأكد؟',
      confirmText: 'Force Release',
      cancelText: 'إلغاء',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await apiWrite('POST', '/api/admin/production/process-locks/' + encodeURIComponent(name) + '/release', {});
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم تحرير القفل');
      loadInstanceOps();
    } catch (err) {
      showError(err.message || 'خطأ في تحرير القفل');
    }
  }

  async function loadSchedulerCadence() {
    try {
      var data = await api('/api/admin/production/scheduler-cadence');
      var report = data.report || {};

      if (report.staleCount > 0) {
        renderRecommendedActions('opsRecommendedActions', [{
          id: 'scheduler_cadence_review',
          label: 'مراجعة مهام الجدولة المتأخرة',
          severity: 'warning',
          command: 'node scripts/scheduler-cadence-report.js',
          adminRoute: '/api/admin/production/scheduler-cadence',
          reason: report.staleCount + ' scheduler job(s) stale or failed.',
        }]);
      }

      return report;
    } catch (_) {
      return null;
    }
  }

  async function loadSchedulers() {
    var el = document.getElementById('schedulerTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/schedulers');
      var rows = data.schedulers || [];

      if (rows.length === 0) {
        el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد مهام جدولة</p>';
        return;
      }

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>Name</th><th>Enabled</th><th>Status</th><th>Next Run</th><th>Last Job</th><th>Runs</th><th>Action</th>' +
      '</tr></thead><tbody>';

      rows.forEach(function (s) {
        var enabled = !!s.enabled;
        var status = s.lastStatus || 'registered';

        html += '<tr>' +
          '<td><small>' + escapeHtml(s.name || '-') + '</small><br><small style="color:var(--color-text-muted);">' + escapeHtml(s.queueType || '') + '</small></td>' +
          '<td>' + (enabled ? '✓' : '✗') + '</td>' +
          '<td><span class="scheduler-status-badge scheduler-status-badge--' + escapeHtml(status) + '">' + escapeHtml(status) + '</span></td>' +
          '<td><small>' + escapeHtml(s.nextRunAt ? new Date(s.nextRunAt).toLocaleString('ar-EG') : '-') + '</small></td>' +
          '<td><small>' + escapeHtml(s.lastQueueJobId || '-') + '</small></td>' +
          '<td>' + escapeHtml(String(s.runCount || 0)) + '/' + escapeHtml(String(s.failCount || 0)) + '</td>' +
          '<td>' +
            '<button class="btn btn--primary btn--sm" onclick="AdminApp.runSchedulerNow(\'' + escapeHtml(s.name) + '\')">Run</button> ' +
            (enabled
              ? '<button class="btn btn--ghost btn--sm" onclick="AdminApp.disableScheduler(\'' + escapeHtml(s.name) + '\')">Disable</button>'
              : '<button class="btn btn--ghost btn--sm" onclick="AdminApp.enableScheduler(\'' + escapeHtml(s.name) + '\')">Enable</button>') +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل سجل الجدولة</p>';
    }
  }

  async function runSchedulerNow(name) {
    try {
      var data = await apiWrite('POST', '/api/admin/schedulers/' + encodeURIComponent(name) + '/run', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم تشغيل المهمة — Job: ' + (data.queueJob && data.queueJob.id ? data.queueJob.id : 'deduped'));
        loadSchedulers();
        loadOpsQueueStats();
      }
    } catch (err) {
      showError(err.message || 'خطأ في تشغيل مهمة الجدولة');
    }
  }

  async function enableScheduler(name) {
    try {
      await apiWrite('POST', '/api/admin/schedulers/' + encodeURIComponent(name) + '/enable', {});
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم تفعيل الجدولة');
      loadSchedulers();
    } catch (err) {
      showError(err.message || 'خطأ في تفعيل الجدولة');
    }
  }

  async function disableScheduler(name) {
    try {
      await apiWrite('POST', '/api/admin/schedulers/' + encodeURIComponent(name) + '/disable', {});
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.warning('تم تعطيل الجدولة');
      loadSchedulers();
    } catch (err) {
      showError(err.message || 'خطأ في تعطيل الجدولة');
    }
  }

  async function loadOpsWeeklyReview() {
    try {
      var data = await api('/api/admin/production/ops-review');
      if (data && data.ok && data.recommendedActions) {
        renderRecommendedActions('opsRecommendedActions', data.recommendedActions || []);
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  async function loadOpsSlo() {
    var metricsEl = document.getElementById('opsSloMetrics');
    var rollupsEl = document.getElementById('opsRollupsTable');

    if (metricsEl) metricsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';

    try {
      var sloData = await api('/api/admin/ops/slo?refresh=1');
      var slo = sloData.slo || {};
      var latest = slo.latest || {};
      var q = latest.queue || {};
      var alerts = latest.alerts || {};
      var sched = latest.schedulers || {};
      var violations = slo.violations || [];

      if (metricsEl) {
        var cards = [
          { value: opsStatusPill(slo.status || 'unknown'), label: 'SLO Status' },
          { value: q.deadLetter || 0, label: 'Queue DLQ' },
          { value: alerts.deliveredRate != null ? alerts.deliveredRate + '%' : '-', label: 'Alert Delivery' },
          { value: alerts.p95DeliveryMs || 0, label: 'Alert P95 ms' },
          { value: sched.stale || 0, label: 'Schedulers Stale' },
          { value: violations.length || 0, label: 'Violations' },
        ];

        metricsEl.innerHTML = '';
        cards.forEach(function (c) {
          var card = document.createElement('div');
          card.className = 'trust-metric-card';
          card.innerHTML =
            '<div class="trust-metric-value">' + c.value + '</div>' +
            '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
          metricsEl.appendChild(card);
        });
      }

      var opsActions = [];
      if ((violations || []).length > 0) {
        opsActions.push({
          id: 'ops_slo_review',
          label: 'مراجعة مخالفات SLO',
          severity: 'warning',
          command: 'node scripts/verify-production-readiness.js',
          adminRoute: '/api/admin/ops/slo',
          reason: 'يوجد مؤشرات تشغيل خارج الحدود المتفق عليها.',
        });
      }
      if ((q.deadLetter || 0) > 0) {
        opsActions.push({
          id: 'ops_dlq_review',
          label: 'مراجعة وظائف DLQ',
          severity: q.deadLetter >= 5 ? 'critical' : 'warning',
          command: 'node scripts/queue-retry-dlq.js --dry-run',
          adminRoute: '/api/admin/ops-queue/dead-letter',
          reason: 'DLQ = وظائف فشلت بعد كل المحاولات.',
        });
      }
      if ((sched.stale || 0) > 0) {
        opsActions.push({
          id: 'ops_scheduler_review',
          label: 'مراجعة Scheduler Stale',
          severity: 'warning',
          command: 'node scripts/scheduler-cadence-report.js',
          adminRoute: '/api/admin/schedulers',
          reason: 'Stale Scheduler = مهمة جدولتها تأخرت أو فشلت آخر مرة.',
        });
      }
      renderRecommendedActions('opsRecommendedActions', opsActions);

      await loadOpsRollups();
    } catch (err) {
      if (metricsEl) metricsEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل SLO التشغيل</p>';
      if (rollupsEl) rollupsEl.innerHTML = '';
    }
  }

  async function loadOpsRollups() {
    var el = document.getElementById('opsRollupsTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/ops/rollups?limit=12');
      var rows = data.rollups || [];

      if (rows.length === 0) {
        el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد rollups بعد</p>';
        return;
      }

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>Hour</th><th>Queue</th><th>Alerts</th><th>Schedulers</th><th>SLO</th>' +
      '</tr></thead><tbody>';

      rows.forEach(function (r) {
        var q = r.queue || {};
        var a = r.alerts || {};
        var s = r.schedulers || {};
        var v = r.sloViolations || [];

        html += '<tr>' +
          '<td><small>' + escapeHtml(r.hour || '-') + '</small></td>' +
          '<td><small>pending ' + (q.pending || 0) + ' · DLQ ' + (q.deadLetter || 0) + '</small></td>' +
          '<td><small>' + (a.deliveredRate || 0) + '% · p95 ' + (a.p95DeliveryMs || 0) + 'ms</small></td>' +
          '<td><small>stale ' + (s.stale || 0) + ' · failed ' + (s.failed || 0) + '</small></td>' +
          '<td>' + (v.length > 0 ? readinessBadge('warn') + ' ' + v.length : readinessBadge('pass')) + '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل rollups</p>';
    }
  }

  async function runBackupRestoreDrill() {
    try {
      var confirmed = await YawmiaModal.confirm({
        title: 'تشغيل Restore Drill',
        message: 'سيتم اختبار أحدث نسخة احتياطية في مسار مؤقت. هل تريد المتابعة؟',
        confirmText: 'تشغيل',
        cancelText: 'إلغاء',
      });
      if (!confirmed) return;

      var data = await apiWrite('POST', '/api/admin/backups/restore-drill', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع Restore Drill في الطابور — Job: ' + (data.queueJobId || ''));
        loadRestoreDrills();
        loadOpsQueueStats();
      }
    } catch (err) {
      showError(err.message || 'خطأ في تشغيل Restore Drill');
    }
  }

  async function loadRestoreDrills() {
    var el = document.getElementById('restoreDrillsTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/backups/restore-drills?limit=10');
      var rows = data.drills || [];

      if (rows.length === 0) {
        el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">لا توجد Restore Drills بعد</p>';
        return;
      }

      var html = '<table class="admin-table"><thead><tr>' +
        '<th>ID</th><th>Status</th><th>Backup</th><th>JSON</th><th>Duration</th><th>Errors</th>' +
      '</tr></thead><tbody>';

      rows.forEach(function (d) {
        var counts = d.counts || {};
        html += '<tr>' +
          '<td><small>' + escapeHtml(d.id || '-') + '</small></td>' +
          '<td><span class="restore-drill-status restore-drill-status--' + escapeHtml(d.status || 'failed') + '">' + escapeHtml(d.status || '-') + '</span></td>' +
          '<td><small>' + escapeHtml(d.backupPath || '-') + '</small></td>' +
          '<td>' + escapeHtml(String(counts.jsonParsed || 0)) + '/' + escapeHtml(String(counts.jsonFiles || 0)) + '</td>' +
          '<td>' + escapeHtml(String(d.durationMs || 0)) + 'ms</td>' +
          '<td>' + escapeHtml(String((d.errors || []).length)) + '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل Restore Drills</p>';
    }
  }

  async function loadIncidents() {
    var el = document.getElementById('incidentsTable');
    if (!el) return;

    try {
      var data = await api('/api/admin/incidents?limit=20');
      var rows = data.incidents || [];

      if (rows.length === 0) {
        el.innerHTML = '<p style="color:var(--color-success);text-align:center;">✓ لا توجد حوادث تشغيلية</p>';
        return;
      }

      var html = '<div class="incident-list">';
      rows.forEach(function (inc) {
        var resolved = inc.status === 'resolved';
        html += '<div class="incident-card incident-card--' + escapeHtml(inc.severity || 'medium') + (resolved ? ' incident-card--resolved' : '') + '">' +
          '<div class="incident-card__header">' +
            '<strong>' + escapeHtml(inc.title || inc.id) + '</strong>' +
            '<span>' + opsStatusPill(inc.status || 'open') + '</span>' +
          '</div>' +
          '<div style="font-size:0.8rem;color:var(--color-text-muted);margin-block-start:0.35rem;">' +
            escapeHtml(inc.openedAt ? new Date(inc.openedAt).toLocaleString('ar-EG') : '-') +
            ' · أحداث: ' + escapeHtml(String(inc.eventCount || 0)) +
          '</div>';

        if (!resolved) {
          html += '<div style="margin-block-start:0.75rem;">' +
            '<button class="btn btn--primary btn--sm" onclick="AdminApp.resolveIncident(\'' + escapeHtml(inc.id) + '\')">Resolve</button>' +
          '</div>';
        }

        html += '</div>';
      });
      html += '</div>';

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل الحوادث</p>';
    }
  }

  async function resolveIncident(id) {
    try {
      var note = await YawmiaModal.prompt({
        title: 'حل الحادث',
        message: 'ملاحظة الحل (اختياري)',
        placeholder: 'ماذا تم عمله؟',
      });
      if (note === null) note = '';

      await apiWrite('POST', '/api/admin/incidents/' + encodeURIComponent(id) + '/resolve', { note: note });
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم حل الحادث');
      loadIncidents();
    } catch (err) {
      showError(err.message || 'خطأ في حل الحادث');
    }
  }

  async function loadMaintenanceMode() {
    var el = document.getElementById('maintenanceInfo');
    if (!el) return;

    try {
      var data = await api('/api/admin/maintenance');
      var m = data.maintenance || {};

      var enabled = !!m.enabled;
      var featureEnabled = !!m.featureEnabled;

      var html = '<div class="maintenance-banner-admin ' + (enabled ? 'maintenance-banner-admin--active' : '') + '">' +
        '<strong>' + (enabled ? 'وضع الصيانة مفعل' : 'وضع الصيانة غير مفعل') + '</strong>' +
        '<p>' + escapeHtml(m.message || '-') + '</p>' +
        '<p style="font-size:0.8rem;color:var(--color-text-muted);">Feature: ' + (featureEnabled ? 'enabled' : 'disabled in config') + '</p>' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-block-start:0.75rem;">';

      if (enabled) {
        html += '<button class="btn btn--success btn--sm" onclick="AdminApp.disableMaintenanceMode()">تعطيل الصيانة</button>';
      } else {
        html += '<button class="btn btn--warning btn--sm" onclick="AdminApp.enableMaintenanceMode()">تفعيل الصيانة</button>';
      }

      html += '</div></div>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل وضع الصيانة</p>';
    }
  }

  async function enableMaintenanceMode() {
    try {
      var msg = await YawmiaModal.prompt({
        title: 'تفعيل وضع الصيانة',
        message: 'رسالة تظهر للمستخدمين',
        placeholder: 'المنصة تحت الصيانة مؤقتاً. حاول بعد قليل.',
      });
      if (msg === null) return;

      await apiWrite('POST', '/api/admin/maintenance/enable', { message: msg });
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.warning('تم تفعيل وضع الصيانة');
      loadMaintenanceMode();
    } catch (err) {
      showError(err.message || 'خطأ في تفعيل الصيانة');
    }
  }

  async function disableMaintenanceMode() {
    try {
      await apiWrite('POST', '/api/admin/maintenance/disable', {});
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم تعطيل وضع الصيانة');
      loadMaintenanceMode();
    } catch (err) {
      showError(err.message || 'خطأ في تعطيل الصيانة');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 55 — Scale Hygiene UI
  // ═══════════════════════════════════════════════════════════════

  function storageSizePill(sizeKB, status) {
    var s = status || 'ok';
    var cls = s === 'critical'
      ? 'storage-size-pill--critical'
      : (s === 'warning' ? 'storage-size-pill--warn' : 'storage-size-pill--ok');

    return '<span class="storage-size-pill ' + cls + '">' + escapeHtml(String(sizeKB || 0)) + ' KB</span>';
  }

  async function loadScaleHygiene() {
    var summaryEl = document.getElementById('scaleHygieneSummary');
    var detailsEl = document.getElementById('scaleHygieneDetails');

    if (summaryEl) {
      summaryEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }
    if (detailsEl) {
      detailsEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }

    try {
      var data = await api('/api/admin/scale-hygiene/overview');
      var o = data.overview || {};

      renderRecommendedActions('scaleRecommendedActions', o.recommendedActions || []);
      renderScaleHygieneSummary(o);
      renderScaleHygieneDetails(o);
    } catch (err) {
      if (summaryEl) {
        summaryEl.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل نظافة التوسع</p>';
      }
      if (detailsEl) detailsEl.innerHTML = '';
    }
  }

  function renderScaleHygieneSummary(o) {
    var el = document.getElementById('scaleHygieneSummary');
    if (!el) return;

    var queue = o.queue && o.queue.stats ? o.queue.stats : {};
    var qStatus = queue.byStatus || {};
    var audit = o.audit || {};
    var tokenIndex = audit.tokenIndex || {};
    var workrooms = o.workrooms || {};
    var trust = o.trust || {};
    var predictive = o.predictiveArchive || {};

    var cards = [
      { value: opsStatusPill(o.status || 'unknown'), label: 'الحالة العامة' },
      { value: qStatus.pending || 0, label: 'Queue Pending' },
      { value: qStatus['dead-letter'] || 0, label: 'Queue DLQ' },
      { value: tokenIndex.fileCount || 0, label: 'Audit Token Files' },
      { value: (workrooms.warningCount || 0), label: 'Workroom Warnings' },
      { value: trust.rollupCount || 0, label: 'Trust Rollups' },
      { value: predictive.status || 'unknown', label: 'Predictive Archive Index' },
      { value: o.warningCount || 0, label: 'تحذيرات' },
    ];

    el.innerHTML = '';
    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'scale-hygiene-card';
      card.innerHTML =
        '<div class="trust-metric-value">' + c.value + '</div>' +
        '<div class="trust-metric-label">' + escapeHtml(c.label) + '</div>';
      el.appendChild(card);
    });
  }

  function renderScaleHygieneDetails(o) {
    var el = document.getElementById('scaleHygieneDetails');
    if (!el) return;

    var warnings = o.warnings || [];
    var queue = o.queue || {};
    var audit = o.audit || {};
    var workrooms = o.workrooms || {};
    var trust = o.trust || {};
    var predictive = o.predictiveArchive || {};
    var schedulerHistory = o.schedulerHistory || {};

    var html = '';

    // Warnings summary.
    html += '<h3 style="font-size:1rem;margin-block:1rem 0.75rem;">التحذيرات</h3>';
    if (warnings.length === 0) {
      html += '<p style="color:var(--color-success);text-align:center;padding:0.75rem;">✓ لا توجد تحذيرات توسع حالياً</p>';
    } else {
      html += '<div class="scale-hygiene-warning-list">';
      warnings.slice(0, 10).forEach(function (w) {
        var level = w.level || 'warning';
        var cls = level === 'critical' || level === 'error'
          ? 'scale-hygiene-warning--high'
          : 'scale-hygiene-warning--medium';

        html += '<div class="scale-hygiene-warning ' + cls + '">' +
          '<strong>' + escapeHtml(w.source || 'system') + '</strong>: ' +
          escapeHtml(w.message || '') +
        '</div>';
      });
      html += '</div>';
    }

    // Details table.
    html += '<h3 style="font-size:1rem;margin-block:1rem 0.75rem;">تفاصيل التخزين</h3>';
    html += '<table class="admin-table"><thead><tr>' +
      '<th>النظام</th><th>المؤشر</th><th>القيمة</th><th>ملاحظات</th>' +
      '</tr></thead><tbody>';

    html += '<tr>' +
      '<td>Queue</td>' +
      '<td>Summary</td>' +
      '<td>' + escapeHtml(queue.stats && queue.stats.summary && queue.stats.summary.stale ? 'stale' : 'healthy') + '</td>' +
      '<td><small>locations: ' + escapeHtml(String(queue.stats && queue.stats.summary ? queue.stats.summary.locationCount || 0 : 0)) + '</small></td>' +
    '</tr>';

    html += '<tr>' +
      '<td>Queue Archive</td>' +
      '<td>Entries</td>' +
      '<td>' + escapeHtml(String(queue.archives ? queue.archives.entries || 0 : 0)) + '</td>' +
      '<td><small>months: ' + escapeHtml(String(queue.archives ? queue.archives.months || 0 : 0)) + '</small></td>' +
    '</tr>';

    html += '<tr>' +
      '<td>Audit Index</td>' +
      '<td>Token Index Size</td>' +
      '<td>' + storageSizePill(audit.tokenIndex ? audit.tokenIndex.totalSizeKB || 0 : 0, 'ok') + '</td>' +
      '<td><small>files: ' + escapeHtml(String(audit.tokenIndex ? audit.tokenIndex.fileCount || 0 : 0)) + '</small></td>' +
    '</tr>';

    html += '<tr>' +
      '<td>Workrooms</td>' +
      '<td>Sidecars</td>' +
      '<td>' + storageSizePill(workrooms.totalSidecarKB || 0, workrooms.warningCount > 0 ? 'warning' : 'ok') + '</td>' +
      '<td><small>inspected: ' + escapeHtml(String(workrooms.inspectedWorkrooms || 0)) + '</small></td>' +
    '</tr>';

    html += '<tr>' +
      '<td>Trust</td>' +
      '<td>Retention</td>' +
      '<td>' + escapeHtml(String(trust.rollupCount || 0)) + ' rollups</td>' +
      '<td><small>reports: ' + escapeHtml(String(trust.reportCount || 0)) + '</small></td>' +
    '</tr>';

    html += '<tr>' +
      '<td>Predictive Archive</td>' +
      '<td>Index</td>' +
      '<td>' + escapeHtml(predictive.status || 'unknown') + '</td>' +
      '<td><small>signals: ' + escapeHtml(String(predictive.archivedSignals || 0)) + '</small></td>' +
    '</tr>';

    html += '<tr>' +
      '<td>Scheduler History</td>' +
      '<td>Runs</td>' +
      '<td>' + escapeHtml(String(schedulerHistory.runCount || 0)) + '</td>' +
      '<td><small>files: ' + escapeHtml(String(schedulerHistory.fileCount || 0)) + '</small></td>' +
    '</tr>';

    html += '</tbody></table>';

    // Largest workroom sidecars.
    if (workrooms.largestSidecars && workrooms.largestSidecars.length > 0) {
      html += '<h3 style="font-size:1rem;margin-block:1rem 0.75rem;">أكبر Workroom Sidecars</h3>';
      html += '<table class="admin-table"><thead><tr><th>Job</th><th>Type</th><th>Size</th><th>Status</th></tr></thead><tbody>';
      workrooms.largestSidecars.slice(0, 5).forEach(function (s) {
        html += '<tr>' +
          '<td><small>' + escapeHtml(s.jobId || '-') + '</small></td>' +
          '<td>' + escapeHtml(s.kind || '-') + '</td>' +
          '<td>' + storageSizePill(s.sizeKB || 0, s.status || 'ok') + '</td>' +
          '<td>' + escapeHtml(s.status || 'ok') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }

    el.innerHTML = html;
  }

  async function verifyQueue() {
    try {
      var data = await apiWrite('POST', '/api/admin/queue/verify?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع فحص Queue في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
      }
    } catch (err) {
      showError(err.message || 'خطأ في فحص Queue');
    }
  }

  async function compactQueue() {
    try {
      var data = await apiWrite('POST', '/api/admin/queue/compact?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع ضغط Queue في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
      }
    } catch (err) {
      showError(err.message || 'خطأ في ضغط Queue');
    }
  }

  async function repairQueue() {
    var confirmed = await YawmiaModal.confirm({
      title: 'إصلاح Queue',
      message: 'سيتم إعادة بناء summary/location index للطابور. هل تريد المتابعة؟',
      confirmText: 'إصلاح',
      cancelText: 'إلغاء',
    });
    if (!confirmed) return;

    try {
      var data = await apiWrite('POST', '/api/admin/queue/repair?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع إصلاح Queue في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
      }
    } catch (err) {
      showError(err.message || 'خطأ في إصلاح Queue');
    }
  }

  async function compactWorkrooms() {
    try {
      var data = await apiWrite('POST', '/api/admin/workroom-hygiene/compact?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع ضغط Workrooms في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
      }
    } catch (err) {
      showError(err.message || 'خطأ في ضغط Workrooms');
    }
  }

  async function verifyWorkroomIndexes() {
    try {
      var data = await apiWrite('POST', '/api/admin/workroom-hygiene/verify-indexes?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع فحص Workroom Indexes في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
      }
    } catch (err) {
      showError(err.message || 'خطأ في فحص Workroom Indexes');
    }
  }

  async function cleanupWorkroomAttachments() {
    try {
      var data = await apiWrite('POST', '/api/admin/workroom-hygiene/cleanup-attachments?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع تنظيف المرفقات في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
      }
    } catch (err) {
      showError(err.message || 'خطأ في تنظيف المرفقات');
    }
  }

  async function runTrustRollup() {
    try {
      var data = await apiWrite('POST', '/api/admin/trust/rollups/run?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع Trust Rollup في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
        loadTrustCalibrationDashboard();
      }
    } catch (err) {
      showError(err.message || 'خطأ في تشغيل Trust Rollup');
    }
  }

  async function rebuildPredictiveArchiveIndex() {
    try {
      var data = await apiWrite('POST', '/api/admin/predictive-abuse/archive-index/rebuild?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم وضع Rebuild Predictive Archive Index في الطابور — Job: ' + (data.queueJobId || ''));
        loadOpsQueueStats();
        loadScaleHygiene();
      }
    } catch (err) {
      showError(err.message || 'خطأ في إعادة بناء Predictive Archive Index');
    }
  }

  async function loadSchedulerHistory(name) {
    try {
      var data = await api('/api/admin/schedulers/' + encodeURIComponent(name) + '/history?limit=20');
      return data;
    } catch (err) {
      showError(err.message || 'خطأ في جلب سجل الجدولة');
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 56 — Admin Dashboard IA Tabs + Marketplace Intelligence
  // ═══════════════════════════════════════════════════════════════

  var activeAdminTab = 'overview';
  var loadedAdminTabs = new Set();

  var ADMIN_TAB_SECTIONS = {
    overview: [
      'statsGrid',
      'analyticsGrid',
      'financialGrid',
      'healthInfo',
      'monitoringInfo'
    ],
    marketplace: [
      'marketplaceIntelligenceSection',
      'directOffersFunnel',
      'topEmployersTable',
      'topWorkersTable',
      'directOffersDeclineReasons'
    ],
    trust: [
      'reportsTable',
      'verificationsTable',
      'abuseSignalsSection',
      'predictiveAbuseSection',
      'predictivePrecisionSection',
      'decisionQualitySection',
      'trustAnalyticsSection',
      'trustCalibrationSection'
    ],
    ops: [
      'productionReadinessSection',
      'instanceModeSection',
      'schedulerSection',
      'opsSloSection',
      'restoreDrillsSection',
      'incidentsSection',
      'maintenanceSection'
    ],
    scale: [
      'scaleHygieneSection',
      'opsQueueSection',
      'alertDeliveriesSection',
      'counterHygieneSection'
    ],
    audit: [
      'auditLogSection',
      'auditIndexSection',
      'exportsSection'
    ],
    settings: [
      'usersTable',
      'jobsTable',
      'alertChannelsSection'
    ],
  };

  function closestSectionById(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    return el.classList && el.classList.contains('admin-section') ? el : el.closest('.admin-section') || el;
  }

  function initAdminTabs() {
    var tabs = document.getElementById('adminTabs');
    if (!tabs || tabs.dataset.wired === '1') return;

    tabs.dataset.wired = '1';

    tabs.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-admin-tab') || 'overview';
        showAdminTab(tab, true);
      });
    });

    var initial = (window.location.hash || '').replace('#', '') || 'overview';
    if (!ADMIN_TAB_SECTIONS[initial]) initial = 'overview';
    showAdminTab(initial, false);

    window.addEventListener('hashchange', function () {
      var tab = (window.location.hash || '').replace('#', '') || 'overview';
      if (ADMIN_TAB_SECTIONS[tab]) showAdminTab(tab, false);
    });
  }

  function showAdminTab(tabName, updateHash) {
    if (!ADMIN_TAB_SECTIONS[tabName]) tabName = 'overview';
    activeAdminTab = tabName;

    var tabs = document.getElementById('adminTabs');
    if (tabs) {
      tabs.querySelectorAll('.admin-tab').forEach(function (btn) {
        var isActive = btn.getAttribute('data-admin-tab') === tabName;
        btn.classList.toggle('admin-tab--active', isActive);
      });
    }

    // Hide all known sections first.
    Object.keys(ADMIN_TAB_SECTIONS).forEach(function (tab) {
      ADMIN_TAB_SECTIONS[tab].forEach(function (id) {
        var section = closestSectionById(id);
        if (section) section.classList.add('admin-tab-panel-hidden');
      });
    });

    // Show selected tab sections.
    ADMIN_TAB_SECTIONS[tabName].forEach(function (id) {
      var section = closestSectionById(id);
      if (section) section.classList.remove('admin-tab-panel-hidden');
    });

    if (updateHash) {
      try { window.location.hash = tabName; } catch (_) {}
    }

    lazyLoadAdminTab(tabName);
  }

  function lazyLoadAdminTab(tabName) {
    if (loadedAdminTabs.has(tabName)) return;
    loadedAdminTabs.add(tabName);

    if (tabName === 'marketplace') {
      loadMarketplaceIntelligence();
      loadDirectOffersDashboard();
    } else if (tabName === 'trust') {
      loadReports();
      loadVerifications();
      loadAbuseSignals();
      loadPredictiveAbuseDashboard();
      loadPredictivePrecision();
      loadDecisionQuality();
      loadTrustDashboard();
      loadTrustCalibrationDashboard();
    } else if (tabName === 'ops') {
      loadProductionReadiness();
      loadDeploymentGate();
      loadInstanceOps();
      loadSchedulers();
      loadSchedulerCadence();
      loadOpsSlo();
      loadRestoreDrills();
      loadIncidents();
      loadMaintenanceMode();
    } else if (tabName === 'scale') {
      loadScaleHygiene();
      loadOpsQueueStats();
      loadAlertDeliveries();
      loadCounterHygiene();
    } else if (tabName === 'audit') {
      loadAuditIndexStatus();
      loadExports();
    }
  }

  function renderMpiCards(summary) {
    var el = document.getElementById('marketplaceIntelligenceSummary');
    if (!el) return;

    var s = summary || {};
    var cards = [
      { value: s.searches || 0, label: 'عمليات بحث' },
      { value: (s.zeroResultRate || 0) + '%', label: 'بحث بدون نتائج' },
      { value: s.profileTaskClicks || 0, label: 'ضغطات مهام الملف' },
      { value: s.notificationClicks || 0, label: 'ضغطات الإشعارات' },
      { value: s.workroomMessages || 0, label: 'رسائل Workroom' },
      { value: s.paymentDisputes || 0, label: 'نزاعات دفع' },
      { value: (s.directOfferAcceptRate || 0) + '%', label: 'قبول العروض المباشرة' },
      { value: s.warningCount || 0, label: 'تحذيرات منتج' },
    ];

    el.innerHTML = '';
    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'marketplace-intelligence-card';
      card.innerHTML =
        '<div class="marketplace-intelligence-card__value">' + escapeHtml(String(c.value)) + '</div>' +
        '<div class="marketplace-intelligence-card__label">' + escapeHtml(c.label) + '</div>';
      el.appendChild(card);
    });
  }

  async function loadMarketplaceIntelligence() {
    var details = document.getElementById('marketplaceIntelligenceDetails');
    var summary = document.getElementById('marketplaceIntelligenceSummary');

    if (summary) {
      summary.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري التحميل...</p>';
    }

    try {
      var data = await api('/api/admin/marketplace-intelligence/dashboard');
      var dashboard = data.dashboard || {};
      renderMpiCards(dashboard.summary || {});

      var mpiActions = [];
      var warningsForActions = dashboard.warnings || [];
      if (warningsForActions.length > 0) {
        mpiActions.push({
          id: 'marketplace_review',
          label: 'راجع تحذيرات ذكاء السوق',
          severity: 'warning',
          command: 'node scripts/ops-weekly-review.js',
          adminRoute: '/api/admin/marketplace-intelligence/dashboard',
          reason: 'يوجد تحذيرات في ملخص السوق تحتاج مراجعة منتج/تشغيل.',
        });
      }
      renderRecommendedActions('marketplaceRecommendedActions', mpiActions);

      if (details) {
        var warnings = dashboard.warnings || [];
        if (warnings.length === 0) {
          details.innerHTML = '<p style="color:var(--color-success);text-align:center;padding:0.75rem;">✓ لا توجد تحذيرات منتج حالياً</p>';
        } else {
          var html = '<div class="scale-hygiene-warning-list">';
          warnings.forEach(function (w) {
            html += '<div class="scale-hygiene-warning scale-hygiene-warning--medium">' +
              '<strong>' + escapeHtml(w.source || 'system') + '</strong>: ' +
              escapeHtml(w.message || '') +
            '</div>';
          });
          html += '</div>';
          details.innerHTML = html;
        }
      }
    } catch (err) {
      if (summary) summary.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل ذكاء السوق</p>';
    }
  }

  async function loadSearchAnalytics() {
    var el = document.getElementById('marketplaceIntelligenceDetails');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;">جاري تحميل تحليلات البحث...</p>';

    try {
      var data = await api('/api/admin/marketplace-intelligence/search?limit=20');
      var totals = data.totals || {};
      var rows = data.topQueries || [];

      var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">تحليلات البحث</h3>';
      html += '<div class="analytics-grid">' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.searches || 0) + '</div><div class="marketplace-intelligence-card__label">بحث</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.zeroResults || 0) + '</div><div class="marketplace-intelligence-card__label">بدون نتائج</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.clicks || 0) + '</div><div class="marketplace-intelligence-card__label">Clicks</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.conversions || 0) + '</div><div class="marketplace-intelligence-card__label">Conversions</div></div>' +
      '</div>';

      if (rows.length > 0) {
        html += '<table class="admin-table"><thead><tr><th>Query Hash</th><th>Scope</th><th>Count</th><th>Zero</th><th>Clicks</th></tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr>' +
            '<td><small>' + escapeHtml((r.queryHash || '').slice(0, 16)) + '…</small></td>' +
            '<td>' + escapeHtml(r.scope || '-') + '</td>' +
            '<td>' + escapeHtml(String(r.count || 0)) + '</td>' +
            '<td>' + escapeHtml(String(r.zeroResults || 0)) + '</td>' +
            '<td>' + escapeHtml(String(r.clickedResults || 0)) + '</td>' +
          '</tr>';
        });
        html += '</tbody></table>';
      }

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل تحليلات البحث</p>';
    }
  }

  async function loadZeroResultSearches() {
    var el = document.getElementById('marketplaceIntelligenceDetails');
    if (!el) return;

    try {
      var data = await api('/api/admin/marketplace-intelligence/search/zero-results?limit=20');
      var rows = data.queries || [];

      if (rows.length === 0) {
        el.innerHTML = '<p style="color:var(--color-success);text-align:center;padding:1rem;">✓ لا توجد عمليات بحث بدون نتائج</p>';
        return;
      }

      var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">بحث بدون نتائج</h3>';
      rows.forEach(function (r) {
        html += '<div class="zero-result-query-card">' +
          '<strong>Hash:</strong> <small>' + escapeHtml((r.queryHash || '').slice(0, 24)) + '…</small><br>' +
          '<small>Scope: ' + escapeHtml(r.scope || '-') + ' · Zero: ' + escapeHtml(String(r.zeroResults || 0)) + ' · Count: ' + escapeHtml(String(r.count || 0)) + '</small>' +
        '</div>';
      });
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل zero-results</p>';
    }
  }

  async function loadActivationFunnel() {
    var el = document.getElementById('marketplaceIntelligenceDetails');
    if (!el) return;

    try {
      var data = await api('/api/admin/marketplace-intelligence/activation-funnel');
      var totals = data.totals || {};
      var rates = data.rates || {};
      var tasks = data.byTask || [];

      var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">Activation Funnel</h3>';
      html += '<div class="analytics-grid">' +
        '<div class="funnel-step-card">Shown: <strong>' + (totals.profileTaskShown || 0) + '</strong></div>' +
        '<div class="funnel-step-card">Clicked: <strong>' + (totals.profileTaskClicked || 0) + '</strong></div>' +
        '<div class="funnel-step-card">Completed: <strong>' + (totals.profileTaskCompleted || 0) + '</strong></div>' +
        '<div class="funnel-step-card">Click Rate: <strong>' + (rates.profileTaskClickRate || 0) + '%</strong></div>' +
      '</div>';

      if (tasks.length > 0) {
        html += '<table class="admin-table"><thead><tr><th>Task</th><th>Shown</th><th>Clicked</th><th>Completed</th></tr></thead><tbody>';
        tasks.slice(0, 20).forEach(function (t) {
          html += '<tr><td>' + escapeHtml(t.taskId || '-') + '</td><td>' + (t.shown || 0) + '</td><td>' + (t.clicked || 0) + '</td><td>' + (t.completed || 0) + '</td></tr>';
        });
        html += '</tbody></table>';
      }

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل Activation Funnel</p>';
    }
  }

  async function loadNotificationConversions() {
    var el = document.getElementById('marketplaceIntelligenceDetails');
    if (!el) return;

    try {
      var data = await api('/api/admin/marketplace-intelligence/notification-conversions');
      var rows = data.rows || [];
      var totals = data.totals || {};

      var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">تحويلات الإشعارات</h3>';
      html += '<p style="color:var(--color-text-muted);font-size:0.85rem;">Clicks: ' + (totals.clicks || 0) + ' · Conversions: ' + (totals.conversions || 0) + '</p>';

      if (rows.length === 0) {
        html += '<p class="empty-state">لا توجد بيانات تحويلات بعد</p>';
      } else {
        html += '<table class="admin-table"><thead><tr><th>Type</th><th>Action</th><th>Clicks</th><th>Conversions</th><th>Rate</th></tr></thead><tbody>';
        rows.slice(0, 20).forEach(function (r) {
          html += '<tr>' +
            '<td>' + escapeHtml(r.type || '-') + '</td>' +
            '<td>' + escapeHtml(r.actionType || '-') + '</td>' +
            '<td>' + (r.clicks || 0) + '</td>' +
            '<td>' + (r.conversions || 0) + '</td>' +
            '<td><span class="conversion-rate-pill">' + (r.conversionRate || 0) + '%</span></td>' +
          '</tr>';
        });
        html += '</tbody></table>';
      }

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل تحويلات الإشعارات</p>';
    }
  }

  async function loadWorkroomAdoption() {
    var el = document.getElementById('marketplaceIntelligenceDetails');
    if (!el) return;

    try {
      var data = await api('/api/admin/marketplace-intelligence/workroom-adoption');
      var totals = data.totals || {};
      var rates = data.rates || {};
      var events = data.byEvent || [];

      var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">Workroom Adoption</h3>';
      html += '<div class="analytics-grid">' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.opened || 0) + '</div><div class="marketplace-intelligence-card__label">Opened</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.messageSent || 0) + '</div><div class="marketplace-intelligence-card__label">Messages</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.attachmentUploaded || 0) + '</div><div class="marketplace-intelligence-card__label">Attachments</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (rates.collaborationEvents || 0) + '</div><div class="marketplace-intelligence-card__label">Collaboration Events</div></div>' +
      '</div>';

      if (events.length > 0) {
        html += '<table class="admin-table"><thead><tr><th>Event</th><th>Count</th></tr></thead><tbody>';
        events.slice(0, 20).forEach(function (e) {
          html += '<tr><td>' + escapeHtml(e.eventType || '-') + '</td><td>' + (e.count || 0) + '</td></tr>';
        });
        html += '</tbody></table>';
      }

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل Workroom Adoption</p>';
    }
  }

  async function loadPaymentDisputeAnalytics() {
    var el = document.getElementById('marketplaceIntelligenceDetails');
    if (!el) return;

    try {
      var data = await api('/api/admin/marketplace-intelligence/payment-disputes');
      var a = data.analytics || {};
      var totals = a.totals || {};
      var categories = a.topRiskCategories || [];

      var html = '<h3 style="font-size:1rem;margin-block-end:0.75rem;">تحليلات نزاعات الدفع</h3>';
      html += '<div class="analytics-grid">' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.disputes || 0) + '</div><div class="marketplace-intelligence-card__label">نزاعات</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.disputeRate || 0) + '%</div><div class="marketplace-intelligence-card__label">معدل النزاع</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.disputedPlatformFeeExposure || 0) + '</div><div class="marketplace-intelligence-card__label">تعرض عمولة</div></div>' +
        '<div class="marketplace-intelligence-card"><div class="marketplace-intelligence-card__value">' + (totals.avgResolutionHours || 0) + 'h</div><div class="marketplace-intelligence-card__label">متوسط الحل</div></div>' +
      '</div>';

      if (categories.length > 0) {
        html += '<h4 style="font-size:0.95rem;margin-block:1rem 0.5rem;">أعلى التخصصات مخاطرة</h4>';
        html += '<table class="admin-table"><thead><tr><th>Category</th><th>Disputes</th><th>Rate</th></tr></thead><tbody>';
        categories.forEach(function (c) {
          html += '<tr><td>' + escapeHtml(c.category || '-') + '</td><td>' + (c.disputes || 0) + '</td><td><span class="dispute-risk-pill">' + (c.disputeRate || 0) + '%</span></td></tr>';
        });
        html += '</tbody></table>';
      }

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل نزاعات الدفع</p>';
    }
  }

  async function loadMatchingQuality() {
    var el = document.getElementById('marketplaceIntelligenceDetails');
    if (!el) return;

    try {
      var data = await api('/api/admin/marketplace-intelligence/matching-quality');
      var stats = data.stats || {};
      var safety = data.safety || {};

      el.innerHTML =
        '<h3 style="font-size:1rem;margin-block-end:0.75rem;">جودة المطابقة</h3>' +
        '<div class="health-row"><span class="health-row__label">Explainability</span><span class="health-row__value">' + (stats.explainabilityEnabled ? 'مفعل' : 'غير مفعل') + '</span></div>' +
        '<div class="health-row"><span class="health-row__label">Max Reasons</span><span class="health-row__value">' + escapeHtml(String(stats.maxExplanationReasons || 0)) + '</span></div>' +
        '<div class="health-row"><span class="health-row__label">No Punitive Automation</span><span class="health-row__value">' + (safety.noPunitiveAutomation ? 'نعم' : 'لا') + '</span></div>' +
        '<div class="health-row"><span class="health-row__label">Policy</span><span class="health-row__value">' + escapeHtml(safety.explanationPolicy || '-') + '</span></div>';
    } catch (err) {
      el.innerHTML = '<p style="color:var(--color-error);text-align:center;">خطأ في تحميل جودة المطابقة</p>';
    }
  }

  async function runMarketplaceIntelligenceRollup() {
    try {
      var data = await apiWrite('POST', '/api/admin/marketplace-intelligence/rollup/run?async=1', {});
      if (data && data.ok) {
        if (typeof YawmiaToast !== 'undefined') {
          YawmiaToast.success('تم وضع Marketplace Intelligence Rollup في الطابور — Job: ' + (data.queueJobId || ''));
        }
        loadOpsQueueStats();
        loadMarketplaceIntelligence();
      }
    } catch (err) {
      showError(err.message || 'خطأ في تشغيل rollup');
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
    // Phase 51 — Predictive Abuse + Decision Quality
    loadPredictiveAbuseDashboard: loadPredictiveAbuseDashboard,
    runPredictiveAbuseScan: runPredictiveAbuseScan,
    dismissPredictiveSignal: dismissPredictiveSignal,
    escalatePredictiveSignal: escalatePredictiveSignal,
    loadDecisionQuality: loadDecisionQuality,
    loadBacklogPriority: loadBacklogPriority,
    loadPredictivePrecision: loadPredictivePrecision,
    runPredictiveSignalRetention: runPredictiveSignalRetention,
    markPredictiveFalsePositive: markPredictiveFalsePositive,
    markPredictiveConfirmed: markPredictiveConfirmed,
    // Phase 52 — Ops Queue + Alert Delivery + Async Export
    loadOpsQueueStats: loadOpsQueueStats,
    loadOpsQueueJobs: loadOpsQueueJobs,
    loadDeadLetterJobs: loadDeadLetterJobs,
    retryQueueJob: retryQueueJob,
    cancelQueueJob: cancelQueueJob,
    loadAlertDeliveries: loadAlertDeliveries,
    loadAlertDeliveryHealth: loadAlertDeliveryHealth,
    retryAlertDelivery: retryAlertDelivery,
    createAuditExportJob: createAuditExportJob,
    // Phase 50 — Scale & Search Hygiene
    loadAuditIndexStatus: loadAuditIndexStatus,
    rebuildAuditIndex: rebuildAuditIndex,
    verifyAuditIndex: verifyAuditIndex,
    loadExports: loadExports,
    cancelExport: cancelExport,
    downloadExport: downloadExport,
    loadCounterHygiene: loadCounterHygiene,
    compactCounters: compactCounters,
    rebuildCounters: rebuildCounters,
    // Phase 49 — Trust Analytics + Alert Channels
    loadTrustDashboard: loadTrustDashboard,
    setTrustPeriod: setTrustPeriod,
    loadTrustCalibrationDashboard: loadTrustCalibrationDashboard,
    runTrustSnapshotBatch: runTrustSnapshotBatch,
    runTrustCalibrationReport: runTrustCalibrationReport,
    testWebhook: testWebhook,
    renderCsvExportProgress: renderCsvExportProgress,
    renderRecommendedActions: renderRecommendedActions,
    // Phase 54 — Production Ops
    loadProductionReadiness: loadProductionReadiness,
    loadDeploymentGate: loadDeploymentGate,
    loadSchedulerCadence: loadSchedulerCadence,
    loadOpsWeeklyReview: loadOpsWeeklyReview,
    loadInstanceOps: loadInstanceOps,
    loadProcessLocks: loadProcessLocks,
    releaseProcessLock: releaseProcessLock,
    loadSchedulers: loadSchedulers,
    runSchedulerNow: runSchedulerNow,
    enableScheduler: enableScheduler,
    disableScheduler: disableScheduler,
    loadOpsSlo: loadOpsSlo,
    loadOpsRollups: loadOpsRollups,
    runBackupRestoreDrill: runBackupRestoreDrill,
    loadRestoreDrills: loadRestoreDrills,
    loadIncidents: loadIncidents,
    resolveIncident: resolveIncident,
    loadMaintenanceMode: loadMaintenanceMode,
    enableMaintenanceMode: enableMaintenanceMode,
    disableMaintenanceMode: disableMaintenanceMode,
    // Phase 56 — Admin Dashboard IA + Marketplace Intelligence
    initAdminTabs: initAdminTabs,
    showAdminTab: showAdminTab,
    loadMarketplaceIntelligence: loadMarketplaceIntelligence,
    loadSearchAnalytics: loadSearchAnalytics,
    loadZeroResultSearches: loadZeroResultSearches,
    loadActivationFunnel: loadActivationFunnel,
    loadNotificationConversions: loadNotificationConversions,
    loadWorkroomAdoption: loadWorkroomAdoption,
    loadPaymentDisputeAnalytics: loadPaymentDisputeAnalytics,
    loadMatchingQuality: loadMatchingQuality,
    runMarketplaceIntelligenceRollup: runMarketplaceIntelligenceRollup,

    // Phase 55 — Scale Hygiene
    loadScaleHygiene: loadScaleHygiene,
    verifyQueue: verifyQueue,
    compactQueue: compactQueue,
    repairQueue: repairQueue,
    compactWorkrooms: compactWorkrooms,
    verifyWorkroomIndexes: verifyWorkroomIndexes,
    cleanupWorkroomAttachments: cleanupWorkroomAttachments,
    runTrustRollup: runTrustRollup,
    rebuildPredictiveArchiveIndex: rebuildPredictiveArchiveIndex,
    loadSchedulerHistory: loadSchedulerHistory,
    // Phase 48 — Admin Real-Time Operations
    connectAdminSse: connectAdminSse,
  };
})();
