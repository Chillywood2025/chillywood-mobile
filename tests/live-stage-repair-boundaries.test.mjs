import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { createRoot } = require('react-dom/client');
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const screenFile = 'app/watch-party/live-stage/[partyId].tsx';
const screenSource = fs.readFileSync(screenFile, 'utf8');
const ast = ts.createSourceFile(screenFile, screenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function evaluate(source, context = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText, { exports, console, setTimeout, clearTimeout, ...context });
  return exports;
}
const lifecycle = evaluate(fs.readFileSync('_lib/watch-party/live-stage-lifecycle.ts', 'utf8'));
const presentation = evaluate(fs.readFileSync('_lib/watch-party/live-stage-presentation.ts', 'utf8'));

// Extract the actual callback AST; behavior below is executed from the shipped screen,
// not a separately maintained imitation of its branches.
function screenCallback(name, context) {
  let result;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      assert.ok(ts.isCallExpression(node.initializer), `${name} is a callback`);
      result = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(result, `${name} exists`);
  return evaluate(`export const callback = ${result};`, context).callback;
}
function refreshEffect(context) {
  let result;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('source: "live-stage-authority-refresh"')) {
      result = node.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(result);
  return evaluate(`export const callback = ${result};`, context).callback;
}

function entryHarness({ premium = async () => true, join = async () => ({ status: 'ready', roomName: 'ROOM', participantRole: 'host' }) } = {}) {
  const owner = lifecycle.createLiveStageEntryOwner(); owner.bind('ROOM:user:session');
  const surfaces = [], contracts = [], busy = [];
  const context = {
    stageEntryOwnerRef: { current: owner }, liveSurfaceRef: { current: 'room' },
    setStageEntryBusy: value => busy.push(value), isHost: true, stageMode: 'hybrid',
    liveKitParticipantRole: 'host', liveKitFoundationEnabled: true, partyId: 'ROOM', trackedUserId: 'user',
    modeParamValue: 'hybrid', requireLiveStagePremium: premium, __DEV__: false,
    resolveLiveKitStageEntryRole: async () => 'host', prepareLiveKitJoinBoundary: join,
    resolvedCurrentUsername: 'Host', room: { roomCode: 'ROOM' }, source: '',
    setLiveKitJoinContract: value => contracts.push(value), setLiveKitRenderableJoinContract: noop,
    setLiveKitJoinUnavailable: noop, debugLog: noop, closeStageOverlayPanels: noop,
    setStageOverlayAutoHideArmed: noop, stageOverlayLastInteractionAtRef: { current: 0 },
    setStageOverlayVisible: noop, stageOverlayMotion: { setValue: noop },
    setLiveSurface: value => surfaces.push(value), liveKitRecoveryCountRef: { current: 0 },
    liveKitPendingRecoveryRef: { current: null }, liveKitRecoveryTimeoutRef: { current: null },
    setLiveKitRecoveryError: noop, getUserFacingErrorMessage: (_, fallback) => fallback, setRoomEntryError: noop,
  };
  return { owner, context, surfaces, contracts, busy, enter: screenCallback('onEnterLiveStage', context) };
}

test('actual Join is same-frame single-flight and a late token cannot reopen after Back', async () => {
  const d = deferred(); let requests = 0;
  const h = entryHarness({ join: () => { requests++; return d.promise; } });
  const first = h.enter(); const duplicate = h.enter();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
  h.owner.invalidate(); h.context.liveSurfaceRef.current = 'room';
  d.resolve({ status: 'ready', roomName: 'ROOM', participantRole: 'host' });
  await Promise.all([first, duplicate]);
  assert.equal(h.surfaces.length, 0); assert.equal(h.contracts.length, 0);
});

for (const nextOwner of ['', 'OTHER:user:session', 'ROOM:other:session', 'ROOM:user:new-session']) {
  test(`actual Join drops pending premium response when owner becomes ${nextOwner || 'inactive'}`, async () => {
    const d = deferred(); let tokens = 0;
    const h = entryHarness({ premium: () => d.promise, join: async () => { tokens++; return {}; } });
    const pending = h.enter(); h.owner.bind(nextOwner); d.resolve(true); await pending;
    assert.equal(tokens, 0); assert.equal(h.surfaces.length, 0);
  });
}

test('a completed Join releases the latch and a failed old ticket cannot release a newer entry', async () => {
  const h = entryHarness(); await h.enter(); assert.deepEqual(h.surfaces, ['stage']);
  const owner = lifecycle.createLiveStageEntryOwner(); owner.bind('a'); const old = owner.begin();
  owner.invalidate(); const current = owner.begin(); owner.finish(old);
  assert.equal(owner.isCurrent(current), true); assert.equal(owner.begin(), null);
});

