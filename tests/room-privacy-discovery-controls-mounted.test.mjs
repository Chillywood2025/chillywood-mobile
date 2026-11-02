import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const authority = (userId = 'host', sessionGeneration = 'session-a') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const same = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'state', 'restoreOnly'].every(k => a[k] === b[k]);
const room = () => ({ partyId: 'PARTY42', roomCode: 'PARTY42', hostUserId: 'host', roomType: 'title', titleId: 'title-a', sourceType: 'platform_title', sourceId: 'title-a',
  roomGeneration: '11111111-1111-4111-8111-111111111111', hostSettingsRevision: 0, joinPolicy: 'open', discoveryVisibility: 'private', discoveryPaused: false, discoveryTitle: 'Tonight', discoveryStartedAt: null,
  isActive: true, lastActivityAt: new Date().toISOString() });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const walk = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children)];
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true };
const source = fs.readFileSync('components/live/room-privacy-discovery-controls.tsx', 'utf8');
const code = ts.transpileModule(source, { compilerOptions, transformers: { before: [context => root => ts.visitEachChild(root, node => {
  if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'RoomPrivacyDiscoveryControls') return node;
  const visit = child => {
    if (ts.isFunctionLike(child)) return child;
    if (ts.isReturnStatement(child) && child.expression) return ts.factory.updateReturnStatement(child,
      ts.factory.createCallExpression(ts.factory.createIdentifier('capture'), undefined, [child.expression]));
    return ts.visitEachChild(child, visit, context);
  };
  return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
    ts.factory.updateBlock(node.body, node.body.statements.map(visit)));
}, context)] } }).outputText;

