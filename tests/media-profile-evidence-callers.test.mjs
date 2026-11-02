import assert from 'node:assert/strict';
import { loadPickedMediaResources } from './helpers/picked-media-resources-host.mjs';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const noop = () => {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function callbacks(file, names, context) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const selected = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
      const value = ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useCallback'
        ? node.initializer.arguments[0] : node.initializer;
      selected.set(node.name.getText(ast), value.getText(ast));
    }
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.getText(ast))) {
      selected.set(node.name.getText(ast), node.getText(ast).replace(/^export\s+/, ''));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(selected.size, names.length);
  const script = [...selected].map(([name, value]) => `const ${name} = ${value};`).join('\n') + `\nObject.assign(exports,{${names.join(',')}});`;
  const sandbox = { exports: {}, ...loadPickedMediaResources(), ...context };
  vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
  return { api: sandbox.exports, context: sandbox };
}

for (const file of ['app/copyright-report.tsx', 'app/counter-notice.tsx']) {
  test(`${file} a new render cannot submit evidence retained from an older scope before effects clear it`, async () => {
    let captures = 0;
    const scope = { pending: false, revision: 0 }, method = file.includes('copyright') ? 'submitNotice' : 'submitCounterNotice';
    const { api } = callbacks(file, [method], {
      busy: false, evidenceScope: scope, currentEvidenceScope: () => true,
      user: { id: 'new-owner' }, caseId: 'new-case', caseRecord: { id: 'new-case' },
      attachments: [{ uri: 'file:previous-owner.png' }], evidenceSelectionOwner: { current: {} },
      captureDmcaAttachmentMutationSubject: async () => { captures++; throw new Error('stale evidence must not reach capture'); },
    });
    await api[method](); assert.equal(captures, 0); assert.equal(scope.pending, false);
  });
  for (const outcome of ['selected', 'cancelled', 'denied', 'account', 'session', 'target', 'unmounted', 'removed', 'stale error']) {
    test(`${file} evidence selection: ${outcome}`, async () => {
      const held = deferred(), original = { name: 'old.pdf', uri: 'file:old.pdf' };
      let files = [original], picks = 0, alerts = 0;
      const scope = { pending: false, revision: 0 }, mounted = { current: true };
      const authority = { userId: 'A', sessionGeneration: 'one' };
      let session = authority;
      const { api, context } = callbacks(file, ['currentEvidenceScope', 'pickAttachments'], {
        busy: false, evidenceScope: scope, evidenceScopeRef: { current: scope }, evidencePicking: { current: false },
        evidenceSelectionOwner: { current: scope },
        mounted, authority, user: { id: 'A' }, attachments: files,
        getCurrentAccountSessionAuthoritySnapshot: () => session,
        sameAccountSessionAuthority: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        pickMedia: ({ pick, isCurrent, allowUnauthenticated, multiple }) => {
          assert.equal(isCurrent(), true);
          assert.equal(multiple, true);
          assert.equal(allowUnauthenticated, file.includes('copyright') ? true : undefined);
          return pick('files', 'picker-operation');
        },
        pickDeviceAttachments: (_source, options) => {
          picks++; assert.equal(options.multiple, true); assert.equal(options.selectionLimit, 5);
          assert.equal(options.operation, 'picker-operation');
          assert.deepEqual([...options.mimeTypes], ['image/png', 'application/pdf']); return held.promise;
        },
        DMCA_ATTACHMENT_ALLOWED_MIME_TYPES: ['image/png', 'application/pdf'],
        validateDmcaAttachmentFile: input => { assert.ok(input.sizeBytes > 0); },
        setAttachments: updater => { files = typeof updater === 'function' ? updater(files) : updater; },
        getUserFacingErrorMessage: error => error.message, Alert: { alert: () => alerts++ },
      });
      const first = api.pickAttachments(); await api.pickAttachments(); assert.equal(picks, 1);
      if (outcome === 'account' || outcome === 'stale error') session = { userId: 'B', sessionGeneration: 'one' };
      if (outcome === 'session') session = { userId: 'A', sessionGeneration: 'two' };
      if (outcome === 'target') context.evidenceScopeRef.current = { ...scope };
      if (outcome === 'unmounted') mounted.current = false;
      if (outcome === 'removed') scope.revision++;
      if (outcome === 'denied' || outcome === 'stale error') held.reject(new Error('Permission denied'));
      else held.resolve(outcome === 'cancelled' ? null : [{ uri: 'file:new.png', name: 'new.png', mimeType: 'image/png', size: 10 }]);
      await first;
      assert.equal(files.length, outcome === 'selected' ? 2 : 1);
      assert.equal(files[0], original); assert.equal(alerts, outcome === 'denied' ? 1 : 0);
      assert.equal(context.evidencePicking.current, false);
    });
  }
  for (const outcome of ['current', 'retired', 'upload failed']) test(`${file} evidence keeps one submission subject and checks local read: ${outcome}`, async () => {
    const held = deferred(), scope = { pending: false, revision: 0 };
    const subject = { authority: { userId: 'A', sessionGeneration: 'one' } };
    let current = true, uploads = 0, notices = 0, submits = 0;
    const messages = [];
    const callback = file.includes('copyright') ? 'submitNotice' : 'submitCounterNotice';
    const context = {
      busy: false, evidenceScope: scope, currentEvidenceScope: () => current, cancelMediaPicker: noop,
      evidenceSelectionOwner: { current: scope },
      user: { id: 'A' }, caseId: 'case-A', caseRecord: { id: 'case-A' },
      attachments: [{ uri: 'file:evidence.pdf', name: 'evidence.pdf', type: 'application/pdf', size: 10 }],
      setBusy: noop, setNotice: () => notices++, setSubmittedCaseNumber: noop, setSubmittedAttachmentCount: noop, setSubmittedCounterNoticeId: noop,
      LEGAL_SUPPORT_EMAIL: 'legal@example.invalid',
      captureDmcaAttachmentMutationSubject: async () => subject,
      submitDmcaNotice: async (_input, options) => { assert.equal(options.mutationSubject, subject); assert.equal(options.isCurrent(), true); submits++; return { id: 'case-A', attachmentToken: 'fixture-token', caseNumber: '1' }; },
      submitUploaderDmcaCounterNotice: async (_input, options) => { assert.equal(options.mutationSubject, subject); assert.equal(options.isCurrent(), true); submits++; return { id: 'counter-A' }; },
      fetch: async () => ({ arrayBuffer: () => held.promise }),
      uploadDmcaPublicNoticeAttachment: async input => { assert.equal(input.mutationSubject, subject); assert.equal(input.isCurrent(), true); uploads++; if (outcome === 'upload failed') throw new Error('Upload response was lost.'); },
      uploadDmcaCounterNoticeAttachment: async input => { assert.equal(input.mutationSubject, subject); assert.equal(input.isCurrent(), true); uploads++; if (outcome === 'upload failed') throw new Error('Upload response was lost.'); },
      getUserFacingErrorMessage: error => error.message, Alert: { alert: (...args) => { notices++; messages.push(args); } },
      loadCase: noop, setAttachments: noop,
    };
    for (const key of ['reporterName', 'reporterCompany', 'reporterEmail', 'reporterPhone', 'reporterAddress', 'authorizedAgentName', 'copyrightOwnerName', 'copyrightedWorkDescription', 'infringingMaterialDescription', 'contentType', 'contentId', 'contentUrl', 'electronicSignature', 'signature', 'statement', 'contentLocation', 'submitterAddress', 'submitterEmail', 'submitterName', 'submitterPhone']) context[key] = 'fixture';
    for (const key of ['reporterIsOwner', 'goodFaithStatement', 'accuracyStatement', 'goodFaithMistake', 'jurisdictionConsent', 'serviceAcceptance']) context[key] = true;
    context.workUrls = [];
    const { api } = callbacks(file, [callback], context);
    const pending = api[callback](); await api[callback]();
    await new Promise(resolve => setImmediate(resolve)); assert.equal(submits, 1);
    const initialNotices = notices; current = outcome !== 'retired'; held.resolve(new ArrayBuffer(10)); await pending;
    assert.equal(uploads, outcome === 'retired' ? 0 : 1);
    if (outcome === 'retired') assert.equal(notices, initialNotices);
    if (outcome === 'upload failed') {
      assert.ok(messages.some(([title]) => /recorded/.test(title)));
      assert.ok(messages.some(([, body]) => /Do not resubmit/.test(body)));
      assert.equal(messages.some(([title]) => /not submitted/.test(title)), false);
      await api[callback](); assert.equal(submits, 1); assert.equal(uploads, 1);
    }
    assert.equal(scope.pending, false);
  });
}

