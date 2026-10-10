import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container();
globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const readSource = file => process.env.NOTIFICATION_BELL_BASELINE === '1'
  ? execFileSync('git', ['show', `HEAD:${file}`], { cwd: REPO, encoding: 'utf8' })
  : fs.readFileSync(`${REPO}/${file}`, 'utf8');
const bellSource = readSource('components/notifications/notification-bell-button.tsx');
const serviceSource = readSource('_lib/notifications.ts');
const ast = ts.createSourceFile('notifications.ts', serviceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const mark = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'markNotificationRead');
const dismissAction = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'dismissNotification');
const builder = ast.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'buildNotificationActionResult'));
assert.ok(mark && builder, 'execute the actual action-result builder and mark-read function');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const compiledBell = compile(bellSource);
assert.ok(dismissAction);
const compiledAction = compile(`${builder.getText(ast)}\n${mark.getText(ast)}\n${dismissAction.getText(ast)}`);
const foreground = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'subscribeToForegroundActivityNotifications');
assert.ok(foreground);
const compiledForeground = compile(foreground.getText(ast));
const rootSource = readSource('app/_layout.tsx');
const rootAst = ts.createSourceFile('_layout.tsx', rootSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const bridge = rootAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'RoomSafeActivityNotificationBridge');
assert.ok(bridge);
const compiledBridge = compile(`${bridge.getText(rootAst)}\nglobalThis.Bridge = RoomSafeActivityNotificationBridge;`);
const compiledInvalidation = compile(fs.readFileSync(`${REPO}/_lib/notificationActivity.ts`, 'utf8'));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const activeSession = (id = 'account-a', generation = 'generation-a') => ({ user: { id }, authorityStatus: 'active', authority: { userId: id, accountId: id, sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false } });
const notification = { id: 'notification-a', notificationType: 'creator_tip_received', title: 'Creator activity', body: 'Test activity', deepLink: '/channel-settings', createdAt: '2026-10-10T10:00:00.000Z', isRead: false, readAt: null, isDismissed: false, isImportant: false, isExpired: false, actionStatus: 'pending', actionLabel: 'Open' };
function descend(node, predicate, found = []) {
  if (Array.isArray(node)) { node.forEach(n => descend(n, predicate, found)); return found; }
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  descend(node.props?.children, predicate, found);
  return found;
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return textOf(node.props?.children);
}
async function mount(t, outcome, { withRoot = false, pathname = '/', withPeerBell = false } = {}) {
  const captures = new Map(); const routes = []; const results = []; let writes = 0; let summaryReads = 0; let pageReads = 0; let markCalls = 0;
  let activeOutcome = outcome;
  let markResultGate = null;
  let backendCount = 1; let durableRead = outcome === 'noop'; let durableDismissed = outcome === 'noop';
  let session = activeSession();
  const received = new Set(); const allReceived = []; const activations = new Set();
  const channels = [];
  const realtime = { channel(name) {
    const channel = { name, handlers: [], removed: false,
      on(type, filter, callback) { channel.handlers.push({ type, filter, callback }); return channel; },
      subscribe(callback) { channel.status = callback; return channel; } };
    channels.push(channel); return channel;
  }, async removeChannel(channel) { channel.removed = true; } };
  const requestedUsers = [];
  let summaryReader = async () => ({ unreadCount: backendCount, undismissedCount: 1, totalCount: 1, latestCreatedAt: notification.createdAt, categories: [] });
  const invalidationContext = { exports: {}, require: name => {
    if (name === './supabase') return { supabase: realtime };
    assert.equal(name, './accountSessionAuthority');
    return { getCurrentAccountSessionAuthoritySnapshot: () => session.authority };
  } };
  vm.runInNewContext(compiledInvalidation, invalidationContext);
  const invalidation = invalidationContext.exports;
  const row = { ...notification };
  let pageReader = async () => ({ status: 'resolved', items: row.isDismissed ? [] : [{ ...row }], nextCursor: null });
  const actionContext = {
    exports: {}, Date, Promise,
    normalizeText: value => String(value ?? '').trim(),
    normalizeIsoTimestamp: value => value || null,
    readSessionUserId: async () => {
      if (activeOutcome === 'throw') throw new Error('modeled auth transport failure');
      return activeOutcome === 'blocked' ? null : 'account-a';
    },
    readNotificationRowById: async () => ({ id: row.id, user_id: 'account-a', read_at: durableRead ? row.createdAt : null, dismissed_at: durableDismissed ? row.createdAt : null }),
    NOTIFICATIONS_TABLE: 'notifications',
    supabase: { from(table) {
      assert.equal(table, 'notifications');
      return { update(payload) {
        writes++;
        const filters = [];
        const chain = { eq(key, value) { filters.push([key, value]); return chain; },
          select(columns) { assert.equal(columns, payload.read_at ? 'id,user_id,read_at' : 'id,user_id,dismissed_at'); return chain; },
          maybeSingle() { return chain; }, then(resolve) {
          assert.deepEqual(filters, [['id', row.id], ['user_id', 'account-a']]);
          const written = !['error', 'zero'].includes(activeOutcome);
          if (written && payload.read_at) durableRead = true;
          if (written && payload.dismissed_at) durableDismissed = true;
          resolve({ data: written ? { id: row.id, user_id: 'account-a', ...payload } : null,
            error: activeOutcome === 'error' ? { code: 'modeled_update_failure' } : null });
        } };
        return chain;
      } };
    } },
  };
  vm.runInNewContext(compiledAction, actionContext, { filename: 'actual-mark-notification-read.js' });
  const native = {};
  for (const name of ['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TouchableOpacity', 'View']) {
    native[name] = function Host(props) { captures.set(props.testID || name, props); return null; };
  }
  native.StyleSheet = { create: value => value, absoluteFillObject: {} };
  const services = {
    markNotificationRead: async id => { markCalls++; const result = await actionContext.exports.markNotificationRead(id); results.push(result);
      if (result.status === 'completed' || result.status === 'noop') { row.isRead = true; backendCount = 0; }
      if (markResultGate) await markResultGate; return result; },
    dismissNotification: async id => { markCalls++; const result = await actionContext.exports.dismissNotification(id); results.push(result);
      if (result.status === 'completed' || result.status === 'noop') { row.isDismissed = true; backendCount = 0; }
      if (markResultGate) await markResultGate; return result; },
    readNotificationSummary: async id => { summaryReads++; requestedUsers.push(id); return summaryReader(id); },
    readImportantNotificationList: async () => [],
    readNotificationListPage: (...args) => { pageReads++; return pageReader(...args); },
    resolveNotificationPath: value => value,
  };
  const deps = {
    react: React,
    'react-native': native,
    'expo-router': { router: { push: value => routes.push(value) }, useFocusEffect: callback => React.useEffect(callback, [callback]) },
    '@expo/vector-icons/MaterialIcons': { __esModule: true, default: () => null },
    '../../_lib/notifications': services,
    '../../_lib/session': { useSession: () => session },
    '../../_lib/notificationActivity': invalidation,
    '../ui/chillywood-visual-system': { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: () => null },
  };
  const context = { exports: {}, require: name => { assert.ok(name in deps, `unexpected import ${name}`); return deps[name]; }, Date, console };
  vm.runInNewContext(compiledBell, context, { filename: 'actual-notification-bell-button.js' });
  const foregroundContext = { exports: {}, normalizeText: value => String(value ?? '').trim(), normalizeNotificationPath: value => String(value ?? '').trim(),
    Notifications: { addNotificationReceivedListener: listener => { received.add(listener); allReceived.push(listener); return { remove: () => received.delete(listener) }; } } };
  vm.runInNewContext(compiledForeground, foregroundContext);
  const bridgeContext = { ...React, React, ...native, ...invalidation, console, setTimeout, clearTimeout,
    useSession: () => session, usePathname: () => pathname,
    isRoomSafeIncomingCallPath: path => path === '/room',
    subscribeToForegroundActivityNotifications: foregroundContext.exports.subscribeToForegroundActivityNotifications,
    AppState: { addEventListener: (_type, callback) => { activations.add(callback); return { remove: () => activations.delete(callback) }; } }, styles: {},
  };
  vm.runInNewContext(compiledBridge, bridgeContext, { filename: 'actual-room-activity-root.js' });
  const root = createRoot(container());
  const render = () => root.render(React.createElement(React.Fragment, null,
    withRoot ? React.createElement(bridgeContext.Bridge) : null,
    withPeerBell ? React.createElement(context.exports.NotificationBellButton, { surface: 'peer' }) : null,
    React.createElement(context.exports.NotificationBellButton, { surface: 'probe' })));
  await React.act(async () => { render(); await settle(); });
  let unmounted = false;
  const unmount = async () => { if (unmounted) return; unmounted = true; await React.act(async () => root.unmount()); };
  t.after(unmount);
  const snapshot = () => ({ label: captures.get('probe-notification-bell').accessibilityLabel, tray: captures.get('Modal').visible,
    rowText: textOf(descend(captures.get('Modal').children, n => n.props?.testID === 'notification-tray-row-creator_tip_received')[0]),
    trayText: textOf(captures.get('Modal').children), rowDisabled: descend(captures.get('Modal').children, n => n.props?.accessibilityLabel?.startsWith('Open notification:'))[0]?.props.disabled,
    loadMoreDisabled: descend(captures.get('Modal').children, n => n.props?.accessibilityLabel === 'Load more notifications')[0]?.props.disabled,
    peerLabel: captures.get('peer-notification-bell')?.accessibilityLabel,
    markCalls, summaryReads, pageReads, writes, durableRead, durableDismissed, routes: routes.length, requestedUsers: [...requestedUsers],
    toast: captures.has('room-safe-notification-toast'), result: results.at(-1)?.status ?? null });
  return {
    snapshot,
    unmount,
    channels,
    async database(event, record, index = channels.length - 1) { await React.act(async () => {
      const channel = channels[index]; assert.ok(channel, 'the actual root owns a database subscription');
      for (const handler of channel.handlers) if (handler.filter.event === event) handler.callback({ new: record });
      await settle();
    }); },
    async databaseStatus(status, index = channels.length - 1) { await React.act(async () => {
      assert.ok(channels[index], 'the actual root owns a database subscription'); channels[index].status(status); await settle();
    }); },
    async openTray() { await React.act(async () => { captures.get('probe-notification-bell').onPress(); await settle(); }); },
    async openRow() { const node = descend(captures.get('Modal').children, n => n.props?.accessibilityLabel?.startsWith('Open notification:'))[0]; assert.ok(node); await React.act(async () => { node.props.onPress(); await settle(); }); },
    async dismissRow() { const node = descend(captures.get('Modal').children, n => n.props?.accessibilityLabel?.startsWith('Dismiss notification:'))[0]; assert.ok(node); await React.act(async () => { node.props.onPress(); await settle(); }); },
    captureRowAction(kind) { const prefix = kind === 'dismiss' ? 'Dismiss notification:' : 'Open notification:';
      const node = descend(captures.get('Modal').children, n => n.props?.accessibilityLabel?.startsWith(prefix))[0]; assert.ok(node);
      return async () => { await React.act(async () => { node.props.onPress(); await settle(); }); }; },
    setDurableRead(value) { durableRead = value; row.isRead = value; },
    setOutcome(value) { activeOutcome = value; },
    setMarkResultGate(promise) { markResultGate = promise; },
    setCount(value) { backendCount = value; },
    setSummaryReader(reader) { summaryReader = reader; },
    setPageReader(reader) { pageReader = reader; },
    async loadMore() { const node = descend(captures.get('Modal').children, n => n.props?.accessibilityLabel === 'Load more notifications')[0]; assert.ok(node); await React.act(async () => { node.props.onPress(); await settle(); }); },
    async emit(data = { notificationType: 'missed_call', path: '/chat/thread-a' }) { await React.act(async () => { for (const callback of received) callback({ request: { content: { data } } }); await settle(); }); },
    async oldEmit(index, data = {}) { await React.act(async () => { allReceived[index]({ request: { content: { data } } }); await settle(); }); },
    async foreground() { await React.act(async () => { for (const callback of activations) callback('active'); await settle(); }); },
    async replaceSession(value) { session = value; await React.act(async () => { render(); await settle(); }); },
    async resolve(pending, value) { await React.act(async () => { pending.resolve(value); await settle(); }); },
  };
}
for (const outcome of ['blocked', 'error', 'throw', 'completed', 'noop']) {
  test(`actual mounted bell retains durable read truth for ${outcome}`, async t => {
    const h = await mount(t, outcome); await h.openTray(); const before = h.snapshot();
    assert.equal(before.label, '1 unread notifications'); assert.match(before.rowText, /Unread/);
    await h.openRow(); const after = h.snapshot();
    assert.equal(after.result, outcome === 'throw' ? null : outcome, 'actual service exercised the intended result branch');
    if (['blocked', 'error', 'throw'].includes(outcome)) {
      assert.equal(after.durableRead, false);
      assert.equal(after.label, '1 unread notifications', 'failed read must not decrement backed unread badge');
      assert.match(after.rowText, /Unread/, 'failed read must not become a local Read claim');
      assert.equal(after.tray, true, 'the error and retry remain visible');
      assert.equal(after.routes, 0, 'a failed read does not silently navigate away');
      assert.equal(after.rowDisabled, false, 'the failed action releases its busy state');
      assert.match(after.trayText, /could not be marked as read.*try again/i);
      h.setOutcome('completed');
      await h.openRow();
      const retried = h.snapshot();
      assert.equal(retried.markCalls, 2, 'one explicit retry makes one additional operation');
      assert.equal(retried.durableRead, true);
      assert.equal(retried.label, 'Notifications');
      assert.equal(retried.tray, false);
      assert.equal(retried.routes, 1);
      assert.doesNotMatch(retried.trayText, /could not be marked as read/i);
    } else {
      assert.equal(after.label, 'Notifications'); assert.match(after.rowText, / · Read · /);
      assert.equal(after.tray, false); assert.equal(after.routes, 1);
      assert.equal(after.markCalls, 1); assert.equal(after.rowDisabled, false);
    }
  });
}

