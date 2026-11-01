import assert from "node:assert/strict";
import test from "node:test";
import { loadStudioFunctions, deferred } from "../helpers/studio-source-harness.mjs";
import { account, connect, creator, load, payoutsFor } from "./stripe-connect-observed-fixture.mjs";

test("Connect distinguishes observed controller configuration from creation policy, including type none", () => {
  for (const type of ["none", "express"]) for (const payer of ["application", "application_express"]) {
    const input = account({ type }); input.controller.fees.payer = payer;
    const normalized = connect.normalizeStripeAccount(input);
    assert.equal(normalized.accountType, type); assert.equal(normalized.feesPayer, "platform");
    assert.equal(normalized.feesPayerRaw, payer); assert.equal(normalized.configurationStatus, "match");
    assert.equal(normalized.providerReady, true);
    assert.equal(connect.safeAccountStatusPayload(normalized).payout_execution_active, false);
  }
  const input = account(); input.controller.stripe_dashboard.type = "none"; input.controller.requirement_collection = "application";
  const normalized = connect.normalizeStripeAccount(input);
  assert.equal(normalized.requirementsCollection, "platform"); assert.equal(normalized.dashboardType, "none");
  assert.equal(normalized.providerReportedReady, true); assert.equal(normalized.providerReady, false);
  assert.equal(normalized.configurationStatus, "mismatch"); assert.equal(normalized.onboardingStatus, "under_review");
  const payload = connect.safeAccountStatusPayload(normalized);
  assert.equal(payload.provider_configuration.expected.dashboardType, "express");
  assert.equal(payload.provider_configuration.observed.dashboard_type, "none");
  assert.doesNotMatch(JSON.stringify(payload), /acct_synthetic_configuration/);
});

test("missing and future controller fields remain unknown; recognized different responsibilities mismatch", () => {
  for (const changes of [{ controller: undefined }, { controller: null }, { type: "future" }]) {
    const normalized = connect.normalizeStripeAccount(account(changes));
    assert.equal(normalized.configurationStatus, "unknown"); assert.equal(normalized.providerReady, false);
  }
  for (const field of ["type", "is_controller", "fees", "losses", "requirement_collection", "stripe_dashboard"]) {
    const input = account(); delete input.controller[field];
    assert.equal(connect.normalizeStripeAccount(input).configurationStatus, "unknown");
  }
  const input = account(); input.controller.fees.payer = "account";
  assert.equal(connect.normalizeStripeAccount(input).feesPayer, "account");
  assert.equal(connect.normalizeStripeAccount(input).configurationStatus, "mismatch");
  input.controller.fees.payer = "application_custom";
  assert.equal(connect.normalizeStripeAccount(input).feesPayer, "platform");
  assert.equal(connect.normalizeStripeAccount(input).configurationStatus, "mismatch");
  for (const value of ["future", "stripe", {}, 1]) {
    input.controller.fees.payer = value;
    assert.equal(connect.normalizeStripeAccount(input).feesPayer, "unknown");
    assert.equal(connect.normalizeStripeAccount(input).configurationStatus, "unknown");
  }
  assert.throws(() => connect.normalizeStripeAccount(account({ livemode: true })), /Live-mode/);
});

test("legacy hardcoded Express rows and incomplete metadata cannot claim verified provider readiness", async () => {
  assert.equal(connect.storedStripeConfiguration({ provider: "stripe_connect", provider_environment: "test",
    provider_account_id: "acct_synthetic_configuration", provider_account_type: "express", provider_dashboard_type: "express",
    provider_requirements_collection: "stripe", provider_fees_payer: "platform" }).configurationStatus, "unknown");
  for (const provider_configuration of [undefined, { status: "match" }, { status: "future" }]) {
    const eligibility = { payout_account_id: "payout", provider_ready: true, payout_account_ready: true,
      eligible_for_payouts: true, eligibility_status: "ready_for_payouts", metadata: { provider_configuration } };
    const client = { from: table => { const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [], count: 0 }),
      maybeSingle: async () => ({ data: eligibility }) }; return q; } };
    const summary = await payoutsFor(client).readCreatorPayoutDashboardSummary({ creatorUserId: creator });
    assert.equal(summary.providerConfigurationStatus, "unknown"); assert.equal(summary.providerReady, false);
    assert.equal(summary.eligibleForPayouts, false); assert.equal(summary.canStartProviderSetup, false);
    assert.equal(summary.canRefreshProviderStatus, true); assert.equal(summary.setupStatus, "configuration_review_required");
  }
});

