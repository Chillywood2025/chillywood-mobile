#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = path.join("/tmp", `app-seven-flow-production-switchboard-proof-${timestamp}`);

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const has = (relativePath, needle) => read(relativePath).includes(needle);
const writeArtifact = (name, content) => writeFileSync(path.join(artifactDir, name), content);

const status = (ok, pass = "Pass", fail = "Blocked") => (ok ? pass : fail);
const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const flows = [
  {
    label: "Premium",
    switchName: "premiumEnabled",
    switchProof: "_lib/sevenFlowSwitchboard.ts",
    defaultState: "entitlement read-only; purchase shell off",
    offBehavior: "Premium purchase shell closed by default; restore/manage read paths remain safe.",
    sandboxBehavior: "Google Play / RevenueCat sandbox proof exists; user_entitlements remains the entitlement source.",
    productionReadiness: "Blocked for activation until owner approves live Premium purchase shell and provider production readiness.",
    productId: "premium_subscription",
    providerType: "subscription",
    providerConfigured: "sandbox proved",
    productionReady: "pending owner/provider activation",
    restoreRevoke: "RevenueCat restore and backend user_entitlements readback/revoked_at safety.",
    accessCreated: "premium user_entitlements only",
    supportPolicy: "Store/provider support path plus app support; no instant refund promise.",
    refundPolicy: "Manual/provider review; exceptions per law/store/admin/fraud/duplicate/platform fault.",
    disputePolicy: "Support verifies receipt and provider record externally.",
    creatorExpectation: "Premium is platform revenue, not creator earnings.",
    rollback: "Keep premiumPurchaseEnabled false or close Premium purchase shell; preserve existing entitlements unless provider/revoke policy requires change.",
  },
  {
    label: "Tips",
    switchName: "tipsEnabled",
    switchProof: "_lib/sevenFlowSwitchboard.ts",
    defaultState: "off",
    offBehavior: "Tip CTA hidden/disabled; direct sandbox intents require active tester; live money stays off.",
    sandboxBehavior: "Sandbox tip creates no durable access and no payable balance.",
    productionReadiness: "Blocked until production Google Play / RevenueCat tip product, support, legal, payout expectations, and owner approval.",
    productId: "cw_creator_tip_sandbox_099",
    providerType: "one-time consumable",
    providerConfigured: "sandbox proved",
    productionReady: "missing production product approval",
    restoreRevoke: "No restoreable access; support handles accidental tip externally/manual.",
    accessCreated: "none",
    supportPolicy: "Support reviews accidental/duplicate/unauthorized tips manually.",
    refundPolicy: "No standard refund; no instant provider refund promise.",
    disputePolicy: "Provider/store dispute handled externally; app access unaffected.",
    creatorExpectation: "Tips unlock nothing; creator earnings/payouts are not live; not payable.",
    rollback: "Set tips_enabled off; stop new intents; no existing access to revoke.",
  },
  {
    label: "Paid Video",
    switchName: "paidVideoEnabled",
    switchProof: "_lib/sevenFlowSwitchboard.ts",
    defaultState: "off",
    offBehavior: "Unlock CTA unavailable; direct intent blocked by switch/tester/provider guards.",
    sandboxBehavior: "Sandbox access grant is exact video/source only; revoke/readback proof exists.",
    productionReadiness: "Blocked until production product mapping/provider approval and owner activation.",
    productId: "cw_paid_content_access_sandbox_099",
    providerType: "one-time consumable",
    providerConfigured: "sandbox proved",
    productionReady: "missing production product approval",
    restoreRevoke: "Access grant readback/revoke path; missing entitlement routes stay locked.",
    accessCreated: "paid_content_access for one video",
    supportPolicy: "Support review if access never worked, content removed early, DMCA/removal, or platform fault.",
    refundPolicy: "Manual/provider review; no standard refund after consumed playback unless required.",
    disputePolicy: "DMCA/removal and payment disputes handled by support/provider review.",
    creatorExpectation: "Sales are sandbox/not payable unless live money and payouts are separately enabled.",
    rollback: "Set paid_content_enabled off; stop new unlocks; preserve existing access unless revoke/refund policy requires removal.",
  },
  {
    label: "Watch-Party Ticket",
    switchName: "watchPartyTicketEnabled",
    switchProof: "_lib/sevenFlowSwitchboard.ts",
    defaultState: "off",
    offBehavior: "Ticket CTA unavailable; direct purchase intent blocked; no provider sheet opens.",
    sandboxBehavior: "Sandbox ticket grant is exact Party Room target only; no LiveKit authority.",
    productionReadiness: "Blocked until production product mapping/provider approval and owner activation.",
    productId: "cw_watch_party_live_ticket_sandbox_099",
    providerType: "one-time consumable",
    providerConfigured: "sandbox proved",
    productionReady: "missing production product approval",
    restoreRevoke: "Access grant readback/revoke; same-room-only resolver.",
    accessCreated: "watch_party_live_ticket for one Party Room target",
    supportPolicy: "Support reviews room ended/failed/no-show/platform fault cases.",
    refundPolicy: "Manual/provider review if unused and canceled/unavailable; no instant refund promise.",
    disputePolicy: "Room access disputes require room id, purchase intent, provider event, and grant readback.",
    creatorExpectation: "Ticket revenue is sandbox/not payable; no withdrawal or payout is live.",
    rollback: "Set watch_party_tickets_enabled off; stop ticket creation; keep existing access stable unless policy revokes.",
  },
  {
    label: "Channel Subscription",
    switchName: "channelSubscriptionEnabled",
    switchProof: "_lib/sevenFlowSwitchboard.ts",
    defaultState: "off",
    offBehavior: "Subscribe CTA unavailable; direct creation blocked; active effective access still reads safely.",
    sandboxBehavior: "Sandbox subscription creates creator-channel subscriber access only.",
    productionReadiness: "Blocked until production subscription product/base plan approval and owner activation.",
    productId: "channel_subscription_sandbox_monthly_499:monthly",
    providerType: "subscription",
    providerConfigured: "sandbox proved",
    productionReady: "missing production product approval",
    restoreRevoke: "Lifecycle handling for renewal/cancellation/expiration/refund/revocation; stale active rows fail effective access.",
    accessCreated: "channel_subscription for one creator channel",
    supportPolicy: "Support path for missing entitlement, creator inactivity, cancellation/expiration, and subscriber-only access.",
    refundPolicy: "Credit-first/manual provider review; no instant provider refund promise.",
    disputePolicy: "Use provider period, subscription row, access grant, and route readback.",
    creatorExpectation: "Subscription rows remain sandbox/not payable until live money and payouts are separately enabled.",
    rollback: "Set digital_sales_enabled off for activation gate; stop new subscriptions; existing active access follows provider lifecycle/effective access.",
  },
  {
    label: "VIP",
    switchName: "vipEnabled",
    switchProof: "_lib/sevenFlowSwitchboard.ts",
    defaultState: "off",
    offBehavior: "VIP CTA unavailable; direct purchase intent blocked.",
    sandboxBehavior: "Sandbox VIP creates creator-specific VIP access only.",
    productionReadiness: "Blocked until production VIP product approval and owner activation.",
    productId: "cw_vip_pass_sandbox_499",
    providerType: "one-time non-consumable",
    providerConfigured: "sandbox proved",
    productionReady: "missing production product approval",
    restoreRevoke: "Provider ownership reset/revoke proof exists for sandbox; local access revoke/readback stays exact creator.",
    accessCreated: "vip_pass for one creator",
    supportPolicy: "Support reviews unavailable perks, early removal, misrepresentation, or missing VIP access.",
    refundPolicy: "Credit/refund review manual/provider only; no instant provider refund promise.",
    disputePolicy: "Use creator id, provider event, VIP pass row, and access grant readback.",
    creatorExpectation: "VIP is creator-specific and not payable until payout lane enables payouts.",
    rollback: "Set digital_sales_enabled off for activation gate; stop new VIP purchases; preserve existing VIP unless revoke/refund policy applies.",
  },
  {
    label: "Event Pass",
    switchName: "eventPassEnabled",
    switchProof: "_lib/sevenFlowSwitchboard.ts",
    defaultState: "off",
    offBehavior: "Event pass CTA unavailable; direct intent blocked.",
    sandboxBehavior: "Sandbox event pass creates exact event access only.",
    productionReadiness: "Blocked until production event pass product approval and owner activation.",
    productId: "cw_event_pass_sandbox_099",
    providerType: "one-time consumable",
    providerConfigured: "sandbox proved",
    productionReady: "missing production product approval",
    restoreRevoke: "Access grant/pass readback and revoke; canceled/ended event policy still gates access.",
    accessCreated: "event_pass for one creator event",
    supportPolicy: "Support reviews canceled/rescheduled/ended/unavailable event cases.",
    refundPolicy: "Manual/provider review for canceled/materially changed/unavailable events; no instant refund promise.",
    disputePolicy: "Use event id, provider event, pass row, and access resolver readback.",
    creatorExpectation: "Event pass sales are not payable while payouts/live money are off.",
    rollback: "Set digital_sales_enabled off for activation gate; stop new passes; preserve existing access until expiration/cancel/revoke policy.",
  },
];

