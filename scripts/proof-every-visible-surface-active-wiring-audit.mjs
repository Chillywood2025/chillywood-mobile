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

const doc = read("docs/release/EVERY_VISIBLE_SURFACE_ACTIVE_WIRING_AUDIT.md");
const publicSwitchboard = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const commandCenter = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const moneyGovernance = read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md");
const playInternal = read("docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md");
const finalPacket = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const checklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const roadmap = read("ROADMAP.md");
const packageJson = read("package.json");

[
  "Every visible surface active wiring audit: Closed / Partial / Blocked",
  "Every visible surface active wiring audit: Closed",
  "Visible Surface Matrix",
  "Role Traversal Summary",
  "Owner/Admin Dead Button Summary",
  "Monetization / Test Flow Wiring Summary",
  "No visible clickable dead buttons are allowed",
  "Nothing visible should be hidden or disabled",
  "Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow",
  "Permission scopes must unlock backed behavior",
  "Tester-visible monetization UX is separate from live money settlement",
  "Premium monthly tester flow is reachable where Play internal/licensed tester/provider setup supports it",
  "Premium annual opens an active provider-blocked status/resolution flow",
  "Creator Channel Subscription opens an active provider-blocked status/resolution flow",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened",
  "Owner/Admin/Moderator seeded authority proof remains the required verification for role boundaries",
].forEach((needle) => requireText("visible surface audit doc", doc, needle));

[
  "docs/release/EVERY_VISIBLE_SURFACE_ACTIVE_WIRING_AUDIT.md",
  "active monthly tester/status flow",
  "Visible controls open readiness/status flow",
].forEach((needle) => requireText("public switchboard", publicSwitchboard, needle));

[
  "Every visible surface active wiring audit: Closed",
  "No visible clickable dead buttons are allowed",
  "Nothing visible should be hidden or disabled",
  "Permission scopes must unlock backed behavior",
  "Tester-visible monetization UX is separate from live money settlement",
  "Premium annual opens an active provider-blocked status/resolution flow",
  "Creator Channel Subscription opens an active provider-blocked status/resolution flow",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened",
].forEach((needle) => {
  requireText("Owner/Admin Command Center doc", commandCenter, needle);
  requireText("money governance doc", moneyGovernance, needle);
  requireText("Play internal tester doc", playInternal, needle);
  requireText("final release packet", finalPacket, needle);
  requireText("go/no-go", goNoGo, needle);
  requireText("final readiness checklist", checklist, needle);
  requireText("current state", currentState, needle);
  requireText("next task", nextTask, needle);
  requireText("roadmap", roadmap, needle);
});

[
  "proof:owner-admin-moderator-production-authority-seeded-device",
  "guard:owner-admin-moderator-production-authority-policy",
  "proof:owner-rpc-staff-grant-path",
  "proof:public-non-money-feature-enablements",
  "guard:public-non-money-feature-policy",
  "proof:money-admin-authority-activation-governance",
  "guard:money-admin-authority-policy",
  "proof:final-store-release-readiness-play-submission-packet",
  "guard:final-store-release-readiness-policy",
  "proof:play-internal-test-aab-upload-tester-smoke",
  "guard:play-internal-test-aab-policy",
  "proof:every-visible-surface-active-wiring-audit",
  "guard:every-visible-surface-active-wiring-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Visible-surface audit doc exists with matrix, role traversal, Owner/Admin/Moderator status, monetization/test-flow wiring, provider-blocked active-resolution paths, and fixed-control summary.");
notes.push("Current state, release, public switchboard, money governance, Command Center, Go/No-Go, checklist, roadmap, and next-task docs reference the active-surface lane.");
notes.push("Existing Owner/Admin/Moderator, owner RPC staff grant, public non-money, money governance, final release, and Play internal proof/guard scripts remain wired.");

if (failures.length) {
  console.error("Every visible surface active wiring audit proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Every visible surface active wiring audit proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
