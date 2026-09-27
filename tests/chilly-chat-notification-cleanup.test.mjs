import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../_lib/notifications.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("notifications.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = ["dismissChillyChatCallNotificationRows", "dismissPresentedChillyChatCallNotifications"];
const declarations = names.map((name) => {
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `execute the actual ${name} function`);
  return declaration.getText(ast);
});
const compiled = ts.transpileModule(declarations.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const notification = (id, inviteId, threadId = "thread-a", extra = {}) => ({
  request: {
    identifier: id,
    content: {
      title: "Incoming Chi'lly Chat video call",
      data: { category: "chilly_chat_call", callInviteId: inviteId, path: `/chat/${threadId}`, ...extra },
    },
  },
});
const row = (id, sourceId, threadId = "thread-a", userId = "user-a") => ({
  id, source_id: sourceId, target_entity_id: threadId, user_id: userId,
  category: "chilly_chat_call", dismissed_at: null,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function load({ presented = [], rows = [], getPresented } = {}) {
  const dismissed = [];
  let sweeps = 0;
  let nativeReads = 0;
  let databaseWrites = 0;
  const context = {
    exports: {}, Date, Promise,
    Platform: { OS: "ios" },
    normalizeText: (value) => String(value ?? "").trim(),
    // Route parsing is not under test; all supplied paths are canonical app routes.
    normalizeNotificationPath: (value) => String(value ?? "").trim(),
    readSessionUserId: async (id) => id || "user-a",
    NOTIFICATIONS_TABLE: "notifications",
    Notifications: {
      getPresentedNotificationsAsync: async () => { nativeReads += 1; return getPresented ? getPresented() : presented; },
      dismissNotificationAsync: async (id) => { dismissed.push(id); },
      dismissAllNotificationsAsync: async () => { sweeps += 1; },
    },
    supabase: {
      from(table) {
        assert.equal(table, "notifications");
        const predicates = [];
        let patch;
        const query = {
          update(value) { patch = value; return query; },
          eq(key, value) { predicates.push((candidate) => candidate[key] === value); return query; },
          is(key, value) { predicates.push((candidate) => candidate[key] === value); return query; },
          or(value) {
            const alternatives = value.split(",").map((part) => {
              const [key, operator, ...tail] = part.split(".");
              assert.equal(operator, "eq");
              return (candidate) => candidate[key] === tail.join(".");
            });
            predicates.push((candidate) => alternatives.some((matches) => matches(candidate)));
            return query;
          },
          select() { return query; },
          async returns() {
            databaseWrites += 1;
            const matching = rows.filter((candidate) => predicates.every((matches) => matches(candidate)));
            for (const candidate of matching) Object.assign(candidate, patch);
            return { data: matching.map(({ id }) => ({ id })), error: null };
          },
        };
        return query;
      },
    },
  };
  vm.runInNewContext(compiled, context, { filename: "notifications.ts" });
  return {
    ...context.exports, dismissed, rows,
    get sweeps() { return sweeps; },
    get nativeReads() { return nativeReads; },
    get databaseWrites() { return databaseWrites; },
  };
}

test("old terminal invite cannot dismiss a newer native notification in the same thread", async () => {
  const pending = deferred();
  const runtime = load({ getPresented: () => pending.promise });
  const completion = runtime.dismissPresentedChillyChatCallNotifications({
    callInviteId: "invite-old", threadId: "thread-a", exactInviteOnly: true,
    // Even inherited compatibility options cannot broaden an exact operation.
    dismissIncomingCallFallback: true, dismissAllPresentedNotificationsFallback: true,
  });
  pending.resolve([
    notification("old", "invite-old"), notification("new", "invite-new"),
    notification("unknown", undefined), notification("other-thread", "invite-other", "thread-b"),
  ]);
  assert.equal(await completion, 1);
  assert.deepEqual(runtime.dismissed, ["old"]);
  assert.equal(runtime.sweeps, 0);
});

test("exact native cleanup never sweeps when the old invite already disappeared", async () => {
  const runtime = load({ presented: [notification("new", "invite-new"), notification("unknown", undefined)] });
  assert.equal(await runtime.dismissPresentedChillyChatCallNotifications({
    callInviteId: "invite-old", threadId: "thread-a", exactInviteOnly: true,
    presentedNotificationId: "new", path: "/chat/thread-a",
    dismissIncomingCallFallback: true, dismissAllPresentedNotificationsFallback: true,
  }), 0);
  assert.deepEqual(runtime.dismissed, []);
  assert.equal(runtime.sweeps, 0);
});

test("exact native cleanup requires an invite rather than falling back to a title or presented ID", async () => {
  const runtime = load({ presented: [notification("new", "invite-new")] });
  assert.equal(await runtime.dismissPresentedChillyChatCallNotifications({
    callInviteId: " ", exactInviteOnly: true, presentedNotificationId: "new", threadId: "thread-a",
    dismissIncomingCallFallback: true, dismissAllPresentedNotificationsFallback: true,
  }), 0);
  assert.equal(runtime.nativeReads, 0);
  assert.deepEqual(runtime.dismissed, []);
});

test("exact database cleanup preserves newer, unknown and other-account invite rows", async () => {
  const runtime = load({ rows: [
    row("old", "invite-old"), row("new", "invite-new"), row("unknown", null),
    row("other-thread", "invite-other", "thread-b"), row("other-account", "invite-old", "thread-a", "user-b"),
  ] });
  assert.equal(await runtime.dismissChillyChatCallNotificationRows({
    callInviteId: "invite-old", threadId: "thread-a", userId: "user-a", exactInviteOnly: true,
  }), 1);
  assert.deepEqual(runtime.rows.filter((candidate) => candidate.dismissed_at !== null).map(({ id }) => id), ["old"]);
  assert.equal(runtime.databaseWrites, 1, "exact cleanup does not run the legacy second all-call sweep");
});

test("exact database cleanup with no match leaves a fresh invite actionable", async () => {
  const runtime = load({ rows: [row("new", "invite-new")] });
  assert.equal(await runtime.dismissChillyChatCallNotificationRows({
    callInviteId: "invite-old", threadId: "thread-a", userId: "user-a", exactInviteOnly: true,
  }), 0);
  assert.equal(runtime.rows[0].dismissed_at, null);
  assert.equal(runtime.databaseWrites, 1);
});

test("exact database cleanup cannot turn a missing invite into an all-call sweep", async () => {
  const runtime = load({ rows: [row("new", "invite-new")] });
  assert.equal(await runtime.dismissChillyChatCallNotificationRows({
    threadId: "thread-a", userId: "user-a", exactInviteOnly: true,
  }), 0);
  assert.equal(runtime.databaseWrites, 0);
  assert.equal(runtime.rows[0].dismissed_at, null);
});

test("existing non-exact native compatibility behavior remains available to its callers", async () => {
  const runtime = load({ presented: [notification("older", undefined)] });
  assert.equal(await runtime.dismissPresentedChillyChatCallNotifications({
    callInviteId: "invite-old", dismissIncomingCallFallback: true, dismissAllPresentedNotificationsFallback: true,
  }), 1);
  assert.deepEqual(runtime.dismissed, ["older"]);
});

test("existing non-exact database sweep retains its original scope", async () => {
  const runtime = load({ rows: [row("old", "invite-old"), row("other", "invite-other", "thread-b"), row("foreign", "invite-old", "thread-a", "user-b")] });
  assert.equal(await runtime.dismissChillyChatCallNotificationRows({ callInviteId: "invite-old", userId: "user-a" }), 2);
  assert.deepEqual(runtime.rows.filter((candidate) => candidate.dismissed_at !== null).map(({ id }) => id), ["old", "other"]);
});

test("global-banner delayed cleanup remains bound to the old invite and original user", async () => {
  const layout = fs.readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
  const layoutAst = ts.createSourceFile("_layout.tsx", layout, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let helper;
  function inspect(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(layoutAst) === "cleanupChillyChatCallNotifications") helper = node;
    ts.forEachChild(node, inspect);
  }
  inspect(layoutAst);
  assert.ok(helper, "execute the actual global-banner cleanup helper");
  const helperCode = ts.transpileModule(`const ${helper.getText(layoutAst)}; globalThis.cleanup = cleanupChillyChatCallNotifications;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const timers = [];
  const presented = [];
  const rows = [];
  const context = {
    user: { id: "user-a" },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    dismissPresentedChillyChatCallNotifications: async (input) => presented.push(input),
    dismissChillyChatCallNotificationRows: async (input) => rows.push(input),
  };
  context.globalThis = context;
  vm.runInNewContext(helperCode, context);
  context.cleanup({ callInviteId: "invite-old", threadId: "thread-a" });
  context.user = { id: "user-b" };
  for (const timer of timers) timer.callback();
  assert.deepEqual(timers.map(({ delay }) => delay), [750, 1800, 5000], "existing delayed-notification retries remain");
  assert.equal(presented.length, 4);
  assert.equal(rows.length, 4);
  for (const input of [...presented, ...rows]) {
    assert.equal(input.exactInviteOnly, true);
    assert.equal(input.callInviteId, "invite-old");
    assert.notEqual(input.dismissAllPresentedNotificationsFallback, true);
    assert.notEqual(input.dismissIncomingCallFallback, true);
  }
  for (const input of rows) assert.equal(input.userId, "user-a");
  context.cleanup({ threadId: "thread-a" });
  assert.equal(timers.length, 3, "a missing invite cannot schedule broad future cleanup");
});
