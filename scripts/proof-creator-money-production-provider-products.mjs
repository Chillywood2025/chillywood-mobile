#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = path.join("/tmp", `app-creator-money-tax-legal-compliance-proof-${timestamp}`);

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const has = (relativePath, needle) => exists(relativePath) && read(relativePath).includes(needle);
const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeArtifact = (name, content) => writeFileSync(path.join(artifactDir, name), content);
const status = (ok) => (ok ? "Pass" : "Blocked");

const products = [
  {
    flow: "Tips",
    sandboxProductId: "cw_creator_tip_sandbox_099",
    productionProductId: "cw_creator_tip_099",
    productType: "one_time_consumable",
    displayName: "Creator Tip",
    shortDescription: "Send optional support to a creator. Tips do not unlock content.",
    launchPriceUsd: "$0.99",
    launchRegion: "United States only first",
    futureCustomPricing: "Additional tip price products or approved provider-backed price tiers only.",
    switchName: "tipsEnabled",
    moneySwitch: "tips_enabled",
    googlePlayStatus: "Blocked by provider form",
    revenueCatStatus: "Blocked until Google Play product exists",
    accessCreated: "None / contribution receipt only.",
    accessNotCreated: "Premium, content, room, VIP, subscription, event, payout.",
    ownerAction: "Create Google Play one-time product, configure purchase option/pricing/regions, import in RevenueCat, verify no Premium entitlement.",
  },
  {
    flow: "Paid Video",
    sandboxProductId: "cw_paid_content_access_sandbox_099",
    productionProductId: "cw_paid_content_access_099",
    productType: "one_time_consumable",
    displayName: "Paid Video Access",
    shortDescription: "Unlock access to one paid creator video.",
    launchPriceUsd: "$0.99",
    launchRegion: "United States only first",
    futureCustomPricing: "Approved paid-video price tiers mapped to verified provider products only.",
    switchName: "paidVideoEnabled",
    moneySwitch: "paid_content_enabled",
    googlePlayStatus: "Blocked by provider form",
    revenueCatStatus: "Blocked until Google Play product exists",
    accessCreated: "Exact paid video target only.",
    accessNotCreated: "Premium, other videos, rooms, VIP, subscription, event, payout.",
    ownerAction: "Create Google Play one-time product, configure purchase option/pricing/regions, import in RevenueCat, verify no Premium entitlement.",
  },
  {
    flow: "Watch-Party Ticket",
    sandboxProductId: "cw_watch_party_live_ticket_sandbox_099",
    productionProductId: "cw_watch_party_ticket_099",
    productType: "one_time_consumable",
    displayName: "Watch-Party Ticket",
    shortDescription: "Unlock access to one ticketed Watch-Party room.",
    launchPriceUsd: "$0.99",
    launchRegion: "United States only first",
    futureCustomPricing: "Approved ticket price tiers mapped to verified provider products only.",
    switchName: "watchPartyTicketEnabled",
    moneySwitch: "watch_party_tickets_enabled",
    googlePlayStatus: "Blocked by provider form",
    revenueCatStatus: "Blocked until Google Play product exists",
    accessCreated: "Exact room/ticket target only.",
    accessNotCreated: "Premium, other rooms, LiveKit publish/host/mod, VIP, subscription, payout.",
    ownerAction: "Create Google Play one-time product, configure purchase option/pricing/regions, import in RevenueCat, verify no Premium entitlement.",
  },
  {
    flow: "Channel Subscription",
    sandboxProductId: "channel_subscription_sandbox_monthly_499:monthly",
    productionProductId: "cw_channel_subscription_monthly_499",
    productionBasePlanId: "monthly",
    revenueCatProductId: "cw_channel_subscription_monthly_499:monthly",
    productType: "subscription",
    displayName: "Creator Channel Subscription",
    shortDescription: "Monthly access to one creator's subscriber area.",
    launchPriceUsd: "$4.99/month",
    launchRegion: "United States only first",
    futureCustomPricing: "Approved subscription products, base plans, or offers only.",
    switchName: "channelSubscriptionEnabled",
    moneySwitch: "digital_sales_enabled",
    googlePlayStatus: "Created product record; base plan missing",
    revenueCatStatus: "Blocked until Google Play base plan exists",
    accessCreated: "Exact creator Platform subscription only.",
    accessNotCreated: "Premium, VIP, paid videos, rooms, events, other creators, payout.",
    ownerAction: "Create Google Play subscription/base plan, configure pricing/regions, import in RevenueCat, attach only to creator_channel_subscription.",
  },
  {
    flow: "VIP",
    sandboxProductId: "cw_vip_pass_sandbox_499",
    productionProductId: "cw_vip_pass_499",
    productType: "one_time_non_consumable",
    displayName: "Creator VIP Pass",
    shortDescription: "Unlock creator-specific VIP access.",
    launchPriceUsd: "$4.99",
    launchRegion: "United States only first",
    futureCustomPricing: "Approved VIP price tiers mapped to verified provider products only.",
    switchName: "vipEnabled",
    moneySwitch: "digital_sales_enabled",
    googlePlayStatus: "Blocked by provider form",
    revenueCatStatus: "Blocked until Google Play product exists",
    accessCreated: "Exact creator VIP only.",
    accessNotCreated: "Premium, subscription, other creators, paid videos, rooms, events, payout.",
    ownerAction: "Create Google Play one-time product, configure purchase option/pricing/regions, import in RevenueCat, verify no Premium entitlement.",
  },
  {
    flow: "Event Pass",
    sandboxProductId: "cw_event_pass_sandbox_099",
    productionProductId: "cw_event_pass_099",
    productType: "one_time_consumable",
    displayName: "Creator Event Pass",
    shortDescription: "Unlock access to one paid creator event.",
    launchPriceUsd: "$0.99",
    launchRegion: "United States only first",
    futureCustomPricing: "Approved event pass price tiers mapped to verified provider products only.",
    switchName: "eventPassEnabled",
    moneySwitch: "digital_sales_enabled",
    googlePlayStatus: "Blocked by provider form",
    revenueCatStatus: "Blocked until Google Play product exists",
    accessCreated: "Exact event target only.",
    accessNotCreated: "Premium, VIP, subscription, paid videos, rooms, other events, payout.",
    ownerAction: "Create Google Play one-time product, configure purchase option/pricing/regions, import in RevenueCat, verify no Premium entitlement.",
  },
];

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const priorCommitPresent = (() => {
  try {
    return execFileSync("git", ["cat-file", "-t", "cee895e5234b3e7b2a46651365f9361d9ddde868"], { cwd: root, encoding: "utf8" }).trim() === "commit";
  } catch {
    return false;
  }
})();

