import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, owner, deferred, preferenceRead, preferenceRow } from './helpers/notification-settings-mounted-harness.mjs';

test('pure manual refresh can be replaced on return while its stale read remains held', async t => {
  const held = deferred(), m = await mount(t);
  m.state.read = () => held.promise;
  await m.act(() => m.button('Refresh').onPress());
  await m.focus(false);
  m.state.read = null; m.state.rows.set('owned-user', preferenceRow({ ...m.state.rows.get('owned-user'), messages_enabled: false }));
  await m.focus(true);
  assert.equal(m.state.reads.length, 3, 'pure read does not retain a mutation lease');
  assert.equal(m.toggle('Messages').value, false);
  assert.equal(m.button('Refresh').disabled, false);
  await m.act(() => held.resolve(preferenceRead({ messages_enabled: true })));
  assert.equal(m.toggle('Messages').value, false);
});

for (const lifecycle of ['focus', 'background', 'same-user-keyed-root']) {
  for (const timing of ['before return', 'after return']) test(`durable preference settlement reconciles ${lifecycle}, ${timing}`, async t => {
    const held = deferred(); let m;
    m = await mount(t, { write: async (_request, _row, commit) => {
      await held.promise;
      return commit();
    } });
    const captured = m.toggle('Messages');
    await m.act(() => captured.onValueChange(false));
    if (lifecycle === 'focus') await m.focus(false);
    else if (lifecycle === 'background') await m.app('background');
    else await m.replace(null);
    if (timing === 'before return') await m.act(() => held.resolve());
    if (lifecycle === 'focus') await m.focus(true);
    else if (lifecycle === 'background') await m.app('active');
    else await m.replace(owner('session-b'));
    if (timing === 'after return') {
      assert.equal(m.button('Refresh').disabled, true, 'unsettled durable save blocks a new visit');
      await m.act(() => captured.onValueChange(true));
      if (lifecycle !== 'same-user-keyed-root') await m.act(() => m.toggle('Messages').onValueChange(true));
      assert.equal(m.state.writes.length, 1, 'old and current callbacks cannot overtake the dispatched save');
      await m.act(() => held.resolve());
    }
    assert.equal(m.state.rows.get('owned-user').messages_enabled, false);
    assert.equal(m.toggle('Messages').value, false, 'visible preferences match the durable commit');
    assert.equal(m.toggle('Messages').disabled, false);
    assert.equal(m.state.alerts.length, 0);
  });
}

test('dispatched FCM backend retains install lease after Expo result until disable can safely follow', async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.backendBarrier = body => body.action === 'register' && body.provider === 'fcm' ? held.promise : undefined;
  const capturedRegister = m.button('Register Device');
  await m.act(() => capturedRegister.onPress());
  assert.equal(m.state.transport.filter(x => x.action === 'register').length, 2, 'both providers were actually dispatched');
  assert.equal(m.state.writes.length, 1, 'verified Expo result can save the requested preference');
  assert.equal(m.section().props.value, 'Device change pending');
  await m.act(() => {
    m.toggle('Push alerts').onValueChange(true);
    m.toggle('Push alerts').onValueChange(false);
    capturedRegister.onPress();
  });
  let blocked;
  await m.act(async () => { blocked = await m.notifications.refreshPushRegistrationIfGranted(); });
  assert.equal(blocked.status, 'error');
  assert.equal(m.state.writes.length, 1, 'enable, disable and repeated registration cannot overtake unresolved provider work');
  assert.equal(m.state.revocations, 0, 'disable cannot overtake a dispatched FCM backend');
  await m.act(() => held.resolve());
  assert.equal(m.button('Refresh').disabled, false);
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.deepEqual(m.state.backendCommits.map(x => `${x.action}:${x.provider || ''}`), ['register:expo', 'register:fcm', 'revoke:']);
  assert.equal(m.state.installOwner, null);
  assert.equal(m.toggle('Push alerts').value, false);
  assert.equal(m.section().props.value, 'Not registered');
});

