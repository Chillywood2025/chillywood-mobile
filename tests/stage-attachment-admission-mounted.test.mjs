import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { loadMediaPickerHost } from './helpers/media-picker-host.mjs';
import { createStageAttachmentBoundaries, stageAttachmentNames, isStageAttachmentLifecycle } from './helpers/stage-attachment-boundaries.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const authority = () => ({ userId: 'one', accountId: 'one', sessionGeneration: 'session-one', state: 'ACTIVE', restoreOnly: false });
const file = { uri: 'file:///local-stage.png', name: 'local-stage.png', mimeType: 'image/png' };
const same = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'state', 'restoreOnly'].every(key => a[key] === b[key]);

// Mount the actual Stage picker, context/selection lifecycle, AppState handler,
// canonical-snapshot observer, return/end callbacks and shared sheet/helper.
// Unrelated media transport/initial admission UI are explicit boundaries: boot
// supplies an already admitted canonical snapshot, never manufactures a native
// return verification. No OS/device execution is claimed by this harness.
async function mountStage(t, options = {}) {
  const runtime = { authority: authority(), target: 'stage-room', active: true, stageMode: 'live', picks: [], touches: [], contractClears: 0, accessRetries: 0, ...options };
  const boundary = createStageAttachmentBoundaries(runtime);
  const media = loadMediaPickerHost({ React, native: { Platform: { OS: options.platform ?? 'ios' } }, snapshot: () => runtime.authority });
  const path = 'app/watch-party/live-stage/[partyId].tsx', source = fs.readFileSync(path, 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const body = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WatchPartyLiveStageScreen').body;
  const names = new Set([...stageAttachmentNames, 'attachmentSubjectRef', 'commentMediaContext', 'commentMediaContextRef',
    'onPickHybridCommentAttachment', 'onReturnToLiveRoom', 'handleAuthoritativeLiveRoomEnded', 'syncStageSnapshot',
    'membershipMapRef', 'liveSurfaceRef', 'stageOperationOwnerKey', 'stageOperationOwnerKeyRef', 'hybridCommentSendRef', 'stageSnapshotRequestRef']);
  const states = ['room', 'loading', 'liveSurface', 'mediaAppState', 'hybridCommentAttachmentFile', 'hybridCommentError', 'hybridCommentSending'];
  const declarations = body.statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => {
    const name = declaration.name.getText(ast);
    return names.has(name) || name.includes('pickMedia: pickCommentMedia') || states.some(key => name.startsWith(`[${key},`));
  })).map(statement => statement.getText(ast));
  let appLifecycleCount = 0;
  const lifecycle = body.statements.filter(statement => {
    if (!ts.isExpressionStatement(statement)) return false;
    const text = statement.expression.getText(ast);
    if (text.startsWith('useEffect(') && text.includes('AppState.addEventListener') && text.includes('touchPartyRoomSession')) {
      appLifecycleCount++; return true;
    }
    return isStageAttachmentLifecycle(text) || ['commentMediaContextRef.current = commentMediaContext', 'liveSurfaceRef.current = liveSurface',
      'stageOperationOwnerKeyRef.current = stageOperationOwnerKey'].includes(text)
      || (text.startsWith('useEffect(') && (/\[commentMediaContext(?:,|\])/.test(text) || text.includes('[stageOperationOwnerKey]')));
  }).map(statement => statement.getText(ast));
  assert.equal(appLifecycleCount, 1, 'actual Stage AppState callback is mounted');
  const renderSource = `export function Probe() {
    const authority = runtime.authority, partyId = runtime.target, stageMode = runtime.stageMode,
      canUseBetaStage = runtime.betaAllowed !== false, isFocused = runtime.focused !== false,
      roomMissing = runtime.roomMissing ?? false, blockedRoomAccess = runtime.blockedRoomAccess ?? null,
      liveMoneyAccess = runtime.liveMoneyAccess ?? {allowed: true}, myUserId = authority.userId, myUsername = 'One', isHost = false;
    const setHybridCommentDraft = noop, revealStageOverlay = noop, setCommentsOpen = noop, setStageEntryBusy = noop,
      setRoomMissing = noop, setRoomEntryError = noop, setBlockedRoomAccess = noop, setIsHost = noop, setParticipantStateById = noop,
      setSeatRequestState = noop, setLiveKitRecoveryError = noop, closeStageOverlayPanels = noop, setStageOverlayAutoHideArmed = noop,
      setStageOverlayVisible = noop, setCommunicationRoomId = noop, refreshStageSnapshot = noop,
      setParticipants = noop, setHybridComments = noop;
    const stageEntryOwnerRef = useRef({invalidate: noop}), stageOverlayMotion = useMemo(() => ({setValue: noop}), []),
      stageOverlayLastInteractionAtRef = useRef(0), liveKitRecoveryTimeoutRef = useRef(null), liveKitPendingRecoveryRef = useRef(null),
      myCameraPreviewUrlRef = useRef(''), channelRef = useRef(null), roomRealtimeChannelRef = useRef(null), heartbeatRef = useRef(null);
    ${declarations.join('\n')}
    ${lifecycle.join('\n')}
    useLayoutEffect(() => { runtime.view = { pick: onPickHybridCommentAttachment, file: hybridCommentAttachmentFile, error: hybridCommentError,
      sheet: commentMediaPickerSheet, request: stageAttachmentRequestRef.current, owner: stageOperationOwnerKeyRef.current, loading,
      sync: syncStageSnapshot, returnToRoom: onReturnToLiveRoom, endRoom: handleAuthoritativeLiveRoomEnded,
      boot: () => {syncStageSnapshot(runtime.stageSnapshot, authority.userId); setLiveSurface('stage'); setLoading(false);},
      finishReload: () => setLoading(false), retire: retireStageAttachmentSelection }; });
    return loading ? null : commentMediaPickerSheet;
  }`;
  const scope = { exports: {}, React, ...React, ...boundary.scope, runtime, noop,
    ...media, getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority, sameAccountSessionAuthority: same,
    captureAccountBoundSupabaseMutationSubject: async () => ({ authority: runtime.authority, accessToken: 'frozen-test-token' }),
    pickSocialAttachmentFile: async (...args) => { runtime.picks.push(args); return runtime.pick ? runtime.pick(...args) : file; },
    getUserFacingErrorMessage: (error, fallback) => error?.message ?? fallback,
    getActivePartyMemberships: memberships => memberships,
    touchPartyRoomSession: async input => { runtime.touches.push(input); },
    setLiveKitJoinContract: () => { runtime.contractClears++; }, setLiveKitRenderableJoinContract: () => { runtime.contractClears++; },
    setAccessRetryToken: () => { runtime.accessRetries++; }, clearTimeout,
  };
  vm.runInNewContext(ts.transpileModule(renderSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, scope);
  const root = createRoot(container()); let mounted = true;
  const act = fn => React.act(async () => { await fn(); });
  const render = () => act(() => root.render(React.createElement(scope.exports.Probe)));
  await render(); await act(() => runtime.view.boot());
  t.after(async () => { if (mounted) await act(() => root.unmount()); });
  return { runtime, boundary, act,
    open: () => act(() => { void runtime.view.pick(); }),
    choose: async source => { const sheet = runtime.view.sheet; assert.ok(sheet); await act(() => sheet.props.onChoose(source ?? 'photos')); await act(() => sheet.props.onDismiss()); },
    app: next => act(() => boundary.emit(next)),
    update: async patch => { Object.assign(runtime, patch); await render(); },
    unmount: async () => { await act(() => root.unmount()); mounted = false; },
  };
}

