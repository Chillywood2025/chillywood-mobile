import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, owner, deferred, holdPreferenceWrite, preferenceRead, preferenceRow } from './helpers/notification-settings-mounted-harness.mjs';

test('notification preferences load real saved values and save only the requested field', async t => {
  const m = await mount(t);
  assert.equal(m.toggle('Messages').value, true);
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.equal(m.toggle('Messages').value, false);
  assert.deepEqual(m.state.writes.map(r => r.payload), [{ messages_enabled: false }]);
  assert.equal(m.toggle('Messages').disabled, false);
});

test('same-turn preference toggles dispatch one save and preserve its busy state', async t => {
  const held = deferred(), m = await mount(t, { write: holdPreferenceWrite(held) });
  const messages = m.toggle('Messages');
  await m.act(() => { messages.onValueChange(false); messages.onValueChange(true); });
  assert.equal(m.state.writes.length, 1, 'synchronous latch must reject the second save');
  assert.equal(m.state.writes[0].payload.messages_enabled, false, 'the first accepted toggle owns the save');
  assert.equal(m.toggle('Messages').disabled, true);
  await m.act(() => held.resolve());
  assert.equal(m.toggle('Messages').value, false);
  assert.equal(m.toggle('Messages').disabled, false);
});

test('same-turn manual refresh dispatches one read and cannot overlap a save', async t => {
  const m = await mount(t), held = deferred();
  m.state.read = () => held.promise;
  const refresh = m.button('Refresh'), messages = m.toggle('Messages');
  assert.equal(refresh.disabled, false);
  await m.act(() => { refresh.onPress(); refresh.onPress(); messages.onValueChange(false); });
  assert.equal(m.state.reads.length, 2, 'initial read plus one manual read');
  assert.equal(m.state.writes.length, 0, 'manual refresh owns the action latch');
  await m.act(() => held.resolve(preferenceRead({ messages_enabled: false })));
  assert.equal(m.toggle('Messages').value, false);
});

for (const fail of [false, true]) test(`held refocus read cannot undo a newer registration save, fail=${fail}`, async t => {
  const held = deferred(), m = await mount(t);
  await m.focus(false); m.state.read = () => held.promise; await m.focus(true);
  const register = m.button('Register Device'); assert.equal(register.disabled, false);
  await m.act(() => register.onPress());
  assert.equal(m.toggle('Push alerts').value, true);
  await m.act(() => held.resolve(fail ? { data: null, error: {} } : preferenceRead({ push_enabled: false })));
  assert.equal(!!m.row('Notification settings unavailable'), false);
  assert.equal(m.toggle('Push alerts').value, true, 'old read must not overwrite the saved value');
});

test('blur retires pending save failure and refocus reads current saved preferences', async t => {
  const held = deferred(), m = await mount(t, { write: holdPreferenceWrite(held) });
  await m.act(() => m.toggle('Messages').onValueChange(false));
  await m.focus(false);
  m.state.rows.set('owned-user', preferenceRow({ ...m.state.rows.get('owned-user'), messages_enabled: false }));
  await m.focus(true);
  assert.equal(m.state.reads.length, 1, 'refocus waits for the dispatched write to settle');
  assert.equal(m.toggle('Messages').disabled, true);
  await m.act(() => held.resolve({ data: null, error: {} }));
  assert.deepEqual(m.state.alerts, [], 'retired failures must not alert the new visit');
  assert.equal(m.state.reads.length, 2, 'settlement reads current preferences');
  assert.equal(m.toggle('Messages').value, false);
});

for (const replacement of [owner('session-b'), owner('session-b', 'second-user')]) test(`keyed navigation replacement retires save follow-on revocation: ${replacement.userId}`, async t => {
  const held = deferred(), m = await mount(t, { write: holdPreferenceWrite(held) });
  await m.act(() => m.toggle('Push alerts').onValueChange(false));
  await m.replace(replacement);
  assert.equal(m.button('Refresh').disabled, true, 'disable owns the shared install until its entire action settles');
  await m.act(() => held.resolve());
  assert.equal(m.state.revocations, 0, 'old Settings must not revoke the successor install');
  assert.equal(m.toggle('Push alerts').value, replacement.userId !== 'owned-user', 'same-account replacement reads the actual prior commit');
});

