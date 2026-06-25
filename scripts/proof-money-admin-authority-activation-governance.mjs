#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const failures = [];
const requireFile = (file) => {
  if (!exists(file)) failures.push(`missing ${file}`);
  return exists(file) ? read(file) : "";
};
const requireText = (source, text, label = text) => {
  if (!source.includes(text)) failures.push(`missing ${label}`);
};

const docPath = "docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md";
const doc = requireFile(docPath);

[
  "Money admin authority and activation governance: Closed / Partial / Blocked",
  "This lane does not activate money",
  "Money Authority Matrix",
  "First Owner / Owner controls activation authority",
  "Premium monthly activation requires separate owner-approved purchase proof lane",
  "Premium annual remains provider-blocked",
  "Creator-money remains OFF",
  "live_money_enabled remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "Manual refund support status can be recorded only with exact scope and audit",
  "Admin can view/manage only exact money-support scopes",
  "Moderator cannot activate money",
  "Provider transaction/customer/order data is masked/scoped",
  "Access grant revoke/removal requires exact scope, reason, target, and audit",
  "Dual approval is required for future payout activation",
  "Dual approval is required for future live_money_enabled",
  "Emergency money kill switch is First Owner/Owner-controlled and audited",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened",
  "Role / Scope Matrix",
  "Activation Governance Model",
  "Provider Visibility / Masking Model",
  "Manual Refund / Access Support Model",
  "Payout / Fraud / Risk Future Governance",
  "Emergency Money Kill Switch Model",
  "Audit / Dual Approval Model",
  "Admin Command Center / UI Status",
].forEach((text) => requireText(doc, text));

[
  "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md",
  "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
].forEach((file) => requireFile(file));

const packageJson = requireFile("package.json");
requireText(packageJson, "proof:money-admin-authority-activation-governance", "package proof script");
requireText(packageJson, "guard:money-admin-authority-policy", "package guard script");

const moneyFlags = requireFile("_lib/moneyFeatureFlags.ts");
requireText(moneyFlags, "live_money_enabled: \"off\"", "live money default off");
requireText(moneyFlags, "payouts_enabled: \"off\"", "payouts default off");

const supportingDocs = [
  "docs/admin/MONEY_PRODUCTION_APPROVAL_GATES.md",
  "docs/support/MONEY_SUPPORT_WORKFLOW.md",
  "docs/risk/FRAUD_RISK_RULES.md",
  "docs/PREMIUM_FIRST_ACTIVATION_PROOF.md",
  "docs/CREATOR_MONEY_ONE_TIME_PRODUCT_READBACK.md",
  "docs/FINAL_PUBLIC_USE_GO_NO_GO.md",
  "docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md",
].filter(exists).map((file) => read(file).toLowerCase()).join("\n");

[
  "provider refunds remain manual/external",
  "creator-money remains off",
  "live_money_enabled",
  "payouts",
  "provider-blocked",
].forEach((text) => {
  if (!supportingDocs.includes(text.toLowerCase())) failures.push(`supporting docs missing ${text}`);
});

if (failures.length) {
  console.error("Money admin authority activation governance proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Money admin authority activation governance proof passed.");
