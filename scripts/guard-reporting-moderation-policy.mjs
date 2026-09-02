import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Reporting moderation policy guard failed: ${message}`);
  process.exit(1);
};

const validateReportSheet = (source) => {
  const findings = [];
  const requireMarker = (marker, description) => {
    if (!source.includes(marker))
      findings.push(`missing ${description}: ${marker}`);
  };

  [
    ["REPORT_SHEET_CATEGORY_OPTIONS", "category options"],
    ["harassment_bullying", "harassment category"],
    ["hate_discrimination", "hate category"],
    ["threats_violence", "threat category"],
    ["sexual_exploitation", "exploitation category"],
    ["self_harm_danger", "self-harm category"],
    ["minor_safety", "minor-safety category"],
    ["illegal_activity", "illegal-activity category"],
    ["spam_scam", "spam category"],
    ["privacy_doxxing", "privacy category"],
    ["copyright_dmca", "copyright category"],
    ["fraud_payment", "payment-concern category"],
    ["live_safety", "live-safety category"],
    ["Please report in good faith", "good-faith copy"],
    [
      "Your report goes to the moderation team",
      "customer-safe destination copy",
    ],
    [
      "Your identity stays private from the reported person by default",
      "reporter privacy copy",
    ],
    ["A report does not remove content automatically", "non-enforcement copy"],
    ["KeyboardAvoidingView", "keyboard-aware container"],
    [
      'behavior={Platform.OS === "ios" ? "padding" : "height"}',
      "cross-platform keyboard behavior",
    ],
    ["style={styles.sheetScroller}", "bounded vertical scroller"],
    ['keyboardShouldPersistTaps="handled"', "keyboard-safe actions"],
    ['maxHeight: "92%"', "small-screen sheet bound"],
    ["useSafeAreaInsets", "safe-area binding"],
    ["Math.max(insets.bottom, 16)", "bottom inset padding"],
    ["if (!visible)", "dismissed-state reset"],
    ['setCategoryKey("harassment_bullying")', "category reset"],
    ['setNote("")', "note reset"],
    ["accessibilityViewIsModal", "modal accessibility boundary"],
    ['accessibilityRole="radio"', "category radio semantics"],
    [
      "accessibilityState={{ selected: categoryKey === entry.key }}",
      "selected category state",
    ],
    [
      'accessibilityLabel="Optional report details"',
      "note accessibility label",
    ],
    [
      "accessibilityState={{ disabled: busy, busy }}",
      "submit accessibility state",
    ],
    ["Selected report category:", "backed category note"],
  ].forEach(([marker, description]) => requireMarker(marker, description));

  if ((source.match(/accessibilityRole="button"/g) ?? []).length < 3) {
    findings.push("report actions need explicit button semantics");
  }
  if (
    !/onRequestClose=\{closeAndReset\}/.test(source) ||
    !/onPress=\{closeAndReset\}/.test(source)
  ) {
    findings.push("all dismiss paths must clear prior report state");
  }
  if (
    /scoped moderation queue|Review path:|\. Queue:|\bqueue\s*:/i.test(source)
  ) {
    findings.push(
      "client-invented moderation routing must not be user-visible or submitted as evidence",
    );
  }
  if (/categoryOption\.queue/.test(source)) {
    findings.push(
      "client category state must not masquerade as authoritative queue routing",
    );
  }
  if (
    /raw storage paths|signed URLs|raw IPs|tokens|provider secrets|tax IDs|bank details|private provider IDs/.test(
      source,
    )
  ) {
    findings.push(
      "user-facing report sheet must not mention private implementation details",
    );
  }

  return findings;
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

const reportSheetFindings = validateReportSheet(reportSheet);
if (reportSheetFindings.length) fail(reportSheetFindings.join("; "));

const reportSheetMutants = [
  [
    "routing jargon",
    `${reportSheet}\nconst leakedRouting = "Review path: normal";`,
  ],
  [
    "submitted queue claim",
    `${reportSheet}\nconst leakedQueue = ". Queue: urgent";`,
  ],
  [
    "keyboard container",
    reportSheet.replaceAll("KeyboardAvoidingView", "View"),
  ],
  [
    "small-screen bound",
    reportSheet.replace('maxHeight: "92%"', 'maxHeight: "920%"'),
  ],
  [
    "safe-area padding",
    reportSheet.replace("Math.max(insets.bottom, 16)", "16"),
  ],
  [
    "state reset polarity",
    reportSheet.replace("if (!visible)", "if (visible)"),
  ],
  [
    "category semantics",
    reportSheet.replace(
      'accessibilityRole="radio"',
      'accessibilityRole="button"',
    ),
  ],
  [
    "submit semantics",
    reportSheet.replaceAll(
      'accessibilityRole="button"',
      'accessibilityRole="none"',
    ),
  ],
];
for (const [name, mutant] of reportSheetMutants) {
  if (mutant === reportSheet)
    fail(`mutation setup did not alter report sheet: ${name}`);
  if (validateReportSheet(mutant).length === 0)
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