const docsText = [
  "docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md",
  "docs/CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS.md",
  "docs/SEVEN_FLOW_PROVIDER_VERIFICATION.md",
  "docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md",
  "docs/SEVEN_FLOW_PRODUCTION_SWITCHBOARD.md",
  "docs/FINAL_PUBLIC_USE_GO_NO_GO.md",
  "docs/STRIPE_PAYOUTS_AND_MERCH_PREP.md",
  "NEXT_TASK.md",
].filter(exists).map(read).join("\n");

const switchboardText = read("_lib/sevenFlowSwitchboard.ts");
const moneyFlagsText = read("_lib/moneyFeatureFlags.ts");
const runtimeFlagsText = read("_lib/featureFlags.ts");

const oldToNewProductIdMatrix = products.map((product) => ({
  flow: product.flow,
  oldSandboxId: product.sandboxProductId,
  newProductionId: product.productionProductId,
  productType: product.productType,
  launchDefault: product.productionBasePlanId ? `${product.launchPriceUsd}, base plan ${product.productionBasePlanId}` : product.launchPriceUsd,
  region: product.launchRegion,
  providerStatus: product.googlePlayStatus,
  revenueCatStatus: product.revenueCatStatus,
  activationStatus: "OFF",
}));

const googlePlayProductMatrix = products.map((product) => ({
  flow: product.flow,
  productionProductId: product.productionProductId,
  productType: product.productType,
  displayName: product.displayName,
  shortDescription: product.shortDescription,
  basePlan: product.productionBasePlanId ?? "Not applicable",
  price: product.launchPriceUsd,
  region: product.launchRegion,
  dashboardStatus: product.googlePlayStatus,
  ownerAction: product.ownerAction,
}));

const revenueCatProductMatrix = products.map((product) => ({
  flow: product.flow,
  revenueCatProductId: product.revenueCatProductId ?? product.productionProductId,
  entitlement: product.flow === "Channel Subscription" ? "creator_channel_subscription" : "Not applicable",
  offeringPackage: "Not applicable for current direct product flow unless owner requires one",
  dashboardStatus: product.revenueCatStatus,
  ownerAction: product.ownerAction,
}));

