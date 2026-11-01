import { normalizeStripeConfiguration, type AuthenticatedUser, type SupabaseClientLike } from "./stripe-connect.ts";
import { readCashoutBody } from "./creator-cashout-execution.ts";
type Json = Record<string, any>;
const accountId = (value: unknown) => typeof value === "string" && /^acct_[A-Za-z0-9]+$/.test(value);
function fail(reason: string): never { throw Error(`connect_onboarding_${reason}`); }
const rpc = async (client: SupabaseClientLike, name: string, args: Json): Promise<Json> => {
  const result = await client.rpc(name, args);
  if (result.error || !result.data || typeof result.data !== "object") fail("authority_unavailable");
  return result.data;
};
const subject = (user: AuthenticatedUser) => ({ p_creator: user.id, p_session: user.sessionGeneration ?? null });
export const selectConnectOnboardingRoute = (client: SupabaseClientLike, user: AuthenticatedUser) =>
  rpc(client, "get_creator_connect_onboarding_route", subject(user));
export const confirmDistinctLiveConnectSetup = (client: SupabaseClientLike, user: AuthenticatedUser, disclosure: unknown) =>
  rpc(client, "confirm_creator_connect_live_setup", { ...subject(user), p_disclosure: disclosure });
const result = (status: string, extra: Json = {}) => ({ status, mode: "live", provider: "stripe", providerKey: "stripe_connect",
  liveMoneyAction: false, payoutCreated: false, transferCreated: false, checkoutCreated: false,
  message: status === "account_migration_review_required"
    ? "Your existing payout account needs a reviewed transition. It has not been converted or replaced."
    : status === "creator_onboarding_eligibility_required"
      ? "Complete creator eligibility and the current payout terms before starting Stripe setup."
      : status === "creation_pending"
        ? "Stripe account creation is being verified. Continue setup again to resume safely; no second account will be created."
        : "Stripe setup does not enable payments or payouts.", ...extra });

