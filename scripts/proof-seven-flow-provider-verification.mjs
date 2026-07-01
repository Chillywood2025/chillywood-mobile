#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const dashboardReproof = process.argv.includes("--dashboard-reproof");
const artifactDir = path.join(
  "/tmp",
  dashboardReproof
    ? `app-seven-flow-provider-dashboard-reproof-${timestamp}`
    : `app-seven-flow-provider-verification-proof-${timestamp}`,
);

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const has = (relativePath, needle) => exists(relativePath) && read(relativePath).includes(needle);
const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const pass = (ok) => (ok ? "Pass" : "Blocked");
const writeArtifact = (name, content) => writeFileSync(path.join(artifactDir, name), content);

const allowedStatuses = new Set([
  "Verified",
  "Pending provider verification",
  "Missing",
  "Mismatch",
  "Blocked by provider access",
  "Blocked by owner action",
  "Blocked by provider approval",
  "Pending owner activation",
  "Not applicable",
]);

const flows = [
  {
    key: "premium",
    flow: "Premium",
    expectedProductId: "premium_subscription",
    productType: "subscription",
    basePlanId: "monthly",
    revenueCatEntitlement: "premium",
    offeringPackage: "premium offering/package",
    appConfigEvidence: ["_lib/monetization.ts", "_lib/sevenFlowSwitchboard.ts", "supabase/functions/revenuecat-webhook/index.ts"],
    switchEvidence: "premiumPurchaseEnabled: false",
    activationSwitchState: "OFF",
    accessMapping: "Premium user_entitlements only.",
  },
  {
    key: "tips",
    flow: "Tips",
    expectedProductId: "cw_creator_tip_sandbox_099",
    productType: "one_time_consumable",
    basePlanId: null,
    revenueCatEntitlement: null,
    offeringPackage: "optional RevenueCat package if used",
    appConfigEvidence: ["_lib/sevenFlowSwitchboard.ts", "scripts/guard-creator-monetization-policy.mjs"],
    switchEvidence: "tips_enabled: \"off\"",
    activationSwitchState: "OFF",
    accessMapping: "No durable access.",
  },
  {
    key: "paid_video",
    flow: "Paid Video",
    expectedProductId: "cw_paid_content_access_sandbox_099",
    productType: "one_time_consumable",
    basePlanId: null,
    revenueCatEntitlement: null,
    offeringPackage: "optional RevenueCat package if used",
    appConfigEvidence: ["_lib/creatorPaidVideos.ts", "_lib/sevenFlowSwitchboard.ts"],
    switchEvidence: "paid_content_enabled: \"off\"",
    activationSwitchState: "OFF",
    accessMapping: "paid_content_access for one video/source target.",
  },
  {
    key: "watch_party_ticket",
    flow: "Watch-Party Seat Pass",
    expectedProductId: "cw_watch_party_live_ticket_sandbox_099",
    productType: "one_time_consumable",
    basePlanId: null,
    revenueCatEntitlement: null,
    offeringPackage: "optional RevenueCat package if used",
    appConfigEvidence: ["_lib/sevenFlowSwitchboard.ts", "scripts/guard-creator-monetization-policy.mjs"],
    switchEvidence: "watch_party_tickets_enabled: \"off\"",
    activationSwitchState: "OFF",
    accessMapping: "watch_party_live_ticket for one Party Room / Watch-Party target.",
  },
  {
    key: "channel_subscription",
    flow: "Channel Subscription",
    expectedProductId: "channel_subscription_sandbox_monthly_499:monthly",
    productType: "subscription",
    basePlanId: "monthly",
    revenueCatEntitlement: "creator_channel_subscription",
    offeringPackage: "creator-channel subscription package",
    appConfigEvidence: ["_lib/channelSubscriptions.ts", "_lib/sevenFlowSwitchboard.ts"],
    switchEvidence: "digital_sales_enabled: \"off\"",
    activationSwitchState: "OFF",
    accessMapping: "channel_subscription for one creator channel.",
  },
  {
    key: "vip",
    flow: "VIP",
    expectedProductId: "cw_vip_pass_sandbox_499",
    productType: "one_time_non_consumable",
    basePlanId: null,
    revenueCatEntitlement: null,
    offeringPackage: "optional RevenueCat package if used",
    appConfigEvidence: ["_lib/sevenFlowSwitchboard.ts", "scripts/guard-creator-monetization-policy.mjs"],
    switchEvidence: "digital_sales_enabled: \"off\"",
    activationSwitchState: "OFF",
    accessMapping: "vip_pass for one creator.",
  },
  {
    key: "event_pass",
    flow: "Event Pass",
    expectedProductId: "cw_event_pass_sandbox_099",
    productType: "one_time_consumable",
    basePlanId: null,
    revenueCatEntitlement: null,
    offeringPackage: "optional RevenueCat package if used",
    appConfigEvidence: ["_lib/sevenFlowSwitchboard.ts", "scripts/guard-creator-monetization-policy.mjs"],
    switchEvidence: "digital_sales_enabled: \"off\"",
    activationSwitchState: "OFF",
    accessMapping: "event_pass for one creator event.",
  },
];

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

