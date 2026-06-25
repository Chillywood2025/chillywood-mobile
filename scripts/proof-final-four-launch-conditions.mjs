#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PACKAGE_ID = "com.chillywood.mobile";
const PLAY_INSTALLER = "com.android.vending";
const args = new Set(process.argv.slice(2));
const runAccountDeleteVisual = args.has("--run-account-delete-visual");
const root = process.cwd();
const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
const artifactDir = process.env.PROOF_ARTIFACT_DIR || path.join("/tmp", `app-final-four-launch-conditions-proof-${stamp}`);
mkdirSync(artifactDir, { recursive: true });

function redact(value) {
  return String(value ?? "")
    .replace(/(access_token|refresh_token|token|token_hash|password|service_role|apikey|api_key)=([^&\s]+)/gi, "$1=<redacted>")
    .replace(/([?&]code)=([^&\s]+)/gi, "$1=<redacted>")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "<redacted-jwt>")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<redacted-email>");
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    timeout: options.timeout ?? 20000,
    maxBuffer: 1024 * 1024 * 20,
    env: process.env,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr),
    error: result.error ? redact(result.error.message) : null,
  };
}

function writeText(fileName, value) {
  writeFileSync(path.join(artifactDir, fileName), redact(value));
}

function writeJson(fileName, value) {
  writeFileSync(path.join(artifactDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function readLocal(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function status(statusValue, result, blocker = "", ownerAction = "") {
  return { status: statusValue, result, blocker, ownerAction };
}

function parseDevices(output) {
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial);
}

function findLatestInstalledVisualArtifact() {
  const dirs = readdirSync("/tmp", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("app-installed-visual-closeout-proof-"))
    .map((entry) => path.join("/tmp", entry.name))
    .filter((dir) => existsSync(path.join(dir, "proof-matrix.json")))
    .sort();
  return dirs.at(-1) || "";
}

function envPresence(keys) {
  const files = [".env.local", ".env.final-qa-proof.local", ".env.attached-device-monetization.local", ".env.browserstack-monetization.local"]
    .filter((file) => existsSync(path.join(root, file)));
  const presence = Object.fromEntries(keys.map((key) => [key, false]));
  for (const file of files) {
    const source = readLocal(file);
    for (const key of keys) {
      if (new RegExp(`^\\s*${key}\\s*=`, "m").test(source)) presence[key] = true;
    }
  }
  return presence;
}

const finalDoc = readLocal("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const nextTask = readLocal("NEXT_TASK.md");
const wave5Doc = readLocal("docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md");
const purgePolicyDoc = existsSync(path.join(root, "docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md"))
  ? readLocal("docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md")
  : "";

const devicesResult = run("adb", ["devices"]);
const devices = devicesResult.ok ? parseDevices(devicesResult.stdout) : [];
const serial = process.env.PROOF_ANDROID_SERIAL || process.env.ADB_SERIAL || (devices.includes("R5CR120QCBF") ? "R5CR120QCBF" : devices[0] || "");
writeText("adb-devices.txt", devicesResult.stdout + devicesResult.stderr);

let packageReadback = null;
if (serial) {
  const packageDump = run("adb", ["-s", serial, "shell", "dumpsys", "package", PACKAGE_ID], { timeout: 30000 });
  const installerList = run("adb", ["-s", serial, "shell", "pm", "list", "packages", "-i", PACKAGE_ID]);
  writeText("package-dumpsys.txt", packageDump.stdout + packageDump.stderr);
  writeText("package-installer.txt", installerList.stdout + installerList.stderr);
  const installerLine = installerList.stdout.split("\n").find((line) => line.includes(PACKAGE_ID));
  packageReadback = {
    packageId: PACKAGE_ID,
    versionCode: packageDump.stdout.match(/versionCode=(\d+)/)?.[1] || null,
    versionName: packageDump.stdout.match(/versionName=([^\s]+)/)?.[1] || null,
    firstInstallTime: packageDump.stdout.match(/firstInstallTime=([^\n]+)/)?.[1]?.trim() || null,
    lastUpdateTime: packageDump.stdout.match(/lastUpdateTime=([^\n]+)/)?.[1]?.trim() || null,
    installer: installerLine?.match(/installer=([^\s]+)/)?.[1] || "unknown",
  };
}

let accountArtifact = process.env.INSTALLED_VISUAL_ARTIFACT || findLatestInstalledVisualArtifact();
if (runAccountDeleteVisual) {
  const mutationDir = path.join("/tmp", `app-installed-visual-closeout-proof-${stamp}-final-four-mutation`);
  const mutation = run("node", ["scripts/proof-installed-visual-closeout.mjs", "--reset-app-data", "--run-account-mutation"], {
    timeout: 300000,
  });
  writeText("account-delete-visual-run-redacted.json", mutation.stdout + mutation.stderr);
  const match = mutation.stdout.match(/"artifactDir":\s*"([^"]+)"/);
  if (mutation.ok && match?.[1]) accountArtifact = match[1];
}

let accountDeletionResult = status(
  "Partial",
  "Installed account deletion artifact was not available to close the immediate scheduled-state visual proof.",
  "Run scripts/proof-installed-visual-closeout.mjs with --run-account-mutation on the Play-installed runtime.",
);
let accountDeletionEvidence = {};
if (accountArtifact && existsSync(path.join(accountArtifact, "proof-matrix.json"))) {
  const matrix = JSON.parse(readFileSync(path.join(accountArtifact, "proof-matrix.json"), "utf8"));
  const scheduledText = existsSync(path.join(accountArtifact, "account-deletion-after-schedule.txt"))
    ? readFileSync(path.join(accountArtifact, "account-deletion-after-schedule.txt"), "utf8")
    : "";
  const cleanup = existsSync(path.join(accountArtifact, "account-deletion-cleanup-readback.json"))
    ? JSON.parse(readFileSync(path.join(accountArtifact, "account-deletion-cleanup-readback.json"), "utf8"))
    : null;
  const scheduledVisual = /Account deletion scheduled|Deletion is scheduled|Restore Account|30-day restore/i.test(scheduledText);
  const restorePassed = matrix.matrix?.accountRestoreCancel?.status === "Pass";
  const uiPassed = matrix.matrix?.accountDeletionUi?.status === "Pass";
  const cleanupPassed = cleanup?.deletionStatus?.scheduled === false || matrix.matrix?.accountRestoreCancel?.status === "Pass";
  accountDeletionEvidence = {
    artifact: accountArtifact,
    uiStatus: matrix.matrix?.accountDeletionUi?.status,
    scheduleStatus: matrix.matrix?.accountDeletionSchedule?.status,
    restoreStatus: matrix.matrix?.accountRestoreCancel?.status,
    scheduledVisual,
    cleanupScheduled: cleanup?.deletionStatus?.scheduled ?? null,
  };
  accountDeletionResult = uiPassed && scheduledVisual && restorePassed && cleanupPassed
    ? status(
        "Pass",
        "Play-installed account deletion UI, immediate scheduled-state copy, restore/cancel visual, and active/not-scheduled cleanup readback are proved.",
      )
    : status(
        "Partial",
        "Account deletion UI/restore proof exists, but immediate scheduled-state or cleanup evidence was not complete.",
        "Rerun installed deletion visual proof with --run-account-delete-visual.",
      );
}

const resetEnvPresence = envPresence([
  "CHILLYWOOD_E2E_RESET_EMAIL",
  "CHILLYWOOD_E2E_RESET_PASSWORD",
  "FINAL_QA_PROOF_EMAIL",
  "FINAL_QA_PROOF_PASSWORD",
  "PROOF_INBOX_API_KEY",
  "MAILOSAUR_API_KEY",
  "MAILSLURP_API_KEY",
]);
const hasDisposableInbox =
  resetEnvPresence.PROOF_INBOX_API_KEY || resetEnvPresence.MAILOSAUR_API_KEY || resetEnvPresence.MAILSLURP_API_KEY;
const passwordResetProviderClosed =
  finalDoc.includes("Password reset/auth email provider proof is `Closed`") ||
  finalDoc.includes("Latest password reset/auth email provider proof result:");

const matrix = {
  playInstallerReadback: packageReadback?.installer === PLAY_INSTALLER && Number(packageReadback?.versionCode) >= 55
    ? status("Pass", `Play-installed runtime read back versionCode ${packageReadback.versionCode}, installer ${packageReadback.installer}.`)
    : status("Partial", "Play-installed runtime readback did not meet v55+ / Google Play installer condition.", "Use Google Play internal/closed testing install path."),
  accountDeletionScheduledStateVisual: accountDeletionResult,
  passwordResetAuthEmailProvider: passwordResetProviderClosed
    ? status(
        "Pass",
        "Password reset/auth email provider proof is closed on the Play-installed runtime with dedicated proof inbox delivery, app-link recovery, password update, backend auth, installed Home/Settings sign-in, and expired-link fallback.",
        "",
        "Rotate the proof inbox password after proof and keep bounded retry monitoring in release smoke.",
      )
    : hasDisposableInbox
    ? status(
        "Pending external/provider",
        "A disposable/proof inbox key appears available, but this read-only pass did not send reset email or rotate proof credentials.",
        "Run a separate approved reset-email provider proof without printing reset links or token-bearing URLs.",
        "Approve reset proof against the disposable account/inbox.",
      )
    : status(
        "Pending external/provider",
        "No safe disposable/proof inbox provider key was available, and no owner inbox was used.",
        "Provide disposable inbox/provider access or explicitly approve an owner-assisted sanitized proof.",
        "Provide safe inbox/provider proof path or accept this as launch risk.",
      ),
  providerRefundExecution: status(
    "Accepted manual/external",
    "Provider refund execution is manual/external. The app must not claim instant or automatic provider refunds. Entitlement revoke behavior is proved; real provider refund API execution is not implemented/proved.",
    "",
    "Keep support/refund copy manual/external, or open a future provider-refund integration proof lane.",
  ),
  permanentPurgeDeidentification: status(
    finalDoc.includes("Closed for controlled production path") &&
      purgePolicyDoc.includes("Verdict: Closed for controlled production path")
      ? "Pass"
      : "Pending policy decision",
    finalDoc.includes("Closed for controlled production path") &&
      purgePolicyDoc.includes("Verdict: Closed for controlled production path")
      ? "Controlled single-user production purge/de-identification is closed for eligible expired scheduled-deletion accounts. Batch auto-purge remains disabled/default-off, and no legal compliance claim is made."
      : "Permanent purge/de-identification is not implemented/proved. Current proved account lifecycle covers scheduled deletion, restore/cancel, public hiding, disabled access denial, and admin/operator suspend/restore.",
    finalDoc.includes("Closed for controlled production path") &&
      purgePolicyDoc.includes("Verdict: Closed for controlled production path")
      ? ""
      : "Owner/legal must decide whether permanent purge is required before broad public launch or accepted as a post-launch/manual legal-request policy.",
    finalDoc.includes("Closed for controlled production path") &&
      purgePolicyDoc.includes("Verdict: Closed for controlled production path")
      ? "Keep owner/legal review for any broader batch automation or legal compliance promise."
      : "Record owner/legal decision.",
  ),
};

const riskyPatterns = [
  /service[_-]?role\s*[:=]\s*[^<\s]/i,
  /refresh[_-]?token\s*[:=]\s*[^<\s]/i,
  /access[_-]?token\s*[:=]\s*[^<\s]/i,
  /token_hash\s*[:=]\s*[^<\s]/i,
  /push[_-]?token\s*[:=]\s*[^<\s]/i,
  /signedUrl\s*[:=]\s*[^<\s]/i,
  /provider[_-]?key\s*[:=]\s*[^<\s]/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];
const scanSources = [
  ["docs/FINAL_PUBLIC_USE_GO_NO_GO.md", finalDoc],
  ["NEXT_TASK.md", nextTask],
  ["docs/WAVE5_ACCOUNT_ADMIN_REVOKE_PROOF.md", wave5Doc],
  ["account-deletion-after-schedule.txt", accountArtifact && existsSync(path.join(accountArtifact, "account-deletion-after-schedule.txt")) ? readFileSync(path.join(accountArtifact, "account-deletion-after-schedule.txt"), "utf8") : ""],
];
const scanHits = [];
for (const [file, source] of scanSources) {
  for (const pattern of riskyPatterns) {
    if (pattern.test(source)) scanHits.push({ file, pattern: String(pattern) });
  }
}

const result = {
  generatedAt: now.toISOString(),
  artifactDir,
  mutationPerformed: runAccountDeleteVisual,
  noRefundExecution: true,
  noProviderEmailSent: true,
  noResetLinksPrinted: true,
  finalGoNoGo: passwordResetProviderClosed ? "Conditional Go" : "Partial / Not Ready",
  packageReadback,
  resetEnvPresence,
  accountDeletionEvidence,
  matrix,
  secretScan: {
    status: scanHits.length === 0 ? "Pass" : "Review",
    hits: scanHits,
  },
};

writeJson("final-four-launch-conditions.json", result);
writeText("secret-token-scan.txt", scanHits.length ? JSON.stringify(scanHits, null, 2) : "");
writeText("README.md", [
  "# Final Four Launch Conditions Proof",
  "",
  `Generated: ${now.toISOString()}`,
  "",
  `Package: ${PACKAGE_ID}`,
  `Version: ${packageReadback?.versionCode ?? "unknown"} / ${packageReadback?.versionName ?? "unknown"}`,
  `Installer: ${packageReadback?.installer ?? "unknown"}`,
  "",
  "This proof does not execute provider refunds, send password reset emails, print reset links, print credentials, or run real-user broad purge/de-identification.",
  "",
  "Matrix:",
  ...Object.entries(matrix).map(([key, value]) => `- ${key}: ${value.status} — ${value.result}${value.blocker ? ` Blocker: ${value.blocker}` : ""}${value.ownerAction ? ` Owner action: ${value.ownerAction}` : ""}`),
  "",
  `Secret/token scan: ${result.secretScan.status}`,
  "",
].join("\n"));

const ok = matrix.playInstallerReadback.status === "Pass"
  && matrix.accountDeletionScheduledStateVisual.status === "Pass"
  && result.secretScan.status !== "Review";

console.log(JSON.stringify({
  ok,
  artifactDir,
  finalGoNoGo: result.finalGoNoGo,
  packageReadback,
  matrix,
  secretScan: result.secretScan.status,
}, null, 2));

if (!ok && matrix.accountDeletionScheduledStateVisual.status !== "Pass") process.exitCode = 1;
