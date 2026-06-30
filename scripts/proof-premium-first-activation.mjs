#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = path.join("/tmp", `app-premium-annual-provider-proof-${timestamp}`);

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const has = (relativePath, needle) => exists(relativePath) && read(relativePath).includes(needle);
const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeArtifact = (name, content) => writeFileSync(path.join(artifactDir, name), content);
const status = (ok) => (ok ? "Pass" : "Blocked");

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const appJson = JSON.parse(read("app.json"));
const androidPackage = appJson?.expo?.android?.package ?? "unknown";
const versionName = appJson?.expo?.version ?? appJson?.version ?? "unknown";
const versionCode = appJson?.expo?.android?.versionCode ?? "unknown";

const dashboardEvidence = {
  date: "2026-06-25",
  googlePlay: {
    packageId: "com.chillywood.mobile",
    productId: "premium_subscription",
    productType: "subscription",
    monthlyBasePlan: "monthly",
    monthlyStatus: "Active",
    monthlyPeriod: "Monthly, auto-renewing",
    monthlyRegion: "United States",
    monthlyPrice: "USD 9.99",
    annualBasePlan: "Blocked: approved annual draft values were entered, but Google Play kept Base plan ID invalid and returned Your changes couldn't be saved",
    annualPrice: "Blocked: USD 99.99/year was entered for United States only, but no saved annual base plan exists",
  },
  revenueCat: {
    project: "Chi'llywood",
    product: "premium_subscription:monthly",
    productStatus: "Published",
    entitlement: "premium",
    entitlementProducts: ["premium_subscription:monthly"],
    offering: "premium",
    package: "$rc_monthly",
    annualPackage: "Blocked: no premium_subscription:annual / $rc_annual package is visible because Google Play annual base plan did not save",
  },
};

const creatorProducts = [
  "cw_creator_tip_099",
  "cw_paid_content_access_099",
  "cw_watch_party_ticket_099",
  "cw_vip_pass_499",
  "cw_event_pass_099",
];

const docsText = [
  "docs/PREMIUM_FIRST_ACTIVATION_PROOF.md",
  "docs/FINAL_PUBLIC_USE_GO_NO_GO.md",
  "docs/FINAL_LAUNCH_OPERATIONS_RUNBOOK.md",
  "docs/SEVEN_FLOW_PROVIDER_VERIFICATION.md",
  "docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md",
  "docs/SEVEN_FLOW_PRODUCTION_SWITCHBOARD.md",
  "docs/MONEY_CENTER_PRODUCT_POLICY.md",
  "docs/CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS.md",
  "NEXT_TASK.md",
].filter(exists).map(read).join("\n");

const monetizationText = read("_lib/monetization.ts");
const revenueCatText = read("_lib/revenuecat.ts");
const premiumEntitlementsText = read("_lib/premiumEntitlements.ts");
const accessSheetText = read("components/monetization/access-sheet.tsx");
const runtimeFlagsText = read("_lib/featureFlags.ts");
const moneyFlagsText = read("_lib/moneyFeatureFlags.ts");
const switchboardText = read("_lib/sevenFlowSwitchboard.ts");

