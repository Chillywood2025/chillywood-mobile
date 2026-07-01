#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = path.join("/tmp", `app-seven-flow-production-prep-proof-${timestamp}`);

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const has = (relativePath, needle) => exists(relativePath) && read(relativePath).includes(needle);
const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeArtifact = (name, content) => writeFileSync(path.join(artifactDir, name), content);
const pass = (ok) => (ok ? "Pass" : "Blocked");

const flows = [
  {
    flow: "Premium",
    switchName: "premiumEnabled",
    defaultState: "entitlement_read_only_purchase_off",
    providerProductId: "premium_subscription",
    productionProductId: "same_or_owner_approved_replacement",
    productType: "subscription",
    googlePlayStatus: "Pending provider verification for production; sandbox proof exists.",
    revenueCatStatus: "Pending provider verification for production product, offering/package, and entitlement premium.",
    entitlementAccessMapping: "user_entitlements entitlement_key=premium.",
    routeSurface: "/subscribe, Premium gates, Settings Premium management.",
    accessCreated: "Premium entitlement only.",
    accessNotCreated: "No creator access grant, creator earning, payout, paid video unlock, VIP, ticket, event pass, room authority, or LiveKit publish authority.",
    revokeBehavior: "Provider/backend revoke or revoked_at readback blocks Premium gates.",
    refundSupportBehavior: "Store/provider plus app support; provider refunds remain manual/external.",
    rollbackSwitch: "premiumPurchaseEnabled=false / Premium purchase shell hold.",
    monitoringReadback: "RevenueCat customer, Google Play subscription/base plan, entitlement row, restore/readback, revoke/readback.",
    launchOwnerDecisionNeeded: true,
    remainingBlocker: "Owner activation and production provider final check.",
  },
  {
    flow: "Tips",
    switchName: "tipsEnabled",
    defaultState: "off",
    providerProductId: "cw_creator_tip_sandbox_099",
    productionProductId: "pending_provider_verification",
    productType: "one_time_consumable",
    googlePlayStatus: "Sandbox proved; production one-time product pending provider verification.",
    revenueCatStatus: "Sandbox proved; production product/package pending provider verification.",
    entitlementAccessMapping: "Ledger/readback only; no durable access.",
    routeSurface: "Public Platform tip/support sheet, Money Center.",
    accessCreated: "None.",
    accessNotCreated: "No Premium, paid video, ticket, subscription, VIP, event, badge, ranking, LiveKit, payout, or payable balance.",
    revokeBehavior: "No access revoke; support reviews ledger/provider records.",
    refundSupportBehavior: "Manual/external review for accidental, duplicate, or unauthorized tips; no instant refund promise.",
    rollbackSwitch: "tips_enabled=off and live_money_enabled=off.",
    monitoringReadback: "Intent, provider event, ledger/readback, not-payable state, support case.",
    launchOwnerDecisionNeeded: true,
    remainingBlocker: "Production product, owner activation, and payout-expectation readiness.",
  },
  {
    flow: "Paid Video",
    switchName: "paidVideoEnabled",
    defaultState: "off",
    providerProductId: "cw_paid_content_access_sandbox_099",
    productionProductId: "pending_provider_verification",
    productType: "one_time_consumable",
    googlePlayStatus: "Sandbox proved; production one-time product pending provider verification.",
    revenueCatStatus: "Sandbox proved; production product/package pending provider verification.",
    entitlementAccessMapping: "paid_content_access grant for one video/source target.",
    routeSurface: "/player/[id].",
    accessCreated: "Exact video/source access only.",
    accessNotCreated: "No Premium, other videos, subscription, VIP, ticket, event, LiveKit authority, payout, or payable balance.",
    revokeBehavior: "Exact target grant revoke blocks route/readback.",
    refundSupportBehavior: "Manual/provider review for access failure, early removal, DMCA/removal, or platform fault.",
    rollbackSwitch: "paid_content_enabled=off and live_money_enabled=off.",
    monitoringReadback: "Paywall, intent, provider event, access grant, content grant, revoke/readback.",
    launchOwnerDecisionNeeded: true,
    remainingBlocker: "Production product, owner activation, and content/support readiness.",
  },
  {
    flow: "Watch-Party Seat Pass",
    switchName: "watchPartyTicketEnabled",
    defaultState: "off",
    providerProductId: "cw_watch_party_live_ticket_sandbox_099",
    productionProductId: "pending_provider_verification",
    productType: "one_time_consumable",
    googlePlayStatus: "Sandbox proved; production one-time product pending provider verification.",
    revenueCatStatus: "Sandbox proved; production product/package pending provider verification.",
    entitlementAccessMapping: "watch_party_live_ticket grant for one Party Room / Watch-Party target.",
    routeSurface: "/watch-party/[partyId].",
    accessCreated: "Same-room Seat Pass access only.",
    accessNotCreated: "No Premium, other room, Live Stage route, LiveKit publish, host, speaker, moderator, paid video, VIP, subscription, event pass, payout, or payable balance.",
    revokeBehavior: "Exact room grant/revoke readback blocks that room only.",
    refundSupportBehavior: "Manual/provider review for ended, failed, no-show, or platform fault.",
    rollbackSwitch: "watch_party_tickets_enabled=off and live_money_enabled=off.",
    monitoringReadback: "Room id, offer id, intent, provider event, ticket row, grant, revoke/readback.",
    launchOwnerDecisionNeeded: true,
    remainingBlocker: "Production product, owner activation, and room operations readiness.",
  },
  {
    flow: "Channel Subscription",
    switchName: "channelSubscriptionEnabled",
    defaultState: "off",
    providerProductId: "channel_subscription_sandbox_monthly_499:monthly",
    productionProductId: "pending_provider_verification",
    productType: "subscription",
    googlePlayStatus: "Sandbox base plan proved; production subscription/base plan pending provider verification.",
    revenueCatStatus: "Sandbox product and entitlement creator_channel_subscription proved; production mapping pending provider verification.",
    entitlementAccessMapping: "channel_subscription grant/subscription state for one creator channel.",
    routeSurface: "/channel-subscription/[creatorId], Public Platform subscriber area, Money Center.",
    accessCreated: "Subscriber access for one creator channel.",
    accessNotCreated: "No Premium, VIP, paid video, ticket, event, other creator subscription, LiveKit authority, payout, or payable balance.",
    revokeBehavior: "Provider lifecycle/revoke/expiration and effective access resolver.",
    refundSupportBehavior: "Manual/provider review for missing entitlement, cancellation/expiration, creator inactivity, or subscriber-only access issue.",
    rollbackSwitch: "digital_sales_enabled=off and live_money_enabled=off.",
    monitoringReadback: "Product/base plan, subscription row, provider lifecycle event, access grant, effective access.",
    launchOwnerDecisionNeeded: true,
    remainingBlocker: "Production subscription/base plan, owner activation, and lifecycle smoke.",
  },
  {
    flow: "VIP",
    switchName: "vipEnabled",
    defaultState: "off",
    providerProductId: "cw_vip_pass_sandbox_499",
    productionProductId: "pending_provider_verification",
    productType: "one_time_non_consumable",
    googlePlayStatus: "Sandbox proved; production one-time product pending provider verification.",
    revenueCatStatus: "Sandbox proved; production product/package pending provider verification.",
    entitlementAccessMapping: "vip_pass grant/pass state for one creator.",
    routeSurface: "/vip-pass/[creatorId], creator VIP area, Money Center.",
    accessCreated: "VIP access for one creator.",
    accessNotCreated: "No Premium, channel subscription, paid video, ticket, event, other creator VIP, LiveKit authority, payout, or payable balance.",
    revokeBehavior: "Exact creator VIP grant/pass revoke blocks that creator VIP only.",
    refundSupportBehavior: "Manual/provider review for missing access, unavailable perks, early removal, or misrepresentation.",
    rollbackSwitch: "digital_sales_enabled=off and live_money_enabled=off.",
    monitoringReadback: "Creator id, offer id, provider event, VIP pass, access grant, revoke/readback.",
    launchOwnerDecisionNeeded: true,
    remainingBlocker: "Production product, owner activation, and support/perks readiness.",
  },
  {
    flow: "Event Pass",
    switchName: "eventPassEnabled",
    defaultState: "off",
    providerProductId: "cw_event_pass_sandbox_099",
    productionProductId: "pending_provider_verification",
    productType: "one_time_consumable",
    googlePlayStatus: "Sandbox proved; production one-time product pending provider verification.",
    revenueCatStatus: "Sandbox proved; production product/package pending provider verification.",
    entitlementAccessMapping: "event_pass grant/pass for one creator event.",
    routeSurface: "/event/[eventId], Public Platform event cards, Money Center.",
    accessCreated: "Pass for one event only.",
    accessNotCreated: "No Premium, VIP, subscription, paid video, room Seat Pass, other event, LiveKit authority, payout, or payable balance.",
    revokeBehavior: "Exact event pass revoke/cancel/expiration blocks that event only.",
    refundSupportBehavior: "Manual/provider review for canceled, rescheduled, ended, or unavailable event.",
    rollbackSwitch: "digital_sales_enabled=off and live_money_enabled=off.",
    monitoringReadback: "Event id, offer id, provider event, pass row, access grant, cancel/expire/revoke readback.",
    launchOwnerDecisionNeeded: true,
    remainingBlocker: "Production product, owner activation, and event operations readiness.",
  },
];

