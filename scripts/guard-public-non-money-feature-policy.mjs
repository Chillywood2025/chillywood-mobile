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

const doc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const publicMoneyCard = read("components/monetization/route-backed-monetization-proof-card.tsx");
const player = read("app/player/[id].tsx");
const watchPartyEntry = read("app/watch-party/index.tsx");
const watchPartyRoom = read("app/watch-party/[partyId].tsx");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");

[
  "Public non-money feature enablement: Closed / Partial / Blocked",
  "This lane enables safe public app systems only",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
  "Premium annual remains provider-blocked",
  "Creator Channel Subscription remains provider-blocked",
  "Premium monthly public purchase remains separate owner-approved proof unless explicitly activated in a separate lane",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
  "Admin/staff routes remain scoped",
  "Reporting, blocking, account restriction, legal/support/account deletion, and monitoring remain aligned",
].forEach((needle) => requireText("public switchboard", doc, needle));

[
  "premiumPurchaseEnabled: false",
  "paidContentCheckoutEnabled: false",
  "creatorPricingEnabled: false",
  "tipsEnabled: false",
  "merchStoreEnabled: false",
  "cashoutEnabled: false",
  "payoutsEnabled: false",
  "stripeConnectProductionEnabled: false",
  "liveMoneyEnabled: false",
].forEach((needle) => requireText("runtime monetization defaults", featureFlags, needle));

[
  'digital_sales_enabled: "sandbox_only"',
  'tips_enabled: "sandbox_only"',
  'watch_party_tickets_enabled: "sandbox_only"',
  'paid_content_enabled: "sandbox_only"',
  'merch_enabled: "off"',
  'payouts_enabled: "off"',
  'live_money_enabled: "off"',
].forEach((needle) => requireText("money feature defaults", moneyFlags, needle));

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

[
  "paidVideoCheckoutAvailable",
  "Paid creator video status is active",
].forEach((needle) => requireText("paid video route", player, needle));
[
  "paidWatchPartyCheckoutAvailable",
  "Paid Watch-Party Seat Pass status is active",
].forEach((needle) => requireText("watch-party entry route", watchPartyEntry, needle));
[
  "paidWatchPartyCheckoutAvailable",
  "Seat Pass status is active",
].forEach((needle) => requireText("watch-party room route", watchPartyRoom, needle));

forbidMatch("public money card", publicMoneyCard, /ROUTE-BACKED MONETIZATION PROOF/, "proof copy");
forbidMatch("public money card", publicMoneyCard, /Provider product/, "raw provider product label");
forbidMatch("public money card", publicMoneyCard, /providerProductId\}/, "provider product identifier rendering");

requireText("admin command center", admin, "canAccessAdminConsole");
requireText("admin command center", admin, "readMyPlatformRoleMemberships");
requireText("admin command center", admin, "if (!canAccessAdmin)");

forbidMatch("public switchboard", doc, /Premium annual (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Premium annual live claim");
forbidMatch("public switchboard", doc, /Creator Channel Subscription (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Creator Channel Subscription live claim");
forbidMatch("public switchboard", doc, /creator-money (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "creator-money live claim");
forbidMatch("public switchboard", doc, /automatic refunds? (?:are|is) (?:live|enabled|available)/i, "automatic refund live claim");
forbidMatch("public switchboard", doc, /payouts? (?:are|is) (?:live|enabled|available now)/i, "payout live claim");
forbidMatch("public switchboard", doc, /Stripe Connect (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "Stripe Connect live claim");
forbidMatch("public switchboard", doc, /merch checkout (?:is|now|currently)?\s*(?:live|enabled|available now)/i, "merch checkout live claim");

requireText("public switchboard", doc, "No secrets committed; no raw provider/payment/tax/bank/token/signed URL/private evidence exposure is introduced.");

requireText("package scripts", packageJson, "proof:public-non-money-feature-enablements");
requireText("package scripts", packageJson, "guard:public-non-money-feature-policy");

if (failures.length) {
  console.error("Public non-money feature policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Public non-money feature policy guard passed.");
console.log("- live_money_enabled, creator-money, payouts, Stripe/merch, and refund automation remain off/manual.");
console.log("- public paid-access controls open active status/readiness flows unless live checkout switches are explicitly enabled elsewhere.");
console.log("- admin/staff route guard markers remain present.");
