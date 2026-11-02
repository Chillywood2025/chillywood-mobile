import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { loadMediaPickerHost } from './helpers/media-picker-host.mjs';
import { createRoomAttachmentIntent, installAdmittedPartyMediaOwner } from './helpers/party-media-authority.mjs';
import { createStageAttachmentBoundaries, stageAttachmentNames, stageAttachmentSetup, isStageAttachmentLifecycle } from './helpers/stage-attachment-boundaries.mjs';

const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const owner = () => ({ userId: 'one', accountId: 'one', sessionGeneration: 'session-one', state: 'ACTIVE', restoreOnly: false });
const file = { uri: 'file:///late.png', name: 'late.png', mimeType: 'image/png' };
const surfaces = [
  { name: 'player', path: 'app/player/[id].tsx', pick: 'onPickCreatorVideoCommentAttachment', send: 'onSubmitCreatorVideoComment',
    file: 'creatorVideoCommentAttachmentFile', error: 'creatorVideoCommentsError', busy: 'creatorVideoCommentBusy', draft: 'creatorVideoCommentDraft', setDraft: 'setCreatorVideoCommentDraft', extras: ['creatorVideoComments', 'creatorVideoCommentReplyTargetId'] },
  { name: 'party', path: 'app/watch-party/[partyId].tsx', pick: 'onPickPartyRoomCommentAttachment', send: 'onSendPartyRoomComment',
    file: 'chatAttachmentFile', error: 'chatError', busy: 'chatSending', draft: 'chatDraft', setDraft: 'setChatDraft', extras: ['messages'] },
  { name: 'stage', path: 'app/watch-party/live-stage/[partyId].tsx', pick: 'onPickHybridCommentAttachment', send: 'onSendHybridComment',
    file: 'hybridCommentAttachmentFile', error: 'hybridCommentError', busy: 'hybridCommentSending', draft: 'hybridCommentDraft', setDraft: 'setHybridCommentDraft', extras: ['hybridComments'] },
];
const same = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'state', 'restoreOnly'].every(key => a[key] === b[key]);