const goodContract = { status: 'ready', roomName: 'ROOM', participantRole: 'host', participantToken: 'good', requestedGrants: { canPublish: true } };
function refreshHarness(result, overrides = {}) {
  const writes = [], recovery = [], requests = [];
  const context = {
    liveKitFoundationEnabled: true, canOwnActiveStageSurface: true, canUseBetaStage: true,
    mediaAppState: 'active', liveKitRecoveryError: '', liveSurface: 'stage', Platform: { OS: 'android' },
    stageOperationOwnerKeyRef: { current: 'ROOM:host:session' }, liveSurfaceRef: { current: 'stage' },
    partyId: 'ROOM', trackedUserId: 'host', desiredLiveKitAuthority: { participantRole: 'host', canPublish: true },
    liveKitJoinContract: goodContract, liveKitJoinContractExpired: true, liveKitParticipantRole: 'host',
    currentMembershipAuthoritySignature: 'host|unmuted|active', liveKitRefreshVersion: 1,
    liveKitStageAuthorityRetryKeyRef: { current: '' }, liveKitStageContractRefreshKeyRef: { current: '' },
    liveKitStageAuthorityRetryCountRef: { current: {} }, liveKitStageAuthorityRetryTimeoutRef: { current: null },
    liveKitPendingRecoveryRef: { current: null }, liveKitRecoveryTimeoutRef: { current: null },
    liveKitStageMountedRef: { current: true }, LIVE_STAGE_AUTHORITY_REFRESH_MAX_ATTEMPTS: 6,
    LIVE_STAGE_AUTHORITY_REFRESH_RETRY_MILLIS: 700, resolvedCurrentUsername: 'Host',
    isCurrentStageParticipantMuted: false, room: { roomCode: 'ROOM' }, liveKitStageSurfaceContract: goodContract,
    prepareLiveKitJoinBoundary: async request => { requests.push(request); return result; },
    isLiveKitParticipantTokenExpired: token => token === 'expired',
    setLiveKitJoinContract: value => writes.push(['active', value]),
    setLiveKitRenderableJoinContract: value => writes.push(['renderable', value]),
    setLiveKitJoinUnavailable: value => writes.push(['unavailable', value]),
    setLiveKitRecoveryError: value => writes.push(['error', value]),
    scheduleLiveKitRecovery: (...args) => recovery.push(args), debugLog: noop, reportRuntimeError: noop,
    refreshStageSnapshot: async () => null, setLiveKitRefreshVersion: noop,
    ...presentation, ...lifecycle, ...overrides,
  };
  return { context, writes, recovery, requests, run: refreshEffect(context) };
}

test('actual authority effect renews matching expired credentials and does not renew healthy ones', async () => {
  const h = refreshHarness(goodContract); h.run(); await Promise.resolve();
  assert.equal(h.requests.length, 1); assert.ok(h.writes.some(([key, value]) => key === 'active' && value === goodContract));
  const healthy = refreshHarness(goodContract, { liveKitJoinContractExpired: false }); healthy.run();
  assert.equal(healthy.requests.length, 0);
});
test('promotion retry cap still renews an expired viewer credential without an unbounded promotion loop', async () => {
  const viewer = { ...goodContract, participantRole: 'viewer', requestedGrants: { canPublish: false } };
  const key = 'ROOM:host:host:publish:host|unmuted|active';
  const options = { liveKitJoinContract: viewer, liveKitStageAuthorityRetryCountRef: { current: { [key]: 6 } } };
  const expired = refreshHarness(viewer, options); const cleanup = expired.run(); await Promise.resolve();
  assert.equal(expired.requests.length, 1); cleanup();
  assert.ok(expired.context.liveKitStageContractRefreshKeyRef.current, 'settled renewal retains throttling key');
  const valid = refreshHarness(viewer, { ...options, liveKitJoinContractExpired: false }); valid.run();
  assert.equal(valid.requests.length, 0);
});
test('renewal preserves valid media only on transient failure, but immediately retires denied credentials', async () => {
  const temporary = refreshHarness({ status: 'unavailable', reason: 'request_failed', responseStatus: 503 });
  temporary.run(); await Promise.resolve();
  assert.ok(temporary.writes.some(([key, value]) => key === 'renderable' && value === goodContract));
  assert.equal(temporary.recovery[0][1], false);
  const denied = refreshHarness({ status: 'unavailable', reason: 'request_failed', responseStatus: 403 });
  denied.run(); await Promise.resolve();
  assert.ok(denied.writes.some(([key, value]) => key === 'active' && value === null));
  assert.ok(denied.writes.some(([key, value]) => key === 'renderable' && value === null));
  assert.equal(denied.recovery.length, 0);
});
test('near-expiry replacement is cooled down, and canceled authority response is ignored', async () => {
  const short = refreshHarness({ ...goodContract, participantToken: 'expired' }); short.run(); await Promise.resolve();
  assert.equal(short.recovery.length, 1); assert.equal(short.writes.length, 0);
  const d = deferred(); const canceled = refreshHarness(null, { prepareLiveKitJoinBoundary: () => d.promise });
  const cleanup = canceled.run(); cleanup(); d.resolve(goodContract); await Promise.resolve();
  assert.equal(canceled.writes.length, 0);
});

test('actual authoritative connection resets recovery and publishes discovery exactly once', () => {
  const recoveryCount = { current: 3 }, pending = { current: { ownerKey: 'ROOM:user:session' } }, timer = { current: 17 }, events = [];
  const connected = screenCallback('onLiveKitStageConnected', {
    liveKitPendingRecoveryRef: pending, liveKitRecoveryTimeoutRef: timer,
    clearTimeout: value => assert.equal(value, 17),
    liveKitRecoveryCountRef: recoveryCount,
    setLiveKitRecoveryError: value => events.push(['recovery-error', value]),
    onDiscoveryConnected: () => {
      assert.equal(recoveryCount.current, 0);
      events.push('publish');
    },
  });
  assert.deepEqual(events, []);
  connected();
  assert.equal(pending.current, null); assert.equal(timer.current, null);
  assert.deepEqual(events, [['recovery-error', ''], 'publish']);
});

