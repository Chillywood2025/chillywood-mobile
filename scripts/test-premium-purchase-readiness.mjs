#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolvePremiumPurchaseReadiness } from "../_lib/premiumPurchaseReadiness.mjs";

const base = {
  isSignedIn: true,
  hasPremium: false,
  purchaseMode: "internal_tester_sandbox",
  purchaseShellAvailable: true,
  sandboxModeReason: "Sandbox mode is available.",
  storeName: "App Store",
  storePurchaseRailReadbackComplete: true,
  storePurchaseRailState: "sandbox_only",
  revenueCatConfigured: true,
  configurationReason: null,
  canMakePayments: true,
  offeringAvailable: true,
  packageCount: 2,
};

const cases = [
  ["signed out", { isSignedIn: false }, "sign_in_required"],
  ["entitled", { hasPremium: true }, "premium_already_active"],
  ["client shell unavailable", { purchaseShellAvailable: false, sandboxModeReason: "Client capability is off." }, "purchase_shell_unavailable"],
  ["server readback unavailable", { storePurchaseRailReadbackComplete: false }, "store_rail_readback_unavailable"],
  ["server rail off", { storePurchaseRailState: "off" }, "store_rail_not_sandbox"],
  ["server rail on is not bounded sandbox", { storePurchaseRailState: "on" }, "store_rail_not_sandbox"],
  ["RevenueCat missing", { revenueCatConfigured: false, configurationReason: "Public SDK key missing." }, "revenuecat_not_configured"],
  ["StoreKit unavailable", { canMakePayments: false }, "store_payments_unavailable"],
  ["offering missing", { offeringAvailable: false }, "premium_offering_missing"],
  ["packages missing", { packageCount: 0 }, "premium_packages_missing"],
  ["fully ready", {}, "ready"],
];

for (const [label, override, expectedCode] of cases) {
  const result = resolvePremiumPurchaseReadiness({ ...base, ...override });
  assert.equal(result.code, expectedCode, label);
  assert.equal(result.ready, expectedCode === "ready", `${label} readiness`);
  assert.ok(result.message.length > 0, `${label} message`);
}

const publicReady = resolvePremiumPurchaseReadiness({
  ...base,
  purchaseMode: "public",
  storePurchaseRailReadbackComplete: false,
  storePurchaseRailState: "off",
});
assert.equal(publicReady.ready, true, "public purchases use their own already-approved shell gate");

const subscribe = readFileSync(new URL("../app/subscribe.tsx", import.meta.url), "utf8");
assert.match(subscribe, /disabled=\{busy\}/u, "purchase CTA remains pressable for a readiness explanation");
assert.doesNotMatch(
  subscribe,
  /disabled=\{busy \|\| \(!hasPremium && !canPurchase\)\}/u,
  "purchase CTA must not hide its explanation behind disabled state",
);
assert.match(subscribe, /premium-purchase-blocked-reason/u, "inline blocker is visible and testable");
assert.match(subscribe, /setExpanded\(\(current\) => \(\{ \.\.\.current, "testing-details": true \}\)\)/u, "failed readiness opens diagnostics");

const monetization = readFileSync(new URL("../_lib/monetization.ts", import.meta.url), "utf8");
assert.match(monetization, /readMoneyFeatureFlagSummaryWithStatus/u, "sandbox mode reads the backend rail");
assert.match(monetization, /storePurchaseRailState !== "sandbox_only"/u, "sandbox mode requires the bounded server state");
assert.match(monetization, /storePurchaseRailReadback\.readbackComplete/u, "missing rail readback fails closed");

console.log(`Premium purchase readiness tests passed (${cases.length + 5} assertions/groups).`);