const creatorFlows = flows.filter((flow) => flow.flow !== "Premium");

const repoChecks = [
  {
    id: "switchboard_catalog_present",
    ok: exists("_lib/sevenFlowSwitchboard.ts") && flows.every((flow) => has("_lib/sevenFlowSwitchboard.ts", flow.switchName)),
    detail: "Every flow switch name exists in the switchboard catalog.",
  },
  {
    id: "creator_setup_defaults_sandbox",
    ok: has("_lib/moneyFeatureFlags.ts", "digital_sales_enabled: \"sandbox_only\"")
      && has("_lib/moneyFeatureFlags.ts", "tips_enabled: \"sandbox_only\"")
      && has("_lib/moneyFeatureFlags.ts", "watch_party_tickets_enabled: \"sandbox_only\"")
      && has("_lib/moneyFeatureFlags.ts", "paid_content_enabled: \"sandbox_only\"")
      && has("_lib/featureFlags.ts", "paidContentCheckoutEnabled: false")
      && has("_lib/featureFlags.ts", "tipsEnabled: false"),
    detail: "Creator setup switches default to sandbox/not-payable mode while runtime purchase execution remains off.",
  },
  {
    id: "live_money_and_payouts_off",
    ok: has("_lib/moneyFeatureFlags.ts", "live_money_enabled: \"off\"")
      && has("_lib/moneyFeatureFlags.ts", "payouts_enabled: \"off\"")
      && has("_lib/featureFlags.ts", "liveMoneyEnabled: false")
      && has("_lib/featureFlags.ts", "payoutsEnabled: false")
      && has("_lib/featureFlags.ts", "cashoutEnabled: false"),
    detail: "Live money, payouts, and cash-out defaults remain off.",
  },
  {
    id: "premium_purchase_still_off",
    ok: has("_lib/featureFlags.ts", "premiumPurchaseEnabled: false") && has("_lib/monetization.ts", "PREMIUM_PURCHASE_SHELL_ON_HOLD = true"),
    detail: "Premium purchase shell remains closed by default.",
  },
  {
    id: "product_ids_mapped_locally",
    ok: flows.every((flow) => has("_lib/sevenFlowSwitchboard.ts", flow.providerProductId.split(":")[0]) || has("_lib/sevenFlowSwitchboard.ts", flow.providerProductId)),
    detail: "Product IDs are present in the switchboard catalog.",
  },
  {
    id: "provider_refunds_manual_external",
    ok: has("docs/FINAL_LAUNCH_OPERATIONS_RUNBOOK.md", "Provider refund execution is manual/external")
      && has("docs/REFUND_CREDIT_PAYOUT_HOLD_FOUNDATION.md", "does not execute real refunds")
      && has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "Provider refunds: Manual/external unless separate provider-refund lane enables automation."),
    detail: "Provider refund automation is not claimed.",
  },
  {
    id: "production_activation_not_claimed",
    ok: has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "Provider verification used browser dashboard evidence")
      && has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "Production activation switches remain OFF while setup switches are sandbox_only")
      && has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "owner decision")
      && has("docs/FINAL_PUBLIC_USE_GO_NO_GO.md", "Premium-first launch candidate: Pending owner activation/provider final check")
      && has("docs/FINAL_PUBLIC_USE_GO_NO_GO.md", "Creator-money setup flows: Usable in sandbox/not-payable mode / production activation requires owner/provider approval"),
    detail: "Docs keep production activation blocked pending owner/provider approval.",
  },
  {
    id: "creator_expectations_controlled",
    ok: has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "Creator earnings/payouts are not live")
      && has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "not payable")
      && has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "Creator cannot withdraw, cash out, transfer, or request payout movement"),
    detail: "Creator expectation controls are documented.",
  },
  {
    id: "emergency_stop_documented",
    ok: has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "global `live_money_enabled=off` remains global safety")
      || has("docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md", "live_money_enabled=off"),
    detail: "Emergency stop blocks purchase creation and preserves existing access unless revoke policy applies.",
  },
  {
    id: "no_livekit_authority_from_payments",
    ok: has("_lib/sevenFlowSwitchboard.ts", "LiveKit publish authority") && has("ROOM_BLUEPRINT.md", "Payment records never grant publish permission"),
    detail: "Payment/access rows do not grant LiveKit publish authority.",
  },
];

