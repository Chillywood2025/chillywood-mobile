import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, owner, deferred } from './helpers/notification-settings-mounted-harness.mjs';

test('actual registration and revocation transport retain the initiating owner', async t => {
  const m = await mount(t, { actualPush: true });
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.state.transport.filter(r => r.action === 'register').length, 2);
  assert.ok(m.state.transport.every(r => r.userId === 'owned-user' && r.sessionGeneration === 'session-a'));
  assert.equal(m.state.writes.length, 1);
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.state.transport.filter(r => r.action === 'revoke').length, 1);
  assert.equal(m.toggle('Push alerts').value, false);
  assert.equal(m.section().props.value, 'Not registered');
});

for (const receipt of ['malformed', 'rejected']) test(`actual revocation preserves queued retry after ${receipt} receipt`, async t => {
  const m = await mount(t, { actualPush: true });
  m.state.revokeReceipt = receipt;
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.section().props.value, 'Unable to verify');
  assert.match(m.row('Device push status').props.subtitle, /queued for retry/);
  m.state.revokeReceipt = 'valid';
  await m.act(() => m.notifications.retryPendingPushRevocations());
  assert.equal(m.state.transport.filter(r => r.action === 'revoke').length, 2);
  await m.act(() => m.notifications.retryPendingPushRevocations());
  assert.equal(m.state.transport.filter(r => r.action === 'revoke').length, 2, 'successful retry clears the actual ledger');
});

test('actual registration cannot select a replacement owner after a held permission read', async t => {
  const held = deferred(), entered = deferred(), m = await mount(t, { actualPush: true });
  m.state.permissionReader = () => { entered.resolve(); return held.promise; };
  await m.act(() => m.button('Register Device').onPress()); await entered.promise;
  await m.replace(owner('session-b', 'second-user'));
  await m.act(() => held.resolve({ granted: true, canAskAgain: true }));
  assert.equal(m.state.transport.filter(r => r.action === 'register').length, 0,
    'permission completion must not register a successor account');
  assert.equal(m.state.writes.length, 0);
});

test('actual revocation cannot select a replacement owner while its authority read is held', async t => {
  const held = deferred(), entered = deferred(), m = await mount(t, { actualPush: true });
  m.state.authorityReader = () => {
    if (!m.state.revocations) return { ...m.state.authority, authoritative: true };
    entered.resolve(); return held.promise;
  };
  await m.act(() => m.toggle('Push alerts').onValueChange(false)); await entered.promise;
  const successor = owner('session-b', 'second-user'); await m.replace(successor);
  await m.act(() => held.resolve({ ...successor, authoritative: true }));
  assert.equal(m.state.transport.filter(r => r.action === 'revoke').length, 0,
    'pending revoke must not retarget the successor account');
});

test('actual registration rechecks ownership after held storage before backend dispatch', async t => {
  const held = deferred(), entered = deferred(), m = await mount(t, { actualPush: true });
  let installReads = 0;
  m.state.storageReader = (key, value) => {
    if (key.endsWith('install_id.v1') && ++installReads > 1) { entered.resolve(); return held.promise; }
    return value;
  };
  await m.act(() => m.button('Register Device').onPress()); await entered.promise;
  await m.replace(owner('session-b', 'second-user'));
  await m.act(() => held.resolve('fixture-install'));
  assert.equal(m.state.transport.filter(r => r.action === 'register').length, 0,
    'storage completion must not dispatch a retired registration');
});

test('same-owner registration still permits a slower native provider after Expo succeeds', async t => {
  const native = deferred(), m = await mount(t, { actualPush: true });
  m.state.tokenReader = provider => provider === 'fcm' ? native.promise : { data: 'fixture-expo-token' };
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.state.writes.length, 1);
  assert.deepEqual(m.state.transport.filter(r => r.action === 'register').map(r => r.provider), ['expo']);
  assert.equal(m.button('Refresh').disabled, true, 'slower provider retains the transport lease');
  await m.act(() => native.resolve({ data: 'fixture-fcm-token' }));
  assert.deepEqual(m.state.transport.filter(r => r.action === 'register').map(r => r.provider), ['expo', 'fcm']);
  assert.equal(m.state.transport.filter(r => r.action === 'revoke').length, 0);
  assert.equal(m.button('Refresh').disabled, false);
});

test('late native token retains the lease before a newer push-disable action', async t => {
  const native = deferred(), m = await mount(t, { actualPush: true });
  m.state.tokenReader = provider => provider === 'fcm' ? native.promise : { data: 'fixture-expo-token' };
  await m.act(() => m.button('Register Device').onPress());
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.state.revocations, 0, 'disable cannot overtake unresolved provider work');
  await m.act(() => native.resolve({ data: 'fixture-fcm-token' }));
  assert.deepEqual(m.state.transport.filter(r => r.action === 'register').map(r => r.provider), ['expo', 'fcm']);
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.state.transport.filter(r => r.action === 'revoke').length, 1);
  assert.equal(m.toggle('Push alerts').value, false);
});

for (const mode of ['blur', 'background', 'unmount', 'transient-authority']) test(`held permission cannot register after ${mode}`, async t => {
  const held = deferred(), entered = deferred(), m = await mount(t, { actualPush: true });
  m.state.permissionReader = () => { entered.resolve(); return held.promise; };
  await m.act(() => m.button('Register Device').onPress()); await entered.promise;
  if (mode === 'blur') await m.focus(false);
  else if (mode === 'background') await m.app('background');
  else if (mode === 'unmount') await m.unmount();
  else await m.act(() => { m.authority.publishAccountSessionAuthoritySnapshot(null); m.authority.publishAccountSessionAuthoritySnapshot(owner()); });
  await m.act(() => held.resolve({ granted: true, canAskAgain: true }));
  assert.equal(m.state.transport.filter(r => r.action === 'register').length, 0);
  assert.equal(m.state.writes.length, 0);
});

test('preference helper cannot dispatch a save after its session-read await retires', async t => {
  const m = await mount(t), messages = m.toggle('Messages');
  await m.act(() => {
    messages.onValueChange(false);
    m.authority.publishAccountSessionAuthoritySnapshot(null);
    m.authority.publishAccountSessionAuthoritySnapshot(owner('session-b'));
  });
  assert.equal(m.state.writes.length, 0, 'retired preference upsert must not dispatch');
  assert.equal(m.state.alerts.length, 0);
});

test('preference helper cannot create a missing row after a held read is retired', async t => {
  const held = deferred(), m = await mount(t, { read: () => held.promise });
  await m.act(() => {
    m.authority.publishAccountSessionAuthoritySnapshot(null);
    m.authority.publishAccountSessionAuthoritySnapshot(owner('session-b'));
    held.resolve({ data: null, error: null });
  });
  assert.equal(m.state.writes.length, 0, 'retired missing-row insert must not dispatch');
});