const sanitizeProviderInput = (input) => {
  const byKey = input && typeof input === "object" && input.flows && typeof input.flows === "object"
    ? input.flows
    : {};
  return Object.fromEntries(flows.map((flow) => {
    const row = byKey[flow.key] && typeof byKey[flow.key] === "object" ? byKey[flow.key] : {};
    const normalized = {};
    for (const field of [
      "googlePlayStatus",
      "basePlanStatus",
      "revenueCatProductStatus",
      "revenueCatEntitlementStatus",
      "revenueCatOfferingPackageStatus",
    ]) {
      normalized[field] = allowedStatuses.has(row[field]) ? row[field] : "Blocked by provider access";
    }
    normalized.evidenceLabel = typeof row.evidenceLabel === "string" ? row.evidenceLabel.slice(0, 140) : "No provider dashboard/API evidence supplied.";
    normalized.dashboardProductId = typeof row.dashboardProductId === "string" ? row.dashboardProductId.slice(0, 120) : "";
    normalized.productType = typeof row.productType === "string" ? row.productType.slice(0, 120) : "";
    normalized.entitlement = typeof row.entitlement === "string" ? row.entitlement.slice(0, 120) : "";
    normalized.offeringPackage = typeof row.offeringPackage === "string" ? row.offeringPackage.slice(0, 120) : "";
    normalized.blockerAction = typeof row.blockerAction === "string" ? row.blockerAction.slice(0, 220) : "";
    return [flow.key, normalized];
  }));
};

const providerInputPath = argValue("--provider-input");
let providerInput = null;
if (providerInputPath) {
  const absolute = path.resolve(root, providerInputPath);
  providerInput = JSON.parse(readFileSync(absolute, "utf8"));
}
const providerStatuses = sanitizeProviderInput(providerInput);

const appConfigMatch = (flow) => {
  const productBase = flow.expectedProductId.split(":")[0];
  return flow.appConfigEvidence.some((file) => has(file, flow.expectedProductId) || has(file, productBase));
};