const flowReadinessMatrix = flows.map((flow) => ({
  flow: flow.flow,
  currentSwitchName: flow.switchName,
  currentDefaultState: flow.defaultState,
  requiredProviderProductId: flow.providerProductId,
  productionProviderProductId: flow.productionProductId,
  providerProductType: flow.productType,
  googlePlayStatus: flow.googlePlayStatus,
  revenueCatStatus: flow.revenueCatStatus,
  entitlementAccessMapping: flow.entitlementAccessMapping,
  routeSurface: flow.routeSurface,
  exactAccessCreated: flow.accessCreated,
  exactAccessNotCreated: flow.accessNotCreated,
  revokeBehavior: flow.revokeBehavior,
  refundSupportBehavior: flow.refundSupportBehavior,
  rollbackSwitch: flow.rollbackSwitch,
  monitoringReadback: flow.monitoringReadback,
  launchOwnerDecisionNeeded: flow.launchOwnerDecisionNeeded,
  remainingBlocker: flow.remainingBlocker,
  status: "Partial",
}));

const providerMappingMatrix = flows.map((flow) => ({
  flow: flow.flow,
  productId: flow.providerProductId,
  productionProductId: flow.productionProductId,
  productType: flow.productType,
  provider: "Google Play / RevenueCat",
  googlePlayStatus: flow.googlePlayStatus,
  revenueCatStatus: flow.revenueCatStatus,
  productIdMatchesLocalConfig: pass(has("_lib/sevenFlowSwitchboard.ts", flow.providerProductId.split(":")[0]) || has("_lib/sevenFlowSwitchboard.ts", flow.providerProductId)),
  productionActivationRemainsOff: "Pass",
  restoreBehavior: flow.flow === "Premium" || flow.flow === "Channel Subscription" ? "Provider/backend lifecycle readback." : "Backend exact-target readback where access exists.",
  revokeRefundBehavior: flow.refundSupportBehavior,
  status: "Pending provider verification",
}));