const customPricingPolicyMatrix = products.map((product) => ({
  flow: product.flow,
  launchDefault: product.productionBasePlanId ? `${product.launchPriceUsd}, base plan ${product.productionBasePlanId}` : product.launchPriceUsd,
  futureCustomMethod: product.futureCustomPricing,
  providerBacked: true,
  failClosed: true,
  unsupportedCustomAmounts: "Blocked. The app must not accept arbitrary checkout amounts that do not map to verified Google Play / RevenueCat products, price tiers, base plans, offers, or owner-approved catalog entries.",
  status: "Documented",
}));

const repoConfigMatrix = products.map((product) => ({
  flow: product.flow,
  sandboxIdKnown: switchboardText.includes(product.sandboxProductId),
  productionIdKnown: switchboardText.includes(product.productionProductId) && docsText.includes(product.productionProductId),
  displayNameDocumented: docsText.includes(product.displayName),
  shortDescriptionDocumented: docsText.includes(product.shortDescription),
  launchPriceKnown: switchboardText.includes(product.launchPriceUsd) && docsText.includes(product.launchPriceUsd),
  launchRegionKnown: switchboardText.includes(product.launchRegion) && docsText.includes(product.launchRegion),
  customPricingPolicyKnown: switchboardText.includes("provider_backed_fail_closed") && docsText.includes("Unsupported custom amounts fail closed"),
  activeAppId: "Sandbox ID remains current proof config",
  activationState: "OFF",
}));

const switchOffStateProof = {
  liveMoney: moneyFlagsText.includes('live_money_enabled: "off"') && runtimeFlagsText.includes("liveMoneyEnabled: false") ? "OFF" : "Blocked",
  tips: moneyFlagsText.includes('tips_enabled: "off"') && runtimeFlagsText.includes("tipsEnabled: false") ? "OFF" : "Blocked",
  paidContent: moneyFlagsText.includes('paid_content_enabled: "off"') && runtimeFlagsText.includes("paidContentCheckoutEnabled: false") ? "OFF" : "Blocked",
  watchPartyTickets: moneyFlagsText.includes('watch_party_tickets_enabled: "off"') ? "OFF" : "Blocked",
  digitalSales: moneyFlagsText.includes('digital_sales_enabled: "off"') ? "OFF" : "Blocked",
  premiumPurchase: runtimeFlagsText.includes("premiumPurchaseEnabled: false") ? "OFF" : "Blocked",
  payouts: moneyFlagsText.includes('payouts_enabled: "off"') && runtimeFlagsText.includes("payoutsEnabled: false") ? "OFF" : "Blocked",
  cashout: runtimeFlagsText.includes("cashoutEnabled: false") ? "OFF" : "Blocked",
  refunds: docsText.includes("Provider refunds remain manual/external") || docsText.includes("Provider refunds: Manual/external") ? "manual/external" : "Blocked",
};

const ownerActionList = products.map((product) => ({
  flow: product.flow,
  action: product.ownerAction,
  appSwitchMustRemainOff: true,
}));

const mustStopFieldMatrix = [
  "Unknown tax category",
  "Age/content rating",
  "Country/region beyond United States",
  "Publishing/review/activation control",
  "Bank/tax identity fields",
  "Charity/donation/fundraising classification",
  "Gambling/contest/sweepstakes classification",
  "Medical/financial/legal service classification",
  "Physical goods/external services classification",
  "Subscription grace period, renewal mode, offer, trial, intro price",
  "Required legal disclosure not covered by current policy",
  "Field implying creator payouts/live earnings",
  "Any switch/app activation",
].map((field) => ({ field, codexMustStop: true }));

const proceedFieldMatrix = [
  "owner-approved product IDs",
  "owner-approved public display names",
  "owner-approved short descriptions",
  "owner-approved starting prices",
  "United States only first",
  "existing app/product icon",
  "one-time product type",
  "subscription product type",
  "base plan ID monthly",
  "RevenueCat mapping with no Premium entitlement",
  "docs/proof updates",
].map((field) => ({ field, codexMayProceedWhenSafe: true }));

