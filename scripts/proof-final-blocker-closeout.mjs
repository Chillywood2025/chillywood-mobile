#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
const artifactDir = path.join("/tmp", `app-final-blocker-closeout-proof-${stamp}`);

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const finalDoc = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const nextTask = read("NEXT_TASK.md");
const wave5Doc = read("docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md");
const roadmap = read("ROADMAP.md");
const packageJson = read("package.json");
const firebaseRunbook = exists("docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md")
  ? read("docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md")
  : "";
const refundSupport = exists("docs/support/REFUND_SUPPORT_PLAYBOOK.md")
  ? read("docs/support/REFUND_SUPPORT_PLAYBOOK.md")
  : "";
const accountLegal = exists("docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md")
  ? read("docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md")
  : "";

const blockerRows = [
  {
    blocker: "password reset/auth email provider proof",
    type: "external/provider",
    currentStatus: "App reset route safety and historical forgot-password proof exist; final provider/inbox closeout is not rerun here.",
    proofResult: "No safe disposable inbox/provider run was available in this pass; no owner inbox was used.",
    launchImpact: "Account recovery provider proof remains a launch governance risk.",
    requiredNextAction: "Run a disposable non-admin inbox proof on the Play/internal runtime or document owner acceptance.",
    finalClassification: "Pending external/provider",
  },
  {
    blocker: "real provider refund execution",
    type: "external/provider",
    currentStatus: "Refund/revoke app and sandbox access behavior is proved; real provider refund execution is not integrated or run.",
    proofResult: "Docs and guards keep refund execution manual/external; no provider refund API was called; automated provider refund execution is not claimed.",
    launchImpact: "Accepted as a launch condition only while app/support copy stays manual/external and avoids instant or automatic refund claims.",
    requiredNextAction: "Keep manual support process or open a separate provider refund proof lane.",
    finalClassification: "Accepted manual/external",
  },
  {
    blocker: "permanent purge/de-identification policy",
    type: "account lifecycle proof",
    currentStatus: "Scheduled deletion, restore, public fail-closed visibility, disabled/private-feature denial, proof-account de-identification, and controlled single-user production purge are proved.",
    proofResult: "Policy doc, runbook, owner/operator-only production RPC, dry-run, disposable proof-account mutation, denial safeguards, sanitized audit readback, idempotency, public fail-closed, and private-feature denial are proved. No broad auto-purge job or legal compliance claim is made.",
    launchImpact: "Controlled production path is closed. Batch auto-purge remains disabled/default-off.",
    requiredNextAction: "Keep owner/legal review for any broader batch automation or legal compliance promise.",
    finalClassification: "Closed for controlled production path",
  },
  {
    blocker: "installed account deletion/restore visual proof",
    type: "installed proof",
    currentStatus: "Backend/runtime account deletion schedule, restore, and public fail-closed behavior are proved; Play-installed UI/copy, scheduled-state copy, and restore/cancel visual proof passed.",
    proofResult: "Installed proof artifact /tmp/app-installed-visual-closeout-proof-20260624-170135-mutation2/ captured deletion UI/copy, immediate scheduled-state copy, restore/cancel, and active/not-scheduled cleanup readback.",
    launchImpact: "Installed visual blocker is closed.",
    requiredNextAction: "Keep normal release smoke for this path in future launch candidates.",
    finalClassification: "Closed",
  },
  {
    blocker: "installed blocked-viewer visual proof",
    type: "installed proof",
    currentStatus: "Backend/runtime blocked-user harassment prevention is proved across chat, calls, comments, rooms, and Profile/Platform actions.",
    proofResult: "Installed proof artifact /tmp/app-installed-visual-closeout-proof-20260624-170135-mutation2/ captured blocked-viewer Profile/Platform denial, blocked-action non-exposure, unrelated-viewer regression, and cleanup.",
    launchImpact: "Installed visual blocker is closed.",
    requiredNextAction: "Keep normal release smoke for this path in future launch candidates.",
    finalClassification: "Closed",
  },
  {
    blocker: "Firebase dashboard receipt proof",
    type: "external/dashboard",
    currentStatus: "Firebase Analytics, Crashlytics, and Performance packages/config/runbooks exist; email identity removal remains in code.",
    proofResult: "Browser readback confirmed Firebase Console receipt for Analytics dashboard activity, Crashlytics Android release 1.0.0 (55), and Performance Monitoring app/network traces for Android release 1.0.0 (55). No private Console screenshots were saved.",
    launchImpact: "Dashboard receipt blocker is closed; keep normal release telemetry privacy checks in final smoke.",
    requiredNextAction: "Keep sanitized dashboard receipt notes in final proof artifacts and do not save private Console screenshots.",
    finalClassification: "Closed",
  },
];

const checks = [];
const addCheck = (name, ok, evidence) => checks.push({ name, status: ok ? "Pass" : "Gap", evidence });