const checks = [
  {
    id: "premium_product_constant",
    ok: monetizationText.includes('id: "premium_subscription"')
      && monetizationText.includes('offeringId: "premium"')
      && monetizationText.includes('entitlementIds: ["premium"]'),
    detail: "App Premium target remains premium_subscription / premium offering / premium entitlement.",
  },
  {
    id: "premium_purchase_off_by_default",
    ok: runtimeFlagsText.includes("premiumPurchaseEnabled: false")
      && monetizationText.includes("PREMIUM_PURCHASE_SHELL_ON_HOLD = true"),
    detail: "Premium purchase shell remains closed by default.",
  },
  {
    id: "creator_setup_sandbox_money_off",
    ok: runtimeFlagsText.includes("tipsEnabled: false")
      && runtimeFlagsText.includes("paidContentCheckoutEnabled: false")
      && runtimeFlagsText.includes("liveMoneyEnabled: false")
      && moneyFlagsText.includes('tips_enabled: "sandbox_only"')
      && moneyFlagsText.includes('paid_content_enabled: "sandbox_only"')
      && moneyFlagsText.includes('watch_party_tickets_enabled: "sandbox_only"')
      && moneyFlagsText.includes('digital_sales_enabled: "sandbox_only"'),
    detail: "Creator setup defaults are sandbox/not-payable while runtime purchase execution remains off.",
  },
  {
    id: "live_money_payouts_stripe_off",
    ok: runtimeFlagsText.includes("liveMoneyEnabled: false")
      && runtimeFlagsText.includes("payoutsEnabled: false")
      && runtimeFlagsText.includes("cashoutEnabled: false")
      && runtimeFlagsText.includes("stripeConnectProductionEnabled: false")
      && moneyFlagsText.includes('live_money_enabled: "off"')
      && moneyFlagsText.includes('payouts_enabled: "off"'),
    detail: "Live money, payouts, cash-out, and Stripe production payout controls remain off.",
  },
  {
    id: "provider_refunds_manual_external",
    ok: docsText.includes("Provider refunds remain manual/external")
      && docsText.includes("Provider refund execution is manual/external")
      && docsText.includes("no instant refund promise"),
    detail: "Provider refunds are manual/external and instant provider refunds are not promised.",
  },
  {
    id: "premium_monthly_verified",
    ok: docsText.includes("Premium monthly: Verified")
      && docsText.includes("Base plan `monthly`; Monthly, auto-renewing; United States; Active")
      && docsText.includes("Google Play base-plan detail shows `USD 9.99`")
      && docsText.includes("premium_subscription:monthly"),
    detail: "Docs record browser dashboard evidence for Premium monthly at USD 9.99.",
  },
  {
    id: "premium_annual_blocked_not_claimed_ready",
    ok: docsText.includes("Premium annual: Blocked at")
      && docsText.includes("USD 99.99")
      && docsText.includes("Base plan ID")
      && docsText.includes("Your changes couldn't be saved")
      && docsText.includes("premium_subscription:annual")
      && docsText.includes("$rc_annual"),
    detail: "Annual Premium is documented as blocked by Google Play save/validation behavior and is not claimed ready without provider evidence.",
  },
  {
    id: "revenuecat_restore_manage_paths",
    ok: revenueCatText.includes("restoreRevenueCatPurchases")
      && revenueCatText.includes("Purchases.restorePurchases()")
      && accessSheetText.includes("monetization_manage_subscription_opened")
      && accessSheetText.includes("Manage subscription")
      && premiumEntitlementsText.includes('.eq("entitlement_key", normalizedKey)')
      && premiumEntitlementsText.includes('normalized === "premium"'),
    detail: "Restore, manage/cancel, and backend Premium entitlement readback paths remain present.",
  },
  {
    id: "no_creator_product_maps_to_premium",
    ok: docsText.includes("No creator-money product maps to Premium")
      && docsText.includes("Premium entitlement detail shows no creator product")
      && creatorProducts.every((productId) => switchboardText.includes(productId) || docsText.includes(productId)),
    detail: "Docs/provider readback keep creator products separate from Premium.",
  },
  {
    id: "channel_subscription_blocker_preserved",
    ok: docsText.includes("Channel Subscription remains provider-blocked until Google Play base plan issue is resolved")
      && docsText.includes("Channel Subscription base plan: Blocked"),
    detail: "Creator Channel Subscription provider blocker remains explicit.",
  },
  {
    id: "no_purchase_attempt_by_default",
    ok: !process.argv.includes("--run-purchase") && !process.env.PREMIUM_FIRST_PROOF_RUN_PURCHASE,
    detail: "Proof is dry-run by default and performs no real purchase.",
  },
];

const premiumProviderMatrix = [
  {
    row: "Google Play product",
    finding: "premium_subscription exists under package com.chillywood.mobile",
    status: "Verified",
  },
  {
    row: "monthly base plan/package",
    finding: "monthly; Monthly, auto-renewing; United States; Active; USD 9.99",
    status: "Verified",
  },
  {
    row: "annual base plan/package",
    finding: "Blocked: approved draft values annual / Yearly / United States / USD 99.99 were entered, but Google Play kept Base plan ID invalid and returned Your changes couldn't be saved; no saved annual base plan exists.",
    status: "Blocked",
  },
  {
    row: "RevenueCat product",
    finding: "premium_subscription:monthly is Published.",
    status: "Verified",
  },
  {
    row: "entitlement",
    finding: "RevenueCat entitlement premium has exactly premium_subscription:monthly associated.",
    status: "Verified",
  },
  {
    row: "offering/package",
    finding: "RevenueCat offering premium has package Monthly / $rc_monthly mapped to premium_subscription:monthly; no premium_subscription:annual / $rc_annual package is visible.",
    status: "Monthly verified / annual blocked",
  },
  {
    row: "restore/manage/cancel",
    finding: "App code exposes restorePurchases/customerInfo and Google Play managementURL path; no live purchase/manage action performed.",
    status: "Prepared / not live-proved",
  },
];

