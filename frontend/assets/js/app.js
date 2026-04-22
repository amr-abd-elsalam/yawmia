// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/app.js — Core Frontend Module (IIFE)
// ═══════════════════════════════════════════════════════════════

var Yawmia = (function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  const state = {
    token: localStorage.getItem('yawmia_token') || null,
    user: JSON.parse(localStorage.getItem('yawmia_user') || 'null'),
    config: null,
  };

  // ── API Base URL ──────────────────────────────────────────
  const API_BASE = window.location.origin;

  // ── API Helper ────────────────────────────────────────────
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
      headers['Authorization'] = 'Bearer ' + state.token;
    }
    const opts = { method, headers };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (!res.ok && res.status === 401) {
      // Session expired
      logout();
    }
    return { status: res.status, data };
  }

  // ── Auth State ────────────────────────────────────────────
  function setAuth(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('yawmia_token', token);
    localStorage.setItem('yawmia_user', JSON.stringify(user));
  }

  function logout() {
    disconnectSSE();
    if (state.token) {
      api('POST', '/api/auth/logout').catch(function () {});
    }
    state.token = null;
    state.user = null;
    localStorage.removeItem('yawmia_token');
    localStorage.removeItem('yawmia_user');
    window.location.href = '/';
  }

  function isLoggedIn() {
    return !!state.token;
  }

  function getUser() {
    return state.user;
  }

  function getToken() {
    return state.token;
  }

  // ── Config ────────────────────────────────────────────────
  async function loadConfig() {
    if (state.config) return state.config;
    var res = await api('GET', '/api/config');
    if (res.status === 200) {
      state.config = res.data;
    }
    return state.config;
  }

  // ── DOM Helpers ───────────────────────────────────────────
  function $(selector) {
    return document.querySelector(selector);
  }

  function $id(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (typeof el === 'string') el = $id(el);
    if (el) el.classList.remove('hidden');
  }

  function hide(el) {
    if (typeof el === 'string') el = $id(el);
    if (el) el.classList.add('hidden');
  }

  function showMessage(elId, text, type) {
    var el = $id(elId);
    if (!el) return;
    el.textContent = text;
    el.className = 'message message--' + type;
  }

  function clearMessage(elId) {
    var el = $id(elId);
    if (!el) return;
    el.textContent = '';
    el.className = 'message';
  }

  function setLoading(btn, loading) {
    if (typeof btn === 'string') btn = $id(btn);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span> جاري...';
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
    }
  }

  // ── Populate Dropdowns ────────────────────────────────────
  async function populateGovernorates(selectId) {
    var config = await loadConfig();
    if (!config || !config.REGIONS) return;
    var select = $id(selectId);
    if (!select) return;
    // Keep first option
    while (select.children.length > 1) select.removeChild(select.lastChild);
    config.REGIONS.governorates.forEach(function (gov) {
      var opt = document.createElement('option');
      opt.value = gov.id;
      opt.textContent = gov.label;
      select.appendChild(opt);
    });
  }

  async function populateCategories(selectId) {
    var config = await loadConfig();
    if (!config || !config.LABOR_CATEGORIES) return;
    var select = $id(selectId);
    if (!select) return;
    while (select.children.length > 1) select.removeChild(select.lastChild);
    config.LABOR_CATEGORIES.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.icon + ' ' + cat.label;
      select.appendChild(opt);
    });
  }

  async function populateCategoriesCheckboxes(containerId) {
    var config = await loadConfig();
    if (!config || !config.LABOR_CATEGORIES) return;
    var container = $id(containerId);
    if (!container) return;
    container.innerHTML = '';
    config.LABOR_CATEGORIES.forEach(function (cat) {
      var label = document.createElement('label');
      label.className = 'checkbox-label';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'categories';
      input.value = cat.id;
      var span = document.createElement('span');
      span.textContent = cat.icon + ' ' + cat.label;
      label.appendChild(input);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  // ── Role Labels ───────────────────────────────────────────
  function roleLabel(role) {
    if (typeof YawmiaUtils !== 'undefined') return YawmiaUtils.roleLabel(role);
    if (role === 'worker') return 'عامل';
    if (role === 'employer') return 'صاحب عمل';
    if (role === 'admin') return 'أدمن';
    return role;
  }

  // ── PWA: Service Worker Registration ──────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) { console.log('SW registered:', reg.scope); })
        .catch(function (err) { console.log('SW registration failed:', err); });
    });
  }

  // ── Render data-icon elements after DOM ready ─────────────
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof YawmiaIcons !== 'undefined') YawmiaIcons.renderAll();
    });
  }

  // ── PWA: Install Prompt Capture ───────────────────────────
  var deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.addEventListener('click', function () {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function () {
          deferredInstallPrompt = null;
          installBtn.style.display = 'none';
        });
      }, { once: true });
    }
  });

  // ── SSE: Real-Time Notifications ──────────────────────────
  var sseConnection = null;

  function connectSSE() {
    if (sseConnection) return; // Already connected
    if (!state.token) return;  // Not logged in

    try {
      var url = API_BASE + '/api/notifications/stream?token=' + encodeURIComponent(state.token);
      sseConnection = new EventSource(url);

      sseConnection.addEventListener('init', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:sse-init', { detail: data }));
        } catch (_) { /* ignore */ }
      });

      sseConnection.addEventListener('notification', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:notification', { detail: data }));
        } catch (_) { /* ignore */ }
      });

      sseConnection.onerror = function () {
        // EventSource auto-reconnects — no manual action needed
      };
    } catch (_) {
      // SSE not supported or connection failed — degrade gracefully
      sseConnection = null;
    }
  }

  function disconnectSSE() {
    if (sseConnection) {
      sseConnection.close();
      sseConnection = null;
    }
  }

  // ── Web Push: Subscribe ───────────────────────────────────
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function subscribeToPush() {
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;
    if (!state.token) return;
    try {
      var registration = await navigator.serviceWorker.ready;
      var existing = await registration.pushManager.getSubscription();
      if (existing) return; // Already subscribed

      var permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Get VAPID public key from server config
      var cfg = await loadConfig();
      var vapidKey = cfg && cfg.WEB_PUSH && cfg.WEB_PUSH.vapidPublicKey;
      if (!vapidKey) return;

      var subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Extract keys
      var p256dhKey = subscription.getKey('p256dh');
      var authKey = subscription.getKey('auth');
      if (!p256dhKey || !authKey) return;

      var p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(p256dhKey)));
      var auth = btoa(String.fromCharCode.apply(null, new Uint8Array(authKey)));

      await api('POST', '/api/push/subscribe', {
        endpoint: subscription.endpoint,
        keys: { p256dh: p256dh, auth: auth },
      });
    } catch (_) {
      // Push subscription failure is non-fatal
    }
  }

  // ── Global Error Boundary ─────────────────────────────────
  window.addEventListener('unhandledrejection', function (e) {
    console.error('[Yawmia] Unhandled rejection:', e.reason);
    if (typeof YawmiaToast !== 'undefined') {
      YawmiaToast.error('حصل خطأ غير متوقع — حاول تاني');
    }
  });

  window.addEventListener('error', function (e) {
    console.error('[Yawmia] Unhandled error:', e.error || e.message);
    if (typeof YawmiaToast !== 'undefined') {
      YawmiaToast.error('حصل خطأ غير متوقع');
    }
  });

  // ── API with Retry (Exponential Backoff) ──────────────────
  async function apiWithRetry(method, path, body, retryOpts) {
    var opts = retryOpts || {};
    var maxRetries = typeof opts.maxRetries === 'number' ? opts.maxRetries : 3;
    var baseDelayMs = typeof opts.baseDelayMs === 'number' ? opts.baseDelayMs : 1000;
    var lastResult = null;

    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        var result = await api(method, path, body);
        // Don't retry on 4xx (client errors) — only retry on 5xx
        if (result.status < 500) {
          return result;
        }
        lastResult = result;
      } catch (err) {
        // Network error (fetch threw)
        lastResult = { status: 0, data: { error: 'خطأ في الاتصال', code: 'NETWORK_ERROR' } };
      }

      // Don't wait after the last attempt
      if (attempt < maxRetries) {
        var delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(function (resolve) { setTimeout(resolve, delay); });
      }
    }

    return lastResult;
  }

  // ── Online/Offline Detection ──────────────────────────────
  var offlineBanner = null;

  function showOfflineBanner() {
    if (offlineBanner) return;
    offlineBanner = document.createElement('div');
    offlineBanner.id = 'yawmia-offline-banner';
    offlineBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:#fff;text-align:center;padding:0.6rem 1rem;font-size:0.9rem;font-weight:600;z-index:9999;font-family:inherit;direction:rtl;';
    offlineBanner.textContent = '📡 أنت غير متصل بالإنترنت';
    document.body.prepend(offlineBanner);
  }

  function hideOfflineBanner() {
    if (offlineBanner && offlineBanner.parentNode) {
      offlineBanner.parentNode.removeChild(offlineBanner);
      offlineBanner = null;
    }
  }

  window.addEventListener('offline', function () {
    showOfflineBanner();
  });

  window.addEventListener('online', function () {
    hideOfflineBanner();
    if (typeof YawmiaToast !== 'undefined') {
      YawmiaToast.success('تم استعادة الاتصال بالإنترنت');
    }
  });

  // Check on page load
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    showOfflineBanner();
  }

  // ── Public API ────────────────────────────────────────────
  return {
    api: api,
    state: state,
    setAuth: setAuth,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getUser: getUser,
    getToken: getToken,
    loadConfig: loadConfig,
    $: $,
    $id: $id,
    show: show,
    hide: hide,
    showMessage: showMessage,
    clearMessage: clearMessage,
    setLoading: setLoading,
    populateGovernorates: populateGovernorates,
    populateCategories: populateCategories,
    populateCategoriesCheckboxes: populateCategoriesCheckboxes,
    roleLabel: roleLabel,
    connectSSE: connectSSE,
    disconnectSSE: disconnectSSE,
    subscribeToPush: subscribeToPush,
    apiWithRetry: apiWithRetry,
  };
})();
