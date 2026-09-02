import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateReportSheetSource } from "./lib/report-sheet-policy.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Reporting moderation policy guard failed: ${message}`);
  process.exit(1);
};

const workflowDoc = read(
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
);
const moderationDoc = read("docs/legal/MODERATION_REPORTING_WORKFLOW.md");
const reportSheet = read("components/safety/report-sheet.tsx");
const moderationLib = read("_lib/moderation.ts");
const duplicateMigration = read(
  "supabase/migrations/20260625202127_reporting_moderation_duplicate_guard.sql",
);
const packageJson = read("package.json");

[
  "Reporter identity stays private by default",
  "Reported users are not notified merely because a report was filed",
  "Moderation actions can notify affected users/creators with safe copy",
  "Appeals use support/escalation workflow in V1 unless full in-app appeal UI exists",
  "Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation",
  "Illegal/safety/security categories are escalated differently",
  "Normal reports, DMCA/legal, support, money/refund/access support, security incidents, and appeals are separated",
  "Duplicate/false reports are deduped and rate-limited",
  "Staff access requires exact scopes and case/report context",
  "No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
].forEach((needle) => {
  if (!workflowDoc.includes(needle))
    fail(`missing workflow doctrine: ${needle}`);
});

[
  "user profile",
  "Profile photo",
  "Profile background",
  "creator Platform/channel",
  "public creator video",
  "paid video",
  "VIP/subscriber content",
  "post",
  "comment",
  "reply",
  "chat message",
  "room message",
  "Watch-Party room",
  "Live room",
  "live participant",
  "event",
  "event content/chat if present",
  "suspicious purchase/access/refund issue",
  "impersonation/username/handle issue",
].forEach((needle) => {
  if (!workflowDoc.includes(needle))
    fail(`missing reportable surface: ${needle}`);
});

const reportSheetFindings = validateReportSheetSource(reportSheet);
if (reportSheetFindings.length) fail(reportSheetFindings.join("; "));

