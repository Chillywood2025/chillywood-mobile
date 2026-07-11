#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Premium sandbox Live tab flow proof failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const monetization = read("_lib/monetization.ts");
const accessSheet = read("components/monetization/access-sheet.tsx");
const subscribe = read("app/subscribe.tsx");
const liveTab = read("app/(tabs)/live.tsx");
const premiumAccess = read("_lib/premiumWatchPartyAccess.ts");
const guard = read("scripts/guard-premium-sandbox-policy.mjs");

const checks = [
  {
    id: "provider_sandbox_candidate_without_role_requirement",
    ok: monetization.includes("providerSandboxCandidate")
      && monetization.includes("Internal tester roles are diagnostics only")
      && !monetization.includes("const enabled = roles.length > 0")
      && !monetization.includes("This account is not approved for internal tester sandbox purchases."),
    detail: "Provider-backed sandbox purchase no longer requires owner/operator/internal-tester role.",
  },
  {
    id: "money_risk_blocks_sandbox",
    ok: monetization.includes("&& !runtime.liveMoneyEnabled")
      && monetization.includes("&& !runtime.payoutsEnabled")
      && monetization.includes("&& !runtime.cashoutEnabled"),
    detail: "Sandbox purchase mode remains blocked when live money, payouts, or cash-out are enabled.",
  },
  {
    id: "offering_package_billing_required",
    ok: subscribe.includes("snapshot.configuration.shouldConfigure")
      && subscribe.includes("snapshot.canMakePayments")
      && subscribe.includes("premiumTarget.offeringAvailable")
      && subscribe.includes("premiumTarget.packageCount <= 0")
      && subscribe.includes("sandboxPurchaseAvailable"),
    detail: "Subscribe diagnostics require RevenueCat config, billing, offering, and package readiness.",
  },
  {
    id: "access_sheet_direct_sandbox_purchase",
    ok: accessSheet.includes("if (isPremiumGateSheet && sheetState?.primaryAction !== \"purchase\")")
      && accessSheet.includes("sheetState?.primaryAction === \"purchase\"")
      && monetization.includes("Start Sandbox Premium Test")
      && accessSheet.includes("purchaseBlockedAccess({ gate, purchaseMode, userId: user?.id ?? null })"),
    detail: "Premium gate sheet can launch sandbox purchase directly instead of always routing to Subscribe.",
  },
  {
    id: "live_tab_actionable_denial_path",
    ok: liveTab.includes("setPremiumGate(access)")
      && liveTab.includes("setPremiumGateVisible(true)")
      && liveTab.includes("live-tab-premium-gate-sheet")
      && liveTab.includes("live-tab-start-sandbox-premium-test"),
    detail: "Live tab Premium denial opens the actionable Premium sheet.",
  },
  {
    id: "live_tab_runtime_disabled_stays_paused",
    ok: liveTab.includes("isRuntimeControlBlockedAccess(access)")
      && liveTab.includes("Alert.alert(copy.title, copy.message);"),
    detail: "Runtime-disabled Live still shows the paused operational alert.",
  },
  {
    id: "strict_entitlement_required_preserved",
    ok: premiumAccess.includes("strictEntitlementRequired: true")
      && liveTab.includes("requireLiveFirstPremium({ accessKey: \"bottom-live-tab\" })"),
    detail: "Live access still uses the strict Premium entitlement gate.",
  },
  {
    id: "entitlement_readback_required_before_live",
    ok: liveTab.includes("recheckLiveAccessAfterPremiumAction")
      && liveTab.includes("if (access?.allowed)")
      && liveTab.includes("Supabase entitlement readback is not active yet"),
    detail: "Live opens only after a fresh strict RevenueCat/Supabase entitlement readback allows access.",
  },
  {
    id: "no_manual_entitlement_or_bypass",
    ok: ![monetization, accessSheet, subscribe, liveTab].join("\n").match(/manual(ly)? grant|fake premium|bypass premium/iu),
    detail: "No manual entitlement grant or Premium bypass path was added.",
  },
  {
    id: "guard_enforces_corrected_policy",
    ok: guard.includes("sandbox mode must not require owner/operator/internal-tester role")
      && guard.includes("Live tab Premium denial opens actionable Premium sheet"),
    detail: "Guard coverage reflects provider-backed sandbox policy and Live tab flow.",
  },
];

for (const check of checks) {
  if (!check.ok) fail(`${check.id}: ${check.detail}`);
}

if (process.exitCode) {
  process.exit();
}

console.log("Premium sandbox Live tab flow proof passed.");
console.log(JSON.stringify({
  checks: checks.map((check) => ({
    id: check.id,
    status: "pass",
    detail: check.detail,
  })),
}, null, 2));