test('actual terminal recovery retires the failed room, retries with a bounded fresh-contract trigger, and cancels on leave', () => {
  const clock = fakeClock(), writes = [], refreshes = [];
  const context = { ...clock, stageOperationOwnerKeyRef: { current: 'ROOM:user:session' }, liveSurfaceRef: { current: 'stage' },
    liveKitRecoveryTimeoutRef: { current: null }, liveKitRecoveryCountRef: { current: 0 }, liveKitStageMountedRef: { current: true },
    liveKitPendingRecoveryRef: { current: null },
    LIVE_STAGE_AUTHORITY_REFRESH_MAX_ATTEMPTS: 2, LIVE_STAGE_AUTHORITY_REFRESH_RETRY_MILLIS: 700,
    setLiveKitRecoveryError: value => writes.push(['error', value]), setLiveKitJoinContract: value => writes.push(['active', value]),
    setLiveKitRenderableJoinContract: value => writes.push(['renderable', value]), liveKitStageContractRefreshKeyRef: { current: 'failed' },
    setLiveKitRefreshVersion: fn => refreshes.push(fn(0)) };
  const recover = screenCallback('scheduleLiveKitRecovery', context);
  recover('Interrupted', true);
  assert.ok(writes.some(([key, value]) => key === 'active' && value === null));
  assert.ok(writes.some(([key, value]) => key === 'renderable' && value === null));
  clock.advance(699); assert.equal(refreshes.length, 0); clock.advance(1); assert.equal(refreshes.length, 1);
  recover('Interrupted', true); clock.advance(1400); assert.equal(refreshes.length, 2);
  recover('Interrupted', true); clock.advance(30000); assert.equal(refreshes.length, 2); assert.equal(clock.count(), 0);
  assert.ok(writes.at(-3)[1].includes('Retry connection'));
  context.liveKitRecoveryCountRef.current = 0; recover('Interrupted', true);
  context.liveSurfaceRef.current = 'room'; clock.advance(700); assert.equal(refreshes.length, 2);
});

function recoveryResumeHarness() {
  const clock = fakeClock(); let error = '', version = 0;
  const context = { ...clock, stageOperationOwnerKeyRef: { current: 'ROOM:user:session' }, liveSurfaceRef: { current: 'stage' },
    liveKitRecoveryTimeoutRef: { current: null }, liveKitPendingRecoveryRef: { current: null },
    liveKitRecoveryCountRef: { current: 0 }, liveKitStageMountedRef: { current: true },
    LIVE_STAGE_AUTHORITY_REFRESH_MAX_ATTEMPTS: 2, LIVE_STAGE_AUTHORITY_REFRESH_RETRY_MILLIS: 700,
    setLiveKitRecoveryError: value => { error = value; }, setLiveKitJoinContract: noop, setLiveKitRenderableJoinContract: noop,
    liveKitStageContractRefreshKeyRef: { current: 'failed' }, setLiveKitRefreshVersion: fn => { version = fn(version); } };
  let resumeSource;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[1]?.getText(ast) === '[stageOperationOwnerKey, liveSurface]') resumeSource = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(resumeSource);
  return { context, clock, get error() { return error; }, get version() { return version; },
    recover: screenCallback('scheduleLiveKitRecovery', context),
    resume() { return evaluate(`export const callback = ${resumeSource};`, { ...context,
      stageOperationOwnerKey: context.stageOperationOwnerKeyRef.current, liveSurface: context.liveSurfaceRef.current }).callback(); } };
}

test('actual recovery resumes elapsed cooldown after focus/foreground return without losing attempt count', async () => {
  const h = recoveryResumeHarness(); h.recover('Reconnecting', true);
  h.context.stageOperationOwnerKeyRef.current = ''; h.clock.advance(700); h.resume();
  assert.equal(h.version, 0); assert.equal(h.error, 'Reconnecting');
  assert.equal(h.context.liveKitRecoveryTimeoutRef.current, null); assert.ok(h.context.liveKitPendingRecoveryRef.current);
  h.context.stageOperationOwnerKeyRef.current = 'ROOM:user:session'; h.resume();
  assert.equal(h.version, 1); assert.equal(h.error, ''); assert.equal(h.context.liveKitRecoveryCountRef.current, 1);
  assert.equal(h.context.liveKitPendingRecoveryRef.current, null);
  const refresh = refreshHarness(goodContract, { ...h.context, liveKitRecoveryError: h.error, liveKitJoinContract: null });
  refresh.run(); await Promise.resolve(); assert.equal(refresh.requests.length, 1);
  h.resume(); assert.equal(h.version, 1);
});

test('actual refocus before cooldown expiry waits for the existing timer and never retries early twice', () => {
  const h = recoveryResumeHarness(); h.recover('Reconnecting', true);
  h.context.stageOperationOwnerKeyRef.current = ''; h.resume(); h.clock.advance(200);
  h.context.stageOperationOwnerKeyRef.current = 'ROOM:user:session'; h.resume();
  assert.equal(h.version, 0); assert.equal(h.error, 'Reconnecting'); assert.equal(h.clock.count(), 1);
  h.clock.advance(499); assert.equal(h.version, 0); h.clock.advance(1); assert.equal(h.version, 1);
  h.resume(); assert.equal(h.version, 1); assert.equal(h.clock.count(), 0);
});

