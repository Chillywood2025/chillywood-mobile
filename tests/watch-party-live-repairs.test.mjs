import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Source-bound regressions for the watch-party-live manifest: Player comment,
// membership/provider failure, route cleanup, and fullscreen-control boundaries.
// Supabase/LiveKit/native views are test doubles. These are JavaScript evidence,
// not Android/iOS installed-device, native-media, or provider-delivery proof.
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const parse = path => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true,
  path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const player = parse('app/player/[id].tsx');
const party = parse('_lib/watchParty.ts');
const noop = () => {};
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const find = (ast, predicate) => {
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(ast);
  assert.equal(found.length, 1, 'exactly one production source boundary must match');
  return found[0];
};
const initializer = name => {
  const value = find(player, node => ts.isVariableDeclaration(node) && node.name.getText(player) === name).initializer;
  return ts.isCallExpression(value) && value.expression.getText(player) === 'useCallback' ? value.arguments[0] : value;
};
const evaluate = (source, scope) => {
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, scope);
  return scope;
};
const callback = (name, scope) => evaluate(`globalThis.actual = ${initializer(name).getText(player)};`, scope).actual;
const declaration = (ast, name) => find(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast);
const commentCleanup = find(player, node => ts.isCallExpression(node) && node.expression.getText(player) === 'useEffect'
  && node.arguments[0]?.getText(player).includes('partyCommentSendRef.current = null')).arguments[0];
const seatMarkers = evaluate(read('_lib/watch-party/watch-party-live-source-truth.ts'), { exports: {} }).exports;

function messageHarness(rows = []) {
  const state = { rows, reads: [], inserts: [], attachments: [], error: null, throwRead: false, throwAttachments: false,
    insertResult: null, writableUserId: 'host', attachmentMap: new Map() };
  const scope = { exports: {}, WATCH_PARTY_MESSAGES_TABLE: 'watch_party_messages',
    resolveWritableUserId: async id => id === state.writableUserId ? id : '',
    readSocialAttachmentsForSurfaces: async (surface, ids) => {
      state.attachments.push({ surface, ids: Array.from(ids) });
      if (state.throwAttachments) throw Error('attachments unavailable');
      return state.attachmentMap;
    },
    supabase: { from(table) {
      const query = { table, orders: [], filters: [], limit: Infinity };
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(field, value) { query.filters.push([field, value]); return builder; },
        order(field, { ascending }) { query.orders.push({ field, ascending }); return builder; },
        limit(value) { query.limit = value; return builder; },
        insert(value) { state.inserts.push({ table, value }); return builder; },
        async single() { return state.insertResult; },
        async returns() {
          state.reads.push(query);
          if (state.throwRead) throw Error('transport unavailable');
          const data = state.rows?.filter(row => query.filters.every(([key, value]) => row[key] === value))
            .sort((a, b) => {
              for (const { field, ascending } of query.orders) {
                const comparison = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
                if (comparison) return ascending ? comparison : -comparison;
              }
              return 0;
            }).slice(0, query.limit);
          return { data, error: state.error };
        },
      };
      return builder;
    } },
  };
  scope.SUPABASE_URL = 'https://fixture.invalid';
  scope.SUPABASE_ANON_KEY = 'fixture';
  scope.captureAccountBoundSupabaseMutationSubject = async userId => ({ accessToken: 'frozen-host-token', authority: { userId } });
  scope.assertAccountBoundSupabaseMutationSubjectCurrent = subject => assert.equal(subject.authority.userId, state.writableUserId);
  scope.createClient = (_url, _key, options) => {
    assert.equal(options.global.headers.Authorization, 'Bearer frozen-host-token');
    return scope.supabase;
  };
  evaluate(['fetchPartyMessages', 'sendPartyMessageRecord', 'sendPartyMessage'].map(name => declaration(party, name)).join('\n'), scope);
  return { state, api: scope.exports };
}
const row = (index, overrides = {}) => ({ id: `message-${String(index).padStart(3, '0')}`, party_id: 'PARTY42',
  user_id: 'host', username: 'Host', text: `Comment ${index}`, created_at: new Date(1_750_000_000_000 + index * 1000).toISOString(), ...overrides });