for (const platform of ['ios', 'android']) test(`${platform}: native interruption retains selection only, keeps foreground teardown, and revalidates original admission`, async t => {
  const native = deferred(), read = deferred(), h = await mountStage(t, { platform, pick: () => native.promise });
  await h.open(); await h.choose(); const intent = h.runtime.view.request;
  await h.app('background'); assert.equal(h.runtime.view.owner, '');
  assert.equal(h.runtime.touches.at(-1).membershipState, 'reconnecting');
  assert.equal(h.runtime.touches.at(-1).cameraEnabled, false); assert.equal(h.runtime.touches.at(-1).micEnabled, false);
  await h.open(); assert.equal(h.runtime.picks.length, 1, 'repeat tap never replaces original native intent');
  await h.act(() => native.resolve(file)); assert.equal(h.runtime.stageReads.length, 0); assert.equal(h.runtime.view.file, null);
  h.runtime.stageRead = () => read.promise;
  await h.app('active'); assert.equal(h.runtime.view.loading, true); assert.equal(h.runtime.contractClears, 2); assert.equal(h.runtime.accessRetries, 1);
  assert.equal(h.runtime.view.request, intent, 'loading sheet unmount does not retire known native intent');
  assert.equal(h.runtime.view.file, null);
  const sameAdmission = structuredClone(h.runtime.stageSnapshot); sameAdmission.memberships[0].membershipState = 'reconnecting';
  await h.act(() => read.resolve(sameAdmission));
  assert.equal(h.runtime.stageReads.length, 2); assert.equal(h.runtime.stageAccessReads.length, 1);
  assert.equal(h.runtime.stageMoneyReads.length, 1); assert.equal(h.runtime.stagePremiumReads.length, 1);
  assert.equal(h.runtime.view.file, file); assert.equal(h.boundary.listeners.size, 1, 'verification listener was released, normal Stage listener remains');
  await h.act(() => h.runtime.view.finishReload()); assert.equal(h.runtime.view.file, file);
});

