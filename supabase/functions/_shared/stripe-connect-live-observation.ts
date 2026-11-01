import { normalizeStripeConfiguration, type StripeAccountObject } from "./stripe-connect.ts";
import { readCashoutBody } from "./creator-cashout-execution.ts";

export type LiveConnectObservationContext = {
  rowId: string; creatorId: string; accountId: string; platformAccountId: string;
  previousObservedAt: string | null; environment: "live";
};
type ObjectValue = Record<string, any>;
const fail = (): never => { throw Error("live_connect_observation_unverified"); };
const strings = (value: unknown): string[] | null => Array.isArray(value)
  && value.every((item) => typeof item === "string") ? value : null;

/** GET-only existing-account observation. No onboarding, financial dispatch,
 * account mutation, defaulting an absent mode to live, or qualification. */
export async function observeLiveConnectAccount(context: LiveConnectObservationContext, secret: string,
  transport: typeof fetch = fetch, now: () => number = Date.now) {
  if (!/^(sk|rk)_live_[A-Za-z0-9]+$/.test(secret) || context.environment !== "live"
    || !/^acct_[A-Za-z0-9]+$/.test(context.accountId) || !/^acct_[A-Za-z0-9]+$/.test(context.platformAccountId)
    || context.accountId === context.platformAccountId) fail();
  const started = now();
  const get = async (path: string): Promise<ObjectValue> => {
    if (now() - started > 40000) fail();
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
    try {
      const response = await transport(`https://api.stripe.com${path}`, {
        method: "GET", redirect: "error", signal: abort.signal,
        headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive" },
      });
      const body = await readCashoutBody(response.body, 262144, 10000);
      if (!response.ok) fail();
      const value = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value)) fail();
      return value;
    } finally { clearTimeout(timer); }
  };
  const platform = await get("/v1/account");
  // v1 Account may omit livemode. The credential mode plus exact platform and
  // independently explicit v2 livemode below are all required.
  if (platform.id !== context.platformAccountId || platform.livemode === false) fail();
  const path = `/v2/core/accounts/${context.accountId}?include[0]=configuration.recipient&include[1]=defaults`;
  const v2 = await get(path);
  if (v2.id !== context.accountId || v2.livemode !== true) fail();
  const v1 = await get(`/v1/accounts/${context.accountId}`);
  if (v1.id !== context.accountId || v1.livemode === false) fail();
  const again = await get(path);
  const bind = (value: ObjectValue) => JSON.stringify([value.id, value.livemode, value.dashboard,
    value.defaults?.responsibilities, value.configuration?.recipient]);
  if (bind(v2) !== bind(again) || now() - started > 45000) fail();
  const configuration = normalizeStripeConfiguration(v1 as StripeAccountObject);
  const responsibilities = v2.defaults?.responsibilities;
  const proof = {
    accountId: context.accountId, platformAccountId: context.platformAccountId, environment: "live", modeVerified: true,
    source: "authenticated_stripe_get_v1_v2", v2Dashboard: v2.dashboard ?? "unknown",
    v2FeesCollector: responsibilities?.fees_collector ?? "unknown",
    v2LossesCollector: responsibilities?.losses_collector ?? "unknown",
    recipientTransfers: v2.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? "unknown",
    payoutSchedule: v1.settings?.payouts?.schedule?.interval ?? "unknown",
    pendingVerification: strings(v1.requirements?.pending_verification) ?? ["unverified"],
    requirementsComplete: ["currently_due", "past_due", "eventually_due", "pending_verification"]
      .every((key) => strings(v1.requirements?.[key]) !== null)
      && Object.prototype.hasOwnProperty.call(v1.requirements ?? {}, "disabled_reason"),
  };
  const v2Matches = proof.v2Dashboard === "express" && proof.v2FeesCollector === "application" && proof.v2LossesCollector === "application";
  return { ...configuration, configurationStatus: v2Matches ? configuration.configurationStatus : "mismatch",
    accountId: context.accountId, proof, readStartedAt: new Date(started).toISOString(),
    chargesEnabled: v1.charges_enabled === true, payoutsEnabled: v1.payouts_enabled === true,
    detailsSubmitted: v1.details_submitted === true, country: v1.country ?? null,
    currency: /^[a-z]{3}$/.test(v1.default_currency) ? v1.default_currency : "xxx",
    disabledReason: typeof v1.requirements?.disabled_reason === "string" ? v1.requirements.disabled_reason : null,
    currentlyDue: strings(v1.requirements?.currently_due) ?? ["unverified"],
    pastDue: strings(v1.requirements?.past_due) ?? ["unverified"],
    eventuallyDue: strings(v1.requirements?.eventually_due) ?? ["unverified"],
  };
}
