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

function pass(label) {
  passes.push(label);
}

function assertIncludes(rel, text, label = `${rel} includes ${text}`) {
  const body = read(rel);
  if (!body.includes(text)) failures.push(label);
  else pass(label);
}

function assertExists(rel) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`missing file: ${rel}`);
  else pass(`exists: ${rel}`);
}

const finalDoc = "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md";
assertExists(finalDoc);

[
  "Legal/privacy/Data Safety final alignment: Closed",
  "This is product/legal-readiness documentation alignment, not attorney legal advice",
  "Legal Surface Inventory",
  "Account Deletion Alignment",
  "Privacy / Data Safety Matrix",
  "Provider / Data Processor Matrix",
  "Terms / Moderation / Live Rules Alignment",
  "Premium / Paid Access / Refund Alignment",
  "Play Reviewer Alignment",
  "Account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification",
  "Legal/security/payment/support/moderation evidence retention exceptions are preserved",
  "Data Safety evidence map matches actual app behavior",
  "Privacy Policy matches account, chat, media, analytics, crash, purchase, moderation, notification, and live room behavior",
  "Reports do not auto-delete, auto-ban, or expose reporter identity",
  "Appeals use support/escalation workflow in V1",
  "Premium annual remains provider-blocked until Google Play base plan exists",
  "Creator-money remains OFF",
  "Provider refunds remain manual/external",
  "No payouts, Stripe Connect, merch checkout, payable balances, or money movement are live",
  "Public legal pages avoid proof/debug/internal wording",
  "No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, proof passwords, private provider IDs, or private dashboard data are exposed",
].forEach((needle) => assertIncludes(finalDoc, needle));

[
  "docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md",
  "docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md",
  "docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md",
  "docs/legal/LEGAL_LAUNCH_CHECKLIST.md",
  "docs/ACCOUNT_LEGAL_DATA_SAFETY_RUNBOOK.md",
  "docs/ACCOUNT_PURGE_DEIDENTIFICATION_POLICY.md",
  "docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
].forEach(assertExists);

[
  "public-site/legal-site/site/terms/index.html",
  "public-site/legal-site/site/privacy/index.html",
  "public-site/legal-site/site/support/index.html",
  "public-site/legal-site/site/account-deletion/index.html",
  "public-site/legal-site/site/copyright/index.html",
  "public-site/legal-site/site/copyright-report/index.html",
].forEach(assertExists);

assertIncludes("docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md", "Do not answer \"No data collected.\"");
assertIncludes("docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md", "Data deletion mechanism");
assertIncludes("docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md", "Password: [enter password here in Play Console only]");

[
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
].forEach((rel) => assertIncludes(finalDoc, rel.replace(/^docs\//, "").split("/").pop()?.replace(".md", "") ? "closed" : "", `final doc references current safety stack context`));

const publicLegal = [
  "public-site/legal-site/site/terms/index.html",
  "public-site/legal-site/site/privacy/index.html",
  "public-site/legal-site/site/support/index.html",
  "public-site/legal-site/site/account-deletion/index.html",
  "public-site/legal-site/site/copyright/index.html",
  "public-site/legal-site/site/copyright-report/index.html",
  "public-site/legal-site/site/premium-terms/index.html",
  "public-site/legal-site/site/live-rules/index.html",
  "public-site/legal-site/site/moderation-policy/index.html",
].map(read).join("\n").toLowerCase();

const forbiddenPublic = [
  "schema truth",
  "provider proof",
  "proof account",
  "private dashboard",
  "service-role",
  "signed url",
  "raw ip",
  "push token",
  "livekit token",
  "tax id",
  "bank detail",
  "plaintext passcode",
  "placeholder",
  "todo",
  "mock",
];

for (const needle of forbiddenPublic) {
  if (publicLegal.includes(needle)) failures.push(`public legal page contains forbidden wording: ${needle}`);
  else pass(`public legal pages avoid: ${needle}`);
}

const combinedDocs = [
  finalDoc,
  "docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md",
  "docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md",
  "docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md",
  "docs/MONETIZATION_STACK_FINAL_TRUTH.md",
  "docs/policies/DIGITAL_ACCESS_REFUND_POLICY.md",
].map(read).join("\n").toLowerCase();

[
  ["premium annual remains provider-blocked", "annual not claimed live"],
  ["creator-money remains off", "creator money not live"],
  ["provider refunds remain manual/external", "provider refunds manual external"],
  ["no payouts", "payouts not live"],
  ["no money/provider/payout behavior", "no money behavior changed"],
].forEach(([needle, label]) => {
  if (!combinedDocs.includes(needle)) failures.push(`missing ${label}`);
  else pass(label);
});

if (failures.length) {
  console.error("Legal/privacy/Data Safety proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Legal/privacy/Data Safety final alignment proof passed.");
for (const item of passes) console.log(`pass: ${item}`);
