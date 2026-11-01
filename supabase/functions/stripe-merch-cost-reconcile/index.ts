import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { drainCommerceFeeAccounting } from "../_shared/commerce-fee-accounting-drain.ts";
import { createAdminClient, jsonResponse, readOptionalEnv, readStripeTestSecret } from "../_shared/stripe-connect.ts";
import { observeStripeMerchCosts, type MerchCostOrder } from "../_shared/stripe-merch-cost-observation.ts";
import { observeMerchDisputes, type MerchDisputeContext } from "../_shared/merch-dispute-observation.ts";
import { createMerchObservationBudget } from "../_shared/merch-observation-budget.ts";
import {createStripeHistoryCheckpoint} from "../_shared/stripe-history-checkpoint.ts";

// JWT verification remains enabled. A user JWT is NOT worker authority. This
// worker additionally requires the exact existing server credential. No new
// secret, provider configuration or scheduler is created by this source change.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  const budget = createMerchObservationBudget(fetch,65000);
  let history:ReturnType<typeof createStripeHistoryCheckpoint>|null=null;
  let save:((facts?:Record<string,unknown>)=>Promise<Record<string,unknown>>)|null=null;
  try {
    const body = await budget.run(() => req.json(), 5000);
    // Caller supplies only the order, never account, costs, transport or proof.
    if (!body || Object.keys(body).some(key => key !== "order_id")
      || typeof body.order_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.order_id))
      return jsonResponse(400, { error: "order_id_only_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "server_not_configured" });
    const context = await budget.run(() => admin.client.rpc("get_merch_cost_reconciliation_context", { p_order_id: body.order_id }), 5000);
    if (context.error || !context.data) throw Error("merch_order_context_unavailable");
    // Mode comes only from the stored order. Separate optional live read-only
    // configuration is never inferred from a request or borrowed test key.
    const live = context.data.environment === "production";
    const account = readOptionalEnv(live ? "STRIPE_MERCH_LIVE_OBSERVATION_ACCOUNT_ID" : "STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID");
    const testSecret = live ? null : readStripeTestSecret();
    const key = live ? readOptionalEnv("STRIPE_MERCH_LIVE_OBSERVATION_KEY") : testSecret?.configured ? testSecret.secret : null;
    if (!["sandbox", "production"].includes(context.data.environment) || !account || !key
      || !new RegExp(`^(sk|rk)_${live ? "live" : "test"}_[A-Za-z0-9_]+$`).test(key)
      || (live && context.data.platform_account_id !== account))
      return jsonResponse(503, { error: "merch_cost_reconciliation_not_configured", financialAuthority: false });
    const attempt = await budget.run(() => admin.client.rpc("begin_merch_dispute_observation", { p_order_id: body.order_id }), 5000);
    if (attempt.error || !attempt.data) throw Error("merch_dispute_context_unavailable");
    const disputes = await budget.run(() => observeMerchDisputes(attempt.data as MerchDisputeContext, key, account, budget.transport));
    const disputeResult = await budget.run(() => admin.client.rpc("complete_merch_dispute_observation", {
      p_attempt_id: attempt.data.id, p_facts: disputes,
    }), 5000);
    if (disputeResult.error || !disputeResult.data) throw Error("merch_dispute_observation_not_recorded");
    const checkpoint=await budget.run(()=>admin.client.rpc('begin_stripe_cost_history',{p_domain:'merch',p_source_id:body.order_id,p_account_id:account}),5000);
    if(checkpoint.error||!checkpoint.data||checkpoint.data.busy)throw Error('history_lease_unavailable');
    const claimed=checkpoint.data;
    history=createStripeHistoryCheckpoint(claimed.checkpoint,budget.transport,budget.remaining);
    save=async facts=>{
      let timeout:ReturnType<typeof setTimeout>|undefined;
      try{const recorded=await Promise.race([admin.client.rpc('save_stripe_cost_history',{p_domain:'merch',p_source_id:body.order_id,
        p_generation:claimed.generation,p_lease:claimed.lease,p_checkpoint:history!.checkpoint(),p_facts:facts??null}),
        new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('history_save_deadline')),5000);})]);
        if(recorded.error||!recorded.data)throw Error('history_save_failed');return recorded.data as Record<string,unknown>;
      }finally{if(timeout)clearTimeout(timeout);}
    };
    let facts:Awaited<ReturnType<typeof observeStripeMerchCosts>>|null=null,complete=false;
    for(let round=0;round<2;round++){
      facts=await budget.run(()=>observeStripeMerchCosts(claimed.context as MerchCostOrder,key,account,history!.transport,true));
      complete=await budget.run(()=>history!.finish({method:'GET',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-10-28.endive'},signal:AbortSignal.timeout(15000)}));
      if(complete||history.checkpoint().cursor!==0||budget.remaining()<history.verificationReadCount())break;
    }
    if(!complete){await save();return jsonResponse(202,{status:'history_pending',financialAuthority:false,payoutCreated:false});}
    const recorded=await save({...facts,history_generation:claimed.generation,history_revalidated:true});
    const accounting = await drainCommerceFeeAccounting(admin.client, body.order_id, budget);
    return jsonResponse(200, { ...recorded, accounting, financialAuthority: false, payoutCreated: false });
  } catch(error) {
    budget.close();
    if(history&&save){
      const resumable=error instanceof Error&&/budget_exhausted|observation_deadline/.test(error.message);
      if(!resumable)history.invalidate();
      const persisted=await save().then(()=>true).catch(()=>false);
      if(resumable&&persisted)return jsonResponse(202,{status:'history_pending',financialAuthority:false,payoutCreated:false});
    }
    // Never echo provider payload, Authorization or raw SDK errors.
    return jsonResponse(409, { error: "merch_cost_observation_incomplete", retryable: true, financialAuthority: false });
  } finally { budget.close(); }
});