test('history larger than 120 returns the newest 30 comments in chronological order', async () => {
  const rows = Array.from({ length: 165 }, (_, i) => row(i));
  const h = messageHarness([...rows].reverse().concat(row(999, { party_id: 'OTHER' })));
  const result = await h.api.fetchPartyMessages(' party42 ', 30);
  assert.deepEqual(Array.from(result, item => item.id), rows.slice(-30).map(item => item.id));
  assert.deepEqual(Array.from(result, item => item.body), rows.slice(-30).map(item => item.text));
  assert.equal(h.state.reads[0].table, 'watch_party_messages');
  assert.equal(h.state.attachments[0].surface, 'watch_party_room_message');
  assert.equal(h.state.attachments[0].ids.length, 30, 'attachments fetched only for returned page');
});

test('newest 60 seat markers remain visible and chronological after a long room history', async () => {
  const rows = Array.from({ length: 180 }, (_, i) => row(i, { text: seatMarkers.encodePartySeatRequestMessage(`participant-${i}`, i % 2 === 0,
    { sentAt: 1_750_000_000_000 + i * 1000, requestVersion: `request-${i}` }) }));
  const h = messageHarness(rows);
  const result = await h.api.fetchPartyMessages('PARTY42', 60);
  assert.deepEqual(Array.from(result, item => item.id), rows.slice(-60).map(item => item.id));
  const decoded = Array.from(result, item => seatMarkers.decodePartySeatRequestMessage(item.body));
  assert.equal(decoded[0].participantId, 'participant-120');
  assert.equal(decoded.at(-1).participantId, 'participant-179');
  assert.equal(decoded.at(-1).requestVersion, 'request-179');
  assert.equal(decoded.at(-1).pending, false);
});

test('same-timestamp history has deterministic newest-page selection and ascending id presentation', async () => {
  const rows = Array.from({ length: 150 }, (_, i) => row(i, { created_at: '2026-10-14T20:00:00.000Z' }));
  for (const shuffled of [rows, [...rows].reverse(), [...rows.slice(65), ...rows.slice(0, 65)]]) {
    const result = await messageHarness(shuffled).api.fetchPartyMessages('PARTY42', 30);
    assert.deepEqual(Array.from(result, item => item.id), rows.slice(-30).map(item => item.id));
  }
});

test('history attaches each selected message by persisted id and defaults absent attachments to empty', async () => {
  const h = messageHarness([row(1), row(2)]);
  const attachment = { id: 'attachment-2', type: 'image', url: 'https://example.invalid/image' };
  h.state.attachmentMap.set('message-002', [attachment]);
  const result = await h.api.fetchPartyMessages('PARTY42');
  assert.deepEqual(plain(result[0].attachments), []);
  assert.deepEqual(plain(result[1].attachments), [attachment]);
});

for (const failure of ['error', 'throwRead', 'throwAttachments', 'missing-data']) {
  test(`history ${failure} returns empty without inventing saved messages`, async () => {
    const h = messageHarness([row(1)]);
    if (failure === 'missing-data') h.state.rows = null;
    else h.state[failure] = failure === 'error' ? { message: 'database unavailable' } : true;
    assert.deepEqual(plain(await h.api.fetchPartyMessages('PARTY42', 30)), []);
    if (failure !== 'throwAttachments') assert.equal(h.state.attachments.length, 0);
  });
}

test('blank room history does not query or fetch attachments', async () => {
  const h = messageHarness([row(1)]);
  assert.deepEqual(plain(await h.api.fetchPartyMessages('  ', 30)), []);
  assert.equal(h.state.reads.length, 0);
  assert.equal(h.state.attachments.length, 0);
});