test('actual recovery resume preserves exhausted and denied states instead of making an unbounded retry loop', async () => {
  const exhausted = recoveryResumeHarness();
  exhausted.recover('Reconnecting', true); exhausted.recover('Reconnecting', true); exhausted.recover('Reconnecting', true);
  assert.equal(exhausted.context.liveKitPendingRecoveryRef.current, null); assert.equal(exhausted.clock.count(), 0);
  exhausted.context.stageOperationOwnerKeyRef.current = ''; exhausted.resume();
  exhausted.context.stageOperationOwnerKeyRef.current = 'ROOM:user:session'; exhausted.resume();
  assert.match(exhausted.error, /Retry connection/); assert.equal(exhausted.version, 0);
  const denied = recoveryResumeHarness(); denied.recover('Reconnecting', true);
  const refresh = refreshHarness({ status: 'unavailable', reason: 'request_failed', responseStatus: 403 }, {
    ...denied.context, liveKitRecoveryError: '', liveKitJoinContract: null,
  });
  refresh.run(); await Promise.resolve();
  assert.equal(denied.context.liveKitPendingRecoveryRef.current, null); assert.equal(denied.clock.count(), 0);
  denied.context.stageOperationOwnerKeyRef.current = ''; denied.resume();
  denied.context.stageOperationOwnerKeyRef.current = 'ROOM:user:session'; denied.resume();
  assert.match(denied.error, /Check access/); assert.equal(denied.version, 0);
});

test('native host focus leaves selected speaker and moderation controls in the real member roster', () => {
  const actualHero = lifecycle.resolveLiveStageHeroId({ currentUserId: 'host', isHost: true, useSelfHero: false, selectedParticipantId: 'speaker-a' });
  assert.equal(actualHero, 'host');
  const roster = presentation.buildLiveStageCommunityParticipants({ participants: [
    { userId: 'host' }, { userId: 'speaker-a' }, { userId: 'speaker-b' },
  ], actualVisualHeroParticipantId: actualHero, shouldUseViewerSelfHero: false });
  assert.deepEqual(Array.from(roster, item => item.userId), ['speaker-a', 'speaker-b']);
});

test('actual partial moderation success readbacks saved authority and provider-only Retry never repeats the mutation', async () => {
  let mutations = 0, enforcements = 0; const alerts = [];
  const saved = { userId: 'speaker', stageRole: 'listener', canSpeak: false, membershipState: 'active', hostMuted: false };
  const context = { partyId: 'ROOM', isHost: true, myUserId: 'host',
    membershipMapRef: { current: { speaker: { stageRole: 'speaker', isMuted: false } } },
    setPartyParticipantState: async () => { mutations++; return null; },
    enforceLiveKitParticipantState: async () => { enforcements++; return enforcements > 2; },
    refreshStageSnapshot: async () => ({ memberships: [saved] }), debugLog: noop,
    stageOperationOwnerKeyRef: { current: 'ROOM:host:session' }, liveKitStageMountedRef: { current: true },
    Alert: { alert: (...args) => alerts.push(args) } };
  const update = screenCallback('emitParticipantUpdate', context);
  assert.equal(await update('speaker', { role: 'listener' }), true);
  assert.equal(mutations, 1); assert.equal(enforcements, 2);
  assert.ok(alerts[0][0].includes('pending'));
  alerts[0][2][1].onPress(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(mutations, 1); assert.equal(enforcements, 3); assert.equal(alerts[1][0], 'Live media updated');
});

test('actual recent-comment reader returns newest 120 in chronological display order', async () => {
  const rows = Array.from({ length: 125 }, (_, i) => ({ id: String(i + 1), created_at: String(i + 1).padStart(4, '0'), user_id: 'user', text: `comment ${i + 1}` }));
  const orders = []; let limit;
  const query = { select() { return this; }, eq() { return this; }, order(key, direction) { orders.push([key, direction.ascending]); return this; },
    limit(value) { limit = value; return Promise.resolve({ data: [...rows].sort((a, b) => orders[0][1] ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)).slice(0, value), error: null }); } };
  const fetch = screenCallback('fetchHybridComments', { partyId: 'ROOM', supabase: { from: () => query },
    mapLiveStageCommentRow: row => ({ id: row.id, body: row.text }), readSocialAttachmentsForSurfaces: async () => new Map() });
  const comments = await fetch(); assert.equal(limit, 120); assert.equal(comments[0].id, '6'); assert.equal(comments.at(-1).id, '125');
  assert.deepEqual(orders, [['created_at', false], ['id', false]]);
});

