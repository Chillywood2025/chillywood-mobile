import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

const userId = 'a1000000-0000-4000-8000-000000000001';
const authority = { userId, sessionGeneration: 'session-a', restoreOnly: false };
const roleAuthority = loadStubbed('_lib/platformRoleAuthority.ts');
const membership = (role, permissionKeys = [], overrides = {}) => ({
  role, userId, status: 'active', expiresAt: null, permissionKeys, ...overrides,
});

function harness(options = {}) {
  let current = options.authority === undefined ? authority : options.authority;
  const query = {
    select() { return this; }, eq() { return this; },
    async order() {
      if (options.onRead) current = options.onRead;
      return { data: options.rows ?? [], error: options.roleError ?? null };
    },
  };
  return loadStubbed('_lib/moderation.ts', {
    './platformRoleAuthority': roleAuthority,
    './supabase': { supabase: {
      from() { return query; },
      async rpc() { return { data: options.permissions ?? [], error: options.permissionError ?? null }; },
    } },
    './accountSessionAuthority': {
      readCurrentAccountSessionAuthority: async () => current,
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId
        && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly,
    },
  });
}

test('staff assignment helpers follow owner/operator/moderator RPC hierarchy', () => {
  const api = harness();
  for (const role of ['owner', 'super_admin', 'operator', 'moderator']) {
    for (const key of [null, 'admin_grants', 'manage_moderators', 'admin.lower_role.manage', 'audit_review']) {
      const rows = [membership(role, key ? [key] : [])];
      assert.equal(api.canManageAdminRoleAssignments(rows), role === 'owner', `${role}/${key}: Admin`);
      assert.equal(api.canManageModeratorRoleAssignments(rows), role === 'owner'
        || (role === 'operator' && ['manage_moderators', 'admin.lower_role.manage'].includes(key)),
      `${role}/${key}: Moderator`);
    }
  }
});

test('inactive, expired, malformed expiry and absent roles cannot manage staff', () => {
  const api = harness();
  for (const overrides of [{ status: 'revoked' }, { status: '' },
    { expiresAt: '2000-01-01T00:00:00Z' }, { expiresAt: 'invalid' }]) {
    for (const role of ['owner', 'operator', 'super_admin', 'moderator']) {
      const rows = [membership(role, ['admin_grants', 'manage_moderators'], overrides)];
      assert.equal(api.canManageAdminRoleAssignments(rows), false);
      assert.equal(api.canManageModeratorRoleAssignments(rows), false);
    }
  }
  assert.equal(api.canManageAdminRoleAssignments([]), false);
  assert.equal(api.canManageModeratorRoleAssignments([]), false);
  assert.equal(api.canManageModeratorRoleAssignments([
    membership('super_admin'), membership('operator'),
  ]), false, 'super_admin must not bypass the operator permission requirement');
  assert.equal(api.canManageModeratorRoleAssignments([
    membership('operator'), membership('moderator', ['manage_moderators'], { status: 'revoked' }),
  ]), false, 'revoked membership cannot supply permission');
});

test('membership readback fails closed on missing, restore-only, changed or failed authority', async () => {
  const rows = [{ id: 1, role: 'operator', user_id: userId, status: 'active', expires_at: null }];
  for (const options of [{ authority: null }, { authority: { ...authority, restoreOnly: true } },
    { onRead: { ...authority, sessionGeneration: 'session-b' } }]) {
    const api = harness({ rows, permissions: ['manage_moderators'], ...options });
    const result = await api.readMyPlatformRoleMemberships();
    assert.equal(result.length, 0);
    assert.equal(api.canManageModeratorRoleAssignments(result), false);
  }
  const failed = harness({ rows, roleError: new Error('unavailable') });
  await assert.rejects(failed.readMyPlatformRoleMemberships(), /unavailable/);
  const permissionsFailed = harness({ rows, permissionError: { message: 'unavailable' } });
  assert.equal(permissionsFailed.canManageModeratorRoleAssignments(
    await permissionsFailed.readMyPlatformRoleMemberships()), false);
  const foreign = harness({ rows: [{ ...rows[0], user_id: 'a1000000-0000-4000-8000-000000000002' }],
    permissions: ['manage_moderators'] });
  assert.equal((await foreign.readMyPlatformRoleMemberships()).length, 0);
});

test('literal scoped alias from RPC enables only operator moderator management', async () => {
  const api = harness({ rows: [{ id: 1, role: 'operator', user_id: userId, status: 'active' }],
    permissions: ['admin.lower_role.manage'] });
  const rows = await api.readMyPlatformRoleMemberships();
  assert.equal(api.canManageModeratorRoleAssignments(rows), true);
  assert.equal(api.canManageAdminRoleAssignments(rows), false);
});
