import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: document, parentNode: null, tagName: 'DIV' });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const source = fs.readFileSync('app/player/[id].tsx', 'utf8');
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map(), effects = [];
const visit = node => {
  if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(ast), node);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node);
  ts.forEachChild(node, visit);
}; visit(ast);
// Mount production entry, synchronization and social bootstrap together. Only
// native/provider/transport boundaries are modeled; no access predicate copied.
const names = ['playerPartyLifetimeKey', 'playerPartyOwner', 'playerPartyOwnerRef', 'playerPartyAuthorityRef', 'watchPartyEntryPrepared', 'watchPartyEntryAllowed',
  'clearUnavailablePlayerParty', 'playerPartyAuthority', 'applyPartyRoomStateToGuest', 'updatePartyMembershipMap', 'refreshPartyMembershipSnapshot',
  'getWatchPartyHostAuthority', 'getSharedPlaybackControlAuthority', 'requestWatchPartyLocalMediaPermissions'];
const selected = names.map(name => declarations.get(name)).sort((a, b) => a.pos - b.pos).map(node => `const ${node.getText(ast)};`).join('\n');
const selectedEffects = [
  'playerPartyAuthority.activate()', 'setPartyOverlayMessages([]);', 'const bootstrapPartySync = async',
    'const premiumAccessKey = resolvePremiumAccessKeyForRoom(snapshot.room)', 'const bootstrapPartySocial = async', 'const pollPersistedSeatRequests = () =>',
].map(marker => effects.find(node => node.getText(ast).includes(marker)).getText(ast)).join(';\n');
const all = selected + selectedEffects;
const channelDeclarations = ['pendingPlayerPartyChannelRemovals', 'playerPartyChannelSequence', 'retirePlayerPartyChannel', 'waitForPlayerPartyChannelRetirement']
  .map(name => declarations.get(name)).map(node => `${node.name.getText(ast) === 'playerPartyChannelSequence' ? 'let' : 'const'} ${node.getText(ast)};`).join('\n');
