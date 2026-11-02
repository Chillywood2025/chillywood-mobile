import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { loadMediaPickerHost } from './helpers/media-picker-host.mjs';
import { createRoomAttachmentIntent, installAdmittedPartyMediaOwner } from './helpers/party-media-authority.mjs';
import { mountFullChatThread } from './assurance/helpers/chat-thread-full-mounted-harness.mjs';
import { createStageAttachmentBoundaries, stageAttachmentNames, stageAttachmentSetup, isStageAttachmentLifecycle } from './helpers/stage-attachment-boundaries.mjs';
const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const owner = (userId = 'one', sessionGeneration = 's1') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const file = { uri: 'file:///selected.png', name: 'selected.png', mimeType: 'image/png' };
const surfaces = [
  { name: 'player', path: 'app/player/[id].tsx', action: 'onPickCreatorVideoCommentAttachment', file: 'creatorVideoCommentAttachmentFile', error: 'creatorVideoCommentsError', busy: 'creatorVideoCommentBusy' },
  { name: 'party', path: 'app/watch-party/[partyId].tsx', action: 'onPickPartyRoomCommentAttachment', file: 'chatAttachmentFile', error: 'chatError', busy: 'chatSending' },
  { name: 'stage', path: 'app/watch-party/live-stage/[partyId].tsx', action: 'onPickHybridCommentAttachment', file: 'hybridCommentAttachmentFile', error: 'hybridCommentError', busy: 'hybridCommentSending' },
];

