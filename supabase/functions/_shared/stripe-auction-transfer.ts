export type AuctionTransferOperation = {
  id: string; contract_id: string; platform_account_id: string; destination: string;
  source_charge_id: string; amount_minor: number; currency: string; transfer_group: string;
  idempotency_key: string; environment: string; dispatchAuthorized: boolean;
  provider_transfer_id?: string | null;
};
type Transport = typeof fetch;
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("invalid_provider_object");
  return v as ObjectValue;
};
const reference = (v: unknown) => typeof v === "string" ? v : object(v).id;
function validateOperation(o: AuctionTransferOperation, key: string, account: string) {
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key) || o.environment !== "test"
    || o.platform_account_id !== account || !/^acct_[A-Za-z0-9]+$/.test(account)
    || !/^acct_[A-Za-z0-9]+$/.test(o.destination) || o.destination === account
    || !/^ch_[A-Za-z0-9]+$/.test(o.source_charge_id) || !Number.isSafeInteger(o.amount_minor) || o.amount_minor <= 0
    || o.currency !== "usd" || o.transfer_group !== `auction-contract-${o.contract_id}`
    || o.idempotency_key !== `auction-transfer-v1-${o.contract_id}`) throw Error("transfer_contract_invalid");
}
function transferEvidence(value: unknown, o: AuctionTransferOperation) {
  const t = object(value), m = object(t.metadata);
  if (t.object !== "transfer" || typeof t.id !== "string" || !/^tr_[A-Za-z0-9]+$/.test(t.id)
    || t.livemode !== false || t.amount !== o.amount_minor || t.currency !== o.currency
    || reference(t.destination) !== o.destination || reference(t.source_transaction) !== o.source_charge_id
    || t.transfer_group !== o.transfer_group || m.auction_operation_id !== o.id || m.auction_contract_id !== o.contract_id
    || !Number.isSafeInteger(t.amount_reversed) || Number(t.amount_reversed) < 0 || Number(t.amount_reversed) > o.amount_minor
    || (o.provider_transfer_id && t.id !== o.provider_transfer_id)) throw Error("transfer_evidence_mismatch");
  return { id: t.id, object: "transfer", livemode: false, platform_account_id: o.platform_account_id,
    destination: o.destination, source_transaction: o.source_charge_id, amount: o.amount_minor, currency: o.currency,
    transfer_group: o.transfer_group, amount_reversed: t.amount_reversed,
    metadata: { auction_operation_id: o.id, auction_contract_id: o.contract_id } };
}
function client(key: string, transport: Transport) {
  return async (path: string, body?: URLSearchParams, idempotency?: string) => {
    const response = await transport(`https://api.stripe.com/v1${path}`, { method: body ? "POST" : "GET", redirect: "error",
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-10-28.endive",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idempotency! } : {}) },
      body, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error("provider_result_unknown");
    return object(await response.json());
  };
}
// The database consumes the sole dispatch permit BEFORE invoking this method.
// All errors are unknown, including HTTP 4xx; no blind retry/new key is exposed.
export async function preflightAuctionTestTransfer(o: AuctionTransferOperation, key: string, account: string, transport: Transport = fetch) {
  validateOperation(o, key, account);
  const get = client(key, transport), actual = await get("/account");
  if (actual.object !== "account" || actual.id !== account) throw Error("platform_account_mismatch");
  const recipient = await get(`/accounts/${o.destination}`);
  if (recipient.id !== o.destination || recipient.object !== "account" || object(recipient.capabilities).transfers !== "active")
    throw Error("recipient_transfer_capability_unavailable");
  const charge = await get(`/charges/${o.source_charge_id}`);
  if (charge.id !== o.source_charge_id || charge.object !== "charge" || charge.livemode !== false
    || charge.paid !== true || charge.captured !== true || charge.disputed !== false || charge.refunded !== false
    || charge.amount_refunded !== 0 || charge.currency !== o.currency || !Number.isSafeInteger(charge.amount_captured)
    || Number(charge.amount_captured) < o.amount_minor || typeof charge.balance_transaction !== "string"
    || !/^txn_[A-Za-z0-9]+$/.test(charge.balance_transaction)) throw Error("source_charge_not_available");
  const balance = await get(`/balance_transactions/${charge.balance_transaction}`);
  if (balance.id !== charge.balance_transaction || balance.object !== "balance_transaction" || balance.type !== "charge"
    || reference(balance.source) !== o.source_charge_id || balance.currency !== o.currency || balance.status !== "available"
    || !Number.isSafeInteger(balance.net) || Number(balance.net) < o.amount_minor) throw Error("source_balance_not_available");
  return {platform_account_id:o.platform_account_id,destination:o.destination,source_charge_id:o.source_charge_id,
    amount_minor:o.amount_minor,currency:o.currency,environment:"test",provider_ready:true,financial_authority:false};
}
// Automatic orchestration runs preflight BEFORE the durable sole-permit claim.
// This post-only helper accepts only the DB-issued dispatchAuthorized operation.
export async function dispatchPreflightedAuctionTestTransfer(o: AuctionTransferOperation, key: string, account: string, transport: Transport = fetch) {
  validateOperation(o,key,account);
  if(o.dispatchAuthorized!==true)throw Error("transfer_dispatch_not_authorized");
  const get=client(key,transport);
  const body = new URLSearchParams({ amount: String(o.amount_minor), currency: o.currency, destination: o.destination,
    source_transaction: o.source_charge_id, transfer_group: o.transfer_group,
    "metadata[auction_operation_id]": o.id, "metadata[auction_contract_id]": o.contract_id });
  return transferEvidence(await get("/transfers", body, o.idempotency_key), o);
}

// Compatibility: manually addressed test executor retains its stricter
// preflight reads. It remains separately disabled; it is not an auto fallback.
export async function dispatchAuctionTestTransfer(o: AuctionTransferOperation,key:string,account:string,transport:Transport=fetch){
  if(o.dispatchAuthorized!==true)throw Error("transfer_dispatch_not_authorized");
  await preflightAuctionTestTransfer(o,key,account,transport);
  return dispatchPreflightedAuctionTestTransfer(o,key,account,transport);
}

// GET-only recovery, even years after dispatch. An empty list is NOT proof that
// a timed-out POST never happened. Multiple exact candidates remain unresolved.
export async function reconcileAuctionTestTransfer(o: AuctionTransferOperation, key: string, account: string, transport: Transport = fetch) {
  validateOperation(o, key, account);
  const get = client(key, transport), actual = await get("/account");
  if (actual.object !== "account" || actual.id !== account) throw Error("platform_account_mismatch");
  if (o.provider_transfer_id) return transferEvidence(await get(`/transfers/${o.provider_transfer_id}`), o);
  let cursor = ""; const candidates: unknown[] = [], seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ transfer_group: o.transfer_group, limit: "100" });
    if (cursor) params.set("starting_after", cursor);
    const list = await get(`/transfers?${params}`);
    if (list.object !== "list" || !Array.isArray(list.data) || typeof list.has_more !== "boolean") throw Error("transfer_list_invalid");
    for (const candidate of list.data) {
      const t = object(candidate), id = String(t.id);
      if (seen.has(id)) throw Error("transfer_list_unstable"); seen.add(id);
      if (object(t.metadata).auction_operation_id === o.id) candidates.push(candidate);
    }
    if (!list.has_more) {
      if (candidates.length !== 1) throw Error("transfer_result_unresolved");
      return transferEvidence(candidates[0], o);
    }
    if (!list.data.length) throw Error("transfer_list_incomplete");
    cursor = String(object(list.data.at(-1)).id);
    if (!/^tr_[A-Za-z0-9]+$/.test(cursor)) throw Error("transfer_cursor_invalid");
  }
  throw Error("transfer_list_incomplete");
}