for (const reason of ['generation', 'source', 'admission', 'left', 'removed', 'missing', 'room-access', 'money-access', 'premium-access']) {
  test(`native return rejects changed ${reason} rather than adopting the resumed Stage owner`, async t => {
    const native = deferred(), h = await mountStage(t, { pick: () => native.promise });
    await h.open(); await h.choose(); await h.app('background');
    const snapshot = structuredClone(h.runtime.stageSnapshot);
    if (reason === 'generation') snapshot.room.roomGeneration = 'new-generation';
    if (reason === 'source') snapshot.room.sourceId = 'new-source';
    if (reason === 'admission') snapshot.memberships[0].joinedAt = 'new-admission';
    if (reason === 'left') snapshot.memberships[0].leftAt = 'now';
    if (reason === 'removed') snapshot.memberships[0].membershipState = 'removed';
    h.runtime.canonicalSnapshot = reason === 'missing' ? null : snapshot;
    if (reason === 'room-access') h.runtime.canonicalAccessAllowed = false;
    if (reason === 'money-access') h.runtime.canonicalMoneyAllowed = false;
    if (reason === 'premium-access') h.runtime.canonicalPremiumAllowed = false;
    await h.act(() => native.resolve(file)); await h.app('active');
    assert.equal(h.runtime.view.file, null); assert.equal(h.runtime.view.request, null); assert.equal(h.runtime.view.error, '');
  });
}

test('source changes while access read is pending are caught by the final canonical reread', async t => {
  const access = deferred(), h = await mountStage(t, { stageAccessRead: () => access.promise });
  await h.open(); await h.choose(); assert.equal(h.runtime.stageAccessReads.length, 1);
  const replacement = structuredClone(h.runtime.stageSnapshot); replacement.room.sourceId = 'replacement';
  h.runtime.canonicalSnapshot = replacement;
  await h.act(() => access.resolve({isAllowed: true}));
  assert.equal(h.runtime.stageReads.length, 2); assert.equal(h.runtime.view.file, null);
});

