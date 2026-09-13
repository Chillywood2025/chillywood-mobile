import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("same-session foreground checks preserve the mounted navigator", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /let navigationBlocker: React\.ReactNode = null/u);
  assert.match(layout, /<RootNavigator key=\{navigationTreeKey\} \/>[\s\S]{0,500}navigation-blocking-overlay/u);
  assert.doesNotMatch(layout, /if \(legalGateBlocking\)[\s\S]{0,300}return <AuthBootScreen/u);
  assert.match(layout, /StyleSheet\.absoluteFillObject[\s\S]{0,160}zIndex: 100/u);
  assert.match(layout, /preserveAcceptedRender = acceptedLegalVerificationKeyRef\.current === requestVerificationKey/u);
  assert.match(layout, /if \(!preserveAcceptedRender\) \{[\s\S]{0,160}setLegalStatus\("checking"\)/u);
  assert.match(layout, /shouldBlockAccountLegalGate/u);
});

test("same-user auth revalidation does not blank rendered identity before verification", () => {
  const session = read("_lib/session.tsx");
  assert.match(session, /const sameUserRevalidation = !!candidate/u);
  assert.match(session, /if \(sameUserRevalidation\) \{[\s\S]{0,180}setSession\(candidate\);[\s\S]{0,120}setUser\(candidate\.user\);/u);
  assert.match(session, /!candidateStillCurrent \|\| !access\) \{ clearRenderedAuthority\("unknown"\)/u);
  assert.match(session, /clearRenderedAuthority\("restricted"\)/u);
});

test("short native interruptions do not trigger a runtime update pseudo-restart", () => {
  const updates = read("_lib/runtimeUpdates.tsx");
  assert.match(updates, /MIN_BACKGROUND_BEFORE_RESUME_CHECK_MS = 10 \* 60 \* 1000/u);
  assert.match(updates, /backgroundDurationMs < MIN_BACKGROUND_BEFORE_RESUME_CHECK_MS[\s\S]{0,320}return;/u);
});