function provider(secret: string, transport: typeof fetch, now: () => number) {
  if (!/^(sk|rk)_live_[A-Za-z0-9]+$/.test(secret)) fail("live_credential_required");
  const deadline = now() + 55000; let count = 0;
  return async (path: string, body?: URLSearchParams, key?: string): Promise<Json> => {
    if (++count > 9 || now() >= deadline) fail("provider_budget_exhausted");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(10000, deadline - now()));
    try {
      const response = await transport(`https://api.stripe.com${path}`, {
        method: body ? "POST" : "GET", body, redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive",
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": key ?? fail("dispatch_key_required") } : {}) },
      });
      const raw = await readCashoutBody(response.body, 524288, Math.max(1, Math.min(10000, deadline - now())));
      if (!response.ok) fail("provider_outcome_unresolved");
      let parsed: Json;
      try { parsed = JSON.parse(raw); } catch { fail("provider_shape_invalid"); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("provider_shape_invalid");
      return parsed;
    } finally { clearTimeout(timer); }
  };
}
async function verifyPlatform(call: ReturnType<typeof provider>, context: Json) {
  const platform = await call("/v1/account");
  if (!accountId(context.platformAccountId) || platform.object !== "account" || platform.id !== context.platformAccountId
    || platform.livemode === false || platform.country !== "US") fail("platform_binding_invalid");
}
function accountFacts(account: Json, context: Json) {
  const metadata = account.metadata;
  if (account.object !== "account" || !accountId(account.id) || account.id === context.platformAccountId || account.livemode === false
    || (context.accountId && context.accountId !== account.id)
    || metadata?.chillywood_creation_attempt !== context.attemptId || metadata?.creator_user_id !== context.creatorId
    || metadata?.chillywood_environment !== "live" || metadata?.chillywood_platform_account !== context.platformAccountId
    || metadata?.chillywood_policy_id !== context.policyId
    || account.country !== "US" || account.default_currency !== "usd" || account.settings?.payouts?.schedule?.interval !== "manual"
    || normalizeStripeConfiguration(account).configurationStatus !== "match") fail("created_account_binding_invalid");
  return { accountId: account.id, attemptId: context.attemptId, creatorId: context.creatorId, platformAccountId: context.platformAccountId,
    environment: "live", modeVerified: true, configurationKey: context.configurationKey, country: "US", currency: "usd",
    payoutSchedule: "manual", controllerStatus: "match" };
}
export async function createOrRecoverLiveConnectAccount(client: SupabaseClientLike, user: AuthenticatedUser, secret: string,
  transport: typeof fetch = fetch, now: () => number = Date.now) {
  const context = await rpc(client, "reserve_creator_connect_account_creation", subject(user));
  if (context.mode !== "live") return result("not_configured");
  if (context.status === "account_reused") return result("account_reused", { accountReused: true, accountCreated: false });
  if (context.status === "review_required") return result("account_migration_review_required");
  if (!["reserved", "dispatched", "observed", "bound"].includes(context.status)) return result(context.status);
  const call = provider(secret, transport, now); await verifyPlatform(call, context);
  let candidate: Json | null = null;
  if (context.status === "reserved") {
    const claim = await rpc(client, "claim_creator_connect_account_creation", { ...subject(user), p_attempt: context.attemptId });
    if (!claim.claimed) return result("creation_pending");
    const body = new URLSearchParams({ country: "US", default_currency: "usd",
      "controller[fees][payer]": "application", "controller[losses][payments]": "application",
      "controller[requirement_collection]": "stripe", "controller[stripe_dashboard][type]": "express",
      "capabilities[card_payments][requested]": "true", "capabilities[transfers][requested]": "true",
      "settings[payouts][schedule][interval]": "manual", "metadata[chillywood_creation_attempt]": context.attemptId,
      "metadata[creator_user_id]": user.id, "metadata[chillywood_environment]": "live",
      "metadata[chillywood_platform_account]": context.platformAccountId, "metadata[chillywood_policy_id]": context.policyId,
    });
    // Durable dispatch precedes this sole creation POST. Any exception or lost
    // response is GET-only recovery, even after Stripe's idempotency retention.
    try { candidate = await call("/v1/accounts", body, context.dispatchKey); }
    catch { return result("creation_pending"); }
    if (!accountId(candidate.id)) return result("creation_pending");
    context.accountId = candidate.id;
    candidate = await call(`/v1/accounts/${candidate.id}`);
  } else if (context.accountId) {
    candidate = await call(`/v1/accounts/${context.accountId}`);
  } else {
    let cursor = context.recoveryCursor ?? null;
    let match = context.recoveryMatch ?? null;
    for (let page = 0; page < 5; page++) {
      const q = new URLSearchParams({ limit: "100" }); if (cursor) q.set("starting_after", cursor);
      const list = await call(`/v1/accounts?${q}`);
      if (list.object !== "list" || !Array.isArray(list.data) || typeof list.has_more !== "boolean"
        || (list.has_more && !list.data.length)) fail("recovery_page_invalid");
      for (const account of list.data) {
        if (!accountId(account.id)) fail("recovery_page_invalid");
        if (account.metadata?.chillywood_creation_attempt !== context.attemptId) continue;
        accountFacts(account, context);
        if (match && match !== account.id) {
          await client.rpc("quarantine_creator_connect_account_creation", { p_attempt: context.attemptId, p_first: match, p_second: account.id });
          return result("account_migration_review_required");
        }
        match = account.id;
      }
      const next = list.has_more ? list.data.at(-1).id : null;
      if (next && next === cursor) fail("recovery_cursor_not_advancing");
      const checkpoint = await rpc(client, "checkpoint_creator_connect_account_recovery", { p_attempt: context.attemptId,
        p_cursor: cursor, p_next: next, p_match: match, p_complete: !list.has_more });
      if (checkpoint.stale || checkpoint.reviewRequired) return result("creation_pending");
      if (!list.has_more) {
        if (!match) return result("creation_pending"); // absence never authorizes another POST
        context.accountId = match; candidate = await call(`/v1/accounts/${match}`); break;
      }
      cursor = next;
    }
  }
  if (!candidate) return result("creation_pending");
  const facts = accountFacts(candidate, context);
  const recorded = await rpc(client, "record_creator_connect_created_account", { ...subject(user),
    p_attempt: context.attemptId, p_account: candidate.id, p_facts: facts });
  return result(recorded.status, { accountCreated: recorded.bound === true, providerCall: true, providerWrite: context.status === "reserved" });
}
function verifiedRedirect(value: unknown) {
  if (typeof value !== "string") fail("redirect_policy_invalid");
  let url: URL;
  try { url = new URL(value); } catch { fail("redirect_policy_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port
    || ["localhost", "127.0.0.1", "::1"].includes(url.hostname) || value.length > 2048) fail("redirect_policy_invalid");
  return url.href;
}
export async function createLiveConnectHostedLink(client: SupabaseClientLike, user: AuthenticatedUser, secret: string,
  transport: typeof fetch = fetch, now: () => number = Date.now) {
  const context = await rpc(client, "claim_creator_connect_hosted_link", subject(user));
  const returnUrl = verifiedRedirect(context.returnUrl), refreshUrl = verifiedRedirect(context.refreshUrl);
  const call = provider(secret, transport, now); await verifyPlatform(call, context);
  accountFacts(await call(`/v1/accounts/${context.accountId}`), context);
  // A fresh claim just before POST also checks current session, legal versions,
  // account binding and policy; no client redirect can substitute for policy.
  const fresh = await selectConnectOnboardingRoute(client, user);
  if (fresh.status !== "available" || fresh.accountId !== context.accountId || fresh.policyId !== context.policyId
    || fresh.returnUrl !== context.returnUrl || fresh.refreshUrl !== context.refreshUrl) fail("authority_changed");
  const link = await call("/v1/account_links", new URLSearchParams({ account: context.accountId,
    type: "account_onboarding", return_url: returnUrl, refresh_url: refreshUrl }), context.dispatchKey);
  let url: URL;
  try { url = new URL(link.url); } catch { fail("hosted_link_invalid"); }
  if (url.protocol !== "https:" || url.hostname !== "connect.stripe.com" || url.port || url.username || url.password || url.hash
    || !/^\/(setup|express)\//.test(url.pathname) || !Number.isSafeInteger(link.expires_at)
    || link.expires_at * 1000 <= now() || link.expires_at * 1000 > now() + 3600000) fail("hosted_link_invalid");
  const completed = await rpc(client, "complete_creator_connect_hosted_link", { ...subject(user), p_request: context.linkRequestId,
    p_expires: new Date(link.expires_at * 1000).toISOString() });
  if (!completed.returnAllowed) fail("authority_changed");
  return result("link_created", { onboardingUrlCreated: true, onboardingUrlStored: false,
    onboarding_url: url.href, expires_at: new Date(link.expires_at * 1000).toISOString(), providerCall: true, providerWrite: true,
    message: "Complete your own Stripe agreement and identity steps on Stripe. Payments and payouts remain inactive." });
}