test('message persistence returns server id, text and timestamp rather than a synthetic UI identity', async () => {
  const h = messageHarness();
  h.state.insertResult = { data: row(7, { id: 'server-assigned-id', text: 'server text' }), error: null };
  const result = await h.api.sendPartyMessageRecord(' party42 ', 'host', 'chat', ' draft ', { username: ' Host ' });
  assert.equal(result.id, 'server-assigned-id');
  assert.equal(result.body, 'server text');
  assert.equal(result.createdAt, row(7).created_at);
  assert.equal(h.state.inserts[0].value.party_id, 'PARTY42');
  assert.equal(h.state.inserts[0].value.text, 'draft');
  assert.equal(h.state.inserts[0].value.username, 'Host');
  h.state.insertResult = { data: null, error: { message: 'rejected' } };
  assert.equal(await h.api.sendPartyMessageRecord('PARTY42', 'host', 'chat', 'draft'), null);
  assert.equal(await h.api.sendPartyMessage('PARTY42', 'host', 'chat', 'draft'), false);
});

function commentHarness() {
  const state = { draft: '  Original comment  ', sending: false, saves: [], overlays: [], broadcasts: [], alerts: [], events: [] };
  const saved = { id: 'persisted-77', userId: 'host', body: 'Original comment', createdAt: '2026-10-14T20:00:00Z' };
  state.save = async () => saved;
  state.broadcast = async () => 'ok';
  state.identity = async () => 'host';
  const scope = {
    inWatchParty: true, partyId: 'PARTY42', partyUserId: 'host', partyCommentDraft: state.draft,
    partyCommentSendRef: { current: null }, partyCommentRevisionRef: { current: 0 },
    partyCommentOwnerKeyRef: { current: 'PARTY42:host:session' }, partyDisplayNameRef: { current: 'Host' },
    setControlsVisible: noop, resetAutoHideTimer: noop,
    setPartyCommentSending(value) { state.sending = value; },
    setPartyCommentDraft(value) { state.draft = typeof value === 'function' ? value(state.draft) : value; },
    getSafePartyUserId: () => state.identity(),
    async sendPartyMessageRecord(...args) { state.events.push('save'); state.saves.push(args); return state.save(...args); },
    pushPartyOverlayMessage(value) { state.events.push('overlay'); state.overlays.push(value); },
    partySocialChannelRef: { current: { send(value) { state.events.push('broadcast'); state.broadcasts.push(value); return state.broadcast(value); } } },
    Alert: { alert: (...args) => state.alerts.push(args) },
  };
  const send = callback('onSendPartyComment', scope);
  const effect = evaluate(`globalThis.effect = ${commentCleanup.getText(player)};`, scope).effect;
  let cleanup = effect();
  return { state, saved, scope, send,
    abandon() { cleanup(); },
    replaceRoute() { cleanup(); cleanup = effect(); },
    draft(value) { state.draft = value; scope.partyCommentDraft = value; },
  };
}

test('comment awaits persistence before visible success or broadcast and uses the persisted identity', async () => {
  const h = commentHarness(); const held = deferred(); h.state.save = () => held.promise;
  const pending = h.send();
  assert.equal(h.state.saves.length, 1);
  assert.equal(h.state.sending, true);
  assert.equal(h.state.overlays.length, 0);
  assert.equal(h.state.broadcasts.length, 0);
  assert.equal(h.state.draft, '  Original comment  ');
  held.resolve({ ...h.saved, id: 'database-id', body: 'Persisted body' }); await pending;
  assert.deepEqual(h.state.events, ['save', 'overlay', 'broadcast']);
  assert.equal(h.state.overlays[0].id, 'database-id');
  assert.equal(h.state.overlays[0].body, 'Persisted body');
  assert.equal(h.state.broadcasts[0].payload.id, 'database-id');
  assert.equal(h.state.broadcasts[0].payload.body, 'Persisted body');
  assert.equal(h.state.broadcasts[0].payload.userId, 'host');
  assert.equal(h.state.draft, '');
  assert.equal(h.state.sending, false);
});

