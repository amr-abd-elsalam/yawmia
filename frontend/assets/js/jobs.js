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

  // ── Show/Hide Sections Based on Role ──────────────────────
  if (user.role === 'employer') {
    Yawmia.show('createJobSection');
    setupCreateJob();
  }

  // ── Populate Filter Dropdowns ─────────────────────────────
  Yawmia.populateGovernorates('filterGov');
  Yawmia.populateCategories('filterCat');

  // ── Notifications ─────────────────────────────────────────
  loadNotifications();

  var notificationBell = Yawmia.$id('notificationBell');
  var notificationPanel = Yawmia.$id('notificationPanel');
  if (notificationBell && notificationPanel) {
    notificationBell.addEventListener('click', function () {
      notificationPanel.classList.toggle('hidden');
      if (!notificationPanel.classList.contains('hidden')) {
        loadNotifications();
      }
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
        }
        var ntfList = Yawmia.$id('notificationList');
        if (ntfList && res.data.items.length > 0) {
          ntfList.innerHTML = '';
          res.data.items.forEach(function (ntf) {
            var item = document.createElement('div');
            item.className = 'notification-item' + (ntf.read ? '' : ' notification-item--unread');
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
          ntfList.innerHTML = '<p class="empty-state">لا توجد إشعارات</p>';
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
    jobsList.innerHTML = '<p class="empty-state">جاري تحميل الفرص...</p>';

    var gov = Yawmia.$id('filterGov') ? Yawmia.$id('filterGov').value : '';
    var cat = Yawmia.$id('filterCat') ? Yawmia.$id('filterCat').value : '';

    var query = '/api/jobs?page=' + currentPage + '&limit=' + pageLimit + '&';
    if (gov) query += 'governorate=' + encodeURIComponent(gov) + '&';
    if (cat) query += 'category=' + encodeURIComponent(cat) + '&';

    try {
      var res = await Yawmia.api('GET', query);
      if (res.data.ok && res.data.jobs.length > 0) {
        jobsList.innerHTML = '';
        res.data.jobs.forEach(function (job) {
          jobsList.appendChild(createJobCard(job));
        });
        updatePagination(res.data);
      } else {
        jobsList.innerHTML = '<p class="empty-state">لا توجد فرص متاحة حالياً</p>';
        Yawmia.hide('paginationControls');
      }
    } catch (err) {
      jobsList.innerHTML = '<p class="empty-state">خطأ في تحميل الفرص</p>';
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

    var statusBadge = '<span class="badge badge--status badge--' + job.status + '">' + getStatusLabel(job.status) + '</span>';

    var footerButtons = '';
    if (user.role === 'worker' && job.status === 'open') {
      footerButtons = '<button class="btn btn--primary btn--sm btn-apply" data-job-id="' + job.id + '">تقدّم</button>';
    }
    if (user.role === 'employer' && job.employerId === user.id) {
      if (job.status === 'filled') {
        footerButtons = '<button class="btn btn--primary btn--sm btn-start" data-job-id="' + job.id + '">ابدأ التنفيذ</button>';
      } else if (job.status === 'in_progress') {
        footerButtons = '<button class="btn btn--success btn--sm btn-complete" data-job-id="' + job.id + '">إنهاء الفرصة</button>';
      }
    }

    card.innerHTML =
      '<div class="job-card__header">' +
        '<span class="job-card__title">' + escapeHtml(job.title) + '</span>' +
        '<div class="job-card__header-right">' +
          statusBadge +
          '<span class="job-card__wage">' + job.dailyWage + ' جنيه/يوم</span>' +
        '</div>' +
      '</div>' +
      '<div class="job-card__meta">' +
        '<span>📍 ' + escapeHtml(job.governorate) + '</span>' +
        '<span>📅 ' + job.startDate + '</span>' +
        '<span>⏱ ' + job.durationDays + ' يوم</span>' +
      '</div>' +
      (job.description ? '<p class="job-card__desc">' + escapeHtml(job.description) + '</p>' : '') +
      '<div class="job-card__footer">' +
        '<span class="job-card__workers">👷 ' + job.workersAccepted + '/' + job.workersNeeded + ' عامل</span>' +
        footerButtons +
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
            applyBtn.classList.remove('btn--primary');
          } else {
            alert(res.data.error || 'خطأ في التقديم');
          }
        } catch (err) {
          alert('خطأ في الاتصال');
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
            alert(res.data.error || 'خطأ في بدء الفرصة');
          }
        } catch (err) {
          alert('خطأ في الاتصال');
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
            alert(res.data.error || 'خطأ في إنهاء الفرصة');
          }
        } catch (err) {
          alert('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(completeBtn, false);
        }
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

  // ── Escape HTML ───────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
