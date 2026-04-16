// tests/users.test.js
// ═══════════════════════════════════════════════════════════════
// User Service Tests (~10 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-users-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let create, findByPhone, findById, update, listAll, countByRole;

before(async () => {
  const mod = await import('../server/services/users.js');
  create = mod.create;
  findByPhone = mod.findByPhone;
  findById = mod.findById;
  update = mod.update;
  listAll = mod.listAll;
  countByRole = mod.countByRole;
});

describe('Users Service', () => {

  it('U-01: creates user with correct format', async () => {
    const user = await create('01012345678', 'worker');
    assert.ok(user.id);
    assert.ok(user.id.startsWith('usr_'));
    assert.strictEqual(user.phone, '01012345678');
    assert.strictEqual(user.role, 'worker');
    assert.strictEqual(user.name, '');
    assert.strictEqual(user.status, 'active');
    assert.ok(user.createdAt);
  });

  it('U-02: finds user by phone', async () => {
    const created = await create('01023456789', 'employer');
    const found = await findByPhone('01023456789');
    assert.ok(found);
    assert.strictEqual(found.id, created.id);
    assert.strictEqual(found.phone, '01023456789');
  });

  it('U-03: returns null for unknown phone', async () => {
    const found = await findByPhone('01099999998');
    assert.strictEqual(found, null);
  });

  it('U-04: finds user by ID', async () => {
    const created = await create('01034567890', 'worker');
    const found = await findById(created.id);
    assert.ok(found);
    assert.strictEqual(found.phone, '01034567890');
  });

  it('U-05: returns null for unknown ID', async () => {
    const found = await findById('usr_nonexistent');
    assert.strictEqual(found, null);
  });

  it('U-06: updates user fields', async () => {
    const user = await create('01045678901', 'worker');
    const updated = await update(user.id, {
      name: 'أحمد محمد',
      governorate: 'cairo',
      categories: ['farming', 'loading'],
    });
    assert.strictEqual(updated.name, 'أحمد محمد');
    assert.strictEqual(updated.governorate, 'cairo');
    assert.deepStrictEqual(updated.categories, ['farming', 'loading']);
  });

  it('U-07: update does not overwrite protected fields', async () => {
    const user = await create('01056789012', 'worker');
    const updated = await update(user.id, {
      phone: '01099999999',  // should not change
      role: 'admin',         // should not change
      id: 'usr_hacked',     // should not change
    });
    assert.strictEqual(updated.phone, '01056789012');
    assert.strictEqual(updated.role, 'worker');
    assert.strictEqual(updated.id, user.id);
  });

  it('U-08: update returns null for non-existent user', async () => {
    const result = await update('usr_nonexistent', { name: 'test' });
    assert.strictEqual(result, null);
  });

  it('U-09: update sets updatedAt timestamp', async () => {
    const user = await create('01067890123', 'employer');
    const before = new Date(user.updatedAt);
    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));
    const updated = await update(user.id, { name: 'محمد' });
    const after = new Date(updated.updatedAt);
    assert.ok(after >= before);
  });

  it('U-10: listAll returns all users', async () => {
    const users = await listAll();
    assert.ok(Array.isArray(users));
    assert.ok(users.length >= 5); // We created several users above
  });

  it('U-11: countByRole returns correct counts', async () => {
    const counts = await countByRole();
    assert.ok(counts.total >= 5);
    assert.ok(counts.worker >= 1);
    assert.ok(counts.employer >= 1);
  });
});