test("existing Express creation request and API version remain unchanged using a transport double", async () => {
  let request;
  const api = load("supabase/functions/_shared/stripe-connect.ts", {
    "npm:@supabase/supabase-js@2": {}, "./exact-subject-authority.ts": {},
  }, { Deno: { env: { get: () => undefined } }, fetch: async (url, options) => {
    request = { url, options }; return { ok: true, json: async () => account() };
  } });
  await api.createStripeConnectAccount("synthetic-test-secret", { id: creator, email: null });
  assert.equal(request.url, "https://api.stripe.com/v1/accounts");
  assert.equal(request.options.headers["Stripe-Version"], "2026-02-25.clover");
  const form = request.options.body;
  assert.equal(form.get("controller[fees][payer]"), "application");
  assert.equal(form.get("controller[losses][payments]"), "application");
  assert.equal(form.get("controller[requirement_collection]"), "stripe");
  assert.equal(form.get("controller[stripe_dashboard][type]"), "express");
  assert.equal(form.get("metadata[chillywood_provider_environment]"), "test");
});

function studio(stage, response = {}) {
  const pending = deferred(), calls = [];
  let authority = { userId: creator, accountId: creator, sessionGeneration: "one", state: "ACTIVE", restoreOnly: false };
  const { sameAccountSessionAuthority } = loadStudioFunctions("_lib/accountSessionAuthority.ts", ["sameAccountSessionAuthority"], {});
  const io = (name, value) => async () => { calls.push(name); return stage === name ? pending.promise : value; };
  const context = { useCallback: fn => fn, user: { id: creator }, payoutSetupBusy: null,
    replayActionsMountedRef: { current: true }, getCurrentAccountSessionAuthoritySnapshot: () => authority,
    sameAccountSessionAuthority, setPayoutSetupBusy: value => calls.push(["busy", value]),
    setPayoutSetupNotice: value => calls.push(["notice", value]), trackEvent() {},
    createOrReuseCreatorPayoutProviderAccount: io("account", response.account || { status: "account_reused" }),
    createCreatorPayoutOnboardingLink: io("link", response.link || { status: "created", onboarding_url: "https://connect.stripe.test/synthetic-private-link" }),
    createPayoutSetupRedirectUrl: () => "synthetic://payout",
    Linking: { canOpenURL: io("canOpen", true), openURL: io("open", undefined) },
    refreshCreatorPayouts: io("refresh", undefined), refreshCreatorTips: io("tips", undefined),
    syncCreatorPayoutProviderStatus: io("sync", { message: "Payouts remain inactive." }),
  };
  const api = loadStudioFunctions("app/channel-settings.tsx", ["handleStartPayoutProviderSetup", "handleRefreshPayoutProviderStatus"], context);
  return { api, calls, pending, switchAccount: () => { authority = { ...authority, sessionGeneration: "two" }; } };
}
test("Studio mismatch blocks onboarding and presents the review notice without claiming payouts active", async () => {
  for (const where of ["account", "link"]) {
    const h = studio(null, { [where]: { status: "configuration_review_required", message: "Configuration needs review. Payouts remain inactive.", onboarding_url: "must-not-open" } });
    await h.api.handleStartPayoutProviderSetup();
    assert.ok(!h.calls.includes("open")); assert.ok(!h.calls.includes("canOpen"));
    if (where === "account") assert.ok(!h.calls.includes("link"));
    assert.ok(h.calls.some(call => Array.isArray(call) && call[0] === "notice" && /remain inactive/.test(call[1])));
  }
  const valid = studio(); await valid.api.handleStartPayoutProviderSetup();
  assert.equal(valid.calls.filter(call => call === "open").length, 1);
});
test("Studio discards stale account/session callbacks before opening private links or changing current UI", async () => {
  for (const stage of ["account", "link", "canOpen", "sync"]) {
    const h = studio(stage);
    const run = stage === "sync" ? h.api.handleRefreshPayoutProviderStatus() : h.api.handleStartPayoutProviderSetup();
    while (!h.calls.includes(stage)) await Promise.resolve();
    h.switchAccount(); const before = h.calls.length;
    h.pending.resolve(stage === "account" ? { status: "account_reused" } : stage === "link" ? { onboarding_url: "must-not-open" } : true);
    await run; assert.equal(h.calls.length, before, `${stage} must not publish or continue for the replacement session`);
    assert.ok(!h.calls.includes("open")); assert.ok(!h.calls.includes("refresh"));
  }
});