for (const transient of [false, true]) test(`authority revocation without session rerender retires follow-on writes, transient=${transient}`, async t => {
  const held = deferred(), m = await mount(t, { register: () => held.promise });
  await m.act(() => m.button('Register Device').onPress());
  await m.act(() => {
    m.authority.publishAccountSessionAuthoritySnapshot(null);
    if (transient) m.authority.publishAccountSessionAuthoritySnapshot(owner());
    held.resolve({ status: 'registered' });
  });
  assert.equal(m.state.writes.length, 0, 'retired registration must not enable account push preferences');
});

test('read and save failures stay honest and the actual Refresh and toggle recover', async t => {
  const m = await mount(t, { read: async () => ({ data: null, error: {} }) });
  assert.equal(m.row('Messages').props.value, 'Loading');
  assert.ok(m.row('Notification settings unavailable'));
  assert.equal(m.state.writes.length, 0);
  m.state.read = null;
  await m.act(() => m.button('Refresh').onPress());
  assert.equal(!!m.row('Notification settings unavailable'), false);
  assert.equal(m.toggle('Messages').value, true);
  m.state.write = async () => ({ data: null, error: {} });
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.ok(m.row('Notification settings unavailable'));
  assert.equal(m.row('Messages').props.value, 'Loading');
  assert.equal(m.state.alerts.length, 1);
  m.state.write = null;
  await m.act(() => m.button('Refresh').onPress());
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.equal(m.toggle('Messages').value, false);
  m.state.read = async () => ({ data: null, error: {} });
  await m.act(() => m.button('Refresh').onPress());
  assert.equal(m.section().props.value, 'Unable to verify');
  assert.equal(m.button('Refresh').disabled, false);
  m.state.read = null;
  await m.act(() => m.button('Refresh').onPress());
  assert.equal(m.toggle('Messages').value, false);
});

test('held automatic refocus read cannot overwrite a newer toggle or retain loading', async t => {
  const m = await mount(t), held = deferred();
  await m.focus(false); m.state.read = () => held.promise; await m.focus(true);
  assert.equal(m.button('Refresh').disabled, true);
  assert.equal(m.toggle('Messages').disabled, false);
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.equal(m.toggle('Messages').value, false);
  assert.equal(m.button('Refresh').disabled, false);
  await m.act(() => held.resolve(preferenceRead({ messages_enabled: true })));
  assert.equal(m.toggle('Messages').value, false);
});

test('retired save blocks a new visit save until settlement and permits a fresh retry', async t => {
  const old = deferred(), next = deferred(), m = await mount(t, { write: holdPreferenceWrite(old) });
  await m.act(() => m.toggle('Messages').onValueChange(false));
  await m.focus(false); await m.focus(true);
  m.state.write = holdPreferenceWrite(next);
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.equal(m.state.writes.length, 1, 'retired durable write still owns the serialization latch');
  await m.act(() => old.resolve({ data: null, error: {} }));
  assert.equal(m.toggle('Messages').disabled, false);
  await m.act(() => m.toggle('Messages').onValueChange(false));
  assert.equal(m.toggle('Messages').disabled, true);
  assert.equal(m.state.alerts.length, 0);
  await m.act(() => next.resolve());
  assert.equal(m.toggle('Messages').disabled, false);
  assert.equal(m.toggle('Messages').value, false);
});

test('ring and ringtone controls share the save latch and preserve actual preference fields', async t => {
  const m = await mount(t), held = deferred();
  await m.act(() => m.toggle('Ring on calls').onValueChange(false));
  assert.equal(m.toggle('Ring on calls').value, false);
  assert.deepEqual(m.state.writes[0].payload, { chilly_chat_call_sound_key: 'silent_vibrate' });
  await m.act(() => m.toggle('Ring on calls').onValueChange(true));
  assert.equal(m.toggle('Ring on calls').value, true);
  m.state.write = holdPreferenceWrite(held);
  const sound = m.button('Quiet buzz'), messages = m.toggle('Messages');
  await m.act(() => { sound.onPress(); sound.onPress(); messages.onValueChange(false); });
  assert.equal(m.state.writes.length, 3);
  assert.equal(m.state.writes[2].payload.chilly_chat_call_sound_key, 'quiet_buzz');
  await m.act(() => held.resolve());
  assert.equal(m.toggle('Messages').disabled, false);
});

