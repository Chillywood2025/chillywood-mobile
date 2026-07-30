#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TTL_MS = 45_000;
const threadId = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
const hash = (value) => createHash("sha256").update(value).digest("hex");

const createStoreModel = () => {
  let pending = null;
  let consumed = null;
  const fresh = (createdElapsedAt, elapsedAt) => (
    Number.isSafeInteger(createdElapsedAt)
    && createdElapsedAt > 0
    && elapsedAt - createdElapsedAt >= 0
    && elapsedAt - createdElapsedAt <= TTL_MS
  );
  return {
    capture(value, elapsedAt, createdAt) {
      const action = String(value?.nativeCallAction ?? "").trim().toLowerCase();
      const normalizedThreadId = String(value?.threadId ?? "").trim().toLowerCase();
      const normalizedInviteId = String(value?.callInviteId ?? "").trim().toLowerCase();
      if (
        !["answer", "decline"].includes(action)
        || !UUID_PATTERN.test(normalizedThreadId)
        || !UUID_PATTERN.test(normalizedInviteId)
      ) {
        return "rejected";
      }
      const requestKey = hash(`${normalizedThreadId}:${normalizedInviteId}:${action}`);
      if (pending && fresh(pending.elapsedAt, elapsedAt)) {
        return pending.requestKey === requestKey ? "deduped" : "rejected";
      }
      if (
        consumed
        && consumed.requestKey === requestKey
        && fresh(consumed.elapsedAt, elapsedAt)
      ) {
        return "replay_denied";
      }
      pending = {
        callInviteId: normalizedInviteId,
        createdAt,
        elapsedAt,
        nativeCallAction: action,
        requestKey,
        schemaVersion: 1,
        threadId: normalizedThreadId,
      };
      return "buffered";
    },
    consume({ elapsedAt, sessionReady }) {
      if (!sessionReady) return null;
      const value = pending;
      if (!value) return null;
      pending = null;
      if (!fresh(value.elapsedAt, elapsedAt)) return null;
      consumed = { elapsedAt, requestKey: value.requestKey };
      return value;
    },
    status(elapsedAt) {
      if (!pending) return "empty";
      if (fresh(pending.elapsedAt, elapsedAt)) return "present";
      pending = null;
      return "expired";
    },
  };
};

const store = createStoreModel();
const action = { callInviteId: inviteId, nativeCallAction: "answer", threadId };
assert.equal(store.capture(action, 1_000, 1_722_000_000_000), "buffered");
assert.equal(store.status(2_000), "present");
assert.equal(store.capture(action, 2_000, 1_722_000_001_000), "deduped");
assert.equal(
  store.consume({ elapsedAt: 3_000, sessionReady: false }),
  null,
  "signed-out or loading JavaScript must not consume the native action",
);
const consumed = store.consume({ elapsedAt: 3_000, sessionReady: true });
assert.equal(consumed?.nativeCallAction, "answer");
assert.equal(consumed?.schemaVersion, 1);
assert.match(consumed?.requestKey ?? "", /^[0-9a-f]{64}$/u);
assert.equal(store.consume({ elapsedAt: 3_001, sessionReady: true }), null);
assert.equal(store.status(3_001), "empty");
assert.equal(
  store.capture(action, 4_000, 1_722_000_003_000),
  "replay_denied",
  "a consumed request cannot be replayed inside the invite window",
);

const expiringStore = createStoreModel();
assert.equal(
  expiringStore.capture(
    { callInviteId: inviteId, nativeCallAction: "decline", threadId },
    10_000,
    1_722_000_000_000,
  ),
  "buffered",
);
assert.equal(expiringStore.status(55_001), "expired");
assert.equal(
  expiringStore.consume({ elapsedAt: 55_001, sessionReady: true }),
  null,
);
assert.equal(
  expiringStore.capture(
    { callInviteId: "malformed", nativeCallAction: "answer", threadId },
    60_000,
    1_722_000_050_000,
  ),
  "rejected",
);
assert.equal(
  expiringStore.capture(
    { callInviteId: inviteId, nativeCallAction: "incoming", threadId },
    60_000,
    1_722_000_050_000,
  ),
  "rejected",
);

const plugin = fs.readFileSync("plugins/withChillyChatNativeCallNotifications.js", "utf8");
const layout = fs.readFileSync("app/_layout.tsx", "utf8");
const nativeIntent = fs.readFileSync("app/+native-intent.tsx", "utf8");
const routeBuffer = fs.readFileSync("_lib/chillyChatNativeCallRouteBuffer.ts", "utf8");
const chatThread = fs.readFileSync("app/chat/[threadId].tsx", "utf8");

assert.match(plugin, /val answerIntent = buildActivityPendingIntent\(context, data, "answer", 1\)/u);
assert.match(plugin, /val declineIntent = buildActionPendingIntent\(context, data, ACTION_DECLINE, 2\)/u);
assert.match(plugin, /ACTION_ANSWER -> "answer"/u);
assert.match(plugin, /ACTION_DECLINE -> "decline"/u);
assert.match(plugin, /ChillyChatNativeCallActionStore\.capture\(context, intent\)[\s\S]{0,120}startActivity\(intent\)/u);
assert.match(plugin, /captureForActivity\(this, intent\)/u);
assert.match(plugin, /override fun onNewIntent\(intent: Intent\)[\s\S]{0,180}setIntent\(intent\)[\s\S]{0,120}super\.onNewIntent\(intent\)/u);
assert.match(plugin, /fun consumePendingNativeCallAction\(promise: Promise\)/u);
assert.match(plugin, /fun readPendingNativeCallActionStatus\(promise: Promise\)/u);
assert.match(plugin, /Context\.MODE_PRIVATE/u);
assert.match(plugin, /MAX_ACTION_AGE_MS = 45_000L/u);
assert.match(plugin, /KEY_LAST_CONSUMED_REQUEST_KEY/u);
assert.doesNotMatch(plugin, /access_token|refresh_token|supabaseAnonKey|livekit.*token/iu);
const nativeLogMessages = [...plugin.matchAll(/Log\.i\([^,]+,\s*"([^"]+)"\)/gu)]
  .map((match) => match[1]);
const allowedNativeLogMessages = new Set([
  "ACTION_BUFFERED",
  "ACTION_CAPTURED",
  "ACTION_CONSUMED",
  "ACTION_EXPIRED",
  "ACTION_REPLAY_DENIED",
  "REACT_CONTEXT_READY",
]);
assert.ok(nativeLogMessages.length >= 6);
assert.ok(nativeLogMessages.every((message) => allowedNativeLogMessages.has(message)));
assert.doesNotMatch(plugin, /Log\.[a-z]+\([^)]*\$/u);

assert.match(nativeIntent, /redirectEarlyAndroidNativeCallSystemPath\(path\)/u);
assert.match(routeBuffer, /earlyNativeCallRouteBuffer\.capture\(path\)/u);
assert.match(layout, /nativeCallActionAuthReadyRef\.current = !isLoading && isSignedIn/u);
assert.match(layout, /consumePendingAndroidNativeCallRoute\(\)/u);
assert.match(layout, /AppState\.addEventListener\("change"/u);
assert.match(layout, /handledNativeCallRouteKeysRef/u);
assert.match(chatThread, /readChillyChatCallInvite\(requestedCallInviteId\)/u);
assert.match(chatThread, /latestInvite\.status === "ringing"/u);
assert.match(chatThread, /invite\.calleeUserId !== currentUserId/u);

console.log("Chi'lly Chat native pending-action handoff fixtures passed.");