const setters = [...new Set(all.match(/\bset[A-Z]\w+/g))].filter(name => !['setTimeout', 'setInterval', 'setPendingPartySeatRequest'].includes(name));
const refs = [...new Set(all.match(/\b\w+Ref(?=\.current)/g))].filter(name => !names.includes(name));
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const authority = (userId = 'viewer', sessionGeneration = 'one') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const same = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'state', 'restoreOnly'].every(key => a[key] === b[key]);
const member = (id = 'viewer') => ({ partyId: 'ROOM01', userId: id, role: 'viewer', membershipState: 'active', leftAt: null, displayName: 'Private viewer', lastSeenAt: new Date().toISOString() });
const snapshot = (memberships = [member()]) => ({ room: { partyId: 'ROOM01', hostUserId: 'host', roomGeneration: 'generation-a', roomType: 'title', titleId: 'title', sourceType: 'platform_title', sourceId: 'title', isActive: true, playbackState: 'playing', playbackPositionMillis: 10000, updatedAt: new Date().toISOString() }, memberships });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function mount(t, { initial = snapshot(), denied = false, premium = true, solo = false, strict = false, joinDenied = false, heldJoin = null } = {}) {
  const runtime = { authority: authority(), partyId: solo ? '' : 'ROOM01', cleanId: 'title', focused: true, appState: 'active', retry: 0,
    snapshot: initial, read: null, reads: 0, joins: 0, join: heldJoin, paused: 0, played: 0, play: null, seek: null, camera: null, remove: null, accounts: new Set(), apps: new Set(),
    channels: [], removed: [], timers: new Map(), intervals: new Map(), result: null };
  runtime.video = { pauseAsync: async () => { runtime.paused++; }, playAsync: async () => { runtime.played++; if (runtime.play) await runtime.play; }, setPositionAsync: async () => { if (runtime.seek) await runtime.seek; } };
  const helper = { exports: {} };
  const timers = { setTimeout: (fn, ms) => { runtime.timers.set(fn, ms); return fn; }, clearTimeout: fn => runtime.timers.delete(fn),
    setInterval: (fn, ms) => { runtime.intervals.set(fn, ms); return fn; }, clearInterval: fn => runtime.intervals.delete(fn) };
  vm.runInNewContext(compile(fs.readFileSync('_lib/roomSnapshotAuthority.ts', 'utf8')), { exports: helper.exports, ...timers });
  const context = { ...helper.exports, ...timers, React, useState: React.useState, useMemo: React.useMemo, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback,
    runtime, capture: result => { runtime.result = result; }, getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority, sameAccountSessionAuthority: same,
    subscribeToAccountSessionAuthority: fn => { runtime.accounts.add(fn); return () => runtime.accounts.delete(fn); },
    AppState: { get currentState() { return runtime.appState; }, addEventListener: (_, fn) => { runtime.apps.add(fn); return { remove: () => runtime.apps.delete(fn) }; } },
    getPartyRoomSnapshot: async () => { runtime.reads++; return runtime.read ? runtime.read() : runtime.snapshot; },
    getWritablePartyUserId: async () => runtime.authority.userId,
    resolveWatchPartySourceType: room => room.sourceType, resolveWatchPartySourceId: room => room.sourceId, resolvePremiumAccessKeyForRoom: () => 'party',
    requireWatchPartyLivePremium: async () => ({ allowed: premium, reason: premium ? 'allowed' : 'premium_required' }),
    resolveRoomAccess: async () => ({ isAllowed: !denied, reason: denied ? 'ticket_required' : 'allowed' }),
    isRuntimeControlBlockedAccess: () => false, getRuntimeControlBlockedCopy: () => ({}), trackEvent: noop, debugLog: noop,
    joinPartyRoomSession: async () => { runtime.joins++; if (runtime.join) await runtime.join; if (joinDenied) return null; runtime.snapshot = { ...runtime.snapshot, memberships: [{ ...member(runtime.authority.userId), partyId: runtime.partyId }] }; return runtime.snapshot.memberships[0]; },
    getActivePartyMemberships: rows => rows.filter(row => ['active', 'reconnecting'].includes(row.membershipState) && !row.leftAt),
    fetchPartyMessages: async () => [], decodePartySeatRequestMessage: () => null,
    resolvePartyParticipantDisplayName: ({ candidates }) => candidates?.find(Boolean) || 'Viewer', derivePartyStageRole: () => 'listener',
    applyPendingSeatRequestToParticipant: row => row,
    Platform: { OS: 'android' }, Audio: { getPermissionsAsync: async () => ({ granted: true }), requestPermissionsAsync: async () => ({ granted: true }) },
    getCameraPermission: async () => runtime.camera ? runtime.camera : { granted: true }, requestCameraPermission: async () => ({ granted: true }), Alert: { alert: noop }, Linking: { openSettings: noop },
    setPendingPartySeatRequest: noop, syncCurrentPartyPresence: async () => {}, pushPartyOverlayMessage: noop,
    LIVE_COMMENT_FALLBACK_REFRESH_MS: 30000, PARTY_GUEST_NOOP_DRIFT_MILLIS: 100, PARTY_GUEST_SOFT_SEEK_THRESHOLD_MILLIS: 1000, PARTY_GUEST_SOFT_NUDGE_MILLIS: 100,
    LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS: 6, PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS: 30000,
    clamp: (value, min, max) => Math.max(min, Math.min(value, max)),
    supabase: { auth: { getUser: async () => ({ data: { user: { id: runtime.authority.userId, user_metadata: { full_name: 'Private member', avatar_url: 'private-avatar' } } } }) },
      getChannels: () => runtime.channels.filter(channel => !runtime.removed.includes(channel)), removeChannel: async channel => { if (runtime.remove) await runtime.remove; runtime.removed.push(channel); },
      from: () => { const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: [] }) }; return query; },
      channel: topic => { const existing = runtime.channels.find(channel => channel.topic === topic && !runtime.removed.includes(channel)); if (existing) return existing;
        const channel = { topic, callbacks: [], on: (type, filter, fn) => { channel.callbacks.push({ type, filter, fn }); return channel; },
        subscribe: fn => { channel.status = fn; fn?.('SUBSCRIBED'); return channel; }, presenceState: () => ({}) }; runtime.channels.push(channel); return channel; } },
  };
  const defaults = { watchPartyEntryLoading: !solo, watchPartyEntryMissing: false, watchPartyEntryError: null, watchPartyAccess: null,
    watchPartyPremiumGate: null, verifiedPlayerPartyOwner: null, verifiedPlayerPartyMembershipOwner: null, partyParticipants: [], partyOverlayMessages: [], partyParticipantPreview: [], partyReactionBursts: [],
    watchPartyLocalMediaPermissionBusy: false, watchPartyLocalMediaIntent: true, watchPartyCameraPermissionGranted: true, watchPartyLiveKitJoinContract: { token: 'private' }, watchPartyLiveKitRenderableContract: { token: 'private' } };
  const initialRef = name => name === 'videoRef' ? 'runtime.video' : name === 'watchPartyLiveKitMountedRef' ? 'true'
    : name === 'durationRef' ? '100000' : /Map|Requests|Versions|Timers|Attempts|Scale|Translate|Opacity/.test(name) ? '{}'
    : /Participants/.test(name) ? '[]' : /Position|Revision|AtRef/.test(name) ? '0' : /Applying|Playing/.test(name) ? 'false' : 'null';
  const body = `function Host(){ const [ui,setUi]=useState(${JSON.stringify(defaults)});
    const {watchPartyEntryLoading,watchPartyEntryMissing,watchPartyEntryError,watchPartyAccess,watchPartyPremiumGate,verifiedPlayerPartyOwner,verifiedPlayerPartyMembershipOwner,watchPartyLocalMediaPermissionBusy}=ui;
    ${setters.map(name => `const ${name}=value=>setUi(old=>({...old,${JSON.stringify(name.slice(3, 4).toLowerCase() + name.slice(4))}:typeof value==='function'?value(old[${JSON.stringify(name.slice(3, 4).toLowerCase() + name.slice(4))}]):value}));`).join('\n')}
    ${refs.map(name => `const ${name}=useRef(${initialRef(name)});`).join('\n')}
    const sessionAuthority=runtime.authority,sessionUserId=sessionAuthority?.userId??'',sessionGeneration=sessionAuthority?.sessionGeneration??'',partyId=runtime.partyId,inWatchParty=!!partyId,
      cleanId=runtime.cleanId,sourceRaw='',expectsCreatorVideo=false,expectsSpectatorPlayback=false,isFocused=runtime.focused,playerAppState=runtime.appState,
      watchPartyEntryRetryToken=runtime.retry,isVideoReady=true,isSharedPartyPlayback=inWatchParty,cameraPermission=null,partyCommentOwnerKey=partyId+':'+sessionUserId+':'+sessionGeneration;
    partyCommentOwnerKeyRef.current=partyCommentOwnerKey;
    ${selected}
    playerPartyOwnerRef.current=playerPartyOwner;playerPartyAuthorityRef.current=playerPartyAuthority;
    ${selectedEffects};
    capture({ui,owner:playerPartyAuthority,refresh:refreshPartyMembershipSnapshot,apply:applyPartyRoomStateToGuest,allowed:watchPartyEntryAllowed,permission:requestWatchPartyLocalMediaPermissions,controls:getSharedPlaybackControlAuthority,
      refs:{partyMembershipMapRef,partyRoomHostUserIdRef,partySyncRoleRef,partySocialChannelRef,partySyncChannelRef,partySyncApplyingRef}});return null; }
    globalThis.Host=Host;`;
  vm.runInNewContext(compile(channelDeclarations + '\n' + body), context);
  const root = createRoot(container());
  const render = () => React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(context.Host)) : React.createElement(context.Host)));
  await render(); t.after(() => React.act(async () => root.unmount()));
  return { runtime, result: () => runtime.result, render, act: fn => React.act(async () => { await fn(); }), refresh: () => React.act(async () => { await runtime.result.refresh(); }),
    account: async value => { await React.act(async () => { runtime.authority = value; for (const fn of [...runtime.accounts]) fn(value); }); await render(); },
    app: async value => { await React.act(async () => { runtime.appState = value; for (const fn of [...runtime.apps]) fn(value); }); await render(); },
    retry: async () => { runtime.retry++; await render(); } };
}

