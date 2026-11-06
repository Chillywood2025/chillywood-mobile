import { normalizeStripeAccount, upsertCreatorPayoutAccountFromStripe,
  type CreatorPayoutAccountRow, type StripeAccountObject, type SupabaseClientLike } from "./stripe-connect.ts";
import { observeLiveConnectAccount } from "./stripe-connect-live-observation.ts";
import { readCashoutBody } from "./creator-cashout-execution.ts";

export type ProviderObservationJob = {
  account_id: string; creator_id: string; environment: "test" | "live";
  provider_account_id: string; lease_token: string;
};
const source = "creator-provider-observation-worker";
/** No provider writes and no retry of a database write with an unknown outcome.
 * Five concurrent leases keep a four-GET live observation inside the two-minute lease. */
export async function runProviderObservations(client: SupabaseClientLike,
  keys: { test: string; live: string }, transport: typeof fetch = fetch) {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await client.rpc(name, args);
    if (result.error) throw Error("provider_observation_database_unavailable");
    return result.data;
  };
  const jobs = await rpc("claim_creator_provider_observations", {});
  if (!Array.isArray(jobs) || jobs.length > 5) throw Error("provider_observation_claim_invalid");
  let gets = 0;
  const bounded: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    if (!init || !("method" in init) || init.method !== "GET"
      || url.origin !== "https://api.stripe.com" || ++gets > 20)
      throw Error("provider_observation_read_limit");
    return transport(input, init);
  };
  const results = await Promise.all(jobs.map(async (job: ProviderObservationJob) => {
    let writeStarted = false;
    try {
      if (!["test", "live"].includes(job.environment) || !/^acct_[A-Za-z0-9]+$/.test(job.provider_account_id))
        throw Error("provider_observation_binding_invalid");
      const row = await client.from("creator_payout_accounts").select("*")
        .eq("id", job.account_id).eq("creator_user_id", job.creator_id).eq("provider", "stripe_connect")
        .eq("provider_environment", job.environment).eq("provider_account_id", job.provider_account_id).single();
      if (row.error || !row.data) throw Error("provider_observation_binding_changed");
      const existing = row.data as CreatorPayoutAccountRow;
      if (job.environment === "live") {
        const context = await rpc("get_creator_connect_live_observation_context", { p_creator: job.creator_id });
        if (context.rowId !== job.account_id || context.accountId !== job.provider_account_id)
          throw Error("provider_observation_binding_changed");
        const facts = await observeLiveConnectAccount(context, keys.live, bounded);
        writeStarted = true;
        const recorded = await rpc("record_creator_connect_live_observation", { p_context: context, p_facts: facts });
        if (recorded?.recorded !== true) throw Error("provider_observation_stale");
      } else {
        if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(keys.test)) throw Error("provider_observation_test_key_required");
        const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
        let account: StripeAccountObject;
        try {
          const response = await bounded(`https://api.stripe.com/v1/accounts/${job.provider_account_id}`, {
            method: "GET", redirect: "error", signal: abort.signal,
            headers: { Authorization: `Bearer ${keys.test}`, "Stripe-Version": "2026-10-28.endive" },
          });
          const text = await readCashoutBody(response.body, 262144, 10000);
          if (!response.ok) throw Error("provider_observation_read_failed");
          account = JSON.parse(text);
          if (account.id !== job.provider_account_id || account.livemode !== false)
            throw Error("provider_observation_mode_unverified");
        } finally { clearTimeout(timer); }
        const normalized = normalizeStripeAccount(account);
        writeStarted = true;
        await upsertCreatorPayoutAccountFromStripe(client, job.creator_id, normalized, existing, null, source);
      }
      // The event truthfully describes an already persisted observation, not a
      // creator action. Avoid the test-only audit helper's hard-coded metadata.
      writeStarted = true;
      const audit = await client.from("platform_admin_audit_logs").insert({
        action: "creator_provider_observation_persisted", action_category: "payout", actor_role: "system",
        actor_user_id: null, target_type: "creator_payout_account", target_id: job.account_id,
        target_user_id: job.creator_id, reason: "Scheduled read-only observation of an existing provider account.",
        metadata: { source, provider_environment: job.environment, provider_write: false, live_money_action: false },
      });
      if (audit.error) throw Error("provider_observation_audit_unresolved");
      const completed = await rpc("complete_creator_provider_observation", { p_account: job.account_id, p_token: job.lease_token });
      if (completed?.completed !== true) throw Error("provider_observation_completion_stale");
      return "observed";
    } catch {
      // Unknown persistence is left leased. A later claim reconciles by a fresh
      // read after expiry; no immediate replay of an uncertain write.
      if (!writeStarted) {
        try { await rpc("fail_creator_provider_observation", { p_account: job.account_id, p_token: job.lease_token }); }
        catch { /* Retain the lease on an unknown failure-record outcome. */ }
      }
      return "pending";
    }
  }));
  return { claimed: jobs.length, observed: results.filter(x => x === "observed").length,
    pending: results.filter(x => x === "pending").length, providerWrite: false, liveMoneyAction: false };
}