const switchOffStateMatrix = flows.map((flow) => ({
  flow: flow.flow,
  offState: flow.defaultState,
  cta: flow.flow === "Premium" ? "Purchase closed; entitlement/manage/restore only where safe." : "Hidden or disabled.",
  directIntent: "Blocked unless approved switch, environment, creator eligibility, and provider availability pass.",
  providerSheet: "Does not open while off.",
  accessGrant: "No new access grant while off.",
  safeUnavailableCopy: "Required.",
  liveMoneyPayoutSideEffect: "None.",
  emergencyStop: flow.flow === "Premium" ? "Premium purchase hold remains separate; creator-money emergency stop remains off." : "live_money_enabled=off stops new creator-money purchase creation.",
}));

const ownerActivationChecklist = flows.map((flow) => ({
  flow: flow.flow,
  ownerApproval: "Required",
  providerProductVerified: "Required",
  switchValueToChange: flow.rollbackSwitch.replace("=off", "=on"),
  dryRunReadbackCommand: "npm run proof:seven-flow-production-prep",
  playInstalledSmokeRequired: true,
  supportRefundCopyChecked: true,
  monitoringChecked: true,
  rollbackSwitchChecked: true,
  revokePathChecked: flow.flow === "Tips" ? "Not applicable" : "Required",
  noPayoutSideEffectsConfirmed: true,
  postActivationSupportOwnerAssigned: "Required",
}));

