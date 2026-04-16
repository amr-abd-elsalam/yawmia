// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/jobs.js — Jobs UI Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // If not logged in, redirect
  if (!Yawmia.isLoggedIn()) {
    window.location.href = '/frontend/index.html';
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

  // ── Load Jobs ─────────────────────────────────────────────
  loadJobs();

  var btnFilterJobs = Yawmia.$id('btnFilterJobs');
  if (btnFilterJobs) {
    btnFilterJobs.addEventListener('click', function () {
      loadJobs();
    });
  }

  async function loadJobs() {
    var jobsList = Yawmia.$id('jobsList');
    if (!jobsList) return;
    jobsList.innerHTML = '<p class="empty-state">جاري تحميل الفرص...</p>';

    var gov = Yawmia.$id('filterGov') ? Yawmia.$id('filterGov').value : '';
    var cat = Yawmia.$id('filterCat') ? Yawmia.$id('filterCat').value : '';

    var query = '/api/jobs?';
    if (gov) query += 'governorate=' + encodeURIComponent(gov) + '&';
    if (cat) query += 'category=' + encodeURIComponent(cat) + '&';

    try {
      var res = await Yawmia.api('GET', query);
      if (res.data.ok && res.data.jobs.length > 0) {
        jobsList.innerHTML = '';
        res.data.jobs.forEach(function (job) {
          jobsList.appendChild(createJobCard(job));
        });
      } else {
        jobsList.innerHTML = '<p class="empty-state">لا توجد فرص متاحة حالياً</p>';
      }
    } catch (err) {
      jobsList.innerHTML = '<p class="empty-state">خطأ في تحميل الفرص</p>';
    }
  }

  function createJobCard(job) {
    var card = document.createElement('div');
    card.className = 'job-card';
    card.innerHTML =
      '<div class="job-card__header">' +
        '<span class="job-card__title">' + escapeHtml(job.title) + '</span>' +
        '<span class="job-card__wage">' + job.dailyWage + ' جنيه/يوم</span>' +
      '</div>' +
      '<div class="job-card__meta">' +
        '<span>📍 ' + escapeHtml(job.governorate) + '</span>' +
        '<span>📅 ' + job.startDate + '</span>' +
        '<span>⏱ ' + job.durationDays + ' يوم</span>' +
      '</div>' +
      (job.description ? '<p class="job-card__desc">' + escapeHtml(job.description) + '</p>' : '') +
      '<div class="job-card__footer">' +
        '<span class="job-card__workers">👷 ' + job.workersAccepted + '/' + job.workersNeeded + ' عامل</span>' +
        (user.role === 'worker' ? '<button class="btn btn--primary btn--sm btn-apply" data-job-id="' + job.id + '">تقدّم</button>' : '') +
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