const summary = unreadCount => ({ unreadCount, undismissedCount: unreadCount, totalCount: unreadCount, latestCreatedAt: notification.createdAt, categories: [] });

test('live badge uses the actual root receipt before toast filtering and foreground activation', async t => {
  const h = await mount(t, 'completed', { withRoot: true });
  const before = h.snapshot(); h.setCount(2);
  await h.emit({ notificationType: 'missed_call', path: '/chat/thread-a', unreadCount: 999 });
  assert.equal(h.snapshot().label, '2 unread notifications', 'missed-call receipt refreshes the durable badge without a toast');
  assert.equal(h.snapshot().summaryReads, before.summaryReads + 1);
  assert.equal(h.snapshot().toast, false); assert.equal(h.snapshot().routes, 0);
  h.setCount(3); await h.foreground();
  assert.equal(h.snapshot().label, '3 unread notifications');
  assert.ok(h.snapshot().requestedUsers.every(id => id === 'account-a'), 'each refresh explicitly reads its current owner');
});

test('live badge rejects foreign-recipient receipts and preserves creator room toast policy', async t => {
  const h = await mount(t, 'completed', { withRoot: true, pathname: '/room' });
  const reads = h.snapshot().summaryReads; h.setCount(2);
  await h.emit({ category: 'creator_money_sale', path: '/channel-settings', recipientUserId: 'account-b' });
  assert.equal(h.snapshot().summaryReads, reads); assert.equal(h.snapshot().toast, false);
  await h.emit({ category: 'creator_money_sale', path: '/channel-settings', recipientUserId: 'account-a' });
  assert.equal(h.snapshot().label, '2 unread notifications');
  assert.equal(h.snapshot().toast, true, 'eligible creator activity retains its quiet room toast');
  assert.equal(h.snapshot().routes, 0, 'a receipt does not navigate or mutate room media');
});

