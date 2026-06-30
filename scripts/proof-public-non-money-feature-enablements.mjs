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

const requireMatch = (label, content, pattern, description) => {
  if (!pattern.test(content)) failures.push(`${label} missing required pattern: ${description}`);
};

const doc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const packageJson = read("package.json");
const publicMoneyCard = read("components/monetization/route-backed-monetization-proof-card.tsx");
const player = read("app/player/[id].tsx");
const watchPartyEntry = read("app/watch-party/index.tsx");
const watchPartyRoom = read("app/watch-party/[partyId].tsx");
const admin = read("app/admin.tsx");

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
  "Public Feature Enablement Matrix",
  "Enabled Public Systems",
  "Intentionally Disabled Systems",
  "Route And Navigation Proof Summary",
  "Disabled Copy Cleanup Summary",
  "Money admin authority governance",
  "Admin Search privacy/export governance",
  "legal/privacy/Data Safety alignment",
  "monitoring analytics crash diagnostics",
  "account restriction appeals",
  "reporting/moderation workflow",
  "live-room moderation incident response",
  "chat/call moderation notification abuse",
  "staff role hierarchy",
].forEach((needle) => requireText("public switchboard", doc, needle));

[
  "| Auth |",
  "| Forgot password / reset password |",
  "| Profile |",
  "| Creator profile/channel |",
  "| Creator uploads |",
  "| Home |",
  "| Search/Browse |",
  "| Title pages |",
  "| Player |",
  "| Favorites |",
  "| Continue watching |",
  "| Chi'lly Chat |",
  "| Chat calls |",
  "| Watch-Party Live |",
  "| Live Watch-Party |",
  "| Live Stage / Live Room |",
  "| Reporting |",
  "| Blocking |",
  "| Account restriction |",
  "| Legal/support/account deletion |",
  "| Settings |",
  "| Notifications |",
  "| Admin Command Center |",
  "| Admin Search |",
  "| Premium gate/readiness |",
  "| Premium monthly purchase |",
  "| Premium annual |",
  "| Creator tips |",
  "| Paid creator video |",
  "| Paid Watch-Party ticket |",
  "| Channel Subscription |",
  "| VIP |",
  "| Paid event |",
  "| Payouts |",
  "| Stripe Connect |",
  "| Merch checkout |",
  "| Provider refunds |",
].forEach((needle) => requireText("public feature matrix", doc, needle));

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
  'paid_content_enabled: "sandbox_only"',
  'merch_enabled: "off"',
  'payouts_enabled: "off"',
  'live_money_enabled: "off"',
].forEach((needle) => requireText("money feature defaults", moneyFlags, needle));

requireText("public money card", publicMoneyCard, "MONEY FEATURE UNAVAILABLE");
requireText("public money card", publicMoneyCard, "Status flow active");
requireText("public money card", publicMoneyCard, "Open status / support");
requireText("public money card", publicMoneyCard, "Public purchase, payout, cash-out, publish, host, and admin authority are not enabled by this surface.");
if (publicMoneyCard.includes("ROUTE-BACKED MONETIZATION PROOF")) {
  failures.push("public money card still exposes proof copy");
}
if (publicMoneyCard.includes("Provider product")) {
  failures.push("public money card still exposes provider product label");
}

requireText("paid video route", player, "paidVideoCheckoutAvailable");
requireText("paid video route", player, "Paid creator video status is active");
requireText("watch-party entry", watchPartyEntry, "paidWatchPartyCheckoutAvailable");
requireText("watch-party entry", watchPartyEntry, "Paid Watch-Party Seat Pass status is active");
requireText("watch-party room", watchPartyRoom, "paidWatchPartyCheckoutAvailable");
requireText("watch-party room", watchPartyRoom, "Seat Pass status is active");

requireText("admin command center", admin, "canAccessAdminConsole");
requireText("admin command center", admin, "readMyPlatformRoleMemberships");
requireText("admin command center", admin, "Admin access requires an active Owner, Admin, or Moderator platform role.");

requireText("package scripts", packageJson, "proof:public-non-money-feature-enablements");
requireText("package scripts", packageJson, "guard:public-non-money-feature-policy");

requireMatch(
  "public switchboard",
  doc,
  /No secrets, raw provider\/payment\/tax\/bank\/token\/signed URL\/private evidence exposure is introduced\.|no secrets committed/i,
  "secret/private exposure confirmation",
);

notes.push("Public non-money switchboard documentation exists.");
notes.push("Safe public systems are documented as enabled or verified behind existing guards.");
notes.push("Live money, creator-money, payouts, Stripe/merch, and provider refunds remain off/manual.");
notes.push("Public-facing monetization proof/provider copy was replaced with active status/readiness copy.");

if (failures.length) {
  console.error("Public non-money feature enablement proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Public non-money feature enablement proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