for (const file of ['app/profile/[userId].tsx', 'app/settings.tsx']) {
  test(`${file} cancelling choose-different restores the previous staged image without upload`, async () => {
    const authority = { userId: 'A', sessionGeneration: 'one' }, scope = { revision: 0 };
    const review = { kind: 'avatar', file: { uri: 'file:previous.png' }, fitMode: 'fit', authority, isCurrent: () => true };
    let restored;
    const { api } = callbacks(file, ['onChooseProfileMedia'], {
      isSelfProfile: true, userId: 'A', authority, profileMediaReview: review, profileAppearanceBusy: null,
      profileGalleryPending: { current: false }, profileGalleryMounted: { current: true }, mountedRef: { current: true },
      focused: true, mediaRemovalScope: scope, mediaRemovalScopeRef: { current: scope }, isSocialIdentityCurrent: () => true,
      getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => a === b,
      setProfilePhotoSheetVisible: noop, setProfileBackgroundSheetVisible: noop, setProfileAppearanceSheetKind: noop,
      pickMedia: async () => null, setProfileMediaReview: value => { restored = value; },
    });
    await api.onChooseProfileMedia('avatar', review); assert.equal(restored, review);
  });
  test(`${file} explicit save uses selection owner and ignores a retired review`, async () => {
    let current = true, uploads = 0, acknowledgements = 0;
    const held = deferred();
    const review = { kind: 'avatar', file: { uri: 'file:old.png' }, fitMode: 'fit', authority: { userId: 'A', sessionGeneration: 'one' }, isCurrent: () => current };
    const { api } = callbacks(file, ['onSaveProfileMediaReview'], {
      isSelfProfile: true, profileMediaReview: review, profileAppearanceBusy: null, profileSavePending: { current: false },
      setProfileAppearanceBusy: noop,
      uploadProfileMedia: (kind, selected, options) => { uploads++; assert.equal(kind, 'avatar'); assert.equal(selected, review.file); assert.equal(options.owner.authority, review.authority); assert.equal(options.owner.isCurrent, review.isCurrent); return held.promise; },
      setMyProfile: () => acknowledgements++, setChannelAccessProfile: () => acknowledgements++, setProfileMediaReview: () => acknowledgements++,
      Alert: { alert: () => acknowledgements++ }, getUserFacingErrorMessage: error => error.message,
    });
    const saving = api.onSaveProfileMediaReview(); await api.onSaveProfileMediaReview(); assert.equal(uploads, 1);
    current = false; held.resolve({ userId: 'A' }); await saving;
    assert.equal(acknowledgements, 0); await api.onSaveProfileMediaReview(); assert.equal(uploads, 1);
  });
}