test('late older refresh cannot overwrite the newer authoritative unread summary', async t => {
  const h = await mount(t, 'completed'); const old = deferred();
  h.setSummaryReader(() => old.promise); await h.openTray();
  h.setSummaryReader(async () => summary(3)); await h.openTray();
  assert.equal(h.snapshot().label, '3 unread notifications');
  await h.resolve(old, summary(2));
  assert.equal(h.snapshot().label, '3 unread notifications');
});

test('retired account read and old native listener cannot mutate the replacement account', async t => {
  const h = await mount(t, 'completed', { withRoot: true }); const old = deferred();
  h.setSummaryReader(() => old.promise); await h.openTray();
  h.setSummaryReader(async () => summary(4)); await h.replaceSession(activeSession('account-b', 'generation-b'));
  assert.equal(h.snapshot().label, '4 unread notifications');
  const reads = h.snapshot().summaryReads;
  await h.oldEmit(0, { category: 'creator_money_sale', path: '/channel-settings' });
  assert.equal(h.snapshot().summaryReads, reads, 'a captured retired listener cannot invalidate the new owner');
  await h.resolve(old, summary(9));
  assert.equal(h.snapshot().label, '4 unread notifications');
  assert.equal(h.snapshot().requestedUsers.at(-1), 'account-b');
});

