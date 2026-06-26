#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

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

const forbidMatch = (label, content, pattern, description) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden ${description}`);
};

const doc = read("docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md");
const roleTerminology = read("docs/admin/ROLE_TERMINOLOGY_LOCK.md");
const hierarchyDoc = read("docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md");
const adminDoc = read("docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const emergencyDoc = read("docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md");
const auditDoc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const publicDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const packageJson = read("package.json");

[
  "Support is not a backend role",
  "Support-workflow access is exact-scope permission work",
  "Shared staff accounts are forbidden",
  "Proof/test accounts are separate from staff accounts",
  "Service accounts are not human staff accounts",
  "Staff actions must be attributable to one human account",
  "Staff access requires Owner/First Owner approval where backed",
  "Staff permissions are least-privilege",
  "Staff access should be temporary or reviewable by default",
  "Staff MFA is required where the identity/provider supports it",
  "Monthly staff access review is required",
  "Staff removal revokes app roles and scopes where backed",
  "Staff removal invalidates sessions where backed and documents manual/future full Auth logout if not backed",
  "Offboarding is audited",
  "Emergency staff removal is supported or documented as manual/future",
  "Provider dashboard offboarding is documented as manual checklist in this lane",
  "No provider dashboard access was changed",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("staff lifecycle governance doc", doc, needle));

[
  "Staff access lifecycle, onboarding, and offboarding governance",
].forEach((needle) => {
  requireText("Command Center doc", commandCenterDoc, needle);
  requireText("Emergency doc", emergencyDoc, needle);
  requireText("Audit doc", auditDoc, needle);
  requireText("Public switchboard doc", publicDoc, needle);
});

[
  "Support is a work area, not a separate role.",
  "Operator is an internal/backend alias for Admin.",
  "Moderator is separate from Admin/operator",
].forEach((needle) => requireText("role terminology doc", roleTerminology, needle));

[
  "Support is not a backend role.",
  "operator is the internal/backend alias for Admin",
  "Moderator is separate from Admin/operator",
].forEach((needle) => requireText("staff hierarchy doc", hierarchyDoc, needle));

[
  "proof:staff-access-lifecycle-onboarding-offboarding-governance",
  "guard:staff-access-lifecycle-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

forbidMatch("staff lifecycle governance doc", doc, /Support (?:is|as|becomes|became) (?:a|the) backend role/i, "Support backend role allowance");
forbidMatch("staff lifecycle governance doc", doc, /backend role [`"']support[`"']|role\s*=\s*['"]support['"]/i, "support role introduction");
forbidMatch("staff lifecycle governance doc", doc, /operator (?:is|was|has been) renamed/i, "operator rename");
forbidMatch("staff lifecycle governance doc", doc, /Moderator (?:and|\/) Admin (?:are|were|should be) merged|Moderator\/Admin merge/i, "Moderator/Admin merge");
forbidMatch("staff lifecycle governance doc", doc, /shared staff accounts? (?:are|is) allowed/i, "shared staff account allowance");
forbidMatch("staff lifecycle governance doc", doc, /proof\/test accounts? (?:are|is) (?:staff|human staff)/i, "proof account treated as staff");
forbidMatch("staff lifecycle governance doc", doc, /service accounts? (?:are|is) human staff/i, "service account treated as human");
forbidMatch("staff lifecycle governance doc", doc, /staff access (?:does not require|without) Owner\/First Owner approval/i, "staff access without owner approval");
forbidMatch("staff lifecycle governance doc", doc, /staff actions? (?:may|can|should) be anonymous|not attributable/i, "anonymous staff action allowance");
forbidMatch("staff lifecycle governance doc", doc, /monthly staff access review (?:is optional|not required)/i, "missing monthly review requirement");
forbidMatch("staff lifecycle governance doc", doc, /offboarding (?:is optional|does not require audit|is not audited)/i, "missing offboarding audit");
forbidMatch("staff lifecycle governance doc", doc, /(?<!No )provider dashboard access (?:was|has been|is) changed/i, "provider dashboard access changed claim");
forbidMatch("staff lifecycle governance doc", doc, /provider access lists? with private emails|private emails in provider access lists/i, "provider access list exposure");
forbidMatch("staff lifecycle governance doc", doc, /MFA\/recovery codes|recovery codes?[:=]|service-role key[:=]|api key[:=]|private key[:=]/i, "credential material exposure");

forbidMatch("runtime monetization defaults", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime monetization defaults", featureFlags, /paidContentCheckoutEnabled:\s*true/, "paid content checkout activation");
forbidMatch("runtime monetization defaults", featureFlags, /tipsEnabled:\s*true/, "tips activation");
forbidMatch("runtime monetization defaults", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");
forbidMatch("runtime monetization defaults", featureFlags, /cashoutEnabled:\s*true/, "cash-out activation");
forbidMatch("runtime monetization defaults", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime monetization defaults", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbidMatch("runtime monetization defaults", featureFlags, /liveMoneyEnabled:\s*true/, "live money activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

forbidMatch("staff lifecycle governance doc", doc, /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Premium annual live claim");
forbidMatch("staff lifecycle governance doc", doc, /Creator Channel Subscription (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Creator Channel Subscription live claim");
forbidMatch("staff lifecycle governance doc", doc, /creator-money (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "creator-money live claim");
forbidMatch("staff lifecycle governance doc", doc, /payouts? (?:are|is) (?:live|enabled|available now)/i, "payout live claim");
forbidMatch("staff lifecycle governance doc", doc, /Stripe Connect (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Stripe Connect live claim");
forbidMatch("staff lifecycle governance doc", doc, /merch checkout (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "merch checkout live claim");

if (failures.length) {
  console.error("Staff access lifecycle policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Staff access lifecycle policy guard passed.");
console.log("- support remains permission-scoped work, not a backend role.");
console.log("- staff onboarding/offboarding requires owner approval, least privilege, MFA where supported, monthly review, audit, and provider-dashboard manual checklist.");
console.log("- live money, creator-money, Premium public purchase, payouts, Stripe/merch, provider mutation, and provider dashboard access changes remain off/not performed.");
