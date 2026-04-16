// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/auth.js — Auth UI Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // If already logged in, redirect to dashboard
  if (Yawmia.isLoggedIn()) {
    window.location.href = '/frontend/dashboard.html';
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
          } else {
            window.location.href = '/frontend/dashboard.html';
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
          window.location.href = '/frontend/dashboard.html';
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
