import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { sanitizeExternalIosNativeCallPath } from "../_lib/nativeCallTransitionProvenance.mjs";
import { createCallDispatchHarness, DISPATCH_IDS } from "./assurance/helpers/chat-call-dispatch-handler-harness.mjs";

const read = (name) => fs.readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const transition = read("20260718103000_durable_chat_call_status_transition.sql");
const expiry = read("20260719213953_expire_stale_chilly_chat_calls.sql");

// Execute the real response subscription and complete route parser. Only the
// Expo/OS boundary is controlled; no replacement route or expiry logic is used.
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const routeContext = { exports: {}, URL, URLSearchParams };
vm.runInNewContext(compile(fs.readFileSync(new URL("../_lib/appLinks.ts", import.meta.url), "utf8")), routeContext);
const notificationSource = fs.readFileSync(new URL("../_lib/notifications.ts", import.meta.url), "utf8");
const notificationAst = ts.createSourceFile("notifications.ts", notificationSource, ts.ScriptTarget.Latest, true);
const responseDeclarations = ["normalizeText", "normalizeNotificationPath", "handledNotificationResponseKeys",
  "clearApplicationNotificationBadge", "subscribeToNotificationResponses"].map((name) => {
  const declaration = notificationAst.statements.find((node) =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(notificationAst) === name)));
  assert.ok(declaration, `execute actual notification declaration ${name}`);
  return declaration.getText(notificationAst);
});
const responseScript = compile(responseDeclarations.join("\n"));

for (const platform of ["android", "ios"]) {
  for (const entry of ["cold", "warm"]) {
    test(`expired missed push opens the exact conversation once through actual ${platform} ${entry} response routing`, async () => {
      const nowMs = Date.now();
      const h = createCallDispatchHarness({ nowMs, status: "missed", expiresInMs: -1_000,
        pushTokens: [{ platform, provider: "expo", token: `ExpoPushToken[test-${platform}]` }] });
      assert.equal((await h.dispatch({ action: "timeout", inviteId: h.ids.invite })).status, 200);
      const push = h.events.find((event) => event.kind === "http" && event.url.includes("/push/send") && event.body.data.action === "missed");
      assert.ok(push);
      assert.ok(Date.parse(push.body.data.expiresAt) < nowMs, "the retained call deadline really is past");
      assert.equal(push.body.data.openCall, "false");
      const response = { actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
        notification: { request: { identifier: `${platform}-missed`, content: push.body } } };
      const paths = [];
      const badges = [];
      let listener;
      let removed = false;
      let clears = 0;
      const context = { exports: {}, Platform: { OS: platform },
        resolveApplicationRoute: routeContext.exports.resolveApplicationRoute,
        Notifications: {
          getLastNotificationResponseAsync: async () => entry === "cold" ? response : null,
          addNotificationResponseReceivedListener: (callback) => { listener = callback; return { remove: () => { removed = true; } }; },
          clearLastNotificationResponseAsync: async () => { clears += 1; },
          setBadgeCountAsync: async (count) => { badges.push(count); return true; },
        } };
      vm.runInNewContext(responseScript, context, { filename: "notifications.ts" });
      const subscription = context.exports.subscribeToNotificationResponses((path) => paths.push(sanitizeExternalIosNativeCallPath(path)));
      await new Promise((resolve) => setImmediate(resolve));
      listener(response);
      listener(response);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(paths, [`/chat/${h.ids.thread}?callInviteId=${h.ids.invite}`]);
      assert.equal(clears, 1);
      assert.deepEqual(badges, platform === "ios" ? [0] : []);
      subscription.remove();
      assert.equal(removed, true);
    });
  }
}

