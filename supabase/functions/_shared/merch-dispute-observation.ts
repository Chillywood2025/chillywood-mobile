// GET-only complete provider snapshot, independent of delivery evidence.
// No raw dispute evidence/customer fields are returned or persisted.
export type MerchDisputeContext = { id: string; order_id: string; payment_intent_id: string;
  charge_id: string | null; amount_minor: number; currency: string };
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("dispute_object_invalid");
  return v as Record<string, unknown>;
};
const match = (v: boolean) => { if (!v) throw Error("dispute_snapshot_incomplete"); };
const providerId = (v: unknown, prefix: string) => { match(typeof v === "string" && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(v)); return v as string; };
export async function observeMerchDisputes(context: MerchDisputeContext, secret: string, accountId: string, transport: typeof fetch = fetch) {
  match(/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(secret) && /^acct_[A-Za-z0-9_]+$/.test(accountId));
  const get = async (path: string) => {
    const response = await transport(`https://api.stripe.com/v1${path}`, { method: "GET", redirect: "error",
      headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive" }, signal: AbortSignal.timeout(15000) });
    match(response.ok); return obj(await response.json());
  };
  const account = await get("/account"); match(account.object === "account" && account.id === accountId);
  const pi = await get(`/payment_intents/${providerId(context.payment_intent_id,"pi")}`);
  match(pi.object === "payment_intent" && pi.id === context.payment_intent_id && pi.livemode === false
    && pi.status === "succeeded" && pi.amount === context.amount_minor && pi.amount_received === context.amount_minor && pi.currency === context.currency);
  const chargeId = providerId(pi.latest_charge,"ch"); match(!context.charge_id || context.charge_id === chargeId);
  const charge = async () => {
    const c = await get(`/charges/${chargeId}`);
    match(c.object === "charge" && c.id === chargeId && c.payment_intent === context.payment_intent_id && c.livemode === false
      && c.paid === true && c.captured === true && c.amount === context.amount_minor && c.amount_captured === context.amount_minor && c.currency === context.currency && typeof c.disputed === "boolean");
    return c.disputed as boolean;
  };
  const list = async () => {
    const rows: {id: string; status: string; amount: number; created: number}[] = []; let cursor = "";
    for (let page=0; page<20; page++) {
      const p = await get(`/disputes?charge=${chargeId}&limit=100${cursor ? `&starting_after=${cursor}` : ""}`);
      match(p.object === "list" && Array.isArray(p.data) && typeof p.has_more === "boolean");
      for (const value of p.data as unknown[]) {
        const d=obj(value), id=providerId(d.id,"du");
        match(d.object === "dispute" && d.charge === chargeId && d.payment_intent === context.payment_intent_id && d.livemode === false
          && d.currency === context.currency && typeof d.amount === "number" && Number.isSafeInteger(d.amount) && d.amount>0
          && typeof d.created === "number" && Number.isSafeInteger(d.created) && d.created>0 && typeof d.status === "string"
          && ["warning_needs_response","warning_under_review","warning_closed","needs_response","under_review","appeal_needs_response","appeal_under_review","won","lost","prevented"].includes(d.status)
          && !rows.some(row=>row.id===id));
        rows.push({id,status:d.status as string,amount:d.amount as number,created:d.created as number});
      }
      if (!p.has_more) return rows.sort((a,b)=>a.id.localeCompare(b.id));
      match((p.data as unknown[]).length>0); const next=providerId(obj((p.data as unknown[]).at(-1)).id,"du"); match(next!==cursor);cursor=next;
    }
    throw Error("dispute_pagination_incomplete");
  };
  const before=await charge(), disputes=await list(), afterList=await list(), after=await charge();
  match(before===after && JSON.stringify(disputes)===JSON.stringify(afterList));
  return {account_id:accountId, environment:"sandbox", order_id:context.order_id, payment_intent_id:context.payment_intent_id,
    charge_id:chargeId, currency:context.currency, amount_minor:context.amount_minor, disputed:after, disputes, complete:true, financial_authority:false};
}