test('late native errors also require foreground canonical admission before becoming visible', async t => {
  for (const replaced of [false, true]) {
    const native = deferred(), h = await mountStage(t, { pick: () => native.promise });
    await h.open(); await h.choose(); await h.app('background');
    if (replaced) {
      const replacement = structuredClone(h.runtime.stageSnapshot); replacement.room.roomGeneration = 'replacement';
      h.runtime.canonicalSnapshot = replacement;
    }
    await h.act(() => native.reject(Error('Native permission failed')));
    assert.equal(h.runtime.view.error, '', 'no error applied while native app is still foreground');
    await h.app('active');
    assert.equal(h.runtime.view.error, replaced ? '' : 'Native permission failed');
  }
});

for (const reason of ['account', 'session', 'route', 'mode', 'focus', 'return', 'ended', 'observed-rejoin', 'unmount']) {
  test(`pending native result and error cannot survive explicit ${reason} retirement`, async t => {
    for (const reject of [false, true]) {
      const native = deferred(), h = await mountStage(t, { pick: () => native.promise });
      await h.open(); await h.choose();
      if (reason === 'account') await h.update({ authority: { ...h.runtime.authority, userId: 'two', accountId: 'two' } });
      if (reason === 'session') await h.update({ authority: { ...h.runtime.authority, sessionGeneration: 'replacement' } });
      if (reason === 'route') await h.update({ target: 'replacement-room' });
      if (reason === 'mode') await h.update({ stageMode: 'hybrid' });
      if (reason === 'focus') await h.update({ focused: false });
      if (reason === 'return') await h.act(() => h.runtime.view.returnToRoom());
      if (reason === 'ended') await h.act(() => h.runtime.view.endRoom());
      if (reason === 'observed-rejoin') {
        const replacement = structuredClone(h.runtime.stageSnapshot); replacement.memberships[0].joinedAt = 'rejoined';
        await h.act(() => h.runtime.view.sync(replacement, 'one'));
        await h.act(() => h.runtime.view.sync(h.runtime.stageSnapshot, 'one'));
      }
      if (reason === 'unmount') await h.unmount();
      await h.act(() => reject ? native.reject(Error('stale-private-picker-error')) : native.resolve(file));
      assert.equal(h.runtime.view.file, null); assert.notEqual(h.runtime.view.error, 'stale-private-picker-error');
      assert.equal(h.runtime.stageReads.length, 0, 'retired intent does not reauthorize itself');
    }
  });
}

test('cancel and failed revalidation retain the previous selected attachment', async t => {
  const h = await mountStage(t); await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file);
  h.runtime.pick = async () => null; await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file);
  h.runtime.pick = async () => ({...file, name: 'replacement.png'}); h.runtime.canonicalMoneyAllowed = false;
  await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file);
});

test('selected admission survives same-identity background observations but not a canonical replacement', async t => {
  const h = await mountStage(t); await h.open(); await h.choose(); await h.app('background');
  await h.act(() => h.runtime.view.sync(h.runtime.stageSnapshot, 'one')); assert.equal(h.runtime.view.file, file);
  const replacement = structuredClone(h.runtime.stageSnapshot); replacement.room.roomGeneration = 'replacement';
  await h.act(() => h.runtime.view.sync(replacement, 'one'));
  assert.equal(h.runtime.view.file, null); assert.match(h.runtime.view.error, /room session changed/);
});

test('source sheet without a native presentation cannot use hidden-sheet retention', async t => {
  const h = await mountStage(t); await h.open(); const sheet = h.runtime.view.sheet;
  await h.app('background'); await h.app('active'); assert.equal(h.runtime.view.loading, true);
  await h.act(() => sheet.props.onDismiss());
  assert.equal(h.runtime.picks.length, 0); assert.equal(h.runtime.view.file, null); assert.equal(h.runtime.view.request, null);
});

test('legacy room identity missing canonical generation cannot open a native picker', async t => {
  const h = await mountStage(t); delete h.runtime.stageSnapshot.room.roomGeneration;
  await h.open(); assert.equal(h.runtime.view.sheet, null); assert.equal(h.runtime.picks.length, 0);
  assert.match(h.runtime.view.error, /confirm this room session/);
});