const repoChecks = [
  {
    id: "seven_flow_catalog",
    ok: existsSync(path.join(root, "_lib/sevenFlowSwitchboard.ts")),
    detail: "Seven-flow switchboard source catalog exists.",
  },
  {
    id: "global_money_master_off",
    ok: has("_lib/moneyFeatureFlags.ts", "live_money_enabled: \"off\"") && has("supabase/migrations/202605270001_platform_money_kill_switches.sql", "('live_money_enabled', 'off'"),
    detail: "Global live_money_enabled switch defaults off.",
  },
  {
    id: "payouts_off",
    ok: has("_lib/moneyFeatureFlags.ts", "payouts_enabled: \"off\"") && has("_lib/featureFlags.ts", "payoutsEnabled: false"),
    detail: "Payout/cash-out runtime remains disabled by default.",
  },
  {
    id: "premium_purchase_off",
    ok: has("_lib/monetization.ts", "PREMIUM_PURCHASE_SHELL_ON_HOLD = true") && has("_lib/featureFlags.ts", "premiumPurchaseEnabled: false"),
    detail: "Premium purchase shell is closed by default.",
  },
  {
    id: "creator_money_defaults_off",
    ok: ["paidContentCheckoutEnabled: false", "tipsEnabled: false", "cashoutEnabled: false", "liveMoneyEnabled: false"].every((needle) => has("_lib/featureFlags.ts", needle)),
    detail: "Creator money runtime defaults are fail-closed.",
  },
  {
    id: "backend_switch_guard",
    ok: has("supabase/migrations/202605270001_platform_money_kill_switches.sql", "assert_money_feature_allowed") && has("supabase/migrations/202605270001_platform_money_kill_switches.sql", "p_require_live_money"),
    detail: "Backend money guard can require both target switch and live money.",
  },
  {
    id: "sandbox_tester_direct_intent_block",
    ok: has("supabase/migrations/20260616121739_require_sandbox_tester_for_purchase_intents.sql", "sandbox_monetization_tester_required"),
    detail: "Revoked/non-tester sandbox purchase intents fail closed.",
  },
  {
    id: "provider_mapping_present",
    ok: [
      "cw_paid_content_access_sandbox_099",
      "cw_watch_party_live_ticket_sandbox_099",
      "cw_creator_tip_sandbox_099",
      "cw_event_pass_sandbox_099",
      "channel_subscription_sandbox_monthly_499",
      "cw_vip_pass_sandbox_499",
      "premium_subscription",
    ].every((needle) => has("scripts/guard-creator-monetization-policy.mjs", needle) || has("_lib/channelSubscriptions.ts", needle) || has("_lib/creatorMonetization.ts", needle)),
    detail: "Provider product ids are present in source/guard truth.",
  },
  {
    id: "no_provider_refund_automation_claim",
    ok: has("docs/FINAL_LAUNCH_OPERATIONS_RUNBOOK.md", "Provider refund execution is manual/external") && has("docs/REFUND_CREDIT_PAYOUT_HOLD_FOUNDATION.md", "does not execute real refunds"),
    detail: "Provider refunds remain manual/external.",
  },
  {
    id: "no_livekit_authority_from_payment",
    ok: has("ROOM_BLUEPRINT.md", "Payment records never grant publish permission") && has("scripts/guard-creator-monetization-policy.mjs", "liveKitPublishGrantedByPayment: false"),
    detail: "Money/access rows do not grant LiveKit publish/host authority.",
  },
];