async function mount(t, changes = {}) {
  let tree, mounted = true;
  const runtime = { authority: authority(), room: room(), stored: room(), active: true, eventManaged: false,
    reads: [], captures: 0, calls: [], readbacks: [], publications: [], read: null, capture: null, send: null, owner: false, ...changes };
  runtime.stored = changes.stored ?? { ...runtime.room };
  const listeners = new Set(), apps = new Set(), timers = new Map(); let timerId = 0;
  const AppState = { currentState: 'active', addEventListener: (_, fn) => { apps.add(fn); return { remove: () => apps.delete(fn) }; } };
  const account = { getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority, sameAccountSessionAuthority: same,
    subscribeToAccountSessionAuthority: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const transport = {
    async captureAccountBoundSupabaseMutationSubject(id) {
      runtime.captures++; const expected = runtime.authority;
      if (runtime.capture) await runtime.capture();
      if (!same(expected, runtime.authority) || id !== expected.userId) throw Error('account_changed');
      return { authority: expected, accessToken: 'fixture' };
    },
    async invokeAccountBoundSupabaseMutationRpc(subject, name, args, options) {
      assert.ok(same(subject.authority, runtime.authority));
      runtime.calls.push({ name, args, options });
      let answer;
      if (runtime.send) answer = await runtime.send(args);
      else {
        const row = runtime.stored;
        if (!row?.isActive || row.hostUserId !== subject.authority.userId || row.roomGeneration !== args.p_expected_room_generation
          || row.hostSettingsRevision !== args.p_expected_settings_revision) return { data: null, error: { message: 'conflict' } };
        const revision = row.hostSettingsRevision + (row.joinPolicy !== args.p_join_policy || row.discoveryVisibility !== args.p_discovery_visibility || row.discoveryTitle !== args.p_discovery_title || row.discoveryPaused !== args.p_discovery_paused ? 1 : 0);
        const published = row.roomType === 'title' && args.p_discovery_visibility !== 'private' && !args.p_discovery_paused && args.p_publish && (!runtime.owner || args.p_allow_owner_discovery);
        runtime.stored = { ...row, joinPolicy: args.p_join_policy, discoveryVisibility: args.p_discovery_visibility, discoveryPaused: args.p_discovery_paused, discoveryTitle: args.p_discovery_title,
          hostSettingsRevision: revision, discoveryStartedAt: published ? new Date().toISOString() : null };
        answer = { data: { partyId: row.partyId, roomType: row.roomType, roomGeneration: row.roomGeneration, sourceType: row.sourceType, sourceId: row.sourceId,
          settingsRevision: revision, joinPolicy: args.p_join_policy, visibility: args.p_discovery_visibility, discoveryPaused: args.p_discovery_paused, title: args.p_discovery_title,
          published, startedAt: runtime.stored.discoveryStartedAt, projectionId: published ? 'projection-a' : null,
          ownerDiscoveryConsent: runtime.owner && args.p_allow_owner_discovery }, error: null };
      }
      if (!same(subject.authority, runtime.authority)) throw Error('account_changed');
      return answer;
    },
  };
  const helperScope = { exports: {}, Date, require(name) {
    if (name === './accountSessionAuthority') return account;
    if (name === './accountBoundSupabaseMutation') return transport;
    if (name === './watchParty') return { getPartyRoom: async id => { runtime.reads.push(id); return runtime.read ? runtime.read(id) : runtime.stored ? { ...runtime.stored } : null; } };
    throw Error(`unexpected helper dependency ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/watchPartyHostSettings.ts', 'utf8'), { compilerOptions }).outputText, helperScope);
  const scope = { exports: {}, Date, console, capture(value) { tree = value; return null; },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, require(name) {
      if (name === 'react') return React;
      if (name === 'react-native') return { AppState, StyleSheet: { create: x => x }, ...Object.fromEntries(['ImageBackground', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(x => [x, x])) };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
      if (name === '@expo/vector-icons/MaterialIcons') return 'Icon';
      if (name.endsWith('/session')) return { useSession: () => ({ authority: runtime.authority, authorityStatus: runtime.authority ? 'active' : 'anonymous' }) };
      if (name.endsWith('/accountSessionAuthority')) return account;
      if (name.endsWith('/watchPartyHostSettings')) return helperScope.exports;
      if (name.endsWith('/moderation')) return { readMyPlatformRoleMemberships: async () => runtime.owner ? [{ role: 'owner' }] : [], hasPlatformRoleMembership: rows => rows.some(row => row.role === 'owner') };
      if (name.endsWith('/chillywood-visual-system')) return { CHILLYWOOD_VISUAL: {} };
      if (name.endsWith('.png')) return 'skyline';
      throw Error(`unexpected component dependency ${name}`);
    } };
  vm.runInNewContext(code, scope);
  const root = createRoot(container());
  const render = () => root.render(React.createElement(scope.exports.RoomPrivacyDiscoveryControls, {
    room: runtime.room, active: runtime.active, eventManaged: runtime.eventManaged,
    onReadback(value) { runtime.readbacks.push(value); runtime.room = helperScope.exports.applyWatchPartyHostSettingsReadback(runtime.room, value); render(); },
    onPublished(value) { runtime.publications.push(value); },
  }));
  const act = async fn => React.act(async () => { fn?.(); await settle(); });
  await act(render);
  t.after(async () => { if (mounted) { mounted = false; await act(() => root.unmount()); } });
  const node = id => walk(tree).find(n => n.props?.testID === id);
  return { runtime, node, timers, helper: helperScope.exports, act,
    async press(id) { const found = node(id); assert.ok(found, `missing ${id}`); assert.notEqual(found.props.disabled, true, `disabled ${id}`); await act(() => found.props.onPress()); },
    async chooseListed(value) { await this.press(`room-discovery-${value}`); await this.press('room-discovery-on'); },
    async open() { await act(() => node('room-privacy-discovery-open').props.onPress()); },
    async update(value) { await act(() => { Object.assign(runtime, value); render(); }); },
    async account(value) { await act(() => { runtime.authority = value; for (const fn of listeners) fn(value); render(); }); },
    async app(value) { await act(() => { AppState.currentState = value; for (const fn of apps) fn(value); }); },
    async unmount() { mounted = false; await act(() => root.unmount()); },
    visible: () => walk(tree).find(n => n.type === 'Modal')?.props.visible ?? false,
    text: () => walk(tree).filter(n => n.type === 'Text').map(n => n.props.children).join(' '),
  };
}

test('private rooms stay Off on open; actual controls expose separate entry and audience settings', async t => {
  const h = await mount(t); await h.open(); assert.equal(h.visible(), true);
  assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true);
  assert.equal(h.node('room-entry-open').props.accessibilityState.selected, true);
  assert.equal(h.runtime.calls.length, 0); assert.match(h.text(), /does not make a room invitation-only/);
  assert.match(h.text(), /Only your current Circle/); assert.match(h.text(), /does not turn their notifications on/);
});

test('explicit public confirmation submits exact generation/revision/session and consumes only server readback', async t => {
  const h = await mount(t); await h.open(); await h.chooseListed('public');
  assert.equal(h.runtime.room.discoveryVisibility, 'private'); await h.press('room-discovery-save');
  assert.ok(h.node('room-discovery-confirmation')); assert.equal(h.runtime.calls.length, 0);
  await h.press('room-discovery-save'); assert.equal(h.runtime.calls.length, 1);
  const call = h.runtime.calls[0]; assert.equal(call.name, 'set_watch_party_room_host_settings');
  assert.equal(call.args.p_expected_room_generation, room().roomGeneration); assert.equal(call.args.p_expected_settings_revision, 0);
  assert.equal(call.args.p_session_generation, 'session-a'); assert.equal(call.options.retainTransportSettlement, true);
  assert.equal(h.runtime.room.discoveryVisibility, 'public'); assert.equal(h.runtime.room.hostSettingsRevision, 1);
  assert.equal(h.runtime.publications[0].published, true); assert.match(h.text(), /listing confirmed/);
});

test('cancel confirmation then hardware Back discards drafts and does not write', async t => {
  const h = await mount(t); await h.open(); await h.chooseListed('public'); await h.press('room-discovery-save');
  await h.press('room-discovery-cancel-confirmation'); assert.equal(h.node('room-discovery-confirmation'), undefined);
  await h.press('room-discovery-back'); assert.equal(h.visible(), false); assert.equal(h.runtime.calls.length, 0);
  await h.open(); assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true);
});

test('turning discovery off preserves Circle admission and does not unlock the room', async t => {
  const h = await mount(t, { room: { ...room(), joinPolicy: 'locked', discoveryVisibility: 'circle' } });
  await h.open(); await h.press('room-discovery-private'); await h.press('room-discovery-save');
  assert.equal(h.node('room-discovery-confirmation'), undefined);
  assert.equal(h.runtime.room.joinPolicy, 'locked'); assert.equal(h.runtime.room.discoveryVisibility, 'circle');
  assert.equal(h.runtime.room.discoveryPaused, true); assert.equal(h.runtime.calls[0].args.p_discovery_paused, true);
  assert.equal(h.runtime.publications[0].published, false); assert.match(h.text(), /Circle-only entry is unchanged/);
});

test('paused Circle opens unlisted with the same restricted audience and no write', async t => {
  const h = await mount(t, { room: { ...room(), discoveryVisibility: 'circle', discoveryPaused: true } });
  await h.open();
  assert.equal(h.node('room-discovery-circle').props.accessibilityState.selected, true);
  assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true);
  assert.match(h.text(), /including with a saved room link or code/);
  assert.equal(h.runtime.calls.length, 0);
});

test('changing audience while unlisted never enables listing and Circle widening is explicit', async t => {
  const h = await mount(t, { room: { ...room(), discoveryVisibility: 'circle', discoveryPaused: true } });
  await h.open(); await h.press('room-discovery-public');
  assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true);
  await h.press('room-discovery-save'); assert.equal(h.runtime.calls.length, 0);
  assert.match(h.text(), /even while discovery stays off/);
  await h.press('room-discovery-save');
  assert.equal(h.runtime.calls.length, 1); assert.equal(h.runtime.calls[0].args.p_discovery_paused, true);
  assert.equal(h.runtime.room.discoveryVisibility, 'public'); assert.equal(h.runtime.publications[0].published, false);
});

test('legacy private audience selection stays Off until an explicit listing On selection', async t => {
  const h = await mount(t); await h.open(); await h.press('room-discovery-circle');
  await h.press('room-discovery-save');
  assert.equal(h.runtime.room.discoveryVisibility, 'circle'); assert.equal(h.runtime.room.discoveryPaused, true);
  assert.equal(h.runtime.publications[0].published, false);
  await h.press('room-discovery-on'); await h.press('room-discovery-save');
  assert.equal(h.runtime.calls.length, 1, 'resume must await confirmation');
  await h.press('room-discovery-save');
  assert.equal(h.runtime.room.discoveryVisibility, 'circle'); assert.equal(h.runtime.room.discoveryPaused, false);
  assert.equal(h.runtime.room.hostSettingsRevision, 2); assert.equal(h.runtime.publications[1].published, true);
});

test('owner pause clears opt-in and resume never silently recovers former consent', async t => {
  const h = await mount(t, { owner: true, room: { ...room(), discoveryVisibility: 'circle' } });
  await h.open(); await h.press('room-discovery-owner-consent');
  await h.press('room-discovery-private'); await h.press('room-discovery-save');
  assert.equal(h.runtime.calls[0].args.p_allow_owner_discovery, false);
  assert.equal(h.runtime.room.discoveryVisibility, 'circle'); assert.equal(h.runtime.room.discoveryPaused, true);
  await h.press('room-discovery-on');
  assert.equal(h.node('room-discovery-owner-consent').props.accessibilityState.checked, false);
  await h.press('room-discovery-save'); await h.press('room-discovery-save');
  assert.equal(h.runtime.calls[1].args.p_allow_owner_discovery, false); assert.equal(h.runtime.publications[1].published, false);
  assert.match(h.text(), /owner session remains hidden/);
});

test('owner can hide a Circle listing even when it has no discoverable title', async t => {
  const h = await mount(t, { owner: true, room: { ...room(), discoveryVisibility: 'circle', discoveryTitle: null } });
  await h.open(); await h.press('room-discovery-private'); await h.press('room-discovery-save');
  assert.equal(h.runtime.calls.length, 1); assert.equal(h.runtime.calls[0].args.p_allow_owner_discovery, false);
  assert.equal(h.runtime.room.discoveryPaused, true); assert.equal(h.runtime.room.discoveryVisibility, 'circle');
  assert.equal(h.runtime.publications[0].published, false);
});

test('pause resume ABA rejects the old draft even when audience and pause values return', async t => {
  const h = await mount(t, { room: { ...room(), discoveryVisibility: 'circle', discoveryPaused: true } });
  await h.open(); await h.press('room-discovery-on'); await h.press('room-discovery-save');
  h.runtime.stored = { ...h.runtime.stored, hostSettingsRevision: 2 };
  await h.press('room-discovery-save');
  assert.equal(h.runtime.calls.length, 0); assert.ok(h.node('room-discovery-error'));
  await h.press('room-discovery-reload');
  assert.equal(h.runtime.room.hostSettingsRevision, 2); assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true);
});

test('mismatched pause acknowledgement cannot confirm a publication or update settings', async t => {
  const h = await mount(t); await h.open(); await h.chooseListed('public'); await h.press('room-discovery-save');
  h.runtime.send = async args => ({ data: { partyId: 'PARTY42', roomType: 'title', roomGeneration: room().roomGeneration,
    sourceType: 'platform_title', sourceId: 'title-a', settingsRevision: 1, joinPolicy: 'open', visibility: 'public',
    discoveryPaused: !args.p_discovery_paused, title: 'Tonight', published: true, startedAt: new Date().toISOString(), projectionId: 'projection-a' }, error: null });
  await h.press('room-discovery-save');
  assert.equal(h.runtime.room.discoveryVisibility, 'private'); assert.equal(h.runtime.publications.length, 0);
  assert.ok(h.node('room-discovery-error'));
});

test('unknown server pause support disables editing rather than guessing public state', async t => {
  const h = await mount(t, { room: { ...room(), discoveryVisibility: 'public', discoveryPaused: undefined } });
  assert.equal(h.node('room-privacy-discovery-open').props.disabled, true); await h.open();
  assert.equal(h.visible(), false); assert.equal(h.runtime.calls.length, 0);
  assert.match(h.text(), /Unverified/);
});

test('legacy Off requests are normalized to preserve the exact existing Circle admission', async t => {
  const h = await mount(t, { room: { ...room(), discoveryVisibility: 'circle' } });
  const result = await h.helper.setWatchPartyHostSettings(h.runtime.room, {
    joinPolicy: 'open', discoveryVisibility: 'private', discoveryTitle: 'Tonight',
  }, h.runtime.authority);
  assert.equal(h.runtime.calls[0].args.p_discovery_visibility, 'circle');
  assert.equal(h.runtime.calls[0].args.p_discovery_paused, true); assert.equal(result.room.discoveryVisibility, 'circle');
  assert.equal(result.room.discoveryPaused, true); assert.equal(result.published, false);
});

test('rapid taps and retained draft callbacks cannot send overlapping settings', async t => {
  const d = deferred(), h = await mount(t); await h.open();
  const oldSelect = h.node('room-discovery-circle').props.onPress;
  await h.chooseListed('public'); await h.press('room-discovery-save'); h.runtime.send = () => d.promise;
  const save = h.node('room-discovery-save').props.onPress;
  await h.act(() => { save(); save(); oldSelect(); });
  assert.equal(h.runtime.calls.length, 1); assert.equal(h.node('room-discovery-circle').props.disabled, true);
  await h.act(() => { for (const fn of h.timers.values()) fn(); }); assert.match(h.text(), /still awaiting/);
  await h.press('room-discovery-back'); await h.open(); assert.equal(h.node('room-discovery-save').props.disabled, true);
  await h.act(() => d.resolve({ data: null, error: { message: 'uncertain' } }));
  assert.equal(h.runtime.publications.length, 0); assert.equal(h.runtime.calls.length, 1);
});

for (const boundary of ['account', 'session', 'room', 'generation', 'end', 'host', 'focus', 'background', 'unmount'])
  test(`retained save cannot dispatch after ${boundary} retirement`, async t => {
    const h = await mount(t); await h.open(); await h.chooseListed('public'); await h.press('room-discovery-save');
    const save = h.node('room-discovery-save').props.onPress, d = deferred(); h.runtime.capture = () => d.promise;
    await h.act(save);
    if (boundary === 'account') await h.account(authority('other'));
    if (boundary === 'session') await h.account(authority('host', 'session-b'));
    if (boundary === 'room') await h.update({ room: { ...room(), partyId: 'OTHER42' } });
    if (boundary === 'generation') await h.update({ room: { ...room(), roomGeneration: 'replacement' } });
    if (boundary === 'end') await h.update({ room: { ...room(), isActive: false } });
    if (boundary === 'host') await h.update({ room: { ...room(), hostUserId: 'new-host' } });
    if (boundary === 'focus') await h.update({ active: false });
    if (boundary === 'background') await h.app('background');
    if (boundary === 'unmount') await h.unmount();
    await h.act(() => { d.resolve(); save(); }); assert.equal(h.runtime.calls.length, 0); assert.equal(h.runtime.publications.length, 0);
  });

test('changed server revision rejects stale draft and requires explicit reload before retry', async t => {
  const h = await mount(t); await h.open(); await h.chooseListed('public'); await h.press('room-discovery-save');
  h.runtime.stored = { ...room(), hostSettingsRevision: 1, joinPolicy: 'locked' };
  await h.press('room-discovery-save'); assert.equal(h.runtime.calls.length, 0); assert.ok(h.node('room-discovery-error'));
  await h.press('room-discovery-reload'); assert.equal(h.node('room-entry-locked').props.accessibilityState.selected, true);
  assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true);
});

test('failed reads never offer writable fallback and retry reads authoritative current state', async t => {
  const h = await mount(t); h.runtime.read = async () => { throw Error('private server detail'); }; await h.open();
  assert.ok(h.node('room-discovery-error')); assert.equal(h.node('room-discovery-public'), undefined); assert.doesNotMatch(h.text(), /private server detail/);
  h.runtime.read = null; await h.press('room-discovery-reload'); assert.ok(h.node('room-discovery-public'));
});

for (const change of [{ authority: authority('viewer') }, { room: { ...room(), isActive: false } }, { active: false }])
  test(`viewers, speakers/cohosts and ended/inactive rooms cannot open host controls ${JSON.stringify(change)}`, async t => {
    const h = await mount(t, change); assert.equal(h.node('room-privacy-discovery-open'), undefined); assert.equal(h.runtime.calls.length, 0);
  });

test('prepared events are explicitly event-managed and unsupported server revisions fail closed', async t => {
  const event = await mount(t, { eventManaged: true }); assert.ok(event.node('room-discovery-event-managed')); assert.equal(event.node('room-privacy-discovery-open'), undefined);
  const old = await mount(t, { room: { ...room(), roomGeneration: null, hostSettingsRevision: null } });
  assert.equal(old.node('room-privacy-discovery-open').props.disabled, true); await old.open(); assert.equal(old.visible(), false);
});

test('live room save never claims provider-confirmed publication from settings alone', async t => {
  const h = await mount(t, { room: { ...room(), roomType: 'live', sourceType: null, sourceId: null, titleId: null } });
  await h.open(); await h.chooseListed('public'); await h.press('room-discovery-save'); await h.press('room-discovery-save');
  assert.equal(h.runtime.room.discoveryVisibility, 'public'); assert.equal(h.runtime.publications[0].published, false);
  assert.match(h.text(), /Listing is not confirmed yet/);
});

test('both production room routes wire the same controls and remove optimistic lock toggles', () => {
  const party = fs.readFileSync('app/watch-party/[partyId].tsx', 'utf8'), stage = fs.readFileSync('app/watch-party/live-stage/[partyId].tsx', 'utf8');
  assert.match(party, /<RoomPrivacyDiscoveryControls room=\{room\}/); assert.match(party, /onPublished=\{setConfirmedHostSettings\}/);
  assert.match(stage, /const renderRoomPrivacyDiscoveryControls = \(\) => <RoomPrivacyDiscoveryControls/);
  assert.equal((stage.match(/\{renderRoomPrivacyDiscoveryControls\(\)\}/g) ?? []).length, 2, 'Live Room and Live Stage both render controls');
  assert.doesNotMatch(party, /onToggleLockRoom/); assert.doesNotMatch(stage, /onToggleLiveRoomLock/);
});

test('owner listing is never automatically opted in by Public choice or opening the sheet', async t => {
  const h = await mount(t, { owner: true }); await h.open();
  await h.chooseListed('public'); assert.equal(h.node('room-discovery-owner-consent').props.accessibilityState.checked, false);
  await h.press('room-discovery-save'); await h.press('room-discovery-save');
  assert.equal(h.runtime.calls[0].args.p_allow_owner_discovery, false); assert.equal(h.runtime.publications[0].published, false);
  assert.match(h.text(), /owner session remains hidden/); assert.doesNotMatch(h.text(), /listing confirmed\./);
});

test('owner must separately opt into this room and explicitly confirm exact title and session scope', async t => {
  const h = await mount(t, { owner: true }); await h.open(); await h.chooseListed('public');
  await h.press('room-discovery-owner-consent'); await h.press('room-discovery-save');
  assert.equal(h.runtime.calls.length, 0); assert.match(h.text(), /does not publish my owner profile or admin activity/);
  await h.press('room-discovery-save'); assert.equal(h.runtime.calls[0].args.p_allow_owner_discovery, true);
  assert.equal(h.runtime.calls[0].args.p_publish, true); assert.equal(h.runtime.publications[0].ownerDiscoveryConsent, true);
  assert.equal(h.node('room-discovery-owner-consent').props.accessibilityState.checked, false, 'consent is not a reusable local preference');
  await h.press('room-discovery-back'); await h.open();
  assert.equal(h.node('room-discovery-owner-consent').props.accessibilityState.checked, false);
});

test('owner cannot publish without a room title or by reusing canceled consent', async t => {
  const h = await mount(t, { owner: true, room: { ...room(), discoveryTitle: null } }); await h.open();
  await h.chooseListed('public'); await h.press('room-discovery-owner-consent');
  assert.equal(h.node('room-discovery-save').props.disabled, true);
  await h.act(() => h.node('room-discovery-title').props.onChangeText('My chosen room title'));
  await h.press('room-discovery-save'); const staleSave = h.node('room-discovery-save').props.onPress;
  await h.press('room-discovery-back'); await h.open(); await h.act(staleSave);
  assert.equal(h.runtime.calls.length, 0); assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true);
});

test('owner Circle denial is truthful and does not invent followers or expose server detail', async t => {
  const h = await mount(t, { owner: true }); await h.open(); await h.chooseListed('circle');
  await h.press('room-discovery-owner-consent'); await h.press('room-discovery-save');
  h.runtime.send = async () => ({ data: null, error: { message: 'room_owner_circle_unavailable private db context' } });
  await h.press('room-discovery-save'); assert.match(h.text(), /No current eligible Circle members/);
  assert.doesNotMatch(h.text(), /private db context/); assert.equal(h.runtime.publications.length, 0);
});

test('ordinary creator never gets owner consent affordance and helper defaults deny exception', async t => {
  const h = await mount(t); await h.open(); await h.chooseListed('public');
  assert.equal(h.node('room-discovery-owner-consent'), undefined); await h.press('room-discovery-save'); await h.press('room-discovery-save');
  assert.equal(h.runtime.calls[0].args.p_allow_owner_discovery, false);
});

test('owner opt-in cannot survive account/session or room revision retirement', async t => {
  const h = await mount(t, { owner: true }); await h.open(); await h.chooseListed('public');
  await h.press('room-discovery-owner-consent'); await h.press('room-discovery-save');
  const staleSave = h.node('room-discovery-save').props.onPress;
  await h.account(authority('host', 'session-b')); await h.act(staleSave);
  assert.equal(h.runtime.calls.length, 0); assert.equal(h.visible(), false);
});

test('late acknowledged write cannot overwrite a newer privacy revision', async t => {
  const h = await mount(t); await h.open(); await h.chooseListed('public'); await h.press('room-discovery-save');
  const d = deferred(); h.runtime.send = () => d.promise; await h.press('room-discovery-save');
  await h.update({ room: { ...room(), hostSettingsRevision: 2, joinPolicy: 'locked' } });
  await h.act(() => d.resolve({ data: { partyId: 'PARTY42', roomType: 'title', roomGeneration: room().roomGeneration,
    sourceType: 'platform_title', sourceId: 'title-a', settingsRevision: 1, joinPolicy: 'open', visibility: 'public', discoveryPaused: false, title: 'Tonight',
    published: true, startedAt: new Date().toISOString(), projectionId: 'projection-a' }, error: null }));
  assert.equal(h.runtime.room.discoveryVisibility, 'private'); assert.equal(h.runtime.room.joinPolicy, 'locked');
  assert.equal(h.runtime.publications.length, 0); assert.ok(h.node('room-discovery-error'));
});

test('waiting room shows the audience before Start and labels Off without implying invite-only access', () => {
  const waiting = fs.readFileSync('app/watch-party/index.tsx', 'utf8');
  assert.match(waiting, /testID="waiting-room-discovery-choice-summary"/); assert.match(waiting, /Starting audience:/);
  assert.match(waiting, /Off · not listed/); assert.match(waiting, /Starting confirms this audience choice/);
  assert.match(waiting, /Circle limits both discovery and entry/);
});

test('timed-out read can retry without accepting the old read or exposing private transport details', async t => {
  const h = await mount(t), d = deferred(); h.runtime.read = () => d.promise; await h.open();
  assert.equal(h.node('room-discovery-save').props.disabled, true);
  await h.act(() => { for (const fn of [...h.timers.values()]) fn(); });
  assert.match(h.text(), /too long to load/); h.runtime.read = null; await h.press('room-discovery-reload');
  await h.act(() => d.resolve({ ...room(), discoveryVisibility: 'public' }));
  assert.equal(h.node('room-discovery-private').props.accessibilityState.selected, true); assert.equal(h.runtime.calls.length, 0);
});

test('same-session authority refresh preserves an open draft while true session change retires it', async t => {
  const h = await mount(t); await h.open(); await h.chooseListed('circle');
  await h.account({ ...h.runtime.authority }); assert.equal(h.visible(), true);
  assert.equal(h.node('room-discovery-circle').props.accessibilityState.selected, true);
  await h.account(authority('host', 'replacement-session')); assert.equal(h.visible(), false); assert.equal(h.runtime.calls.length, 0);
});

for (const boundary of ['account', 'session', 'end', 'background', 'unmount']) test(`late dispatched save cannot project after ${boundary}`, async t => {
  const h = await mount(t), d = deferred(); await h.open(); await h.chooseListed('public'); await h.press('room-discovery-save');
  h.runtime.send = () => d.promise; await h.press('room-discovery-save'); assert.equal(h.runtime.calls.length, 1);
  if (boundary === 'account') await h.account(authority('other'));
  if (boundary === 'session') await h.account(authority('host', 'session-b'));
  if (boundary === 'end') await h.update({ room: { ...room(), isActive: false } });
  if (boundary === 'background') await h.app('background');
  if (boundary === 'unmount') await h.unmount();
  await h.act(() => d.resolve({ data: { partyId: 'PARTY42', roomType: 'title', roomGeneration: room().roomGeneration,
    sourceType: 'platform_title', sourceId: 'title-a', settingsRevision: 1, joinPolicy: 'open', visibility: 'public', discoveryPaused: false, title: 'Tonight',
    published: true, startedAt: new Date().toISOString(), projectionId: 'projection-a' }, error: null }));
  assert.equal(h.runtime.publications.length, 0); assert.equal(h.runtime.calls.length, 1);
});