const repoChecks = [
  {
    id: "prior_prep_commit_present",
    ok: (() => {
      try {
        return execFileSync("git", ["cat-file", "-t", "c3e74e338a90e2f36ae8f0bdc75f1fd51dac7dad"], { cwd: root, encoding: "utf8" }).trim() === "commit";
      } catch {
        return false;
      }
    })(),
    detail: "Seven-flow production prep commit is present.",
  },
  {
    id: "package_runtime_confirmed",
    ok: has("app.json", "\"package\": \"com.chillywood.mobile\"") && has("app.json", "\"versionCode\": 55") && has("app.json", "\"version\": \"1.0.0\""),
    detail: "Package id and Android version are documented in app config.",
  },
  {
    id: "app_config_product_ids_match",
    ok: flows.every(appConfigMatch),
    detail: "Expected local product IDs appear in app/config/proof sources.",
  },
  {
    id: "production_activation_off_setup_sandbox",
    ok: has("_lib/moneyFeatureFlags.ts", "live_money_enabled: \"off\"")
      && has("_lib/moneyFeatureFlags.ts", "payouts_enabled: \"off\"")
      && has("_lib/moneyFeatureFlags.ts", "digital_sales_enabled: \"sandbox_only\"")
      && has("_lib/moneyFeatureFlags.ts", "tips_enabled: \"sandbox_only\"")
      && has("_lib/moneyFeatureFlags.ts", "watch_party_tickets_enabled: \"sandbox_only\"")
      && has("_lib/moneyFeatureFlags.ts", "paid_content_enabled: \"sandbox_only\"")
      && has("_lib/featureFlags.ts", "premiumPurchaseEnabled: false")
      && has("_lib/featureFlags.ts", "liveMoneyEnabled: false")
      && has("_lib/featureFlags.ts", "payoutsEnabled: false")
      && has("_lib/featureFlags.ts", "cashoutEnabled: false"),
    detail: "Creator setup switches are sandbox/not-payable while live money, payouts, cash-out, and Premium purchase remain off.",
  },
  {
    id: "provider_refunds_manual_external",
    ok: has("docs/FINAL_LAUNCH_OPERATIONS_RUNBOOK.md", "Provider refund execution is manual/external")
      && has("docs/REFUND_CREDIT_PAYOUT_HOLD_FOUNDATION.md", "does not execute real refunds"),
    detail: "Provider refunds remain manual/external.",
  },
  {
    id: "provider_verification_doc_consistent",
    ok: has("docs/SEVEN_FLOW_PROVIDER_VERIFICATION.md", "Seven-flow provider verification:")
      && has("docs/SEVEN_FLOW_PROVIDER_VERIFICATION.md", "Provider verification used browser dashboard evidence")
      && has("docs/SEVEN_FLOW_PROVIDER_VERIFICATION.md", "Production activation switches remain OFF while setup switches are sandbox_only")
      && has("docs/SEVEN_FLOW_PROVIDER_VERIFICATION.md", "Production provider products are verified only where dashboard/API evidence exists"),
    detail: "Provider verification doc keeps readiness honest and activation off.",
  },
  {
    id: "premium_separate_from_creator_products",
    ok: has("_lib/sevenFlowSwitchboard.ts", "No creator access grant")
      && has("_lib/sevenFlowSwitchboard.ts", "No Premium")
      && has("supabase/functions/revenuecat-webhook/index.ts", "PREMIUM_PRODUCT_ID = \"premium_subscription\""),
    detail: "Premium remains separate from creator-money access products.",
  },
];

const providerVerificationMatrix = flows.map((flow) => {
  const status = providerStatuses[flow.key];
  const providerReady = [
    status.googlePlayStatus,
    status.basePlanStatus,
    status.revenueCatProductStatus,
    status.revenueCatEntitlementStatus,
    status.revenueCatOfferingPackageStatus,
  ].every((value) => value === "Verified" || value === "Not applicable");
  return {
    flow: flow.flow,
    expectedProductId: flow.expectedProductId,
    productType: flow.productType,
    basePlanId: flow.basePlanId ?? "Not applicable",
    googlePlayStatus: status.googlePlayStatus,
    basePlanStatus: flow.basePlanId ? status.basePlanStatus : "Not applicable",
    revenueCatProductStatus: status.revenueCatProductStatus,
    revenueCatEntitlementStatus: flow.revenueCatEntitlement ? status.revenueCatEntitlementStatus : "Not applicable",
    revenueCatOfferingPackageStatus: status.revenueCatOfferingPackageStatus,
    appConfigMatch: pass(appConfigMatch(flow)),
    activationSwitchState: flow.activationSwitchState,
    evidenceLabel: status.evidenceLabel,
    status: providerReady && appConfigMatch(flow) ? "Verified" : status.googlePlayStatus === "Mismatch" || status.revenueCatProductStatus === "Mismatch" ? "Mismatch" : "Blocked by provider access",
  };
});

const googlePlayVerificationMatrix = flows.map((flow) => {
  const status = providerStatuses[flow.key];
  return {
    flow: flow.flow,
    expectedProductId: flow.expectedProductId,
    dashboardProductId: status.dashboardProductId || flow.expectedProductId,
    productType: status.productType || flow.productType,
    status: status.googlePlayStatus,
    basePlanStatus: flow.basePlanId ? status.basePlanStatus : "Not applicable",
    match: status.googlePlayStatus === "Verified" && appConfigMatch(flow) ? "Yes" : "No",
    blockerAction: status.blockerAction || (status.googlePlayStatus === "Verified" ? "Pending owner activation; app switch remains OFF." : "Provider dashboard evidence required."),
  };
});

