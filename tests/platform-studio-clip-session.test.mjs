import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, video, edit, deferred, React } from './platform-studio-mounted-harness.mjs';

// Real screen and account-keyed root; only IO/native hosts are synthetic.
// These tests make no provider, account or database requests.
async function fixture(t, stage, target = 'draft') {
  const gate = deferred(), trace = [];
  let armed = false, blocked = false, stored = video('A', 'draft'), savedEdit = edit('A');
  const boundary = async name => {
    if (!armed) return;
    trace.push(name);
    if (name === stage && !blocked) { blocked = true; await gate.promise; }
  };
  const h = await mount(t, { videos: [stored], overrides: {
    getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'fixture:cover', name: 'cover.jpg', mimeType: 'image/jpeg', size: 100 }] }),
    readClipStudioEdit: async () => { await boundary('edit-read'); return savedEdit; },
    updateCreatorVideoMetadata: async (_id, patch) => { await boundary('video-write'); stored = { ...stored, ...patch }; return stored; },
    uploadClipStudioCoverImage: async () => { await boundary('cover-write'); stored = { ...stored, thumbStoragePath: 'new-cover' }; return { storagePath: 'new-cover', mimeType: 'image/jpeg', fileSizeBytes: 100, signedUrl: 'fixture:cover' }; },
    saveClipStudioEdit: async (_id, patch) => { await boundary('edit-write'); savedEdit = { ...patch }; return savedEdit; },
    readCreatorVideoForOwner: async () => { await boundary('owner-read'); return stored; },
    readCreatorVideoForPlayer: async () => { await boundary('player-read'); return { playbackUrl: 'fixture:video' }; },
    readCreatorVideos: async () => { await boundary('library-read'); return [stored]; },
  } });
  await h.press(h.button('Open actions for Title A'));
  await h.press(h.button('Edit details'));
  await h.change(h.input('Title text'), 'Initiating session edit');
  if (stage === 'cover-write') {
    await h.press(h.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel?.includes('Cover Image')));
    await h.press(h.button('Change Cover') ?? h.button('Choose Cover Image'));
    const saveSection = h.button('Save. Confirm details and save the draft.');
    if (!saveSection.props.accessibilityState.expanded) await h.press(saveSection);
  }
  const button = h.button(target === 'public' ? 'Publish Clip' : 'Save Draft');
  assert.ok(button, h.text());
  return { h, gate, trace, button, start: async () => { armed = true; await h.press(button); assert.ok(blocked, `reached ${stage}: ${h.text()}`); } };
}

async function replace(h, id = 'owner') {
  await h.account({ user: { id, email: 'replacement@example.test' }, isSignedIn: true, isLoading: false,
    authority: { userId: id, accountId: id, sessionGeneration: 'replacement', state: 'ACTIVE', restoreOnly: false }, authorityStatus: 'active' });
}

for (const target of ['draft', 'public']) {
  for (const stage of ['video-write', 'cover-write', 'edit-write', 'owner-read', 'edit-read', 'player-read', 'library-read']) {
    test(`Clip ${target} stops after session replacement during ${stage}`, async t => {
      const f = await fixture(t, stage, target);
      await f.start();
      await replace(f.h);
      const before = [...f.trace];
      await f.h.resolve(f.gate);
      assert.deepEqual(f.trace, before, 'retired operation dispatches no next request');
      assert.doesNotMatch(f.h.text(), /Clip published and confirmed|Draft saved and confirmed|could not finish cover/);
    });
  }
  for (const replacement of ['other-account', 'unmount']) {
    test(`Clip ${target} stops a pending write after ${replacement}`, async t => {
      const f = await fixture(t, 'video-write', target);
      await f.start();
      if (replacement === 'unmount') await f.h.unmount(); else await replace(f.h, 'other');
      const before = [...f.trace];
      await f.h.resolve(f.gate);
      assert.deepEqual(f.trace, before);
    });
  }
  test(`detached Clip ${target} callback cannot dispatch after root replacement`, async t => {
    const f = await fixture(t, 'video-write', target);
    await replace(f.h);
    const writes = () => f.h.calls.filter(([name]) => ['updateCreatorVideoMetadata', 'uploadCreatorVideo', 'saveClipStudioEdit', 'uploadClipStudioCoverImage'].includes(name));
    const before = writes().length;
    await React.act(async () => f.button.props.onPress());
    assert.equal(writes().length, before);
  });
  test(`Clip ${target} rejected retired write does not begin recovery reads`, async t => {
    const f = await fixture(t, 'video-write', target);
    await f.start(); await replace(f.h);
    const before = [...f.trace];
    await f.h.reject(f.gate, Error('synthetic rejected write'));
    assert.deepEqual(f.trace, before);
  });
}

