import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, owner, deferred } from './helpers/notification-settings-mounted-harness.mjs';

const register = (m, method) => method === 'explicit'
  ? m.notifications.requestPushPermissionAndRegister({ authority: m.state.authority,
    isCurrent: () => m.authority.sameAccountSessionAuthority(m.state.authority, m.authority.getCurrentAccountSessionAuthoritySnapshot()) })
  : m.notifications.refreshPushRegistrationIfGranted();

test('automatic registration settlement behind an initial read coalesces one fresh readback', async t => {
  const held = deferred(), m = await mount(t, { actualPush: true, read: () => held.promise });
  await m.act(() => m.notifications.refreshPushRegistrationIfGranted());
  assert.equal(m.state.reads.length, 1);
  m.state.read = null;
  await m.act(() => held.resolve({ data: { push_enabled: true }, error: null }));
  assert.equal(m.section().props.value, 'Registered');
  assert.equal(m.state.reads.length, 2);
});

for (const action of ['disable', 'register']) test(`newer explicit ${action} failure supersedes an already-deferred external readback`, async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.read = () => held.promise;
  await m.focus(false); await m.focus(true);
  await m.act(() => m.notifications.refreshPushRegistrationIfGranted());
  m.state.read = null;
  if (action === 'disable') {
    m.state.revokeReceipt = 'rejected';
    await m.act(() => m.toggle('Push alerts').onValueChange(false));
  } else {
    m.state.backendBarrier = () => { throw new Error('modeled terminal rejection'); };
    await m.act(() => m.button('Register Device').onPress());
  }
  assert.equal(m.section().props.value, 'Unable to verify', 'a newer failed receipt wins over an older generic reconciliation request');
  await m.act(() => held.resolve({ data: { push_enabled: true }, error: null }));
  assert.equal(m.section().props.value, 'Unable to verify');
  assert.equal(m.state.reads.length, 2, 'no obsolete deferred read is dispatched after the newer explicit receipt');
});

test('initiating permission failure preserves its error without an unrelated generic read', async t => {
  const m = await mount(t, { actualPush: true });
  m.state.permissionReader = () => { throw new Error('modeled permission read failure'); };
  m.state.read = async () => ({ data: null, error: {} });
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.state.alerts.length, 1);
  assert.equal(m.state.reads.length, 1, 'the active initiating handler owns its failure without an extra status read');
  assert.equal(!!m.row('Notification settings unavailable'), false);
  assert.equal(m.toggle('Push alerts').value, true);
  assert.equal(m.button('Refresh').disabled, false);
});

// D = preference false -> revoke; R = explicit or automatic registration.
// Exercise each awaited D boundary, not only the preference transport itself.
for (const phase of ['preference-held', 'save-settlement', 'revoke-held']) {
  for (const method of ['explicit', 'automatic']) test(`disable-first blocks ${method} registration at ${phase}`, async t => {
    const held = deferred(); let m, blocked;
    m = await mount(t, { actualPush: true, write: phase === 'preference-held' ? async (request, row) => {
      await held.promise;
      const saved = { ...row, ...request.payload }; m.state.rows.set(request.userId, saved);
      return { data: saved, error: null };
    } : undefined });
    if (phase === 'revoke-held') m.state.backendBarrier = body => body.action === 'revoke' ? held.promise : undefined;
    if (phase === 'save-settlement') {
      const stop = m.notifications.subscribeToNotificationPreferenceWrites((_userId, pending) => {
        if (!pending) blocked = register(m, method);
      });
      t.after(stop);
    }
    await m.act(() => m.toggle('Push alerts').onValueChange(false));
    assert.equal(m.state.writes.length, 1);
    if (phase !== 'save-settlement') {
      assert.equal(m.section().props.value, 'Device change pending');
      await m.act(() => { blocked = register(m, method); });
    }
    assert.equal((await blocked).status, 'error', 'registration cannot enter any disable continuation gap');
    assert.equal(m.state.transport.filter(x => x.action === 'register').length, 0);
    await m.act(() => held.resolve());
    assert.equal(m.state.rows.get('owned-user').push_enabled, false);
    assert.equal(m.state.installOwner, null);
    assert.equal(m.section().props.value, 'Not registered');
    assert.equal(m.button('Refresh').disabled, false);
  });
}

for (const transition of ['same-user-keyed-root', 'blur-return', 'background-return', 'authority-ABA']) {
  for (const phase of ['preference-held', 'revoke-held']) test(`disable debt survives ${transition} at ${phase} and blocks enable, disable and registration`, async t => {
    const held = deferred(); let m;
    m = await mount(t, { actualPush: true, write: phase === 'preference-held' ? async (request, row) => {
      await held.promise;
      const saved = { ...row, ...request.payload }; m.state.rows.set(request.userId, saved);
      return { data: saved, error: null };
    } : undefined });
    if (phase === 'revoke-held') m.state.backendBarrier = body => body.action === 'revoke' ? held.promise : undefined;
    const captured = m.toggle('Push alerts');
    await m.act(() => captured.onValueChange(false));
    if (transition === 'same-user-keyed-root') await m.replace(owner('session-b'));
    else if (transition === 'blur-return') { await m.focus(false); await m.focus(true); }
    else if (transition === 'background-return') { await m.app('background'); await m.app('active'); }
    else await m.act(() => { m.authority.publishAccountSessionAuthoritySnapshot(null); m.authority.publishAccountSessionAuthoritySnapshot(owner()); });
    assert.equal(m.button('Register Device').disabled, true);
    await m.act(() => { captured.onValueChange(true); captured.onValueChange(false); m.button('Register Device').onPress(); });
    if (transition === 'blur-return' || transition === 'background-return') {
      await m.act(() => { m.toggle('Push alerts').onValueChange(true); m.toggle('Push alerts').onValueChange(false); });
    }
    let blocked;
    await m.act(async () => { blocked = await register(m, 'automatic'); });
    assert.equal(blocked.status, 'error');
    assert.equal(m.state.writes.length, 1);
    assert.equal(m.state.transport.filter(x => x.action === 'register').length, 0);
    await m.act(() => held.resolve());
    assert.equal(m.toggle('Push alerts').value, false);
    assert.equal(m.state.revocations, phase === 'revoke-held' ? 1 : 0, 'only the already-dispatched initiating revoke may settle');
    assert.ok(m.state.transport.filter(x => x.action === 'revoke').every(x => x.sessionGeneration === 'session-a'));
    assert.equal(m.button('Refresh').disabled, false);
  });
}

