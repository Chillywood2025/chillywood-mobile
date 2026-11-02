import { Platform } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { assertAccountBoundSupabaseMutationSubjectCurrent, captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc, type AccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";

type Identity = { environment: "test"; currency: "usd"; financialAuthority: false; executionKind: "prefunded_destination_tip" };
export type SandboxPrefundedTipSource = Identity & {
  tipId: string; status: "test_tip_received" | "pending_provider_availability" | "eligible_test_cashout";
  amountMinor: number; availableMinor: number; receiptId: string | null; qualificationId: string | null;
  bankMinor: number | null; connectedFeeMinor: number | null; operationId: string | null; expiresAt: string | null;
  platformFeeDisposition: "platform_absorbed" | null; subject: AccountBoundSupabaseMutationSubject;
};
export type SandboxPrefundedTipQuote = SandboxPrefundedTipSource & {
  status: "eligible_test_cashout"; receiptId: string; qualificationId: string; operationId: string;
  bankMinor: number; connectedFeeMinor: number; expiresAt: string; platformFeeDisposition: "platform_absorbed";
};
export type SandboxPrefundedTipRecord = Identity & {
  requestId: string; tipId: string; status: string; phase: string; grossMinor: number; bankMinor: number;
  connectedFeeMinor: number; platformFeeDisposition: "platform_absorbed"; providerTestPaid: boolean;
  bankPaid: false; sourceHeld: boolean; canCancel: boolean; qualificationStatus: "current" | "expired_or_revoked";
  subject: AccountBoundSupabaseMutationSubject;
};
const sources = new WeakSet<object>(), quotes = new WeakSet<object>(), records = new WeakSet<object>();
const uuid = (v: unknown) => typeof v === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const minor = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 2147483647;
const identity = (r: Identity) => r && r.environment === "test" && r.currency === "usd"
  && r.financialAuthority === false && r.executionKind === "prefunded_destination_tip";
const unverified = () => Error("Test tip payout facts could not be verified. Refresh test history; do not create another request.");
const source = (value: unknown, subject: AccountBoundSupabaseMutationSubject) => {
  const r = value as SandboxPrefundedTipSource;
  if (!identity(r) || !uuid(r.tipId) || !minor(r.amountMinor) || r.amountMinor <= 0 || !minor(r.availableMinor) || r.availableMinor > r.amountMinor
    || !["test_tip_received", "pending_provider_availability", "eligible_test_cashout"].includes(r.status)) throw unverified();
  if (r.status === "eligible_test_cashout") {
    if (![r.receiptId, r.qualificationId, r.operationId].every(uuid) || !minor(r.bankMinor) || Number(r.bankMinor) <= 0
      || !minor(r.connectedFeeMinor) || Number(r.bankMinor) + Number(r.connectedFeeMinor) !== r.availableMinor
      || r.platformFeeDisposition !== "platform_absorbed" || typeof r.expiresAt !== "string"
      || !Number.isFinite(Date.parse(r.expiresAt)) || Date.parse(r.expiresAt) <= Date.now()) throw unverified();
  }
  const result = Object.freeze({ ...r, subject }); sources.add(result); return result;
};
const record = (value: unknown, subject: AccountBoundSupabaseMutationSubject) => {
  const r = value as SandboxPrefundedTipRecord;
  if (!identity(r) || !uuid(r.requestId) || !uuid(r.tipId) || r.bankPaid !== false || typeof r.providerTestPaid !== "boolean"
    || typeof r.sourceHeld !== "boolean" || typeof r.canCancel !== "boolean" || r.phase !== r.status
    || !["ready", "canceled", "payout_unknown", "payout_pending", "paid", "return_pending", "returned", "needs_review"].includes(r.status)
    || ![r.grossMinor, r.bankMinor, r.connectedFeeMinor].every(minor) || r.bankMinor <= 0
    || r.bankMinor + r.connectedFeeMinor !== r.grossMinor || r.platformFeeDisposition !== "platform_absorbed"
    || !["current", "expired_or_revoked"].includes(r.qualificationStatus)
    || (r.canCancel && r.status !== "ready") || (r.providerTestPaid && r.status !== "paid")) throw unverified();
  const result = Object.freeze({ ...r, subject }); records.add(result); return result;
};
export async function readSandboxPrefundedTipState() {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const [s, r] = await Promise.all([
    invokeAccountBoundSupabaseMutationRpc<unknown[]>(subject, "list_my_sandbox_prefunded_tip_sources"),
    invokeAccountBoundSupabaseMutationRpc<unknown[]>(subject, "list_my_sandbox_prefunded_tip_cashouts"),
  ]);
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (s.error || r.error || !Array.isArray(s.data) || !Array.isArray(r.data) || s.data.length > 20 || r.data.length > 20)
    throw Error("Internal test tip access is unavailable for this session.");
  return { sources: s.data.map(v => source(v, subject)), rows: r.data.map(v => record(v, subject)) };
}
export function reviewSandboxPrefundedTip(value: SandboxPrefundedTipSource): SandboxPrefundedTipQuote {
  if (!sources.has(value) || value.status !== "eligible_test_cashout") throw Error("Refresh eligible test tips first.");
  assertAccountBoundSupabaseMutationSubjectCurrent(value.subject);
  source(value, value.subject);
  const quote = Object.freeze({ ...value }) as SandboxPrefundedTipQuote; quotes.add(quote); return quote;
}
export async function submitSandboxPrefundedTip(quote: SandboxPrefundedTipQuote) {
  if (!quotes.has(quote)) throw Error("Review the exact test tip payout quote first.");
  assertAccountBoundSupabaseMutationSubjectCurrent(quote.subject);
  if (Date.parse(quote.expiresAt) <= Date.now()) throw Error("Test tip quote expired. Refresh eligible test tips.");
  const {data, error} = await invokeAccountBoundSupabaseMutationRpc(quote.subject, "request_sandbox_prefunded_tip_cashout", {
    p_receipt_id: quote.receiptId, p_qualification_id: quote.qualificationId, p_operation_id: quote.operationId,
    p_expected_bank_minor: quote.bankMinor, p_expected_connected_fee_minor: quote.connectedFeeMinor,
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(quote.subject);
  if (error) throw Error("Test tip request is not confirmed. Refresh history before trying again.");
  const result = record(data, quote.subject);
  if (result.tipId !== quote.tipId || result.bankMinor !== quote.bankMinor || result.connectedFeeMinor !== quote.connectedFeeMinor) throw unverified();
  return result;
}
const edge = async (subject: AccountBoundSupabaseMutationSubject, endpoint: string, body: Record<string, string>) => {
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/${endpoint}`, {
    method: "POST", headers: { Authorization: `Bearer ${subject.accessToken}`, apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json", "x-chillywood-platform": Platform.OS },
    body: JSON.stringify(body), signal: AbortSignal.timeout(75000),
  }).catch(() => { throw Error("Test tip response was lost. Refresh and reconcile the original request; do not start another payout."); });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (!response.ok) throw Error("Test tip requires provider reconciliation. Refresh history before another request.");
  const result = await response.json(); assertAccountBoundSupabaseMutationSubjectCurrent(subject); return result;
};
export async function refreshSandboxPrefundedTip(value: SandboxPrefundedTipSource) {
  if (!sources.has(value)) throw Error("Refresh test tip history first.");
  const result = await edge(value.subject, "sandbox-prefunded-tip-receipt", { tip_id: value.tipId });
  if (!result || result.tipId !== value.tipId || result.environment !== "test" || result.financialAuthority !== false
    || result.executionKind !== "prefunded_destination_tip") throw unverified();
}
export async function advanceSandboxPrefundedTip(value: SandboxPrefundedTipRecord) {
  if (!records.has(value) || ["canceled", "returned"].includes(value.status)
    || (value.status === "ready" && (value.sourceHeld || value.qualificationStatus !== "current"))) throw Error("Refresh the held test tip request first.");
  const result = record(await edge(value.subject, "sandbox-creator-cashout", { request_id: value.requestId }), value.subject);
  if (result.requestId !== value.requestId || result.tipId !== value.tipId) throw unverified();
  return result;
}
export async function cancelSandboxPrefundedTip(value: SandboxPrefundedTipRecord) {
  if (!records.has(value) || !value.canCancel || value.status !== "ready") throw Error("This test tip request cannot be canceled.");
  assertAccountBoundSupabaseMutationSubjectCurrent(value.subject);
  const {data, error} = await invokeAccountBoundSupabaseMutationRpc(value.subject, "cancel_sandbox_prefunded_tip_cashout", { p_request_id: value.requestId });
  assertAccountBoundSupabaseMutationSubjectCurrent(value.subject);
  if (error) throw Error("Test tip cancellation is not confirmed. Refresh the original request.");
  const result = record(data, value.subject);
  if (result.requestId !== value.requestId || result.tipId !== value.tipId) throw unverified();
  return result;
}
