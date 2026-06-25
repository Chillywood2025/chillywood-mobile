#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
const artifactDir = path.join("/tmp", `app-wave6-final-readiness-proof-${stamp}`);

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const includes = (source, needle) => source.includes(needle);

const rows = [];
const add = (area, check, status, evidence, launchImpact = "") => {
  rows.push({ area, check, status, evidence, launchImpact });
};

const expectFile = (area, relativePath, launchImpact = "") => {
  add(area, relativePath, exists(relativePath) ? "Pass" : "Gap", exists(relativePath) ? "file present" : "file missing", launchImpact);
};

const expectText = (area, label, source, needle, launchImpact = "") => {
  add(area, label, includes(source, needle) ? "Pass" : "Gap", includes(source, needle) ? `found ${needle}` : `missing ${needle}`, launchImpact);
};

const expectNoText = (area, label, source, needle, launchImpact = "") => {
  add(area, label, !includes(source, needle) ? "Pass" : "Gap", !includes(source, needle) ? `does not include ${needle}` : `includes ${needle}`, launchImpact);
};

const appLayout = read("app/_layout.tsx");
const nextTask = read("NEXT_TASK.md");
const wave5 = read("docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md");
const firebaseAnalytics = read("_lib/firebaseAnalytics.ts");
const firebaseCrashlytics = read("_lib/firebaseCrashlytics.ts");
const analytics = read("_lib/analytics.ts");
const runtimeConfig = read("_lib/runtimeConfig.ts");
const featureFlags = read("_lib/featureFlags.ts");
const channelSettings = read("app/channel-settings.tsx");
const refundSupport = read("docs/support/REFUND_SUPPORT_PLAYBOOK.md");
const refundPolicy = read("docs/policies/REFUND_CANCELLATION_RETURN_POLICY.md");
const legalDataSafety = read("docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md");
const firebaseRunbook = read("docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md");
const livekitRunbook = read("docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md");
const turnRunbook = exists("docs/TURN_SPIKE_PROTECTION_RUNBOOK.md") ? read("docs/TURN_SPIKE_PROTECTION_RUNBOOK.md") : "";

const publicLegalRoutes = [
  "/privacy",
  "/terms",
  "/account-deletion",
  "/support",
  "/community-guidelines",
  "/creator-rules",
  "/copyright",
  "/premium-terms",
  "/live-rules",
  "/moderation-policy",
  "/copyright-report",
];

for (const route of publicLegalRoutes) {
  const file = route === "/support" ? "app/support.tsx" : `app${route}.tsx`;
  expectText("legal_routes", `${route} allowlist`, appLayout, `"${route}"`, "Public legal/support route auth-gate safety");
  expectFile("legal_routes", file, "Public legal/support route availability");
}

[
  "docs/SEEDED_PROOF_HARNESS.md",
  "docs/WAVE4_ABUSE_RATE_LIMIT_PROOF.md",
  "docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md",
  "docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md",
  "docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md",
  "docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md",
  "docs/TURN_SPIKE_PROTECTION_RUNBOOK.md",
  "docs/ANDROID_RELEASE_EAS_RUNBOOK.md",
  "docs/support/REFUND_SUPPORT_PLAYBOOK.md",
  "docs/policies/REFUND_CANCELLATION_RETURN_POLICY.md",
  "docs/security/MALWARE_SCANNING_READINESS_PLAN.md",
].forEach((relativePath) => expectFile("runbooks", relativePath, "Rollback/incident/readiness documentation"));

[
  "Wave 5.1 — Disabled/Deactivated Access + Admin Suspend Proof",
  "password reset/auth email provider proof",
  "real provider refund execution",
  "controlled account purge/de-identification",
].forEach((needle) => expectText("known_blockers", needle, nextTask, needle, "Final Go/No-Go blocker visibility"));

expectText("legal_copy", "refund support no guarantee posture", refundSupport, "without promising outcomes", "Refund copy consistency");
expectText("legal_copy", "live money off support posture", refundSupport, "production live money is not active", "Money/payout copy consistency");
expectText("legal_copy", "refund policy no guarantee posture", refundPolicy, "avoid blanket guaranteed refund language", "Refund copy consistency");
expectText("legal_copy", "account deletion scheduling truth", legalDataSafety, "30-day restore window", "Account lifecycle copy consistency");
expectText("legal_copy", "Wave 5 deletion fail closed", wave5, "Public Profile hiding", "Account lifecycle proof consistency");

[
  "premiumPurchaseEnabled: false",
  "paidContentCheckoutEnabled: false",
  "cashoutEnabled: false",
  "payoutsEnabled: false",
  "liveMoneyEnabled: false",
].forEach((needle) => expectText("feature_flags", needle, featureFlags, needle, "Money/Premium fail-closed posture"));

expectText("money_copy", "sandbox only copy", channelSettings, "No real charges, creator earnings, payouts, withdrawals, or cash-out", "Money false-claim prevention");
expectText("money_copy", "provider refund not run", wave5, "Provider refund execution", "Refund execution remains pending/manual");
expectNoText("money_copy", "no instant refund promise", `${channelSettings}\n${refundSupport}\n${refundPolicy}`, "instant refund", "Refund copy consistency");