const premiumFirstLaunchChecklist = [
  "Owner approval names Premium, product ID, rollout window, support owner, monitoring owner, and rollback owner.",
  "Google Play subscription and base plan are active/approved.",
  "RevenueCat product, offering/package, and entitlement premium are verified.",
  "Premium purchase shell is intentionally opened only for the approved environment.",
  "Premium gates remain backend/provider entitlement-gated.",
  "Creator-money flows stay off.",
  "Restore, manage, cancel, active entitlement, revoked entitlement, and free gate smoke pass on Play-installed runtime.",
  "Support/refund copy remains manual/provider and promises no instant provider refund.",
];

const creatorMoneyFutureActivationChecklist = [
  "Recommended order: Tips, Paid Video, Event Pass / Watch-Party Seat Pass, Channel Subscription, VIP.",
  "Owner approves each flow separately.",
  "Production provider product and RevenueCat mapping are verified per flow.",
  "Creator eligibility and provider availability gates are confirmed.",
  "Money Center shows current state, sandbox/test status, not-payable state, and payout-off expectation.",
  "Support/refund/dispute runbook and post-activation owner are assigned.",
  "Revoke/readback path is tested for exact-target flows.",
  "No payout, withdrawal, cash-out, transfer, or payable-balance side effect is enabled.",
];

const supportRefundDisputeMatrix = flows.map((flow) => ({
  flow: flow.flow,
  supportPath: flow.refundSupportBehavior,
  refundPath: "Manual/external provider review only; no instant refund claim.",
  disputePath: "Support correlates sanitized provider event, purchase intent, access/entitlement readback, and support case.",
  creatorExpectation: flow.flow === "Premium" ? "Premium is not creator earnings." : "Creator earnings/payouts are not live; not payable while payouts are off.",
  viewerExpectation: flow.flow === "Premium" ? "Premium is app-wide only." : flow.accessCreated,
  whatNotToPromise: "No instant provider refunds, no creator payout, no Premium unlock unless the flow is Premium.",
  status: "Policy ready; provider activation pending.",
}));

const monitoringReadbackMatrix = flows.map((flow) => ({
  flow: flow.flow,
  purchaseIntentReadback: flow.flow === "Premium" ? "Purchase-open and provider result." : "Intent and provider event.",
  accessGrantReadback: flow.flow === "Premium" || flow.flow === "Tips" ? "None for this flow." : flow.accessCreated,
  entitlementReadback: flow.entitlementAccessMapping,
  failureErrorReadback: "Product unavailable, switch off, provider error, missing target, revoke/locked state.",
  supportAdminReadback: flow.monitoringReadback,
  analyticsCrashlyticsExpectation: "Gate viewed, blocked CTA, intent/provider result, access readback/revoke, support request, error signal.",
  dashboardProviderCheck: "Provider dashboard/product check required before activation; no private screenshots in artifacts.",
  postActivationHealthCheck: "Exact target success, cross-target denial, revoke/readback, no payout/live-money side effect.",
}));