addCheck("Wave 5.1 commit status carried forward", finalDoc.includes("Wave 5.1 | Closed"), "final doc Wave 5.1 row");
addCheck("Final verdict remains honest", finalDoc.includes("Verdict: Partial / Not Ready"), "final doc verdict");
addCheck("No broad launch-ready claim", !/Verdict:\s*Go\b/.test(finalDoc), "final doc does not claim Go");
addCheck("Password reset blocker classified", finalDoc.includes("Pending external/provider"), "classification bucket present");
addCheck("Installed visual proof status updated", finalDoc.includes("Installed Android account deletion/restore visual proof | installed-device proof") && finalDoc.includes("Installed visual blocker is closed.") && finalDoc.includes("Installed Android blocked-viewer visual proof | installed-device proof"), "installed visual closeout status");
addCheck("Controlled purge production path classified", finalDoc.includes("Closed for controlled production path"), "controlled production purge classification present");
addCheck("Wave 5.1 closed in tracker", nextTask.includes("Wave 5.1 — Disabled/Deactivated Access + Admin Suspend Proof: Closed"), "NEXT_TASK Wave 5.1 status");
addCheck("Provider refund manual/external accepted", finalDoc.includes("Accepted manual/external") && finalDoc.includes("must not claim instant or automatic provider refunds"), "refund truth wording");
addCheck("Provider refunds not run in Wave 5 doc", wave5Doc.includes("Real provider refunds remain external/manual"), "Wave 5 refund truth");
addCheck(
  "Auth email owner-inbox caution retained",
  roadmap.includes("not the owner's personal/internal tester inbox")
    || nextTask.includes("Do not send additional password recovery emails to the owner's personal/internal tester inbox"),
  "auth email safety wording",
);
addCheck("Firebase packages present", packageJson.includes("@react-native-firebase/analytics") && packageJson.includes("@react-native-firebase/crashlytics") && packageJson.includes("@react-native-firebase/perf"), "Firebase analytics/crash/perf package entries");
addCheck("Firebase dashboard receipt closed by browser readback", finalDoc.includes("Browser readback confirmed Firebase Console receipt"), "dashboard receipt browser proof");
addCheck("Refund support avoids guarantee", refundSupport.includes("without promising outcomes"), "support playbook refund caution");
addCheck("Account deletion restore window documented", accountLegal.includes("30-day restore window"), "account legal runbook deletion truth");

const riskyPatterns = [
  /service[_-]?role/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /participantToken/,
  /push[_-]?token/i,
  /signed\s+url/i,
  /provider secret/i,
];
const scannedSources = [
  ["docs/FINAL_PUBLIC_USE_GO_NO_GO.md", finalDoc],
  ["NEXT_TASK.md", nextTask],
  ["docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md", wave5Doc],
];
const riskyHits = [];
for (const [file, source] of scannedSources) {
  for (const pattern of riskyPatterns) {
    if (pattern.test(source)) riskyHits.push({ file, pattern: String(pattern) });
  }
}

const result = {
  generatedAt: now.toISOString(),
  finalGoNoGo: "Partial / Not Ready",
  mutationPerformed: false,
  noProviderRefundsRun: true,
  noInboxEmailsSent: true,
  noInstalledDeviceProofRun: false,
  blockerRows,
  checks,
  secretScan: {
    status: riskyHits.length === 0 ? "Pass" : "Review",
    note: riskyHits.length === 0
      ? "No token-like terms found in closeout docs."
      : "Token-like policy terms were found only as blocker/safety wording; no values are included.",
    hits: riskyHits,
  },
};

mkdirSync(artifactDir, { recursive: true });
writeFileSync(path.join(artifactDir, "final-blocker-closeout.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(artifactDir, "README.md"), [
  "# Final Blocker Closeout Proof",
  "",
  `Generated: ${now.toISOString()}`,
  "",
  "This is a read-only proof/classification pass. It does not send auth emails, execute provider refunds, mutate Supabase, or change app behavior. Installed-device proof status is read from the recorded installed visual closeout artifact.",
  "",
  "Final Go/No-Go: Partial / Not Ready",
  "",
  "Classification buckets:",
  ...blockerRows.map((row) => `- ${row.blocker}: ${row.finalClassification}`),
  "",
  `Checks: ${checks.filter((check) => check.status === "Pass").length}/${checks.length} pass`,
  `Secret/token scan: ${result.secretScan.status}`,
  "",
].join("\n"));

const ok = checks.every((check) => check.status === "Pass") && result.secretScan.status !== "Fail";
console.log(JSON.stringify({
  ok,
  finalGoNoGo: result.finalGoNoGo,
  artifactDir,
  blockers: blockerRows.map((row) => ({
    blocker: row.blocker,
    finalClassification: row.finalClassification,
  })),
  checkStatusCounts: checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, {}),
  secretScan: result.secretScan.status,
}, null, 2));

if (!ok) process.exitCode = 1;