test('actual send trusts durable insert #126 without a list reread and suppresses duplicate taps', async () => {
  const d = deferred(); let sends = 0, comments = [], draft = 'saved comment', busy;
  const context = { hybridCommentDraft: draft, hybridCommentAttachmentFile: null, partyId: 'ROOM',
    hybridCommentSendRef: { current: null }, stageOperationOwnerKeyRef: { current: 'ROOM:user:session' }, liveKitStageMountedRef: { current: true },
    appConfig: { runtimeControls: { chat_enabled: true, chat_attachments_enabled: true } }, trackedUserId: 'user', resolvedCurrentUsername: 'Me',
    setHybridCommentSending: value => { busy = value; }, setHybridCommentError: value => assert.equal(value, ''),
    sendPartyMessageRecord: () => { sends++; return d.promise; }, hybridCommentRevisionRef: { current: 0 },
    setHybridComments: fn => { comments = fn(comments); }, setHybridCommentDraft: value => { draft = value; },
    setHybridCommentAttachmentFile: noop, setCommentsOpen: noop, getUserFacingErrorMessage: (_, fallback) => fallback,
  };
  const send = screenCallback('onSendHybridComment', context);
  const first = send(), second = send(); assert.equal(sends, 1);
  d.resolve({ id: '126', userId: 'user', body: 'saved comment', createdAt: '0126' }); await Promise.all([first, second]);
  assert.equal(draft, ''); assert.equal(busy, false); assert.equal(comments[0].id, '126');
  assert.equal(lifecycle.canApplyLiveStageCommentSnapshot(0, context.hybridCommentRevisionRef.current), false);
});

for (const replacementOwner of ['OTHER:user:session', 'ROOM:other:session', 'ROOM:user:new-session', 'ROOM:user:session']) {
  test(`actual comment owner replacement releases abandoned flight without releasing new send: ${replacementOwner}`, async () => {
    const first = deferred(), second = deferred(), persistedRooms = []; let sends = 0, busy = false, comments = [], draft = 'new comment';
    const context = {
      hybridCommentDraft: draft, hybridCommentAttachmentFile: null, partyId: 'ROOM',
      hybridCommentSendRef: { current: null }, stageOperationOwnerKeyRef: { current: 'ROOM:user:session' },
      liveKitStageMountedRef: { current: true }, appConfig: { runtimeControls: { chat_enabled: true, chat_attachments_enabled: true } },
      trackedUserId: 'user', resolvedCurrentUsername: 'Me', setStageEntryBusy: noop,
      setHybridCommentSending: value => { busy = value; }, setHybridCommentError: value => assert.equal(value, ''),
      sendPartyMessageRecord: (room, user) => { persistedRooms.push([room, user]); return ++sends === 1 ? first.promise : second.promise; },
      hybridCommentRevisionRef: { current: 0 },
      setHybridComments: fn => { comments = fn(comments); }, setHybridCommentDraft: value => { draft = value; },
      setHybridCommentAttachmentFile: noop, setCommentsOpen: noop, getUserFacingErrorMessage: (_, fallback) => fallback,
    };
    let ownerEffectSource;
    const visit = node => {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
        && node.arguments[1]?.getText(ast) === '[stageOperationOwnerKey]') ownerEffectSource = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(ast); assert.ok(ownerEffectSource);
    const ownerEffect = evaluate(`export const callback = ${ownerEffectSource};`, context).callback;
    const retire = ownerEffect(), send = screenCallback('onSendHybridComment', context);
    const abandoned = send(); assert.equal(sends, 1); assert.equal(busy, true);
    retire(); context.stageOperationOwnerKeyRef.current = '';
    ownerEffect(); assert.equal(busy, false); assert.equal(context.hybridCommentSendRef.current, null);
    context.stageOperationOwnerKeyRef.current = replacementOwner; ownerEffect();
    [context.partyId, context.trackedUserId] = replacementOwner.split(':');
    const replacementSend = screenCallback('onSendHybridComment', context);
    const current = replacementSend(), currentFlight = context.hybridCommentSendRef.current;
    assert.equal(sends, 2); assert.ok(currentFlight); assert.equal(busy, true);
    assert.deepEqual(persistedRooms, [['ROOM', 'user'], [context.partyId, context.trackedUserId]]);
    first.resolve({ id: 'old', userId: 'user', body: 'old comment', createdAt: '0001' }); await abandoned;
    assert.equal(context.hybridCommentSendRef.current, currentFlight); assert.equal(busy, true);
    assert.equal(comments.length, 0); assert.equal(draft, 'new comment');
    await replacementSend(); assert.equal(sends, 2, 'abandoned finally cannot release the replacement single flight');
    second.resolve({ id: 'new', userId: 'user', body: 'new comment', createdAt: '0002' }); await current;
    assert.equal(context.hybridCommentSendRef.current, null); assert.equal(busy, false);
    assert.equal(comments.length, 1); assert.equal(comments[0].id, 'new'); assert.equal(draft, '');
  });
}

