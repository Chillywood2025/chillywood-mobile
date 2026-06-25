#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function requireText(rel, needle, message) {
  if (!read(rel).includes(needle)) failures.push(message);
}

const finalDoc = "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md";

requireText(finalDoc, "This is product/legal-readiness documentation alignment, not attorney legal advice", "legal advice boundary missing");
requireText(finalDoc, "Account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification", "account deletion scheduled/purge truth missing");
requireText(finalDoc, "Provider refunds remain manual/external", "manual/external provider refund boundary missing");
requireText(finalDoc, "Premium annual remains provider-blocked until Google Play base plan exists", "Premium annual provider-blocked truth missing");
requireText(finalDoc, "Creator-money remains OFF", "creator-money off truth missing");
requireText(finalDoc, "Appeals use support/escalation workflow in V1", "V1 appeal support/escalation truth missing");
requireText(finalDoc, "Reports do not auto-delete, auto-ban, or expose reporter identity", "report privacy/no-auto-action truth missing");
requireText(finalDoc, "No payouts, Stripe Connect, merch checkout, payable balances, or money movement are live", "payout/Stripe/merch off truth missing");

const publicFiles = [
  "public-site/legal-site/site/terms/index.html",
  "public-site/legal-site/site/privacy/index.html",
  "public-site/legal-site/site/support/index.html",
  "public-site/legal-site/site/account-deletion/index.html",
  "public-site/legal-site/site/copyright/index.html",
  "public-site/legal-site/site/copyright-report/index.html",
  "public-site/legal-site/site/premium-terms/index.html",
  "public-site/legal-site/site/live-rules/index.html",
  "public-site/legal-site/site/moderation-policy/index.html",
];
const publicBody = publicFiles.map(read).join("\n").toLowerCase();

const publicForbidden = [
  "schema truth",
  "provider proof",
  "proof account",
  "private dashboard",
  "placeholder",
  "todo",
  "mock",
  "service-role",
  "signed url",
  "raw storage path",
  "raw ip",
  "push token",
  "livekit token",
  "tax id",
  "bank detail",
  "plaintext passcode",
];

for (const needle of publicForbidden) {
  if (publicBody.includes(needle)) failures.push(`public legal pages expose forbidden wording: ${needle}`);
}

const allDocs = [
  finalDoc,
  "docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md",
  "docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md",
  "docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md",
  "docs/legal/LEGAL_LAUNCH_CHECKLIST.md",
  "docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md",
  "docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
].map(read).join("\n").toLowerCase();

const contradictionPatterns = [
  [/premium annual (is live|is enabled|available now|is available)/, "Premium annual appears live"],
  [/creator[- ]money (is live|is enabled|available now|is available)/, "creator-money appears live"],
  [/automatic refunds? (are|is) (available|enabled|issued|executed)/, "automatic refunds appear claimed"],
  [/reports? auto-(delete|ban|suspend)(?![^.\n]*not)/, "reports auto-action appears claimed"],
  [/full in-app appeal center is (available|enabled|live|implemented|complete|closed)/, "full in-app appeal center appears claimed"],
  [/support (is|was|becomes|created as|added as) (a )?backend role/, "support backend role appears claimed"],
];

for (const [pattern, message] of contradictionPatterns) {
  if (pattern.test(allDocs)) failures.push(message);
}

if (allDocs.includes("account deletion is immediate hard deletion")) failures.push("account deletion hard-delete overclaim appears");

if (failures.length) {
  console.error("Legal/privacy/Data Safety policy guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Legal/privacy/Data Safety policy guard passed.");
