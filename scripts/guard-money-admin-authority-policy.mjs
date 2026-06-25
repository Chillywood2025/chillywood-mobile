#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const fail = (message) => {
  console.error(`Money admin authority policy guard failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (source, text, label = text) => {
  if (!source.includes(text)) fail(`missing ${label}`);
};
const assertNotMatches = (source, pattern, label) => {
  if (pattern.test(source)) fail(label);
};

const doc = exists("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md")
  ? read("docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md")
  : fail("missing governance doc");
const flags = exists("_lib/moneyFeatureFlags.ts") ? read("_lib/moneyFeatureFlags.ts") : "";
const admin = exists("app/admin.tsx") ? read("app/admin.tsx") : "";
const packageJson = exists("package.json") ? read("package.json") : "";

[
  "This lane does not activate money",
  "Premium annual remains provider-blocked",
  "Creator-money remains OFF",
  "live_money_enabled remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "Dual approval is required for future payout activation",
  "Dual approval is required for future live_money_enabled",
  "Emergency money kill switch is First Owner/Owner-controlled and audited",
  "Admin can view/manage only exact money-support scopes",
  "Moderator cannot activate money",
  "Provider transaction/customer/order data is masked/scoped",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened",
].forEach((text) => assertIncludes(doc, text));

assertIncludes(packageJson, "guard:money-admin-authority-policy", "package guard script");
assertIncludes(flags, "live_money_enabled: \"off\"", "live_money_enabled default off");
assertIncludes(flags, "payouts_enabled: \"off\"", "payouts_enabled default off");
assertIncludes(flags, "digital_sales_enabled: \"off\"", "digital sales default off");
assertIncludes(flags, "paid_content_enabled: \"off\"", "paid content default off");
assertIncludes(flags, "tips_enabled: \"off\"", "tips default off");
assertIncludes(flags, "stripe_connect_enabled: \"sandbox_only\"", "Stripe Connect sandbox-only default");
assertIncludes(flags, "revenuecat_google_play_enabled: \"sandbox_only\"", "RevenueCat/Google Play sandbox-only default");

const riskySources = [
  ["governance doc", doc],
  ["admin UI", admin],
  ["money flags", flags],
];

for (const [label, source] of riskySources) {
  assertNotMatches(source, /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i, `${label} claims Premium annual live`);
  assertNotMatches(source, /creator[- ]money (?:is|now|currently)?\s*(?:live|enabled|available now)/i, `${label} claims creator-money live`);
  assertNotMatches(source, /provider refunds? (?:are|is|now)?\s*(?:automatic|enabled|executed|available)/i, `${label} claims provider refund execution`);
  assertNotMatches(source, /Admin can activate money/i, `${label} lets Admin activate money`);
  assertNotMatches(source, /Moderator can activate money/i, `${label} lets Moderator activate money`);
  assertNotMatches(source, /payouts? (?:are live|is live|now live|are enabled for public use|is enabled for public use|available now)/i, `${label} claims payouts live`);
  assertNotMatches(source, /Stripe Connect (?:is live|now live|enabled for payouts|is enabled for payouts|live and enabled)/i, `${label} claims Stripe Connect live`);
  assertNotMatches(source, /merch checkout (?:is|now)?\s*(?:live|enabled|available)/i, `${label} claims merch checkout live`);
}

const codeActivation = `${flags}\n${admin}`;
[
  /live_money_enabled:\s*["']on["']/i,
  /payouts_enabled:\s*["']on["']/i,
  /digital_sales_enabled:\s*["']on["']/i,
  /creator_monetization_enabled:\s*["']on["']/i,
  /paid_content_enabled:\s*["']on["']/i,
  /tips_enabled:\s*["']on["']/i,
  /stripe_connect_enabled:\s*["']on["']/i,
  /merch_enabled:\s*["']on["']/i,
  /providerRefundsEnabled\s*[:=]\s*true/i,
  /executeProviderRefund\s*\(/i,
  /stripe\.refunds\.create/i,
  /refunds\.create\s*\(/i,
  /payoutCreated:\s*true/i,
  /canExecuteProductionPayout:\s*true/i,
].forEach((pattern) => assertNotMatches(codeActivation, pattern, `activation pattern ${pattern}`));

assertNotMatches(doc, /raw provider (?:transaction|customer|order) data is exposed/i, "raw provider data exposure");
assertNotMatches(doc, /raw provider IDs are exposed/i, "raw provider IDs exposure");
assertNotMatches(doc, /tax IDs are exposed|bank details are exposed|payment credentials are exposed/i, "payment private data exposure");

console.log("Money admin authority policy guard passed.");
