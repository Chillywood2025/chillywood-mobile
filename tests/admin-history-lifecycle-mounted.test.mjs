import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react'), ts = require('typescript'), { createRoot } = require('react-dom/client');
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: 'http://www.w3.org/1999/xhtml', nodeName: 'DIV', nodeType: 1, ownerDocument: doc, parentNode: null, tagName: 'DIV' });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; };
const page = (ids, cursor = null) => ({ items: ids.map(id => ({ id })), hasMore: cursor !== null, nextCursor: cursor });
async function mount(t) {
  let scope = 'account-one:filter-one', session = { userId: 'one', sessionGeneration: 'one' }, current;
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('hooks/use-admin-history-read.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: module.exports, module,
    require: name => name === 'react' ? React : {
      getCurrentAccountSessionAuthoritySnapshot: () => session,
      sameAccountSessionAuthority: (a, b) => a?.userId === b?.userId && a?.sessionGeneration === b?.sessionGeneration,
    },
  });
  const key = row => row.id;
  function Probe() { const [items, setItems] = React.useState([]); current = module.exports.useAdminHistoryRead(scope, items, setItems, key, session); return null; }
  const root = createRoot(container());
  const act = callback => React.act(async () => { await callback(); await Promise.resolve(); });
  const render = () => act(() => root.render(React.createElement(Probe)));
  await render(); let mounted = true;
  const unmount = async () => { if (mounted) { mounted = false; await act(() => root.unmount()); } };
  t.after(unmount);
  const reads = [];
  const read = cursor => { const d = deferred(); reads.push({ ...d, cursor }); return d.promise; };
  return { get current() { return current; }, reads, read, act, unmount,
    async start(append = false) { let promise; await act(() => { promise = current.load(read, append); }); return { promise }; },
    async change(value) { scope = value; await render(); }, session: value => { session = value; },
  };
}

test('mounted history hook traverses three pages, prevents duplicate Load More and deduplicates overlaps', async t => {
  const h = await mount(t); await h.start(); await h.act(() => h.reads[0].resolve(page(['a', 'b'], 'cursor-one')));
  await h.start(true); await h.start(true); assert.equal(h.reads.length, 2);
  await h.act(() => h.reads[1].resolve(page(['b', 'c'], 'cursor-two')));
  await h.start(true); await h.act(() => h.reads[2].resolve(page(['d'])));
  assert.deepEqual(Array.from(h.current.items, row => row.id), ['a', 'b', 'c', 'd']);
  assert.equal(h.current.page.hasMore, false); await h.start(true); assert.equal(h.reads.length, 3);
});

test('stale filter/account continuation and failure cannot alter the new list', async t => {
  const h = await mount(t); await h.start(); await h.act(() => h.reads[0].resolve(page(['a'], 'older')));
  await h.start(true); h.session({ userId: 'two', sessionGeneration: 'two' });
  await h.change('account-two:filter-two'); assert.equal(h.current.items.length, 0); await h.start();
  await h.act(() => h.reads[1].reject(new Error('stale error')));
  assert.equal(h.current.loading, true); assert.equal(h.current.error, null);
  await h.act(() => h.reads[2].resolve(page(['new']))); assert.equal(h.current.items[0].id, 'new');
});

test('refresh retires a running continuation and retry preserves existing rows', async t => {
  const h = await mount(t); await h.start(); await h.act(() => h.reads[0].resolve(page(['a'], 'older')));
  await h.start(true); await h.start(); await h.act(() => h.reads[2].resolve(page(['fresh'], 'next')));
  await h.act(() => h.reads[1].resolve(page(['stale']))); assert.equal(h.current.items[0].id, 'fresh');
  await h.start(true); await h.act(() => h.reads[3].reject(new Error('offline')));
  assert.equal(h.current.items[0].id, 'fresh'); assert.ok(h.current.error); assert.equal(h.current.loading, false);
  await h.start(true); assert.equal(h.reads[4].cursor, 'next'); await h.act(() => h.reads[4].resolve(page(['last'])));
  assert.equal(h.current.items.length, 2);
});

test('repeated cursor errors preserve continuation and do not pretend history is complete', async t => {
  const h = await mount(t); await h.start(); await h.act(() => h.reads[0].resolve(page(['a'], 'same')));
  await h.start(true); await h.act(() => h.reads[1].resolve(page(['b'], 'same')));
  assert.equal(h.current.items.length, 1); assert.equal(h.current.page.hasMore, true); assert.ok(h.current.error);
});

test('permission loss, unmount and unrendered session replacement retire in-flight reads', async t => {
  const h = await mount(t); await h.start(); h.session({ userId: 'other', sessionGeneration: 'two' });
  await h.act(() => h.reads[0].resolve(page(['stale']))); assert.equal(h.current.items.length, 0);
  await h.change(null); await h.start(); assert.equal(h.reads.length, 1);
  await h.change('new'); await h.start(); await h.unmount(); h.reads[1].resolve(page(['after-unmount']));
});

test('actual Legal/Audit loaders forward the cursor and source filters into their protected reads', () => {
  const source = fs.readFileSync('app/admin.tsx', 'utf8');
  assert.match(source, /loadLegalHistoryPage\(\(cursor\) => listLegalRequestsPage\(\{\s*limit: 50, cursor, status: legalRequestStatusFilter, search: legalRequestSearch\.trim\(\)/);
  assert.match(source, /loadAuditHistoryPage\(async \(cursor\) => \{/);
  assert.match(source, /onPress=\{\(\) => void loadAuditExplorer\(true\)\}/);
  assert.match(source, /Counts cover loaded requests matching the current filters/);
});

test('an old mounted callback cannot start a read after an unrendered session change', async t => {
  const h = await mount(t); h.session({ userId: 'one', sessionGeneration: 'two' });
  await h.start(); assert.equal(h.reads.length, 0);
});
