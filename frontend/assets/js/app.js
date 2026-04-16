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
    if (role === 'worker') return 'عامل';
    if (role === 'employer') return 'صاحب عمل';
    if (role === 'admin') return 'أدمن';
    return role;
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
  };
})();