for (const failure of ['null', 'throw']) test(`comment save ${failure} preserves its draft and does not claim success`, async () => {
  const h = commentHarness(); h.state.save = async () => { if (failure === 'throw') throw Error('save failed'); return null; };
  await h.send();
  assert.equal(h.state.draft, '  Original comment  ');
  assert.equal(h.state.overlays.length, 0);
  assert.equal(h.state.broadcasts.length, 0);
  assert.equal(h.state.alerts[0][0], 'Comment not sent');
  assert.equal(h.state.sending, false);
  assert.equal(h.scope.partyCommentSendRef.current, null);
  h.state.save = async () => h.saved; await h.send();
  assert.equal(h.state.saves.length, 2, 'failed save releases the single-flight latch for retry');
  assert.equal(h.state.overlays.length, 1);
});

test('broadcast rejection after a successful save does not say the comment failed to save', async () => {
  const h = commentHarness(); h.state.broadcast = async () => { throw Error('channel offline'); };
  await h.send();
  assert.equal(h.state.overlays.length, 1);
  assert.equal(h.state.draft, '');
  assert.equal(h.state.alerts.length, 0);
  assert.equal(h.state.sending, false);
});

test('same-frame double taps perform one save and one broadcast', async () => {
  const h = commentHarness(); const held = deferred(); h.state.save = () => held.promise;
  const first = h.send(); const second = h.send();
  assert.equal(h.state.saves.length, 1);
  held.resolve(h.saved); await Promise.all([first, second]);
  assert.equal(h.state.overlays.length, 1);
  assert.equal(h.state.broadcasts.length, 1);
});

test('saving an earlier comment does not erase a newer draft', async () => {
  const h = commentHarness(); const held = deferred(); h.state.save = () => held.promise;
  const pending = h.send(); h.draft('Newly typed comment'); held.resolve(h.saved); await pending;
  assert.equal(h.state.draft, 'Newly typed comment');
});

test('actual route cleanup suppresses an abandoned save completion and preserves replacement-flight ownership', async () => {
  const h = commentHarness(); const firstSave = deferred(); const secondSave = deferred();
  h.state.save = () => firstSave.promise;
  const old = h.send(); h.replaceRoute();
  h.scope.partyId = 'PARTY43'; h.draft('Replacement route comment'); h.state.save = () => secondSave.promise;
  const next = h.send(); const nextOwner = h.scope.partyCommentSendRef.current;
  firstSave.resolve(h.saved); await old;
  assert.equal(h.state.overlays.length, 0);
  assert.equal(h.state.broadcasts.length, 0);
  assert.equal(h.state.draft, 'Replacement route comment');
  assert.equal(h.state.sending, true);
  assert.equal(h.scope.partyCommentSendRef.current, nextOwner);
  secondSave.resolve({ ...h.saved, id: 'replacement-message', body: 'Replacement route comment' }); await next;
  assert.equal(h.state.overlays.length, 1);
  assert.equal(h.state.overlays[0].id, 'replacement-message');
  assert.equal(h.state.saves[1][0], 'PARTY43');
});

test('actual unmount cleanup suppresses an abandoned identity read before persistence starts', async () => {
  const h = commentHarness(); const held = deferred(); h.scope.partyUserId = ''; h.state.identity = () => held.promise;
  const pending = h.send(); h.abandon(); held.resolve('host'); await pending;
  assert.equal(h.state.saves.length, 0);
  assert.equal(h.state.overlays.length, 0);
  assert.equal(h.state.broadcasts.length, 0);
  assert.equal(h.state.alerts.length, 0);
});