for (const outcome of ['selected', 'cancelled', 'account', 'session', 'permission', 'unmounted', 'stale error']) {
  test(`official Rachi shared picker caller: ${outcome}`, async () => {
    const held = deferred(), authority = { userId: 'owner', sessionGeneration: 'one' };
    let current = authority, picks = 0, saved = 0, notices = [];
    const mounted = { current: true }, key = { current: 'operator-A' };
    const { api } = callbacks('app/admin.tsx', ['submitRachiProfileImage'], {
      canAccessContentProgramming: true, rachiProfileImageBusy: false, rachiMediaPending: { current: false },
      rachiMediaMounted: mounted, adminReadAuthorityKey: 'operator-A', inspectionEntryAuthorityRef: key,
      getCurrentAccountSessionAuthoritySnapshot: () => current, sameAccountSessionAuthority: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      setRachiProfileImageBusy: noop, setRachiNotice: value => notices.push(value), rachiProfileImageSavedUrl: 'https://fixture/old',
      pickRachiMedia: ({ pick }) => pick('files', 'picker-operation'), chooseOfficialRachiProfileImageFromGallery: input => { picks++; assert.equal(input.operation, 'picker-operation'); assert.equal(input.source, 'files'); assert.equal(input.authority, authority); assert.equal(input.isCurrent(), true); return held.promise; },
      setRachiProfileImageSavedUrl: () => saved++, formatAdminOperationFailure: error => error.message,
    });
    const pending = api.submitRachiProfileImage(); await api.submitRachiProfileImage(); assert.equal(picks, 1);
    if (outcome === 'account' || outcome === 'stale error') current = { userId: 'other', sessionGeneration: 'one' };
    if (outcome === 'session') current = { userId: 'owner', sessionGeneration: 'two' };
    if (outcome === 'permission') key.current = 'unauthorized';
    if (outcome === 'unmounted') mounted.current = false;
    const priorNotices = notices.length;
    if (outcome === 'stale error') held.reject(new Error('private provider failure'));
    else held.resolve(outcome === 'cancelled' ? null : { avatarUrl: 'https://fixture/new' });
    await pending;
    assert.equal(saved, outcome === 'selected' ? 1 : 0);
    if (!['selected', 'cancelled'].includes(outcome)) assert.equal(notices.length, priorNotices);
  });
}