async function mountCaller(t, surface, pick, options = {}) {
  const runtime = { authority: owner(), target: 'target-one', reply: '', picks: [], view: null };
  if (surface.name === 'party') await installAdmittedPartyMediaOwner(runtime);
  const stage = createStageAttachmentBoundaries(runtime);
  const media = loadMediaPickerHost({ React, native: { Platform: { OS: 'ios' } }, snapshot: () => runtime.authority, beforeHandoff: options.beforeHandoff });
  const source = fs.readFileSync(surface.path, 'utf8'), ast = ts.createSourceFile(surface.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body;
  const find = node => {
    if (ts.isFunctionDeclaration(node) && node.body?.statements.some(statement => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some(declaration => declaration.name.getText(ast) === surface.action))) body = node.body;
    ts.forEachChild(node, find);
  };
  find(ast); assert.ok(body, `production ${surface.name} body`);
  const names = new Set([surface.action, 'attachmentSubjectRef', 'commentMediaContext', 'commentMediaContextRef', 'commentSendFlightRef',
    'partyAttachmentIntentRef', 'selectedPartyAttachmentIntentRef', 'partyAttachmentContext', 'partyAttachmentContextRef', 'retirePartyAttachmentIntent', 'retireSelectedPartyAttachment', ...stageAttachmentNames]);
  const declarations = body.statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => {
    const name = declaration.name.getText(ast);
    return names.has(name) || name.includes('pickMedia: pickCommentMedia') || [surface.file, surface.error, surface.busy].some(key => name.startsWith(`[${key},`));
  })).map(statement => statement.getText(ast));
  const effects = body.statements.filter(statement => ts.isExpressionStatement(statement) && statement.expression.getText(ast).startsWith('useEffect(')
    && /\[(?:commentMediaContext|partyAttachmentContext)(?:,|\])/.test(statement.expression.getText(ast))
    && !isStageAttachmentLifecycle(statement.expression.getText(ast))).map(statement => statement.getText(ast));
  assert.equal(effects.length, surface.name === 'party' ? 2 : 1, 'production owner reset effects');
  const assignments = body.statements.filter(statement => ts.isExpressionStatement(statement)
    && /^(?:commentMediaContextRef|partyAttachmentContextRef)\.current =/.test(statement.expression.getText(ast))).map(statement => statement.getText(ast));
  const stageLifecycle = body.statements.filter(statement => ts.isExpressionStatement(statement)
    && isStageAttachmentLifecycle(statement.expression.getText(ast))).map(statement => statement.getText(ast));
  const renderSource = `export function Probe() {
    const authority = runtime.authority, sessionAuthority = authority, partyId = runtime.target, cleanId = runtime.target,
      titleId = runtime.target, playbackSourceKind = 'creator-video', creatorVideoCommentReplyTargetId = runtime.reply,
      inWatchParty = runtime.inWatchParty ?? false, isLiveModeFlag = runtime.isLiveModeFlag ?? false;
    const roomAuthority = runtime.roomAuthority, verifiedRoomOwner = runtime.verifiedRoomOwner;
    ${surface.name === 'stage' ? stageAttachmentSetup : `const room = runtime.canonicalRoomSnapshot?.room, membershipMapRef = useRef({});
    membershipMapRef.current = Object.fromEntries((runtime.canonicalRoomSnapshot?.memberships ?? []).map(member => [member.userId, member]));
    const isFocused = true, canUseBetaRoom = true, loading = false, notFound = false, accessGate = null, paidTicketGate = null, blockedRoomAccess = null;`}
    const revealStageOverlay = noop, setCommentsOpen = noop, setChatDraft = noop, setHybridCommentDraft = noop;
    const hybridCommentSendRef = useRef(null);
    const stageOperationOwnerKeyRef = useRef('active-stage-owner'); stageOperationOwnerKeyRef.current = runtime.active === false ? '' : 'active-stage-owner';
    ${declarations.join('\n')}
    ${assignments.join('\n')}
    ${effects.join('\n')}
    ${stageLifecycle.join('\n')}
    useLayoutEffect(() => { runtime.view = { action: ${surface.action}, file: ${surface.file}, error: ${surface.error},
      sheet: commentMediaPickerSheet, cancel: cancelCommentMediaPicker, subject: attachmentSubjectRef.current }; });
    return null;
  }`;
  const scope = { exports: {}, ...React, ...media, runtime, noop,
    createRoomAttachmentIntent, AppState: { currentState: 'active', addEventListener: () => ({ remove: noop }) },
    getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'state', 'restoreOnly'].every(key => a[key] === b[key]),
    getPartyRoomSnapshot: async () => runtime.canonicalRoomSnapshot,
    resolvePaidWatchPartyTicketAccess: async () => ({ allowed: true, reason: 'free_room' }),
    paidWatchPartyResolutionIsExactFreeRoom: value => value?.reason === 'free_room',
    resolvePremiumAccessKeyForRoom: value => value.sourceId,
    requireLiveFirstPremium: async () => ({ allowed: true }), requireWatchPartyLivePremium: async () => ({ allowed: true }),
    resolveRoomAccess: async () => ({ isAllowed: true }),
    ...(surface.name === 'stage' ? stage.scope : {}),
    captureAccountBoundSupabaseMutationSubject: async () => ({ authority: runtime.authority, accessToken: `token-${runtime.authority.sessionGeneration}` }),
    pickSocialAttachmentFile: async (...args) => { runtime.picks.push(args); return pick(...args); },
    getUserFacingErrorMessage: (error, fallback) => error?.message ?? fallback };
  vm.runInNewContext(ts.transpileModule(renderSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  const root = createRoot(container()); let mounted = true;
  const act = fn => React.act(async () => { await fn(); });
  const render = () => act(() => root.render(React.createElement(scope.exports.Probe)));
  await render(); t.after(async () => { if (mounted) await act(() => root.unmount()); });
  return { runtime, act, update: async patch => { Object.assign(runtime, patch); await render(); },
    refreshRoom: async () => { await act(() => runtime.roomAuthority.read()); await render(); },
    open: () => act(() => { void runtime.view.action(); }),
    choose: async (source = 'photos') => { const sheet = runtime.view.sheet; assert.ok(sheet); await act(() => sheet.props.onChoose(source)); await act(() => sheet.props.onDismiss()); },
    unmount: async () => { await act(() => root.unmount()); mounted = false; } };
}

for (const surface of surfaces) {
  if (surface.name !== 'party') for (const replacement of ['account', 'target']) test(`${surface.name}: final hook-to-caller ${replacement} retirement releases unadopted native result`, async t => {
    const gate = deferred(), cleaned = []; let arrived = false;
    const nativeFile = {...file};
    const h = await mountCaller(t, surface, async (_kind, _source, operation) => {
      operation.ownResource(nativeFile, async () => { cleaned.push('native'); }); return nativeFile;
    }, {beforeHandoff: async () => { arrived = true; await gate.promise; }});
    await h.open(); await h.choose(); assert.equal(arrived, true); assert.equal(h.runtime.view.file, null); assert.deepEqual(cleaned, []);
    await h.update(replacement === 'account' ? {authority: owner('replacement')} : {target: 'replacement'});
    await h.act(() => gate.resolve()); assert.equal(h.runtime.view.file, null); assert.deepEqual(cleaned, ['native']);
  });
  test(`${surface.name}: equivalent token refresh preserves pending and selected attachment`, async t => {
    const held = deferred(), h = await mountCaller(t, surface, () => held.promise);
    await h.open(); await h.choose();
    await h.update({ authority: { ...h.runtime.authority } });
    await h.act(() => held.resolve(file)); assert.equal(h.runtime.view.file, file);
    await h.update({ authority: { ...h.runtime.authority } }); assert.equal(h.runtime.view.file, file);
  });
  test(`${surface.name}: one shared sheet serializes repeat taps and preserves source/subject`, async t => {
    const held = deferred(), h = await mountCaller(t, surface, () => held.promise);
    await h.open(); await h.open(); assert.equal(h.runtime.picks.length, 0);
    const sheet = h.runtime.view.sheet; await h.act(() => sheet.props.onChoose('files'));
    assert.equal(h.runtime.picks.length, 0, 'no native picker until actual iOS dismissal');
    await h.act(() => sheet.props.onDismiss()); await h.open(); assert.equal(h.runtime.picks.length, 1);
    assert.deepEqual(h.runtime.picks[0].slice(0, 2), ['files', 'files']);
    await h.act(() => held.resolve(file)); assert.equal(h.runtime.view.file, file);
    assert.equal(h.runtime.view.subject.authority, h.runtime.authority);
  });
  test(`${surface.name}: cancel and current picker failure keep the selected attachment`, async t => {
    let result = file, failure = null; const h = await mountCaller(t, surface, async () => { if (failure) throw failure; return result; });
    await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file);
    await h.open(); const sheet = h.runtime.view.sheet; await h.act(() => sheet.props.onCancel()); await h.act(() => sheet.props.onDismiss());
    assert.equal(h.runtime.view.file, file); result = null; await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file);
    failure = Error('Permission denied'); await h.open(); await h.choose(); assert.equal(h.runtime.view.file, file); assert.equal(h.runtime.view.error, 'Permission denied');
  });
  for (const change of ['account', 'session', 'target', 'unmount']) test(`${surface.name}: late result and error cannot cross ${change}`, async t => {
    for (const rejects of [false, true]) {
      const held = deferred(), h = await mountCaller(t, surface, () => held.promise);
      await h.open(); await h.choose();
      if (change === 'unmount') await h.unmount();
      else await h.update(change === 'target' ? { target: 'target-two' } : { authority: change === 'account' ? owner('two') : owner('one', 's2') });
      await h.act(() => rejects ? held.reject(Error('Private stale failure')) : held.resolve(file));
      assert.equal(h.runtime.view.file, null); assert.notEqual(h.runtime.view.error, 'Private stale failure');
    }
  });
}

