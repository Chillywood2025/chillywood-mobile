import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const React = require("react"), ts = require("typescript");
const { createRoot } = require("react-dom/client");
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
function compile(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { module, exports: module.exports, require: name => name === "react" ? React : name === "react-native-safe-area-context" ? { SafeAreaView: props => React.createElement(React.Fragment, null, props.children) } : name === "./content-inspection-media-viewer" ? { ContentInspectionMediaViewer: () => null } : mocks[name], crypto: webcrypto, Uint8Array, Date, setTimeout, clearTimeout });
  return module.exports;
}
const a = { userId: "00000000-0000-4000-8000-000000000001", accountId: "00000000-0000-4000-8000-000000000001", sessionGeneration: "session-a", state: "ACTIVE", restoreOnly: false };
const target = { targetType: "chat_message", targetId: "00000000-0000-4000-8000-000000000002" };
const contextId = "00000000-0000-4000-8000-000000000003";
const same = (left, right) => !!left && !!right && JSON.stringify(left) === JSON.stringify(right);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const authorityModule = { sameAccountSessionAuthority: same };
const loadApi = (capture = async () => ({ authority: a, accessToken: "fixture-only" }), invoke = async () => ({ data: {}, error: null })) => compile("_lib/contentInspection.ts", { "react-native-get-random-values": {}, "./accountSessionAuthority": authorityModule, "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: capture, invokeAccountBoundSupabaseMutationRpc: invoke } });
const apiModule = loadApi();
const data = { ...target, contextId, availability: "available", storedVersion: "fixture", sourceUpdatedAt: null, content: { body: " private fixture\nunchanged " }, restrictionLabels: ["private"], mediaAvailability: "unsupported_media_inspection", deletedRetentionAvailability: "not_implemented" };

async function mount(t) {
  const calls = [];
  const api = Object.fromEntries(["listContexts", "listSubjectTargets", "scope", "createContext", "read", "grant", "revoke", "closeContext"].map(name => [name, (...args) => { const pending = deferred(); calls.push({ name, args, ...pending }); return pending.promise; }]));
  const source = compile("components/admin/content-inspection-panel.tsx", { "react-native": { StyleSheet: { create: value => value } }, "../../_lib/accountSessionAuthority": authorityModule, "../../_lib/contentInspection": { ...apiModule, contentInspection: api } });
  let current, key = "a", authority = a;
  function Probe() { current = source.useContentInspectionPanel(authority, target); return null; }
  const root = createRoot(container());
  const act = fn => React.act(async () => { await fn(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  const render = () => act(() => root.render(React.createElement(Probe, { key })));
  await render(); t.after(() => act(() => root.unmount()));
  return { get current() { return current; }, calls, act, async switchAccount() { authority = { ...a, sessionGeneration: "new-session" }; key = "new"; await render(); } };
}
async function prepare(h) { await h.act(() => h.current.changeContext(contextId)); await h.act(() => h.current.changeReason("Investigate fixture report")); }
const subjectPage = { subjectUserId: a.userId, targetType: target.targetType, targets: [{ ...target, createdAt: "2026-10-20T00:00:00Z", label: "Chat message" }], hasMore: false, nextCursor: null };
async function allowBrowse(h, allowed = true) {
  await h.act(() => h.current.changeReason("Inspect fixture user")); await h.act(() => { void h.current.list(); });
  await h.act(() => h.calls.at(-1).resolve({ contexts: [], hasMore: false, nextCursor: null, canCreateContext: allowed, canDelegate: allowed, canBrowseUsers: allowed, accessAuditMode: allowed ? "owner_view_exempt" : "staff_view_logged" }));
  await h.act(() => h.current.changeSubject(a.userId)); await h.act(() => h.current.changeReason("Inspect fixture user"));
}
test("user browse uses explicit capability and retires results on subject/type/session changes", async t => {
  const h = await mount(t); await allowBrowse(h, false);
  const deniedCount = h.calls.length; await h.act(() => { void h.current.browse(); }); assert.equal(h.calls.length, deniedCount);
  await allowBrowse(h); await h.act(() => { void h.current.browse(); }); assert.equal(h.calls.at(-1).args[1], a.userId);
  const held = h.calls.at(-1); await h.act(() => h.current.changeSubject(contextId)); await h.act(() => held.resolve(subjectPage)); assert.equal(h.current.subjectTargets, null);
  await allowBrowse(h); await h.act(() => { void h.current.browse(); }); const heldSession = h.calls.at(-1);
  await h.switchAccount(); await h.act(() => heldSession.resolve(subjectPage)); assert.equal(h.current.subjectTargets, null);
  await allowBrowse(h); await h.act(() => { void h.current.browse(); }); const heldType = h.calls.at(-1);
  await h.act(() => h.current.changeTarget({ ...target, targetType: "profile_post" })); await h.act(() => heldType.resolve(subjectPage)); assert.equal(h.current.subjectTargets, null);
});
test("browse result selection prefills exact target; wrong-subject and denied reads clear metadata", async t => {
  const h = await mount(t); await allowBrowse(h); await h.act(() => { void h.current.browse(); }); await h.act(() => h.calls.at(-1).resolve(subjectPage));
  assert.equal(h.current.subjectTargets.targets[0].targetId, target.targetId);
  await h.act(() => h.current.changeTarget(h.current.subjectTargets.targets[0])); assert.equal(h.current.target.targetId, target.targetId); assert.equal(h.current.subjectTargets, null); assert.equal(h.current.reason, "");
  await h.act(() => h.current.changeReason("Inspect fixture user")); await h.act(() => { void h.current.browse(); }); await h.act(() => h.calls.at(-1).resolve({ ...subjectPage, subjectUserId: contextId }));
  assert.equal(h.current.subjectTargets, null); assert.match(h.current.message, /could not be verified/);
  await h.act(() => { void h.current.browse(); }); await h.act(() => h.calls.at(-1).reject(new apiModule.ContentInspectionError("denied")));
  assert.equal(h.current.contexts, null); assert.equal(h.current.subjectTargets, null); assert.equal(h.current.reason, "");
});
test("browse API binds exact subject and type and sends composite pagination", async () => {
  let response = { ...subjectPage }, args;
  const { contentInspection: api } = loadApi(undefined, async (_subject, _name, input) => { args = input; return { data: response, error: null }; });
  const cursor = { createdAt: "2026-10-20T00:00:00Z", id: target.targetId };
  await api.listSubjectTargets(a, a.userId, target.targetType, "Inspect fixture user", cursor);
  assert.equal(args.p_subject_user_id, a.userId); assert.equal(args.p_before, cursor.createdAt); assert.equal(args.p_before_id, cursor.id);
  response = { ...subjectPage, subjectUserId: contextId }; await assert.rejects(() => api.listSubjectTargets(a, a.userId, target.targetType, "Inspect fixture user"), error => error.code === "unavailable");
  response = { ...subjectPage, targets: [{ ...subjectPage.targets[0], targetType: "profile_post" }] }; await assert.rejects(() => api.listSubjectTargets(a, a.userId, target.targetType, "Inspect fixture user"), error => error.code === "unavailable");
});
test("media entry requires exact scoped supported target and closes on reason/selection changes", async t => {
  const h = await mount(t); await prepare(h); await h.act(() => h.current.openMedia()); assert.equal(h.current.mediaOpen, false);
  const mediaTarget = { ...target, targetType: "creator_video" };
  await h.act(() => h.current.changeTarget(mediaTarget)); await h.act(() => h.current.changeReason("Inspect fixture original"));
  await h.act(() => h.current.openMedia()); assert.equal(h.current.mediaOpen, false);
  await h.act(() => { void h.current.loadScope(); }); await h.act(() => h.calls.at(-1).resolve({ targets: [mediaTarget], grants: [], grantsHasMore: false }));
  await h.act(() => h.current.openMedia()); assert.equal(h.current.mediaOpen, true);
  await h.act(() => h.current.changeReason("Inspect new fixture reason")); assert.equal(h.current.mediaOpen, false);
  await h.act(() => h.current.openMedia()); assert.equal(h.current.mediaOpen, true);
  await h.act(() => h.current.changeContext(a.userId)); assert.equal(h.current.mediaOpen, false);
});

test("actual inspection hook preserves stored body and clears immediately on target/context/reason changes", async t => {
  const h = await mount(t); await prepare(h);
  await h.act(() => { void h.current.read(); }); await h.act(() => h.calls.at(-1).resolve(data));
  assert.equal(h.current.result.content.body, data.content.body);
  await h.act(() => { h.current.setGrantee(a.userId); h.current.setExpiry("2026-10-20T12:00:00Z"); });
  await h.act(() => h.current.changeTarget({ ...target, targetId: a.userId }));
  assert.equal(h.current.result, null); assert.equal(h.current.reason, ""); assert.equal(h.current.grantee, ""); assert.equal(h.current.expiry, "");
  await prepare(h); await h.act(() => { void h.current.read(); });
  const held = h.calls.at(-1); await h.act(() => h.current.changeContext(a.userId)); await h.act(() => held.resolve(data));
  assert.equal(h.current.result, null);
});
test("retained deleted body expires from mounted state and cannot open retained media", async t => {
  const h = await mount(t); await prepare(h);
  const mediaTarget = { ...target, targetType: "creator_video" };
  await h.act(() => h.current.changeTarget(mediaTarget)); await h.act(() => h.current.changeReason("Inspect retained fixture"));
  await h.act(() => { void h.current.loadScope(); }); await h.act(() => h.calls.at(-1).resolve({ targets: [mediaTarget], grants: [], grantsHasMore: false }));
  const expires = Date.now() + 300;
  const retained = { ...data, ...mediaTarget, availability: "available_deleted", deletedRetentionAvailability: "available", content: { title: "Deleted fixture", description: "Original description" }, deletedAt: new Date(expires - 30*86400000).toISOString(), retentionExpiresAt: new Date(expires).toISOString(), retainedMediaAvailability: "unsupported" };
  await h.act(() => { void h.current.read(); }); await h.act(() => h.calls.at(-1).resolve(retained));
  assert.equal(h.current.result.availability, "available_deleted"); assert.equal(h.current.result.retentionExpiresAt, retained.retentionExpiresAt);
  await h.act(() => h.current.openMedia()); assert.equal(h.current.mediaOpen, false);
  await h.act(() => new Promise(resolve => setTimeout(resolve, 350)));
  assert.equal(h.current.result, null); assert.match(h.current.message, /expired/);
  await h.act(() => h.current.changeReason("Another retained fixture reason")); await h.act(() => h.current.openMedia()); assert.equal(h.current.mediaOpen, false);
});
test("late success and late failure cannot cross account/session or selection boundaries", async t => {
  const h = await mount(t); await prepare(h); await h.act(() => { void h.current.read(); }); const held = h.calls.at(-1);
  await h.switchAccount(); await h.act(() => held.resolve(data)); assert.equal(h.current.result, null); assert.equal(h.current.reason, "");
  await prepare(h); await h.act(() => { void h.current.read(); }); const rejected = h.calls.at(-1);
  await h.act(() => h.current.changeTarget({ ...target, targetId: a.userId })); await h.act(() => rejected.reject(new apiModule.ContentInspectionError("denied")));
  assert.equal(h.current.message, ""); assert.equal(h.current.busy, false);
});
test("grant denial clears scope, content and drafts; disabled backend prevents another operation", async t => {
  const h = await mount(t); await prepare(h);
  await h.act(() => { void h.current.loadScope(); }); await h.act(() => h.calls.at(-1).resolve({ targets: [target], grants: [] }));
  await h.act(() => { h.current.setGrantee(a.userId); h.current.setExpiry("fixture"); });
  await h.act(() => { void h.current.grant(); }); await h.act(() => h.calls.at(-1).reject(new apiModule.ContentInspectionError("denied")));
  assert.equal(h.current.scope, null); assert.equal(h.current.grantee, ""); assert.match(h.current.message, /Access denied/);
  await h.act(() => h.current.changeReason("Check disabled fixture")); await h.act(() => { void h.current.list(); }); await h.act(() => h.calls.at(-1).reject(new apiModule.ContentInspectionError("disabled")));
  assert.equal(h.current.disabled, true); const count = h.calls.length; await h.act(() => { void h.current.read(); }); assert.equal(h.calls.length, count);
});
test("mismatched read binding and unknown rejection never publish bodies or raw backend errors", async t => {
  const h = await mount(t); await prepare(h); await h.act(() => { void h.current.read(); }); await h.act(() => h.calls.at(-1).resolve({ ...data, contextId: a.userId }));
  assert.equal(h.current.result, null); assert.match(h.current.message, /could not be verified/);
  await h.act(() => { void h.current.read(); }); await h.act(() => h.calls.at(-1).reject(new Error("secret-token fixture")));
  assert.doesNotMatch(h.current.message, /secret-token/);
});
test("explicit clear retires deferred reads and grant completion; duplicate presses have one request", async t => {
  const h = await mount(t); await prepare(h);
  await h.act(() => { void h.current.grant(); void h.current.grant(); }); assert.equal(h.calls.length, 1);
  await h.act(() => h.current.clear()); await h.act(() => h.calls[0].resolve({ grantId: a.userId })); assert.equal(h.current.message, ""); assert.equal(h.current.busy, false);
});
test("production API freezes exact initiating session and validates grant expiry before any RPC", async () => {
  const calls = [];
  const { contentInspection: api } = loadApi(undefined, async (...args) => { calls.push(args); return { data, error: null }; });
  await api.read(a, contextId, target, "Inspect fixture report");
  assert.equal(calls[0][1], "admin_read_content_inspection"); assert.equal(calls[0][2].p_target_id, target.targetId); assert.match(calls[0][2].p_request_id, /^[a-f0-9-]{36}$/);
  assert.throws(() => api.grant(a, contextId, target, a.userId, new Date(Date.now() + 90000000).toISOString(), "Inspect fixture report"));
  assert.equal(calls.length, 1);
  const switched = loadApi(async () => ({ authority: { ...a, sessionGeneration: "other" } }), async () => { throw Error("must not run"); });
  await assert.rejects(() => switched.contentInspection.read(a, contextId, target, "Inspect fixture report"), error => error.code === "account_changed");
});
test("production API maps disabled/denied errors and never retries ambiguous writes", async () => {
  for (const [message, code, expected] of [["content_inspection_disabled", "42501", "disabled"], ["secret database denial", "42501", "denied"], ["account_bound_rpc_outcome_unknown", "", "unavailable"]]) {
    let calls = 0;
    const { contentInspection: api } = loadApi(undefined, async () => { calls++; return { error: { message, code }, data: null }; });
    await assert.rejects(() => api.revoke(a, a.userId, "Revoke fixture grant"), error => error.code === expected && !error.message.includes("secret database"));
    assert.equal(calls, 1);
  }
});
test("production API rejects malformed envelopes and keeps current/deleted/media availability distinct", async () => {
  for (const malformed of [{ ...data, content: null }, { ...data, deletedRetentionAvailability: "retained" }, { ...data, mediaAvailability: "signed_url" }]) {
    const { contentInspection: api } = loadApi(undefined, async () => ({ data: malformed, error: null }));
    await assert.rejects(() => api.read(a, contextId, target, "Review fixture content"), error => error.code === "unavailable");
  }
  const { contentInspection: api } = loadApi(undefined, async () => ({ data: { ...data, availability: "unavailable_current", content: null }, error: null }));
  assert.equal((await api.read(a, contextId, target, "Review fixture content")).content, null);
});
test("context capabilities and audit wording use explicit server policy, never inferred client role", async () => {
  const response = { contexts: [], hasMore: false, nextCursor: null, canCreateContext: true, canDelegate: false, canBrowseUsers: true, accessAuditMode: "staff_view_logged" };
  const { contentInspection: api } = loadApi(undefined, async () => ({ data: response, error: null }));
  const result = await api.listContexts(a, "Inspect fixture scope");
  assert.equal(result.canDelegate, false); assert.equal(result.accessAuditMode, "staff_view_logged");
  delete response.accessAuditMode;
  await assert.rejects(() => api.listContexts(a, "Inspect fixture scope"), error => error.code === "unavailable");
});
test("production client decodes actual final SQL RPC envelopes for current/deleted/missing content", async () => {
  // Exercise the real migration's response encoder in PostgreSQL. Authority
  // dependencies below are synthetic; SQL authorization has its own DB suite.
  const savedWindow = globalThis.window, savedDocument = globalThis.document;
  delete globalThis.window; delete globalThis.document;
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create table private.content_inspection_contexts(id uuid,status text);
      create table private.content_inspection_context_targets(context_id uuid,target_type text,target_id uuid);
      create table private.content_inspection_grants(id uuid,context_id uuid,target_type text,target_id uuid,revision bigint);
      create table private.fixture_source(value jsonb);
      create function private.content_inspection_actor(text,uuid,boolean default true) returns text language sql as $$select 'owner'::text$$;
      create function private.content_inspection_context_owned(uuid,text) returns boolean language sql as $$select true$$;
      create function private.content_inspection_grant_valid(private.content_inspection_grants) returns boolean language sql as $$select true$$;
      create function private.content_inspection_source(text,uuid) returns jsonb language sql as $$select value from private.fixture_source$$;
      create function private.content_inspection_owner_target(text,uuid) returns boolean language sql as $$select false$$;
      create function private.content_inspection_audit(text,uuid,text,uuid,text,uuid,uuid,bigint,text,text,text) returns void language sql as $$select$$;`);
    await db.query("insert into private.content_inspection_contexts values($1,'open')", [contextId]);
    await db.query("insert into private.content_inspection_context_targets values($1,$2,$3)", [contextId, target.targetType, target.targetId]);
    const migration = fs.readFileSync("supabase/migrations/20261020012144_content_inspection_deleted_fallback.sql", "utf8");
    const start = migration.indexOf("create or replace function public.admin_read_content_inspection(");
    assert.ok(start >= 0); await db.exec(migration.slice(start, migration.indexOf("$$;", start) + 3));
    let lastEnvelope;
    const { contentInspection: api } = loadApi(undefined, async (_subject, name, args) => {
      assert.equal(name, "admin_read_content_inspection");
      lastEnvelope = (await db.query("select public.admin_read_content_inspection($1,$2,$3,$4,$5) as value", [args.p_context_id, args.p_target_type, args.p_target_id, args.p_reason, args.p_request_id])).rows[0].value;
      return { data: lastEnvelope, error: null };
    });
    await db.exec("insert into private.fixture_source select jsonb_build_object('content',jsonb_build_object('body','  SQL current <text>  '),'sourceUpdatedAt',null,'restrictionLabels',jsonb_build_array('private'))");
    const current = await api.read(a, contextId, target, "Inspect SQL fixture");
    assert.equal(current.content.body, "  SQL current <text>  "); assert.equal(current.deletedRetentionAvailability, "unavailable"); assert.equal(current.deletedAt, null);
    await db.exec("update private.fixture_source set value=value || jsonb_build_object('isRetainedDeletion',true,'deletedAt',clock_timestamp()-interval '1 hour','retentionExpiresAt',clock_timestamp()-interval '1 hour'+interval '30 days')");
    // Use one server timestamp for exact 30-day duration, as capture does.
    await db.exec("update private.fixture_source set value=value || jsonb_build_object('retentionExpiresAt',(value->>'deletedAt')::timestamptz+interval '30 days')");
    const deleted = await api.read(a, contextId, target, "Inspect SQL fixture");
    assert.equal(deleted.availability, "available_deleted"); assert.equal(deleted.content.body, current.content.body); assert.equal(deleted.deletedRetentionAvailability, "available");
    assert.equal(Date.parse(deleted.retentionExpiresAt)-Date.parse(deleted.deletedAt), 30*86400000);
    for (const bad of [
      { ...deleted, targetId: a.userId }, { ...deleted, targetType: "creator_video" },
      { ...deleted, content: { title: "mismatched", description: null } },
      { ...deleted, retentionExpiresAt: new Date(Date.now()-1000).toISOString() },
      { ...deleted, retentionExpiresAt: new Date(Date.parse(deleted.deletedAt)+31*86400000).toISOString() },
    ]) {
      const malformed = loadApi(undefined, async () => ({ data: bad, error: null }));
      await assert.rejects(() => malformed.contentInspection.read(a, contextId, target, "Inspect SQL fixture"), error => error.code === "unavailable");
    }
    await db.exec("delete from private.fixture_source");
    const missing = await api.read(a, contextId, target, "Inspect SQL fixture");
    assert.equal(missing.availability, "unavailable_current"); assert.equal(missing.content, null); assert.equal(missing.deletedRetentionAvailability, "unavailable");
  } finally { await db.close(); globalThis.window = savedWindow; globalThis.document = savedDocument; }
});
test("actual panel exposes scoped delegation only after exact server Owner capability", async t => {
  const buttons = new Map(), inputs = new Map(); let canDelegate = false;
  const children = props => React.createElement(React.Fragment, null, props.children);
  const native = {
    AppState: { currentState: "active", addEventListener: () => ({ remove: noop }) },
    Modal: children, ScrollView: children, View: children, Text: () => null,
    TouchableOpacity: props => { buttons.set(props.accessibilityLabel, props); return null; },
    TextInput: props => { inputs.set(props.accessibilityLabel, props); return null; }, StyleSheet: { create: x => x },
  };
  const api = { ...apiModule.contentInspection, listContexts: async () => ({ contexts: [], hasMore: false, nextCursor: null, canCreateContext: true, canDelegate, canBrowseUsers: true }) };
  const { ContentInspectionPanel } = compile("components/admin/content-inspection-panel.tsx", { "react-native": native, "../../_lib/accountSessionAuthority": { ...authorityModule, subscribeToAccountSessionAuthority: () => noop }, "../../_lib/contentInspection": { ...apiModule, contentInspection: api } });
  const root = createRoot(container()); const act = fn => React.act(async () => { fn(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  await act(() => root.render(React.createElement(ContentInspectionPanel, { visible: true, authority: a, initialTarget: target, onClose: noop })));
  t.after(() => act(() => root.unmount()));
  assert.equal(buttons.has("Grant exact target access"), false);
  await act(() => inputs.get("Reason or new context purpose (6–500 characters)").onChangeText("Inspect fixture report"));
  await act(() => buttons.get("Load review contexts").onPress());
  assert.equal(buttons.has("Grant exact target access"), false);
  assert.equal(buttons.has("Browse user content"), true);
  canDelegate = true; await act(() => buttons.get("Load review contexts").onPress());
  assert.equal(buttons.has("Grant exact target access"), true); assert.equal(buttons.get("Grant exact target access").disabled, true);
  assert.equal(buttons.get("Inspect current stored text").disabled, true);
});
test("actual outer panel closes on background/session invalidation and destroys keyed content", async t => {
  let listener, authorityListener, modalProps, closes = 0;
  const native = { AppState: { currentState: "active", addEventListener: (_name, fn) => { listener = fn; return { remove: noop }; } }, Modal: props => { modalProps = props; return null; }, StyleSheet: { create: x => x } };
  const { ContentInspectionPanel } = compile("components/admin/content-inspection-panel.tsx", { "react-native": native, "../../_lib/accountSessionAuthority": { ...authorityModule, subscribeToAccountSessionAuthority: fn => { authorityListener = fn; return noop; } }, "../../_lib/contentInspection": apiModule });
  const root = createRoot(container()); const act = fn => React.act(async () => { fn(); });
  let props = { visible: true, authority: a, initialTarget: target, onClose: () => { closes++; } };
  const render = () => act(() => root.render(React.createElement(ContentInspectionPanel, props)));
  await render(); t.after(() => act(() => root.unmount()));
  const firstKey = modalProps.children.key; props = { ...props, authority: { ...a, sessionGeneration: "new" } }; await render(); assert.notEqual(modalProps.children.key, firstKey);
  const sessionKey = modalProps.children.key; props = { ...props, initialSubjectUserId: a.userId }; await render(); assert.notEqual(modalProps.children.key, sessionKey);
  await act(() => listener("background")); assert.equal(closes, 1);
  props = { ...props, visible: false }; await render(); props = { ...props, visible: true }; await render(); await act(() => authorityListener(null)); assert.equal(closes, 2);
});