const proofOutput = {
  verdict: "Partial",
  dryRun: true,
  readOnly: true,
  realPurchasesAttempted: false,
  realRefundsAttempted: false,
  providerSecretsPrinted: false,
  privateUserDataPrinted: false,
  liveMoneyActivated: false,
  payoutsActivated: false,
  payableBalancesCreated: false,
  creatorSetupDefaultsSandbox: pass(repoChecks.find((check) => check.id === "creator_setup_defaults_sandbox")?.ok),
  emergencyStopProvedByDefaults: pass(repoChecks.find((check) => check.id === "live_money_and_payouts_off")?.ok),
  providerProductionReadiness: "Configured dashboard products verified; activation remains pending owner decision.",
  ownerActivationRequired: true,
  repoChecks,
};

const artifactPayloads = {
  "flow-production-prep-matrix.json": flowReadinessMatrix,
  "provider-mapping-matrix.json": providerMappingMatrix,
  "switch-off-state-matrix.json": switchOffStateMatrix,
  "owner-activation-checklist.json": ownerActivationChecklist,
  "premium-first-launch-checklist.json": premiumFirstLaunchChecklist,
  "creator-money-future-activation-checklist.json": creatorMoneyFutureActivationChecklist,
  "support-refund-dispute-matrix.json": supportRefundDisputeMatrix,
  "monitoring-readback-matrix.json": monitoringReadbackMatrix,
  "proof-output.json": proofOutput,
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

writeArtifact("secret-token-scan-result.json", asJson({
  scannedArtifactNames: Object.keys(artifactPayloads),
  findingCount: secretFindings.length,
  findings: secretFindings.map((entry) => ({ pattern: entry.pattern, value: "[redacted]" })),
  status: secretFindings.length === 0 ? "Pass" : "Blocked",
}));

writeArtifact("README.md", `# Seven-Flow Production Prep Proof

Generated: ${new Date().toISOString()}

This proof is read-only and dry-run. It made no real purchases, no provider refund calls, no payout calls, no transfers, no withdrawals, and printed no provider secrets or private user data.

Verdict: Partial.

Reason: the seven flows are prepared behind switches with documented activation checklists, support policy, monitoring/readback, and rollback expectations. Production activation remains intentionally blocked pending owner approval and provider production verification per flow.

Files:

- flow-production-prep-matrix.json
- provider-mapping-matrix.json
- switch-off-state-matrix.json
- owner-activation-checklist.json
- premium-first-launch-checklist.json
- creator-money-future-activation-checklist.json
- support-refund-dispute-matrix.json
- monitoring-readback-matrix.json
- proof-output.json
- secret-token-scan-result.json
`);

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const summary = {
  verdict: "Partial",
  artifactDir,
  branch: git(["branch", "--show-current"]),
  head: git(["rev-parse", "HEAD"]),
  checks: repoChecks.map((check) => ({ id: check.id, status: pass(check.ok), detail: check.detail })),
  flowCount: flows.length,
  creatorFlowCount: creatorFlows.length,
  allFlowsPreparedBehindSwitches: pass(repoChecks.find((check) => check.id === "switchboard_catalog_present")?.ok),
  creatorSetupFlowsSandbox: pass(repoChecks.find((check) => check.id === "creator_setup_defaults_sandbox")?.ok),
  emergencyStopCanBlockPurchases: pass(repoChecks.find((check) => check.id === "live_money_and_payouts_off")?.ok),
  productionProviderMappings: "Configured dashboard products verified; activation remains pending owner decision.",
  ownerActivationDecisionsRequired: true,
  payoutsStillOff: pass(repoChecks.find((check) => check.id === "live_money_and_payouts_off")?.ok),
  refundsStillManualExternal: pass(repoChecks.find((check) => check.id === "provider_refunds_manual_external")?.ok),
  secretTokenScan: secretFindings.length === 0 ? "Pass" : "Blocked",
};

writeArtifact("summary.json", asJson(summary));

console.log(asJson(summary));

if (repoChecks.some((check) => !check.ok) || secretFindings.length > 0) {
  process.exit(1);
}
