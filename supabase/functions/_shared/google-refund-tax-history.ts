import { observeGoogleRefundTax, type GoogleRefundTaxContext } from "./google-refund-tax-reconciliation.ts";
import { createMerchObservationBudget } from "./merch-observation-budget.ts";
import { createStripeHistoryCheckpoint } from "./stripe-history-checkpoint.ts";

type Json = Record<string, unknown>;
type RpcClient = { rpc: (name: string, args: Json) => PromiseLike<{data: unknown; error?: unknown}> };
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

/** GET-only evidence collection, not a Google acknowledgement. A private
 * checkpoint can span invocations, but every fact must pass the existing full
 * verification and final mutable-boundary rereads before SQL records evidence.
 */
export async function reconcileGoogleRefundTax(client: RpcClient, context: GoogleRefundTaxContext,
  secret: string, account: string, transport: typeof fetch = fetch) {
  // Leave five seconds for the durable checkpoint after observation stops.
  // The caller's existing 75-second envelope also includes its initial claim.
  const budget = createMerchObservationBudget(transport, 65000);
  let claimed: Json | null = null;
  let history: ReturnType<typeof createStripeHistoryCheckpoint> | null = null;
  let facts: Awaited<ReturnType<typeof observeGoogleRefundTax>> = null;
  let complete = false;
  try {
    const begun = await budget.run(() => client.rpc("begin_google_refund_tax_history", {
      p_transaction_id: context.transaction_id, p_account_id: account,
    }), 5000);
    if (begun.error || !object(begun.data)) throw Error("google_tax_history_claim_failed");
    if (begun.data.busy === true || begun.data.eligible === false) return;
    if (typeof begun.data.generation !== "string" || typeof begun.data.lease !== "string"
      || !object(begun.data.context) || begun.data.context.transaction_id !== context.transaction_id
      || begun.data.context.feature !== context.feature) throw Error("google_tax_history_claim_invalid");
    claimed = begun.data;
    history = createStripeHistoryCheckpoint(claimed.checkpoint, budget.transport, budget.remaining);
    try {
      for (let round = 0; round < 2; round++) {
        facts = await budget.run(() => observeGoogleRefundTax(claimed!.context as GoogleRefundTaxContext,
          secret, account, history!.transport));
        // Missing/late associations stay pending. Do not persist a cached 404
        // that could prevent the next invocation from seeing new tax evidence.
        if (!facts) { history.invalidate(); break; }
        complete = await budget.run(() => history!.finish({method: "GET", redirect: "error",
          headers: {Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive"},
          signal: AbortSignal.timeout(15000)}));
        if (complete || history.checkpoint().cursor !== 0
          || budget.remaining() < history.verificationReadCount()) break;
      }
    } catch (error) {
      // An aborted/stalled GET never advances the checkpoint. Keep its fully
      // parsed prefix so both request-count and aggregate-time limits resume.
      // Changed/malformed/provider-error snapshots start over instead.
      const interrupted = error instanceof Error && (/budget_exhausted|observation_deadline|history_body_deadline/.test(error.message)
        || error.name === "AbortError" || error.name === "TimeoutError");
      if (!interrupted) history.invalidate();
      complete = false;
    }
  } finally { budget.close(); }

  if (!claimed || !history) throw Error("google_tax_history_unavailable");
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = client.rpc("save_google_refund_tax_history", {
      p_transaction_id: context.transaction_id, p_generation: claimed.generation, p_lease: claimed.lease,
      p_checkpoint: history.checkpoint(), p_facts: complete ? facts : null,
    });
    const abortable = pending as typeof pending & {abortSignal?: (signal: AbortSignal) => typeof pending};
    const saved = await Promise.race([
      typeof abortable.abortSignal === "function" ? abortable.abortSignal(controller.signal) : pending,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => {
        controller.abort(); reject(Error("google_tax_history_save_deadline"));
      }, 5000); }),
    ]);
    if (saved.error || !object(saved.data) || saved.data.financialAuthority !== false
      || saved.data.status !== (complete ? "history_complete" : "history_pending")
      || (complete && typeof saved.data.evidenceRecorded !== "boolean")) throw Error("google_tax_history_save_failed");
    return saved.data;
  } finally { if (timeout) clearTimeout(timeout); controller.abort(); }
}