// Mount the production declarations/handlers and shared hook. Unrelated player,
// room transport, and native host rendering are explicit controlled boundaries.
async function mountSubmit(t, surface, pick) {
  const runtime = { authority: owner(), target: 'target-one', active: true, inWatchParty: false, isLiveModeFlag: false, sends: [], captures: [], attachments: [], deletes: 0,
    token: 'picker-token', sendGate: null, sendError: null, attachmentError: null, deleteError: null, view: null };
  if (surface.name === 'party') await installAdmittedPartyMediaOwner(runtime);
  const stage = createStageAttachmentBoundaries(runtime);
  const media = loadMediaPickerHost({ React, native: { Platform: { OS: 'ios' } }, snapshot: () => runtime.authority });
  const source = fs.readFileSync(surface.path, 'utf8'), ast = ts.createSourceFile(surface.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body;
  const find = node => {
    if (ts.isFunctionDeclaration(node) && node.body?.statements.some(statement => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some(declaration => declaration.name.getText(ast) === surface.send))) body = node.body;
    ts.forEachChild(node, find);
  };
  find(ast); assert.ok(body, `production ${surface.name} submit body`);
  let realtime = null;
  if (surface.name === 'stage') {
    const findRealtime = node => {
      if (ts.isArrowFunction(node) && node.parameters[0]?.name.getText(ast) === 'payload'
        && node.getText(ast).includes('const ownedSend') && node.getText(ast).includes('realtimeChanges')) realtime = node.getText(ast);
      ts.forEachChild(node, findRealtime);
    };
    findRealtime(ast); assert.ok(realtime, 'actual Stage realtime comment callback');
  }
  const names = new Set([surface.pick, surface.send, 'attachmentSubjectRef', 'commentMediaContext', 'commentMediaContextRef',
    'commentSendFlightRef', 'hybridCommentSendRef', 'hybridCommentRevisionRef',
    'partyAttachmentIntentRef', 'selectedPartyAttachmentIntentRef', 'partyAttachmentContext', 'partyAttachmentContextRef', 'retirePartyAttachmentIntent', 'retireSelectedPartyAttachment', ...stageAttachmentNames]);
  const states = [surface.file, surface.error, surface.busy, surface.draft, ...surface.extras];
  const declarations = body.statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => {
    const name = declaration.name.getText(ast);
    return names.has(name) || name.includes('pickMedia: pickCommentMedia') || states.some(key => name.startsWith(`[${key},`));
  })).map(statement => statement.getText(ast));
  const lifecycle = body.statements.filter(statement => ts.isExpressionStatement(statement) && (
    /^(?:commentMediaContextRef|partyAttachmentContextRef)\.current =/.test(statement.expression.getText(ast))
    || (statement.expression.getText(ast).startsWith('useEffect(') && /\[(?:commentMediaContext|partyAttachmentContext)(?:,|\])/.test(statement.expression.getText(ast))
      && !isStageAttachmentLifecycle(statement.expression.getText(ast)))
  )).map(statement => statement.getText(ast));
  assert.equal(lifecycle.length, surface.name === 'party' ? 4 : 2, 'actual context ref updates and reset effects are mounted');
  const stageLifecycle = surface.name === 'stage' ? body.statements.filter(statement => ts.isExpressionStatement(statement)
    && statement.expression.getText(ast).startsWith('useEffect(') && statement.expression.getText(ast).includes('[stageOperationOwnerKey]'))
    .map(statement => statement.getText(ast)) : [];
  if (surface.name === 'stage') assert.equal(stageLifecycle.length, 1, 'actual media owner lifecycle effect is mounted');
  const stageSelectionLifecycle = body.statements.filter(statement => ts.isExpressionStatement(statement)
    && isStageAttachmentLifecycle(statement.expression.getText(ast))).map(statement => statement.getText(ast));
  const renderSource = `export function Probe() {
    const authority = runtime.authority, sessionAuthority = authority, partyId = runtime.target, cleanId = runtime.target,
      titleId = runtime.target, playbackSourceKind = 'creator-video', creatorVideo = {id: runtime.target}, isSignedIn = true;
    const inWatchParty = runtime.inWatchParty, isLiveModeFlag = runtime.isLiveModeFlag, active = true;
    const roomAuthority = runtime.roomAuthority, verifiedRoomOwner = runtime.verifiedRoomOwner;
    ${surface.name === 'stage' ? stageAttachmentSetup : `const room = runtime.canonicalRoomSnapshot?.room, membershipMapRef = useRef({});
    membershipMapRef.current = Object.fromEntries((runtime.canonicalRoomSnapshot?.memberships ?? []).map(member => [member.userId, member]));
    const isFocused = true, canUseBetaRoom = true, loading = false, notFound = false, accessGate = null, paidTicketGate = null, blockedRoomAccess = null;`}
    const appConfig = { runtimeControls: { comments_enabled: true, attachments_enabled: true, chat_enabled: true, chat_attachments_enabled: true } };
    const myUserIdRef = useRef('one'), myProfileUsernameRef = useRef('one'), myUsernameRef = useRef('one');
    const roomScrollRef = useRef(null), liveKitStageMountedRef = useRef(true), stageOperationOwnerKey = runtime.active ? 'room-owner' : '';
    const stageOperationOwnerKeyRef = useRef(stageOperationOwnerKey); stageOperationOwnerKeyRef.current = stageOperationOwnerKey;
    const trackedUserId = 'one', resolvedCurrentUsername = 'one', revealStageOverlay = noop, setCommentsOpen = noop, setStageEntryBusy = noop;
    ${declarations.join('\n')}
    ${lifecycle.join('\n')}
    ${stageLifecycle.join('\n')}
    ${stageSelectionLifecycle.join('\n')}
    useLayoutEffect(() => { runtime.view = { pick: ${surface.pick}, send: ${surface.send}, file: ${surface.file},
      busy: ${surface.busy}, draft: ${surface.draft}, setDraft: ${surface.setDraft}, error: ${surface.error}, sheet: commentMediaPickerSheet,
      retireSelection: ${surface.name === 'party' ? 'retireSelectedPartyAttachment' : 'null'},
      realtime: ${realtime ? `(${realtime})` : 'null'}, comments: ${surface.name === 'stage' ? 'hybridComments' : '[]'} }; });
    return null;
  }`;
  const send = async input => {
    if (runtime.beforeDispatchGate) {
      await runtime.beforeDispatchGate.promise;
      if (!input.isCurrent()) throw new Error('This comment request is no longer current.');
    }
    runtime.sends.push(input);
    await runtime.sendGate?.promise;
    if (runtime.sendError) throw runtime.sendError;
    return { id: 'saved-comment', userId: 'one', body: 'hello', createdAt: '2026-11-01T00:00:00Z', attachments: [] };
  };
  const scope = { exports: {}, ...React, ...media, runtime, noop, CREATOR_VIDEO_COMMENT_BODY_LIMIT: 2000,
    createRoomAttachmentIntent, AppState: { currentState: 'active', addEventListener: () => ({ remove: noop }) },
    getPartyRoomSnapshot: async () => runtime.canonicalRoomSnapshot,
    resolvePaidWatchPartyTicketAccess: async () => runtime.ticket ?? ({ allowed: true, reason: 'free_room' }),
    paidWatchPartyResolutionIsExactFreeRoom: value => value?.reason === 'free_room',
    resolvePremiumAccessKeyForRoom: value => value.sourceId,
    requireLiveFirstPremium: async () => ({ allowed: true }), requireWatchPartyLivePremium: async () => ({ allowed: true }),
    resolveRoomAccess: async () => ({ isAllowed: !runtime.attachmentAccessDenied }),
    ...(surface.name === 'stage' ? stage.scope : {}),
    getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority, sameAccountSessionAuthority: same,
    captureAccountBoundSupabaseMutationSubject: async () => { const subject = { authority: runtime.authority, accessToken: runtime.token }; runtime.captures.push(subject); await runtime.captureGate?.promise; return subject; },
    pickSocialAttachmentFile: pick, createCreatorVideoComment: send,
    sendPartyMessageRecord: async (partyId, userId, kind, body, options) => send({ partyId, userId, kind, body, ...options }),
    createSocialAttachmentForSurface: async input => { runtime.attachments.push(input); if (runtime.attachmentError) throw runtime.attachmentError; return { id: 'saved-attachment' }; },
    deletePartyMessage: async () => { runtime.deletes++; if (runtime.deleteError) throw runtime.deleteError; },
    isSocialAttachmentOutcomeAmbiguous: error => error?.ambiguous === true,
    isAttachmentParentSavedError: error => error?.parentSaved === true,
    mapLiveStageCommentRow: row => ({ id: row.id, userId: row.user_id, body: row.text, createdAt: row.created_at, isMe: true, attachments: [] }),
    getUserFacingErrorMessage: (error, fallback) => error?.message ?? fallback,
    resolveIdentityName: () => 'one', reportRuntimeError: noop, Alert: { alert: noop }, setTimeout: noop,
  };
  vm.runInNewContext(ts.transpileModule(renderSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  const root = createRoot(container()), act = fn => React.act(async () => { await fn(); }); let mounted = true;
  const render = () => act(() => root.render(React.createElement(scope.exports.Probe)));
  await render(); t.after(() => mounted ? act(() => root.unmount()) : undefined);
  await act(() => runtime.view.setDraft('hello'));
  return { runtime, media, resources: media.resources, act, refresh: async () => { runtime.authority = { ...runtime.authority }; await render(); },
    refreshRoom: async () => { await act(() => runtime.roomAuthority.read()); await render(); },
    foreground: async active => { runtime.active = active; await render(); },
    mode: async patch => { Object.assign(runtime, patch); await render(); },
    open: () => act(() => { void runtime.view.pick(); }), send: () => act(() => { void runtime.view.send(); }),
    choose: async () => { const sheet = runtime.view.sheet; assert.ok(sheet); await act(() => sheet.props.onChoose('photos')); await act(() => sheet.props.onDismiss()); },
    unmount: async () => { await act(() => root.unmount()); mounted = false; },
  };
}

for (const surface of surfaces) {
  if (surface.name !== 'party') test(`${surface.name}: successful native wrapper disposal transfers file ownership to staged UI and Send`, async t => {
    const released = [], h = await mountSubmit(t, surface, async (_kind, _source, operation) => {
      operation.ownResource(file, async () => { released.push('native'); }); return file;
    });
    await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file); assert.deepEqual(released, []);
    await h.send(); assert.equal(h.runtime.sends.length, 1); assert.deepEqual(released, ['native']);
  });
  if (surface.name !== 'party') test(`${surface.name}: a detached send callback cannot reopen a replaced owned file`, async t => {
    let chosen = file; const h = await mountSubmit(t, surface, async () => chosen), released = [];
    const replacement = {...file, uri: 'file:///replacement.png', name: 'replacement.png'};
    h.media.ownPickedMedia(file, async () => { released.push('old'); });
    h.media.ownPickedMedia(replacement, async () => { released.push('new'); });
    await h.open(); await h.choose(); const staleSend = h.runtime.view.send;
    chosen = replacement; await h.open(); await h.choose(); assert.deepEqual(released, ['old']);
    await h.act(() => staleSend()); assert.equal(h.runtime.sends.length, 0);
    assert.equal(h.runtime.view.file, replacement); assert.deepEqual(released, ['old']); assert.match(h.runtime.view.error, /attachment changed/);
  });
  if (surface.name !== 'party') for (const phase of ['preflight', 'send', 'unmount']) {
    test(`${surface.name}: ${phase} retirement cannot release the file held by its initiating send`, async t => {
      const h = await mountSubmit(t, surface, async () => file), held = deferred(), released = [];
      h.media.ownPickedMedia(file, async () => { released.push('file'); });
      await h.open(); await h.choose();
      if (phase === 'preflight') h.runtime.captureGate = held; else h.runtime.sendGate = held;
      await h.send(); assert.deepEqual(released, []);
      if (phase === 'unmount') await h.unmount();
      else await h.mode({ authority: {...h.runtime.authority, sessionGeneration: 'replacement-session'} });
      assert.deepEqual(released, [], 'active send still owns the old file after UI retirement');
      await h.act(() => held.resolve()); assert.deepEqual(released, ['file']);
      if (phase === 'preflight') assert.equal(h.runtime.sends.length, 0);
    });
  }
  if (surface.name !== 'party') test(`${surface.name}: retryable failure retains staged file while successful retry retires exactly once`, async t => {
    const h = await mountSubmit(t, surface, async () => file), released = [];
    h.media.ownPickedMedia(file, async () => { released.push('file'); });
    await h.open(); await h.choose();
    h.runtime.sendError = Error('Before confirmed parent'); await h.send();
    assert.equal(h.runtime.view.file, file); assert.deepEqual(released, []);
    h.runtime.sendError = null; await h.send();
    assert.equal(h.runtime.view.file, null); assert.deepEqual(released, ['file']);
  });
  if (surface.name !== 'party') test(`${surface.name}: confirmed parent clear does not delete a still-running raw native reader`, async t => {
    const h = await mountSubmit(t, surface, async () => file), raw = deferred(), released = [];
    h.media.ownPickedMedia(file, async () => { released.push('file'); });
    await h.open(); await h.choose();
    const reader = h.media.withPickedMediaRead(file.uri, () => raw.promise);
    h.runtime.sendError = Object.assign(Error('Parent saved; reader still settling'), {parentSaved: true});
    await h.send(); assert.equal(h.runtime.view.file, null); assert.deepEqual(released, []);
    await h.act(() => raw.resolve()); await reader; assert.deepEqual(released, ['file']);
  });
  test(`${surface.name}: submit retires a pending native picker before clearing this draft`, async t => {
    const held = deferred(), h = await mountSubmit(t, surface, () => held.promise);
    await h.open(); await h.choose(); await h.send();
    assert.equal(h.runtime.sends.length, 1); assert.equal(h.runtime.view.draft, '');
    await h.act(() => held.resolve(file));
    assert.equal(h.runtime.view.file, null, 'retired result cannot populate the next composer');
    assert.equal(h.runtime.view.busy, false); assert.ok(!h.runtime.view.error, h.runtime.view.error);
  });
  test(`${surface.name}: equivalent authority refresh retains one pending send and settles its busy state`, async t => {
    const h = await mountSubmit(t, surface, async () => file), gate = deferred();
    h.runtime.sendGate = gate; await h.send(); assert.equal(h.runtime.view.busy, true);
    await h.refresh(); assert.equal(h.runtime.view.busy, true, 'same-session refresh is not a new composer');
    await h.send(); assert.equal(h.runtime.sends.length, 1);
    await h.act(() => gate.resolve());
    assert.equal(h.runtime.view.busy, false); assert.equal(h.runtime.view.draft, '');
    assert.ok(!h.runtime.view.error, h.runtime.view.error);
  });
  test(`${surface.name}: same-render double submit dispatches only one parent write`, async t => {
    const h = await mountSubmit(t, surface, async () => file), gate = deferred();
    h.runtime.sendGate = gate;
    await h.act(() => { const send = h.runtime.view.send; void send(); void send(); });
    assert.equal(h.runtime.sends.length, 1);
    await h.act(() => gate.resolve()); assert.equal(h.runtime.view.busy, false);
  });
  test(`${surface.name}: refreshed same-session credentials replace the picker token, then stay frozen for the send`, async t => {
    const h = await mountSubmit(t, surface, async () => file), gate = deferred();
    await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file);
    h.runtime.token = 'refreshed-before-send'; await h.refresh();
    h.runtime.sendGate = gate; await h.send();
    assert.equal(h.runtime.sends[0].mutationSubject.accessToken, 'refreshed-before-send');
    h.runtime.token = 'refreshed-during-send'; await h.refresh(); await h.act(() => gate.resolve());
    if (surface.name !== 'player') assert.equal(h.runtime.attachments[0].mutationSubject, h.runtime.sends[0].mutationSubject,
      'parent and child keep the same initiating send subject');
    assert.equal(h.runtime.view.busy, false); assert.equal(h.runtime.view.file, null);
  });
  test(`${surface.name}: known-saved parent with ambiguous attachment does not retain a retryable draft`, async t => {
    const h = await mountSubmit(t, surface, async () => file);
    await h.open(); await h.choose();
    const error = Object.assign(Error('Saved, attachment unconfirmed. Refresh before retrying.'), { parentSaved: true, ambiguous: true });
    if (surface.name === 'player') h.runtime.sendError = error; else h.runtime.attachmentError = error;
    await h.send();
    assert.equal(h.runtime.sends.length, 1); assert.equal(h.runtime.deletes, 0);
    assert.equal(h.runtime.view.draft, ''); assert.equal(h.runtime.view.file, null);
    assert.match(h.runtime.view.error, /unconfirmed/); assert.equal(h.runtime.view.busy, false);
  });
  test(`${surface.name}: a typed known-saved parent outcome fences the old draft instead of allowing duplicate retry`, async t => {
    const h = await mountSubmit(t, surface, async () => file);
    await h.open(); await h.choose();
    h.runtime.sendError = Object.assign(Error('Comment was saved. Refresh before retrying its attachment.'), { parentSaved: true });
    await h.send();
    assert.equal(h.runtime.sends.length, 1); assert.equal(h.runtime.attachments.length, 0);
    assert.equal(h.runtime.view.draft, ''); assert.equal(h.runtime.view.file, null);
    await h.send(); assert.equal(h.runtime.sends.length, 1);
  });
  if (surface.name !== 'player') test(`${surface.name}: failed parent compensation clears the already-saved draft instead of duplicating it`, async t => {
    const h = await mountSubmit(t, surface, async () => file);
    await h.open(); await h.choose();
    h.runtime.attachmentError = Error('Attachment rejected'); h.runtime.deleteError = Error('Delete rejected');
    await h.send();
    assert.equal(h.runtime.deletes, 1); assert.equal(h.runtime.sends.length, 1);
    assert.equal(h.runtime.view.draft, ''); assert.equal(h.runtime.view.file, null);
    assert.match(h.runtime.view.error, /comment was saved/); assert.equal(h.runtime.view.busy, false);
  });
  if (surface.name === 'stage') for (const settleWhileBackgrounded of [false, true]) {
    test(`stage: background does not release an irreversible send; settlement in ${settleWhileBackgrounded ? 'background' : 'foreground'} clears its draft`, async t => {
      const h = await mountSubmit(t, surface, async () => file), gate = deferred();
      h.runtime.sendGate = gate; await h.send(); assert.equal(h.runtime.view.busy, true);
      await h.foreground(false); assert.equal(h.runtime.view.busy, true);
      if (!settleWhileBackgrounded) await h.foreground(true);
      await h.send(); assert.equal(h.runtime.sends.length, 1, 'neither background nor refocus permits duplicate send');
      await h.act(() => gate.resolve());
      if (settleWhileBackgrounded) await h.foreground(true);
      assert.equal(h.runtime.view.busy, false); assert.equal(h.runtime.view.draft, '');
      assert.ok(!h.runtime.view.error, h.runtime.view.error);
    });
  }
  if (surface.name === 'stage') for (const reason of ['generation', 'source', 'rejoin', 'access', 'pass', 'premium']) {
    test(`stage: selected attachment retains original ${reason} admission through explicit Send`, async t => {
      const h = await mountSubmit(t, surface, async () => file);
      await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file);
      const replacement = structuredClone(h.runtime.stageSnapshot);
      if (reason === 'generation') replacement.room.roomGeneration = 'replacement';
      if (reason === 'source') replacement.room.sourceId = 'replacement';
      if (reason === 'rejoin') replacement.memberships[0].joinedAt = 'replacement';
      h.runtime.canonicalSnapshot = replacement;
      if (reason === 'access') h.runtime.canonicalAccessAllowed = false;
      if (reason === 'pass') h.runtime.canonicalMoneyAllowed = false;
      if (reason === 'premium') h.runtime.canonicalPremiumAllowed = false;
      await h.send();
      assert.equal(h.runtime.sends.length, 0); assert.equal(h.runtime.attachments.length, 0);
      assert.equal(h.runtime.view.file, null); assert.equal(h.runtime.view.draft, 'hello');
      assert.match(h.runtime.view.error, /room session or its access changed/);
    });
  }
  if (surface.name === 'stage') test('stage: admission changing during parent dispatch blocks child upload and compensates only the original parent', async t => {
    const h = await mountSubmit(t, surface, async () => file), gate = deferred();
    await h.open(); await h.choose(); h.runtime.sendGate = gate; await h.send();
    assert.equal(h.runtime.sends.length, 1);
    const replacement = structuredClone(h.runtime.stageSnapshot); replacement.memberships[0].joinedAt = 'replacement';
    h.runtime.canonicalSnapshot = replacement;
    await h.act(() => gate.resolve());
    assert.equal(h.runtime.attachments.length, 0); assert.equal(h.runtime.deletes, 1);
    assert.equal(h.runtime.view.file, null); assert.equal(h.runtime.view.draft, 'hello');
    assert.match(h.runtime.view.error, /room session or its access changed/);
  });
  if (surface.name === 'stage') test('stage: unchanged selected admission survives foreground resource retirement before explicit Send', async t => {
    const h = await mountSubmit(t, surface, async () => file);
    await h.open(); await h.choose(); await h.foreground(false); await h.foreground(true);
    assert.equal(h.runtime.view.file, file); await h.send();
    assert.equal(h.runtime.sends.length, 1); assert.equal(h.runtime.attachments.length, 1); assert.equal(h.runtime.view.file, null);
  });
  if (surface.name === 'player') for (const mode of ['inWatchParty', 'isLiveModeFlag']) {
    test(`player: ${mode} transition retires creator-comment selection and queued submit`, async t => {
      const held = deferred(), h = await mountSubmit(t, surface, () => held.promise);
      await h.open(); await h.choose(); const oldSubmit = h.runtime.view.send;
      await h.mode({ [mode]: true }); await h.act(() => oldSubmit());
      await h.act(() => held.resolve(file));
      assert.equal(h.runtime.view.file, null); assert.equal(h.runtime.sends.length, 0);
      await h.send(); assert.equal(h.runtime.sends.length, 0, 'creator-comment actions stay unavailable in the other mode');
    });
  }
  if (surface.name === 'stage') for (const eventType of ['UPDATE', 'DELETE']) {
    test(`stage: realtime ${eventType} while backgrounded supersedes the late parent receipt`, async t => {
      const h = await mountSubmit(t, surface, async () => file), gate = deferred();
      await h.open(); await h.choose(); h.runtime.sendGate = gate; await h.send();
      await h.foreground(false);
      await h.act(() => h.runtime.view.realtime({ eventType, old: { id: 'saved-comment' },
        new: { id: 'saved-comment', user_id: 'one', text: 'newer edit', created_at: '2026-11-01T00:00:01Z' } }));
      await h.act(() => gate.resolve());
      if (eventType === 'DELETE') {
        assert.equal(h.runtime.attachments.length, 0, 'deleted parent never gets a late attachment');
        assert.equal(h.runtime.view.comments.length, 0, 'late insert acknowledgement cannot resurrect deletion');
      } else assert.equal(h.runtime.view.comments[0].body, 'newer edit');
      assert.equal(h.runtime.view.draft, ''); assert.equal(h.runtime.view.busy, false);
    });
  }
}

