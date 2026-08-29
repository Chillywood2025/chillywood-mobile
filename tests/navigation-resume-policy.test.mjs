import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_NAVIGATION_RESUME_BLOCKED_PATHS,
  CALL_SENSITIVE_NAVIGATION_PARAM_NAMES,
  NAVIGATION_RESUME_MAX_AGE_MS,
  hasCallSensitiveNavigationParams,
  normalizeNavigationResumePath,
  parseNavigationResumeRecord,
} from "../_lib/navigationResumePolicy.mjs";

const LEGAL_PATHS = [
  "/privacy",
  "/terms",
  "/account-deletion",
  "/support",
  "/community-guidelines",
  "/creator-rules",
  "/copyright",
  "/support-policy",
  "/premium-terms",
  "/live-rules",
  "/law-enforcement",
  "/moderation-policy",
  "/creator-monetization",
  "/copyright-report",
];

test("blocks every auth alias required by app-link authority", () => {
  for (const path of [
    "/auth",
    "/auth-callback",
    "/auth/callback",
    "/auth/reset-password",
    "/auth/v1/verify",
    "/auth/verify",
    "/callback",
    "/confirm",
    "/forgot-password",
    "/login",
    "/reset-password",
    "/signup",
    "/v1/verify",
    "/verify",
  ]) {
    assert.equal(AUTH_NAVIGATION_RESUME_BLOCKED_PATHS.includes(path), true, path);
    assert.equal(normalizeNavigationResumePath(path, LEGAL_PATHS), null, path);
  }
});

test("blocks every canonical legal route", () => {
  for (const path of LEGAL_PATHS) {
    assert.equal(normalizeNavigationResumePath(path, LEGAL_PATHS), null, path);
  }
});

test("blocks transient call and live-stage routes", () => {
  assert.equal(normalizeNavigationResumePath("/communication/room-1", LEGAL_PATHS), null);
  assert.equal(normalizeNavigationResumePath("/watch-party/live-stage/party-1", LEGAL_PATHS), null);
});

test("detects call-sensitive chat parameters even though pathname omits query", () => {
  for (const name of CALL_SENSITIVE_NAVIGATION_PARAM_NAMES) {
    assert.equal(
      hasCallSensitiveNavigationParams("/chat/thread-1", { [name]: "1" }),
      true,
      name,
    );
  }
  assert.equal(hasCallSensitiveNavigationParams("/chat/thread-1", {}), false);
  assert.equal(hasCallSensitiveNavigationParams("/profile/user-1", { openCall: "1" }), false);
});

test("allows durable signed-in content routes", () => {
  for (const path of [
    "/explore",
    "/live",
    "/my-list",
    "/profile/user-1",
    "/player/video-1",
    "/channel-studio",
    "/chat/thread-1",
  ]) {
    assert.equal(normalizeNavigationResumePath(path, LEGAL_PATHS), path);
  }
});

test("rejects query fragments malformed paths and stale records", () => {
  assert.equal(normalizeNavigationResumePath("/chat/thread-1?openCall=1", LEGAL_PATHS), null);
  assert.equal(normalizeNavigationResumePath("/profile/user-1#fragment", LEGAL_PATHS), null);
  assert.equal(normalizeNavigationResumePath("//evil", LEGAL_PATHS), null);
  assert.equal(normalizeNavigationResumePath("/bad\\path", LEGAL_PATHS), null);

  const now = 1_000_000_000;
  assert.deepEqual(
    parseNavigationResumeRecord(JSON.stringify({ pathname: "/explore", savedAt: now - 1000 }), LEGAL_PATHS, now),
    { pathname: "/explore", savedAt: now - 1000 },
  );
  assert.equal(
    parseNavigationResumeRecord(JSON.stringify({ pathname: "/explore", savedAt: now - NAVIGATION_RESUME_MAX_AGE_MS - 1 }), LEGAL_PATHS, now),
    null,
  );
  assert.equal(
    parseNavigationResumeRecord(JSON.stringify({ pathname: "/support", savedAt: now - 1000 }), LEGAL_PATHS, now),
    null,
  );
});
