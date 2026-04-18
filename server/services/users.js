// ═══════════════════════════════════════════════════════════════
// server/services/users.js — User CRUD with phone index
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { atomicWrite, readJSON, getRecordPath, readIndex, writeIndex, listJSON, getCollectionPath } from './database.js';

/**
 * Create a new user
 */
export async function create(phone, role) {
  const id = 'usr_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const user = {
    id,
    phone,
    role,
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
    verificationSubmittedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  // Save user file
  const userPath = getRecordPath('users', id);
  await atomicWrite(userPath, user);

  // Update phone index
  const phoneIndex = await readIndex('phoneIndex');
  phoneIndex[phone] = id;
  await writeIndex('phoneIndex', phoneIndex);

  return user;
}

/**
 * Find user by phone number (via index)
 */
export async function findByPhone(phone) {
  const phoneIndex = await readIndex('phoneIndex');
  const userId = phoneIndex[phone];
  if (!userId) return null;
  return findById(userId);
}

/**
 * Find user by ID
 */
export async function findById(userId) {
  const userPath = getRecordPath('users', userId);
  return await readJSON(userPath);
}

/**
 * Update user fields
 */
export async function update(userId, fields) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedUser = {
    ...user,
    ...fields,
    id: user.id,         // prevent overwrite
    phone: user.phone,   // prevent overwrite
    role: user.role,     // prevent overwrite
    createdAt: user.createdAt,  // prevent overwrite
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);

  return updatedUser;
}

/**
 * List all users
 */
export async function listAll() {
  const usersDir = getCollectionPath('users');
  const allFiles = await listJSON(usersDir);
  // Filter out the phone-index.json (it's not a user record)
  return allFiles.filter(item => item.id && item.id.startsWith('usr_'));
}

/**
 * Count users by role
 */
export async function countByRole() {
  const users = await listAll();
  const counts = { worker: 0, employer: 0, admin: 0, total: users.length };
  for (const user of users) {
    if (counts[user.role] !== undefined) counts[user.role]++;
  }
  return counts;
}

/**
 * Ban a user (set status to 'banned')
 * @param {string} userId
 * @param {string} reason
 * @returns {Promise<object|null>}
 */
export async function banUser(userId, reason = '') {
  const user = await findById(userId);
  if (!user) return null;
  if (user.role === 'admin') return null; // Cannot ban admins

  const updatedUser = {
    ...user,
    status: 'banned',
    bannedAt: new Date().toISOString(),
    banReason: reason,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}

/**
 * Unban a user (set status back to 'active')
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function unbanUser(userId) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedUser = {
    ...user,
    status: 'active',
    bannedAt: null,
    banReason: null,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}

/**
 * Accept terms of service
 * @param {string} userId
 * @param {string} version
 * @returns {Promise<object|null>}
 */
export async function acceptTerms(userId, version) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedUser = {
    ...user,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: version,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}

/**
 * Soft-delete a user account (anonymize + remove phone from index)
 * Cannot delete admin accounts.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function softDelete(userId) {
  const user = await findById(userId);
  if (!user) return null;
  if (user.role === 'admin') return null;

  const now = new Date().toISOString();
  const updatedUser = {
    ...user,
    status: 'deleted',
    name: 'مستخدم محذوف',
    phone: `deleted_${user.id}`,
    categories: [],
    lat: null,
    lng: null,
    deletedAt: now,
    updatedAt: now,
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);

  // Remove phone from index (allows reuse)
  const phoneIndex = await readIndex('phoneIndex');
  if (phoneIndex[user.phone]) {
    delete phoneIndex[user.phone];
    await writeIndex('phoneIndex', phoneIndex);
  }

  return updatedUser;
}

/**
 * Update notification preferences
 * inApp is always forced to true — cannot be disabled by user.
 * Partial updates: only provided fields change, rest preserved.
 * @param {string} userId
 * @param {{ inApp?: boolean, whatsapp?: boolean, sms?: boolean }} preferences
 * @returns {Promise<object|null>}
 */
export async function updateNotificationPreferences(userId, preferences) {
  const user = await findById(userId);
  if (!user) return null;

  const updatedPrefs = {
    inApp: true,
    whatsapp: typeof preferences.whatsapp === 'boolean'
      ? preferences.whatsapp
      : (user.notificationPreferences?.whatsapp ?? true),
    sms: typeof preferences.sms === 'boolean'
      ? preferences.sms
      : (user.notificationPreferences?.sms ?? false),
  };

  const updatedUser = {
    ...user,
    notificationPreferences: updatedPrefs,
    updatedAt: new Date().toISOString(),
  };

  const userPath = getRecordPath('users', userId);
  await atomicWrite(userPath, updatedUser);
  return updatedUser;
}