function commentReconciliationHarness({ attachment = false } = {}) {
  const receipt = deferred();
  let uploadResolve, uploadReject;
  const upload = new Promise((resolve, reject) => { uploadResolve = resolve; uploadReject = reject; });
  const state = { comments: [], draft: 'Original comment', busy: false, errors: [], uploads: 0, rollbacks: 0 };
  const context = {
    hybridCommentDraft: state.draft, hybridCommentAttachmentFile: attachment ? { name: 'photo.jpg' } : null,
    partyId: 'ROOM', hybridCommentSendRef: { current: null }, stageOperationOwnerKeyRef: { current: 'ROOM:user:session' },
    liveKitStageMountedRef: { current: true }, appConfig: { runtimeControls: { chat_enabled: true, chat_attachments_enabled: true } },
    trackedUserId: 'user', resolvedCurrentUsername: 'Me', setHybridCommentSending: value => { state.busy = value; },
    setHybridCommentError: value => { if (value) state.errors.push(value); }, sendPartyMessageRecord: () => receipt.promise,
    hybridCommentRevisionRef: { current: 0 }, setHybridComments: fn => { state.comments = fn(state.comments); },
    setHybridCommentDraft: value => { state.draft = value; }, setHybridCommentAttachmentFile: noop, setCommentsOpen: noop,
    getUserFacingErrorMessage: (_, fallback) => fallback,
    createSocialAttachmentForSurface: () => { state.uploads++; return upload; },
    deletePartyMessage: async () => { state.rollbacks++; },
    mapLiveStageCommentRow: row => ({ id: row.id, userId: row.user_id, body: row.text,
      createdAt: row.created_at, authorLabel: 'You', isMe: true, attachments: [] }),
  };
  let eventSource;
  const visit = node => {
    if (ts.isCallExpression(node) && node.arguments[0]?.getText(ast) === '"postgres_changes"'
      && node.arguments[1]?.getText(ast).includes('table: "watch_party_room_messages"')) eventSource = node.arguments[2].getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(eventSource, 'actual room-message realtime callback exists');
  const makeEvent = overrides => evaluate(`export const callback = ${eventSource};`, { ...context, active: true, ...overrides }).callback;
  const event = makeEvent();
  const saved = { id: 'saved-comment', userId: 'user', body: 'Original comment', createdAt: '2026-10-14T20:00:00Z' };
  const row = { id: saved.id, user_id: saved.userId, text: saved.body, created_at: saved.createdAt };
  return { state, context, receipt, saved, row, event, makeEvent, send: screenCallback('onSendHybridComment', context), uploadResolve, uploadReject };
}

test('delayed durable insert receipt cannot resurrect a newer realtime deletion', async () => {
  const h = commentReconciliationHarness(), sending = h.send();
  h.event({ eventType: 'INSERT', new: h.row });
  h.event({ eventType: 'DELETE', old: { id: h.saved.id } });
  assert.equal(h.state.comments.length, 0);
  h.receipt.resolve(h.saved); await sending;
  assert.equal(h.state.comments.length, 0); assert.equal(h.state.draft, ''); assert.equal(h.state.busy, false);
  assert.deepEqual(h.state.errors, []); assert.equal(h.context.hybridCommentSendRef.current, null);
});

test('delayed durable insert receipt preserves a newer realtime edit and existing list order', async () => {
  const h = commentReconciliationHarness(), sending = h.send();
  h.event({ eventType: 'INSERT', new: h.row });
  h.event({ eventType: 'INSERT', new: { ...h.row, id: 'later-comment', text: 'Later comment' } });
  h.event({ eventType: 'UPDATE', new: { ...h.row, text: 'Edited comment' } });
  h.receipt.resolve(h.saved); await sending;
  assert.deepEqual(Array.from(h.state.comments, comment => [comment.id, comment.body]), [
    ['saved-comment', 'Edited comment'], ['later-comment', 'Later comment'],
  ]);
  assert.equal(h.state.draft, ''); assert.deepEqual(h.state.errors, []);
});

test('unrelated realtime changes do not suppress a durable receipt or survive its flight', async () => {
  const h = commentReconciliationHarness(), sending = h.send();
  h.event({ eventType: 'UPDATE', new: { ...h.row, id: 'other-comment', text: 'Other edit' } });
  h.receipt.resolve(h.saved); await sending;
  assert.equal(h.state.comments.find(comment => comment.id === h.saved.id)?.body, 'Original comment');
  assert.equal(h.context.hybridCommentSendRef.current, null);
});

test('retired channel events and foreign room callbacks cannot poison the current send flight', async () => {
  const h = commentReconciliationHarness(), sending = h.send(), flight = h.context.hybridCommentSendRef.current;
  h.makeEvent({ active: false })({ eventType: 'DELETE', old: { id: h.saved.id } });
  h.makeEvent({ partyId: 'OLD-ROOM' })({ eventType: 'DELETE', old: { id: h.saved.id } });
  assert.equal(flight.realtimeChanges.size, 0);
  h.context.stageOperationOwnerKeyRef.current = 'ROOM:user:new-session';
  h.event({ eventType: 'DELETE', old: { id: h.saved.id } });
  assert.equal(flight.realtimeChanges.size, 0, 'an abandoned owner cannot collect newer-session events');
  h.receipt.resolve(h.saved); await sending;
  assert.equal(h.state.comments.length, 0, 'abandoned completion stays suppressed');
});

test('a deletion received before the save receipt skips attachment upload without suggesting a resend', async () => {
  const h = commentReconciliationHarness({ attachment: true }), sending = h.send();
  h.event({ eventType: 'DELETE', old: { id: h.saved.id } });
  h.receipt.resolve(h.saved); await sending;
  assert.equal(h.state.uploads, 0); assert.equal(h.state.comments.length, 0);
  assert.equal(h.state.draft, ''); assert.deepEqual(h.state.errors, []);
});

for (const uploadFails of [false, true]) {
  test(`deletion during attachment upload wins over its ${uploadFails ? 'failure' : 'success'} without rollback/resend`, async () => {
    const h = commentReconciliationHarness({ attachment: true }), sending = h.send();
    h.receipt.resolve(h.saved); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.state.uploads, 1);
    h.event({ eventType: 'INSERT', new: h.row });
    h.event({ eventType: 'DELETE', old: { id: h.saved.id } });
    if (uploadFails) h.uploadReject(Error('upload rejected after deletion'));
    else h.uploadResolve({ id: 'attachment', surfaceId: h.saved.id });
    await sending;
    assert.equal(h.state.comments.length, 0); assert.equal(h.state.rollbacks, 0);
    assert.equal(h.state.draft, ''); assert.deepEqual(h.state.errors, []);
  });
}