const taxLegalCompliancePlanSummary = products.map((product) => ({
  flow: product.flow,
  classification: product.flow === "Channel Subscription"
    ? "Recurring digital subscription to one creator's subscriber area."
    : product.flow === "Tips"
      ? "Optional digital creator support; contribution-only."
      : `Digital exact-target access for ${product.flow}.`,
  taxComplianceStance: "Digital app sales through Google Play / RevenueCat; no physical goods, no charity/nonprofit claim, no payout claim.",
  legalDisclosureStance: product.flow === "Channel Subscription"
    ? "$4.99/month, monthly auto-renewing, creator-specific, manage/cancel through Google Play/account subscriptions before activation."
    : "Exact flow scope only; no Premium, payout, physical goods, or broader access promise.",
  ownerStopFields: mustStopFieldMatrix.map((row) => row.field),
  status: "Partial / owner-stop fields remain",
}));

const stripePayoutMerchPrepMatrix = [
  {
    area: "Creator payouts",
    status: "Future separate lane",
    enabled: false,
    actionNeeded: "Owner-approved Stripe Connect production payout lane with live account, KYC/tax, fraud, support, and payout policy proof.",
    safetyNote: "No payout, transfer, withdrawal, cash-out, payout batch, or payable creator balance is enabled by this lane.",
  },
  {
    area: "Stripe Connect/onboarding",
    status: "Sandbox readiness only / production access not used here",
    enabled: false,
    actionNeeded: "Verify production Stripe access and Connect account-controller/capability choices in a separate payout lane.",
    safetyNote: "Current app defaults keep stripeConnectProductionEnabled, payoutsEnabled, cashoutEnabled, and liveMoneyEnabled false.",
  },
  {
    area: "Merch checkout",
    status: "Future physical-merch lane",
    enabled: false,
    actionNeeded: "Owner-approved production merch lane covering Stripe Checkout, fulfillment, returns/refunds, support, Data Safety, and monitoring.",
    safetyNote: "Stripe is not used for Android digital creator-money purchases.",
  },
  {
    area: "Webhooks/secrets",
    status: "No secret exposure",
    enabled: false,
    actionNeeded: "Configure and rotate webhook secrets only through provider/runtime secret stores in future lanes.",
    safetyNote: "No Stripe key, webhook secret, provider secret, or raw provider payload is printed or committed.",
  },
  {
    area: "Refund automation",
    status: "Manual/external",
    enabled: false,
    actionNeeded: "Separate provider-refund lane required before any automation claim.",
    safetyNote: "No Stripe refund, Google Play refund, or RevenueCat refund action is executed by this lane.",
  },
];

