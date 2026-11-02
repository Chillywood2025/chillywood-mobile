import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

// Actual AST-selected screen callback in a real React lifecycle host, wired to
// complete production media/mutation/authority modules. Native Alert, auth and
// row/storage transports are fixtures, not installed-device or backend proof.
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const owner = (userId = 'a', sessionGeneration = 'one', restoreOnly = false) => ({ userId, accountId: userId, sessionGeneration, restoreOnly, state: 'ACTIVE' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 70; i++) await Promise.resolve(); };
const source = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const declaration = (file, name) => {
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let result;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast); ts.forEachChild(node, visit); };
  visit(ast); assert.ok(result, `${file}:${name}`); return result;
};
const load = (text, mocks = {}, globals = {}) => {
  const context = { exports: {}, console, setTimeout, clearTimeout, ...globals, require(name) {
    if (name === './prepareMediaUploadCopy') return load(source('_lib/prepareMediaUploadCopy.ts'), mocks);
    assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; } };
  vm.runInNewContext(ts.transpileModule(text, { fileName: 'module.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context);
  return context.exports;
};

async function mount(t, file, { oldHelper = false, oldCallback = false, noRevision = false } = {}) {
  const state = { authority: owner(), token: 'token-a-1', route: 'a', focused: true, alerts: [], writes: [], removes: [], cache: [], ui: [], busy: [], reads: [], readGate: null, writeGate: null, callback: null };
  const profile = userId => ({ avatarUrl: `https://fixture.invalid/storage/v1/object/public/profile-media/${userId}/avatar/photo.jpg`, profileBackgroundUrl: `https://fixture.invalid/storage/v1/object/public/profile-media/${userId}/background/photo.jpg`, profileAvatarMediaStatus: 'active', profileBackgroundMediaStatus: 'active' });
  const mocks = {
    './mediaPickerResources': loadStubbed('_lib/mediaPickerResources.ts'),
    './deviceImagePicker': {},
    './supabase': { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture', supabase: { auth: { getSession: async () => ({ data: { session: state.authority && { access_token: state.token, user: { id: state.authority.userId } } } }) } } },
    './entitlementAuthority': { withAuthorityReadDeadline: async p => p },
    'react-native': { Platform: { OS: 'web' } },
    './accountBoundSupabaseRpc.mjs': { isAccountBoundSupabaseRpcOutcomeAmbiguous: () => false, invokeAccountBoundSupabaseRpc: async request => {
      assert.equal(request.functionName, 'wave1_session_authority_readback'); return { data: { ...state.authority, authoritative: true }, error: null };
    } },
    '@supabase/supabase-js': { createClient: (_url, _key, options) => {
      const token = options.global.headers.Authorization;
      return { from(table) { assert.equal(table, 'user_profiles'); let patch, userId;
        const q = { update(value) { patch = value; return q; }, eq(key, value) { assert.equal(key, 'user_id'); userId = value; return q; }, select() { return q; }, async maybeSingle() {
          state.writes.push({ token, patch, userId }); if (state.writeGate) await state.writeGate.promise;
          return state.writeError ? { data: null, error: { message: 'fixture write rejected' } } : { data: { user_id: userId }, error: null };
        } }; return q;
      }, storage: { from(bucket) { assert.equal(bucket, 'profile-media'); return { remove: async keys => { state.removes.push({ token, keys }); return { error: null }; } }; } } };
    } },
    'expo-file-system': {}, 'expo-file-system/legacy': {}, './imageUploadNormalization': {}, './logger': { reportRuntimeError: noop },
    './deviceImagePicker': { pickDeviceImage: async () => { throw new Error('Removal must not launch a picker.'); } },
    './userData': { USER_PROFILES_TABLE: 'user_profiles', normalizeProfileMediaStatus: value => value,
      normalizeUserProfile: value => value, normalizeProfileAppearanceFitMode: value => value, normalizeProfileAppearanceNumber: value => value,
      readUserProfile: async userId => { state.reads.push(userId); if (state.readGate) await state.readGate.promise; return profile(userId); },
      cacheAcknowledgedUserProfile: async (patch, authority) => { state.cache.push(authority); return { ...profile(authority.userId), ...patch }; },
    },
  };
  const authority = mocks['./accountSessionAuthority'] = load(source('_lib/accountSessionAuthority.ts'), mocks);
  mocks['./accountBoundSupabaseMutation'] = load(source('_lib/accountBoundSupabaseMutation.ts'), mocks);
  authority.publishAccountSessionAuthoritySnapshot(state.authority);
  let mediaSource = source('_lib/profileMedia.ts');
  if (oldHelper) {
    // Restore the pre-fix capture contract: ignore caller owner and capture the
    // currently published subject, with no route/mount guard inside helper.
    mediaSource = mediaSource.replace('const operation = await captureProfileMediaOperation(owner);', 'const operation = await captureProfileMediaOperation();')
      .replace('  if (!owner) throw new Error("The Profile action requires its initiating account.");', '');
  }
  const media = load(mediaSource, mocks);
  let screen = source(file);
  if (noRevision) {
    assert.equal(screen.split('mediaRemovalScope.revision += 1;').length, 2);
    screen = screen.replace('mediaRemovalScope.revision += 1;', 'mediaRemovalScope.revision += 0;');
  }
  const scopeStart = screen.indexOf('  const mediaRemovalIdentity =');
  const scopeEnd = screen.indexOf('  const mediaRemovalScope = mediaRemovalScopeRef.current;', scopeStart)
    + '  const mediaRemovalScope = mediaRemovalScopeRef.current;'.length;
  assert.ok(scopeStart > 0 && scopeEnd > scopeStart);
  const cleanupStart = screen.indexOf('  useEffect(() => () => {', scopeEnd);
  const cleanupEnd = screen.indexOf('  }), [authority, mediaRemovalScope]);', cleanupStart) + '  }), [authority, mediaRemovalScope]);'.length;
  assert.ok(cleanupStart > scopeEnd && cleanupEnd > cleanupStart);
  const createScope = load(`export const createScope = (authority, focused, socialIdentity, useRef, useEffect, setProfileAppearanceBusy, subscribeToAccountSessionAuthority, sameAccountSessionAuthority, mountedRef, profileGalleryMounted) => {
    ${screen.slice(scopeStart, scopeEnd)}
    ${screen.slice(cleanupStart, cleanupEnd)}
    return { scopeRef: mediaRemovalScopeRef, scope: mediaRemovalScope };
  };`).createScope;
  let callback = declaration(file, 'onRemoveProfileMedia');
  if (oldCallback) {
    // Exact removed guards/arguments are the pre-fix Alert callback behavior.
    const start = callback.indexOf('    const removalAuthority =');
    const end = callback.indexOf('    let consumed = false;', start) + '    let consumed = false;'.length;
    assert.ok(start > 0 && end > start); callback = callback.slice(0, start) + callback.slice(end);
    callback = callback.replace(', onPress: () => { consumed = true; }', '')
      .replace('if (isCurrent()) {\n                  mediaRemovalScope.pending = false;\n                  setProfileAppearanceBusy(null);\n                } else if (mediaRemovalScope.revision !== removalRevision) {\n                  // Authority retirement already cleared this operation\'s UI.\n                  mediaRemovalScope.pending = false;\n                }', 'setProfileAppearanceBusy(null);')
      .replace('if (isCurrent()) {\n                  mediaRemovalScope.pending = false;\n                  setProfileAppearanceBusy(null);\n                }', 'setProfileAppearanceBusy(null);')
      .replace(/            if \(consumed \|\| (?:mediaRemovalScope.pending \|\| )?!isCurrent\(\)\) return;\n            consumed = true;\n/, '')
      .replaceAll('              mediaRemovalScope.pending = true;\n', '')
      .replaceAll('                mediaRemovalScope.pending = false;\n', '')
      .replace('removeProfileMedia(kind, { authority: removalAuthority, isCurrent })', 'removeProfileMedia(kind)')
      .replaceAll('                if (!isCurrent()) return;\n', '')
      .replace('if (isCurrent()) setProfileAppearanceBusy(null)', 'setProfileAppearanceBusy(null)');
  }
  const compiled = load(`export const create = (context) => { const { useCallback, focused, authority, userId, isSelfProfile, activeProfilePhotoUrl, activeProfileBackgroundUrl, visibleProfileAvatarUrl, visibleProfileBackgroundUrl, profileAppearanceBusy, currentAccountAction, profileGalleryMounted, mediaRemovalScopeRef, mediaRemovalScope, isSocialIdentityCurrent, setProfileAppearanceSheetKind, setProfilePhotoSheetVisible, setProfileBackgroundSheetVisible, setProfileAppearanceBusy, setMyProfile, setChannelAccessProfile, Alert, getUserFacingErrorMessage, removeProfileMedia, getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } = context; return ${callback}; };`).create;
  const root = createRoot(container()); let mounted = true;
  function Host() {
    const mountedRef = React.useRef(true); React.useEffect(() => () => { mountedRef.current = false; }, []);
    const { scopeRef, scope } = createScope(state.authority, state.focused,
      `${state.route}:${state.authority?.userId ?? ''}:${state.authority?.sessionGeneration ?? ''}`, React.useRef, React.useEffect, value => state.busy.push(value), authority.subscribeToAccountSessionAuthority, authority.sameAccountSessionAuthority, mountedRef, mountedRef);
    const initiating = state.authority;
    const current = () => mountedRef.current && scopeRef.current === scope;
    state.callback = compiled({ useCallback: React.useCallback, authority: initiating, userId: state.route, isSelfProfile: initiating?.userId === state.route,
      ...Object.fromEntries(['activeProfilePhotoUrl', 'activeProfileBackgroundUrl', 'visibleProfileAvatarUrl', 'visibleProfileBackgroundUrl'].map(k => [k, 'present'])),
      profileAppearanceBusy: null, focused: state.focused, currentAccountAction: expected => current() && authority.sameAccountSessionIdentity(expected, authority.getCurrentAccountSessionAuthoritySnapshot()),
      profileGalleryMounted: mountedRef, mediaRemovalScopeRef: scopeRef, mediaRemovalScope: scope, isSocialIdentityCurrent: current,
      setProfileAppearanceSheetKind: noop, setProfilePhotoSheetVisible: noop, setProfileBackgroundSheetVisible: noop,
      setProfileAppearanceBusy: value => state.busy.push(value), setMyProfile: value => state.ui.push(value), setChannelAccessProfile: value => state.ui.push(value),
      Alert: { alert: (...args) => state.alerts.push(args) }, getUserFacingErrorMessage: e => e.message,
      removeProfileMedia: media.removeProfileMedia, ...authority,
    }); return null;
  }
  const render = async () => React.act(async () => { root.render(React.createElement(Host)); await settle(); });
  const unmount = async () => { if (!mounted) return; mounted = false; await React.act(async () => root.unmount()); };
  t.after(unmount); await render();
  return { state, media, authority, unmount,
    async focus(value) { state.focused = value; await render(); },
    async change(next, route = next?.userId ?? 'a') { state.authority = next; state.route = route; state.token = `token-${next?.userId}-2`; authority.publishAccountSessionAuthoritySnapshot(next); await render(); },
    async open(kind = 'avatar') { await React.act(async () => { state.callback(kind); await settle(); }); return state.alerts.at(-1)?.[2]; },
    async press(button) { await React.act(async () => { button?.onPress?.(); await settle(); }); },
    async release(gate) { await React.act(async () => { gate.resolve(); await settle(); }); },
  };
}

for (const file of ['app/settings.tsx', 'app/profile/[userId].tsx']) {
  test(`${file}: missing revision retirement negative control revives pre-ABA consent`, async t => {
    const h = await mount(t, file, { noRevision: true }); const buttons = await h.open();
    h.authority.publishAccountSessionAuthoritySnapshot(null);
    h.authority.publishAccountSessionAuthoritySnapshot(owner());
    await h.press(buttons[1]); assert.equal(h.state.writes.length, 1); assert.equal(h.state.ui.length, 1);
  });
  for (const transient of [null, owner('b', 'two'), owner('a', 'one', true)]) {
    for (const stage of ['before confirm', 'profile read', 'write response']) test(`${file}: no-render ABA ${JSON.stringify(transient)} retires ${stage} and permits fresh intent`, async t => {
      const h = await mount(t, file); const old = await h.open(); const gate = deferred();
      if (stage === 'profile read') h.state.readGate = gate;
      if (stage === 'write response') h.state.writeGate = gate;
      if (stage !== 'before confirm') await h.press(old[1]);
      h.authority.publishAccountSessionAuthoritySnapshot(transient);
      h.authority.publishAccountSessionAuthoritySnapshot(owner());
      const retiredBusy = h.state.busy.length;
      const fresh = await h.open();
      if (stage === 'before confirm') await h.press(old[1]);
      else {
        await h.press(fresh[1]);
        assert.equal(h.state.reads.length, 1, 'retired transport retains latch until settlement');
        await h.release(gate);
      }
      assert.equal(h.state.writes.length, stage === 'write response' ? 1 : 0);
      assert.equal(h.state.ui.length, 0); assert.equal(h.state.cache.length, 0); assert.equal(h.state.removes.length, 0);
      assert.equal(h.state.busy.length, retiredBusy, 'late result cannot restore retired UI');
      h.state.readGate = null; h.state.writeGate = null;
      await h.press(fresh[1]);
      assert.equal(h.state.writes.length, stage === 'write response' ? 2 : 1);
      assert.equal(h.state.ui.length, 1, 'new consent works after retirement');
    });
  }
  test(`${file}: identical authority publication leaves retained confirmation usable`, async t => {
    const h = await mount(t, file); const buttons = await h.open();
    h.authority.publishAccountSessionAuthoritySnapshot(owner());
    await h.press(buttons[1]); assert.equal(h.state.writes.length, 1); assert.equal(h.state.ui.length, 1);
  });
  test(`${file}: old response cannot clear newer rendered A scope pending state`, async t => {
    const h = await mount(t, file); const oldGate = deferred(); h.state.writeGate = oldGate;
    await h.press((await h.open())[1]);
    await h.change(owner('b', 'two')); await h.change(owner());
    const newGate = deferred(); h.state.writeGate = newGate;
    const newer = await h.open(); await h.press(newer[1]);
    assert.equal(h.state.writes.length, 2); const busy = h.state.busy.length;
    await h.release(oldGate); assert.equal(h.state.busy.length, busy); assert.equal(h.state.ui.length, 0);
    await h.press((await h.open())[1]); assert.equal(h.state.writes.length, 2, 'successor latch remains held');
    await h.release(newGate); assert.equal(h.state.ui.length, 1);
  });
  for (const stage of ['before open', 'before confirm', 'profile read', 'write success', 'write error']) {
    test(`${file}: published account replacement before React renders retires ${stage}`, async t => {
      const h = await mount(t, file);
      const gate = deferred();
      if (stage === 'profile read') h.state.readGate = gate;
      if (stage.startsWith('write')) h.state.writeGate = gate;
      h.state.writeError = stage === 'write error';
      const buttons = stage === 'before open' ? null : await h.open();
      if (stage === 'profile read' || stage.startsWith('write')) await h.press(buttons[1]);
      const busyBefore = h.state.busy.length;
      // Auth subscribers may publish the replacement before React commits its
      // new useSession value. Keep the old rendered callback/scope intact.
      h.state.authority = owner('b', 'two'); h.state.token = 'token-b-2';
      h.authority.publishAccountSessionAuthoritySnapshot(h.state.authority);
      const busyAfterRetirement = h.state.busy.length;
      assert.equal(busyAfterRetirement, busyBefore + (stage === 'profile read' || stage.startsWith('write') ? 1 : 0));
      if (stage === 'before open') await h.open();
      else if (stage === 'before confirm') await h.press(buttons[1]);
      else await h.release(gate);
      assert.equal(h.state.writes.length, stage.startsWith('write') ? 1 : 0);
      if (h.state.writes.length) assert.equal(h.state.writes[0].userId, 'a');
      assert.equal(h.state.cache.length, 0); assert.equal(h.state.removes.length, 0);
      assert.equal(h.state.ui.length, 0); assert.equal(h.state.busy.length, busyAfterRetirement);
      assert.equal(h.state.alerts.length, stage === 'before open' ? 0 : 1);
    });
  }
  for (const kind of ['avatar', 'background']) test(`${file}: ${kind} removal pins owner and token and consumes confirmation once`, async t => {
    const h = await mount(t, file); const buttons = await h.open(kind);
    await h.press(buttons[1]); await h.press(buttons[1]);
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.writes[0].userId, 'a');
    assert.equal(h.state.writes[0].token, 'Bearer token-a-1');
    assert.equal(h.state.writes[0].patch[kind === 'avatar' ? 'avatar_url' : 'profile_background_url'], null);
    assert.equal(h.state.removes.length, 1); assert.equal(h.state.ui.length, 1);
  });
  for (const next of [owner('b', 'two'), owner('a', 'two'), owner('a', 'one', true), null]) test(`${file}: retained Alert rejects ${JSON.stringify(next)}`, async t => {
    const h = await mount(t, file); const buttons = await h.open(); await h.change(next); await h.press(buttons[1]);
    assert.equal(h.state.reads.length, 0); assert.equal(h.state.writes.length, 0); assert.equal(h.state.ui.length, 0); assert.equal(h.state.alerts.length, 1);
  });
  test(`${file}: same-generation token refresh keeps confirmation valid`, async t => {
    const h = await mount(t, file); const buttons = await h.open(); await h.change(owner()); await h.press(buttons[1]);
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.writes[0].token, 'Bearer token-a-2');
  });
  test(`${file}: cancel retires retained destructive callback`, async t => {
    const h = await mount(t, file); const buttons = await h.open(); await h.press(buttons[0]); await h.press(buttons[1]); assert.equal(h.state.writes.length, 0);
  });
  test(`${file}: two retained confirmations cannot start concurrent removals`, async t => {
    const h = await mount(t, file); const first = await h.open(); const second = await h.open();
    const gate = deferred(); h.state.writeGate = gate;
    await h.press(first[1]); await h.press(second[1]); assert.equal(h.state.writes.length, 1);
    await h.release(gate); assert.equal(h.state.ui.length, 1);
  });
  for (const roundtrip of ['account', 'restore-only', 'focus', 'route']) test(`${file}: ${roundtrip} roundtrip never revives retained confirmation`, async t => {
    const h = await mount(t, file); const buttons = await h.open();
    if (roundtrip === 'focus') { await h.focus(false); await h.focus(true); }
    else if (roundtrip === 'route') {
      if (file === 'app/settings.tsx') { await h.focus(false); await h.focus(true); }
      else { await h.change(owner(), 'other-route'); await h.change(owner()); }
    }
    else { await h.change(roundtrip === 'account' ? owner('b', 'two') : owner('a', 'one', true)); await h.change(owner()); }
    await h.press(buttons[1]); assert.equal(h.state.writes.length, 0); assert.equal(h.state.ui.length, 0);
  });
  for (const retirement of ['route', 'unmount']) for (const stage of ['before confirm', 'profile read', 'write response']) test(`${file}: ${retirement} at ${stage} retires action/UI`, async t => {
    const h = await mount(t, file); const buttons = await h.open(); const gate = deferred();
    if (stage === 'profile read') h.state.readGate = gate;
    if (stage === 'write response') h.state.writeGate = gate;
    if (stage !== 'before confirm') await h.press(buttons[1]);
    if (retirement === 'unmount') await h.unmount();
    else if (file === 'app/settings.tsx') await h.focus(false);
    else await h.change(owner(), 'other-route');
    if (stage !== 'before confirm') assert.equal(h.state.busy.at(-1), null, 'actual scope cleanup clears removal busy');
    const busyBefore = h.state.busy.length;
    if (stage === 'before confirm') await h.press(buttons[1]); else await h.release(gate);
    assert.equal(h.state.writes.length, stage === 'write response' ? 1 : 0);
    assert.equal(h.state.removes.length, 0); assert.equal(h.state.cache.length, 0); assert.equal(h.state.ui.length, 0);
    assert.equal(h.state.alerts.length, 1); assert.equal(h.state.busy.length, busyBefore);
  });
  test(`${file}: old callback plus old helper negative control removes replacement account media`, async t => {
    const h = await mount(t, file, { oldCallback: true, oldHelper: true }); const buttons = await h.open();
    await h.change(owner('b', 'two')); await h.press(buttons[1]);
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.writes[0].userId, 'b'); assert.equal(h.state.ui.length, 1);
  });
}
for (const oldHelper of [false, true]) test(`helper independently checks initiating owner (old-source control=${oldHelper})`, async t => {
  const h = await mount(t, 'app/settings.tsx', { oldHelper }); await h.change(owner('b', 'two'));
  const pending = h.media.removeProfileMedia('avatar', { authority: owner(), isCurrent: () => true });
  if (oldHelper) { await pending; assert.equal(h.state.writes[0].userId, 'b'); }
  else { await assert.rejects(pending, /account changed/i); assert.equal(h.state.writes.length, 0); }
});
