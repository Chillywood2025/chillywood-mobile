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

const doc = read("docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const auditDoc = read("docs/admin/AUDIT_LOG_INTEGRITY_PRIVILEGED_ACTION_EVIDENCE.md");
const publicSwitchboardDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const adminSearchDoc = read("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const packageJson = read("package.json");

[
  "Emergency actions require exact scope, reason, and audit where backed",
  "First Owner / Owner owns emergency control authority",
  "Admin can operate only exact-scope emergency controls where explicitly allowed",
  "Moderator cannot operate broad emergency controls",
  "Support is not a backend role",
  "Emergency disable preserves evidence and does not hard-delete audit records",
  "Emergency disable does not execute refunds, purchases, payouts, transfers, or provider mutations",
  "Customer, creator, security, legal/DMCA, money, and live-room harassment templates are privacy-safe",
  "Post-incident audit review is required",
  "Rollback checklist exists",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("emergency governance doc", doc, needle));

[
  "Emergency controls, incident response, and kill-switch governance",
].forEach((needle) => {
  requireText("audit governance doc", auditDoc, needle);
  requireText("public switchboard doc", publicSwitchboardDoc, needle);
  requireText("Admin Search doc", adminSearchDoc, needle);
  requireText("Command Center doc", commandCenterDoc, needle);
});

[
  "proof:emergency-controls-incident-response-kill-switch-governance",
  "guard:emergency-controls-incident-response-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

forbidMatch("emergency governance doc", doc, /Moderator (?:can|may|is allowed to) operate broad emergency controls/i, "broad Moderator emergency control");
forbidMatch("emergency governance doc", doc, /support (?:role|users?|workflow users?) (?:can|may|is allowed to) operate broad emergency controls/i, "broad support emergency control");
forbidMatch("emergency governance doc", doc, /default users? (?:can|may|is allowed to) operate emergency controls/i, "default user emergency control");
forbidMatch("emergency governance doc", doc, /emergency actions? (?:do not require|without) (?:exact scope|reason|audit)/i, "emergency action without exact scope/reason/audit");
forbidMatch("emergency governance doc", doc, /emergency disable (?:hard-deletes|hard deletes|deletes audit records|removes audit records)/i, "emergency hard-delete path");
forbidMatch("emergency governance doc", doc, /emergency controls? (?:execute|trigger|perform) (?:refunds|purchases|payouts|transfers|provider mutations)/i, "emergency provider/money mutation path");
forbidMatch("emergency governance doc", doc, /template[s]? (?:may|can|should|are allowed to) expose (?:reporter identity|private evidence|raw logs|provider IDs|legal conclusions|unverified admissions)/i, "unsafe incident template allowance");
forbidMatch("emergency governance doc", doc, /post-incident audit review (?:is optional|not required)/i, "missing post-incident audit requirement");
forbidMatch("emergency governance doc", doc, /rollback checklist (?:is optional|not required|missing)/i, "missing rollback checklist");
forbidMatch("emergency governance doc", doc, /provider dashboard ownership (?:is|was|has been) closed here/i, "provider-dashboard ownership closure claim");

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

forbidMatch("emergency governance doc", doc, /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Premium annual live claim");
forbidMatch("emergency governance doc", doc, /Creator Channel Subscription (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Creator Channel Subscription live claim");
forbidMatch("emergency governance doc", doc, /creator-money (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "creator-money live claim");
forbidMatch("emergency governance doc", doc, /payouts? (?:are|is) (?:live|enabled|available now)/i, "payout live claim");
forbidMatch("emergency governance doc", doc, /Stripe Connect (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Stripe Connect live claim");
forbidMatch("emergency governance doc", doc, /merch checkout (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "merch checkout live claim");

if (!/must not (?:include|expose)|do not (?:include|expose)|No secrets/.test(doc)) {
  failures.push("emergency governance doc missing explicit no-exposure template/privacy guardrail");
}

if (failures.length) {
  console.error("Emergency controls incident response policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Emergency controls incident response policy guard passed.");
console.log("- broad Moderator/support/default emergency controls remain denied.");
console.log("- emergency disable is evidence-preserving and does not execute refunds, purchases, payouts, transfers, or provider mutations.");
console.log("- live money, creator-money, Premium public purchase, payouts, Stripe/merch, and provider mutation remain off.");
