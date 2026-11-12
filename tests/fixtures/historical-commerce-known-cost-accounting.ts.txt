/** Deterministic calculation, never an evidence issuer or payout permit.
 * The service must bind the accepted version and authenticated observations.
 * This policy explicitly allows later adjustments; it does not claim that all
 * future provider fees are final. Currency remains the product's USD-only rail.
 */
export const KNOWN_COST_POLICY = "known_costs_future_unpaid_adjustments_v1";
export const ITEMIZED_FEE_SEMANTICS = "all_fees.incurred_at.itemized.2:amount_excludes_tax_v1";
type Row = { feeTransactionId: string; incurredBy: string; incurredByType: string; amountMinor: number;
 taxMinor: number; currency: string; product: string; suite: string; featureName: string; pricingTier: string;
 settledVia: string; balanceTransactionId?: string | null };
type Report = { accountId: string; environment: string; chargeId?: string; refundIds?: string[]; rows: Row[];
 providerBinding: string; reportType: string; contentSha256: string; reportRunId: string; reportSucceededAt: number;
 intervalStart: number; intervalEnd: number };
export type KnownCostInput = {
 policyVersion: string; feeSemantics: string; accountId: string; environment: "test" | "live";
 chargeId: string; currency: string; grossMinor: number; taxMinor: number; refundedMinor: number;
 taxReversalMinor: number; platformBps: number;
 // Every balance row is obtained from the same authenticated charge/refund
 // chain; fees can be negative for a separately identified fee refund.
 balances: { id: string; objectId: string; feeMinor: number }[];
 reports: Report[];
};
const fail=(reason:string):never=>{throw new Error(`known_fee_${reason}`);};
const safe=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n);
const sum=(a:number,b:number)=>{const n=a+b;if(!safe(n))fail("amount_overflow");return n;};
const key=(r:Row)=>JSON.stringify([r.feeTransactionId,r.incurredBy,r.incurredByType,r.currency,r.product,r.suite,r.featureName,r.pricingTier]);
const facts=(r:Row)=>JSON.stringify([key(r),r.amountMinor,r.taxMinor,r.settledVia,r.balanceTransactionId??null]);