test('attachment failure cannot roll back a newer authoritative text edit', async () => {
  const h = commentReconciliationHarness({ attachment: true }), sending = h.send();
  h.receipt.resolve(h.saved); await new Promise(resolve => setImmediate(resolve));
  h.event({ eventType: 'UPDATE', new: { ...h.row, text: 'Authoritative edit' } });
  h.uploadReject(Error('attachment upload failed')); await sending;
  assert.equal(h.state.rollbacks, 0); assert.equal(h.state.comments[0].body, 'Authoritative edit');
  assert.equal(h.state.draft, ''); assert.ok(h.state.errors[0].includes('comment was saved'));
});

test('actual reaction sender broadcasts chosen emoji once; other participant validates it and self echo is ignored', async () => {
  const sent = [], local = [];
  const channel = { send: async value => { sent.push(value); return 'ok'; } };
  const send = screenCallback('onSelectReactionFromPicker', { channelRef: { current: channel },
    roomReactionPolicyRef: { current: 'enabled' }, stageOperationOwnerKeyRef: { current: 'ROOM:a:session' },
    partyId: 'ROOM', trackedUserId: 'a', triggerReactionBurst: emoji => local.push(emoji), setRecentReactionEmojis: noop,
    Alert: { alert: () => assert.fail('unexpected send failure') },
  });
  send('👏'); await Promise.resolve();
  assert.deepEqual(local, ['👏']); assert.equal(sent.length, 1);
  const options = { partyId: 'ROOM', currentUserId: 'b', reactionsEnabled: true, isActiveMember: id => id === 'a' };
  assert.equal(lifecycle.parseLiveStageReaction(sent[0].payload, options), '👏');
  assert.equal(lifecycle.parseLiveStageReaction(sent[0].payload, { ...options, currentUserId: 'a' }), null);
  assert.equal(lifecycle.parseLiveStageReaction(sent[0].payload, { ...options, reactionsEnabled: false }), null);
  assert.equal(lifecycle.parseLiveStageReaction(sent[0].payload, { ...options, partyId: 'OTHER' }), null);
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml',
  nodeName: 'DIV', nodeType: 1, ownerDocument: document, parentNode: null, tagName: 'DIV' });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
function fakeClock() {
  let now = 0, id = 0; const timers = new Map();
  return { setTimeout(fn, delay) { const key = ++id; timers.set(key, { at: now + delay, fn }); return key; },
    clearTimeout(key) { timers.delete(key); }, queuedCallbacks: () => [...timers.values()].map(timer => timer.fn),
    advance(ms) { now += ms; for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } }, count: () => timers.size };
}
async function timerHarness(t) {
  const clock = fakeClock(); let hidden = 0, renewals = 0;
  const timers = evaluate(fs.readFileSync('_lib/watch-party/useLiveStageTimers.ts', 'utf8'), { ...clock,
    require(name) { if (name === 'react') return React;
      if (name.includes('live-stage-lifecycle')) return lifecycle;
      if (name.includes('token-contract')) return { getLiveKitParticipantTokenExpiryState: token => ({ expiresInMillis: Number(token), skewMillis: Number(token) <= 30000 ? 3000 : 60000, isExpired: false }) };
      throw Error(name); },
  });
  const ref = { current: null }, clear = () => { clock.clearTimeout(ref.current); ref.current = null; }, hide = () => { hidden++; }, onDue = () => { renewals++; };
  let options = { enabled: true, blocked: false, activityVersion: 0, mode: 'hybrid', delayMillis: 10000, timeoutRef: ref, clear, hide };
  let tokenOptions = { enabled: false, token: '', onDue };
  function Harness() { timers.useLiveStageOverlayTimer(options); timers.useLiveStageTokenRenewal(tokenOptions); return null; }
  const root = createRoot(container()); let disposed = false;
  const render = () => React.act(async () => { root.render(React.createElement(Harness)); }); await render();
  t.after(async () => { if (!disposed) await React.act(async () => root.unmount()); });
  return { clock, get hidden() { return hidden; }, get renewals() { return renewals; },
    async options(next) { options = { ...options, ...next }; await render(); },
    async token(next) { tokenOptions = { ...tokenOptions, ...next }; await render(); },
    async unmount() { disposed = true; await React.act(async () => root.unmount()); } };
}

