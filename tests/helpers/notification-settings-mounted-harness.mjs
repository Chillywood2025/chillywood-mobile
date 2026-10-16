import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { createRoot } from 'react-dom/client';
import { webcrypto } from 'node:crypto';

export const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
export const owner = (sessionGeneration = 'session-a', userId = 'owned-user') => ({ userId, accountId: userId, sessionGeneration, restoreOnly: false, state: 'ACTIVE' });
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const source = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const compile = (text, captureScreen = false) => ts.transpileModule(text, {
  fileName: captureScreen ? 'settings.tsx' : 'module.ts',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  transformers: captureScreen ? { before: [context => root => ts.visitEachChild(root, node => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'SettingsScreen') return node;
    const visit = n => {
      if (ts.isFunctionLike(n)) return n;
      if (ts.isReturnStatement(n) && n.expression) return ts.factory.updateReturnStatement(n, ts.factory.createCallExpression(ts.factory.createIdentifier('capture'), undefined, [n.expression]));
      return ts.visitEachChild(n, visit, context);
    };
    return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
      ts.factory.updateBlock(node.body, node.body.statements.map(visit)));
  }, context)] } : undefined,
}).outputText;
const settingsCode = compile(process.env.NOTIFICATION_SETTINGS_SOURCE ? fs.readFileSync(process.env.NOTIFICATION_SETTINGS_SOURCE, 'utf8') : source('app/settings.tsx'), true);
const load = (code, mocks, extra = {}) => {
  const context = { exports: {}, console, process, crypto: webcrypto, setTimeout, clearTimeout, ...extra,
    require(name) { if (name.endsWith('.png')) return 1; assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name]; } };
  vm.runInNewContext(code, context); return context.exports;
};
const walk = (tree, predicate) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(n => walk(n, predicate))
  : [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : text(tree?.props?.children || '');
const plain = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const registration = (status = 'not_registered') => ({ status, permissionState: 'granted', provider: 'expo', tokenFingerprint: null, message: status });

// Whole production Settings function, real React effects/closures, whole actual
// notification preferences module and authority publisher/navigation key. The
// database transport and native registration facade are explicitly modeled.
// The navigation host uses the same keyed child boundary as app/_layout.tsx;
// this is not a full Router/native/provider/device integration test.
export async function mount(t, { read, write, register, authority: initialAuthority = owner(), keyed = true, actualPush = false } = {}) {
  const state = { authority: initialAuthority, focused: true, reads: [], writes: [], registrations: 0, revocations: 0, pushReads: 0,
    alerts: [], rows: new Map(), read, write, register, registration: registration(), routes: [], transport: [], permissionReader: null,
    authorityReader: null, storageReader: null, nativeTokens: 0, tokenReader: null, authoritySubscriptions: 0, revokeReceipt: 'valid',
    backendBarrier: null, backendCommits: [], installOwner: null };
  const timers = new Map(); let timerId = 0;
  const deadline = load(compile(source('_lib/entitlementAuthority.ts')), {}, {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const permission = { granted: true, canAskAgain: true };
  const storage = new Map([['chillywood.notification.install_id.v1', 'fixture-install'],
    ['chillywood.notification.revoke_credential.v1', 'fixture-revocation-credential']]);
  const database = { auth: { getSession: async () => ({ data: { session: state.authority ? { access_token: 'fixture-session-token', user: { id: state.authority.userId } } : null } }) },
    rpc: async name => {
      assert.equal(name, 'wave1_session_authority_readback');
      return { data: state.authorityReader ? await state.authorityReader() : { ...state.authority, authoritative: true }, error: null };
    },
    functions: { async invoke(name, { body }) {
      assert.equal(name, 'notification-device-tokens'); state.transport.push(plain(body));
      if (state.backendBarrier) await state.backendBarrier(body);
      state.backendCommits.push(plain(body));
      if (body.action === 'register') {
        state.installOwner = { userId: body.userId, sessionGeneration: body.sessionGeneration };
        state.registration = registration('registered');
      } else if (state.revokeReceipt === 'valid' && state.installOwner?.userId === body.userId
        && state.installOwner?.sessionGeneration === body.sessionGeneration) {
        state.installOwner = null; state.registration = registration('not_registered');
      }
      return { data: { ...body, requestAccepted: true, status: body.action === 'register' ? 'registered' : 'revoked',
        disposition: state.revokeReceipt === 'valid' ? 'revoked' : undefined, tokenFingerprint: '123456abcdef' },
        error: body.action === 'revoke' && state.revokeReceipt === 'rejected' ? {} : null };
    } },
    from(table) {
      assert.equal(table, 'notification_preferences');
      let userId, payload, mode = 'read';
      const q = { select: () => q, returns: () => q, setHeader: () => q, eq(key, value) { assert.equal(key, 'user_id'); userId = value; return q; },
        upsert(value, options) { assert.equal(options.onConflict, 'user_id'); mode = 'write'; payload = plain(value); userId = payload.user_id; return q; },
        insert(value) { mode = 'insert'; payload = plain(value); userId = payload.user_id; return q; },
        async maybeSingle() {
          const request = { userId, payload, mode };
          const row = { user_id: userId, push_enabled: true, messages_enabled: true, ...(state.rows.get(userId) || {}) };
          if (mode === 'read') {
            state.reads.push(request);
            if (state.read) return state.read(request, row);
            return { data: row, error: null };
          }
          state.writes.push(request);
          if (state.write) return state.write(request, row);
          const saved = { ...row, ...payload }; state.rows.set(userId, saved);
          return { data: saved, error: null };
        } };
      return q;
    } };
  const authority = load(compile(source('_lib/accountSessionAuthority.ts')), { './supabase': { supabase: database }, './entitlementAuthority': deadline });
  const subscribe = authority.subscribeToAccountSessionAuthority;
  authority.subscribeToAccountSessionAuthority = listener => {
    state.authoritySubscriptions++; const unsubscribe = subscribe(listener);
    return () => { state.authoritySubscriptions--; unsubscribe(); };
  };
  authority.publishAccountSessionAuthoritySnapshot(initialAuthority);
  const rpc = load(compile(source('_lib/accountBoundSupabaseRpc.mjs')), {}, { URL, fetch: async (url) => {
    assert.equal(new URL(url).pathname, '/rest/v1/rpc/wave1_session_authority_readback');
    const result = await database.rpc('wave1_session_authority_readback');
    return new Response(JSON.stringify(result.data), { status: 200 });
  } });
  const mutation = load(compile(source('_lib/accountBoundSupabaseMutation.ts')), {
    './accountSessionAuthority': authority, './entitlementAuthority': deadline,
    './accountBoundSupabaseRpc.mjs': rpc,
    './supabase': { supabase: database, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon' },
    'react-native': { Platform: { OS: 'android' } },
  });
  const realNotifications = load(compile(process.env.NOTIFICATION_HELPER_SOURCE ? fs.readFileSync(process.env.NOTIFICATION_HELPER_SOURCE, 'utf8') : source('_lib/notifications.ts')), {
    '@react-native-async-storage/async-storage': { getItem: async key => state.storageReader ? state.storageReader(key, storage.get(key) || null) : storage.get(key) || null,
      setItem: async (key, value) => { storage.set(key, value); } },
    'expo-constants': { easConfig: { projectId: 'fixture-project' } }, 'expo-device': { isDevice: actualPush }, 'expo-application': {},
    'expo-notifications': { AndroidImportance: {}, AndroidNotificationPriority: {}, setNotificationHandler: noop, setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => state.permissionReader ? state.permissionReader() : permission,
      requestPermissionsAsync: async () => permission,
      getExpoPushTokenAsync: async () => { state.nativeTokens++; return state.tokenReader ? state.tokenReader('expo') : { data: 'fixture-expo-token' }; },
      getDevicePushTokenAsync: async () => { state.nativeTokens++; return state.tokenReader ? state.tokenReader('fcm') : { data: 'fixture-fcm-token' }; } },
    'react-native': { Platform: { OS: 'android' }, NativeModules: {} }, './liveEvents': {}, './supabase': { supabase: database },
    './userFacingProductCopy': {}, './chillyChatCalls': { normalizeChillyChatRingtoneKey: value => value || 'chilly_ring' }, './chillyChatCallSoundAssets': {},
    './appLinks': {}, './notificationMessageTarget': {}, './accountSessionAuthority': authority,
    './accountBoundSupabaseMutation': mutation,
    './entitlementAuthority': deadline,
  });
  const notifications = { ...realNotifications,
    // Original-source controls predate these observation-only exports. They
    // must reach the intended race assertion, not fail with a missing fixture.
    hasPendingNotificationPreferenceWrite: realNotifications.hasPendingNotificationPreferenceWrite || (() => false),
    subscribeToNotificationPreferenceWrites: realNotifications.subscribeToNotificationPreferenceWrites || (() => noop),
    hasPendingNotificationPushRegistration: realNotifications.hasPendingNotificationPushRegistration || (() => false),
    subscribeToNotificationPushRegistrations: realNotifications.subscribeToNotificationPushRegistrations || (() => noop),
    withNotificationPushPreferenceChange: realNotifications.withNotificationPushPreferenceChange || ((_owner, operation) => operation()),
    async readCurrentPushRegistration() { state.pushReads++; return state.registration; },
    async requestPushPermissionAndRegister(...args) { state.registrations++; return actualPush ? realNotifications.requestPushPermissionAndRegister(...args)
      : state.register ? state.register() : registration('registered'); },
    async revokeCurrentPushInstall(...args) { state.revocations++; return actualPush ? realNotifications.revokeCurrentPushInstall(...args) : registration('not_registered'); },
  };
  let tree, unmounted = false;
  const appListeners = new Set(), router = { push: route => state.routes.push(route), replace: route => state.routes.push(route), back: noop, canGoBack: () => true };
  const appState = { currentState: 'active', addEventListener(_, listener) { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const mocks = {
    react: React,
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ section: 'notifications' }),
      useFocusEffect(callback) { const focused = state.focused; React.useEffect(() => focused ? callback() : undefined, [callback, focused]); } },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'ImageBackground', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'Switch', 'View'].map(x => [x, x])),
      Platform: { OS: 'android' }, StyleSheet: { create: x => x }, AppState: appState, Alert: { alert: (...args) => state.alerts.push(args) }, Linking: {}, Vibration: {} },
    'expo-clipboard': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../_lib/session': { useSession: () => ({ isLoading: false, isSignedIn: !!state.authority, user: state.authority ? { id: state.authority.userId } : null,
      authority: state.authority, authorityStatus: state.authority ? 'active' : 'signed_out' }) },
    '../_lib/accountSessionAuthority': authority,
    '../_lib/monetization': { getCachedMonetizationSnapshot: () => ({ targets: {} }), subscribeToMonetizationSnapshot: () => noop, readMonetizationSnapshot: async () => ({ targets: {} }), isPremiumPurchaseShellAvailable: () => false },
    '../_lib/accountDeletionRequests': { readMyAccountDeletionStatus: async () => ({ scheduled: false }) },
    '../_lib/analytics': { trackEvent: noop }, '../_lib/userFacingErrors': { getUserFacingErrorMessage: (_, fallback) => fallback },
    '../_lib/notifications': notifications,
    '../_lib/chillyChatCalls': { CHILLY_CHAT_RINGTONE_OPTIONS: [{ key: 'chilly_ring', label: 'Chilly ring' }, { key: 'quiet_buzz', label: 'Quiet buzz' }] }, '../_lib/chillyChatCallSoundAssets': { stopChillyChatCallSound: async () => {} },
    '../_lib/moderation': { getModerationAccess: () => ({}), canAccessAdminConsole: () => false, readMyPlatformRoleMemberships: async () => [] },
    '../_lib/legalPolicies': { LEGAL_POLICY_ROUTES: [] }, '../_lib/accessVisibility': { ACCESS_VISIBILITY_OPTIONS: [], getAccessVisibilityLabel: x => x },
    '../_lib/runtimeConfig': { getRuntimeLegalConfig: () => ({}) }, '../_lib/iosNativeCalls': {},
    '../_lib/releaseDiagnostics': { readReleaseDiagnostics: () => ({}), sanitizeReleaseDiagnosticsForDisplay: x => x, formatReleaseDiagnosticsSummary: () => '' },
    '../_lib/supabase': { supabase: database }, '../_lib/displayText': { maskEmailAddress: () => '' },
    '../_lib/usernameHandles': { formatUsernameHandle: x => x || '', normalizeUsernameHandle: x => x || '', validateUsernameHandle: () => ({ available: false, username: '' }) },
    '../_lib/userData': { isProfileMediaActive: () => false, readMyProfileAccessVisibility: async () => 'public', readUserProfile: async () => ({}) },
    '../_lib/profileMedia': {}, '../components/profile/profile-media-sheets': {},
    '../components/navigation/app-back-button': { AppBackButton: 'Back' }, '../components/ui/ProfileMediaImage': { ProfileMediaImage: 'Image' },
    '../components/ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: 'Fill' },
  };
  const screen = load(settingsCode, mocks, { capture: value => { tree = value; return null; } }).default;
  const root = createRoot(container()), act = async fn => React.act(async () => { await fn(); await settle(); });
  const render = () => act(() => root.render(React.createElement(screen, { key: keyed ? authority.getAccountNavigationTreeKey(state.authority) : 'unkeyed-test-control' })));
  const unmount = async () => { if (!unmounted) { unmounted = true; await React.act(async () => root.unmount()); } };
  await render(); t.after(unmount);
  const section = () => walk(tree, n => n.props?.id === 'notifications')[0];
  const row = title => walk(section(), n => n.props?.title === title)[0];
  const button = label => {
    const matches = walk(section(), n => n.type === 'TouchableOpacity' && text(n).includes(label));
    assert.equal(matches.length, 1, `one ${label} button`); return matches[0].props;
  };
  const toggle = label => {
    const rows = walk(section(), n => n.type === 'View' && walk(n, child => child.type === 'Switch').length === 1
      && walk(n, child => child.type === 'Text' && text(child) === label).length === 1);
    const matches = rows.length ? walk(rows.at(-1), n => n.type === 'Switch') : [];
    assert.equal(matches.length, 1, `one ${label} toggle`); return matches[0].props;
  };
  return { state, authority, notifications, appListeners, act, render, unmount, button, toggle, row, section,
    async expireProviderDeadline() { await act(() => {
      const matches = [...timers].filter(([, timer]) => timer.delay === 15_000);
      assert.equal(matches.length, 1, 'one actual production provider deadline');
      for (const [id, timer] of matches) { timers.delete(id); timer.callback(); }
    }); },
    async focus(focused) { state.focused = focused; await render(); },
    async app(next) { appState.currentState = next; await act(() => { for (const listener of appListeners) listener(next); }); },
    async replace(next) { state.authority = next; await act(() => authority.publishAccountSessionAuthoritySnapshot(next)); await render(); },
  };
}