for (const reason of ['source', 'generation', 'membership']) test(`party: canonical ${reason} retirement discards held native selection and queued attachment action`, async t => {
  const held = deferred(), h = await mountCaller(t, surfaces.find(surface => surface.name === 'party'), () => held.promise);
  await h.open(); await h.choose(); const oldAction = h.runtime.view.action;
  if (reason === 'membership') h.runtime.canonicalRoomSnapshot.memberships = [];
  else h.runtime.canonicalRoomSnapshot.room[reason === 'source' ? 'sourceId' : 'roomGeneration'] = 'replacement';
  await h.refreshRoom(); assert.equal(h.runtime.roomAuthority.current(), false);
  await h.act(() => oldAction());
  await h.act(() => held.resolve(file));
  assert.equal(h.runtime.view.file, null); assert.equal(h.runtime.view.subject, null);
  assert.equal(h.runtime.picks.length, 1, 'retired callbacks cannot open another native selector');
  await h.open(); assert.equal(h.runtime.picks.length, 1);
});

test('party: loss of verified room owner before sheet dismissal never opens native media', async t => {
  const h = await mountCaller(t, surfaces.find(surface => surface.name === 'party'), async () => file);
  await h.open(); const oldSheet = h.runtime.view.sheet;
  await h.update({ verifiedRoomOwner: null });
  await h.act(() => oldSheet.props.onChoose('photos'));
  await h.act(() => oldSheet.props.onDismiss());
  assert.equal(h.runtime.picks.length, 0); assert.equal(h.runtime.view.file, null);
});

