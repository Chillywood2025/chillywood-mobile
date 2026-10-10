import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => process.env.NOTIFICATION_ACTIVITY_BASELINE === "1"
  ? execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, file), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const sourceAst = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true,
  file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const declaration = (ast, name) => {
  let found;
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) && node.name?.text === name)
      || (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(found, `actual declaration ${name}`);
  return ts.isVariableDeclaration(found) ? `const ${found.getText(ast)};` : found.getText(ast);
};
const run = (source, context = {}) => {
  const sandbox = { exports: {}, Date, URL, URLSearchParams, React, ...context };
  vm.runInNewContext(compile(source), sandbox);
  return sandbox;
};
const links = run(read("_lib/appLinks.ts")).exports;
const notifications = sourceAst("_lib/notifications.ts");
const names = [
  "normalizeJsonRecord", "normalizeText", "normalizeIsoTimestamp", "normalizeNotificationCategory",
  "normalizeTargetRoute", "normalizeNotificationTarget", "readContextText", "readContextTimestamp",
  "isTerminalNotificationStatus", "IMPORTANT_NOTIFICATION_CATEGORIES", "CREATOR_MONEY_BUYER_ACTION_LABELS",
  "CREATOR_MONEY_CREATOR_ACTION_LABELS", "classifyNotificationAction", "parseNotificationRow",
  "DEFAULT_NOTIFICATION_PREFERENCES", "parsePreferenceRow", "buildPreferenceUpdate", "readNotificationPreferences", "updateNotificationPreferences",
  "normalizeNotificationPath", "resolveNotificationPath",
];
const serviceSource = names.map((name) => declaration(notifications, name)).join("\n")
  + "\nglobalThis.service = { parseNotificationRow, parsePreferenceRow, buildPreferenceUpdate, readNotificationPreferences, updateNotificationPreferences, resolveNotificationPath };";
const identity = "00000000-0000-4000-8000-000000000111";
const parseService = (extra = {}) => run(serviceSource, {
  normalizePlatformSubscriptionNotificationCopy: (value) => value,
  normalizeChillyChatRingtoneKey: (value) => value || "chilly_ring",
  resolveApplicationRoute: links.resolveApplicationRoute,
  ...extra,
}).service;
const service = parseService();
test("ready replay uses the actual guarded replay screen without adding access authority", () => {
  const row = service.parseNotificationRow({ id: "replay-notification", user_id: identity,
    category: "content_dropped", notification_type: "replay_later", title: "Replay ready",
    target_route: "/player/replay/[replayId]", target_entity_id: identity,
    deep_link: `/player/replay/${identity}`, status: "sent", target_context: {} });
  assert.equal(row.target.supported, true);
  assert.equal(service.resolveNotificationPath(row.deepLink), `/player/replay/${identity}`);
  for (const query of ["join=1", "userId=other", "access=paid", "session=other"])
    assert.equal(service.resolveNotificationPath(`${row.deepLink}?${query}`), null);
});
const fields = {
  socialActivityEnabled: "social_activity_enabled",
  circleActivityEnabled: "circle_activity_enabled",
  messagesEnabled: "messages_enabled",
  viewSummaryEnabled: "view_summary_enabled",
  viewSummaryPushEnabled: "view_summary_push_enabled",
  eventUpdatesEnabled: "event_updates_enabled",
  seatActivityEnabled: "seat_activity_enabled",
  accountActivityEnabled: "account_activity_enabled",
};
const plain = (value) => JSON.parse(JSON.stringify(value));

test("new preferences preserve existing behavior and default view phone alerts off", () => {
  for (const row of [null, {}]) {
    const parsed = service.parsePreferenceRow(row);
    for (const field of Object.keys(fields)) assert.equal(parsed[field], field !== "viewSummaryPushEnabled", field);
    assert.equal(parsed.pushEnabled, true);
    assert.equal(parsed.creatorMoneyPurchasesEnabled, true);
    assert.equal(parsed.chillyChatCallsEnabled, true);
  }
  assert.equal(service.parsePreferenceRow({ view_summary_push_enabled: "true" }).viewSummaryPushEnabled, false,
    "an unrecognized value cannot opt a person into phone alerts");
});