test('actual Player initial prejoin enters only after ordinary access and joined membership', async t => {
  const h = await mount(t, { initial: snapshot([]) }); assert.equal(h.runtime.joins, 1); assert.equal(h.result().allowed, true);
  h.runtime.snapshot = snapshot([]); await h.refresh(); assert.equal(h.result().allowed, false); assert.equal(h.result().ui.watchPartyAccess, null);
});
for (const reason of ['null', 'failed', 'ended', 'removed', 'left', 'source', 'generation']) test(`actual Player ${reason} authority retires private state, owned channels and media`, async t => {
  const h = await mount(t); assert.equal(h.result().allowed, true); const oldChannels = [...h.runtime.channels];
  if (reason === 'null') h.runtime.snapshot = null;
  else if (reason === 'failed') h.runtime.read = () => Promise.reject(Error('unavailable'));
  else if (reason === 'removed' || reason === 'left') h.runtime.snapshot = snapshot([{ ...member(), membershipState: reason, leftAt: reason === 'left' ? 'now' : null }]);
  else h.runtime.snapshot = { ...snapshot(), room: { ...snapshot().room, ...(reason === 'ended' ? { isActive: false } : reason === 'source' ? { sourceId: 'other' } : { roomGeneration: 'generation-b' }) } };
  await h.refresh(); assert.equal(h.result().allowed, false); assert.equal(h.result().ui.watchPartyEntryMissing, true);
  assert.equal(h.result().ui.watchPartyLiveKitJoinContract, null); assert.equal(h.result().ui.watchPartyLiveKitRenderableContract, null);
  assert.equal(h.result().ui.watchPartyLocalMediaIntent, false); assert.equal(h.result().ui.partyParticipants.length, 0); assert.equal(h.result().ui.partyOverlayMessages.length, 0);
  assert.equal(Object.keys(h.result().refs.partyMembershipMapRef.current).length, 0); assert.ok(h.runtime.paused > 0); assert.equal(h.runtime.intervals.size, 0);
  assert.ok(oldChannels.every(channel => h.runtime.removed.includes(channel)));
  await h.act(() => { for (const channel of oldChannels) { channel.status?.('SUBSCRIBED'); for (const { type, fn } of channel.callbacks) if (type === 'presence') fn(); } });
  assert.equal(h.result().ui.partyParticipants.length, 0); assert.equal(h.result().allowed, false);
});
for (const options of [{ denied: true }, { premium: false }, { joinDenied: true }]) test(`actual Player never falls back to solo on denied access ${JSON.stringify(options)}`, async t => {
  const h = await mount(t, options); assert.equal(h.result().allowed, false); assert.equal(h.runtime.played, 0);
  if (!options.joinDenied) assert.equal(h.runtime.joins, 0);
});
test('held old membership read cannot revive or retire replacement session resources', async t => {
  const h = await mount(t), held = deferred(), old = h.result().owner; h.runtime.read = () => held.promise;
  await h.act(() => { void h.result().refresh(); }); h.runtime.read = null;
  h.runtime.snapshot = snapshot([member('replacement')]); await h.account(authority('replacement', 'two'));
  const newer = h.runtime.channels.filter(channel => !h.runtime.removed.includes(channel)); await h.act(() => held.resolve(snapshot())); await h.act(() => old.retire());
  assert.equal(h.result().allowed, true); assert.ok(newer.every(channel => !h.runtime.removed.includes(channel)));
});
test('background and focus retirement revalidate entry, including StrictMode replay', async t => {
  const h = await mount(t, { strict: true }); assert.equal(h.result().allowed, true);
  await h.app('background'); assert.equal(h.result().allowed, false); assert.equal(h.runtime.intervals.size, 0);
  await h.app('active'); assert.equal(h.result().allowed, true);
  h.runtime.focused = false; await h.render(); assert.equal(h.result().allowed, false);
  h.runtime.focused = true; await h.render(); assert.equal(h.result().allowed, true);
});
test('timeout retires while explicit retry can establish a new exact owner', async t => {
  const h = await mount(t), held = deferred(); h.runtime.read = () => held.promise;
  await h.act(() => { void h.result().refresh(); }); await h.act(() => { for (const [fn, delay] of [...h.runtime.timers]) if (delay === 12000) fn(); });
  assert.equal(h.result().allowed, false); h.runtime.read = null; await h.retry(); assert.equal(h.result().allowed, true);
  await h.act(() => held.resolve(null)); assert.equal(h.result().allowed, true);
});
test('owned pending seek cannot play after authority loss', async t => {
  const h = await mount(t), held = deferred(); h.runtime.seek = held.promise;
  await h.act(() => { void h.result().apply({ ...snapshot().room, playbackPositionMillis: 50000 }); });
  h.runtime.snapshot = null; await h.refresh(); const played = h.runtime.played;
  await h.act(() => held.resolve()); assert.equal(h.runtime.played, played); assert.equal(h.result().allowed, false);
});
test('standalone Player is untouched by party authority retirement', async t => {
  const h = await mount(t, { solo: true }); assert.equal(h.result().allowed, true); assert.equal(h.runtime.reads, 0); assert.equal(h.runtime.joins, 0); assert.equal(h.runtime.paused, 0);
});

