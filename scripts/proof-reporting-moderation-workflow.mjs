import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
const artifactDir = `/tmp/app-reporting-moderation-workflow-proof-${stamp}`;
mkdirSync(artifactDir, { recursive: true });

const read = (path) => readFileSync(join(root, path), "utf8");
const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed, detail });
};

const workflowDoc = read(
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
);
const moderationDoc = read("docs/legal/MODERATION_REPORTING_WORKFLOW.md");
const moderatorDoc = read(
  "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
);
const commandCenterDoc = read(
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
);
const reportSheet = read("components/safety/report-sheet.tsx");
const moderationLib = read("_lib/moderation.ts");
const duplicateMigration = read(
  "supabase/migrations/20260625202127_reporting_moderation_duplicate_guard.sql",
);
const packageJson = read("package.json");
const workflowDocLower = workflowDoc.toLowerCase();
const reportSheetLower = reportSheet.toLowerCase();

const requiredWorkflowMarkers = [
  "Reporting and moderation workflow: Closed",
  "Reportable Surface Matrix",
  "Category And Severity Model",
  "Queue Separation",
  "Reporter Privacy / Notification Policy",
  "Dedupe / Rate-Limit Policy",
  "Auto-Hide Vs Review Policy",
  "Appeals",
  "Staff Scope / Case Context",
  "Users can report profiles, Profile media, Platform content, videos, paid videos, live rooms, chat messages, comments, replies, events, and VIP/subscriber content where the surface exists",
  "Reporter identity stays private by default",
  "Reported users are not notified merely because a report was filed",
  "Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation",
  "Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals are separated",
  "Duplicate/false reports are deduped and rate-limited",
  "Staff access requires exact scopes and case/report context",
  "No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
];

for (const marker of requiredWorkflowMarkers) {
  check(`workflow_doc:${marker}`, workflowDoc.includes(marker), marker);
}

[
  "harassment or bullying",
  "hate or discrimination",
  "threats or violence",
  "sexual content or exploitation",
  "self-harm or dangerous behavior",
  "illegal activity",
  "spam or scam",
  "impersonation",
  "privacy violation/doxxing",
  "copyright/DMCA",
  "misinformation or deceptive content",
  "graphic/violent content",
  "minor safety",
  "fraud/payment concern",
  "live safety issue",
  "other",
].forEach((marker) => {
  check(
    `category:${marker}`,
    workflowDocLower.includes(marker.toLowerCase()) &&
      reportSheetLower.includes(marker.toLowerCase()),
    marker,
  );
});

[
  "SAFETY_REPORT_TARGET_TYPES",
  "SAFETY_REPORT_CATEGORIES",
  "This report target is not supported.",
  "Choose a supported report category.",
  "dedupe_safety_report",
  '.eq("reporter_user_id", reporterUserId)',
  '.eq("target_type", input.targetType)',
  '.eq("target_id", targetId)',
  '.eq("category", input.category)',
].forEach((marker) => {
  check(`moderation_lib:${marker}`, moderationLib.includes(marker), marker);
});

[
  "enforce_safety_reports_duplicate_guard",
  "safety_report_duplicate_window",
  "same authenticated reporter against the same target/category",
  "Does not expose reporter identity or mutate target content",
].forEach((marker) => {
  check(
    `duplicate_guard:${marker}`,
    duplicateMigration.includes(marker),
    marker,
  );
});

[
  "Your report goes to the moderation team",
  "Your identity stays private from the reported person by default",
  "A report does not remove content automatically",
  "Please report in good faith",
  "Open Copyright Report",
  "Selected report category:",
  "KeyboardAvoidingView",
  'keyboardShouldPersistTaps="handled"',
  "Math.max(insets.bottom, 16)",
  "accessibilityViewIsModal",
  'accessibilityRole="radio"',
  "accessibilityState={{ selected: categoryKey === entry.key }}",
  'accessibilityLabel="Optional report details"',
  "accessibilityState={{ disabled: busy, busy }}",
].forEach((marker) => {
  check(`report_sheet:${marker}`, reportSheet.includes(marker), marker);
});

check(
  "report_sheet:no_client_queue_claim",
  !/scoped moderation queue|Review path:|\. Queue:|\bqueue\s*:|categoryOption\.queue/i.test(
    reportSheet,
  ),
  "No client-invented queue routing is displayed or submitted",
);
check(
  "report_sheet:dismiss_resets_state",
  reportSheet.includes("onRequestClose={closeAndReset}") &&
    reportSheet.includes("onPress={closeAndReset}") &&
    reportSheet.includes('setCategoryKey("harassment_bullying")') &&
    reportSheet.includes('setNote("")'),
  "Every dismiss path clears category and note state",
);

[
  "Reporting and moderation workflow: Closed",
  "Reporter identity stays private by default",
  "Reported users are not notified merely because a report was filed",
].forEach((marker) => {
  check(
    `linked_docs:${marker}`,
    moderationDoc.includes(marker) &&
      moderatorDoc.includes(marker) &&
      commandCenterDoc.includes(marker),
    marker,
  );
});

[
  "provider refunds remain manual/external",
  "cannot issue refunds",
  "No money/provider/payout behavior is activated",
].forEach((marker) => {
  check(
    `money_boundary:${marker}`,
    `${workflowDoc}\n${moderatorDoc}\n${read("ROADMAP.md")}`.includes(marker),
    marker,
  );
});

check(
  "package_script:proof",
  packageJson.includes('"proof:reporting-moderation-workflow"'),
  "proof package script is wired",
);
check(
  "package_script:guard",
  packageJson.includes('"guard:reporting-moderation-policy"'),
  "guard package script is wired",
);

const failed = checks.filter((entry) => !entry.passed);
const summary = {
  artifact: artifactDir,
  passed: checks.length - failed.length,
  failed: failed.length,
  total: checks.length,
};

writeFileSync(
  join(artifactDir, "README.md"),
  [
    "# Reporting Moderation Workflow Proof",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This proof is static/read-only and performs no provider, money, payout, refund, role, or report mutations.",
    "",
    JSON.stringify(summary, null, 2),
    "",
  ].join("\n"),
);
writeFileSync(
  join(artifactDir, "checks.json"),
  JSON.stringify(checks, null, 2),
);

console.log(JSON.stringify(summary, null, 2));
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}