for (const [field, column] of Object.entries(fields)) {
  test(`actual preference update round-trips only ${field}`, async () => {
    const writes = [];
    const api = parseService({
      readSessionUserId: async () => identity,
      supabase: { from(table) {
        assert.equal(table, "notification_preferences");
        let payload;
        const q = {
          upsert(value, options) { payload = plain(value); writes.push(payload); assert.equal(options.onConflict, "user_id"); return q; },
          select: () => q, returns: () => q,
          maybeSingle: async () => ({ data: { ...payload, updated_at: "2026-10-10T12:00:00Z" }, error: null }),
        };
        return q;
      } },
    });
    for (const value of [false, true]) {
      assert.equal((await api.updateNotificationPreferences({ [field]: value }))[field], value);
      assert.deepEqual(writes.at(-1), { [column]: value, user_id: identity });
    }
    assert.deepEqual(plain(api.buildPreferenceUpdate({ [field]: "false" })), {}, "malformed input is not a boolean update");
  });
}

test("preference save failure stays a failure; signed-out saves cannot reach the database", async () => {
  const api = parseService({ readSessionUserId: async () => identity, supabase: { from() {
    const q = { upsert: () => q, select: () => q, returns: () => q,
      maybeSingle: async () => ({ data: null, error: { message: "modeled storage failure" } }) };
    return q;
  } } });
  await assert.rejects(api.updateNotificationPreferences({ viewSummaryPushEnabled: true }), /Unable to update/);
  const signedOut = parseService({ readSessionUserId: async () => null, supabase: { from() { assert.fail("signed-out write"); } } });
  await assert.rejects(signedOut.updateNotificationPreferences({ messagesEnabled: false }), /signed-in/);
});

test("preference read failure never creates a row or fabricates enabled saved settings", async () => {
  let inserts = 0;
  const api = parseService({ readSessionUserId: async () => identity, supabase: { from() {
    const q = { select: () => q, eq: () => q, returns: () => q,
      insert: () => { inserts++; return q; },
      maybeSingle: async () => ({ data: null, error: { message: "modeled unavailable preferences" } }) };
    return q;
  } } });
  await assert.rejects(api.readNotificationPreferences(), /Unable to read notification preferences/);
  assert.equal(inserts, 0);
});

test("only a known missing preference row is created; failed creation is visible and retryable", async () => {
  let fail = true;
  let inserts = 0;
  const api = parseService({ readSessionUserId: async () => identity, supabase: { from() {
    let creating = false;
    const q = { select: () => q, eq: () => q, returns: () => q,
      insert: (value) => { assert.equal(value.user_id, identity); creating = true; inserts++; return q; },
      maybeSingle: async () => !creating ? { data: null, error: null }
        : fail ? { data: null, error: { message: "modeled failed insert" } }
          : { data: { user_id: identity, view_summary_push_enabled: false, messages_enabled: false }, error: null } };
    return q;
  } } });
  await assert.rejects(api.readNotificationPreferences(), /Unable to create notification preferences/);
  fail = false;
  const saved = await api.readNotificationPreferences();
  assert.equal(inserts, 2);
  assert.equal(saved.messagesEnabled, false);
  assert.equal(saved.viewSummaryPushEnabled, false);
});

