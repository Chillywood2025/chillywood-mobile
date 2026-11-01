/** Server-owned cashout saga. A transfer funds a connected balance; it is never
 * evidence that the creator's bank received money. All mutations are preceded
 * by a durable SQL dispatch claim. Ambiguous dispatch is GET-only thereafter. */
export type CashoutContext = {
  requestId: string; executionId: string; platformAccountId: string;
  accountId: string; destinationId: string; environment: "live" | "test";
  method: "standard" | "instant"; sourceType: "card" | "bank_account";
  grossMinor: number; appFeeMinor: number; expectedProviderFeeMinor: number;
  bankMinor: number; currency: "usd"; phase: string;
  transferId: string | null; payoutId: string | null; reversalId: string | null;
  dispatchKey: string; dispatchedAt: number | null;
  inlineKnownZeroQualified?: boolean;
};
export type CashoutStore = {
  read(requestId: string): Promise<CashoutContext>;
  claim(requestId: string, stage: "funding" | "payout" | "reversal" | "funding_return"): Promise<{claimed: boolean; token: string}>;
  observe(requestId: string, token: string | null, facts: Record<string, unknown>): Promise<unknown>;
};
type Json = Record<string, any>;
const fail = (reason: string): never => { throw Error(`cashout_${reason}`); };
const objectId = (value: unknown, prefix: string) => typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
const uuid = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const minor = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647;
export async function readCashoutBody(body: ReadableStream<Uint8Array> | null, maximum: number, milliseconds = 10000) {
  if (!body) return "";
  const reader = body.getReader(), chunks: Uint8Array[] = []; let size = 0, expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, milliseconds);
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > maximum) fail("body_too_large"); chunks.push(part.value);
    }
    if (expired) fail("body_deadline");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function validateCashoutContext(c: CashoutContext) {
  if (!c || !uuid(c.requestId) || !uuid(c.executionId) || !objectId(c.platformAccountId, "acct")
    || !objectId(c.accountId, "acct") || c.platformAccountId === c.accountId
    || !(objectId(c.destinationId, "ba") || objectId(c.destinationId, "card"))
    || !["test", "live"].includes(c.environment) || !["standard", "instant"].includes(c.method)
    || !["card", "bank_account"].includes(c.sourceType) || c.currency !== "usd"
    || ![c.grossMinor, c.appFeeMinor, c.expectedProviderFeeMinor, c.bankMinor].every(minor)
    || c.bankMinor <= 0 || c.bankMinor + c.appFeeMinor + c.expectedProviderFeeMinor !== c.grossMinor
    || (c.method === "standard" && c.appFeeMinor !== 0)
    || c.dispatchKey !== `cw-cashout-${c.executionId}`) fail("context_invalid");
}

export function normalizeCashoutTransfer(t: Json, c: CashoutContext) {
  if (t?.object !== "transfer" || !objectId(t.id, "tr") || t.livemode !== (c.environment === "live")
    || t.amount !== c.bankMinor || t.currency !== c.currency || t.destination !== c.accountId
    || t.metadata?.chillywood_cashout_execution !== c.executionId
    || t.metadata?.chillywood_cashout_request !== c.requestId
    || !minor(t.amount_reversed) || t.amount_reversed > t.amount
    || t.reversed !== (t.amount_reversed === t.amount)
    || (c.transferId !== null && t.id !== c.transferId)) fail("transfer_binding_invalid");
  return { kind: "transfer", objectId: t.id, amountMinor: t.amount, reversedMinor: t.amount_reversed,
    fullyReversed: t.reversed, accountId: c.accountId, environment: c.environment };
}
export function normalizeCashoutPayout(p: Json, c: CashoutContext) {
  if (p?.object !== "payout" || !objectId(p.id, "po") || p.livemode !== (c.environment === "live")
    || p.amount !== c.bankMinor || p.currency !== c.currency || p.destination !== c.destinationId
    || p.method !== c.method || p.source_type !== c.sourceType || p.automatic !== false
    || p.metadata?.chillywood_cashout_execution !== c.executionId
    || p.metadata?.chillywood_cashout_request !== c.requestId
    || !["pending", "in_transit", "paid", "failed", "canceled"].includes(p.status)
    || (c.payoutId !== null && p.id !== c.payoutId)) fail("payout_binding_invalid");
  // Fee retention already happened before funding. Even an unexpected fee of
  // zero attached to another application is not silently accepted.
  if (p.application_fee != null) fail("duplicate_application_fee");
  return { kind: "payout", objectId: p.id, status: p.status, amountMinor: p.amount,
    accountId: c.accountId, destinationId: c.destinationId, environment: c.environment,
    failureBalanceTransactionId: objectId(p.failure_balance_transaction, "txn") ? p.failure_balance_transaction : null,
    balanceTransactionId: objectId(p.balance_transaction, "txn") ? p.balance_transaction : null };
}