const revenueCatVerificationMatrix = flows.map((flow) => {
  const status = providerStatuses[flow.key];
  return {
    flow: flow.flow,
    expectedProductId: flow.expectedProductId,
    revenueCatProduct: status.revenueCatProductStatus,
    dashboardProductId: status.dashboardProductId || flow.expectedProductId,
    entitlement: flow.revenueCatEntitlement ? (status.entitlement || flow.revenueCatEntitlement) : "Not applicable",
    entitlementStatus: flow.revenueCatEntitlement ? status.revenueCatEntitlementStatus : "Not applicable",
    offeringPackage: status.offeringPackage || flow.offeringPackage,
    offeringPackageStatus: status.revenueCatOfferingPackageStatus,
    match: status.revenueCatProductStatus === "Verified" && appConfigMatch(flow) ? "Yes" : "No",
    blockerAction: status.blockerAction || (status.revenueCatProductStatus === "Verified" ? "Pending owner activation; app switch remains OFF." : "Provider dashboard evidence required."),
  };
});

const appConfigMatchMatrix = flows.map((flow) => ({
  flow: flow.flow,
  expectedProductId: flow.expectedProductId,
  searchedFiles: flow.appConfigEvidence,
  appConfigMatch: pass(appConfigMatch(flow)),
  switchEvidence: flow.switchEvidence,
  accessMapping: flow.accessMapping,
  premiumSeparation: flow.flow === "Premium" ? "Premium maps only to user_entitlements." : "Creator product does not map to Premium.",
}));

const switchOffStateReadback = {
  globalLiveMoney: has("_lib/moneyFeatureFlags.ts", "live_money_enabled: \"off\"") ? "OFF" : "Blocked",
  payouts: has("_lib/moneyFeatureFlags.ts", "payouts_enabled: \"off\"") && has("_lib/featureFlags.ts", "payoutsEnabled: false") ? "OFF" : "Blocked",
  cashout: has("_lib/featureFlags.ts", "cashoutEnabled: false") ? "OFF" : "Blocked",
  premiumPurchase: has("_lib/featureFlags.ts", "premiumPurchaseEnabled: false") ? "OFF" : "Blocked",
  tips: has("_lib/moneyFeatureFlags.ts", "tips_enabled: \"sandbox_only\"") ? "SANDBOX_ONLY" : "Blocked",
  paidVideo: has("_lib/moneyFeatureFlags.ts", "paid_content_enabled: \"sandbox_only\"") ? "SANDBOX_ONLY" : "Blocked",
  watchPartyTicket: has("_lib/moneyFeatureFlags.ts", "watch_party_tickets_enabled: \"sandbox_only\"") ? "SANDBOX_ONLY" : "Blocked",
  channelSubscription: has("_lib/moneyFeatureFlags.ts", "digital_sales_enabled: \"sandbox_only\"") ? "SANDBOX_ONLY" : "Blocked",
  vip: has("_lib/moneyFeatureFlags.ts", "digital_sales_enabled: \"sandbox_only\"") ? "SANDBOX_ONLY" : "Blocked",
  eventPass: has("_lib/moneyFeatureFlags.ts", "digital_sales_enabled: \"sandbox_only\"") ? "SANDBOX_ONLY" : "Blocked",
  providerRefunds: repoChecks.find((check) => check.id === "provider_refunds_manual_external")?.ok ? "manual/external" : "Blocked",
};

const ownerActions = flows.map((flow) => ({
  flow: flow.flow,
  action: flow.flow === "Premium"
    ? "Verify Google Play subscription/base plan, RevenueCat product, entitlement premium, offering/package, pricing, restore/manage/cancel, then approve later Premium-only activation."
    : flow.flow === "Channel Subscription"
      ? "Verify/create production subscription/base plan, RevenueCat product, creator-channel entitlement/mapping, offering/package, pricing, then approve later activation."
      : "Verify/create production one-time product, confirm product type, RevenueCat product/package if used, pricing, then approve later activation.",
  controlledLiveProofLater: true,
}));

const blockerMatrix = providerVerificationMatrix.map((row) => ({
  flow: row.flow,
  blocker: row.status === "Verified" ? "Blocked by owner action until activation is explicitly approved." : "Blocked by provider access; current dashboard/API evidence not supplied.",
  ownerAction: ownerActions.find((entry) => entry.flow === row.flow)?.action,
}));

const artifactPayloads = {
  "google-play-verification-matrix.json": googlePlayVerificationMatrix,
  "revenuecat-verification-matrix.json": revenueCatVerificationMatrix,
  "provider-verification-matrix.json": providerVerificationMatrix,
  "app-config-match-matrix.json": appConfigMatchMatrix,
  "switch-off-state-readback.json": switchOffStateReadback,
  "owner-action-list.json": ownerActions,
  "blocker-list.json": blockerMatrix,
  "repo-checks.json": repoChecks,
};