test('full chat screen: replacement thread/session cannot receive a late attachment', async t => {
  for (const patch of [{ threadId: 'replacement' }, { sessionGeneration: 'replacement-session' }, { userId: 'replacement-user' }]) {
    const held = deferred(); const h = await mountFullChatThread({ noActiveCall: true, invite: { status: 'ended' }, pickAttachment: () => held.promise });
    t.after(() => h.unmount());
    await h.run(() => { void h.runtime.snapshot.handlePickAttachment(); });
    const sheet = h.runtime.snapshot.mediaPickerSheet; assert.ok(sheet);
    await h.run(() => sheet.props.onChoose('photos')); await h.run(() => sheet.props.onDismiss());
    await h.rerender(patch); await h.run(() => held.resolve(file));
    assert.equal(h.runtime.snapshot.attachmentFile, null);
  }
});

test('full chat screen: validated send retires pending picker before the next draft', async t => {
  const held = deferred(), sends = [];
  const h = await mountFullChatThread({ noActiveCall: true, invite: { status: 'ended' }, pickAttachment: () => held.promise,
    chatApi: { sendChatMessage: async (...args) => { sends.push(args); return { id: 'saved', threadId: 'thread', body: args[1], senderUserId: 'local-user', attachments: [] }; } } });
  t.after(() => h.unmount());
  await h.run(() => h.runtime.snapshot.setDraft('Ready to send'));
  await h.run(() => { void h.runtime.snapshot.handlePickAttachment(); });
  const sheet = h.runtime.snapshot.mediaPickerSheet;
  await h.run(() => sheet.props.onChoose('photos')); await h.run(() => sheet.props.onDismiss());
  await h.run(() => h.runtime.snapshot.handleSend()); assert.equal(sends.length, 1);
  await h.run(() => held.resolve(file)); assert.equal(h.runtime.snapshot.attachmentFile, null);
});

test('full chat screen: same-session refresh renews bearer but saved-parent failure never restores attachment for duplicate retry', async t => {
  const sends = [];
  const h = await mountFullChatThread({ noActiveCall: true, invite: { status: 'ended' }, pickAttachment: async () => file,
    chatApi: { sendChatMessage: async (...args) => { sends.push(args); const error = Error('Your message was saved; refresh before retrying.'); error.name = 'AttachmentParentSavedError'; throw error; } } });
  t.after(() => h.unmount());
  await h.run(() => { void h.runtime.snapshot.handlePickAttachment(); });
  const sheet = h.runtime.snapshot.mediaPickerSheet;
  await h.run(() => sheet.props.onChoose('photos')); await h.run(() => sheet.props.onDismiss());
  assert.equal(h.runtime.snapshot.attachmentFile, file);
  await h.rerender({ accessToken: 'refreshed-same-session-token' });
  assert.equal(h.runtime.snapshot.attachmentFile, file);
  await h.run(() => h.runtime.snapshot.setDraft('One parent only'));
  await h.run(() => h.runtime.snapshot.handleSend());
  assert.equal(sends[0][3].mutationSubject.accessToken, 'refreshed-same-session-token');
  assert.equal(h.runtime.snapshot.attachmentFile, null); assert.equal(h.runtime.snapshot.draft, '');
  await h.run(() => h.runtime.snapshot.handleSend()); assert.equal(sends.length, 1);
});