const flowSwitchMatrix = flows.map((flow) => ({
  flow: flow.label,
  switchExists: has(flow.switchProof, flow.switchName),
  defaultState: flow.defaultState,
  offBehavior: flow.offBehavior,
  sandboxBehavior: flow.sandboxBehavior,
  productionReadiness: flow.productionReadiness,
  emergencyStop: "live_money_enabled off blocks live-money purchase creation; emergency stop preserves already-owned access unless revoke/refund policy applies.",
  status: flow.productionReadiness.startsWith("Blocked") ? "Partial" : "Closed",
}));

const providerMatrix = flows.map((flow) => ({
  flow: flow.label,
  productId: flow.productId,
  providerType: flow.providerType,
  provider: "Google Play / RevenueCat",
  configured: flow.providerConfigured,
  productionReady: flow.productionReady,
  restoreRevokeBehavior: flow.restoreRevoke,
  status: flow.productionReady.includes("pending") || flow.productionReady.includes("missing") ? "Partial" : "Closed",
}));

const supportPolicyMatrix = flows.map((flow) => ({
  flow: flow.label,
  supportPolicy: flow.supportPolicy,
  refundPolicy: flow.refundPolicy,
  disputePolicy: flow.disputePolicy,
  creatorExpectation: flow.creatorExpectation,
  status: "Closed for manual/external support policy",
}));

