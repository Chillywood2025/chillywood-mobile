import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, deferred, React } from './platform-studio-mounted-harness.mjs';

// Actual Studio + shared hook/sheet + native adapter. OS picker/presentation and
// network are controlled test boundaries, not installed-device evidence.
const videoResult = name => ({ canceled: false, assets: [{ uri: `file:///${name}.mp4`, fileName: `${name}.mp4`, mimeType: 'video/mp4', fileSize: 100 }] });
const selected = (h, source) => h.find(n => n.props.testID === `media-source-${source}`);
const nativeCalls = h => h.calls.filter(([name]) => name === 'launchImageLibraryAsync');
async function chooseVideo(h) { await h.press(h.find(n => n.props.testID === 'clip-studio-choose-full-video-button')); }
async function replaceAccount(h, id = 'owner') {
  await h.account({ user: { id }, isSignedIn: true, isLoading: false, authorityStatus: 'active',
    authority: { userId: id, accountId: id, sessionGeneration: 'replacement', state: 'ACTIVE', restoreOnly: false } });
}

test('mounted Studio has one video entry; selection waits for a shared source and cancellation keeps the previous file', async t => {
  const h = await mount(t, { route: { tab: 'clip' }, overrides: { launchImageLibraryAsync: async () => videoResult('selected') } });
  assert.equal(selected(h, 'photos'), undefined);
  await chooseVideo(h); assert.equal(nativeCalls(h).length, 0);
  assert.ok(selected(h, 'photos')); assert.ok(selected(h, 'files')); assert.equal(selected(h, 'camera'), undefined);
  await h.press(selected(h, 'photos')); assert.equal(nativeCalls(h).length, 1);
  assert.match(h.text(), /selected\.mp4/);
  await chooseVideo(h); await h.press(h.find(n => n.props.testID === 'media-source-cancel'));
  assert.equal(nativeCalls(h).length, 1); assert.match(h.text(), /selected\.mp4/);
  h.mocks.launchImageLibraryAsync = async () => ({ canceled: true });
  await chooseVideo(h); await h.press(selected(h, 'photos'));
  assert.match(h.text(), /selected\.mp4/); assert.match(h.text(), /previous selection is unchanged/);
});

test('mounted Studio double-tap does not open overlapping native video requests', async t => {
  const pending = deferred();
  const h = await mount(t, { route: { tab: 'clip' }, overrides: { launchImageLibraryAsync: () => pending.promise } });
  const entry = h.find(n => n.props.testID === 'clip-studio-choose-full-video-button');
  await h.press(entry); await h.press(entry); await h.press(selected(h, 'photos')); await h.press(entry);
  assert.equal(nativeCalls(h).length, 1); assert.equal(selected(h, 'photos'), undefined);
  await h.resolve(pending, videoResult('once')); assert.match(h.text(), /once\.mp4/);
});

for (const outcome of ['result', 'error']) for (const retirement of ['same-user session', 'account', 'target', 'unmount']) {
  test(`mounted Studio ignores picker ${outcome} after ${retirement} replacement`, async t => {
    const pending = deferred();
    const h = await mount(t, { route: { tab: 'clip' }, overrides: { launchImageLibraryAsync: () => pending.promise } });
    await chooseVideo(h); await h.press(selected(h, 'photos'));
    if (retirement === 'same-user session') await replaceAccount(h);
    if (retirement === 'account') await replaceAccount(h, 'other');
    if (retirement === 'target') await h.press(h.button('Content'));
    if (retirement === 'unmount') await h.unmount();
    if (outcome === 'result') await h.resolve(pending, videoResult('retired'));
    else await h.reject(pending, Error('private native failure'));
    assert.doesNotMatch(h.text(), /retired\.mp4|Unable to open the video picker|private native failure/);
    assert.equal(h.calls.filter(([name]) => name === 'uploadCreatorVideo').length, 0);
  });
}

test('mounted iOS source sheet waits for actual dismissal before opening the native picker', async t => {
  const h = await mount(t, { platform: 'ios', route: { tab: 'clip' }, overrides: { launchImageLibraryAsync: async () => videoResult('ios') } });
  await chooseVideo(h); await h.press(selected(h, 'photos'));
  assert.equal(nativeCalls(h).length, 0, 'hiding JSX does not mean native dismissal completed');
  const sheet = h.find(n => n.type === 'Modal' && n.props.presentationStyle === 'overFullScreen');
  await h.dismiss(sheet); assert.equal(nativeCalls(h).length, 1); assert.match(h.text(), /ios\.mp4/);
});

test('mounted iOS Brand parent dismisses before the shared sheet, which dismisses before native import', async t => {
  const profile = { ownerUserId: 'owner', themePreset: 'city_night', accentColor: '#DC143C', heroFitMode: 'fill',
    backgroundFitMode: 'fill', heroFocalX: 0.5, heroFocalY: 0.5, heroCropScale: 1, overlayStrength: 0.62, blurStrength: 0 };
  const h = await mount(t, { platform: 'ios', route: { tab: 'brand', focus: 'hero' }, overrides: {
    readPlatformBrandStudio: async () => ({ profile, assets: [], heroImage: null }),
    launchImageLibraryAsync: async () => ({ canceled: true }),
  } });
  await h.press(h.button('Choose Brand Studio Hero Image'));
  assert.equal(selected(h, 'photos'), undefined); assert.equal(nativeCalls(h).length, 0);
  await h.dismiss(h.find(n => n.props.testID === 'brand-editor-sheet-background'));
  assert.equal(selected(h, 'photos'), undefined, 'another native modal dismissal cannot release this parent');
  await h.dismiss(h.find(n => n.props.testID === 'brand-editor-sheet-hero'));
  assert.ok(selected(h, 'photos')); assert.equal(nativeCalls(h).length, 0);
  await h.press(selected(h, 'photos')); assert.equal(nativeCalls(h).length, 0);
  await h.dismiss(h.find(n => n.type === 'Modal' && n.props.presentationStyle === 'overFullScreen'));
  assert.equal(nativeCalls(h).length, 1); assert.match(h.text(), /No Platform media selected/);
});

test('detached Studio picker callback cannot open after account replacement', async t => {
  const h = await mount(t, { route: { tab: 'clip' } });
  const entry = h.find(n => n.props.testID === 'clip-studio-choose-full-video-button');
  await replaceAccount(h); await React.act(async () => entry.props.onPress());
  assert.equal(selected(h, 'photos'), undefined); assert.equal(nativeCalls(h).length, 0);
});