const checks = [
  {
    id: "prior_creator_product_prep_commit_present",
    ok: (() => {
      try {
        return execFileSync("git", ["cat-file", "-t", "fcc0a9521cf2f1b00dff41bb4c2efe3193d33fec"], { cwd: root, encoding: "utf8" }).trim() === "commit";
      } catch {
        return false;
      }
    })() || priorCommitPresent,
    detail: "Latest creator-money production provider product prep commit is present.",
  },
  {
    id: "product_plan_doc_present",
    ok: (has("docs/CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS.md", "Creator-money production-labeled products: Partial")
        || has("docs/CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS.md", "Creator-money production-labeled products: Blocked"))
      && has("docs/CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS.md", "Sandbox-labeled IDs remain sandbox/test-only")
      && products.every((product) => has("docs/CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS.md", product.productionProductId)),
    detail: "Production-labeled creator product plan is documented.",
  },
  {
    id: "tax_legal_compliance_plan_present",
    ok: exists("docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md")
      && has("docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md", "Creator-money tax/legal/compliance plan: Partial")
      && has("docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md", "Creator-money product creation: Partial")
      && has("docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md", "Codex must not guess tax/legal/compliance fields")
      && products.every((product) => has("docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md", product.productionProductId)),
    detail: "Tax/legal/compliance provider-product plan exists and covers all six creator-money production IDs.",
  },
  {
    id: "must_stop_fields_documented",
    ok: [
      "Unknown tax category",
      "Age/content rating",
      "Country/region beyond United States",
      "Publishing/review/activation control",
      "Bank/tax identity fields",
      "Charity/donation/fundraising classification",
      "Gambling/contest/sweepstakes classification",
      "Medical/financial/legal service classification",
      "Physical goods/external services classification",
      "Subscription grace period, renewal mode, offer, trial, intro price",
      "Required legal disclosure not covered by current policy",
      "Field implying creator payouts/live earnings",
      "Any switch/app activation",
    ].every((needle) => has("docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md", needle)),
    detail: "Must-stop provider tax/legal/compliance fields are documented.",
  },
  {
    id: "proceed_fields_documented",
    ok: [
      "Product ID",
      "Product name",
      "Short description",
      "Starting prices",
      "United States only first",
      "Existing shared app/product icon",
      "Product type",
      "Base plan ID",
      "RevenueCat mapping",
      "Docs/proof updates",
    ].every((needle) => has("docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md", needle)),
    detail: "Allowed proceed fields are documented with safe conditions.",
  },
  {
    id: "approved_launch_defaults_documented",
    ok: products.every((product) => docsText.includes(product.launchPriceUsd) && switchboardText.includes(product.launchPriceUsd))
      && products.every((product) => docsText.includes(product.displayName) && docsText.includes(product.shortDescription))
      && docsText.includes("United States only first")
      && switchboardText.includes("United States only first")
      && docsText.includes("Approved starting prices are launch defaults, not the only future prices"),
    detail: "Owner-approved display names, descriptions, starting prices, and US-only-first launch region are documented as defaults.",
  },
  {
    id: "custom_pricing_provider_backed_fail_closed",
    ok: exists("docs/CREATOR_MONEY_CUSTOM_PRICING_POLICY.md")
      && has("docs/CREATOR_MONEY_CUSTOM_PRICING_POLICY.md", "Custom pricing is allowed only through verified provider-supported price paths")
      && has("docs/CREATOR_MONEY_CUSTOM_PRICING_POLICY.md", "Unsupported custom amounts fail closed")
      && has("docs/CREATOR_MONEY_CUSTOM_PRICING_POLICY.md", "arbitrary custom amounts")
      && docsText.includes("Future custom pricing requires provider-backed price tiers/products/base plans/offers")
      && switchboardText.includes("provider_backed_fail_closed"),
    detail: "Custom pricing is documented as provider-backed only and fail-closed for unsupported amounts.",
  },
  {
    id: "sandbox_and_production_ids_known",
    ok: products.every((product) => switchboardText.includes(product.sandboxProductId) && switchboardText.includes(product.productionProductId)),
    detail: "Switchboard knows both sandbox and production product IDs.",
  },
  {
    id: "sandbox_ids_not_claimed_real_money",
    ok: docsText.includes("Sandbox-labeled IDs remain sandbox/test-only unless owner explicitly approves otherwise")
      && !docsText.includes("sandbox-labeled IDs are production-ready"),
    detail: "Sandbox IDs are not claimed as future real-money IDs.",
  },
  {
    id: "production_ids_not_marked_verified",
    ok: products.every((product) => docsText.includes(product.productionProductId))
      && docsText.includes("Google Play Console and RevenueCat")
      && docsText.includes("Creator Channel Subscription")
      && docsText.includes("base plan remains missing"),
    detail: "Production IDs are documented with the created subscription record but not falsely marked fully verified.",
  },
  {
    id: "creator_money_switches_off",
    ok: Object.entries(switchOffStateProof).every(([key, value]) => key === "refunds" ? value === "manual/external" : value === "OFF"),
    detail: "Creator-money, live money, Premium purchase, payouts, and cash-out switches remain off.",
  },
  {
    id: "premium_unchanged",
    ok: switchboardText.includes('productId: "premium_subscription"')
      && has("_lib/monetization.ts", "PREMIUM_PURCHASE_SHELL_ON_HOLD = true")
      && runtimeFlagsText.includes("premiumPurchaseEnabled: false"),
    detail: "Premium product and purchase hold remain unchanged.",
  },
  {
    id: "provider_refunds_manual_external",
    ok: docsText.includes("Provider refunds remain manual/external") || docsText.includes("Provider refunds: Manual/external"),
    detail: "Provider refunds remain manual/external.",
  },
  {
    id: "stripe_payout_merch_prep_documented_off",
    ok: exists("docs/STRIPE_PAYOUTS_AND_MERCH_PREP.md")
      && has("docs/STRIPE_PAYOUTS_AND_MERCH_PREP.md", "Stripe payouts remain OFF")
      && has("docs/STRIPE_PAYOUTS_AND_MERCH_PREP.md", "Stripe merch checkout remains OFF")
      && has("docs/STRIPE_PAYOUTS_AND_MERCH_PREP.md", "Stripe is not used for Android digital creator-money purchases")
      && has("_lib/featureFlags.ts", "stripeConnectProductionEnabled: false")
      && has("_lib/featureFlags.ts", "merchStoreEnabled: false"),
    detail: "Stripe payout and physical-merch prep is documented separately and remains off.",
  },
];

