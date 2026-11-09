/** Private native monetary evidence. No allocation, qualification or access.
 * Raw bytes are replayed with the ORIGINAL immutable connection; never accept
 * HTTP observations, SDK prices or a quote as substitute purchase economics.
 */
import { decryptLosslessRouterEnvelope } from "./revenuecat-lossless-envelope.ts";
import { replayNativeStoreSandboxReceiptV1, type NativeStoreSandboxReceiptRowV1 } from "./native-store-sandbox-replay-v1.ts";
import { reconcileNativeStoreSandboxClaimV1, type NativeStoreSandboxClaimRowV1 } from "./native-store-sandbox-reconcile-v1.ts";
import type { NativeStoreSandboxConnectionV1 } from "./native-store-sandbox-bridge-v1.ts";
// Exact lexical parser copied from the frozen v3 parser. No Test Store customer,
// offering, admission or access semantics are reused or changed.
function eventScalarTokens(text: string): Map<string, string> {
  let offset = 0;
  const tokens = new Map<string, string>();
  const space = () => { while (/\s/u.test(text[offset] ?? "")) offset++; };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === "\\") { offset += 2; continue; }
      if (text[offset++] === '"') return JSON.parse(text.slice(start, offset)) as string;
    }
    throw Error("invalid_json");
  };
  const value = (path: string[]): void => {
    space(); const start = offset;
    if (text[offset] === "{") {
      offset++; space();
      if (text[offset] === "}") { offset++; return; }
      for (;;) { const key = string(); space(); offset++; value([...path, key]); space();
        if (text[offset++] === "}") return; space(); }
    }
    if (text[offset] === "[") {
      offset++; space();
      if (text[offset] === "]") { offset++; return; }
      for (;;) { value([...path, "[]"]); space(); if (text[offset++] === "]") return; space(); }
    }
    if (text[offset] === '"') string();
    else { const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(text.slice(offset));
      if (!token) throw Error("invalid_json"); offset += token[0].length; }
    if (path.length === 2 && path[0] === "event") tokens.set(path[1], text.slice(start, offset));
  };
  value([]); return tokens;
}
function scaledInteger(token: string | undefined, places: number): number | null {
  if (!token || token.length > 80) return null;
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/u.exec(token);
  if (!match) return null;
  const fraction = match[3] ?? "", exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 80) return null;
  const shift = places + exponent - fraction.length;
  let integer = BigInt(match[2] + fraction);
  if (Math.abs(shift) > 160) return null;
  if (shift >= 0) integer *= 10n ** BigInt(shift);
  else { const divisor = 10n ** BigInt(-shift); if (integer % divisor !== 0n) return null; integer /= divisor; }
  if (match[1] === "-") integer = -integer;
  if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(integer);
}


export async function projectNativeStoreSandboxMoneyV1(claim: NativeStoreSandboxClaimRowV1,
  receipt: NativeStoreSandboxReceiptRowV1, originalConnection: NativeStoreSandboxConnectionV1,
  originalRevisionRevoked: boolean) {
  const observedAt = Date.now();
  const stored = structuredClone(claim), row = structuredClone(receipt), connection = structuredClone(originalConnection);
  connection.encryption.key = new Uint8Array(connection.encryption.key);
  const replay = await replayNativeStoreSandboxReceiptV1(row, connection, originalRevisionRevoked);
  const match = await reconcileNativeStoreSandboxClaimV1(stored, row, connection, originalRevisionRevoked);
  const reasons: string[] = [];
  if (!match.oneTimeCandidate || !match.identifiersMatch) reasons.push("identity_or_lifecycle_mismatch");
  if (originalRevisionRevoked) reasons.push("original_revision_revoked");
  let amountMinor: number | null = null, purchasedAt: string | null = null, eventAt: string | null = null;
  let currency: "usd" | null = null;
  // Structural/duplicate-key validation must succeed BEFORE token extraction.
  if (replay.observation.parseStatus !== "valid" || replay.observation.issues.length) reasons.push("receipt_invalid");
  else {
    const raw = await decryptLosslessRouterEnvelope(row.envelope, connection);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    const event = JSON.parse(text).event as Record<string, unknown>, tokens = eventScalarTokens(text);
    const integer = (field: string, places: number) => typeof event[field] === "number" ? scaledInteger(tokens.get(field), places) : null;
    const instant = (field: string) => {
      const ms = integer(field, 0);
      return ms !== null && ms > 0 && Number.isFinite(new Date(ms).getTime()) ? new Date(ms).toISOString() : null;
    };
    amountMinor = integer("price_in_purchased_currency", 2);
    currency = event.currency === "USD" ? "usd" : null;
    purchasedAt = instant("purchased_at_ms"); eventAt = instant("event_timestamp_ms");
    if (amountMinor === null || amountMinor <= 0 || amountMinor !== stored.quote.amountMinor || currency !== stored.quote.currency)
      reasons.push("purchase_economics_mismatch");
    if (!purchasedAt || !eventAt || Date.parse(purchasedAt) > Date.parse(eventAt) || (eventAt !== null && Date.parse(eventAt) > observedAt)) reasons.push("purchase_time_invalid");
    // No inferred quantity or expiry. Missing fields stay unsupported until the
    // real native protocol is observed and explicitly qualified.
    if (integer("quantity", 0) !== 1) reasons.push("explicit_single_quantity_required");
    if (event.expiration_at_ms !== null) reasons.push("nonexpiring_purchase_required");
    if (event.cancel_reason !== undefined && event.cancel_reason !== null) reasons.push("negative_evidence");
  }
  return Object.freeze({ protocol: "native-store-sandbox-money-v1" as const, receiptId: replay.receiptId,
    rawSha256: replay.rawSha256, claimId: match.claimId, selectionId: match.selectionId,
    amountMinor, currency, purchasedAt, eventAt, monetaryCandidate: reasons.length === 0,
    reasons: Object.freeze([...reasons, "sdk_transaction_mapping_unqualified", "lifecycle_completeness_unqualified"]),
    correlation: "unsupported" as const, dispatchAllowed: false as const, settlementAllowed: false as const,
    grantsAccess: false as const, financialAuthority: false as const, payable: false as const });
}
