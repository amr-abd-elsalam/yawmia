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

  // ── Inject Search + Sort Controls ─────────────────────────
  (function injectFilterControls() {
    var filtersDiv = document.querySelector('.filters');
    if (!filtersDiv) return;
    var btnFilter = Yawmia.$id('btnFilterJobs');

    // Search input
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'filterSearch';
    searchInput.className = 'form-input form-input--sm';
    searchInput.placeholder = 'بحث بالكلمة...';
    filtersDiv.insertBefore(searchInput, btnFilter);

    // Sort dropdown
    var sortSelect = document.createElement('select');
    sortSelect.id = 'filterSort';
    sortSelect.className = 'form-input form-input--sm';
    sortSelect.innerHTML =
      '<option value="">ترتيب: الأحدث</option>' +
      '<option value="wage_high">الأجر الأعلى</option>' +
      '<option value="wage_low">الأجر الأقل</option>';
    filtersDiv.insertBefore(sortSelect, btnFilter);
  })();

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

    var search = Yawmia.$id('filterSearch') ? Yawmia.$id('filterSearch').value.trim() : '';
    var sort = Yawmia.$id('filterSort') ? Yawmia.$id('filterSort').value : '';

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
      if (job.status === 'open') {
        footerButtons = '<button class="btn btn--danger btn--sm btn-cancel" data-job-id="' + job.id + '">إلغاء الفرصة</button>';
      } else if (job.status === 'filled') {
        footerButtons = '<button class="btn btn--primary btn--sm btn-start" data-job-id="' + job.id + '">ابدأ التنفيذ</button>';
      } else if (job.status === 'in_progress') {
        footerButtons = '<button class="btn btn--success btn--sm btn-complete" data-job-id="' + job.id + '">إنهاء الفرصة</button>';
      } else if (job.status === 'completed') {
        footerButtons = '<button class="btn btn--warning btn--sm btn-rate" data-job-id="' + job.id + '">⭐ قيّم العمال</button>';
      }
    }
    if (user.role === 'worker' && job.status === 'completed') {
      footerButtons = '<button class="btn btn--warning btn--sm btn-rate" data-job-id="' + job.id + '" data-target="' + (job.employerId || '') + '">⭐ قيّم صاحب العمل</button>';
    }

    // Report button (any authenticated user can report the employer)
    if (job.employerId && job.employerId !== user.id) {
      footerButtons += ' <button class="btn report-btn btn--sm btn-report" data-job-id="' + job.id + '" data-target="' + escapeHtml(job.employerId) + '">🚩 بلّغ</button>';
    }

    // Payment info placeholder for completed jobs
    var paymentBadgeHtml = '';
    if (job.status === 'completed') {
      paymentBadgeHtml = '<span class="payment-badge-placeholder" data-job-id="' + job.id + '"></span>';
    }

    var completedLabel = '';
    if (job.status === 'completed' && !footerButtons) {
      completedLabel = '<span class="badge badge--status badge--completed">✓ مكتملة</span>';
    }

    var distanceBadge = (job._distance !== undefined && job._distance !== null)
      ? '<span class="job-distance">📍 ' + job._distance + ' كم</span>'
      : '';

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
        '<span>📍 ' + escapeHtml(job.governorate) + '</span>' +
        '<span>📅 ' + job.startDate + '</span>' +
        '<span>⏱ ' + job.durationDays + ' يوم</span>' +
      '</div>' +
      (job.description ? '<p class="job-card__desc">' + escapeHtml(job.description) + '</p>' : '') +
      paymentBadgeHtml +
      '<div class="job-card__footer">' +
        '<span class="job-card__workers">👷 ' + job.workersAccepted + '/' + job.workersNeeded + ' عامل</span>' +
        completedLabel +
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

    // Cancel button handler (employer)
    var cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async function () {
        if (!confirm('متأكد إنك عايز تلغي هذه الفرصة؟ الطلبات المعلقة هتترفض تلقائياً.')) return;
        Yawmia.setLoading(cancelBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/cancel');
          if (res.data.ok) {
            loadJobs();
          } else {
            alert(res.data.error || 'خطأ في إلغاء الفرصة');
          }
        } catch (err) {
          alert('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(cancelBtn, false);
        }
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
                    alert(cRes.data.error || 'خطأ في تأكيد الدفع');
                  }
                } catch (e) {
                  alert('خطأ في الاتصال');
                } finally {
                  Yawmia.setLoading(confirmBtn, false);
                }
              });
            }

            // Dispute handler
            var disputeBtn = paymentPlaceholder.querySelector('.btn-dispute-payment');
            if (disputeBtn) {
              disputeBtn.addEventListener('click', async function () {
                var reason = prompt('اكتب سبب النزاع (5 حروف على الأقل):');
                if (!reason || reason.trim().length < 5) {
                  alert('سبب النزاع لازم يكون 5 حروف على الأقل');
                  return;
                }
                Yawmia.setLoading(disputeBtn, true);
                try {
                  var dRes = await Yawmia.api('POST', '/api/payments/' + pay.id + '/dispute', { reason: reason.trim() });
                  if (dRes.data.ok) {
                    loadJobs();
                  } else {
                    alert(dRes.data.error || 'خطأ في فتح النزاع');
                  }
                } catch (e) {
                  alert('خطأ في الاتصال');
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
        '<button class="btn btn--ghost btn--sm btn-cancel-report">إلغاء</button>' +
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

  // ── Escape HTML ───────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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
          '<label class="form-label">معرّف العامل (User ID)</label>' +
          '<input type="text" class="form-input form-input--sm" id="ratingTargetId" placeholder="usr_xxx" value="' + escapeHtml(prefilledTargetId) + '">' +
        '</div>';
    }

    modal.innerHTML =
      '<div class="rating-modal__card">' +
        '<h3 class="rating-modal__title">⭐ قيّم تجربتك في: ' + escapeHtml(job.title) + '</h3>' +
        '<div class="rating-stars-input" id="ratingStarsInput">' +
          '<button class="star-btn" data-star="1">★</button>' +
          '<button class="star-btn" data-star="2">★</button>' +
          '<button class="star-btn" data-star="3">★</button>' +
          '<button class="star-btn" data-star="4">★</button>' +
          '<button class="star-btn" data-star="5">★</button>' +
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

    // Star selection
    var starBtns = modal.querySelectorAll('.star-btn');
    starBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedStars = parseInt(btn.getAttribute('data-star'));
        starBtns.forEach(function (b) {
          var s = parseInt(b.getAttribute('data-star'));
          if (s <= selectedStars) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      });
    });

    // Cancel
    modal.querySelector('#btnCancelRating').addEventListener('click', function () {
      modal.remove();
    });

    // Click outside card to close
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
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
        toUserId = (modal.querySelector('#ratingTargetId') || {}).value || '';
        if (!toUserId.trim()) {
          errorEl.textContent = 'أدخل معرّف العامل';
          return;
        }
        toUserId = toUserId.trim();
      }

      var comment = (modal.querySelector('#ratingComment') || {}).value || '';

      var submitBtn = modal.querySelector('#btnSubmitRating');
      Yawmia.setLoading(submitBtn, true);

      try {
        var body = { toUserId: toUserId, stars: selectedStars };
        if (comment.trim()) body.comment = comment.trim();

        var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/rate', body);
        if (res.data.ok) {
          modal.remove();
          alert('تم إرسال التقييم بنجاح ⭐');
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
