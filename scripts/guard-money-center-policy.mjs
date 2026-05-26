#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Money Center policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const channelSettings = read("app/channel-settings.tsx");
const monetizeRoute = read("app/monetize.tsx");
const revenueRoute = read("app/revenue.tsx");
const payoutsRoute = read("app/payouts.tsx");
const packageJson = read("package.json");
const providerReadiness = read("_lib/providerReadiness.ts");
const paymentRailPolicy = read("_lib/paymentRailPolicy.ts");

assertIncludes(packageJson, "guard:money-center-policy", "package guard script");

[
  "Money Center",
  "Digital Sales",
  "Tips",
  "Watch-Party Seats",
  "Paid Content",
  "Merch",
  "Creator Balance",
  "Payouts",
  "Tax & Legal",
  "Provider Status",
  "Future Tools",
  "Technical checks",
].forEach((section) => {
  assertIncludes(channelSettings, section, `Money Center section ${section}`);
});

assertIncludes(channelSettings, "Digital sales are not active yet.", "no active digital sales copy");
assertIncludes(channelSettings, "Your balance will appear after verified sales.", "ledger-first balance copy");
assertIncludes(channelSettings, "No verified earnings yet", "no fake earnings copy");
assertIncludes(channelSettings, "Tips will unlock after store products and payout rules are verified.", "tips readiness copy");
assertIncludes(channelSettings, "No tip totals, tip balance, or tip checkout is available here.", "no fake tips copy");
assertIncludes(channelSettings, "Stripe is not used to charge Android users for in-app digital access.", "Android digital Stripe block");
assertIncludes(channelSettings, "Stripe Connect is for creator payouts only.", "Stripe Connect payout boundary");
assertIncludes(channelSettings, "Physical merch can use a separate approved checkout", "merch separation copy");
assertIncludes(channelSettings, "Digital app access stays separate from merch", "digital merch separation");
assertIncludes(channelSettings, "Provider checks are the source of readiness truth.", "provider readiness visible source");
assertIncludes(channelSettings, "readProviderReadinessSummary", "provider readiness integration");
assertIncludes(providerReadiness, "readProviderReadinessSummary", "provider readiness helper");
assertIncludes(providerReadiness, "isLiveMoneyEnabled: false", "provider readiness fallback live money false");
assertIncludes(paymentRailPolicy, "ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = false", "payment rail Stripe block");

assertIncludes(monetizeRoute, "focus=overview", "old monetize route maps to Money Center overview");
assertIncludes(revenueRoute, "focus=balance", "old revenue route maps to Money Center balance");
assertIncludes(payoutsRoute, "focus=payouts", "old payouts route maps to Money Center payouts");
assertIncludes(channelSettings, "normalized === \"monetize\" || normalized === \"payouts\" || normalized === \"revenue\"", "old tab params normalize to Monetization");
assertIncludes(channelSettings, "normalized === \"stripe\"", "old Stripe focus maps to payouts");
assertIncludes(channelSettings, "normalized === \"store\"", "old store focus maps to provider status");

assertNotIncludes(channelSettings, "{ id: \"monetize\", label: \"Monetize\" }", "duplicate Monetize tab");
assertNotIncludes(channelSettings, "{ id: \"revenue\", label: \"Revenue\" }", "duplicate Revenue tab");
assertNotIncludes(channelSettings, "{ id: \"payouts\", label: \"Payouts\" }", "duplicate Payouts tab");
assertNotIncludes(channelSettings, "fake purchase", "fake purchase copy in Studio");
assertNotIncludes(channelSettings, "fake tip", "fake tip copy in Studio");
assertNotIncludes(channelSettings, "fake earnings", "fake earnings copy in Studio");
assertNotIncludes(channelSettings, "fake payout", "fake payout copy in Studio");
assertNotIncludes(channelSettings, "Mini Platform", "user-facing Mini Platform copy");
assertNotIncludes(channelSettings, "STRIPE_SECRET_KEY", "Stripe secret in Studio");
assertNotIncludes(channelSettings, "REVENUECAT_SECRET_API_KEY", "RevenueCat secret in Studio");
assertNotIncludes(channelSettings, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "Google service account in Studio");
assertNotIncludes(channelSettings, "whsec_", "webhook secret value in Studio");
assertNotIncludes(channelSettings, "sk_live_", "Stripe live secret in Studio");
assertNotIncludes(channelSettings, "sk_test_", "Stripe test secret in Studio");
assertNotIncludes(channelSettings, "checkout.session.create", "Stripe checkout creation in Studio");
assertNotIncludes(channelSettings, "PaymentIntent", "Stripe payment intent in Studio");
assertNotIncludes(channelSettings, "transferCreated: true", "transfer creation in Studio");
assertNotIncludes(channelSettings, "payoutCreated: true", "payout creation in Studio");

if (process.exitCode) {
  process.exit();
}

console.log("Money Center policy guard passed.");