test('party: an in-flight parent retains its file after the selected UI owner is retired', async t => {
  const h = await mountSubmit(t, surfaces.find(surface => surface.name === 'party'), async () => file);
  let cleaned = 0; h.resources.ownPickedMedia(file, async () => { cleaned++; });
  await h.open(); await h.choose();
  const gate = deferred(); h.runtime.sendGate = gate; await h.send(); assert.equal(h.runtime.sends.length, 1);
  await h.act(() => h.runtime.view.retireSelection());
  assert.equal(h.runtime.view.file, null); assert.equal(cleaned, 0, 'the dispatched parent still owns its bytes');
  await h.act(() => gate.resolve());
  assert.equal(cleaned, 1); assert.equal(h.runtime.attachments.length, 0, 'retired admission cannot start a child upload');
  assert.equal(h.runtime.view.busy, false);
});

test('stage: retained selected admission is checked again at asynchronous parent dispatch', async t => {
  const h = await mountSubmit(t, surfaces.find(surface => surface.name === 'stage'), async () => file);
  await h.open(); await h.choose();
  const gate = deferred(); h.runtime.beforeDispatchGate = gate;
  await h.send(); assert.equal(h.runtime.view.busy, true); assert.equal(h.runtime.sends.length, 0);
  await h.mode({ liveMoneyAccess: { allowed: false } });
  await h.act(() => gate.resolve());
  assert.equal(h.runtime.sends.length, 0, 'retired selection cannot dispatch its parent after the service await');
  assert.equal(h.runtime.attachments.length, 0); assert.equal(h.runtime.view.busy, false);
  assert.equal(h.runtime.view.draft, 'hello', 'a known unexecuted parent preserves the typed comment');
});