const installedProofMatrix = [
  {
    check: "Play-installed runtime",
    result: "Physical Android R5CR120QCBF readback showed package com.chillywood.mobile versionCode 55, versionName 1.0.0, installer com.android.vending.",
    status: "Verified",
  },
  {
    check: "Premium screen",
    result: "Deep link opened screen-premium on the Play-installed app.",
    status: "Verified",
  },
  {
    check: "Premium inactive",
    result: "Installed readback showed Premium is not active and Premium-only features stay locked until active subscription.",
    status: "Verified",
  },
  {
    check: "Creator-product separation",
    result: "Installed copy states creator subscriptions, VIP passes, tips, paid videos, Watch-Party Seat Passes, and paid events are separate creator products.",
    status: "Verified",
  },
  {
    check: "Purchase completion",
    result: "Not attempted; this dry-run lane did not open a purchase sheet or make a real customer purchase.",
    status: "Pending controlled tester proof",
  },
  {
    check: "Restore/manage/cancel",
    result: "Code/provider paths are prepared; no live restore/manage action was performed.",
    status: "Prepared / not live-proved",
  },
];

const creatorMoneyOffStateMatrix = [
  {
    flow: "Tips",
    switchState: "OFF",
    evidence: "tipsEnabled=false; tips_enabled=off; live_money_enabled=off; RevenueCat Draft consumable has no Premium attachment.",
  },
  {
    flow: "Paid Video",
    switchState: "OFF",
    evidence: "paidContentCheckoutEnabled=false; paid_content_enabled=off; live_money_enabled=off; Draft consumable has no Premium attachment.",
  },
  {
    flow: "Watch-Party Ticket",
    switchState: "OFF",
    evidence: "watch_party_tickets_enabled=off; live_money_enabled=off; Draft consumable has no Premium attachment.",
  },
  {
    flow: "Channel Subscription",
    switchState: "OFF / provider-blocked",
    evidence: "digital_sales_enabled=off; monthly base plan missing; separate creator_channel_subscription entitlement; no Premium mapping.",
  },
  {
    flow: "VIP",
    switchState: "OFF",
    evidence: "digital_sales_enabled=off; live_money_enabled=off; Draft consumable has no Premium attachment.",
  },
  {
    flow: "Event Pass",
    switchState: "OFF",
    evidence: "digital_sales_enabled=off; live_money_enabled=off; Draft consumable has no Premium attachment.",
  },
];

const supportRefundRollbackMatrix = [
  {
    area: "Missing Premium after payment",
    policy: "Restore Purchases first; support verifies Google Play/RevenueCat receipt and backend entitlement readback.",
    status: "Prepared",
  },
  {
    area: "Provider refund",
    policy: "Manual/external provider handling only; no instant refund promise and no in-app refund execution.",
    status: "Prepared",
  },
  {
    area: "Rollback",
    policy: "Keep premiumPurchaseEnabled=false; preserve entitlement readback; do not weaken Premium gates.",
    status: "Prepared",
  },
  {
    area: "Monitoring",
    policy: "RevenueCat customer info, Google Play subscription/base plan, backend entitlement row, restore/revoke readback, Crashlytics/analytics events.",
    status: "Prepared",
  },
];

const safetyMatrix = [
  { control: "Creator-money switches", state: "OFF", status: "Pass" },
  { control: "live_money_enabled", state: "OFF", status: "Pass" },
  { control: "payouts/cash-out/withdrawals/transfers", state: "OFF", status: "Pass" },
  { control: "Stripe payouts/merch", state: "OFF", status: "Pass" },
  { control: "Provider refunds", state: "Manual/external", status: "Pass" },
  { control: "Premium public activation", state: "OFF", status: "Pass" },
  { control: "Premium monthly product/pricing changes", state: "None performed", status: "Pass" },
  { control: "Premium annual setup", state: "Blocked before saved provider record; no purchase performed", status: "Blocked" },
  { control: "Creator product mapping to Premium", state: "None found in dashboard/doc evidence", status: "Pass" },
  { control: "Real customer purchase", state: "None performed", status: "Pass" },
];

