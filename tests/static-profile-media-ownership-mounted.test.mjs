import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { loadMediaPickerHost } from './helpers/media-picker-host.mjs';

// Mount the production state declarations, picker/save handlers and identity
// retirement effect. Only native selection, presentation and upload IO are
// controlled; cleanup callbacks refer solely to synthetic fixture resources.
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const owner = generation => ({ userId: 'owner', accountId: 'owner', sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });

async function mount(t, path) {
  const runtime = { authority: owner('one'), picked: null, upload: async () => ({}), view: null };
  const media = loadMediaPickerHost({ React, native: { Platform: { OS: 'android' } }, snapshot: () => runtime.authority });
  const source = fs.readFileSync(path, 'utf8'), ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map(); let reset;
  function visit(node) {
    if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(ast), `const ${node.getText(ast)};`);
    if (ts.isExpressionStatement(node) && node.getText(ast).startsWith('useEffect(') && node.getText(ast).includes('setProfileMediaReview(null);')) reset = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(reset);
  const declaration = name => { const found = [...declarations].find(([key]) => key === name || key.startsWith(`[${name},`)); assert.ok(found, name); return found[1]; };
  const names = ['profileMediaReview', 'profileAppearanceBusy', 'profileGalleryPending', 'profileReviewRevision', 'profileSavePending', 'mediaRemovalIdentity', 'mediaRemovalScopeRef', 'mediaRemovalScope', 'onChooseProfileMedia', 'onSaveProfileMediaReview'];
  const profilePosts = path.includes('/profile/');
  if (profilePosts) names.push('profilePostAttachmentFile', 'profilePostUiById', 'profileAttachmentPending', 'updateProfilePostUiState', 'attachProfilePostFile', 'attachProfilePostCommentFile');
  const scopeReset = 'if (mediaRemovalScopeRef.current.identity !== mediaRemovalIdentity) mediaRemovalScopeRef.current = { identity: mediaRemovalIdentity, pending: false, revision: 0 };';
  const context = { exports: {}, ...React, ...media, runtime, noop,
    focused: true, isSelfProfile: true, userId: 'owner', profile: { profileAvatarFitMode: 'fill' }, myProfile: { profileAvatarFitMode: 'fill' },
    getCurrentAccountSessionAuthoritySnapshot: () => runtime.authority,
    sameAccountSessionAuthority: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    pickProfileMediaImage: async () => runtime.picked,
    pickSocialAttachmentFile: async () => runtime.picked,
    uploadProfileMedia: (...args) => runtime.upload(...args), Alert: { alert: noop }, getUserFacingErrorMessage: error => error.message,
    createEmptyProfileSocialFeedExtras: () => ({}), setMyProfile: noop, setChannelAccessProfile: noop, setProfilePostsNotice: noop,
  };
  for (const name of reset.match(/\bset\w+/g) ?? []) if (!['setProfileMediaReview', 'setProfileAppearanceBusy'].includes(name)) context[name] = noop;
  for (const name of ['setProfilePhotoSheetVisible', 'setProfileBackgroundSheetVisible', 'setProfileAppearanceSheetKind']) context[name] = noop;
  const renderSource = `export function Probe() {
    const authority = runtime.authority, socialIdentity = authority.sessionGeneration;
    const identity = useRef(socialIdentity); identity.current = socialIdentity;
    const mountedRef = useRef(true), profileGalleryMounted = mountedRef;
    useEffect(() => () => { mountedRef.current = false; }, []);
    const isSocialIdentityCurrent = () => identity.current === socialIdentity;
    const visibleFeedPostIdsRef = useRef([]), profileAttachmentRevision = useRef(0), profilePostAttachmentCurrent = useRef(null), profileCommentAttachmentCurrent = useRef(new Map());
    const { pickMedia, mediaPickerSheet } = useMediaPicker(socialIdentity);
    ${names.map(name => declaration(name) + (name === 'mediaRemovalScopeRef' ? scopeReset : '')).join('\n')}
    ${reset}
    useLayoutEffect(() => { runtime.view = { choose: onChooseProfileMedia, save: onSaveProfileMediaReview, review: profileMediaReview, sheet: mediaPickerSheet, clear: () => setProfileMediaReview(null), ${profilePosts ? 'attachPost: attachProfilePostFile, attachComment: attachProfilePostCommentFile, postFile: profilePostAttachmentFile, postUi: profilePostUiById,' : ''} }; });
    return null;
  }`;
  vm.runInNewContext(ts.transpileModule(renderSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const root = createRoot(container()), act = fn => React.act(async () => { await fn(); });
  const render = () => act(() => root.render(React.createElement(context.exports.Probe)));
  await render(); t.after(() => act(() => root.unmount()));
  const choose = async () => { await act(() => { void runtime.view.choose('avatar'); }); const sheet = runtime.view.sheet; assert.ok(sheet); await act(() => sheet.props.onChoose('photos')); await act(() => new Promise(resolve => setTimeout(resolve, 5))); };
  const chooseSource = async () => { const sheet = runtime.view.sheet; assert.ok(sheet); await act(() => sheet.props.onChoose('photos')); await act(() => new Promise(resolve => setTimeout(resolve, 5))); };
  return { media, runtime, act, choose, chooseSource, render };
}

test('Profile post and separate comment drafts own only their exact selected files through replacement and context retirement', async t => {
  const h = await mount(t, 'app/profile/[userId].tsx'), files = ['post', 'comment-one', 'comment-two', 'replacement'].map(name => ({ uri: `fixture:${name}.png`, name })), deleted = [];
  files.forEach(file => h.media.ownPickedMedia(file, async () => { deleted.push(file.name); }));
  h.runtime.picked = files[0]; await h.act(() => { void h.runtime.view.attachPost(); }); await h.chooseSource();
  for (const [id, file] of [['one', files[1]], ['two', files[2]], ['one', files[3]]]) {
    h.runtime.picked = file; await h.act(() => { void h.runtime.view.attachComment({ id }); }); await h.chooseSource();
  }
  assert.equal(h.runtime.view.postFile, files[0]); assert.equal(h.runtime.view.postUi.one.commentAttachmentFile, files[3]); assert.equal(h.runtime.view.postUi.two.commentAttachmentFile, files[2]);
  assert.deepEqual(deleted, ['comment-one']);
  h.runtime.authority = owner('two'); await h.render();
  assert.equal(h.runtime.view.postFile, null); assert.deepEqual(Object.keys(h.runtime.view.postUi), []);
  assert.deepEqual(deleted.sort(), files.map(file => file.name).sort());
});

for (const path of ['app/settings.tsx', 'app/profile/[userId].tsx']) {
  test(`${path}: disposed queued review actions cannot leave picker/save latches locked`, async t => {
    const h = await mount(t, path), first = { uri: 'fixture:retired-review.jpg' }, second = { uri: 'fixture:next-review.jpg' }; let saves = 0;
    h.media.ownPickedMedia(first, async () => {}); h.media.ownPickedMedia(second, async () => {});
    h.runtime.picked = first; h.runtime.upload = async () => { saves++; return {}; }; await h.choose();
    const queuedChoose = h.runtime.view.choose, queuedSave = h.runtime.view.save;
    await h.act(() => h.runtime.view.clear());
    await h.act(() => queuedSave()); await h.act(() => queuedChoose('avatar')); assert.equal(saves, 0);
    h.runtime.picked = second; await h.choose(); assert.equal(h.runtime.view.review.file, second);
    await h.act(() => h.runtime.view.save()); assert.equal(saves, 1);
  });
  for (const outcome of ['cancel', 'error', 'replace']) test(`${path}: hidden review is leased through ${outcome} replacement`, async t => {
    const h = await mount(t, path), first = { uri: 'fixture:first.jpg' }, second = { uri: 'fixture:second.jpg' };
    let firstDeleted = 0, secondDeleted = 0;
    h.media.ownPickedMedia(first, async () => { firstDeleted++; }); h.media.ownPickedMedia(second, async () => { secondDeleted++; });
    h.runtime.picked = first; await h.choose(); assert.equal(h.runtime.view.review.file, first); assert.equal(firstDeleted, 0);
    const pending = deferred(); h.runtime.picked = pending.promise;
    await h.choose(); assert.equal(h.runtime.view.review, null); assert.equal(firstDeleted, 0, 'hidden review is still needed for cancel/error recovery');
    await h.act(() => outcome === 'error' ? pending.reject(Error('picker unavailable')) : pending.resolve(outcome === 'cancel' ? null : second));
    assert.equal(h.runtime.view.review.file, outcome === 'replace' ? second : first);
    assert.equal(firstDeleted, outcome === 'replace' ? 1 : 0); assert.equal(secondDeleted, 0);
    await h.act(() => h.runtime.view.clear()); assert.equal(outcome === 'replace' ? secondDeleted : firstDeleted, 1);
  });
  test(`${path}: failed save retains the review for explicit retry`, async t => {
    const h = await mount(t, path), file = { uri: 'fixture:retry.jpg' }; let deleted = 0, saves = 0;
    h.media.ownPickedMedia(file, async () => { deleted++; }); h.runtime.picked = file; await h.choose();
    h.runtime.upload = async (_kind, submitted) => { assert.equal(submitted, file); if (++saves === 1) throw Error('save failed'); return {}; };
    await h.act(() => h.runtime.view.save()); assert.equal(h.runtime.view.review.file, file); assert.equal(deleted, 0);
    await h.act(() => h.runtime.view.save()); assert.equal(saves, 2); assert.equal(h.runtime.view.review, null); assert.equal(deleted, 1);
  });
  test(`${path}: context retirement cannot delete a timed-out but still-reading native source`, async t => {
    const h = await mount(t, path), file = { uri: 'fixture:pending-native.jpg' }, native = deferred(); let deleted = 0;
    h.media.ownPickedMedia(file, async () => { deleted++; }); h.runtime.picked = file; await h.choose();
    h.runtime.upload = async () => { void h.media.withPickedMediaRead(file.uri, () => native.promise); throw Error('timeout is not native completion'); };
    await h.act(() => h.runtime.view.save()); assert.equal(deleted, 0);
    h.runtime.authority = owner('two'); await h.render(); assert.equal(h.runtime.view.review, null); assert.equal(deleted, 0);
    await h.act(() => native.resolve()); assert.equal(deleted, 1);
  });
}