// Real checked-in SQL runs in disposable PostgreSQL. Its exact durable result
// then enters the production HTTP dispatcher at the controlled SDK/provider
// boundary. This is not a deployed migration, external push or physical proof.
test("missed PostgreSQL expiry retains durable cleanup and drives exact callee notification dispatch", async () => {
  const db = new PGlite();
  const ids = DISPATCH_IDS;
  try {
    await db.exec(`
      set timezone = 'UTC';
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.chat_threads(id uuid primary key,active_communication_room_id text,active_call_type text,updated_at timestamptz);
      create table public.chat_thread_members(thread_id uuid,user_id text);
      create table public.communication_rooms(room_id text primary key,status text,updated_at timestamptz,last_activity_at timestamptz);
      create table public.chat_call_invites(id uuid primary key,thread_id uuid,communication_room_id text,
        caller_user_id text,callee_user_id text,call_type text,status text,created_at timestamptz default now(),
        expires_at timestamptz,accepted_at timestamptz,ended_at timestamptz);
      create table public.chat_call_events(id uuid primary key default gen_random_uuid(),thread_id uuid,
        call_invite_id uuid,actor_user_id text,call_type text,event_type text,duration_seconds integer,created_at timestamptz);
    `);
    const activity = read("202605120003_d9_notifications_activity_production.sql");
    const touchStart = activity.indexOf('create or replace function public."touch_notification_updated_at"');
    assert.ok(touchStart >= 0);
    await db.exec(activity.slice(touchStart, activity.indexOf("$$;", touchStart) + 3));
    await db.exec(transition);
    await db.exec(expiry);
    await db.query("insert into auth.users values($1),($2)", [ids.caller, ids.callee]);
    await db.query("insert into chat_threads values($1,null,null,now())", [ids.thread]);
    await db.query("insert into chat_thread_members values($1,$2),($1,$3)", [ids.thread, ids.caller, ids.callee]);
    await db.query(`insert into chat_call_invites(id,thread_id,caller_user_id,callee_user_id,call_type,status,expires_at)
      values($1,$2,$3,$4,'voice','ringing',now()+interval '1 minute')`, [ids.invite, ids.thread, ids.caller, ids.callee]);
    await assert.rejects(db.query("select transition_chilly_chat_call_invite($1,$2,'missed')", [ids.invite, ids.caller]), /transition_timeout_forbidden/u);
    await assert.rejects(db.query("select transition_chilly_chat_call_invite($1,$2,'missed')", [ids.invite, "00000000-0000-4000-8000-000000000099"]), /transition_not_call_participant/u);
    await db.query("update chat_call_invites set expires_at=now()-interval '1 second' where id=$1", [ids.invite]);
    const first = (await db.query("select expire_stale_chilly_chat_call_invites(10) as result")).rows[0].result;
    const second = (await db.query("select expire_stale_chilly_chat_call_invites(10) as result")).rows[0].result;
    assert.equal(first.expiredCount, 1);
    assert.equal(second.expiredCount, 0);
    const invite = (await db.query("select * from chat_call_invites where id=$1", [ids.invite])).rows[0];
    const deliveries = (await db.query("select * from chat_call_transition_deliveries")).rows;
    const events = (await db.query("select * from chat_call_events")).rows;
    assert.equal(invite.status, "missed");
    assert.equal(invite.callee_user_id, ids.callee);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].dispatch_action, "timeout", "native cleanup contract remains unchanged");
    assert.equal(deliveries[0].target_status, "missed");
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, "missed");
    const claimed = (await db.query("select claim_chilly_chat_call_transition_delivery($1) as result", [deliveries[0].id])).rows[0].result;
    assert.equal(claimed.action, "timeout");

    const h = createCallDispatchHarness({ nowMs: Date.now(), retryAuthorized: true,
      pushTokens: [{ platform: "android", provider: "fcm", token: "test-android-fcm" },
        { platform: "android", provider: "expo", token: "ExpoPushToken[test-android]" },
        { platform: "ios", provider: "expo", token: "ExpoPushToken[test-ios]" }],
      transitionDeliveries: [{ ...deliveries[0], delivery_status: "dispatching" }],
    });
    h.tables.chat_call_invites[0] = { ...invite, expires_at: new Date(invite.expires_at).toISOString() };
    const result = await h.dispatch({ action: claimed.action, inviteId: ids.invite, deliveryId: deliveries[0].id },
      { headers: { "x-chillywood-retry-token": "test-scoped-retry" } });
    assert.equal(result.status, 200);
    assert.equal(result.body.result.status, "sent");
    assert.equal(h.tables.notifications.length, 1);
    assert.equal(h.tables.notifications[0].notification_type, "chilly_chat_missed_call");
    assert.equal(h.tables.notifications[0].user_id, ids.callee);
    assert.equal(h.tables.notifications[0].source_id, invite.id);
    assert.equal(h.events.filter((event) => event.kind === "http" && event.url.includes("/push/send") && event.body.data.action === "missed").length, 2);

    const wrongScope = await h.dispatch({ action: "missed", inviteId: ids.invite, deliveryId: deliveries[0].id },
      { headers: { "x-chillywood-retry-token": "test-scoped-retry" } });
    assert.equal(wrongScope.status, 401, "an internal delivery cannot forge a new presentation action");

    // Execute the actual unique reservation constraint with concurrent callers.
    await db.exec("create table notifications(id uuid primary key)");
    const dedupeStart = activity.indexOf('create table if not exists public."notification_event_dedupes"');
    assert.ok(dedupeStart >= 0);
    await db.exec(activity.slice(dedupeStart, activity.indexOf("\n);", dedupeStart) + 3));
    const reservation = () => db.query(`insert into notification_event_dedupes
      (dedupe_key,recipient_user_id,trigger_type,source_type,source_id,timing_key)
      values('same-missed',$1,'chilly_chat_missed_call','chat_call_invite',$2,'missed')`, [ids.callee, ids.invite]);
    const concurrent = await Promise.allSettled([reservation(), reservation()]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.find((result) => result.status === "rejected").reason.code, "23505");
    assert.equal((await db.query("select count(*)::integer as count from notification_event_dedupes")).rows[0].count, 1);
  } finally {
    await db.close();
  }
});
