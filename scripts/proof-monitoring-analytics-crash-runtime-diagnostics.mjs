#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const passes = [];

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function assertExists(rel) {
  if (fs.existsSync(path.join(root, rel))) passes.push(`exists: ${rel}`);
  else failures.push(`missing file: ${rel}`);
}

function assertIncludes(rel, needle, label = `${rel} includes ${needle}`) {
  const body = read(rel);
  if (body.includes(needle)) passes.push(label);
  else failures.push(label);
}

function assertNotIncludes(rel, needle, label = `${rel} avoids ${needle}`) {
  const body = read(rel);
  if (body.includes(needle)) failures.push(label);
  else passes.push(label);
}

const doc = "docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md";
assertExists(doc);

[
  "Monitoring, analytics, crash, and runtime diagnostics: Closed",
  "Firebase Analytics/Crashlytics status is documented",
  "Sentry/PostHog status is documented and disabled/removed if not intended",
  "Analytics events must not include PII, private chat/message content, reporter identity, raw IPs, tokens, signed URLs, provider secrets, tax IDs, bank details, or payment credentials",
  "Crash/error diagnostics are sanitized",
  "User-facing runtime errors use safe copy",
  "Support/admin diagnostics are scoped and privacy-safe",
  "LiveKit/chat/upload/payment/reporting failures use safe diagnostics",
  "No debug/proof/internal copy is exposed in production UI",
  "Data Safety and Privacy disclosures match monitoring/diagnostics behavior",
  "Owner must confirm final SDK/provider collection settings before Play submission",
  "Provider Inventory",
  "Analytics Event Safety Policy",
  "Crash / Error Sanitization Policy",
  "Runtime Diagnostics / Health Matrix",
  "Support / Admin Diagnostics Privacy",
  "Console / Logging Policy",
  "Incident / Health Checklist",
  "Data Safety / Privacy Alignment",
  "No new analytics vendor was added",
  "Provider refunds remain manual/external",
  "No token/raw room URL logging or UI exposure",
  "No raw push token exposure",
].forEach((needle) => assertIncludes(doc, needle));

[
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  "docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md",
].forEach(assertExists);

const packageJson = read("package.json");
[
  "@react-native-firebase/analytics",
  "@react-native-firebase/crashlytics",
  "@react-native-firebase/perf",
  "@react-native-firebase/remote-config",
].forEach((needle) => {
  if (packageJson.includes(needle)) passes.push(`package includes ${needle}`);
  else failures.push(`package missing ${needle}`);
});

[
  "@sentry/",
  "sentry-expo",
  "posthog-react-native",
  "\"posthog\"",
].forEach((needle) => {
  if (packageJson.includes(needle)) failures.push(`unexpected monitoring vendor package: ${needle}`);
  else passes.push(`package avoids ${needle}`);
});

assertIncludes("app/_layout.tsx", "bootstrapFirebaseAnalytics", "app shell bootstraps Firebase Analytics");
assertIncludes("app/_layout.tsx", "bootstrapFirebaseCrashlytics", "app shell bootstraps Crashlytics");
assertIncludes("app/_layout.tsx", "bootstrapFirebasePerformance", "app shell bootstraps Performance");
assertIncludes("app/_layout.tsx", "RootErrorBoundary", "app shell uses root error boundary");
assertIncludes("app/_layout.tsx", "RuntimeUnavailableScreen", "app shell uses runtime unavailable screen");
assertIncludes("_lib/firebaseCrashlytics.ts", "redactSensitiveText", "Crashlytics redaction helper exists");
assertIncludes("_lib/logger.ts", "redactSensitiveText", "runtime logger redaction helper exists");
assertIncludes("_lib/logger.ts", "trackEvent(\"runtime_error\"", "runtime error analytics marker exists");
assertIncludes("_lib/logger.ts", "errorName: normalized.name", "runtime analytics uses error name");
assertNotIncludes("_lib/logger.ts", "message: normalized.message", "runtime analytics avoids error message payload");
assertNotIncludes("components/system/root-error-boundary.tsx", "errorMessage: error.message", "root-boundary support feedback omits raw error message");

[
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md",
  "docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md",
  "docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md",
  "docs/FINAL_PUBLIC_USE_GO_NO_GO.md",
].forEach((rel) => assertIncludes(rel, "monitoring", `${rel} references monitoring/diagnostics alignment`));

if (failures.length) {
  console.error("Monitoring/analytics/crash/runtime diagnostics proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Monitoring/analytics/crash/runtime diagnostics proof passed.");
for (const item of passes) console.log(`pass: ${item}`);