test('atomic missing-row read cannot overwrite a newer same-user remount save', async t => {
  const held = deferred(); let m;
  m = await mount(t, { read: async (_request, _row, commit) => {
    await held.promise;
    return commit();
  } });
  assert.equal(m.state.reads.length, 1);
  assert.equal(m.state.rows.size, 0, 'initialization is held at the atomic server boundary');
  m.state.read = null;
  await m.replace(owner('session-b'));
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.equal(m.state.rows.get('owned-user').messages_enabled, false);
  await m.act(() => held.resolve());
  assert.equal(m.toggle('Messages').value, false);
  assert.equal(m.state.rows.get('owned-user').messages_enabled, false, 'late initialization never replaces an existing row');
  assert.equal(m.button('Refresh').disabled, false);
  assert.equal(m.state.writes.length, 1);
});

test('settled provider rejection releases the install lease for a successful current retry', async t => {
  const m = await mount(t, { actualPush: true });
  m.state.backendBarrier = () => { throw new Error('modeled final transport rejection'); };
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.section().props.value, 'Unable to verify');
  assert.equal(m.button('Register Device').disabled, false);
  assert.equal(m.state.writes.length, 0);
  assert.equal(m.state.authoritySubscriptions, 1);
  m.state.backendBarrier = null;
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.section().props.value, 'Registered');
  assert.equal(m.state.writes.length, 1);
  assert.equal(m.state.authoritySubscriptions, 1);
});

test('actual provider deadline retains unresolved transport debt and later reconciles backend truth', async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.backendBarrier = body => body.action === 'register' ? held.promise : undefined;
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.state.transport.filter(x => x.action === 'register').length, 2);
  await m.expireProviderDeadline();
  assert.equal(m.section().props.value, 'Device change pending');
  assert.match(m.row('Device push status').props.subtitle, /still unresolved.*timeout does not cancel/);
  assert.equal(m.state.writes.length, 0, 'deadline is not a successful registration receipt');
  assert.equal(m.button('Refresh').disabled, true);
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.state.revocations, 0);
  await m.act(() => held.resolve());
  assert.equal(m.section().props.value, 'Registered', 'settlement triggers a current backend reread');
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.state.installOwner, null);
});

test('never-settled provider stays explicitly uncertain across unmount and releases subscription only on settlement', async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.backendBarrier = () => held.promise;
  await m.act(() => m.button('Register Device').onPress());
  await m.expireProviderDeadline();
  await m.app('background'); await m.app('active');
  assert.equal(m.button('Refresh').disabled, true);
  assert.match(m.row('Device push status').props.subtitle, /changes are paused/);
  await m.unmount();
  assert.equal(m.state.authoritySubscriptions, 1, 'transport owns one subscription while outcome remains unknown');
  await m.act(() => { m.authority.publishAccountSessionAuthoritySnapshot(null); held.reject(new Error('modeled final transport rejection')); });
  assert.equal(m.state.authoritySubscriptions, 0, 'settled transport releases its subscription even after screen unmount');
  assert.equal(m.notifications.hasPendingNotificationPushRegistration(), false);
});

for (const replacement of [owner('session-b'), owner('session-b', 'other-user')]) test(`install lease blocks successor registration until old backend cleanup: ${replacement.userId}`, async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.backendBarrier = body => body.action === 'register' && body.userId === 'owned-user' && body.sessionGeneration === 'session-a'
    && body.provider === 'fcm' ? held.promise : undefined;
  await m.act(() => m.button('Register Device').onPress());
  await m.replace(replacement);
  assert.equal(m.button('Register Device').disabled, true);
  let blocked;
  await m.act(async () => { blocked = await m.notifications.refreshPushRegistrationIfGranted(); });
  assert.equal(blocked.status, 'error', 'ownerless automatic registration shares the install lease');
  assert.equal(m.state.transport.filter(x => x.action === 'register').length, 2);
  await m.act(() => held.resolve());
  assert.equal(m.state.installOwner, null, 'old exact-session cleanup completes before new registration');
  await m.act(() => m.button('Register Device').onPress());
  assert.deepEqual(m.state.installOwner, { userId: replacement.userId, sessionGeneration: replacement.sessionGeneration });
  const revokes = m.state.transport.filter(x => x.action === 'revoke').length;
  await m.act(() => m.notifications.retryPendingPushRevocations());
  assert.equal(m.state.transport.filter(x => x.action === 'revoke').length, revokes, 'no retired cleanup remains to undo the new registration');
});