const settingsAst = sourceAst("app/settings.tsx");
const groups = run(`${declaration(settingsAst, "NOTIFICATION_GROUPS")}\nglobalThis.groups = NOTIFICATION_GROUPS;`).groups;
const renderSettings = (preferences, savingKey = null) => run(
  `${declaration(settingsAst, "renderNotificationToggle")}\nglobalThis.render = renderNotificationToggle;`, {
    useCallback: (fn) => fn, notificationPreferences: preferences, notificationSavingKey: savingKey,
    onToggleChillyChatCallRing: () => assert.fail("activity preference changed call ring"),
    onToggleNotificationPreference: (key, value) => settingsWrites.push([key, value]),
    View: "View", Text: "Text", Switch: "Switch", SettingsRow: "SettingsRow", styles: {},
  },
).render;
const settingsWrites = [];
const descendants = (element, type) => {
  if (Array.isArray(element)) return element.flatMap((child) => descendants(child, type));
  if (!element || typeof element !== "object") return [];
  return [...(element.type === type ? [element] : []), ...descendants(element.props?.children, type)];
};

test("actual settings refresh presents read failure and can reload saved preferences", async () => {
  let fail = true;
  const state = { preferences: null, error: null, loading: false };
  const refresh = run(`${declaration(settingsAst, "refreshNotifications")}\nglobalThis.refresh = refreshNotifications;`, {
    useCallback: (fn) => fn, isSignedIn: true,
    readNotificationPreferences: async () => {
      if (fail) throw new Error("Preferences unavailable");
      return service.parsePreferenceRow({ social_activity_enabled: false });
    },
    readCurrentPushRegistration: async () => ({ status: "registered" }),
    readNativeCallAlertStatus: async () => ({ granted: true }),
    setNotificationLoading: (value) => { state.loading = value; },
    setNotificationPreferences: (value) => { state.preferences = value; },
    setNotificationPreferenceError: (value) => { state.error = value; },
    setPushRegistration: () => {}, setNativeCallAlertStatus: () => {},
    getUserFacingErrorMessage: (error, fallback) => error?.message || fallback,
  }).refresh;
  await refresh();
  assert.equal(state.preferences, null);
  assert.match(state.error, /unavailable/i);
  assert.equal(state.loading, false);
  fail = false;
  await refresh();
  assert.equal(state.error, null);
  assert.equal(state.preferences.socialActivityEnabled, false);
  assert.equal(state.loading, false);
});

test("actual settings renderer exposes each new preference once and routes its boolean change", () => {
  const parsed = service.parsePreferenceRow(null);
  for (const field of Object.keys(fields)) {
    const items = groups.flatMap((group) => group.items).filter((item) => item.key === field);
    assert.equal(items.length, 1, field);
    const [toggle] = descendants(renderSettings(parsed)(items[0]), "Switch");
    assert.ok(toggle, `${field} is a real rendered switch`);
    assert.equal(toggle.props.value, field !== "viewSummaryPushEnabled");
    toggle.props.onValueChange(!toggle.props.value);
    assert.deepEqual(settingsWrites.at(-1), [field, !toggle.props.value]);
    assert.equal(descendants(renderSettings(parsed, field)(items[0]), "Switch")[0].props.disabled, true);
    assert.equal(descendants(renderSettings(null)(items[0]), "Switch").length, 0, "unloaded preferences are not editable");
  }
  const views = groups.flatMap((group) => group.items).find((item) => item.key === "viewSummaryEnabled");
  assert.match(views.description, /unique viewers.*videos.*live sessions/u);
  assert.match(views.description, /Profile views are not included/u);
});