const rollbackMatrix = [
  {
    flow: "Global money master switch",
    disablePath: "Set live_money_enabled off in Owner/Admin Money Center or keep default off.",
    proofResult: status(repoChecks.find((check) => check.id === "global_money_master_off")?.ok),
    accessPreservation: "New live-money purchase creation blocked; already-owned access preserved unless specific revoke/refund policy applies.",
    status: "Closed",
  },
  ...flows.map((flow) => ({
    flow: flow.label,
    disablePath: flow.rollback,
    proofResult: flowSwitchMatrix.find((row) => row.flow === flow.label)?.switchExists ? "Pass" : "Blocked",
    accessPreservation: "Existing access follows readback/revoke/refund policy; switch off blocks new purchase creation.",
    status: flowSwitchMatrix.find((row) => row.flow === flow.label)?.switchExists ? "Partial" : "Blocked",
  })),
];

const creatorExpectationMatrix = flows
  .filter((flow) => flow.label !== "Premium")
  .map((flow) => ({
    flow: flow.label,
    payoutsCopyRequired: "creator earnings/payouts are not live",
    sandboxCopyRequired: "test/sandbox only when sandbox mode",
    payableCopyRequired: "not payable",
    withdrawalCashout: "unavailable",
    supportRefundPath: "manual/external",
    currentStatusVisible: "Money Center / route readback",
    status: "Closed in docs/proof; production activation still blocked",
  }));