for (const outcome of ['current', 'account', 'session', 'target', 'cancelled']) {
  test(`official Rachi helper keeps picker authority before upload: ${outcome}`, async () => {
    const authority = { userId: 'operator', sessionGeneration: 'one' }, held = deferred();
    let current = authority, targetCurrent = true, captures = 0, uploads = 0;
    const { api } = callbacks('_lib/officialRachi.ts', ['chooseOfficialRachiProfileImageFromGallery'], {
      getCurrentAccountSessionAuthoritySnapshot: () => current,
      sameAccountSessionAuthority: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      pickProfileMediaImage: (kind, source, operation) => { assert.equal(operation, 'picker-operation'); assert.equal(kind, 'avatar'); assert.equal(source, 'files'); return held.promise; },
      captureAccountBoundSupabaseMutationSubject: async userId => { captures++; assert.equal(userId, 'operator'); return { authority }; },
      assertAccountBoundSupabaseMutationSubjectCurrent: noop,
      uploadOfficialRachiProfileMedia: async (_subject, _file, isCurrent) => { assert.equal(isCurrent(), true); uploads++; return { publicUrl: 'https://fixture/new' }; },
      updateOfficialRachiProfileImageWithSubject: async () => ({ avatarUrl: 'https://fixture/new' }),
      removeOfficialRachiProfileMediaObject: async () => {},
    });
    const pending = api.chooseOfficialRachiProfileImageFromGallery({ source: 'files', operation: 'picker-operation', authority, isCurrent: () => targetCurrent });
    if (outcome === 'account') current = { userId: 'other', sessionGeneration: 'one' };
    if (outcome === 'session') current = { userId: 'operator', sessionGeneration: 'two' };
    if (outcome === 'target') targetCurrent = false;
    held.resolve(outcome === 'cancelled' ? null : { uri: 'file:picture.png' });
    if (['current', 'cancelled'].includes(outcome)) await pending;
    else await assert.rejects(pending, /account changed/);
    assert.equal(uploads, outcome === 'current' ? 1 : 0); assert.equal(captures, uploads);
  });
}

test('official Rachi upload does not guess JPEG for unknown native metadata', () => {
  const { api } = callbacks('_lib/officialRachi.ts', ['inferImageMimeType'], { toText: value => String(value ?? '').trim() });
  assert.equal(api.inferImageMimeType({ uri: 'content://media/55' }), '');
  assert.equal(api.inferImageMimeType({ uri: 'file:///item.png?token=ignored' }), 'image/png');
  assert.equal(api.inferImageMimeType({ uri: 'file:///item.jpeg' }), 'image/jpeg');
  assert.equal(api.inferImageMimeType({ uri: 'file:///not-an-image.jpg.txt' }), '');
  assert.equal(api.inferImageMimeType({ uri: 'file:///item.jpg', mimeType: 'image/heic' }), 'image/heic');
});

for (const method of ['attachProfilePostFile', 'attachProfilePostCommentFile']) for (const source of ['photos', 'camera', 'files']) {
  test(`profile ${method} forwards ${source} and exact picker operation`, async () => {
    let selected = 0;
    const { api } = callbacks('app/profile/[userId].tsx', [method], {
      isSocialIdentityCurrent: () => true,
      profileAttachmentPending: { current: false }, profileAttachmentRevision: { current: 0 },
      profilePostAttachmentCurrent: { current: null }, profileCommentAttachmentCurrent: { current: new Map() },
      setProfilePostsNotice: noop,
      updateProfilePostUiState: (_id, updater) => { const result = updater({}); if (result.commentAttachmentFile) selected++; },
      setProfilePostAttachmentFile: () => selected++,
      pickMedia: ({ pick }) => pick(source, 'picker-operation'),
      pickSocialAttachmentFile: async (scope, actualSource, operation) => {
        assert.equal(scope, source === 'files' ? 'files' : 'images');
        assert.equal(actualSource, source); assert.equal(operation, 'picker-operation');
        return { uri: 'file:selected.png' };
      },
      getUserFacingErrorMessage: error => { throw error; },
    });
    await api[method]({ id: 'post-A' }); assert.equal(selected, 1);
  });
}

for (const method of ['onSubmitProfilePost', 'onSubmitProfilePostComment']) {
  test(`profile ${method} rejects a retained attachment from an older render owner`, async () => {
    const { api } = callbacks('app/profile/[userId].tsx', [method], {
      isSocialIdentityCurrent: () => true, socialIdentity: 'new-owner:session', currentUserId: 'new-owner',
      profilePostAttachmentFile: { uri: 'file:old-owner.png' }, profilePostAttachmentCurrent: { current: () => false },
      socialActionKeysRef: { current: new Set() }, isProfilePostEngageable: () => true,
      profilePostUiById: { post: { commentAttachmentFile: { uri: 'file:old-owner.png' } } },
      profileCommentAttachmentCurrent: { current: new Map([['post', () => false]]) },
    });
    await api[method]({ id: 'post' });
  });
}
