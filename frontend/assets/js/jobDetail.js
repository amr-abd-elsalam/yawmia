// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/jobDetail.js — Job Detail Page Module (IIFE)
// Phase 33 — Shareable job detail page with full info + actions
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Read job ID from URL ──────────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var jobId = params.get('id');

  if (!jobId) {
    showError();
    return;
  }

  // Show profile link if logged in
  if (Yawmia.isLoggedIn()) {
    var profileLink = Yawmia.$id('profileLink');
    if (profileLink) profileLink.style.display = '';
  }

  // Render icons
  if (typeof YawmiaIcons !== 'undefined') YawmiaIcons.renderAll();

  // Load job
  loadJob(jobId);

  // ── Load Job ──────────────────────────────────────────────
  async function loadJob(id) {
    try {
      var res = await Yawmia.api('GET', '/api/jobs/' + id);
      if (res.status === 404 || !res.data || !res.data.ok || !res.data.job) {
        showError();
        return;
      }

      var job = res.data.job;
      renderJob(job);

      Yawmia.hide('jobLoading');
      Yawmia.show('jobContent');

      // Load employer profile (fire-and-forget enrichment)
      loadEmployerProfile(job.employerId);

      // Load payment info for completed jobs
      if (job.status === 'completed') {
        loadPaymentInfo(job.id);
      }

    } catch (err) {
      showError();
    }
  }

  // ── Render Job Details ────────────────────────────────────
  function renderJob(job) {
    // Title
    var titleEl = Yawmia.$id('jobTitle');
    if (titleEl) titleEl.textContent = job.title;

    // Update page title
    document.title = 'يوميّة — ' + job.title;

    // Status badge
    var statusEl = Yawmia.$id('jobStatusBadge');
    if (statusEl) {
      var statusLabel = YawmiaUtils.statusLabel(job.status);
      statusEl.innerHTML = '<span class="badge badge--status badge--' + escapeHtml(job.status) + '">' + escapeHtml(statusLabel) + '</span>';
    }

    // Info grid
    var gridEl = Yawmia.$id('jobInfoGrid');
    if (gridEl) {
      var items = [
        { icon: 'briefcase', label: 'التخصص', value: job.category },
        { icon: 'mapPin', label: 'المحافظة', value: job.governorate },
        { icon: 'wallet', label: 'اليومية', value: job.dailyWage + ' جنيه/يوم' },
        { icon: 'calendar', label: 'تاريخ البدء', value: job.startDate },
        { icon: 'clock', label: 'المدة', value: job.durationDays + ' يوم' },
        { icon: 'workers', label: 'العمال', value: job.workersAccepted + '/' + job.workersNeeded + ' عامل' },
      ];

      gridEl.innerHTML = '';
      items.forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'job-detail__info-item';
        div.innerHTML =
          '<span class="job-detail__info-label">' + YawmiaIcons.get(item.icon, { size: 16 }) + ' ' + escapeHtml(item.label) + '</span>' +
          '<span class="job-detail__info-value">' + escapeHtml(item.value) + '</span>';
        gridEl.appendChild(div);
      });
    }

    // Description
    if (job.description && job.description.trim()) {
      var descSection = Yawmia.$id('jobDescSection');
      var descEl = Yawmia.$id('jobDescription');
      if (descSection && descEl) {
        descEl.textContent = job.description;
        Yawmia.show('jobDescSection');
      }
    }

    // WhatsApp share button
    var shareBtn = Yawmia.$id('btnShareWhatsApp');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        var jobUrl = window.location.origin + '/job.html?id=' + job.id;
        var text = 'فرصة عمل على يوميّة: ' + job.title + ' — ' + job.dailyWage + ' جنيه/يوم 📍 ' + job.governorate + '\n' + jobUrl;
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      });
    }

    // Actions
    renderActions(job);
  }

  // ── Render Action Buttons ─────────────────────────────────
  function renderActions(job) {
    var actionsEl = Yawmia.$id('jobActions');
    if (!actionsEl) return;

    var user = Yawmia.getUser();
    var isLoggedIn = Yawmia.isLoggedIn();
    var html = '';

    if (!isLoggedIn) {
      html = '<a href="/" class="btn btn--primary">سجّل دخولك عشان تتقدم</a>';
      actionsEl.innerHTML = html;
      return;
    }

    // Worker actions
    if (user.role === 'worker') {
      if (job.status === 'open') {
        html += '<button class="btn btn--primary" id="btnApply">تقدّم لهذه الفرصة</button>';
      }
      if (job.status === 'in_progress') {
        html += '<button class="btn btn-checkin" id="btnCheckIn">📍 تسجيل حضور</button>';
        html += '<button class="btn btn-checkout" id="btnCheckOut">🏁 تسجيل انصراف</button>';
      }
      if (job.status === 'completed') {
        html += '<button class="btn btn--warning" id="btnRateEmployer" data-target="' + escapeHtml(job.employerId) + '">⭐ قيّم صاحب العمل</button>';
      }
    }

    // Employer actions (own job)
    if (user.role === 'employer' && job.employerId === user.id) {
      if (job.status === 'open') {
        html += '<button class="btn btn--ghost" id="btnCancelJob" style="color:var(--color-error);border-color:var(--color-error);">إلغاء الفرصة</button>';
      } else if (job.status === 'filled') {
        html += '<button class="btn btn--primary" id="btnStartJob">ابدأ التنفيذ</button>';
      } else if (job.status === 'in_progress') {
        html += '<button class="btn btn--success" id="btnCompleteJob">إنهاء الفرصة</button>';
      } else if (job.status === 'completed') {
        html += '<button class="btn btn--warning" id="btnRateWorkers">⭐ قيّم العمال</button>';
      } else if (job.status === 'expired' || job.status === 'cancelled') {
        html += '<button class="btn btn-renew" id="btnRenewJob">🔄 تجديد الفرصة</button>';
      }
    }

    actionsEl.innerHTML = html;

    // ── Attach event handlers ──

    // Apply
    var applyBtn = Yawmia.$id('btnApply');
    if (applyBtn) {
      applyBtn.addEventListener('click', async function () {
        Yawmia.setLoading(applyBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/apply');
          if (res.data.ok) {
            applyBtn.textContent = 'تم التقديم ✓';
            applyBtn.disabled = true;
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

    // Start Job
    var startBtn = Yawmia.$id('btnStartJob');
    if (startBtn) {
      startBtn.addEventListener('click', async function () {
        Yawmia.setLoading(startBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/start');
          if (res.data.ok) {
            window.location.reload();
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

    // Complete Job
    var completeBtn = Yawmia.$id('btnCompleteJob');
    if (completeBtn) {
      completeBtn.addEventListener('click', async function () {
        Yawmia.setLoading(completeBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/complete');
          if (res.data.ok) {
            window.location.reload();
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

    // Cancel Job
    var cancelBtn = Yawmia.$id('btnCancelJob');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({
          title: 'إلغاء الفرصة',
          message: 'متأكد إنك عايز تلغي هذه الفرصة؟ الطلبات المعلقة هتترفض تلقائياً.',
          confirmText: 'إلغاء الفرصة',
          cancelText: 'رجوع',
          danger: true,
        });
        if (!confirmed) return;
        Yawmia.setLoading(cancelBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/cancel');
          if (res.data.ok) {
            window.location.reload();
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

    // Renew Job
    var renewBtn = Yawmia.$id('btnRenewJob');
    if (renewBtn) {
      renewBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({
          title: 'تجديد الفرصة',
          message: 'هل تريد تجديد هذه الفرصة؟',
          confirmText: 'تجديد',
          cancelText: 'إلغاء',
        });
        if (!confirmed) return;
        Yawmia.setLoading(renewBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/renew');
          if (res.data.ok) {
            window.location.reload();
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

    // Check-in
    var checkinBtn = Yawmia.$id('btnCheckIn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          YawmiaToast.error('المتصفح لا يدعم تحديد الموقع');
          return;
        }
        Yawmia.setLoading(checkinBtn, true);
        navigator.geolocation.getCurrentPosition(
          async function (pos) {
            try {
              var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/checkin', {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              });
              if (res.data.ok) {
                checkinBtn.textContent = 'تم الحضور ✓';
                checkinBtn.disabled = true;
                checkinBtn.classList.add('btn--done');
              } else {
                YawmiaToast.error(res.data.error || 'خطأ في تسجيل الحضور');
              }
            } catch (err) {
              YawmiaToast.error('خطأ في الاتصال');
            } finally {
              Yawmia.setLoading(checkinBtn, false);
            }
          },
          function () {
            Yawmia.setLoading(checkinBtn, false);
            YawmiaToast.error('فشل تحديد الموقع — تأكد من تفعيل GPS');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }

    // Check-out
    var checkoutBtn = Yawmia.$id('btnCheckOut');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', async function () {
        Yawmia.setLoading(checkoutBtn, true);
        try {
          var body = {};
          if (navigator.geolocation) {
            try {
              var pos = await new Promise(function (resolve, reject) {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
              });
              body.lat = pos.coords.latitude;
              body.lng = pos.coords.longitude;
            } catch (_) { /* GPS optional for check-out */ }
          }
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/checkout', body);
          if (res.data.ok) {
            checkoutBtn.textContent = 'تم الانصراف ✓';
            checkoutBtn.disabled = true;
            checkoutBtn.classList.add('btn--done');
            if (res.data.attendance && res.data.attendance.hoursWorked != null) {
              YawmiaToast.success('تم تسجيل الانصراف — ساعات العمل: ' + res.data.attendance.hoursWorked + ' ساعة');
            }
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في تسجيل الانصراف');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(checkoutBtn, false);
        }
      });
    }

    // Rate employer (worker) — simplified: redirect to dashboard where rating modal is available
    var rateEmpBtn = Yawmia.$id('btnRateEmployer');
    if (rateEmpBtn) {
      rateEmpBtn.addEventListener('click', function () {
        window.location.href = '/dashboard.html';
      });
    }

    // Rate workers (employer) — redirect to dashboard where rating modal is available
    var rateWrkBtn = Yawmia.$id('btnRateWorkers');
    if (rateWrkBtn) {
      rateWrkBtn.addEventListener('click', function () {
        window.location.href = '/dashboard.html';
      });
    }
  }

  // ── Load Employer Profile ─────────────────────────────────
  async function loadEmployerProfile(employerId) {
    var container = Yawmia.$id('jobEmployerInfo');
    if (!container || !employerId) return;

    try {
      var res = await Yawmia.api('GET', '/api/users/' + employerId + '/public-profile');
      if (res.data.ok && res.data.profile) {
        var p = res.data.profile;
        var ratingHtml = '';
        if (p.rating && p.rating.count > 0) {
          ratingHtml = '<span style="color:var(--color-warning);font-size:0.85rem;">⭐ ' + p.rating.avg + ' (' + p.rating.count + ' تقييم)</span>';
        }

        var verBadge = '';
        if (p.verificationStatus === 'verified') {
          verBadge = ' <span class="verification-badge verification-badge--verified">✓ محقق</span>';
        }

        container.innerHTML =
          '<a href="/user.html?id=' + escapeHtml(employerId) + '" class="worker-link" style="font-weight:600;">' + escapeHtml(p.name || 'بدون اسم') + '</a>' +
          verBadge +
          (p.governorate ? '<span style="color:var(--color-text-muted);font-size:0.85rem;margin-inline-start:0.5rem;">📍 ' + escapeHtml(p.governorate) + '</span>' : '') +
          (ratingHtml ? '<div style="margin-top:0.25rem;">' + ratingHtml + '</div>' : '');
      } else {
        container.innerHTML = '<span style="color:var(--color-text-muted);font-size:0.9rem;">صاحب العمل</span>';
      }
    } catch (_) {
      container.innerHTML = '<span style="color:var(--color-text-muted);font-size:0.9rem;">صاحب العمل</span>';
    }
  }

  // ── Load Payment Info ─────────────────────────────────────
  async function loadPaymentInfo(jId) {
    var section = Yawmia.$id('jobPaymentSection');
    var container = Yawmia.$id('jobPaymentInfo');
    if (!section || !container) return;

    try {
      var res = await Yawmia.api('GET', '/api/jobs/' + jId + '/payment');
      if (res.data.ok && res.data.payment) {
        var pay = res.data.payment;
        var statusLabels = {
          pending: 'في انتظار التأكيد',
          employer_confirmed: 'تم تأكيد الدفع',
          completed: 'مكتمل',
          disputed: 'نزاع',
        };
        var badgeLabel = statusLabels[pay.status] || pay.status;

        container.innerHTML =
          '<div class="payment-info">' +
            '<span class="payment-badge payment-badge--' + escapeHtml(pay.status) + '">' + escapeHtml(badgeLabel) + '</span>' +
            '<span style="font-size:0.9rem;color:var(--color-text-muted);margin-inline-start:0.5rem;">' + pay.amount + ' جنيه</span>' +
          '</div>';

        Yawmia.show('jobPaymentSection');
      }
    } catch (_) {
      // Payment may not exist — no error shown
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  function showError() {
    Yawmia.hide('jobLoading');
    Yawmia.show('jobError');
  }

  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

})();