test('retired logout clears rendered activity and rejects a late in-flight read', async t => {
  const h = await mount(t, 'completed', { withRoot: true }); const old = deferred();
  h.setSummaryReader(() => old.promise); await h.openTray();
  await h.replaceSession({ user: null, authority: null, authorityStatus: 'signed_out' });
  assert.equal(h.snapshot().label, 'Notifications'); assert.equal(h.snapshot().rowText, '');
  await h.resolve(old, summary(9));
  assert.equal(h.snapshot().label, 'Notifications'); assert.equal(h.snapshot().rowText, '');
});

test('retired session generation of the same account cannot overwrite its fresh session', async t => {
  const h = await mount(t, 'completed', { withRoot: true }); const old = deferred();
  h.setSummaryReader(() => old.promise); await h.openTray();
  h.setSummaryReader(async () => summary(5)); await h.replaceSession(activeSession('account-a', 'generation-b'));
  await h.resolve(old, summary(8));
  assert.equal(h.snapshot().label, '5 unread notifications');
});

test('late failed refresh cannot replace a newer successful read with an error', async t => {
  const h = await mount(t, 'completed'); const old = deferred();
  h.setSummaryReader(() => old.promise); await h.openTray();
  h.setSummaryReader(async () => summary(3)); await h.openTray();
  await h.resolve(old, Promise.reject(new Error('modeled stale read failure')));
  assert.equal(h.snapshot().label, '3 unread notifications');
  assert.doesNotMatch(h.snapshot().trayText, /could not be refreshed/);
});

