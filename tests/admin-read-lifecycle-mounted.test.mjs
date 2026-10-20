import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const React = require("react"), ts = require("typescript");
const { createRoot } = require("react-dom/client");
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const compile = (source, mocks = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => name === "react" ? React : mocks[name], ...mocks });
  return module.exports;
};
const lifecycle = compile(fs.readFileSync("hooks/use-admin-read-lifecycle.ts", "utf8"));
const source = fs.readFileSync(process.env.ADMIN_READ_SOURCE || "app/admin.tsx", "utf8");
const ast = ts.createSourceFile("admin.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const statements = new Map();
const effects = [];
let searchButtonHandler;
function walk(node) {
  if (ts.isJsxSelfClosingElement(node) && node.attributes.properties.some(prop => ts.isJsxAttribute(prop)
    && prop.name.getText(ast) === "testID" && prop.initializer?.text === "admin-user-search-submit-button")) {
    searchButtonHandler = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === "onPress")?.initializer?.expression?.getText(ast);
  }
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(ast) === "useEffect") effects.push(node.getText(ast));
  if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) statements.set(declaration.name.text, node.getText(ast));
  }
  ts.forEachChild(node, walk);
}

async function mountSearch(t) {
  const readEffect = effects.find(text => text.includes("const wantsUserSearch"));
  const auditEffect = effects.find(text => text.includes("writeAdminSearchAudit({"));
  assert.ok(readEffect && auditEffect);
  const empty = { loading: false, connected: false, items: [] };
  let props = { authorityKey: "account-a:session-a", query: "alice", scope: "all", allowed: true, count: 0 }, current;
  const reads = [], audits = [], remembered = [];
  const harness = compile(`
    const { useState, useEffect, useRef, useCallback } = require("react");
    exports.Probe = function Probe() {
      const p = getProps();
      const adminReadAuthorityKey = p.authorityKey, adminSearchDebouncedQuery = p.query,
        adminSearchScope = p.scope, canUseAdminSearch = p.allowed, adminSearchQuery = p.input ?? p.query;
      const setAdminSearchDebouncedQuery = setQuery;
      const adminSearchCanUseScope = scopeAllowed;
      const EMPTY_ADMIN_USERS_READ_MODEL = empty, ADMIN_SEARCH_MIN_LENGTH = 2;
      const [adminSearchUsersReadModel, setAdminSearchUsersReadModel] = useState(empty);
      const [adminSearchAuditReceipt, setAdminSearchAuditReceipt] = useState(null);
      const [adminSearchAuditLoading, setAdminSearchAuditLoading] = useState(false);
      const lastAdminSearchAuditKeyRef = useRef(null);
      const adminSearchResultCountRef = useRef(p.count); adminSearchResultCountRef.current = p.count;
      const adminSearchResults = Array(p.count).fill({});
      ${statements.get("adminSearchUsersAuthorityKey")}
      ${statements.get("runAdminSearchUsersRead")}
      ${statements.get("submitAdminSearch")}
      ${readEffect}
      ${auditEffect}
      capture({ model: adminSearchUsersReadModel, receipt: adminSearchAuditReceipt, loading: adminSearchAuditLoading, press: ${searchButtonHandler} });
      return null;
    };`, {
    useAdminReadLifecycle: lifecycle.useAdminReadLifecycle, empty, getProps: () => props,
    setQuery: value => { props = { ...props, query: value }; },
    scopeAllowed: () => props.allowed, capture: value => { current = value; },
    readAdminUsersReadModel: options => { const pending = deferred(); reads.push({ ...pending, options }); return pending.promise; },
    writeAdminSearchAudit: options => { const pending = deferred(); audits.push({ ...pending, options }); return pending.promise; },
    rememberAdminSearch: (...args) => remembered.push(args), loadAdminImmutableAuditReadModel: noop,
  });
  const root = createRoot(container());
  const act = fn => React.act(async () => { await fn(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
  const render = () => act(() => root.render(React.createElement(harness.Probe)));
  await render(); t.after(() => act(() => root.unmount()));
  return { get current() { return current; }, reads, audits, remembered, act,
    async change(patch) { props = { ...props, ...patch }; await render(); },
  };
}

test("actual Search button refreshes the same query in the global lane", async t => {
  const h = await mountSearch(t);
  await h.act(() => h.reads[0].resolve({ connected: true, items: ["initial"] }));
  await h.act(() => h.current.press());
  assert.equal(h.reads.length, 2); assert.equal(h.reads[1].options.query, "alice");
  await h.act(() => h.reads[1].resolve({ connected: true, items: ["refreshed-search"] }));
  assert.equal(h.current.model.items[0], "refreshed-search");
});

test("actual Search button waits for a changed query ownership key before reading", async t => {
  const h = await mountSearch(t); await h.change({ input: "bob" });
  await h.act(() => h.current.press()); assert.equal(h.reads.length, 1);
  await h.change({}); assert.equal(h.reads.length, 2); assert.equal(h.reads[1].options.query, "bob");
  await h.act(() => h.reads[1].resolve({ connected: true, items: ["bob"] }));
  await h.act(() => h.reads[0].resolve({ connected: true, items: ["alice"] }));
  assert.equal(h.current.model.items[0], "bob");
});

for (const patch of [{ query: "a" }, { scope: "reports" }, { allowed: false }, { authorityKey: null }]) {
  test(`actual Search button respects scope/minimum/authority ${JSON.stringify(patch)}`, async t => {
    const h = await mountSearch(t); await h.change(patch); const count = h.reads.length;
    await h.act(() => h.current.press()); assert.equal(h.reads.length, count);
  });
}

test("global search owns its rows and accepts only current query/session completion", async t => {
  const h = await mountSearch(t); assert.equal(h.reads[0].options.query, "alice");
  await h.change({ query: "bob" }); assert.equal(h.reads[1].options.query, "bob");
  await h.act(() => h.reads[1].resolve({ connected: true, items: ["bob"] }));
  await h.act(() => h.reads[0].resolve({ connected: true, items: ["alice"] }));
  assert.equal(h.current.model.items[0], "bob");
  await h.change({ authorityKey: "account-b:session-b" }); assert.equal(h.reads.length, 3);
  assert.equal(h.current.model.items.length, 0);
  await h.act(() => h.reads[2].resolve({ connected: true, items: ["account-b-bob"] }));
  assert.equal(h.current.model.items[0], "account-b-bob");
});

for (const patch of [{ query: "" }, { scope: "reports" }, { allowed: false }, { authorityKey: null }]) {
  test(`global search invalidation ${JSON.stringify(patch)} retires held user read`, async t => {
    const h = await mountSearch(t); await h.change(patch);
    await h.act(() => h.reads[0].resolve({ connected: true, items: ["private"] }));
    assert.equal(h.current.model.items.length, 0); assert.equal(h.current.model.loading, false);
  });
}

test("search result-count changes cannot strand an in-flight audit spinner", async t => {
  const h = await mountSearch(t); assert.equal(h.current.loading, true);
  await h.change({ count: 5 }); assert.equal(h.audits.length, 1);
  await h.act(() => h.audits[0].resolve({ ok: true, resultCount: 0 }));
  assert.equal(h.current.loading, false); assert.equal(h.current.receipt.ok, true); assert.equal(h.remembered.length, 1);
});

test("search audits are reissued for new session and old receipts cannot publish", async t => {
  const h = await mountSearch(t); await h.change({ authorityKey: "account-a:new-session" });
  assert.equal(h.audits.length, 2);
  await h.act(() => h.audits[0].resolve({ ok: true, resultCount: 9 }));
  assert.equal(h.current.receipt, null); assert.equal(h.current.loading, true);
  await h.act(() => h.audits[1].reject(Error("audit failed")));
  assert.equal(h.current.loading, false); assert.equal(h.current.receipt.ok, false);
});
walk(ast);
const lanes = [
  ["V1", "Usage", "Usage", "EMPTY_ADMIN_V1_READ_MODEL"],
  ["Users", "Users", "Users", "EMPTY_ADMIN_USERS_READ_MODEL"],
  ["UsageDetail", "UsageDetail", "UsageDetail", "EMPTY_ADMIN_USAGE_DETAIL_READ_MODEL"],
  ["SystemHistory", "SystemHistory", "SystemHistory", "EMPTY_ADMIN_SYSTEM_HISTORY_READ_MODEL"],
  ["MediaScan", "MediaScan", "MediaScan", "EMPTY_ADMIN_MEDIA_SCAN_READ_MODEL"],
];

// Mount the actual production loader declarations and lifecycle hook. Only the
// API boundary and surrounding screen state are modeled; this is not full-screen
// rendering, SQL/RLS, native, or installed-device evidence.
async function mount(t, lane) {
  const [model, runner, reader, emptyName] = lane;
  const loadName = `loadAdmin${model}ReadModel`, runName = `runAdmin${runner}Read`;
  assert.ok(statements.has(loadName));
  const empty = { loading: false, connected: false, items: [] };
  const queue = [], calls = [];
  let current, authorityKey = "account-a:session-a:owner", unmounted = false;
  const harness = compile(`
    const { useState, useCallback } = require("react");
    exports.Probe = function Probe() {
      const adminReadAuthorityKey = getAuthority();
      const ${emptyName} = empty;
      const [admin${model}ReadModel, setAdmin${model}ReadModel] = useState(empty);
      const adminUsersQuery = "directory";
      ${statements.get(runName) ?? ""}
      ${statements.get(loadName)}
      capture({ model: admin${model}ReadModel, load: ${loadName} });
      return null;
    };`, {
      useAdminReadLifecycle: lifecycle.useAdminReadLifecycle,
      empty, getAuthority: () => authorityKey, capture: value => { current = value; },
      [`readAdmin${reader}ReadModel`]: options => { calls.push(options); return queue.shift().promise; },
    });
  const root = createRoot(container());
  const act = fn => React.act(async () => { await fn(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
  const render = () => act(() => root.render(React.createElement(harness.Probe)));
  const unmount = async () => { if (!unmounted) { unmounted = true; await act(() => root.unmount()); } };
  await render(); t.after(unmount);
  return { get model() { return current.model; }, get load() { return current.load; }, calls, act, unmount,
    async start(selection) { const pending = deferred(); queue.push(pending); await act(() => { void current.load(selection); }); return pending; },
    async authority(value) { authorityKey = value; await render(); },
  };
}

for (const lane of lanes) {
  test(`${lane[0]}: equivalent authority render preserves a current read`, async t => {
    const h = await mount(t, lane), pending = await h.start();
    await h.authority("account-a:session-a:owner");
    await h.act(() => pending.resolve({ connected: true, items: ["current"] }));
    assert.equal(h.model.items[0], "current");
  });
  test(`${lane[0]}: latest server denial clears rows and older success cannot restore them`, async t => {
    const h = await mount(t, lane), old = await h.start(), denied = await h.start();
    await h.act(() => denied.resolve({ connected: false, items: [] }));
    await h.act(() => old.resolve({ connected: true, items: ["private"] }));
    assert.equal(h.model.items.length, 0); assert.equal(h.model.connected, false); assert.equal(h.model.loading, false);
  });
  test(`${lane[0]}: production loader keeps newest response when reads finish backwards`, async t => {
    const h = await mount(t, lane), old = await h.start("old"), latest = await h.start("latest");
    await h.act(() => latest.resolve({ connected: true, items: ["latest"] }));
    await h.act(() => old.resolve({ connected: true, items: ["old"] }));
    assert.equal(h.model.items[0], "latest"); assert.equal(h.model.loading, false);
  });
  for (const authority of [null, "account-b:session-b:owner", "account-a:session-new:owner", "account-a:session-a:operator"]) {
    test(`${lane[0]}: retiring authority ${authority} clears rows and rejects old completion/handler`, async t => {
      const h = await mount(t, lane), staleHandler = h.load, old = await h.start();
      await h.authority(authority);
      await h.act(() => old.resolve({ connected: true, items: ["private-old"] }));
      assert.equal(h.model.items.length, 0); assert.equal(h.model.loading, false);
      const count = h.calls.length; await h.act(() => staleHandler()); assert.equal(h.calls.length, count);
      if (authority) {
        const latest = await h.start(); await h.act(() => latest.resolve({ connected: true, items: ["current"] }));
        assert.equal(h.model.items[0], "current");
      }
    });
  }
  test(`${lane[0]}: rejection clears loading and data; latest retry recovers`, async t => {
    const h = await mount(t, lane), seed = await h.start();
    await h.act(() => seed.resolve({ connected: true, items: ["private"] }));
    const failed = await h.start("selected"); await h.act(() => failed.reject(Error("access revoked")));
    assert.equal(h.model.loading, false); assert.equal(h.model.connected, false); assert.equal(h.model.items.length, 0);
    const retry = await h.start(); await h.act(() => retry.resolve({ connected: true, items: ["recovered"] }));
    assert.equal(h.model.items[0], "recovered");
  });
  test(`${lane[0]}: old rejection cannot clear latest in-flight request`, async t => {
    const h = await mount(t, lane), old = await h.start(), latest = await h.start();
    await h.act(() => old.reject(Error("old failure"))); assert.equal(h.model.loading, true);
    await h.act(() => latest.resolve({ connected: true, items: ["latest"] })); assert.equal(h.model.loading, false);
  });
  test(`${lane[0]}: unmount retires read and stale callable`, async t => {
    const h = await mount(t, lane), load = h.load, old = await h.start(); await h.unmount();
    await h.act(() => old.resolve({ connected: true, items: ["late"] }));
    const count = h.calls.length; await load(); assert.equal(h.calls.length, count);
  });
}
