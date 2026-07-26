import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const helper = read("_lib/releaseDiagnostics.ts");
const settings = read("app/settings.tsx");
const runtimeUpdates = read("_lib/runtimeUpdates.tsx");
const packageJson = JSON.parse(read("package.json"));

const allowedFields = [
  "appOwnership",
  "appVersion",
  "applicationId",
  "buildVersion",
  "channel",
  "checkAutomatically",
  "createdAt",
  "isEmbeddedLaunch",
  "isEmergencyLaunch",
  "latestKnownUpdateCheckResult",
  "nativeApplicationVersion",
  "nativeBuildVersion",
  "platform",
  "runtimeVersion",
  "updateId",
];

const forbiddenFields = [
  "auth session",
  "authorization",
  "cloudflare",
  "db url",
  "livekit token",
  "participantToken",
  "provider credentials",
  "refresh_token",
  "revenuecat api",
  "r2 secret",
  "service_role",
  "signedUrl",
  "supabaseAnonKey",
  "supabaseUrl",
];

assert.ok(packageJson.dependencies["expo-updates"], "expo-updates dependency must be present");
assert.ok(packageJson.dependencies["expo-application"], "expo-application dependency must be present");
assert.ok(packageJson.dependencies["expo-clipboard"], "expo-clipboard dependency must be present");

assert.ok(helper.includes("export function readReleaseDiagnostics"), "helper must expose readReleaseDiagnostics");
assert.ok(helper.includes("export function sanitizeReleaseDiagnosticsForDisplay"), "helper must expose sanitizer");
assert.ok(helper.includes("export function formatReleaseDiagnosticsSummary"), "helper must expose formatter");
assert.ok(helper.includes("recordReleaseUpdateCheckResult"), "helper must expose safe latest-check recorder");

for (const field of allowedFields) {
  assert.ok(helper.includes(field), `helper missing allowed field ${field}`);
}

const sanitizerStart = helper.indexOf("export function sanitizeReleaseDiagnosticsForDisplay");
const sanitizerEnd = helper.indexOf("const formatNullable", sanitizerStart);
const sanitizerSource = helper.slice(sanitizerStart, sanitizerEnd);
assert.ok(sanitizerSource.length > 0, "sanitizer source must be discoverable");
assert.ok(!sanitizerSource.includes("...diagnostics"), "sanitizer must not spread arbitrary input");

for (const forbidden of forbiddenFields) {
  assert.ok(!sanitizerSource.toLowerCase().includes(forbidden.toLowerCase()), `sanitizer references forbidden field ${forbidden}`);
}

for (const testId of [
  "release-diagnostics-card",
  "release-diagnostics-update-id",
  "release-diagnostics-runtime-version",
  "release-diagnostics-channel",
  "release-diagnostics-embedded-launch",
  "release-diagnostics-emergency-launch",
  "release-diagnostics-copy-button",
]) {
  assert.ok(settings.includes(testId), `settings UI missing ${testId}`);
}

assert.ok(settings.includes("Clipboard.setStringAsync(releaseDiagnosticsSummary)"), "copy button must copy sanitized summary");
assert.ok(settings.includes("readReleaseDiagnostics()"), "settings must read release diagnostics");
assert.ok(settings.includes("sanitizeReleaseDiagnosticsForDisplay"), "settings must display sanitized diagnostics");
assert.ok(runtimeUpdates.includes("recordReleaseUpdateCheckResult"), "runtime update gate must record non-secret check result");
assert.ok(runtimeUpdates.includes("Updates.useUpdates()"), "runtime update gate must observe native pending downloads");
assert.ok(runtimeUpdates.includes("updatesState.isUpdatePending"), "runtime update gate must activate pending downloads");
assert.ok(runtimeUpdates.includes("reloadRequestedRef.current = null"), "failed activation reload must become retryable");
assert.ok(!runtimeUpdates.includes("InteractionManager"), "runtime activation must not wait indefinitely for interactions");
assert.ok(!runtimeUpdates.includes("LAST_RELOAD_FINGERPRINT_KEY"), "runtime activation must not persist a permanent reload suppression key");

const diagnosticsBlockStart = settings.indexOf("release-diagnostics-card");
const diagnosticsBlockEnd = settings.indexOf("</SettingsAccordion>", diagnosticsBlockStart);
const diagnosticsBlock = settings.slice(diagnosticsBlockStart, diagnosticsBlockEnd).toLowerCase();
for (const forbidden of ["participanttoken", "signedurl", "supabaseanonkey", "servicerole", "r2", "cloudflare", "revenuecat", "livekit token"]) {
  assert.ok(!diagnosticsBlock.includes(forbidden), `diagnostics UI must not expose ${forbidden}`);
}

for (const behaviorFile of [
  "app/player/[id].tsx",
  "components/watch-party-live/livekit-stage-media-surface.tsx",
  "supabase/functions/livekit-token/index.ts",
  "_lib/mediaStorage.ts",
  "_lib/mediaPlaybackCdnEligibility.ts",
  "_lib/monetization.ts",
]) {
  const diff = readFileSync(path.join(root, behaviorFile), "utf8");
  assert.ok(diff.length > 0, `${behaviorFile} must remain readable for behavior guard`);
}

console.log(JSON.stringify({
  allowedFieldCount: allowedFields.length,
  status: "passed",
  testIds: 7,
}, null, 2));