/** At most one POST per invocation and only after an exact durable claim.
 * A network exception, 4xx, 429 or 5xx never means that funds were not moved.
 * Provider credentials, destinations and economics never come from a client. */
export async function runCreatorCashout(requestId: string, store: CashoutStore, secret: string,
  transport: typeof fetch = fetch, now: () => number = Date.now, reconcileOnly = false) {
  const c = await store.read(requestId); validateCashoutContext(c);
  if (!new RegExp(`^(sk|rk)_${c.environment}_[A-Za-z0-9]+$`).test(secret)) fail("credential_mode_mismatch");
  const deadline = now() + 60000; let reads = 0;
  const call = async (path: string, accountId: string | null, body?: URLSearchParams, key?: string) => {
    if (now() >= deadline || (!body && ++reads > 24)) fail("provider_budget_exhausted");
    const response = await transport(`https://api.stripe.com${path}`, {
      method: body ? "POST" : "GET", redirect: "error", body,
      headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive",
        ...(accountId ? { "Stripe-Account": accountId } : {}),
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": key! } : {}) },
      signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline - now()))),
    });
    if (!response.ok) fail("provider_request_unresolved");
    const raw = await readCashoutBody(response.body, 500000, Math.max(1, Math.min(10000, deadline - now())));
    return JSON.parse(raw) as Json;
  };
  const platform = await call("/v1/account", null);
  if (platform.object !== "account" || platform.id !== c.platformAccountId) fail("platform_account_mismatch");
  const metadata = (body: URLSearchParams) => {
    body.set("metadata[chillywood_cashout_execution]", c.executionId);
    body.set("metadata[chillywood_cashout_request]", c.requestId);
    return body;
  };
  if (["funding_return_pending", "funding_return_unknown"].includes(c.phase)) {
    if (!objectId(c.transferId, "tr") || c.payoutId !== null) fail("funding_return_context_invalid");
    const transfer = await call(`/v1/transfers/${c.transferId}`, null);
    normalizeCashoutTransfer(transfer, c);
    let reversal: Json | null = null;
    if (c.phase === "funding_return_pending" && transfer.amount_reversed === 0 && !reconcileOnly) {
      const claim = await store.claim(requestId, "funding_return");
      if (!claim.claimed) return { status: "not_claimed" };
      if (!uuid(claim.token)) fail("claim_invalid");
      // Durable freeze and single-use claim precede this one attempt. Even a
      // rejected HTTP response becomes GET-only; never infer safe redispatch.
      reversal = await call(`/v1/transfers/${c.transferId}/reversals`, null,
        metadata(new URLSearchParams({ amount: String(c.bankMinor) })), `${c.dispatchKey}-funding-return`);
    } else {
      let cursor: string | null = null;
      for (;;) {
        const query = new URLSearchParams({ limit: "100" });
        if (cursor) query.set("starting_after", cursor);
        const list = await call(`/v1/transfers/${c.transferId}/reversals?${query}`, null);
        if (list.object !== "list" || !Array.isArray(list.data) || typeof list.has_more !== "boolean") fail("provider_page_invalid");
        for (const item of list.data) {
          if (item.metadata?.chillywood_cashout_execution !== c.executionId) continue;
          if (reversal && reversal.id !== item.id) fail("duplicate_provider_objects");
          reversal = item;
        }
        if (!list.has_more) break;
        const next = list.data.at(-1)?.id;
        if (!objectId(next, "trr") || next === cursor) fail("provider_page_invalid");
        cursor = next;
      }
    }
    if (!reversal) return { status: c.phase, ownerAction: "Verify funding return; do not retry bank payout or reversal." };
    if (reversal.object !== "transfer_reversal" || !objectId(reversal.id, "trr") || reversal.transfer !== c.transferId
      || reversal.amount !== c.bankMinor || reversal.currency !== c.currency
      || reversal.metadata?.chillywood_cashout_execution !== c.executionId
      || reversal.metadata?.chillywood_cashout_request !== c.requestId
      || !objectId(reversal.balance_transaction, "txn") || !objectId(transfer.balance_transaction, "txn")) fail("funding_return_binding_invalid");
    const original = await call(`/v1/balance_transactions/${transfer.balance_transaction}`, null);
    const returned = await call(`/v1/balance_transactions/${reversal.balance_transaction}`, null);
    for (const [bt, id, source, amount] of [[original, transfer.balance_transaction, c.transferId, -c.bankMinor],
      [returned, reversal.balance_transaction, reversal.id, c.bankMinor]] as const) {
      if (bt.object !== "balance_transaction" || bt.id !== id || bt.source !== source || bt.currency !== c.currency
        || bt.amount !== amount || !Number.isSafeInteger(bt.fee) || Math.abs(bt.fee) > 2147483647
        || bt.net !== amount - bt.fee || bt.status !== "available") fail("funding_return_balance_unconfirmed");
    }
    if (original.type !== "transfer" || !["transfer_refund", "transfer_cancel"].includes(returned.type)) fail("funding_return_balance_type_invalid");
    const proof = (bt: Json) => ({ transactionId: bt.id, sourceId: bt.source, amountMinor: bt.amount,
      feeMinor: bt.fee, netMinor: bt.net, currency: bt.currency, status: bt.status, type: bt.type });
    return store.observe(requestId, null, { kind: "funding_return", objectId: reversal.id, transferId: c.transferId,
      amountMinor: c.bankMinor, accountId: c.accountId, platformAccountId: c.platformAccountId, environment: c.environment,
      fundingBalance: proof(original), returnBalance: proof(returned) });
  }
  // Unknown dispatch: search the exact account and metadata, with complete
  // pagination within a bounded budget. An empty result NEVER authorizes POST.
  const recover = async (kind: "transfer" | "payout") => {
    let cursor: string | null = null; let found: Json | null = null;
    for (;;) {
      const q = new URLSearchParams({ limit: "100" });
      if (kind === "transfer") q.set("destination", c.accountId);
      if (c.dispatchedAt !== null) q.set("created[gte]", String(Math.max(0, c.dispatchedAt - 120)));
      if (cursor) q.set("starting_after", cursor);
      const list = await call(`/v1/${kind === "transfer" ? "transfers" : "payouts"}?${q}`, kind === "payout" ? c.accountId : null);
      if (list.object !== "list" || !Array.isArray(list.data) || typeof list.has_more !== "boolean") fail("provider_page_invalid");
      for (const item of list.data) {
        if (item.metadata?.chillywood_cashout_execution !== c.executionId) continue;
        if (found && found.id !== item.id) fail("duplicate_provider_objects");
        found = item;
      }
      if (!list.has_more) return found;
      const next = list.data.at(-1)?.id;
      if (!objectId(next, kind === "transfer" ? "tr" : "po") || cursor === next) fail("provider_page_invalid");
      cursor = next;
    }
  };
  if (c.phase === "funding_unknown") {
    const transfer = await recover("transfer");
    return transfer ? store.observe(requestId, null, normalizeCashoutTransfer(transfer, c)) : { status: "funding_unknown" };
  }
  if (c.phase === "payout_unknown") {
    const payout = await recover("payout");
    return payout ? store.observe(requestId, null, normalizeCashoutPayout(payout, c)) : { status: "payout_unknown" };
  }
  if (["payout_pending", "paid", "return_pending", "needs_review"].includes(c.phase) && c.payoutId) {
    const payout = normalizeCashoutPayout(await call(`/v1/payouts/${c.payoutId}`, c.accountId), c);
    if (payout.status === "paid" && payout.balanceTransactionId && c.inlineKnownZeroQualified === true && c.expectedProviderFeeMinor === 0) {
      const bt = await call(`/v1/balance_transactions/${payout.balanceTransactionId}`, c.accountId);
      if (bt.object !== "balance_transaction" || bt.id !== payout.balanceTransactionId || bt.source !== payout.objectId
        || bt.type !== "payout" || bt.currency !== c.currency || bt.amount !== -c.bankMinor || bt.net !== -c.bankMinor
        || bt.fee !== 0 || bt.status !== "available" || !Array.isArray(bt.fee_details) || bt.fee_details.some((fee: Json) => fee.amount !== 0))
        fail("inline_zero_balance_unqualified");
      return store.observe(requestId, null, { ...payout, inlineZeroBalance: { transactionId: bt.id, payoutId: bt.source,
        accountId: c.accountId, environment: c.environment, currency: bt.currency, amountMinor: bt.amount,
        netMinor: bt.net, feeMinor: 0, status: bt.status, type: bt.type } });
    }
    if (["failed", "canceled"].includes(payout.status) && payout.failureBalanceTransactionId) {
      const bt = await call(`/v1/balance_transactions/${payout.failureBalanceTransactionId}`, c.accountId);
      if (bt.object !== "balance_transaction" || bt.id !== payout.failureBalanceTransactionId
        || bt.source !== payout.objectId || bt.currency !== c.currency || bt.amount !== c.bankMinor
        || bt.status !== "available" || bt.fee !== 0 || bt.net !== c.bankMinor) fail("bank_return_unconfirmed");
      return store.observe(requestId, null, { ...payout, returnedMinor: bt.net, returnTransactionId: bt.id });
    }
    return store.observe(requestId, null, payout);
  }
  if (c.phase === "reversal_unknown" && c.transferId) {
    const transfer = normalizeCashoutTransfer(await call(`/v1/transfers/${c.transferId}`, null), c);
    // The DB additionally requires bank-return evidence before funds can release.
    return store.observe(requestId, null, transfer);
  }
  if (!["prepared", "funded", "return_confirmed"].includes(c.phase)) return { status: c.phase };
  if (reconcileOnly) return { status: c.phase };
  const stage = c.phase === "prepared" ? "funding" : c.phase === "funded" ? "payout" : "reversal";
  // Recheck mutable provider capabilities immediately before every new write.
  // Returning exact previously funded principal does not depend on a still-
  // present external bank destination or the creator keeping a login active.
  if (stage !== "reversal") {
  const account = await call(`/v2/core/accounts/${c.accountId}?include[0]=configuration.recipient&include[1]=defaults`, null);
  if (account.id !== c.accountId || account.livemode !== (c.environment === "live")
    || account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status !== "active"
    || account.defaults?.responsibilities?.fees_collector !== "application"
    || account.defaults?.responsibilities?.losses_collector !== "application") fail("account_capability_unqualified");
  const settings = await call(`/v1/accounts/${c.accountId}`, null);
  if (settings.id !== c.accountId || settings.settings?.payouts?.schedule?.interval !== "manual"
    || settings.country !== "US" || settings.default_currency !== "usd") fail("manual_payout_schedule_required");
  const destination = await call(`/v1/accounts/${c.accountId}/external_accounts/${c.destinationId}`, null);
  if (destination.id !== c.destinationId || destination.account !== c.accountId || destination.currency !== "usd"
    || destination.country !== "US" || !Array.isArray(destination.available_payout_methods)
    || !destination.available_payout_methods.includes(c.method)) fail("destination_unqualified");
  }
  if (stage === "payout") {
    const balance = await call("/v1/balance", c.accountId);
    if (balance.object !== "balance" || balance.livemode !== (c.environment === "live")) fail("balance_unqualified");
    const entries = c.method === "instant" ? balance.instant_available : balance.available;
    const usd = Array.isArray(entries) ? entries.find((entry: Json) => entry.currency === "usd") : null;
    const eligible = c.method === "instant"
      ? usd?.net_available?.find((entry: Json) => entry.destination === c.destinationId)?.amount
      : usd?.source_types?.[c.sourceType];
    if (!minor(eligible) || eligible < c.bankMinor) return { status: "waiting_for_connected_balance" };
  }
  // The claim rechecks switches, original user/session/eligibility/obligations,
  // qualification expiry and request economics after obtaining creator locks.
  const claim = await store.claim(requestId, stage);
  if (!claim.claimed) return { status: "not_claimed" };
  if (!uuid(claim.token)) fail("claim_invalid");
  const body = metadata(new URLSearchParams({ amount: String(c.bankMinor) }));
  let object: Json;
  if (stage === "funding") {
    body.set("currency", c.currency); body.set("destination", c.accountId);
    object = await call("/v1/transfers", null, body, `${c.dispatchKey}-funding`);
    return store.observe(requestId, claim.token, normalizeCashoutTransfer(object, c));
  }
  if (stage === "payout") {
    body.set("currency", c.currency); body.set("destination", c.destinationId);
    body.set("method", c.method); body.set("source_type", c.sourceType);
    object = await call("/v1/payouts", c.accountId, body, `${c.dispatchKey}-payout`);
    return store.observe(requestId, claim.token, normalizeCashoutPayout(object, c));
  }
  if (!c.transferId) fail("funding_reference_required");
  object = await call(`/v1/transfers/${c.transferId}/reversals`, null, body, `${c.dispatchKey}-return`);
  if (object.object !== "transfer_reversal" || !objectId(object.id, "trr")
    || object.transfer !== c.transferId || object.amount !== c.bankMinor || object.currency !== c.currency
    || object.metadata?.chillywood_cashout_execution !== c.executionId) fail("reversal_binding_invalid");
  return store.observe(requestId, claim.token, { kind: "reversal", objectId: object.id,
    transferId: c.transferId, amountMinor: object.amount, accountId: c.accountId, environment: c.environment });
}