test('an abandoned failed save cannot alert in a replacement route', async () => {
  const h = commentHarness(); const held = deferred(); h.state.save = () => held.promise;
  const pending = h.send(); h.replaceRoute(); held.reject(Error('old failure')); await pending;
  assert.equal(h.state.alerts.length, 0);
  assert.equal(h.state.sending, false);
});

function seatHarness() {
  const membership = { userId: 'speaker', role: 'viewer', membershipState: 'active', stageRole: 'speaker', canSpeak: true,
    isMuted: false, hostMuted: false, selfMuted: false };
  const state = { persisted: { ...membership, stageRole: 'listener', canSpeak: false }, provider: async () => true,
    participants: [{ id: 'speaker', canSpeak: true, stageRole: 'speaker', isSpeaking: true, isRequestingToSpeak: true, muted: false }],
    writes: [], providerCalls: [], seatBroadcasts: [], requestBroadcasts: [], clears: [], alerts: [], presence: [], refreshes: 0, events: [] };
  const scope = {
    inWatchParty: true, partyId: 'PARTY42', partyUserId: 'host', partySyncUserIdRef: { current: 'host' },
    getWatchPartyHostAuthority: () => ({ isHost: true, source: 'membership' }),
    partyMembershipMapRef: { current: { speaker: membership } }, pendingPartySeatRequestsRef: { current: { speaker: { requestVersion: 'request-7' } } },
    setPartyParticipantState: async (...args) => { state.events.push('save'); state.writes.push(args); return state.persisted; },
    enforceLiveKitParticipantState: async value => { state.events.push('provider'); state.providerCalls.push(value); return state.provider(value); },
    refreshPartyMembershipSnapshot: async () => {
      state.refreshes++;
      const readback = state.readback === undefined ? state.persisted : state.readback;
      return { memberships: readback ? [readback] : [] };
    },
    clearPendingPartySeatRequest: (...args) => state.clears.push(args),
    setPartyParticipants: update => { state.participants = update(state.participants); },
    broadcastPartySeatState: async (...args) => { state.events.push('broadcast'); state.seatBroadcasts.push(args); },
    broadcastPartySeatRequest: async (...args) => state.requestBroadcasts.push(args),
    syncCurrentPartyPresence: async value => state.presence.push(value),
    showLivePresenceEvent: value => state.presence.push(value),
    Alert: { alert: (...args) => state.alerts.push(args) }, debugLog: noop,
  };
  return { state, scope, persist: callback('persistPartySeatState', scope), report: callback('reportPartySeatUpdateUnavailable', scope) };
}
const demote = { canSpeak: false, stageRole: 'listener', isRequestingToSpeak: false };

test('seat persistence returns true only after the saved membership and provider enforcement succeed', async () => {
  const h = seatHarness();
  assert.equal(await h.persist('speaker', demote), true);
  assert.deepEqual(h.state.events, ['save', 'broadcast', 'provider']);
  assert.equal(h.scope.partyMembershipMapRef.current.speaker, h.state.persisted);
  assert.equal(h.state.participants[0].isSpeaking, false);
  assert.equal(h.state.participants[0].canSpeak, false);
  assert.deepEqual(h.state.clears[0], ['speaker', 'seat-state-persisted', 'request-7']);
  assert.deepEqual(plain(h.state.requestBroadcasts[0]), ['speaker', false, 'request-7']);
});

for (const failure of ['false', 'throw']) test(`seat provider ${failure} returns an honest partial result after saving`, async () => {
  const h = seatHarness(); h.state.provider = async () => { if (failure === 'throw') throw Error('provider unavailable'); return false; };
  const result = await h.persist('speaker', demote);
  assert.equal(result, 'provider_pending');
  assert.equal(h.state.writes.length, 1);
  assert.equal(h.state.seatBroadcasts.length, 1);
  assert.equal(h.scope.partyMembershipMapRef.current.speaker, h.state.persisted);
  await h.report(result, 'speaker');
  assert.match(h.state.alerts[0][1], /seat change was saved/i);
  assert.match(h.state.alerts[0][1], /may still be broadcasting/i);
});