for (const reason of ['source', 'generation', 'membership']) test(`party: canonical ${reason} retirement prevents held parent receipt from dispatching its attachment`, async t => {
  const h = await mountSubmit(t, surfaces.find(surface => surface.name === 'party'), async () => file), held = deferred();
  await h.open(); await h.choose(); h.runtime.sendGate = held;
  await h.send(); assert.equal(h.runtime.sends.length, 1); const oldSend = h.runtime.view.send;
  if (reason === 'membership') h.runtime.canonicalRoomSnapshot.memberships = [];
  else h.runtime.canonicalRoomSnapshot.room[reason === 'source' ? 'sourceId' : 'roomGeneration'] = 'replacement';
  await h.refreshRoom(); assert.equal(h.runtime.sends[0].isCurrent(), false);
  await h.act(() => oldSend()); await h.act(() => held.resolve());
  assert.equal(h.runtime.attachments.length, 0); assert.equal(h.runtime.sends.length, 1);
  // This composition owns submit settlement. Canonical UI/file clearing is
  // exercised with the real bootstrap/retirement lifecycle in the Party suite.
  assert.equal(h.runtime.view.draft, '');
  await h.send(); assert.equal(h.runtime.sends.length, 1);
});

for (const boundary of ['before-parent', 'after-parent']) for (const reason of ['paid', 'admission', 'generation']) {
  test(`party: selected attachment rechecks ${reason} authority ${boundary} without duplicating a saved parent`, async t => {
    const h = await mountSubmit(t, surfaces.find(surface => surface.name === 'party'), async () => file), held = deferred();
    await h.open(); await h.choose();
    if (boundary === 'after-parent') { h.runtime.sendGate = held; await h.send(); assert.equal(h.runtime.sends.length, 1); }
    if (reason === 'paid') h.runtime.ticket = { allowed: false, requiresPurchase: true, reason: 'ticket_required' };
    if (reason === 'admission') h.runtime.attachmentAccessDenied = true;
    if (reason === 'generation') h.runtime.canonicalRoomSnapshot.room.roomGeneration = 'replacement';
    if (boundary === 'before-parent') await h.send(); else await h.act(() => held.resolve());
    assert.equal(h.runtime.sends.length, boundary === 'before-parent' ? 0 : 1);
    assert.equal(h.runtime.attachments.length, 0); assert.equal(h.runtime.view.busy, false); assert.equal(h.runtime.view.file, null);
    if (boundary === 'after-parent') { assert.equal(h.runtime.view.draft, ''); assert.match(h.runtime.view.error, /comment was saved/); }
    else { assert.equal(h.runtime.view.draft, 'hello'); assert.match(h.runtime.view.error, /room/); }
  });
}
