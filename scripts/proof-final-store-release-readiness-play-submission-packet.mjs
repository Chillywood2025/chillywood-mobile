#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const notes = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const releaseDoc = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const finalChecklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const dataSafety = read("docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md");
const playFields = read("docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md");
const reviewerPacket = read("docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md");
const contentRating = read("docs/PLAY_STORE_LISTING_CONTENT_RATING_RUNBOOK.md");
const androidRelease = read("docs/ANDROID_RELEASE_EAS_RUNBOOK.md");
const publicSwitchboard = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const provider = read("docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md");
const seeded = read("docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md");
const money = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const legal = read("docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md");
const monitoring = read("docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const roadmap = read("ROADMAP.md");
const appJsonText = read("app.json");
const easJsonText = read("eas.json");
const packageJson = read("package.json");

[
  "Final store/release readiness and Play submission packet alignment: Closed / Partial / Blocked",
  "This lane did not submit the app to production",
  "This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Premium monthly public purchase remains a separate owner-approved proof lane",
  "Premium annual remains Google Play base-plan provider-blocked",
  "Creator Channel Subscription remains Google Play base-plan provider-blocked",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "Data Safety evidence map matches actual app behavior",
  "Account deletion is documented and reachable",
  "Legal/support/DMCA/privacy/terms surfaces are documented",
  "UGC/reporting/moderation policy is documented",
  "App Access/reviewer packet is sanitized and does not commit credentials",
  "Provider dashboard private proof remains owner-confirmation-required",
  "Final Play Console acceptance remains owner/store external",
  "Final release build/smoke remains a release operation unless explicitly run in this lane",
].forEach((needle) => requireText("final release packet", releaseDoc, needle));

[
  "Final Store Release Audit Plan",
  "Final Play Submission Packet Matrix",
  "Known Blocker Classification",
  "Play Console Field Answer Summary",
  "App Access / Reviewer Packet Summary",
  "Data Safety / Legal / Account Deletion",
  "Content Rating / Target Audience / UGC",
  "Permissions / Listing / Release Notes",
  "Build / Smoke / Rollback / Monitoring",
  "Owner Action List",
  "Final Verdict",
  "Existing Proof References",
].forEach((needle) => requireText("final release packet sections", releaseDoc, needle));

[
  "| App package ID |",
  "| App name |",
  "| Version/versionCode |",
  "| Build profile |",
  "| Release track |",
  "| Reviewer credentials packet |",
  "| App Access |",
  "| Data Safety |",
  "| Account deletion |",
  "| Privacy Policy |",
  "| Terms |",
  "| Support |",
  "| DMCA/Copyright |",
  "| Refund/Digital Access |",
  "| Premium Terms |",
  "| Live Rules |",
  "| Community Guidelines |",
  "| Moderation Policy |",
  "| Creator Monetization |",
  "| Content Rating |",
  "| Target Audience |",
  "| UGC policy |",
  "| Permissions |",
  "| Screenshots/assets |",
  "| Store short description |",
  "| Store full description |",
  "| Release notes |",
  "| Internal testing |",
  "| Closed testing if needed |",
  "| Production submission |",
  "| Post-release monitoring |",
  "| Rollback plan |",
].forEach((needle) => requireText("Play submission packet matrix", releaseDoc, needle));

[
  "Premium annual | Store/provider blocker, Google Play base-plan issue",
  "Creator Channel Subscription | Store/provider blocker, Google Play base-plan issue",
  "Premium monthly public purchase | Separate owner-approved proof lane",
  "Creator-money/live-money/payouts/Stripe/merch/refund automation | Future monetization lanes, OFF",
  "Provider dashboard MFA/access proof | Owner-confirmation-required",
  "Attorney/legal review | Owner/legal external",
  "Final Play Console Data Safety/App Access/content rating acceptance | Owner/store external",
  "Final release build install/smoke | Release operation",
  "Owner RPC staff grant path | Separate Partial/follow-up",
].forEach((needle) => requireText("known blocker classification", releaseDoc, needle));

[
  "com.chillywood.mobile",
  "\"version\": \"1.0.0\"",
  "\"versionCode\": 55",
].forEach((needle) => requireText("app config", appJsonText, needle));

[
  "\"appVersionSource\": \"remote\"",
  "\"production\"",
  "\"buildType\": \"app-bundle\"",
  "\"releaseStatus\": \"draft\"",
].forEach((needle) => requireText("eas config", easJsonText, needle));

[
  ["final go/no-go", goNoGo],
  ["final production readiness checklist", finalChecklist],
  ["Data Safety evidence map", dataSafety],
  ["Play field answers", playFields],
  ["reviewer packet", reviewerPacket],
  ["content rating runbook", contentRating],
  ["Android release runbook", androidRelease],
  ["public switchboard", publicSwitchboard],
  ["provider dashboard governance", provider],
  ["seeded device proof", seeded],
  ["money governance", money],
  ["legal alignment", legal],
  ["monitoring alignment", monitoring],
  ["current state", currentState],
  ["next task", nextTask],
  ["roadmap", roadmap],
].forEach(([label, content]) => {
  requireText(label, content, "docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
});

[
  "docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md",
  "docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md",
  "docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md",
  "docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md",
  "docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md",
  "docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md",
  "docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md",
  "docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md",
  "docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md",
  "docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md",
  "docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md",
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md",
  "docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md",
  "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md",
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
].forEach((needle) => requireText("existing proof references", releaseDoc, needle));

[
  "proof:final-store-release-readiness-play-submission-packet",
  "guard:final-store-release-readiness-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Final release packet doc exists with Play matrix, blocker classification, App Access, Data Safety, account deletion, UGC, permissions, release build/smoke, rollback, monitoring, and owner action sections.");
notes.push("The packet records that production submission and provider mutations did not happen in this lane.");
notes.push("Existing owner/admin/moderator, provider, moderation, staff, emergency, audit, public, search, money, monitoring, legal, account, reporting, live, and chat proofs are referenced.");

if (failures.length) {
  console.error("Final store/release readiness Play submission packet proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Final store/release readiness Play submission packet proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
