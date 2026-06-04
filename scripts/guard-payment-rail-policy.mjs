#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Payment rail policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const appPolicy = read("_lib/paymentRailPolicy.ts");
const edgePolicy = read("supabase/functions/_shared/payment-rail-policy.ts");
const packageJson = read("package.json");
const doctrine = read("PRODUCT_DOCTRINE.md");
const foundationDoc = read("docs/CREATOR_MONETIZATION_SYSTEMS_FOUNDATION.md");

[
  appPolicy,
  edgePolicy,
].forEach((policy, index) => {
  const label = index === 0 ? "app payment rail policy" : "edge payment rail policy";
  assertIncludes(policy, "PAYMENT_RAIL_POLICY_VERSION = \"2026-05-15\"", label);
  assertIncludes(policy, "PREMIUM_PAYMENT_RAIL = \"google_play_revenuecat\"", label);
  assertIncludes(policy, "ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = false", label);
  assertIncludes(policy, "TIPS_MUST_NOT_UNLOCK_DIGITAL_BENEFITS = true", label);
  assertIncludes(policy, "CREATOR_TIP_PAYMENT_RAIL = \"google_play_revenuecat\"", label);
  assertIncludes(policy, "PHYSICAL_PRODUCT_PAYMENT_RAIL = \"stripe_checkout\"", label);
  assertIncludes(policy, "CREATOR_PAYOUT_PAYMENT_RAIL = \"stripe_connect\"", label);
  assertIncludes(policy, "resolvePaymentRailPolicy", label);
  assertIncludes(policy, "premium_subscription", label);
  assertIncludes(policy, "premium_purchase_proof_required", label);
  assertIncludes(policy, "premiumEntitlementSource: \"revenuecat\"", label);
  assertIncludes(policy, "creator_paid_digital_content", label);
  assertIncludes(policy, "android_digital_content_requires_play_billing", label);
  assertIncludes(policy, "approved_external_billing_not_live", label);
  assertIncludes(policy, "creator_tip_support", label);
  assertIncludes(policy, "tips_cannot_unlock_digital_access", label);
  assertIncludes(policy, "creator_tips_use_revenuecat_google_play_sandbox_only", label);
  assertIncludes(policy, "creator_physical_product", label);
  assertIncludes(policy, "merch_checkout_disabled_until_provider_proof", label);
  assertIncludes(policy, "creator_payout_cashout", label);
  assertIncludes(policy, "payouts_disabled_until_connect_proof", label);
  assertNotIncludes(policy, "ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = true", label);
  assertNotIncludes(policy, "premiumEntitlementSource: \"stripe", label);
});

assertIncludes(packageJson, "guard:payment-rail-policy", "package guard script");
assertIncludes(doctrine, "Android in-app digital creator paid content must use Google Play Billing", "doctrine Play Billing rail");
assertIncludes(doctrine, "Android creator tips use Google Play Billing plus RevenueCat", "doctrine tip rail");
assertIncludes(doctrine, "Physical merch/products/clothing may use Stripe", "doctrine product rail");
assertIncludes(doctrine, "Stripe Connect is the only planned payout/cash-out rail", "doctrine payout rail");
assertIncludes(foundationDoc, "Payment Rail Policy Foundation", "foundation payment rail section");
assertIncludes(foundationDoc, "Premium subscription: Google Play plus RevenueCat only", "foundation Premium rail");
assertIncludes(foundationDoc, "Android digital paid creator content: Google Play Billing", "foundation Android digital rail");
assertIncludes(foundationDoc, "Creator-support tips: Android tips use Google Play plus RevenueCat", "foundation tip rail");

if (process.exitCode) {
  process.exit();
}

console.log("Payment rail policy guard passed.");
