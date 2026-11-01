import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createSharedVisualLoader } from './helpers/shared-visual-host.mjs';

const compile = (file, imports) => {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText)(imports, module, module.exports);
  return module.exports;
};
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const category = (patch = {}) => ({ id: uuid(1), categoryKey: 'reviewed-shirts', label: 'Reviewed shirts', revision: 1,
  scopeDescription: 'Shirts that meet the documented physical-goods scope.', taxCode: 'txcd_123', taxBehavior: 'inclusive',
  professionalBasisReference: 'Official classification guidance', coverageEvidenceReference: 'Documented scope reference',
  expiresAt: '2099-12-31T00:00:00.000Z', revokedAt: null, current: true, ...patch });
const request = (patch = {}) => ({ id: uuid(2), productId: uuid(3), creatorId: uuid(4), title: 'Creator item', note: 'Please review this item.',
  status: 'review_required', current: true, createdAt: '2026-10-31T00:00:00.000Z', suggestedCategoryId: null,
  classificationStatus: 'missing', providerStatus: 'missing', accountStatus: 'unknown', jurisdictionStatus: 'unknown', ...patch });
const queue = (patch = {}) => ({ requests: [request()], categories: [category()], nextCursor: null, ...patch });
const catalog = (patch = {}) => ({ codes: [
  { id: 'txcd_123', name: 'Provider physical-goods choice', description: 'Exact provider description, not an invented mapping.', supported: true },
  { id: 'txcd_456', name: 'Location-dependent choice', description: 'Requires a performance location.', supported: false },
], hasMore: false, nextCursor: null, providerReady: false, ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const account = (userId = 'A', sessionGeneration = '1') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
function transport() {
  let session = account(), capture = null, response = queue(), catalogResponse = catalog(), rpcBehavior = null, edgeBehavior = null;
  const listeners = new Set(), rpcCalls = [], edgeCalls = [], captures = [];
  const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  const authority = {
    getCurrentAccountSessionAuthoritySnapshot: () => session,
    sameAccountSessionAuthority: same,
    subscribeToAccountSessionAuthority: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const bound = {
    captureAccountBoundSupabaseMutationSubject: async expected => {
      const initial = session; captures.push(expected);
      if (capture) await capture;
      return { authority: initial, accessToken: `frozen-${initial.userId}-${initial.sessionGeneration}` };
    },
    assertAccountBoundSupabaseMutationSubjectCurrent: subject => { if (!same(subject.authority, session)) throw Error('account changed'); },
    invokeAccountBoundSupabaseMutationRpc: async (subject, name, args) => {
      rpcCalls.push({ subject, name, args });
      if (rpcBehavior) return rpcBehavior(name, args);
      if (name === 'get_owner_merch_tax_review_queue') return { data: response, error: null };
      if (name === 'review_owner_merch_tax_category') return { data: { id: uuid(9), categoryKey: args.p_category_key, label: args.p_label, revision: args.p_expected_revision + 1, providerReady: false }, error: null };
      return { data: { status: name === 'resolve_owner_merch_tax_request' ? 'reviewed' : 'revoked', ...(name === 'resolve_owner_merch_tax_request' ? { providerReady: false } : {}) }, error: null };
    },
  };
  const supabase = { functions: { invoke: async (name, options) => { edgeCalls.push({ name, options }); return edgeBehavior ? edgeBehavior(name, options) : { data: catalogResponse, error: null }; } } };
  const helper = compile('_lib/ownerMerchTaxReview.ts', name => name.endsWith('/accountBoundSupabaseMutation') ? bound : name.endsWith('/accountSessionAuthority') ? authority : { supabase });
  return { helper, authority, rpcCalls, edgeCalls, captures,
    get session() { return session; },
    setSession(value) { session = value; listeners.forEach(fn => fn(value)); },
    setCapture(value) { capture = value; }, setQueue(value) { response = value; }, setCatalog(value) { catalogResponse = value; },
    setRpc(value) { rpcBehavior = value; }, setEdge(value) { edgeBehavior = value; },
  };
}

test('strict queue/catalog parsing keeps classification, provider, account and jurisdiction evidence separate', () => {
  const h = transport();
  const parsed = h.helper.parseOwnerTaxReviewQueue(queue());
  assert.equal(parsed.requests[0].providerStatus, 'missing'); assert.equal(parsed.requests[0].accountStatus, 'unknown');
  const missing = request(); delete missing.accountStatus; delete missing.jurisdictionStatus;
  assert.equal(h.helper.parseOwnerTaxReviewQueue(queue({ requests: [missing] })).requests[0].accountStatus, 'unknown');
  for (const patch of [{ requests: [request({ status: 'approved_for_sales' })] }, { requests: [request(), request()] },
    { categories: [category({ taxBehavior: 'exclusive' })] }, { categories: [category({ revision: 1.5 })] },
    { nextCursor: { createdAt: 'invalid', id: uuid(2) } }, { requests: [request({ providerStatus: 'exempt' })] }]) {
    assert.throws(() => h.helper.parseOwnerTaxReviewQueue(queue(patch)), /unavailable/);
  }
  assert.equal(h.helper.parseOwnerTaxCatalog(catalog()).codes[1].supported, false);
  for (const patch of [{ providerReady: true }, { hasMore: true }, { codes: [{ ...catalog().codes[0], supported: undefined }] },
    { codes: [catalog().codes[0], catalog().codes[0]] }, { nextCursor: 'txcd_999', hasMore: true }]) {
    assert.throws(() => h.helper.parseOwnerTaxCatalog(catalog(patch)), /unavailable/);
  }
});

test('account-bound helper freezes token, retires A → B → A and checks intent after capture before dispatch', async () => {
  const h = transport();
  await h.helper.readOwnerTaxCatalog(() => true);
  assert.equal(h.edgeCalls[0].options.headers.Authorization, 'Bearer frozen-A-1');
  assert.deepEqual(h.edgeCalls[0].options.body, {});
  const held = deferred(); h.setCapture(held.promise);
  const read = h.helper.readOwnerTaxReviewQueue(() => true);
  h.setSession(account('B', '2')); h.setSession(account()); held.resolve();
  await assert.rejects(read, /unavailable/); assert.equal(h.rpcCalls.length, 0);
  let current = true; const capture = deferred(); h.setCapture(capture.promise);
  const write = h.helper.revokeOwnerTaxCategory(uuid(1), () => current);
  current = false; capture.resolve(); await assert.rejects(write, /could not be confirmed/); assert.equal(h.rpcCalls.length, 0);
});

test('mutation helpers use expected revision, sanitize denial/unknown errors and never send provider authority fields', async () => {
  const h = transport();
  const input = { categoryKey: 'reviewed-shirts', label: 'Reviewed shirts', scopeDescription: 'Only physical shirts that match this scope.', taxCode: 'txcd_123',
    professionalBasisReference: 'Official reference', coverageEvidenceReference: 'Scope reference', expiresAt: '2099-12-31T00:00:00.000Z', expectedRevision: 2 };
  assert.equal((await h.helper.reviewOwnerTaxCategory(input, () => true)).revision, 3);
  assert.equal(h.rpcCalls[0].args.p_expected_revision, 2); assert.equal(h.rpcCalls[0].args.p_tax_behavior, 'inclusive');
  assert.ok(!Object.keys(h.rpcCalls[0].args).some(key => /provider|registration|exempt|account/i.test(key)));
  h.setRpc(async () => ({ data: null, error: { message: 'tax_category_revision_changed PRIVATE_PAYLOAD' } }));
  await assert.rejects(h.helper.reviewOwnerTaxCategory(input, () => true), error => /newer revision/.test(error.message) && !error.message.includes('PRIVATE'));
  h.setRpc(async () => ({ data: null, error: { message: 'credentials or provider private data' } }));
  await assert.rejects(h.helper.resolveOwnerTaxRequest(uuid(2), uuid(1), 'Reviewed item scope', () => true), error => /could not be confirmed/.test(error.message) && !error.message.includes('credentials'));
  const before = h.rpcCalls.length;
  await assert.rejects(h.helper.reviewOwnerTaxCategory({ ...input, expiresAt: '2000-01-01' }, () => true), /future review date/);
  assert.equal(h.rpcCalls.length, before);
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
async function mount(t, options = {}) {
  const api = transport(), nodes = new Map(); let focused = options.focused ?? true;
  if (options.queue) api.setQueue(options.queue);
  if (options.rpc) api.setRpc(options.rpc);
  const host = name => function Host(props) {
    const key = React.useId(); nodes.set(key, { name, props });
    React.useLayoutEffect(() => { nodes.set(key, { name, props }); return () => nodes.delete(key); });
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(child => typeof child === 'object'));
  };
  const native = Object.fromEntries(['View', 'Text', 'Pressable', 'TextInput'].map(name => [name, host(name)]));
  const visuals = createSharedVisualLoader(React, native, host);
  const mod = compile('components/admin/owner-tax-category-review.tsx', name => visuals(name) ?? (name === 'react' ? React : name === 'react-native' ? native : name === '@react-navigation/native' ? { useIsFocused: () => focused } : name.endsWith('/accountSessionAuthority') ? api.authority : api.helper));
  let props = { isOwner: options.isOwner ?? true, ownerSessionKey: JSON.stringify(api.session) };
  const root = createRoot(container());
  const act = fn => React.act(async () => { await fn(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
  const render = () => act(() => root.render(options.strict ? React.createElement(React.StrictMode, null, React.createElement(mod.OwnerTaxCategoryReviewPanel, props)) : React.createElement(mod.OwnerTaxCategoryReviewPanel, props)));
  const text = value => Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object' ? text(value.props?.children) : value ?? '';
  const visible = () => [...nodes.values()].filter(node => node.name === 'Text').map(node => text(node.props.children)).join(' ');
  const button = label => { const node = [...nodes.values()].find(node => node.name === 'Pressable' && node.props.accessibilityLabel === label); assert.ok(node, `Button missing: ${label}\n${visible()}`); return node.props; };
  const press = label => act(() => { const node = button(label); assert.notEqual(node.disabled, true, `Disabled: ${label}`); node.onPress(); });
  const field = (label, value) => act(() => { const node = [...nodes.values()].find(node => node.name === 'TextInput' && node.props.accessibilityLabel === label); assert.ok(node, `Field missing ${label}`); node.props.onChangeText(value); });
  t.after(() => act(() => root.unmount())); await render();
  return { api, act, render, visible, button, press, field, nodes,
    async props(patch) { props = { ...props, ...patch }; await render(); },
    async focus(value) { focused = value; await render(); },
    async session(value, matchOwner = true) { await act(() => { api.setSession(value); if (matchOwner) props.ownerSessionKey = JSON.stringify(value); }); await render(); },
  };
}

test('mounted owner-only panel provides honest empty/loading/retry states and shared visual/accessibility contracts', async t => {
  const h = await mount(t, { isOwner: false });
  assert.equal(h.api.rpcCalls.length, 0); assert.equal(h.visible(), '');
  await h.props({ isOwner: true });
  assert.equal(h.api.edgeCalls.length, 0); // Merely opening Money Center never calls the provider catalog.
  assert.match(h.visible(), /Creator item/); assert.match(h.visible(), /Provider setup:.*Evidence needed/);
  assert.match(h.visible(), /Tax responsibility \/ location coverage:.*Not verified/);
  assert.match(h.visible(), /Payment and payout switches are not changed/);
  const card = [...h.nodes.values()].find(node => node.props.testID === 'owner-tax-category-review');
  assert.equal(card.props.style.backgroundColor, 'rgba(7,5,27,0.91)');
  assert.ok([...h.nodes.values()].filter(node => node.name === 'Pressable').every(node => node.props.accessibilityRole === 'button' && node.props.style.minHeight >= 44));
  h.api.setRpc(async () => { throw Error('PRIVATE provider failure'); }); await h.press('Refresh category reviews');
  assert.match(h.visible(), /queue is unavailable/); assert.doesNotMatch(h.visible(), /Creator item|PRIVATE/);
  h.api.setRpc(null); h.api.setQueue(queue({ requests: [], categories: [] })); await h.press('Retry category reviews');
  assert.match(h.visible(), /No category requests/); assert.match(h.visible(), /Nothing is pre-approved/);
  const pending = deferred(); h.api.setRpc(() => pending.promise); await h.press('Refresh category reviews');
  assert.match(h.visible(), /Loading category reviews/); assert.equal(h.button('Refresh category reviews').disabled, true);
  await h.focus(false); await h.act(() => pending.resolve({ data: queue(), error: null })); assert.equal(h.visible(), '');
  h.api.setRpc(null); h.api.setQueue(queue()); await h.focus(true); assert.match(h.visible(), /Creator item/);
  await h.session({ ...account(), restoreOnly: true }); assert.equal(h.visible(), '');
  const source = fs.readFileSync('app/admin.tsx', 'utf8');
  assert.match(source, /isOwnerStaff && adminReadAuthorityKey \? <OwnerTaxCategoryReviewPanel isOwner=\{isOwnerStaff\} ownerSessionKey=\{JSON.stringify\(authority\)\}/);
});

test('mounted batched A → B → A and replacement-session reads never revive private rows or stale actions', async t => {
  const h = await mount(t); const oldReview = h.button('Review category for Creator item').onPress;
  const pending = deferred(); h.api.setRpc(() => pending.promise); await h.press('Refresh category reviews');
  h.api.setRpc(null);
  await h.act(() => { h.api.setSession(account('B', '2')); h.api.setSession(account()); });
  await h.act(() => pending.resolve({ data: queue({ requests: [request({ title: 'STALE PRIVATE ITEM' })] }), error: null }));
  assert.doesNotMatch(h.visible(), /STALE PRIVATE/);
  await h.act(() => oldReview()); assert.ok(![...h.nodes.values()].some(node => node.props.testID === 'owner-tax-request-editor'));
  await h.session(account('B', '2'), false); assert.equal(h.visible(), '');
  await h.props({ ownerSessionKey: JSON.stringify(h.api.session) }); assert.match(h.visible(), /Creator item/);
  await h.props({ isOwner: false }); assert.equal(h.visible(), '');
});

test('mounted category revision uses friendly verified choices, rejects unsupported codes, and single-flights explicit confirmation', async t => {
  const h = await mount(t);
  await h.press('Review new revision of Reviewed shirts');
  assert.match(h.visible(), /Exact provider description/);
  assert.equal([...h.nodes.values()].find(node => node.name === 'TextInput' && node.props.accessibilityLabel === 'Classification reference / reason').props.value, 'Official classification guidance');
  assert.equal(h.button('Choose Location-dependent choice').disabled, true);
  assert.ok(![...h.nodes.values()].some(node => node.name === 'TextInput' && /tax code/i.test(node.props.accessibilityLabel)));
  assert.equal(h.button('Review category before saving').disabled, true);
  await h.press('I reviewed this scope and its references'); await h.press('Review category before saving');
  const saved = deferred(); h.api.setRpc((name, args) => name === 'review_owner_merch_tax_category' ? saved.promise : Promise.resolve({ data: queue(), error: null }));
  const confirm = h.button('Confirm category review').onPress;
  await h.act(() => { confirm(); confirm(); });
  const writes = h.api.rpcCalls.filter(call => call.name === 'review_owner_merch_tax_category');
  assert.equal(writes.length, 1); assert.equal(writes[0].args.p_expected_revision, 1);
  assert.match(h.visible(), /Saving review/);
  await h.act(() => saved.resolve({ data: { id: uuid(9), categoryKey: 'reviewed-shirts', label: 'Reviewed shirts', revision: 2, providerReady: false }, error: null }));
  assert.match(h.visible(), /Category review saved/); assert.match(h.visible(), /still separate requirements/);
  assert.ok(h.api.rpcCalls.every(call => ['get_owner_merch_tax_review_queue', 'review_owner_merch_tax_category'].includes(call.name)));
});

test('mounted cancel/edit replacement retires old confirmation, stale catalog, and pre-dispatch capture', async t => {
  const h = await mount(t); await h.press('Review new revision of Reviewed shirts');
  await h.press('I reviewed this scope and its references'); await h.press('Review category before saving');
  const old = h.button('Confirm category review').onPress;
  await h.field('Category name', 'Changed reviewed shirts'); await h.act(() => old());
  assert.equal(h.api.rpcCalls.filter(call => call.name === 'review_owner_merch_tax_category').length, 0);
  await h.press('Cancel category editing'); await h.act(() => old());
  assert.equal(h.api.rpcCalls.filter(call => call.name === 'review_owner_merch_tax_category').length, 0);
  const edge = deferred(); h.api.setEdge(() => edge.promise); await h.press('Add reviewed category');
  assert.match(h.visible(), /Loading verified provider choices/); await h.press('Cancel category editing');
  await h.act(() => edge.resolve({ data: catalog(), error: null })); assert.doesNotMatch(h.visible(), /Exact provider description/);
  h.api.setEdge(null); await h.press('Review new revision of Reviewed shirts');
  await h.press('I reviewed this scope and its references'); await h.press('Review category before saving');
  const capture = deferred(); h.api.setCapture(capture.promise); await h.press('Confirm category review');
  await h.focus(false); await h.act(() => capture.resolve());
  assert.equal(h.api.rpcCalls.filter(call => call.name === 'review_owner_merch_tax_category').length, 0);
});

test('mounted changed revision and server denial clear action state; refresh is required before retry', async t => {
  const h = await mount(t); await h.press('Revoke Reviewed shirts');
  h.api.setRpc(async name => name === 'revoke_owner_merch_tax_category' ? { data: null, error: { message: 'tax_category_revision_changed private data' } } : { data: queue({ categories: [category({ revision: 2 })] }), error: null });
  await h.press('Confirm category revocation'); assert.match(h.visible(), /newer revision/); assert.doesNotMatch(h.visible(), /private data|Review new revision/);
  await h.press('Retry category reviews'); assert.match(h.visible(), /Revision\s+2/);
  await h.press('Review category for Creator item'); await h.press('Suggest Reviewed shirts revision 2');
  await h.field('Review note for this item', 'Matches this reviewed scope'); await h.press('Review category suggestion');
  h.api.setRpc(async () => ({ data: null, error: { message: 'owner_current_session_required secrets' } }));
  await h.press('Confirm category suggestion'); assert.match(h.visible(), /Owner access could not be verified/); assert.doesNotMatch(h.visible(), /secrets/);
});

test('mounted unknown-request review only suggests a current category and paginates with an exact cursor', async t => {
  const cursor = { createdAt: request().createdAt, id: request().id }, h = await mount(t, { queue: queue({ nextCursor: cursor }) });
  await h.press('Next page of creator requests');
  assert.deepEqual(h.api.rpcCalls.at(-1).args, { p_limit: 50, p_before: cursor.createdAt, p_before_id: cursor.id });
  await h.press('Review category for Creator item');
  assert.equal(h.button('Review category suggestion').disabled, true);
  await h.press('Suggest Reviewed shirts revision 1'); await h.field('Review note for this item', 'Reviewed scope applies');
  await h.press('Review category suggestion'); await h.press('Confirm category suggestion');
  assert.match(h.visible(), /creator must select it/); assert.match(h.visible(), /not changed or published/);
  const call = h.api.rpcCalls.find(call => call.name === 'resolve_owner_merch_tax_request');
  assert.deepEqual(call.args, { p_request_id: uuid(2), p_category_id: uuid(1), p_note: 'Reviewed scope applies' });
  assert.ok(h.api.rpcCalls.every(call => ['get_owner_merch_tax_review_queue', 'resolve_owner_merch_tax_request'].includes(call.name)));
});

test('mounted missing provider connection is retryable and cannot silently save a raw code', async t => {
  const h = await mount(t); h.api.setEdge(async () => ({ data: null, error: { message: 'secret provider details' } }));
  await h.press('Review new revision of Reviewed shirts');
  assert.match(h.visible(), /Provider category choices are unavailable/); assert.doesNotMatch(h.visible(), /secret provider details/);
  assert.equal(h.button('I reviewed this scope and its references').disabled, true);
  h.api.setEdge(null); await h.press('Refresh provider category choices');
  assert.equal(h.button('I reviewed this scope and its references').disabled, false);
  await h.field('Review expires (YYYY-MM-DD, UTC)', '2099-02-31'); assert.equal(h.button('I reviewed this scope and its references').disabled, true);
});

test('mounted new category has no seeded classification and saves revision zero only after explicit complete review', async t => {
  const h = await mount(t, { queue: queue({ requests: [], categories: [] }) });
  await h.press('Add reviewed category');
  assert.equal(h.button('Choose Provider physical-goods choice').accessibilityState.selected, false);
  assert.equal(h.button('I reviewed this scope and its references').disabled, true);
  await h.field('Category name', 'New reviewed scope');
  await h.field('Items included and excluded', 'Only physical products that satisfy this documented narrow scope.');
  await h.press('Choose Provider physical-goods choice');
  await h.field('Classification reference / reason', 'Relevant official guidance');
  await h.field('Coverage reference / reason', 'Documented coverage limits');
  await h.field('Review expires (YYYY-MM-DD, UTC)', '2099-12-31');
  await h.press('I reviewed this scope and its references'); await h.press('Review category before saving');
  await h.press('Confirm category review');
  const call = h.api.rpcCalls.find(call => call.name === 'review_owner_merch_tax_category');
  assert.equal(call.args.p_expected_revision, 0); assert.equal(call.args.p_category_key, 'new-reviewed-scope');
  assert.equal(call.args.p_tax_code, 'txcd_123'); assert.match(h.visible(), /Category review saved/);
});

test('mounted Strict Mode cleanup reissues a current load rather than stranding a retired spinner', async t => {
  const h = await mount(t, { strict: true });
  assert.match(h.visible(), /Creator item/); assert.doesNotMatch(h.visible(), /Loading category reviews/);
  assert.equal(h.button('Refresh category reviews').disabled, false);
});

test('mounted review displays snapshot description and variant details, but superseded requests are history only', async t => {
  const h = await mount(t, { queue: queue({ requests: [request({ current: false, description: 'Child-sized physical item.', variants: [{ id: uuid(8), sku: 'SMALL', size: 'Child small', color: 'Blue' }] })] }) });
  assert.match(h.visible(), /Child-sized physical item/); assert.match(h.visible(), /Child small/); assert.match(h.visible(), /review history only/);
  assert.ok(![...h.nodes.values()].some(node => node.name === 'Pressable' && node.props.accessibilityLabel === 'Review category for Creator item'));
});