test('retired mark-read completion cannot navigate or update a replacement account', async t => {
  const h = await mount(t, 'completed', { withRoot: true }); const held = deferred();
  h.setMarkResultGate(held.promise); await h.openTray(); await h.openRow();
  assert.equal(h.snapshot().durableRead, true, 'hold only the completed backend result, not invented data');
  h.setSummaryReader(async () => summary(4)); await h.replaceSession(activeSession('account-b', 'generation-b'));
  await h.resolve(held);
  assert.equal(h.snapshot().label, '4 unread notifications'); assert.equal(h.snapshot().routes, 0);
});

for (const outcome of ['completed', 'error']) {
  test(`live badge coalesces receipts during a held ${outcome} mark-read result`, async t => {
    const h = await mount(t, outcome, { withRoot: true }); const held = deferred();
    h.setMarkResultGate(held.promise); await h.openTray(); await h.openRow();
    const reads = h.snapshot().summaryReads;
    h.setCount(3); await h.emit(); await h.emit();
    const readsWhileHeld = h.snapshot().summaryReads;
    await h.resolve(held);
    assert.equal(h.snapshot().label, '3 unread notifications', 'do not subtract again from a count that already reflects the write');
    assert.equal(readsWhileHeld, reads, 'hold receipt refreshes until the local action has settled');
    assert.equal(h.snapshot().summaryReads, reads + 1, 'one authoritative refresh covers both receipts');
    if (outcome === 'error') {
      assert.equal(h.snapshot().tray, true); assert.equal(h.snapshot().routes, 0);
      assert.match(h.snapshot().trayText, /could not be marked as read.*try again/i);
    }
  });
}

test('successful read invalidates all mounted bells for the same exact owner', async t => {
  const h = await mount(t, 'completed', { withPeerBell: true });
  await h.openTray(); assert.equal(h.snapshot().peerLabel, '1 unread notifications');
  await h.openRow();
  assert.equal(h.snapshot().label, 'Notifications'); assert.equal(h.snapshot().peerLabel, 'Notifications');
  assert.equal(h.snapshot().routes, 1, 'authoritative rereads do not delay successful routing');
});

test('failed read action retires held load-more and leaves both retry controls usable', async t => {
  const h = await mount(t, 'error'); const page = deferred();
  h.setPageReader(async (_id, _limit, cursor) => cursor ? page.promise
    : { status: 'resolved', items: [{ ...notification }], nextCursor: { createdAt: notification.createdAt, id: notification.id } });
  await h.openTray(); await h.loadMore(); assert.equal(h.snapshot().loadMoreDisabled, true);
  await h.openRow();
  assert.equal(h.snapshot().rowDisabled, false); assert.equal(h.snapshot().loadMoreDisabled, false);
  assert.equal(h.snapshot().label, '1 unread notifications');
  await h.resolve(page, { status: 'error', items: [], nextCursor: null });
  assert.equal(h.snapshot().loadMoreDisabled, false);
  assert.match(h.snapshot().trayText, /could not be marked as read.*try again/i);
  assert.doesNotMatch(h.snapshot().trayText, /More activity could not be loaded/);
});