expectFile("analytics_crash", "google-services.json", "Firebase config presence");
expectText("analytics_crash", "Firebase Analytics package", read("package.json"), "@react-native-firebase/analytics", "Analytics provider presence");
expectText("analytics_crash", "Firebase Crashlytics package", read("package.json"), "@react-native-firebase/crashlytics", "Crash provider presence");
expectText("analytics_crash", "Firebase Performance package", read("package.json"), "@react-native-firebase/perf", "Monitoring provider presence");
expectText("analytics_crash", "Crashlytics runbook dashboard receipt posture", firebaseRunbook, "Dashboard Receipt Proved", "Dashboard proof honesty");
expectText("analytics_crash", "Crash redaction patterns", firebaseCrashlytics, "SENSITIVE_TEXT_PATTERNS", "Secret redaction");
expectText("analytics_crash", "Runtime error redaction patterns", read("_lib/logger.ts"), "SENSITIVE_TEXT_PATTERNS", "Secret redaction");
expectNoText("analytics_crash", "Analytics email user property removed", firebaseAnalytics, "email:", "Telemetry privacy");
expectNoText("analytics_crash", "Crashlytics email attribute removed", firebaseCrashlytics, "\"email\"", "Telemetry privacy");
expectNoText("analytics_crash", "Analytics dev email mirror removed", analytics, "email:", "Telemetry privacy");

expectText("rollback_incident", "LiveKit runbook", livekitRunbook, "LiveKit", "LiveKit incident/rollback documentation");
expectText("rollback_incident", "TURN spike runbook", turnRunbook, "TURN", "TURN/cost incident documentation");
expectText("rollback_incident", "Android release rollback", read("docs/ANDROID_RELEASE_EAS_RUNBOOK.md"), "OTA can update JavaScript/assets only", "App release rollback documentation");
expectText("rollback_incident", "media scan plan", read("docs/security/MALWARE_SCANNING_READINESS_PLAN.md"), "fail", "Media scan incident posture");
expectText("rollback_incident", "runtime config validation", runtimeConfig, "getRuntimeConfigIssueSummary", "Safe runtime config degradation");

[
  ["Wave 0", "Wave 0 —"],
  ["Wave 1", "Wave 1 —"],
  ["Wave 2", "Wave 2 —"],
  ["Wave 3", "Wave 3 —"],
  ["Wave 4", "Wave 4"],
  ["Wave 5", "Wave 5 status:"],
  ["Wave 6", "Wave 6 status:"],
].forEach(([label, needle]) => expectText("wave_summary_source", label, nextTask, needle, "Final readiness source data"));

const statusCounts = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] ?? 0) + 1;
  return acc;
}, {});

const finalGoNoGo = rows.some((row) => row.status === "Gap")
  ? "Partial / Not Ready"
  : "Partial / Not Ready";

mkdirSync(artifactDir, { recursive: true });
const result = {
  generatedAt: now.toISOString(),
  finalGoNoGo,
  statusCounts,
  rows,
  knownLaunchBlockers: [
    {
      blocker: "Wave 5.1 disabled/deactivated private-feature denial sweep",
      type: "app-controlled",
      launchImpact: "Closed by Wave 5.1 runtime proof.",
      status: "Closed",
    },
    {
      blocker: "Wave 5.1 admin/operator suspend/deactivate support-action proof",
      type: "app-controlled",
      launchImpact: "Closed by Wave 5.1 runtime proof.",
      status: "Closed",
    },
    {
      blocker: "password reset/auth email provider proof",
      type: "external/provider",
      launchImpact: "Provider proof pending.",
      status: "Pending",
    },
    {
      blocker: "real provider refund execution",
      type: "external/provider",
      launchImpact: "Manual/external path accepted; do not claim automated refunds.",
      status: "Accepted manual/external",
    },
    {
      blocker: "installed deletion/restore visual proof",
      type: "installed proof",
      launchImpact: "Closed on Play-installed runtime.",
      status: "Closed",
    },
    {
      blocker: "permanent purge/de-identification policy",
      type: "account lifecycle proof",
      launchImpact: "Closed for controlled production path; batch auto-purge remains disabled/default-off and no legal compliance claim is made.",
      status: "Closed for controlled production path",
    },
  ],
};

writeFileSync(path.join(artifactDir, "final-readiness.json"), JSON.stringify(result, null, 2));
writeFileSync(path.join(artifactDir, "README.md"), [
  "# Wave 6 Final Readiness Proof",
  "",
  `Generated: ${now.toISOString()}`,
  "",
  `Final Go/No-Go: ${finalGoNoGo}`,
  "",
  "This read-only proof scans route contracts, readiness docs, money/refund copy, Firebase analytics/crash configuration, blocker tracking, and rollback/runbook coverage.",
  "",
  "No secrets, credentials, tokens, signed URLs, provider keys, proof passwords, real users, provider refunds, emails, pushes, purchases, migrations, or Supabase function mutations are used.",
  "",
  `Rows: ${rows.length}`,
  `Status counts: ${JSON.stringify(statusCounts)}`,
  "",
].join("\n"));

console.log(JSON.stringify({
  ok: !rows.some((row) => row.status === "Gap"),
  finalGoNoGo,
  artifactDir,
  statusCounts,
}, null, 2));

if (rows.some((row) => row.status === "Gap")) {
  process.exitCode = 1;
}