test('mounted actual native hero renders approved self track once, exact remote identity, and honest viewer/camera-off fallbacks', async t => {
  let heroSource;
  ts.forEachChild(ast, node => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'LiveKitHybridHeroVideo') heroSource = node.getText(ast); });
  assert.ok(heroSource);
  const rendered = [], texts = []; const localParticipant = { identity: 'self' };
  const camera = { participant: localParticipant, source: 'camera', publication: { track: {} } };
  const host = { participant: { identity: 'host' }, source: 'camera', publication: { track: {} } };
  const stranger = { participant: { identity: 'other' }, source: 'camera', publication: { track: {} } };
  const Hero = evaluate(`export ${heroSource}`, { React, useMemo: React.useMemo, useEffect: React.useEffect,
    useHybridLiveKitConnectionState: () => 'connected', useHybridLiveKitLocalParticipant: () => ({ localParticipant, cameraTrack: camera.publication }),
    useLocalCameraMirror: () => true,
    useHybridLiveKitTracks: () => [stranger, host, camera], isHybridLiveKitTrackReference: value => !!value?.publication?.track,
    Track: { Source: { ScreenShare: 'screen', Camera: 'camera' } }, debugLog: noop,
    View: ({ children }) => React.createElement(React.Fragment, null, children), Text: ({ children }) => { texts.push(children); return null; },
    HybridLiveKitVideoTrack: props => { rendered.push(props); return null; }, styles: {},
  }).LiveKitHybridHeroVideo;
  const root = createRoot(container()); t.after(async () => { await React.act(async () => root.unmount()); });
  const defaults = { fallbackInitial: 'S', forceLocalHeroFallback: true, participantId: 'self', participantRole: 'speaker', preferLocalHero: true, publishLocalCamera: true, roomName: 'ROOM' };
  const render = async changes => { rendered.length = 0; texts.length = 0; await React.act(async () => root.render(React.createElement(Hero, { ...defaults, ...changes }))); };
  await render({}); assert.equal(rendered.length, 1); assert.equal(rendered[0].trackRef.participant.identity, 'self');
  await render({ participantId: 'host', preferLocalHero: false, forceLocalHeroFallback: false });
  assert.equal(rendered.length, 1); assert.equal(rendered[0].trackRef.participant.identity, 'host');
  await render({ publishLocalCamera: false }); assert.equal(rendered.length, 0); assert.ok(texts.some(text => text.includes('Camera and microphone are off')));
  await render({ participantRole: 'viewer', publishLocalCamera: false }); assert.equal(rendered.length, 0); assert.ok(texts.some(text => text.includes('Local self view')));
});

test('mounted overlay timer rearms on repeated touch; open seat review/lock/input block it until closed', async t => {
  const h = await timerHarness(t); h.clock.advance(5000); await h.options({ activityVersion: 1 });
  h.clock.advance(5000); assert.equal(h.hidden, 0); h.clock.advance(5000); assert.equal(h.hidden, 1);
  await h.options({ activityVersion: 2 }); h.clock.advance(9000);
  await h.options({ blocked: true }); h.clock.advance(30000); assert.equal(h.hidden, 1);
  await h.options({ blocked: false }); h.clock.advance(9999); assert.equal(h.hidden, 1);
  h.clock.advance(1); assert.equal(h.hidden, 2); await h.unmount(); assert.equal(h.clock.count(), 0);
});
test('mounted renewal timer handles short and long tokens, replacement, background, and unmount', async t => {
  const h = await timerHarness(t); await h.options({ enabled: false });
  await h.token({ enabled: true, token: '30000' }); h.clock.advance(26999); assert.equal(h.renewals, 0);
  h.clock.advance(1); assert.equal(h.renewals, 1);
  await h.token({ token: '3600000' }); h.clock.advance(3539999); assert.equal(h.renewals, 1);
  h.clock.advance(1); assert.equal(h.renewals, 2);
  await h.token({ token: '30000' }); await h.token({ enabled: false }); h.clock.advance(30000); assert.equal(h.renewals, 2);
  await h.token({ enabled: true }); await h.unmount(); assert.equal(h.clock.count(), 0);
});

for (const boundary of ['replacement', 'disabled', 'unmount']) {
  test(`queued token renewal is inert after ${boundary}`, async t => {
    const h = await timerHarness(t); await h.options({ enabled: false });
    await h.token({ enabled: true, token: '30000' });
    const [queued] = h.clock.queuedCallbacks();
    if (boundary === 'replacement') await h.token({ token: '3600000' });
    else if (boundary === 'disabled') await h.token({ enabled: false });
    else await h.unmount();
    queued();
    assert.equal(h.renewals, 0, 'clearing a timer cannot revoke a callback already queued by the runtime');
    if (boundary === 'replacement') { h.clock.advance(3540000); assert.equal(h.renewals, 1); }
  });
}

for (const boundary of ['activity', 'blocked', 'disabled', 'unmount']) {
  test(`queued overlay hide is inert after ${boundary}`, async t => {
    const h = await timerHarness(t), [queued] = h.clock.queuedCallbacks();
    if (boundary === 'activity') await h.options({ activityVersion: 1 });
    else if (boundary === 'blocked') await h.options({ blocked: true });
    else if (boundary === 'disabled') await h.options({ enabled: false });
    else await h.unmount();
    queued();
    assert.equal(h.hidden, 0, 'an old hide cannot dismiss controls owned by a newer interaction');
    if (boundary === 'activity') { h.clock.advance(10000); assert.equal(h.hidden, 1); }
  });
}