test('failed membership persistence and fallback return false without changing visible seats or broadcasting success', async () => {
  const h = seatHarness(); h.state.persisted = null; h.state.provider = async () => false;
  assert.equal(await h.persist('speaker', demote), false);
  assert.equal(h.state.providerCalls[0].metadata.persistMembershipState, true);
  assert.equal(h.state.seatBroadcasts.length, 0);
  assert.equal(h.state.requestBroadcasts.length, 0);
  assert.equal(h.state.clears.length, 0);
  assert.equal(h.state.participants[0].canSpeak, true);
  await h.report(false, 'speaker');
  assert.match(h.state.alerts[0][1], /could not be saved/i);
  assert.equal(h.state.alerts[0][2], undefined, 'no provider-only retry for an unsaved seat');
});

for (const confirmed of [false, true]) test(`false fallback with exact saved readback reports ${confirmed ? 'success' : 'provider_pending'} according to final enforcement`, async () => {
  const h = seatHarness(); h.state.readback = h.state.persisted; h.state.persisted = null;
  h.state.provider = async value => value.metadata.persistMembershipState ? false : confirmed;
  assert.equal(await h.persist('speaker', demote), confirmed ? true : 'provider_pending');
  assert.equal(h.state.refreshes, 1, 'false fallback must still check for a durable partial save');
  assert.equal(h.scope.partyMembershipMapRef.current.speaker, h.state.readback);
  assert.equal(h.state.providerCalls.length, 2);
  assert.equal(h.state.seatBroadcasts.length, 1);
  assert.equal(h.state.participants[0].canSpeak, false);
  assert.equal(h.state.writes.length, 1, 'readback cannot repeat or toggle the saved mutation');
});

for (const [field, value] of [['userId', 'other-participant'], ['stageRole', 'speaker'], ['canSpeak', true], ['hostMuted', true]]) {
  test(`fallback readback with mismatched ${field} cannot claim requested membership was saved`, async () => {
    const h = seatHarness(); h.state.readback = { ...h.state.persisted, [field]: value }; h.state.persisted = null;
    h.state.provider = async () => false;
    assert.equal(await h.persist('speaker', demote), false);
    assert.equal(h.state.refreshes, 1);
    assert.equal(h.state.providerCalls.length, 1);
    assert.equal(h.state.seatBroadcasts.length, 0);
    assert.equal(h.state.clears.length, 0);
    assert.equal(h.state.participants[0].canSpeak, true);
  });
}

for (const explicitUnmute of [false, true]) test(`speaker save ${explicitUnmute ? 'with explicit host unmute' : 'without mute change'} preserves the participant's independent self mute`, async () => {
  const h = seatHarness();
  Object.assign(h.scope.partyMembershipMapRef.current.speaker, { isMuted: true, selfMuted: true, hostMuted: false });
  h.state.persisted = { ...h.scope.partyMembershipMapRef.current.speaker };
  const options = { canSpeak: true, stageRole: 'speaker', isRequestingToSpeak: false, ...(explicitUnmute ? { isMuted: false } : {}) };
  assert.equal(await h.persist('speaker', options), true);
  assert.equal(h.state.writes[0][2].isMuted, false, 'host mute intent must not copy the combined self-muted flag');
  assert.equal(h.state.participants[0].muted, true, 'UI follows durable combined mute');
  assert.equal(h.state.participants[0].isSpeaking, false);
  assert.equal(h.state.seatBroadcasts[0][1].isMuted, true, 'broadcast follows durable combined mute');
});