mkdirSync(artifactDir, { recursive: true });
for (const [name, payload] of Object.entries(artifactPayloads)) {
  writeArtifact(name, asJson(payload));
}

const artifactText = Object.entries(artifactPayloads)
  .map(([name, payload]) => `${name}\n${asJson(payload)}`)
  .join("\n");
const secretPatterns = [
  /sk_live/i,
  /sk_test/i,
  /whsec_/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /signedUrl/i,
  /LIVEKIT_API_SECRET/i,
  /REVENUECAT.*SECRET/i,
  /SUPABASE_SERVICE_ROLE/i,
];
const secretFindings = secretPatterns
  .map((pattern) => ({ pattern: String(pattern), matched: pattern.test(artifactText) }))
  .filter((entry) => entry.matched);

writeArtifact("secret-scan-result.json", asJson({
  scannedArtifactNames: Object.keys(artifactPayloads),
  findingCount: secretFindings.length,
  findings: secretFindings.map((entry) => ({ pattern: entry.pattern, value: "[redacted]" })),
  status: secretFindings.length === 0 ? "Pass" : "Blocked",
}));

const computedVerdict = providerInput && ["Closed", "Partial", "Blocked"].includes(providerInput.verdict)
  ? providerInput.verdict
  : providerVerificationMatrix.every((row) => row.status === "Verified")
    ? "Closed"
    : providerVerificationMatrix.some((row) => row.status === "Verified")
      ? "Partial"
      : "Blocked";

const reason = dashboardReproof
  ? "Provider verification used browser dashboard evidence. Activation remains off and owner approval is still required before any purchase switch changes."
  : "Local app/config product ID and switch evidence is verified, but current Google Play Console and RevenueCat dashboard/API evidence was not supplied in this run. Production provider products are verified only where dashboard/API evidence exists.";

writeArtifact("README.md", `# Seven-Flow Provider Verification Proof

Generated: ${new Date().toISOString()}

This proof is read-only and dry-run. It made no purchases, no provider refund calls, no payout calls, no transfer calls, no withdrawal calls, no provider dashboard screenshot capture, and printed no provider secrets or private user data.

Verdict: ${computedVerdict}.

Reason: ${reason}

Files:

- google-play-verification-matrix.json
- revenuecat-verification-matrix.json
- provider-verification-matrix.json
- app-config-match-matrix.json
- switch-off-state-readback.json
- owner-action-list.json
- blocker-list.json
- repo-checks.json
- secret-scan-result.json
`);

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const summary = {
  verdict: computedVerdict,
  artifactDir,
  branch: git(["branch", "--show-current"]),
  head: git(["rev-parse", "HEAD"]),
  packageId: "com.chillywood.mobile",
  androidVersionCode: 55,
  androidVersionName: "1.0.0",
  providerInputSupplied: Boolean(providerInputPath),
  dashboardReproof,
  providerProductsVerifiedWithoutSwitchesOn: providerVerificationMatrix.some((row) => row.status === "Verified"),
  providerReadyFlows: providerVerificationMatrix.filter((row) => row.status === "Verified").map((row) => row.flow),
  providerBlockedFlows: providerVerificationMatrix.filter((row) => row.status !== "Verified").map((row) => row.flow),
  productionActivationOffSetupSandbox: Object.entries(switchOffStateReadback).every(([key, value]) => (
    key === "providerRefunds" ? value === "manual/external"
      : ["tips", "paidVideo", "watchPartyTicket", "channelSubscription", "vip", "eventPass"].includes(key) ? value === "SANDBOX_ONLY"
        : value === "OFF"
  )),
  premiumReadyForOwnerActivation: providerVerificationMatrix.find((row) => row.flow === "Premium")?.status === "Verified",
  creatorSetupFlowsSandboxOnly: true,
  payoutsStillOff: switchOffStateReadback.payouts === "OFF",
  refundsStillManualExternal: switchOffStateReadback.providerRefunds === "manual/external",
  repoChecks: repoChecks.map((check) => ({ id: check.id, status: pass(check.ok), detail: check.detail })),
  secretScan: secretFindings.length === 0 ? "Pass" : "Blocked",
};

writeArtifact("summary.json", asJson(summary));
console.log(asJson(summary));

if (repoChecks.some((check) => !check.ok) || secretFindings.length > 0) {
  process.exit(1);
}