mkdirSync(artifactDir, { recursive: true });
const artifactPayloads = {
  "tax-legal-compliance-plan-summary.json": taxLegalCompliancePlanSummary,
  "must-stop-field-matrix.json": mustStopFieldMatrix,
  "proceed-field-matrix.json": proceedFieldMatrix,
  "old-to-new-product-id-matrix.json": oldToNewProductIdMatrix,
  "google-play-product-matrix.json": googlePlayProductMatrix,
  "revenuecat-product-matrix.json": revenueCatProductMatrix,
  "custom-pricing-policy-matrix.json": customPricingPolicyMatrix,
  "repo-config-matrix.json": repoConfigMatrix,
  "stripe-payout-merch-prep-matrix.json": stripePayoutMerchPrepMatrix,
  "owner-action-list.json": ownerActionList,
  "switch-off-state-proof.json": switchOffStateProof,
  "checks.json": checks,
};

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

writeArtifact("README.md", `# Creator-Money Tax Legal Compliance Proof

Generated: ${new Date().toISOString()}

This proof is read-only and dry-run. It made no purchases, no provider refund calls, no payout calls, no transfer calls, no withdrawal calls, no provider dashboard screenshot capture, and printed no provider secrets or private user data.

Verdict: Partial.

Reason: the tax/legal/compliance provider-product plan is documented for owner review. Google Play still has only the creator channel subscription product record cw_channel_subscription_monthly_499; its monthly base plan remains missing, and the one-time products remain blocked by owner-stop provider fields such as age rating and tax/compliance confirmation. RevenueCat import/mapping remains incomplete.

Files:

- tax-legal-compliance-plan-summary.json
- must-stop-field-matrix.json
- proceed-field-matrix.json
- old-to-new-product-id-matrix.json
- google-play-product-matrix.json
- revenuecat-product-matrix.json
- custom-pricing-policy-matrix.json
- repo-config-matrix.json
- stripe-payout-merch-prep-matrix.json
- owner-action-list.json
- switch-off-state-proof.json
- checks.json
- secret-scan-result.json
`);

const summary = {
  verdict: "Partial",
  artifactDir,
  branch: git(["branch", "--show-current"]),
  head: git(["rev-parse", "HEAD"]),
  productionLabeledProductsCreatedOrVerified: false,
  taxLegalCompliancePlanReadyForOwnerReview: checks.find((check) => check.id === "tax_legal_compliance_plan_present")?.ok === true,
  codexMustNotGuessTaxLegalComplianceFields: checks.find((check) => check.id === "must_stop_fields_documented")?.ok === true,
  createdProductRecords: ["Channel Subscription"],
  readyProducts: [],
  missingOrBlockedProducts: products.filter((product) => product.flow !== "Channel Subscription").map((product) => product.flow).concat(["Channel Subscription monthly base plan"]),
  premiumUnchanged: checks.find((check) => check.id === "premium_unchanged")?.ok === true,
  creatorMoneySwitchesOff: checks.find((check) => check.id === "creator_money_switches_off")?.ok === true,
  payoutsOff: switchOffStateProof.payouts === "OFF",
  stripePayoutsOff: true,
  stripeMerchCheckoutOff: true,
  refundsManualExternal: switchOffStateProof.refunds === "manual/external",
  customPricingProviderBackedFailClosed: checks.find((check) => check.id === "custom_pricing_provider_backed_fail_closed")?.ok === true,
  creatorMoneyCanBeActivatedNow: false,
  checks: checks.map((check) => ({ id: check.id, status: status(check.ok), detail: check.detail })),
  secretScan: secretFindings.length === 0 ? "Pass" : "Blocked",
};

writeArtifact("summary.json", asJson(summary));
console.log(asJson(summary));

if (checks.some((check) => !check.ok) || secretFindings.length > 0) {
  process.exit(1);
}