for (const result of [false, 'provider_pending']) test(`actual approval caller does not report success for ${result}`, async () => {
  const h = seatHarness();
  Object.assign(h.scope, {
    canAddPartySpeakerSeat: () => true, persistPartySeatState: async () => result, reportPartySeatUpdateUnavailable: h.report,
    suppressNextSpeakingEventRef: { current: {} }, speakingOrderRef: { current: [] }, bumpRoomEnergy: noop, markParticipantActive: noop,
  });
  const approve = callback('approvePartyParticipantSeat', h.scope);
  assert.equal(await approve({ id: 'speaker', name: 'Speaker' }), false);
  assert.equal(h.scope.suppressNextSpeakingEventRef.current.speaker, undefined);
  assert.equal(h.scope.speakingOrderRef.current.length, 0);
  assert.equal(h.state.alerts.length, 1);
  assert.equal(h.state.presence.some(value => typeof value === 'string' && value.includes('is now allowed to speak')), false);
});

test('seat controls reject a caller without host authority before any mutation', async () => {
  const h = seatHarness(); h.scope.getWatchPartyHostAuthority = () => ({ isHost: false });
  assert.equal(await h.persist('speaker', demote), false);
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.providerCalls.length, 0);
});

test('provider-only Retry targets the same room and participant without repeating saved membership changes', async () => {
  const h = seatHarness(); const held = deferred(); h.state.provider = () => held.promise;
  await h.report('provider_pending', 'speaker');
  const retry = h.state.alerts[0][2].find(action => action.text === 'Retry live update');
  assert.ok(retry, 'a real Alert action offers a bounded provider-only retry');
  retry.onPress(); retry.onPress();
  assert.equal(h.state.providerCalls.length, 1, 'the retry closes its own same-frame double-tap window');
  assert.deepEqual(plain(h.state.providerCalls[0]), { surface: 'watch-party-live', roomName: 'PARTY42', targetParticipantIdentity: 'speaker',
    metadata: { source: 'watch-party-live-seat-control-retry' } });
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.seatBroadcasts.length, 0);
  held.resolve(false); await flush();
  assert.equal(h.state.alerts.length, 2, 'unconfirmed retry remains retryable');
  h.state.provider = async () => true;
  h.state.alerts[1][2].find(action => action.text === 'Retry live update').onPress(); await flush();
  assert.equal(h.state.providerCalls.length, 2);
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.presence.at(-1), 'Live media update confirmed.');
});

function fullscreenHarness() {
  const host = { id: 'host', name: 'Host', role: 'host', stageRole: 'host', canSpeak: true };
  const speaker = { id: 'speaker', name: 'Speaker', role: 'viewer', stageRole: 'speaker', canSpeak: true };
  const state = { fullscreen: true, controls: false, active: null, tools: null, keyboard: true, dismissals: 0, requests: 0 };
  const scope = {
    React, View: 'View', TouchableOpacity: 'TouchableOpacity', Text: 'Text', styles: {},
    trackedUserId: 'host', partyId: 'PARTY42', liveBubbleParticipants: [host, speaker], partyParticipants: [host, speaker],
    currentWatchPartyHostAuthority: { isHost: true }, activeParticipantId: null,
    Keyboard: { dismiss: () => { state.dismissals++; } },
    setWatchPartyCommentKeyboardOpen: value => { state.keyboard = value; },
    setIsStandaloneFullscreen: value => { state.fullscreen = value; },
    setControlsVisible: value => { state.controls = value; },
    setActiveParticipantId: value => { state.active = value; },
    setActiveParticipantToolsId: value => { state.tools = value; },
    onPressSharedPlayerRequestCamera: () => { state.requests++; },
    setPartyCommentsOpen: noop, setWatchPartyMenuOpen: noop, resetAutoHideTimer: noop,
    markParticipantActive: noop, bumpRoomEnergy: noop, debugLog: noop,
    sharedFullscreenRightRailWidth: 130, shouldRenderSharedPlayerLocalMediaControl: true,
    shouldRenderSharedPlayerSelfMuteControl: false, shouldRenderWatchPartyLiveKit: false,
    activeWatchPartyLiveKitJoinContract: null, shouldRenderWatchPartyLiveKitStableShell: false, watchPartyLiveKitRetryStatus: null,
    renderWatchPartyBubbleGridSurface: () => React.createElement('BubbleGrid'),
  };
  return { state, scope, host, speaker,
    press: callback('onWatchPartyLiveKitParticipantPress', scope),
    fallbackPress: callback('onFocusPlayerParticipant', scope),
    rail: callback('renderSharedFullscreenParticipantRail', scope),
  };
}
const walk = (tree, predicate) => {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(value => walk(value, predicate));
  return [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];
};

