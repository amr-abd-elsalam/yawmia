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