test('same-session screen retirement cannot queue cleanup that revokes a newer legitimate registration', async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.backendBarrier = body => body.provider === 'fcm' ? held.promise : undefined;
  await m.act(() => m.button('Register Device').onPress());
  await m.focus(false); await m.focus(true);
  await m.act(() => held.resolve());
  assert.equal(m.section().props.value, 'Registered');
  m.state.backendBarrier = null;
  await m.act(() => m.notifications.requestPushPermissionAndRegister());
  await m.act(() => m.notifications.retryPendingPushRevocations());
  assert.equal(m.state.transport.filter(x => x.action === 'revoke').length, 0);
  assert.deepEqual(m.state.installOwner, { userId: 'owned-user', sessionGeneration: 'session-a' });
});

test('queued exact cleanup blocks ABA registration until receipt is confirmed then cannot revoke its retry', async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.backendBarrier = body => body.provider === 'fcm' ? held.promise : undefined;
  await m.act(() => m.button('Register Device').onPress());
  await m.replace(owner('session-b', 'other-user'));
  m.state.revokeReceipt = 'rejected';
  await m.act(() => held.resolve());
  await m.replace(owner());
  let blocked;
  await m.act(async () => { blocked = await m.notifications.requestPushPermissionAndRegister(); });
  assert.equal(blocked.status, 'error');
  assert.match(blocked.message, /revocation is still unresolved/);
  assert.equal(m.state.transport.filter(x => x.action === 'register').length, 2, 'queued cleanup must prevent same-generation ABA registration');
  m.state.revokeReceipt = 'valid'; m.state.backendBarrier = null;
  await m.act(() => m.notifications.requestPushPermissionAndRegister());
  assert.equal(m.state.transport.filter(x => x.action === 'register').length, 4);
  const commits = m.state.backendCommits.length;
  await m.act(() => m.notifications.retryPendingPushRevocations());
  assert.equal(m.state.backendCommits.length, commits);
  assert.deepEqual(m.state.installOwner, { userId: 'owned-user', sessionGeneration: 'session-a' });
});

for (const method of ['requestPushPermissionAndRegister', 'refreshPushRegistrationIfGranted']) {
  for (const transition of ['account', 'session', 'ABA']) test(`ownerless ${method} captures ownership before permission: ${transition}`, async t => {
    const held = deferred(), m = await mount(t, { actualPush: true });
    m.state.permissionReader = () => held.promise;
    let operation;
    await m.act(() => { operation = m.notifications[method](); });
    await m.act(() => {
      m.state.authority = transition === 'account' ? owner('session-b', 'other-user') : transition === 'session' ? owner('session-b') : owner();
      m.authority.publishAccountSessionAuthoritySnapshot(null);
      m.authority.publishAccountSessionAuthoritySnapshot(m.state.authority);
      held.resolve({ granted: true, canAskAgain: true });
    });
    const result = await operation;
    assert.equal(result.status, 'error');
    assert.equal(m.state.nativeTokens, 0, 'no provider token is requested for a retired owner');
    assert.equal(m.state.transport.filter(x => x.action === 'register').length, 0);
    assert.equal(m.state.authoritySubscriptions, 1, 'only the mounted Settings listener remains');
  });
}