test('failed disable save never revokes and releases the boundary for a current registration retry', async t => {
  const m = await mount(t, { actualPush: true, write: async () => ({ data: null, error: {} }) });
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.state.revocations, 0);
  assert.equal(m.toggle('Push alerts').value, true);
  assert.equal(m.state.alerts.length, 1);
  assert.equal(m.state.authoritySubscriptions, 1);
  m.state.write = null;
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.section().props.value, 'Registered');
});

test('failed disable revoke leaves a queued receipt gate until a successful registration retry drains it', async t => {
  const m = await mount(t, { actualPush: true }); m.state.revokeReceipt = 'rejected';
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  assert.equal(m.toggle('Push alerts').value, false);
  assert.equal(m.section().props.value, 'Unable to verify');
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.state.transport.filter(x => x.action === 'register').length, 0);
  assert.equal(m.toggle('Push alerts').value, false);
  m.state.revokeReceipt = 'valid';
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.section().props.value, 'Registered');
  assert.equal(m.toggle('Push alerts').value, true);
  const commits = m.state.backendCommits.length;
  await m.act(() => m.notifications.retryPendingPushRevocations());
  assert.equal(m.state.backendCommits.length, commits, 'old queued revoke cannot undo the new valid registration');
});

test('held disable revoke stays explicit through return and owns cleanup until settlement after unmount', async t => {
  const held = deferred(), m = await mount(t, { actualPush: true });
  m.state.backendBarrier = body => body.action === 'revoke' ? held.promise : undefined;
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  await m.focus(false); await m.focus(true);
  assert.equal(m.section().props.value, 'Device change pending');
  assert.match(m.row('Device push status').props.subtitle, /still unresolved/);
  assert.equal(m.button('Refresh').disabled, true);
  await m.unmount();
  assert.equal(m.state.authoritySubscriptions, 1);
  let blocked;
  await m.act(async () => { blocked = await register(m, 'automatic'); });
  assert.equal(blocked.status, 'error');
  await m.act(() => held.resolve());
  assert.equal(m.state.authoritySubscriptions, 0);
  assert.equal(m.notifications.hasPendingNotificationPushRegistration(), false);
});

for (const [label, order, fail] of [
  ['Push alerts', 'registration-first', false], ['Push alerts', 'save-first', false],
  ['Push alerts', 'registration-first', true], ['Push alerts', 'save-first', true],
  ['Messages', 'registration-first', false],
]) {
  const name = label === 'Push alerts' && order === 'registration-first' && !fail
    ? 'preference enable and automatic registration safely commute and settle to enabled registered truth'
    : `automatic registration reconciliation with ${label}, ${order}, failed-save=${fail}`;
  test(name, async t => {
    const save = deferred(), provider = deferred(); let m, registration;
    m = await mount(t, { actualPush: true, write: async (request, row) => {
      await save.promise;
      if (fail) return { data: null, error: {} };
      const saved = { ...row, ...request.payload }; m.state.rows.set(request.userId, saved);
      return { data: saved, error: null };
    } });
    m.state.rows.set('owned-user', { push_enabled: false, messages_enabled: true });
    await m.act(() => m.button('Refresh').onPress());
    const reads = m.state.reads.length;
    m.state.backendBarrier = body => body.action === 'register' ? provider.promise : undefined;
    await m.act(() => m.toggle(label).onValueChange(label === 'Push alerts'));
    await m.act(() => { registration = m.notifications.refreshPushRegistrationIfGranted(); });
    if (order === 'registration-first') {
      await m.act(() => provider.resolve()); await registration;
      await m.act(() => save.resolve());
    } else {
      await m.act(() => save.resolve());
      await m.act(() => provider.resolve()); await registration;
    }
    assert.equal(m.toggle(label).value, label === 'Push alerts' ? !fail : false);
    assert.equal(m.section().props.value, 'Registered', 'natural settlement reconciles without a manual Refresh');
    assert.equal(m.state.rows.get('owned-user')[label === 'Push alerts' ? 'push_enabled' : 'messages_enabled'], label === 'Push alerts' ? !fail : false);
    assert.deepEqual(m.state.installOwner, { userId: 'owned-user', sessionGeneration: 'session-a' });
    assert.equal(m.state.alerts.length, fail ? 1 : 0, 'reconciliation preserves the failed-save signal');
    assert.equal(m.state.reads.length, reads + 1, 'settled changes coalesce into one authoritative readback');
  });
}