export function calculateKnownCommerceCosts(input:KnownCostInput) {
 if(input.policyVersion!==KNOWN_COST_POLICY||input.feeSemantics!==ITEMIZED_FEE_SEMANTICS)fail("policy_unqualified");
 if(!/^acct_[A-Za-z0-9]+$/.test(input.accountId)||!/^ch_[A-Za-z0-9]+$/.test(input.chargeId)
  ||!["test","live"].includes(input.environment)||input.currency!=="usd")fail("identity_invalid");
 for(const n of [input.grossMinor,input.taxMinor,input.refundedMinor,input.taxReversalMinor,input.platformBps])
  if(!safe(n)||n<0)fail("amount_invalid");
 if(input.refundedMinor>input.grossMinor||input.taxMinor>input.grossMinor||input.taxReversalMinor>input.taxMinor
  ||input.taxReversalMinor>input.refundedMinor||input.platformBps>10000)fail("economics_invalid");
 if(!Array.isArray(input.balances)||input.balances.length>2001||!Array.isArray(input.reports)||input.reports.length>128)fail("input_bounds");
 const balances=new Map<string,{objectId:string;feeMinor:number}>();
 for(const b of input.balances){
  if(!/^txn_[A-Za-z0-9]+$/.test(b.id)||!safe(b.feeMinor)||balances.has(b.id)
   ||!(b.objectId===input.chargeId||/^re_[A-Za-z0-9]+$/.test(b.objectId)))fail("balance_identity_invalid");
  balances.set(b.id,b);
 }
 if([...balances.values()].filter(b=>b.objectId===input.chargeId).length!==1)fail("charge_balance_required");
 const refundIds=[...balances.values()].map(b=>b.objectId).filter(id=>id!==input.chargeId).sort();
 if(new Set(refundIds).size!==refundIds.length)fail("duplicate_refund");
 const components=new Map<string,Row>(); const runs=new Map<string,string>();
 for(const report of input.reports){
  if(report.accountId!==input.accountId||report.environment!==input.environment||report.chargeId!==input.chargeId
   ||JSON.stringify(report.refundIds)!==JSON.stringify(refundIds)||report.providerBinding!=="authenticated_report"
   ||report.reportType!=="all_fees.incurred_at.itemized.2"||!/^[a-f0-9]{64}$/.test(report.contentSha256)
   ||!/^frr_[A-Za-z0-9]+$/.test(report.reportRunId)||!safe(report.reportSucceededAt)||report.reportSucceededAt<=0
   ||!safe(report.intervalStart)||!safe(report.intervalEnd)||report.intervalStart<0||report.intervalEnd<=report.intervalStart
   ||!Array.isArray(report.rows)||report.rows.length>10000)fail("report_binding_invalid");
  const reportFacts=JSON.stringify([report.contentSha256,report.intervalStart,report.intervalEnd,report.reportSucceededAt,report.rows.map(facts).sort()]);
  const priorRun=runs.get(report.reportRunId);
  if(priorRun&&priorRun!==reportFacts)fail("report_replay_conflict");
  runs.set(report.reportRunId,reportFacts);
  const seen=new Set<string>();
  for(const r of report.rows){
   if(!safe(r.amountMinor)||!safe(r.taxMinor)||r.currency!==input.currency
    ||!(r.incurredBy===input.chargeId&&r.incurredByType==="charge"||refundIds.includes(r.incurredBy)&&r.incurredByType==="refund"))fail("component_binding_invalid");
   if(!r.feeTransactionId||!r.product||!r.suite||!r.featureName||typeof r.pricingTier!=="string")fail("component_identity_invalid");
   const k=key(r);if(seen.has(k))fail("duplicate_component");seen.add(k);
   const prior=components.get(k);
   if(prior&&facts(prior)!==facts(r))fail("component_conflict");
   components.set(k,r);
  }
 }
 // No report snapshot means there has been no observation of late/standalone
 // fees at all. It cannot silently mean a zero tax-service cost.
 if(!runs.size)fail("report_snapshot_required");
 const reportBalances=new Map<string,{objectId:string;feeMinor:number}>();
 for(const r of components.values()){
  if(!r.balanceTransactionId||!/^txn_[A-Za-z0-9]+$/.test(r.balanceTransactionId))fail("balance_attribution_required");
  // Credit-funded fees and invoiced/mixed charges need an explicit net-cost
  // allocation rule. They are not silently charged again to creators.
  if(r.settledVia!=="balance")fail("settlement_method_unqualified");
  const current=reportBalances.get(r.balanceTransactionId);
  if(current&&current.objectId!==r.incurredBy)fail("balance_cross_object");
  reportBalances.set(r.balanceTransactionId,{objectId:r.incurredBy,feeMinor:sum(current?.feeMinor??0,sum(r.amountMinor,r.taxMinor))});
 }
 let totalFeeMinor=0;
 for(const [id,b] of balances){
  const report=reportBalances.get(id);
  if(report&&(report.objectId!==b.objectId||report.feeMinor!==b.feeMinor))fail("inline_report_overlap_unreconciled");
  totalFeeMinor=sum(totalFeeMinor,b.feeMinor);
 }
 for(const [id,b] of reportBalances)if(!balances.has(id))totalFeeMinor=sum(totalFeeMinor,b.feeMinor);
 // An over-credit needs independent recovery/rebate attribution. Never turn a
 // negative fee observation into extra sale proceeds automatically.
 if(totalFeeMinor<0)fail("net_fee_credit_review_required");
 const netMinor=sum(sum(sum(input.grossMinor,-input.taxMinor),-input.refundedMinor),sum(input.taxReversalMinor,-totalFeeMinor));
 const positive=Math.max(netMinor,0);
 const platformMinor=Number(BigInt(positive)*BigInt(input.platformBps)/10000n);
 return {policyVersion:KNOWN_COST_POLICY,feeSemantics:ITEMIZED_FEE_SEMANTICS,totalFeeMinor,
  knownNetMinor:netMinor,platformMinor,creatorMinor:positive-platformMinor,recoveryMinor:Math.max(-netMinor,0),
  reportCount:runs.size,componentCount:components.size,financialAuthority:false,
  futureAdjustmentsPossible:true,finalFees:false};
}