async function newClip(t, upload) {
  let stored = video('created', 'draft'), savedEdit = edit('created'), source = 0;
  const h = await mount(t, { route: { tab: 'clip' }, videos: [], overrides: {
    isSupportedCreatorVideoFile: () => true,
    getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: `fixture:source-${++source}`, name: 'new.mp4', mimeType: 'video/mp4', size: 100 }] }),
    uploadCreatorVideo: async input => { const result = await upload(input); stored = { ...stored, ...result }; return stored; },
    saveClipStudioEdit: async (_id, patch) => { savedEdit = { ...patch }; return savedEdit; },
    readCreatorVideoForOwner: async () => stored,
    readCreatorVideoForPlayer: async () => ({ playbackUrl: 'fixture:created' }),
    readClipStudioEdit: async () => savedEdit,
    readCreatorVideos: async () => [],
    formatCreatorVideoUiError: error => error.message,
  } });
  const pick = async () => {
    await h.press(h.find(n => n.props.testID === 'clip-studio-choose-full-video-button'));
    await h.press(h.button('Choose from Files'));
  };
  await pick();
  return { h, pick };
}

test('mounted new Clip retry retains exact upload attempt until a confirmed video is returned', async t => {
  const attempts = [], gate = deferred(); let count = 0;
  const { h } = await newClip(t, async input => {
    attempts.push(input.attempt);
    if (++count === 1) { input.attempt.id = 'created'; throw Error('Upload outcome unknown'); }
    await gate.promise;
    return { id: 'created', title: input.title, visibility: input.visibility };
  });
  await h.press(h.button('Save Draft'));
  assert.ok(h.button('Retry Save Draft'));
  assert.doesNotMatch(h.text(), /Draft saved and confirmed/);
  await h.change(h.input('Clip title'), 'New intended title');
  await h.press(h.button('Save Draft'));
  assert.equal(attempts[0], attempts[1]);
  assert.equal(attempts[1].id, 'created');
  await h.resolve(gate);
  assert.match(h.text(), /Draft saved and confirmed/);
  assert.equal(h.input('Clip title').props.value, 'New intended title');
});

test('mounted choosing a different source discards the previous unknown upload attempt', async t => {
  const attempts = [];
  const { h, pick } = await newClip(t, async input => { attempts.push(input.attempt); input.attempt.id = `attempt-${attempts.length}`; throw Error('Upload outcome unknown'); });
  await h.press(h.button('Save Draft'));
  await pick();
  await h.press(h.button('Save Draft'));
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0], attempts[1]);
});

for (const replacement of ['refresh', 'replacement']) {
  test(`mounted new Clip upload ${replacement === 'refresh' ? 'survives same-session token refresh' : 'cannot continue after session replacement'}`, async t => {
    const gate = deferred(); let metadataWrites = 0;
    const { h } = await newClip(t, async () => { await gate.promise; return { id: 'created', title: 'new', visibility: 'draft' }; });
    const original = h.mocks.saveClipStudioEdit;
    h.mocks.saveClipStudioEdit = (...args) => { metadataWrites++; return original(...args); };
    await h.press(h.button('Save Draft'));
    const authority = { userId: 'owner', accountId: 'owner', sessionGeneration: replacement === 'refresh' ? 'first' : 'replacement', state: 'ACTIVE', restoreOnly: false };
    await h.account({ user: { id: 'owner', email: 'refresh@example.test' }, isSignedIn: true, isLoading: false, authority, authorityStatus: 'active' });
    await h.resolve(gate);
    assert.equal(metadataWrites, replacement === 'refresh' ? 1 : 0);
    if (replacement === 'refresh') assert.match(h.text(), /Draft saved and confirmed/);
  });
}
