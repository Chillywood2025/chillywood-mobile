#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};

const subscribe = read("app/subscribe.tsx");
const monetization = read("_lib/monetization.ts");
const guard = read("scripts/guard-monetization-e2e-testids.mjs");
const otaDoc = read("docs/release/FULL_APP_AUTHORITY_PRODUCT_BEHAVIOR_OTA_INSTALLED_TRAVERSAL_PROOF.md");

[
  "testID=\"premium-screen\"",
  "testID={hasPremium ? \"premium-active-receipt\" : undefined}",
  "Premium is active.",
  "Premium is not active.",
  "premium-restore-button",
  "premium-purchase-button",
].forEach((needle) => requireText("subscribe screen", subscribe, needle));

[
  "readRevenueCatCustomerInfo",
  "activeEntitlementIds",
  "targets.premium_subscription",
  "syncRevenueCatCustomerIdentity",
].forEach((needle) => requireText("monetization runtime", monetization, needle));

[
  "premium-active-receipt",
  "Premium active receipt selector",
].forEach((needle) => requireText("monetization testID guard", guard, needle));

[
  "No manual Premium grant was performed",
  "provider-backed Premium active account",
].forEach((needle) => requireText("installed traversal proof doc", otaDoc, needle));

[
  "manualPremiumGrant",
  "grantPremium",
  "editPremiumEntitlement",
  "fake Premium",
  "SUPABASE_SERVICE_ROLE_KEY",
].forEach((needle) => forbidText("subscribe screen", subscribe, needle));

if (failures.length) {
  console.error("proof:premium-active-installed-traversal failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:premium-active-installed-traversal passed");
console.log("- Premium active installed proof requires the provider-backed active receipt path.");
console.log("- Current traversal docs keep Premium Partial when no active provider-backed account is available.");