function endpoint(file, row, overrides = {}) {
  let handler; const calls = [];
  const api = { ...connect,
    createAuthClient: () => ({ supabaseAnonKey: "synthetic", supabaseUrl: "https://synthetic.test" }),
    authenticateRequest: async () => ({ user: { id: creator, email: null } }),
    createAdminClient: () => ({ configured: true, client: {} }),
    resolveRedirectUrls: () => ({ value: { refreshUrl: "synthetic://refresh", returnUrl: "synthetic://return" } }),
    readCreatorPayoutAccount: async () => row,
    writeAuditLog: async () => "audit-synthetic", safeWriteAuditLog: async () => null,
    readStripeTestSecret: () => ({ configured: true, secret: "synthetic" }),
    createStripeConnectAccount: async () => { calls.push("provider-create"); throw new Error("provider path must stay unreachable"); },
    createStripeConnectOnboardingLink: async () => { calls.push("provider-link"); throw new Error("provider path must stay unreachable"); },
    ...overrides,
  };
  load(`supabase/functions/${file}/index.ts`, {
    "jsr:@supabase/functions-js/edge-runtime.d.ts": {}, "../_shared/stripe-connect.ts": api,
    "../_shared/stripe-connect-live-observation.ts": { observeLiveConnectAccount: () => { throw Error("test mode must not call live provider"); } },
    "../_shared/stripe-connect-live-onboarding.ts": { selectConnectOnboardingRoute: async () => ({ mode: "test" }) },
  }, { Deno: { serve: callback => { handler = callback; } } });
  return { calls, request: async () => {
    const response = await handler(new Request("https://synthetic.test/function", {
      method: "POST", body: JSON.stringify({ creatorUserId: creator }),
    }));
    return { code: response.status, body: await response.json() };
  } };
}
const stored = (changes = {}) => ({
  id: "synthetic-row", creator_user_id: creator, provider: "stripe_connect", provider_environment: "test",
  provider_account_id: account().id, provider_account_type: "none", provider_controller_type: "application",
  provider_configuration_account_id: account().id,
  provider_is_controller: true, provider_dashboard_type: "express", provider_fees_payer: "platform",
  provider_fees_payer_raw: "application", provider_losses_collector: "platform", provider_requirements_collection: "stripe",
  provider_configuration_observed_at: "2026-10-27T03:50:00Z", ...changes,
});
test("actual account reuse and onboarding endpoints refuse unknown or mismatched configuration before provider calls", async () => {
  for (const row of [stored({ provider_configuration_observed_at: null }),
    stored({ provider_configuration_account_id: null }), stored({ provider_account_id: "acct_replacement_synthetic" }),
    stored({ provider_configuration_account_id: "acct_other_synthetic" }),
    stored({ provider_dashboard_type: "none", provider_requirements_collection: "platform" })]) {
    assert.notEqual(connect.storedStripeConfiguration(row).configurationStatus, "match");
    for (const file of ["stripe-connect-account", "stripe-connect-onboarding-link"]) {
      const h = endpoint(file, row); const { code, body } = await h.request();
      assert.equal(code, 200); assert.equal(body.status, "configuration_review_required");
      assert.equal(body.providerCall, false); assert.equal(body.providerWrite, false); assert.equal(body.liveMoneyAction, false);
      assert.equal(body.onboarding_url, undefined); assert.deepEqual(h.calls, []);
      assert.match(body.message, /Payouts remain inactive/);
    }
  }
  const h = endpoint("stripe-connect-account", stored());
  const { body } = await h.request(); assert.equal(body.status, "account_reused"); assert.deepEqual(h.calls, []);
  assert.equal(body.configuration.observed.account_type, "none");
});
test("actual sync endpoint projects provider mismatch and observation status without claiming readiness or moving money", async () => {
  const input = account(); input.controller.stripe_dashboard.type = "none"; input.controller.requirement_collection = "application";
  const writes = [];
  const h = endpoint("stripe-connect-account-sync", stored(), {
    readStripeTestSecret: () => ({ configured: true, secret: "synthetic" }),
    retrieveStripeConnectAccount: async (_secret, providerId) => { assert.equal(providerId, input.id); return input; },
    upsertCreatorPayoutAccountFromStripe: async (_client, userId, normalized, row) => {
      writes.push(normalized); assert.equal(userId, creator); return row;
    },
  });
  const { code, body } = await h.request(); assert.equal(code, 200); assert.equal(body.status, "synced");
  assert.equal(writes.length, 1); assert.ok(writes.every(value => value.configurationStatus === "mismatch"));
  assert.equal(body.account.provider_reported_ready, true); assert.equal(body.account.provider_ready, false);
  assert.equal(body.account.provider_configuration.observed.requirements_collection, "platform");
  assert.equal(body.account.payout_execution_active, false); assert.equal(body.payoutCreated, false); assert.equal(body.transferCreated, false);
  assert.match(body.message, /needs platform review/);
});
