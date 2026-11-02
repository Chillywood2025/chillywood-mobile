// Production public branding resolver and mounted Platform route. External IO,
// native hosts and the channel identity builder are modeled; not phone proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';
import { mount, ROOT, ts } from './platform-public-mounted-harness.mjs';

const rachi = 'platform_rachi_official';
const fixtureUrl = name => `https://images.example/public-platform-${name}.jpg`;
function clientModule(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, require(name) {
    if (name === './prepareMediaUploadCopy') return clientModule('_lib/prepareMediaUploadCopy.ts', imports);
    assert.ok(name in imports, `Unexpected client dependency: ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(code, context);
  return context.exports;
}
const official = clientModule('_lib/officialAccounts.ts', {});

function environment(mode, { background = false, failAsset = 'avatar' } = {}) {
  const calls = [];
  const state = { mode };
  const profile = {
    owner_user_id: rachi, avatar_asset_id: 'avatar-fixture',
    background_image_asset_id: background ? 'background-fixture' : null,
    theme_preset: 'studio_red', accent_color: '#47ABCD', background_fit_mode: 'fit',
  };
  const row = name => ({
    id: `${name}-fixture`, owner_user_id: rachi,
    asset_type: name === 'background' ? 'background_image' : 'avatar', asset_state: 'published',
    storage_bucket: 'fixture-branding', storage_path: `fixture/${name}.jpg`,
    storage_object_key: `fixture/${name}.jpg`, moderation_status: 'clean', scan_status: 'clean',
    created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z', deleted_at: null,
  });
  const supabase = {
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      assert.equal(name, 'read_public_platform_brand_profile');
      assert.equal(args.profile_user_id, rachi);
      return { async maybeSingle() {
        if (state.mode === 'metadata-error') return { data: null, error: { code: 'FIXTURE_UNAVAILABLE' } };
        if (state.mode === 'missing-profile') return { data: null, error: null };
        return { data: state.mode === 'unselected-avatar' ? { ...profile, avatar_asset_id: null } : profile, error: null };
      } };
    },
    from(table) {
      assert.equal(table, 'platform_brand_assets');
      const query = {
        select() { return query; },
        in(...args) { calls.push(['in', ...args]); return query; },
        eq(...args) { calls.push(['eq', ...args]); return query; },
        is(...args) { calls.push(['is', ...args]); return query; },
        async returns() {
          if (state.mode === 'asset-query-error') return { data: null, error: { code: 'FIXTURE_UNAVAILABLE' } };
          return { data: state.mode === 'filtered-avatar' ? [] : [row('avatar'), ...(background ? [row('background')] : [])], error: null };
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'fixture-branding');
      return { async createSignedUrl(objectPath) {
        const name = objectPath === 'fixture/avatar.jpg' ? 'avatar' : 'background';
        assert.equal(objectPath, `fixture/${name}.jpg`);
        calls.push(['sign', name]);
        if (name === failAsset) {
          if (state.mode === 'sign-rejection') throw new Error('Synthetic signing rejection');
          if (state.mode === 'sign-error') return { data: null, error: { message: 'Synthetic signing error' } };
          if (state.mode === 'sign-no-url') return { data: {}, error: null };
          if (state.mode === 'sign-blank-url') return { data: { signedUrl: '  ' }, error: null };
        }
        return { data: { signedUrl: fixtureUrl(name) }, error: null };
      } };
    } },
  };
  const api = clientModule('_lib/platformBranding.ts', {
    './mediaPickerResources': loadStubbed('_lib/mediaPickerResources.ts'),
    'expo-file-system': {}, 'expo-file-system/legacy': {},
    './supabase': { supabase, SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'synthetic' },
    './accountBoundSupabaseMutation': {}, './accountSessionAuthority': {}, './userFacingErrors': {},
  });
  return { api, calls, state };
}

async function platform(t, e) {
  return mount(t, { route: { userId: rachi }, videos: [], overrides: {
    getOfficialPlatformAccount: official.getOfficialPlatformAccount,
    buildUserChannelProfile: ({ id, profile }) => {
      assert.equal(profile, null);
      return { id, displayName: 'Rachi', handle: '@chillywood.rachi', role: 'creator', identityKind: 'official_platform' };
    },
    readUserProfileByUserId: () => assert.fail('No private Profile fallback allowed'),
    readPublicPlatformBranding: e.api.readPublicPlatformBranding,
  } });
}
const initial = h => h.all().some(n => n.type === 'Text' && n.props.children === 'R');
const image = (h, name = 'avatar') => h.all().some(n => n.type === 'Image' && n.props.source?.uri === fixtureUrl(name));

for (const mode of ['missing-profile', 'unselected-avatar', 'filtered-avatar']) {
  test(`${mode} remains a legitimate public branding fallback`, async t => {
    const e = environment(mode), h = await platform(t, e);
    assert.ok(h.find(n => n.props.testID === 'screen-platform'));
    assert.ok(initial(h)); assert.equal(image(h), false); assert.equal(h.button('Retry'), undefined);
    assert.equal(e.calls.filter(c => c[0] === 'sign').length, 0);
  });
}

test('valid public avatar and background retain public filters, theme and colors', async t => {
  const e = environment('success', { background: true });
  const bundle = await e.api.readPublicPlatformBranding(rachi, { throwOnUnavailable: true });
  assert.equal(bundle.profile.accentColor, '#47ABCD'); assert.equal(bundle.profile.backgroundFitMode, 'fit');
  assert.equal(bundle.avatar.signedUrl, fixtureUrl('avatar'));
  assert.equal(bundle.backgroundImage.signedUrl, fixtureUrl('background'));
  const h = await platform(t, e);
  assert.ok(image(h)); assert.ok(image(h, 'background')); assert.equal(initial(h), false);
  assert.equal(h.find(n => n.props.testID === 'screen-platform').props.style.at(-1).backgroundColor, '#12070C');
  assert.deepEqual(JSON.parse(JSON.stringify(e.calls.filter(c => ['in', 'eq', 'is'].includes(c[0])).slice(0, 5))), [
    ['in', 'id', ['background-fixture', 'avatar-fixture']],
    ['eq', 'asset_state', 'published'], ['in', 'moderation_status', ['clean', 'reported']],
    ['in', 'scan_status', ['clean']], ['is', 'deleted_at', null],
  ]);
});

for (const mode of ['sign-error', 'sign-no-url', 'sign-blank-url', 'metadata-error', 'asset-query-error', 'sign-rejection']) {
  test(`${mode} is an explicit strict-read failure and mounted Retry recovers`, async t => {
    const e = environment(mode);
    await assert.rejects(e.api.readPublicPlatformBranding(rachi, { throwOnUnavailable: true }), /could not be loaded|Synthetic signing rejection/);
    const h = await platform(t, e);
    assert.match(h.text(), /Platform could not load/); assert.equal(initial(h), false);
    assert.equal(image(h), false); assert.ok(h.button('Retry'));
    const readsBeforeRetry = e.calls.filter(c => c[0] === 'rpc').length;
    e.state.mode = 'success'; await h.press(h.button('Retry'));
    assert.equal(e.calls.filter(c => c[0] === 'rpc').length, readsBeforeRetry + 1);
    assert.ok(image(h)); assert.equal(initial(h), false); assert.equal(h.button('Retry'), undefined);
  });
}

test('a selected background URL failure cannot silently disappear behind a working avatar', async t => {
  const e = environment('sign-error', { background: true, failAsset: 'background' });
  const h = await platform(t, e);
  assert.match(h.text(), /Platform could not load/); assert.equal(image(h), false); assert.ok(h.button('Retry'));
  e.state.mode = 'success'; await h.press(h.button('Retry'));
  assert.ok(image(h)); assert.ok(image(h, 'background'));
});

test('failed URL refresh clears former artwork and retries a fresh public read', async t => {
  const e = environment('success'), h = await platform(t, e);
  assert.ok(image(h)); e.state.mode = 'sign-error'; await h.focus(false); await h.focus(true);
  assert.match(h.text(), /Platform could not load/); assert.equal(image(h), false); assert.equal(initial(h), false);
  e.state.mode = 'success'; await h.press(h.button('Retry')); assert.ok(image(h));
});

for (const options of [undefined, { throwOnUnavailable: false }]) {
  test(`non-strict public URL fallback is unchanged with options ${JSON.stringify(options)}`, async () => {
    for (const mode of ['sign-error', 'sign-no-url', 'sign-blank-url']) {
      const e = environment(mode), bundle = await e.api.readPublicPlatformBranding(rachi, options);
      assert.equal(bundle.avatar.id, 'avatar-fixture');
      assert.equal(bundle.avatar.signedUrl, mode === 'sign-blank-url' ? '  ' : '');
    }
  });
}
