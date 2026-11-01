import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { drainCommerceFeeAccounting } from "../_shared/commerce-fee-accounting-drain.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { observeStripeAuctionCosts, type AuctionCostContext } from "../_shared/stripe-auction-cost-observation.ts";
import {createStripeHistoryCheckpoint} from "../_shared/stripe-history-checkpoint.ts";
import {createMerchObservationBudget} from "../_shared/merch-observation-budget.ts";

// Default JWT verification plus exact existing server authority. GET-only at
// Stripe; recording an observed HELD allocation never dispatches a transfer.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  const budget=createMerchObservationBudget(fetch,65000);
  let history:ReturnType<typeof createStripeHistoryCheckpoint>|null=null;
  let save:((facts?:Record<string,unknown>)=>Promise<Record<string,unknown>>)|null=null;
  try {
    const body = await budget.run(()=>req.json(),5000);
    if (!body || Object.keys(body).some(name => name !== "contract_id")
      || typeof body.contract_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.contract_id))
      return jsonResponse(400, { error: "contract_id_only_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "server_not_configured" });
    const context = await budget.run(()=>admin.client.rpc("get_auction_cost_reconciliation_context", { p_contract_id: body.contract_id }),5000);
    if (context.error || !context.data) throw Error("auction_context_unavailable");
    const live = context.data.environment === "live";
    const account = readOptionalEnv(live ? "STRIPE_AUCTION_LIVE_OBSERVATION_ACCOUNT_ID" : "STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID");
    const key = readOptionalEnv(live ? "STRIPE_AUCTION_LIVE_OBSERVATION_KEY" : "STRIPE_AUCTION_PLATFORM_TEST_KEY");
    if (!["test", "live"].includes(context.data.environment) || !account || !key
      || !new RegExp(`^(rk|sk)_${live ? "live" : "test"}_[A-Za-z0-9_]+$`).test(key)
      || context.data.platform_account_id !== account)
      return jsonResponse(503, { error: "auction_cost_reconciliation_not_configured", financialAuthority: false });
    const checkpoint=await budget.run(()=>admin.client.rpc('begin_stripe_cost_history',{p_domain:'auction',p_source_id:body.contract_id,p_account_id:account}),5000);
    if(checkpoint.error||!checkpoint.data||checkpoint.data.busy)throw Error('history_lease_unavailable');
    const claimed=checkpoint.data;
    history=createStripeHistoryCheckpoint(claimed.checkpoint,budget.transport,budget.remaining);
    save=async facts=>{
      let timeout:ReturnType<typeof setTimeout>|undefined;
      try{const recorded=await Promise.race([admin.client.rpc('save_stripe_cost_history',{p_domain:'auction',p_source_id:body.contract_id,
        p_generation:claimed.generation,p_lease:claimed.lease,p_checkpoint:history!.checkpoint(),p_facts:facts??null}),
        new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('history_save_deadline')),5000);})]);
        if(recorded.error||!recorded.data)throw Error('history_save_failed');return recorded.data as Record<string,unknown>;
      }finally{if(timeout)clearTimeout(timeout);}
    };
    let facts:Awaited<ReturnType<typeof observeStripeAuctionCosts>>|null=null,complete=false;
    for(let round=0;round<2;round++){
      facts=await budget.run(()=>observeStripeAuctionCosts(claimed.context as AuctionCostContext,key,account,history!.transport,true));
      complete=await budget.run(()=>history!.finish({method:'GET',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-10-28.endive'},signal:AbortSignal.timeout(15000)}));
      if(complete||history.checkpoint().cursor!==0||budget.remaining()<history.verificationReadCount())break;
    }
    if(!complete){await save();return jsonResponse(202,{status:'history_pending',financialAuthority:false,transferCreated:false});}
    const recorded=await save({...facts,history_generation:claimed.generation,history_revalidated:true});
    const accounting = await drainCommerceFeeAccounting(admin.client, body.contract_id, budget);
    return jsonResponse(200, { ...recorded, accounting, financialAuthority: false, transferCreated: false });
  } catch(error) {
    budget.close();
    if(history&&save){
      const resumable=error instanceof Error&&/budget_exhausted|observation_deadline/.test(error.message);
      if(!resumable)history.invalidate();
      const persisted=await save().then(()=>true).catch(()=>false);
      if(resumable&&persisted)return jsonResponse(202,{status:'history_pending',financialAuthority:false,transferCreated:false});
    }
    return jsonResponse(409, { error: "auction_cost_observation_incomplete", retryable: true, financialAuthority: false });
  }finally{budget.close();}
});