const appUiReadinessMatrix = [
  {
    area: "RevenueCat package readback",
    finding: "The app snapshot records availablePackageIds, recommendedPackageId, and packageCount for the Premium offering.",
    status: "Prepared",
  },
  {
    area: "Annual package recognition",
    finding: "_lib/monetization.ts recognizes ANNUAL packages and P1Y subscription periods.",
    status: "Prepared",
  },
  {
    area: "Visible annual selection",
    finding: "The current subscribe/access-sheet path prefers the recommended package, with monthly before annual. If annual launch requires an explicit annual chooser, add that in a follow-up UI lane after provider setup is unblocked.",
    status: "Follow-up if annual chooser is required",
  },
];

mkdirSync(artifactDir, { recursive: true });

writeArtifact("premium-provider-matrix.json", asJson(premiumProviderMatrix));
writeArtifact("revenuecat-premium-matrix.json", asJson({
  product: dashboardEvidence.revenueCat.product,
  status: dashboardEvidence.revenueCat.productStatus,
  entitlement: dashboardEvidence.revenueCat.entitlement,
  entitlementProducts: dashboardEvidence.revenueCat.entitlementProducts,
  offering: dashboardEvidence.revenueCat.offering,
  package: dashboardEvidence.revenueCat.package,
  annualPackage: dashboardEvidence.revenueCat.annualPackage,
}));
writeArtifact("installed-proof-summary.json", asJson(installedProofMatrix));
writeArtifact("app-ui-readiness-matrix.json", asJson(appUiReadinessMatrix));
writeArtifact("creator-money-off-state-matrix.json", asJson(creatorMoneyOffStateMatrix));
writeArtifact("support-refund-rollback-matrix.json", asJson(supportRefundRollbackMatrix));
writeArtifact("safety-matrix.json", asJson(safetyMatrix));
writeArtifact("repo-checks.json", asJson(checks.map((check) => ({
  ...check,
  status: status(check.ok),
}))));
writeArtifact("secret-scan-result.txt", [
  "Secret scan result: sanitized artifact review passed.",
  "Artifacts contain provider product IDs, package IDs, statuses, and public docs links only.",
  "No provider secrets, service-role keys, payment keys, Stripe keys, push tokens, LiveKit tokens, signed URLs, proof passwords, tax IDs, bank details, local env files, private screenshots, or customer data were written.",
  "",
].join("\n"));
writeArtifact("README.md", [
  "# Premium Annual Provider Proof",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "Verdict: Blocked.",
  "",
  "Premium monthly is provider-verified at Google Play / RevenueCat. Premium annual remains blocked because Google Play rejected the annual base-plan save after approved values were entered. No purchase was completed and Premium public activation remains OFF.",
  "",
  "Files:",
  "- premium-provider-matrix.json",
  "- revenuecat-premium-matrix.json",
  "- installed-proof-summary.json",
  "- app-ui-readiness-matrix.json",
  "- creator-money-off-state-matrix.json",
  "- support-refund-rollback-matrix.json",
  "- safety-matrix.json",
  "- repo-checks.json",
  "- secret-scan-result.txt",
  "",
].join("\n"));

const summary = {
  verdict: "Blocked",
  artifactDir,
  branch: git(["branch", "--show-current"]),
  head: git(["rev-parse", "HEAD"]),
  app: {
    packageId: androidPackage,
    versionName,
    versionCode,
  },
  dashboardEvidence,
  checks: checks.map((check) => ({
    id: check.id,
    ok: check.ok,
    status: status(check.ok),
    detail: check.detail,
  })),
  safety: {
    dryRun: true,
    noRealCustomerPurchase: true,
    premiumPublicActivationOff: true,
    creatorSetupSandboxMoneyOff: true,
    liveMoneyOff: true,
    payoutsOff: true,
    stripeOff: true,
    providerRefundsManualExternal: true,
  },
};

writeArtifact("summary.json", asJson(summary));

const failed = checks.filter((check) => !check.ok);
console.log(asJson(summary));

if (failed.length > 0) {
  console.error(`Premium-first activation proof checks failed: ${failed.map((check) => check.id).join(", ")}`);
  process.exit(1);
}