test('held full receipt refresh cannot be superseded by a pagination callback', async t => {
  const h = await mount(t, 'completed', { withRoot: true }); const held = deferred();
  h.setPageReader(async () => ({ status: 'resolved', items: [{ ...notification }], nextCursor: { createdAt: notification.createdAt, id: notification.id } }));
  await h.openTray();
  h.setSummaryReader(() => held.promise); await h.emit();
  const reads = h.snapshot().pageReads;
  // Invoke even a previously captured enabled control's handler. The owned
  // in-flight phase must protect the full refresh before React disables it.
  await h.loadMore(); await h.resolve(held, summary(2));
  assert.equal(h.snapshot().label, '2 unread notifications');
  assert.equal(h.snapshot().pageReads, reads, 'pagination cannot steal the pending full refresh owner');
  assert.equal(h.snapshot().loadMoreDisabled, false, 'pagination becomes usable after refresh settles');
});

test('in-app-only insert and update refresh both bells through the single actual root subscription', async t => {
  const h = await mount(t, 'completed', { withRoot: true, withPeerBell: true });
  assert.equal(h.channels.length, 1);
  const channel = h.channels[0];
  assert.deepEqual(channel.handlers.map(({ type, filter }) => ({ type, ...filter })), [
    { type: 'postgres_changes', event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.account-a' },
    { type: 'postgres_changes', event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'user_id=eq.account-a' },
  ], 'only exact-owner INSERT/UPDATE are registered, never unfiltered DELETE');
  h.setCount(2); await h.database('INSERT', { user_id: 'account-a', unreadCount: 999 });
  assert.equal(h.snapshot().label, '2 unread notifications'); assert.equal(h.snapshot().peerLabel, '2 unread notifications');
  h.setCount(0); await h.database('UPDATE', { user_id: 'account-a', read_at: 'durable' });
  assert.equal(h.snapshot().label, 'Notifications'); assert.equal(h.snapshot().toast, false);
  const reads = h.snapshot().summaryReads;
  await h.database('INSERT', { user_id: 'account-b' }); await h.database('UPDATE', {});
  assert.equal(h.snapshot().summaryReads, reads, 'foreign and missing owners cannot invalidate a new account');
});

test('database initial subscribe and reconnect reread missed durable rows without polling', async t => {
  const h = await mount(t, 'completed', { withRoot: true }); const reads = h.snapshot().summaryReads;
  await h.databaseStatus('CHANNEL_ERROR'); await h.databaseStatus('TIMED_OUT');
  assert.equal(h.snapshot().summaryReads, reads);
  h.setCount(2); await h.databaseStatus('SUBSCRIBED'); assert.equal(h.snapshot().label, '2 unread notifications');
  h.setCount(3); await h.databaseStatus('SUBSCRIBED'); assert.equal(h.snapshot().label, '3 unread notifications');
  assert.equal(h.channels.length, 1, 'reconnect does not accumulate application-owned observers');
});

test('database cleanup and late callbacks cannot cross account or session replacement or logout', async t => {
  const h = await mount(t, 'completed', { withRoot: true });
  const held = deferred(); h.setSummaryReader(id => id === 'account-a' ? held.promise : Promise.resolve(summary(4)));
  await h.database('INSERT', { user_id: 'account-a' });
  await h.replaceSession(activeSession('account-b', 'generation-b'));
  assert.equal(h.channels[0].removed, true); assert.equal(h.channels.length, 2);
  const reads = h.snapshot().summaryReads;
  await h.database('INSERT', { user_id: 'account-a' }, 0); await h.databaseStatus('SUBSCRIBED', 0);
  await h.resolve(held, summary(99));
  assert.equal(h.snapshot().summaryReads, reads); assert.equal(h.snapshot().label, '4 unread notifications');
  await h.replaceSession(activeSession('account-b', 'replacement-b'));
  assert.equal(h.channels[1].removed, true);
  const nextReads = h.snapshot().summaryReads;
  await h.database('UPDATE', { user_id: 'account-b' }, 1);
  assert.equal(h.snapshot().summaryReads, nextReads);
  await h.replaceSession({ user: null, authorityStatus: 'inactive', authority: null });
  assert.equal(h.channels[2].removed, true); assert.equal(h.channels.length, 3);
  await h.databaseStatus('SUBSCRIBED', 2); assert.equal(h.snapshot().label, 'Notifications');
});

test('a legacy unscoped receipt delivered to the new account listener may refresh but never displays its payload toast', async t => {
  const h = await mount(t, 'completed', { withRoot: true, pathname: '/room' });
  await h.replaceSession(activeSession('account-b', 'generation-b'));
  h.setCount(4); const reads = h.snapshot().summaryReads;
  // This is the newly registered B callback receiving a delayed A payload,
  // not an old captured callback. Legacy producers omit recipient identity.
  await h.emit({ category: 'creator_money_purchase', path: '/channel-settings', body: 'previous account activity' });
  assert.equal(h.snapshot().label, '4 unread notifications');
  assert.equal(h.snapshot().summaryReads, reads + 1);
  assert.equal(h.snapshot().toast, false, 'unbound payload cannot be displayed as current account activity');
});

test('actual root unmount removes its exact channel and retires all late database and native callbacks', async t => {
  const h = await mount(t, 'completed', { withRoot: true });
  assert.equal(h.channels.length, 1); const reads = h.snapshot().summaryReads;
  await h.unmount(); assert.equal(h.channels[0].removed, true);
  await h.database('INSERT', { user_id: 'account-a' }, 0);
  await h.databaseStatus('SUBSCRIBED', 0); await h.oldEmit(0, { recipientUserId: 'account-a' });
  assert.equal(h.snapshot().summaryReads, reads);
});

for (const outcome of ['blocked', 'error', 'throw', 'completed', 'noop', 'zero']) {
  test(`actual mounted dismiss preserves durable action truth for ${outcome}`, async t => {
    const h = await mount(t, outcome); await h.openTray(); await h.dismissRow();
    if (['completed', 'noop'].includes(outcome)) {
      assert.equal(h.snapshot().durableDismissed, true); assert.equal(h.snapshot().rowText, '');
      assert.equal(h.snapshot().label, 'Notifications');
    } else {
      assert.equal(h.snapshot().durableDismissed, false); assert.match(h.snapshot().rowText, /Unread/);
      assert.equal(h.snapshot().label, '1 unread notifications'); assert.equal(h.snapshot().rowDisabled, false);
      assert.match(h.snapshot().trayText, /could not be dismissed.*try again/i);
      h.setOutcome('completed'); await h.dismissRow(); assert.equal(h.snapshot().markCalls, 2);
      assert.equal(h.snapshot().durableDismissed, true); assert.equal(h.snapshot().rowText, '');
      assert.doesNotMatch(h.snapshot().trayText, /could not be dismissed/i);
    }
    assert.equal(h.snapshot().routes, 0); assert.equal(h.snapshot().tray, true);
  });
}

test('actual mark-read rejects an owner-filtered UPDATE returning zero rows', async t => {
  const h = await mount(t, 'zero'); await h.openTray(); await h.openRow();
  assert.equal(h.snapshot().durableRead, false); assert.equal(h.snapshot().result, 'error');
  assert.equal(h.snapshot().label, '1 unread notifications'); assert.equal(h.snapshot().routes, 0);
  assert.match(h.snapshot().rowText, /Unread/); assert.match(h.snapshot().trayText, /could not be marked as read/i);
});

for (const action of ['mark-read', 'dismiss']) {
  test(`stale captured ${action} action cannot decrement a newer authoritative badge when its reread fails`, async t => {
    const h = await mount(t, 'completed', { withRoot: true }); await h.openTray();
    const capturedAction = h.captureRowAction(action);
    // Another device read A, and a separate row B is now the one unread item.
    h.setDurableRead(true); h.setCount(1); await h.database('UPDATE', { user_id: 'account-a' });
    assert.match(h.snapshot().rowText, / · Read · /); assert.equal(h.snapshot().label, '1 unread notifications');
    h.setSummaryReader(async () => { throw new Error('modeled refresh outage'); });
    await capturedAction();
    assert.equal(h.snapshot().label, '1 unread notifications', 'retain the last backed count, never subtract from a captured stale row');
    assert.equal(h.snapshot().routes, action === 'mark-read' ? 1 : 0, 'successful routing does not wait for the failed reread');
    assert.equal(h.snapshot().result, action === 'mark-read' ? 'noop' : 'completed');
  });
}