test('register failure releases the latch and same-turn retry registers just once', async t => {
  const m = await mount(t, { register: async () => { throw new Error('modeled native failure'); } });
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.state.alerts.length, 1);
  assert.equal(m.button('Register Device').disabled, false);
  const held = deferred(); m.state.register = () => held.promise;
  const register = m.button('Register Device');
  await m.act(() => { register.onPress(); register.onPress(); });
  assert.equal(m.state.registrations, 2, 'one failed attempt plus one retry');
  await m.act(() => held.resolve({ status: 'registered' }));
  assert.equal(m.state.writes.length, 1);
  assert.equal(m.button('Refresh').disabled, false);
});

test('background retires reads and foreground refresh respects focus', async t => {
  const m = await mount(t), held = deferred();
  m.state.read = () => held.promise;
  await m.act(() => m.button('Refresh').onPress());
  await m.app('background');
  await m.act(() => held.resolve(preferenceRead({ messages_enabled: false })));
  assert.equal(m.toggle('Messages').value, true);
  m.state.read = null; m.state.rows.set('owned-user', preferenceRow({ ...m.state.rows.get('owned-user'), messages_enabled: false }));
  await m.app('active'); assert.equal(m.toggle('Messages').value, false);
  await m.focus(false); const reads = m.state.reads.length;
  await m.app('background'); await m.app('active');
  assert.equal(m.state.reads.length, reads);
  await m.focus(true); assert.equal(m.state.reads.length, reads + 1);
});

test('unmount removes authority and foreground listeners and stale callbacks cannot dispatch', async t => {
  const m = await mount(t), messages = m.toggle('Messages'), register = m.button('Register Device');
  // Notification ownership and retained Profile-removal intent each own an
  // authority subscription; both must be released on unmount.
  assert.equal(m.state.authoritySubscriptions, 2);
  await m.unmount();
  assert.equal(m.state.authoritySubscriptions, 0);
  assert.equal(m.appListeners.size, 0);
  await m.act(() => { messages.onValueChange(false); register.onPress(); });
  assert.equal(m.state.writes.length, 0);
  assert.equal(m.state.registrations, 0);
});

test('restore-only authority cannot read preferences or dispatch registration', async t => {
  const m = await mount(t, { authority: { ...owner(), restoreOnly: true } });
  assert.equal(m.state.reads.length, 0);
  await m.act(() => m.button('Register Device').onPress());
  assert.equal(m.state.registrations, 0);
  assert.equal(m.state.writes.length, 0);
});

test('keyed replacement retains a new loading read when the retired initial read fails', async t => {
  const old = deferred(), next = deferred(), m = await mount(t, { read: () => old.promise });
  m.state.read = () => next.promise; await m.replace(owner('session-b', 'second-user'));
  await m.act(() => old.resolve({ data: null, error: {} }));
  assert.equal(!!m.row('Notification settings unavailable'), false);
  assert.equal(m.button('Refresh').disabled, true);
  await m.act(() => next.resolve(preferenceRead({ messages_enabled: false }, 'second-user')));
  assert.equal(m.toggle('Messages').value, false);
  assert.equal(m.button('Refresh').disabled, false);
});

test('equivalent authority republish preserves the active save and its busy latch', async t => {
  const held = deferred(), m = await mount(t, { write: holdPreferenceWrite(held) });
  await m.act(() => m.toggle('Messages').onValueChange(false));
  await m.replace(owner());
  assert.equal(m.toggle('Messages').disabled, true, 'semantic owner identity preserves the ongoing save');
  assert.equal(m.state.reads.length, 1, 'equivalent auth reconciliation is not a new Settings visit');
  await m.act(() => held.resolve());
  assert.equal(m.toggle('Messages').value, false);
  assert.equal(m.toggle('Messages').disabled, false);
  assert.equal(m.state.reads.length, 1, 'equivalent owner objects must not retire the active operation and trigger settlement readback');
  assert.equal(m.state.alerts.length, 0);
});

test('failed automatic refresh cannot retain a stale Registered claim', async t => {
  const m = await mount(t);
  m.state.registration = { status: 'registered', permissionState: 'granted', provider: 'expo' };
  await m.act(() => m.button('Refresh').onPress());
  assert.equal(m.section().props.value, 'Registered');
  await m.focus(false);
  m.state.read = async () => ({ data: null, error: {} });
  await m.focus(true);
  assert.equal(m.section().props.value, 'Unable to verify');
});