export type AuctionReversalOperation = { id: string; transfer: AuctionTransferOperation; amount_minor: number;
  expected_reversed_minor: number; idempotency_key: string; dispatchAuthorized: boolean };
// A reversal is a separately reserved recovery operation, never the buyer's
// refund and never silently inferred from the refund's gross amount.
export async function dispatchAuctionTestReversal(r: AuctionReversalOperation, key: string, account: string, transport: Transport = fetch) {
  const o = r.transfer; validateOperation(o, key, account);
  if (!r.dispatchAuthorized || !o.provider_transfer_id || !Number.isSafeInteger(r.amount_minor) || r.amount_minor <= 0
    || r.amount_minor > o.amount_minor || !Number.isSafeInteger(r.expected_reversed_minor) || r.expected_reversed_minor < 0
    || r.expected_reversed_minor + r.amount_minor > o.amount_minor
    || r.idempotency_key !== `auction-reversal-v1-${r.id}`) throw Error("reversal_contract_invalid");
  const get = client(key, transport), actual = await get("/account");
  if (actual.object !== "account" || actual.id !== account) throw Error("platform_account_mismatch");
  const transfer = transferEvidence(await get(`/transfers/${o.provider_transfer_id}`), o);
  if (transfer.amount_reversed !== r.expected_reversed_minor) throw Error("reversal_observation_changed");
  const result = await get(`/transfers/${o.provider_transfer_id}/reversals`, new URLSearchParams({ amount: String(r.amount_minor),
    "metadata[auction_reversal_id]": r.id, "metadata[auction_operation_id]": o.id }), r.idempotency_key);
  const evidence = reversalEvidence(result, r);
  // Preserve an exact successful reversal even if the follow-up read fails or
  // exposes another writer. Never compensate with an automatic new transfer.
  let parent: ReturnType<typeof transferEvidence> | null = null;
  try { parent = transferEvidence(await get(`/transfers/${o.provider_transfer_id}`), o); } catch { /* unresolved cumulative result */ }
  return { ...evidence, parent_transfer: parent,
    cumulative_reconciled: parent?.amount_reversed === r.expected_reversed_minor + r.amount_minor };
}
function reversalEvidence(value: unknown, r: AuctionReversalOperation) {
  const v = object(value), m = object(v.metadata);
  if (v.object !== "transfer_reversal" || typeof v.id !== "string" || !/^trr_[A-Za-z0-9]+$/.test(v.id)
    || v.amount !== r.amount_minor || v.currency !== r.transfer.currency || reference(v.transfer) !== r.transfer.provider_transfer_id
    || m.auction_reversal_id !== r.id || m.auction_operation_id !== r.transfer.id) throw Error("reversal_evidence_mismatch");
  return { id: v.id, object: v.object, amount: v.amount, currency: v.currency, transfer: r.transfer.provider_transfer_id,
    platform_account_id: r.transfer.platform_account_id,
    metadata: { auction_reversal_id: r.id, auction_operation_id: r.transfer.id } };
}
export async function reconcileAuctionTestReversal(r: AuctionReversalOperation, key: string, account: string, transport: Transport = fetch) {
  const o = r.transfer; validateOperation(o, key, account);
  if (!o.provider_transfer_id) throw Error("transfer_identity_unresolved");
  const get = client(key, transport), actual = await get("/account");
  if (actual.object !== "account" || actual.id !== account) throw Error("platform_account_mismatch");
  const parent = transferEvidence(await get(`/transfers/${o.provider_transfer_id}`), o);
  let cursor = ""; const matches: unknown[] = [], seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ limit: "100" }); if (cursor) query.set("starting_after", cursor);
    const list = await get(`/transfers/${o.provider_transfer_id}/reversals?${query}`);
    if (list.object !== "list" || !Array.isArray(list.data) || typeof list.has_more !== "boolean") throw Error("reversal_list_invalid");
    for (const row of list.data) { const v = object(row), id = String(v.id);
      if (seen.has(id)) throw Error("reversal_list_unstable"); seen.add(id);
      if (object(v.metadata).auction_reversal_id === r.id) matches.push(v);
    }
    if (!list.has_more) { if (matches.length !== 1) throw Error("reversal_result_unresolved");
      return { ...reversalEvidence(matches[0], r), parent_transfer: parent,
        cumulative_reconciled: parent.amount_reversed === r.expected_reversed_minor + r.amount_minor }; }
    if (!list.data.length) throw Error("reversal_list_incomplete");
    cursor = String(object(list.data.at(-1)).id); if (!/^trr_[A-Za-z0-9]+$/.test(cursor)) throw Error("reversal_cursor_invalid");
  }
  throw Error("reversal_list_incomplete");
}