const cases = [
  ["social_follow", "social_activity", `/profile/${identity}`, "Open profile"],
  ["social_follow_request", "social_activity", `/profile/${identity}`, "Open profile"],
  ["social_follow_accepted", "social_activity", `/profile/${identity}`, "Open profile"],
  ["circle_request", "circle_activity", "/chilly-circle", "Review request"],
  ["circle_accepted", "circle_activity", "/chilly-circle", "Open Chi'lly Circle"],
  ["circle_added", "circle_activity", "/chilly-circle", "Open Chi'lly Circle"],
  ["circle_post", "circle_activity", `/profile/${identity}`, "Open profile"],
  ["content_shared", "social_activity", `/title/${identity}`, "Open title"],
  ["content_liked", "social_activity", `/player/${identity}`, "Open"],
  ["profile_post_liked", "social_activity", `/profile/${identity}`, "Open profile"],
  ["profile_comment", "reply_comment", `/profile/${identity}`, "Open profile"],
  ["profile_reply", "reply_comment", `/profile/${identity}`, "Open profile"],
  ["video_comment", "reply_comment", `/player/${identity}`, "Open video"],
  ["video_reply", "reply_comment", `/player/${identity}`, "Open video"],
  ["chat_message", "new_message", `/chat/${identity}`, "Open Chat"],
  ["video_view_summary", "view_summary", `/player/${identity}`, "View activity"],
  ["live_view_summary", "view_summary", `/channel/${identity}`, "View activity"],
  ["creator_event_updated", "upcoming_event_reminder", `/event/${identity}`, "Open event"],
  ["creator_event_canceled", "upcoming_event_reminder", `/event/${identity}`, "Open event"],
  ["moderation_notice", "moderation_notice", "/settings", "Review notice"],
];
const bellAst = sourceAst("components/notifications/notification-bell-button.tsx");
const rowRenderer = run(`${declaration(bellAst, "renderRow")}\nglobalThis.render = renderRow;`, {
  resolveNotificationPath: service.resolveNotificationPath, formatNotificationTimestamp: () => "Today",
  busyId: null, styles: {}, View: "View", Text: "Text", TouchableOpacity: "TouchableOpacity",
  MaterialIcons: "Icon", ActivityIndicator: "ActivityIndicator", openNotification: () => {}, dismiss: () => {},
}).render;
const textOf = (element) => Array.isArray(element) ? element.map(textOf).join("")
  : element && typeof element === "object" ? textOf(element.props?.children)
    : typeof element === "string" || typeof element === "number" ? String(element) : "";

for (const [type, category, route, label] of cases) {
  test(`actual bell parsing/rendering and safe destination: ${type}`, () => {
    const row = service.parseNotificationRow({ id: "notification", user_id: identity,
      category, notification_type: type, title: "Activity update", body: "New activity",
      deep_link: `chillywoodmobile://${route.slice(1)}`, status: "pending", target_context: {},
      target_route: route === "/chilly-circle" || route === "/settings" ? route
        : route.startsWith("/profile/") ? "/profile/[userId]" : route.startsWith("/player/") ? "/player/[id]"
          : route.startsWith("/chat/") ? "/chat/[threadId]" : route.startsWith("/event/") ? "/event/[eventId]" : "/channel/[userId]",
      target_entity_id: identity, created_at: "2026-10-10T12:00:00Z",
    });
    assert.equal(row.category, category, "new categories are not mislabeled as messages");
    assert.equal(row.notificationType, type);
    assert.equal(row.actionLabel, label);
    assert.equal(row.target.supported, true);
    assert.equal(service.resolveNotificationPath(row.deepLink), route);
    const rendered = rowRenderer(row);
    assert.equal(descendants(rendered, "TouchableOpacity")[0].props.disabled, false);
    assert.match(textOf(rendered), new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}

test("notification navigation never invents focus or action authority", () => {
  for (const route of ["/chilly-circle/other", "/chilly-circle?accept=1", "/chilly-circle?account=other",
    `/player/${identity}?commentId=${identity}`, `/profile/${identity}?postId=${identity}`,
    `https://attacker.invalid/chilly-circle`, "/chilly-circle/../settings"]) {
    assert.equal(service.resolveNotificationPath(route), null, route);
  }
  assert.equal(service.resolveNotificationPath("/chilly-circle?from=notification"), "/chilly-circle?from=notification");
  const rendered = rowRenderer({ id: "unsafe", notificationType: "circle_request", deepLink: "/chilly-circle?accept=1" });
  assert.equal(descendants(rendered, "TouchableOpacity")[0].props.disabled, true);
});