const reportSheetMutants = [
  ["routing jargon", reportSheet.replace('<Text style={styles.helperText}>{REPORT_SHEET_HELPER_TEXT}</Text>', '<Text>Review</Text><Text>{title}</Text><Text>path: urgent</Text><Text style={styles.helperText}>{REPORT_SHEET_HELPER_TEXT}</Text>')],
  ["submitted queue claim", reportSheet.replace("Selected report category: ${categoryOption.label}.", "Selected report category: ${categoryOption.label}. Queue: urgent.")],
  ["keyboard container", reportSheet.replaceAll("KeyboardAvoidingView", "View")],
  ["small-screen bound", reportSheet.replace('maxHeight: "92%"', 'maxHeight: "920%"')],
  ["safe-area padding", reportSheet.replace("Math.max(insets.bottom, 16)", "16")],
  ["state reset polarity", reportSheet.replace("if (!visible)", "if (visible)")],
  ["category semantics", reportSheet.replace('accessibilityRole="radio"', 'accessibilityRole="button"')],
  ["category selector no-op", reportSheet.replace("onPress={() => setCategoryKey(entry.key)}", "onPress={() => undefined}")],
  ["wrong option mapping", reportSheet.replace('backedCategory: "copyright",', 'backedCategory: "harassment",')],
  ["empty category map", reportSheet.replace("REPORT_SHEET_CATEGORY_OPTIONS.map((entry)", "[].map((entry)")],
  ["busy copyright navigation", reportSheet.replace('disabled={busy}\n                    accessibilityRole="button"\n                    accessibilityLabel="Open Copyright Report"', 'disabled={false}\n                    accessibilityRole="button"\n                    accessibilityLabel="Open Copyright Report"')],
  ["wrong copyright route", reportSheet.replace('"/copyright-report" as Parameters<', '"/settings" as Parameters<')],
  ["cancel bypasses reset", reportSheet.replace('accessibilityLabel="Cancel report"\n                accessibilityState={{ disabled: busy }}\n                onPress={closeAndReset}', 'accessibilityLabel="Cancel report"\n                accessibilityState={{ disabled: busy }}\n                onPress={onClose}')],
  ["close handler omits resets", reportSheet.replace('const closeAndReset = () => {\n    if (busy) return;\n    setCategoryKey("harassment_bullying");\n    setNote("");\n    onClose();\n  };', "const closeAndReset = () => {\n    if (busy) return;\n    onClose();\n  };")],
  ["unconditional return before resets", reportSheet.replace("const closeAndReset = () => {\n    if (busy) return;", "const closeAndReset = () => {\n    return;")],
  ["contradictory composed privacy copy", reportSheet.replace("{REPORT_SHEET_HELPER_TEXT}", '{[REPORT_SHEET_HELPER_TEXT, "Reports are shared with the reported person."].join(" ")}')],
  ["contradictory helper privacy copy", reportSheet.replace("Your report goes to the moderation team.", "Your identity may be disclosed to the reported user. Your report goes to the moderation team.")],
  ["wrong submitted category", reportSheet.replace("category: categoryOption.backedCategory,", 'category: "other",')],
  ["overridden submitted category", reportSheet.replace("category: categoryOption.backedCategory,", 'category: categoryOption.backedCategory,\n                    ...{ category: "other" },')],
  ["composed rendered routing claim", reportSheet.replace('while they are reviewed.";', 'while they are reviewed. " + ["Review", "path: normal"].join(" ");')],
  ["disabled keyboard avoidance", reportSheet.replace("style={styles.keyboardAvoider}", "style={styles.keyboardAvoider}\n        enabled={false}")],
  ["noninteractive sheet", reportSheet.replace("style={styles.overlay}", 'style={styles.overlay} pointerEvents="none"')],
  ["overridden safe-area padding", reportSheet.replace("              ]}\n              keyboardShouldPersistTaps", "                { paddingBottom: 0 },\n              ]}\n              keyboardShouldPersistTaps")],
  ["stale reset effect", reportSheet.replace("  }, [visible]);", "  }, []);")],
  ["conflicting state effect", reportSheet.replace("  const closeAndReset = () => {", "  const writeNote = setNote;\n  const closeAndReset = () => {").replace("style={styles.overlay}", 'style={styles.overlay} onLayout={() => writeNote("stale")}')],
  ["unreachable modal contents", reportSheet.replace("  const router = useRouter();", "  const showSheet = false;\n  const router = useRouter();").replace("      <KeyboardAvoidingView", "      {showSheet && <KeyboardAvoidingView").replace("      </KeyboardAvoidingView>", "      </KeyboardAvoidingView>}")],
  ["early runtime stop", reportSheet.replace("const router = useRouter();", 'const router = (() => { throw new Error("stop"); })();')],
  ["permanently disabled submit", reportSheet.replace("style={[styles.primaryButton, busy && styles.buttonDisabled]}\n                activeOpacity={0.86}\n                disabled={busy}", "style={[styles.primaryButton, busy && styles.buttonDisabled]}\n                activeOpacity={0.86}\n                disabled={true}")],
  ["unbound touch target style", reportSheet.replace("  primaryButton: {", "  primaryButton: {\n    width: 1,")],
  ["false modal accessibility", reportSheet.replace("accessibilityViewIsModal", "accessibilityViewIsModal={false}")],
  ["missing landscape safe area", reportSheet.replace("paddingLeft: Math.max(insets.left, 18),", "paddingLeft: 18,")],
  ["busy dismissal data loss", reportSheet.replace("    if (busy) return;\n", "")],
];
for (const [name, mutant] of reportSheetMutants) {
  if (mutant === reportSheet)
    fail(`mutation setup did not alter report sheet: ${name}`);
  if (validateReportSheetSource(mutant, { enforceReleaseHash: false }).length === 0)
    fail(`report sheet mutant escaped: ${name}`);
}

[
  "SAFETY_REPORT_TARGET_TYPES",
  "SAFETY_REPORT_CATEGORIES",
  "This report target is not supported.",
  "Choose a supported report category.",
  "dedupe_safety_report",
].forEach((needle) => {
  if (!moderationLib.includes(needle))
    fail(`missing report intake marker: ${needle}`);
});

[
  "enforce_safety_reports_duplicate_guard",
  "safety_report_duplicate_window",
  'before insert on public."safety_reports"',
].forEach((needle) => {
  if (!duplicateMigration.includes(needle))
    fail(`missing duplicate backend guard marker: ${needle}`);
});

if (
  /reported users are notified merely because a report was filed/i.test(
    `${workflowDoc}\n${moderationDoc}`,
  )
) {
  fail("docs must not notify reported users merely because a report was filed");
}
if (
  /auto-?delete reported content|automatically delete content|auto-?ban reported users/i.test(
    `${workflowDoc}\n${moderationDoc}`,
  )
) {
  fail("reports must not auto-delete content or auto-ban users");
}
if (
  /provider refund execution enabled|provider refunds enabled|payouts enabled|live_money_enabled\s*(?:is|=|:)\s*(?:on|enabled)/i.test(
    workflowDoc,
  )
) {
  fail("workflow must not enable provider refunds, payouts, or live money");
}
if (/support.+backend role|backend role.+support/i.test(workflowDoc)) {
  fail("support must not be introduced as a backend role");
}
if (!packageJson.includes('"proof:reporting-moderation-workflow"'))
  fail("missing proof package script");
if (!packageJson.includes('"guard:reporting-moderation-policy"'))
  fail("missing guard package script");

console.log("guard:reporting-moderation-policy passed");