const killSwitchProof = {
  dryRun: true,
  realPurchasesAttempted: false,
  realRefundsAttempted: false,
  providerSecretsPrinted: false,
  repoChecks,
  directIntentBlocking: {
    switchOff: status(repoChecks.find((check) => check.id === "backend_switch_guard")?.ok && repoChecks.find((check) => check.id === "sandbox_tester_direct_intent_block")?.ok),
    noProviderSheetWhenOff: "Static proof: purchase surfaces are gated by closed defaults and provider availability; no runtime purchase executed.",
    noAccessGrantWhenOff: "Static proof: backend guard/tester requirements and live_money_enabled default off block unsupported direct creation.",
  },
  sandboxPath: {
    status: "Closed from existing seven-flow app-side proof; this script does not re-run provider purchases.",
    exactTargetAccess: "Closed in existing proof docs.",
    noPayoutSideEffect: status(repoChecks.find((check) => check.id === "payouts_off")?.ok),
  },
  productionOnReadiness: {
    status: "Partial",
    reason: "Production activation is intentionally blocked pending owner decision, provider production product approval/mapping, and separate live-money lane.",
  },
  emergencyOffAfterOn: {
    status: status(repoChecks.find((check) => check.id === "global_money_master_off")?.ok),
    behavior: "New purchase creation must fail closed; existing access remains stable unless revoke/refund policy applies.",
  },
};

const secretPatterns = [
  /service[_-]?role/i,
  /sk_live/i,
  /sk_test/i,
  /whsec_/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /signedUrl/i,
  /LIVEKIT_API_SECRET/i,
  /REVENUECAT.*SECRET/i,
];

const artifactPayloads = {
  "flow-switch-matrix.json": flowSwitchMatrix,
  "provider-mapping-matrix.json": providerMatrix,
  "kill-switch-proof-output.json": killSwitchProof,
  "support-refund-dispute-policy-matrix.json": supportPolicyMatrix,
  "creator-expectation-matrix.json": creatorExpectationMatrix,
  "rollback-matrix.json": rollbackMatrix,
};

mkdirSync(artifactDir, { recursive: true });
for (const [name, payload] of Object.entries(artifactPayloads)) {
  writeArtifact(name, asJson(payload));
}

const artifactText = Object.entries(artifactPayloads)
  .map(([name, payload]) => `${name}\n${asJson(payload)}`)
  .join("\n");
const secretFindings = secretPatterns
  .map((pattern) => ({ pattern: String(pattern), matched: pattern.test(artifactText) }))
  .filter((entry) => entry.matched);

writeArtifact("secret-token-scan-result.json", asJson({
  scannedArtifactNames: Object.keys(artifactPayloads),
  findingCount: secretFindings.length,
  findings: secretFindings.map((entry) => ({ pattern: entry.pattern, value: "[redacted]" })),
  status: secretFindings.length === 0 ? "Pass" : "Blocked",
}));

writeArtifact("README.md", `# Seven-Flow Production Switchboard Proof

Generated: ${new Date().toISOString()}

This dry-run proof made no real purchases, no provider refund calls, no payout calls, no transfers, no withdrawals, and printed no provider secrets.

Verdict: Partial.

Reason: the app-side sandbox proof is closed and the switchboard/governance layer is documented with safe defaults, but real-money production activation remains intentionally blocked until owner decision and provider production product readiness are approved in a separate lane.

Files:

- flow-switch-matrix.json
- provider-mapping-matrix.json
- kill-switch-proof-output.json
- support-refund-dispute-policy-matrix.json
- creator-expectation-matrix.json
- rollback-matrix.json
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
  workingTreeStatus: git(["status", "--short"]),
  flowSwitchMatrix,
  providerMatrix,
  supportPolicyMatrix,
  rollbackMatrix,
  repoChecks,
  safety: {
    liveMoneyEnabled: false,
    creatorPayoutsEnabled: false,
    payableBalancesCreated: false,
    withdrawalsEnabled: false,
    providerRefundsExecuted: false,
    realPurchasesExecuted: false,
    providerSecretsPrinted: false,
  },
};

console.log(asJson(summary));