test('listing pause preserves currently authorized Circle playback; actual Circle loss retires it', async t => {
  const h = await mount(t); h.runtime.snapshot = { ...snapshot(), room: { ...snapshot().room, discoveryVisibility: 'circle', discoveryPaused: true } };
  await h.refresh(); assert.equal(h.result().allowed, true);
  h.runtime.snapshot = null; await h.refresh(); assert.equal(h.result().allowed, false);
});
for (const change of ['session', 'account', 'background', 'route']) test(`held actual camera permission cannot enable media for a replaced ${change}`, async t => {
  const h = await mount(t), held = deferred(), oldControls = h.result().controls; h.runtime.camera = held.promise;
  await h.act(() => { void h.result().permission(); });
  if (change === 'session') await h.account(authority('viewer', 'two'));
  else if (change === 'account') { h.runtime.snapshot = snapshot([member('replacement')]); await h.account(authority('replacement', 'two')); }
  else if (change === 'background') await h.app('background');
  else { h.runtime.partyId = 'ROOM02'; h.runtime.snapshot = { room: { ...snapshot().room, partyId: 'ROOM02' }, memberships: [{ ...member(), partyId: 'ROOM02' }] }; await h.render(); }
  await h.act(() => held.resolve({ granted: true }));
  assert.equal(h.result().ui.watchPartyLocalMediaIntent, false); assert.equal(h.result().ui.watchPartyCameraPermissionGranted, false);
  assert.equal(oldControls().canControl, false);
});