for (const target of ['host', 'speaker']) test(`host fullscreen ${target} bubble opens regular controls and dismisses the keyboard`, () => {
  const h = fullscreenHarness(); h.press(target);
  assert.equal(h.state.fullscreen, false);
  assert.equal(h.state.controls, true);
  assert.equal(h.state.keyboard, false);
  assert.equal(h.state.dismissals, 1);
  assert.equal(h.state.requests, 0);
  if (target === 'speaker') { assert.equal(h.state.active, target); assert.equal(h.state.tools, target); }
});

test('fallback host participant tap leaves fullscreen before selecting its regular controls', () => {
  const h = fullscreenHarness(); h.fallbackPress(h.speaker);
  assert.equal(h.state.fullscreen, false);
  assert.equal(h.state.keyboard, false);
  assert.equal(h.state.dismissals, 1);
  assert.equal(h.state.active, 'speaker');
});

test('unknown participant identity cannot open host tools for another participant', () => {
  const h = fullscreenHarness(); h.press('missing-participant');
  assert.equal(h.state.fullscreen, true);
  assert.equal(h.state.active, null);
});

test('actual fullscreen JSX exposes an accessible Camera & Mic action that returns to regular controls', () => {
  const h = fullscreenHarness();
  const actions = walk(h.rail(), node => node.props?.testID === 'shared-player-fullscreen-media-controls');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].props.accessibilityRole, 'button');
  assert.equal(actions[0].props.accessibilityLabel, 'Open camera and microphone controls');
  assert.equal(actions[0].props.children.props.children, 'Camera & Mic');
  actions[0].props.onPress();
  assert.equal(h.state.fullscreen, false);
  assert.equal(h.state.controls, true);
  h.scope.shouldRenderSharedPlayerLocalMediaControl = false;
  assert.equal(walk(h.rail(), node => node.props?.testID === 'shared-player-fullscreen-media-controls').length, 0);
  h.scope.shouldRenderSharedPlayerSelfMuteControl = true;
  assert.equal(walk(h.rail(), node => node.props?.testID === 'shared-player-fullscreen-media-controls').length, 1);
});

test('actual host mute caller toggles host mute and never overwrites independent self mute', async () => {
  const h = seatHarness();
  h.scope.partyMembershipMapRef.current.speaker.hostMuted = true;
  h.scope.partyMembershipMapRef.current.speaker.selfMuted = true;
  h.state.persisted = { ...h.scope.partyMembershipMapRef.current.speaker, hostMuted: false, isMuted: true };
  const handler = find(player, node => ts.isJsxAttribute(node) && node.name.text === 'onPress'
    && node.initializer?.expression?.getText(player).includes('const nextMuted = !partyMembershipMapRef.current[participant.id]?.hostMuted;'))
    .initializer.expression;
  const scope = { ...h.scope, participant: { ...h.state.participants[0], muted: true },
    persistPartySeatState: h.persist, reportPartySeatUpdateUnavailable: h.report, bumpRoomEnergy: noop };
  const onPress = evaluate(`globalThis.actual = ${handler.getText(player)};`, scope).actual;
  await onPress();
  assert.equal(h.state.writes[0][2].isMuted, false);
  assert.equal(h.state.participants[0].muted, true);
  assert.equal(h.state.participants[0].isSpeaking, false);
});
