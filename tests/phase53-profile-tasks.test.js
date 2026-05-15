import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTasksFromUser, taskUrl, taskPriority } from '../server/services/profileTasks.js';
import { calculateCompleteness } from '../server/services/profileCompleteness.js';

function baseUser(overrides = {}) {
  return {
    id: 'usr_test',
    phone: '01012345678',
    role: 'worker',
    name: '',
    governorate: '',
    categories: [],
    lat: null,
    lng: null,
    rating: { avg: 0, count: 0 },
    status: 'active',
    termsAcceptedAt: null,
    termsVersion: null,
    notificationPreferences: null,
    verificationStatus: 'unverified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('Phase 53 profile tasks: user without terms gets accept_terms', () => {
  const user = baseUser({
    name: 'عامل',
    governorate: 'cairo',
    categories: ['general'],
    lat: 30,
    lng: 31,
    verificationStatus: 'verified',
    termsAcceptedAt: null,
  });

  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  assert.ok(tasks.some(t => t.id === 'accept_terms'));
  assert.equal(taskUrl('accept_terms'), '/terms.html?accept=1');
});

test('Phase 53 profile tasks: worker without categories gets select_categories', () => {
  const user = baseUser({
    name: 'عامل',
    governorate: 'cairo',
    categories: [],
    lat: 30,
    lng: 31,
    verificationStatus: 'verified',
    termsAcceptedAt: new Date().toISOString(),
  });

  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  assert.ok(tasks.some(t => t.id === 'select_categories'));
});

test('Phase 53 profile tasks: employer does not get categories task', () => {
  const user = baseUser({
    role: 'employer',
    name: 'صاحب عمل',
    governorate: 'cairo',
    categories: [],
    lat: 30,
    lng: 31,
    verificationStatus: 'verified',
    termsAcceptedAt: new Date().toISOString(),
  });

  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  assert.equal(tasks.some(t => t.id === 'select_categories'), false);
});

test('Phase 53 profile tasks: user without location gets add_location', () => {
  const user = baseUser({
    name: 'عامل',
    governorate: 'cairo',
    categories: ['general'],
    lat: null,
    lng: null,
    verificationStatus: 'verified',
    termsAcceptedAt: new Date().toISOString(),
  });

  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  assert.ok(tasks.some(t => t.id === 'add_location'));
});

test('Phase 53 profile tasks: unverified user gets verify_identity', () => {
  const user = baseUser({
    name: 'عامل',
    governorate: 'cairo',
    categories: ['general'],
    lat: 30,
    lng: 31,
    verificationStatus: 'unverified',
    termsAcceptedAt: new Date().toISOString(),
  });

  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  assert.ok(tasks.some(t => t.id === 'verify_identity'));
});

test('Phase 53 profile tasks: pending verification does not show verify_identity', () => {
  const user = baseUser({
    name: 'عامل',
    governorate: 'cairo',
    categories: ['general'],
    lat: 30,
    lng: 31,
    verificationStatus: 'pending',
    termsAcceptedAt: new Date().toISOString(),
  });

  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  assert.equal(tasks.some(t => t.id === 'verify_identity'), false);
});

test('Phase 53 profile tasks: completed tasks disappear', () => {
  const user = baseUser({
    name: 'عامل كامل',
    governorate: 'cairo',
    categories: ['general'],
    lat: 30,
    lng: 31,
    verificationStatus: 'verified',
    termsAcceptedAt: new Date().toISOString(),
    notificationPreferences: { inApp: true, whatsapp: true, sms: false },
  });

  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  assert.equal(tasks.length, 0);
  assert.equal(completeness.score, 100);
});

test('Phase 53 profile tasks: tasks sorted by priority', () => {
  const user = baseUser();
  const completeness = calculateCompleteness(user);
  const tasks = buildTasksFromUser(user, completeness);

  const priorities = tasks.map(t => t.priority);
  const order = { critical: 0, high: 1, medium: 2, low: 3 };

  for (let i = 1; i < priorities.length; i++) {
    assert.ok(order[priorities[i - 1]] <= order[priorities[i]]);
  }
});

test('Phase 53 profile tasks: task URLs are safe relative URLs', () => {
  const ids = [
    'accept_terms',
    'add_name',
    'select_governorate',
    'select_categories',
    'add_location',
    'verify_identity',
    'enable_notifications',
    'create_availability_ad',
    'create_availability_window',
  ];

  for (const id of ids) {
    const url = taskUrl(id);
    assert.ok(url.startsWith('/'));
    assert.equal(url.includes('http://'), false);
    assert.equal(url.includes('https://'), false);
    assert.equal(url.includes('..'), false);
  }
});

test('Phase 53 profile tasks: taskPriority returns known priority', () => {
  assert.equal(taskPriority('accept_terms'), 'critical');
  assert.equal(taskPriority('select_categories'), 'high');
  assert.equal(taskPriority('verify_identity'), 'medium');
  assert.equal(taskPriority('enable_notifications'), 'low');
});