test('already retired owner cannot be reactivated by retained effect or callback', async t => {
  const h = await mount(t), old = h.result().owner; h.runtime.snapshot = null; await h.refresh();
  old.activate(); assert.equal(old.current(), false); assert.equal(await old.read(), null); assert.equal(h.result().allowed, false);
});

test('held old native play cannot pause a newer solo lifetime reusing the same controller', async t => {
  const h = await mount(t), held = deferred(); h.runtime.play = held.promise;
  await h.act(() => { void h.result().apply({ ...snapshot().room, playbackPositionMillis: 10000 }); });
  h.runtime.partyId = ''; await h.render(); const paused = h.runtime.paused;
  await h.act(() => held.resolve()); assert.equal(h.runtime.paused, paused); assert.equal(h.result().allowed, true);
});
test('held old seek completion cannot release a newer owner synchronization latch', async t => {
  const h = await mount(t), old = deferred(), next = deferred(); h.runtime.seek = old.promise;
  await h.act(() => { void h.result().apply({ ...snapshot().room, playbackPositionMillis: 50000 }); });
  h.runtime.seek = next.promise; h.runtime.snapshot = { ...snapshot(), room: { ...snapshot().room, playbackPositionMillis: 80000 } };
  await h.account(authority('viewer', 'two')); const owned = h.result().refs.partySyncApplyingRef.current; assert.ok(owned);
  await h.act(() => old.resolve()); assert.equal(h.result().refs.partySyncApplyingRef.current, owned);
  await h.act(() => next.resolve()); assert.equal(h.result().refs.partySyncApplyingRef.current, null);
});
test('same-topic social replacement awaits captured old channel removal settlement', async t => {
  const h = await mount(t), held = deferred(); h.runtime.remove = held.promise;
  const old = h.runtime.channels.filter(channel => channel.topic === 'party-chat-ROOM01'); assert.equal(old.length, 1);
  await h.account(authority('viewer', 'two'));
  assert.equal(h.runtime.channels.filter(channel => channel.topic === 'party-chat-ROOM01').length, 1);
  h.runtime.remove = null; await h.act(() => held.resolve());
  const current = h.runtime.channels.filter(channel => channel.topic === 'party-chat-ROOM01'); assert.equal(current.length, 2);
  assert.equal(h.runtime.removed.includes(current[1]), false); assert.equal(h.result().allowed, true);
});

for (const field of ['roomGeneration', 'sourceId', 'hostUserId']) test(`held admission cannot reuse access after authoritative ${field} changes`, async t => {
  const held = deferred(), h = await mount(t, { initial: snapshot([]), heldJoin: held.promise });
  assert.equal(h.runtime.joins, 1); assert.equal(h.result().allowed, false); assert.equal(h.runtime.played, 0);
  h.runtime.snapshot = { ...snapshot(), room: { ...snapshot().room, [field]: 'replacement' } };
  await h.act(() => held.resolve()); assert.equal(h.result().allowed, false); assert.equal(h.runtime.played, 0); assert.equal(h.result().ui.watchPartyAccess, null);
});
