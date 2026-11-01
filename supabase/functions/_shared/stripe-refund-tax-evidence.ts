// GET-only tax evidence. A refund amount is never a tax allocation formula.
// A Tax Association is usable only when Stripe actually returns the exact
// PaymentIntent/refund links. Checkout availability must be provider-qualified;
// an absent association is unknown, not permission to fabricate a reversal.
type Json = Record<string, unknown>;
export type RefundTaxContext = {
  paymentIntentId: string; currency: string; grossMinor: number; taxMinor: number;
  refunds: { id: string; amount: number }[]; livemode: boolean;
};
const fail = (): never => { throw Error("stripe_refund_tax_evidence_invalid"); };
const obj = (v: unknown): Json => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : fail();
const check = (v: boolean) => { if (!v) fail(); };
const integer = (v: unknown): number => typeof v === "number" && Number.isSafeInteger(v) ? v : fail();
const id = (v: unknown, prefix: string): string => typeof v === "string" && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(v) ? v : fail();

export async function observeStripeRefundTax(
  context: RefundTaxContext, secret: string, transport: typeof fetch = fetch,
) {
  id(context.paymentIntentId, "pi");
  check(/^[a-z]{3}$/.test(context.currency) && integer(context.grossMinor) > 0
    && integer(context.taxMinor) >= 0 && context.taxMinor <= context.grossMinor
    && new RegExp(`^(sk|rk)_${context.livemode ? "live" : "test"}_[A-Za-z0-9_]+$`).test(secret));
  const sources = new Set([context.paymentIntentId]);
  let refunded = 0;
  for (const refund of context.refunds) {
    id(refund.id, "re"); check(!sources.has(refund.id) && integer(refund.amount) > 0);
    sources.add(refund.id); refunded += refund.amount;
  }
  check(Number.isSafeInteger(refunded) && refunded <= context.grossMinor && refunded > 0);
  const get = async (path: string, missingAllowed = false): Promise<Json | null> => {
    const response = await transport(`https://api.stripe.com/v1${path}`, {
      method: "GET", redirect: "error", headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive" },
      signal: AbortSignal.timeout(15000),
    });
    // Only an explicit absent association is a normal unknown. Authorization,
    // transport, throttling and malformed responses must retry the observation.
    if (missingAllowed && response.status === 404) return null;
    if (!response.ok) fail();
    return obj(await response.json());
  };
  const path = `/tax/associations/find?payment_intent=${context.paymentIntentId}`;
  const association = await get(path, true);
  if (!association) return null;
  check(association.object === "tax.association" && association.payment_intent === context.paymentIntentId);
  const associationId = id(association.id, "taxa");
  const bindings = (value: Json) => {
    if (value.tax_transaction_attempts === null) return null;
    check(Array.isArray(value.tax_transaction_attempts));
    const result = new Map<string, string>(), transactions = new Set<string>();
    for (const raw of value.tax_transaction_attempts as unknown[]) {
      const attempt = obj(raw);
      // An errored/extra/duplicate attempt could represent a reversal of a
      // reversal or changing lifecycle. Do not pick a convenient subset.
      if (attempt.status !== "committed") return null;
      const source = String(attempt.source), transaction = id(obj(attempt.committed).transaction, "tax");
      check(sources.has(source) && !result.has(source) && !transactions.has(transaction));
      result.set(source, transaction); transactions.add(transaction);
    }
    return result.size === sources.size ? result : null;
  };
  const linked = bindings(association);
  if (!linked) return null; // Stripe may commit reversals several minutes later.
  const originalId = linked.get(context.paymentIntentId)!;
  const totals = async (transactionId: string, reversal: boolean) => {
    const transaction = (await get(`/tax/transactions/${transactionId}`))!;
    check(transaction.object === "tax.transaction" && transaction.id === transactionId
      && transaction.livemode === context.livemode && transaction.currency === context.currency
      && transaction.type === (reversal ? "reversal" : "transaction")
      && (reversal ? obj(transaction.reversal).original_transaction === originalId : transaction.reversal === null));
    let gross = 0, tax = 0, cursor = "";
    const seen = new Set<string>();
    const add = (line: Json) => {
      const amount = integer(line.amount), amountTax = integer(line.amount_tax);
      check(["inclusive", "exclusive"].includes(String(line.tax_behavior))
        && (reversal ? amount <= 0 && amountTax <= 0 : amount >= 0 && amountTax >= 0));
      const total = amount + (line.tax_behavior === "exclusive" ? amountTax : 0);
      check(Math.abs(amountTax) <= Math.abs(total));
      gross += total; tax += amountTax;
      check(Number.isSafeInteger(gross) && Number.isSafeInteger(tax));
    };
    for (let page = 0; ; page++) {
      check(page < 20);
      const list = (await get(`/tax/transactions/${transactionId}/line_items?limit=100${cursor ? `&starting_after=${cursor}` : ""}`))!;
      check(list.object === "list" && Array.isArray(list.data) && typeof list.has_more === "boolean");
      for (const raw of list.data as unknown[]) {
        const line = obj(raw), lineId = id(line.id, "tax_li");
        check(!seen.has(lineId) && line.object === "tax.transaction_line_item"
          && line.livemode === context.livemode && line.type === transaction.type);
        seen.add(lineId); add(line);
      }
      if (!list.has_more) break;
      check((list.data as unknown[]).length > 0);
      const next = id(obj((list.data as unknown[]).at(-1)).id, "tax_li");
      check(next !== cursor); cursor = next;
    }
    check(seen.size > 0 || transaction.shipping_cost !== null);
    if (transaction.shipping_cost !== null) add(obj(transaction.shipping_cost));
    return { gross, tax };
  };
  const original = await totals(originalId, false);
  check(original.gross === context.grossMinor && original.tax === context.taxMinor);
  const refunds = [];
  let reversalMinor = 0;
  for (const refund of [...context.refunds].sort((a, b) => a.id.localeCompare(b.id))) {
    const transactionId = linked.get(refund.id)!, amounts = await totals(transactionId, true);
    check(amounts.gross === -refund.amount);
    reversalMinor -= amounts.tax;
    refunds.push({ refund_id: refund.id, refund_minor: refund.amount, tax_reversal_minor: -amounts.tax,
      tax_transaction_id: transactionId });
  }
  check(reversalMinor <= context.taxMinor && context.grossMinor - context.taxMinor >= refunded - reversalMinor);
  const final = (await get(path))!;
  check(final.id === associationId && final.object === "tax.association" && final.payment_intent === context.paymentIntentId);
  const finalBindings = bindings(final);
  check(finalBindings !== null && [...linked].every(([source, transaction]) => finalBindings!.get(source) === transaction));
  return { provenance: "stripe_tax_association_get_v1", association_id: associationId,
    original_tax_transaction_id: originalId, payment_intent_id: context.paymentIntentId,
    currency: context.currency, gross_minor: context.grossMinor, original_tax_minor: context.taxMinor,
    refunded_minor: refunded, tax_reversal_minor: reversalMinor, refunds };
}
