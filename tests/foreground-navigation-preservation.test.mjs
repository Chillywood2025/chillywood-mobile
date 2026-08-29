import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("same-session foreground checks preserve the mounted navigator", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /let navigationBlocker: React\.ReactNode = null/u);
  assert.match(layout, /<RootNavigator \/>[\s\S]{0,500}navigation-blocking-overlay/u);
  assert.doesNotMatch(layout, /if \(legalGateBlocking\)[\s\S]{0,300}return <AuthBootScreen/u);
  assert.match(layout, /StyleSheet\.absoluteFillObject[\s\S]{0,160}zIndex: 100/u);
});

test("same-user auth revalidation does not blank rendered identity before verification", () => {
  const session = read("_lib/session.tsx");
  assert.match(session, /const sameUserRevalidation = !!candidate/u);
  assert.match(session, /if \(sameUserRevalidation\) \{[\s\S]{0,180}setSession\(candidate\);[\s\S]{0,120}setUser\(candidate\.user\);/u);
  assert.match(session, /!candidateStillCurrent \|\| !access\) \{ clearRenderedAuthority\("unknown"\)/u);
  assert.match(session, /clearRenderedAuthority\("restricted"\)/u);
});

test("resume restoration can re-arm after a real rendered sign-in loss", () => {
  const updates = read("_lib/runtimeUpdates.tsx");
  assert.match(updates, /if \(isSignedIn\) return;[\s\S]{0,160}restoreAttemptedUserRef\.current = null;[\s\S]{0,120}restoreSettledUserRef\.current = null;/u);
});
