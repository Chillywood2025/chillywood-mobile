import { Platform } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { assertAccountBoundSupabaseMutationSubjectCurrent, captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc, type AccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import type { CreatorCashoutQuote, CreatorCashoutRecord } from "./creatorCashoutExecution";

export type SandboxCashoutQuote = CreatorCashoutQuote & { environment: "test"; financialAuthority: false };
export type SandboxCashoutRecord = CreatorCashoutRecord & {
  environment: "test"; financialAuthority: false; bankPaid: false; subject: AccountBoundSupabaseMutationSubject;
  recoveryAuthorityRequired?: boolean; qualificationStatus?: "expired_or_revoked" | "current";
};
const quotes = new WeakSet<object>(), records = new WeakSet<object>();
const uuid = (v: unknown) => typeof v === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const minor = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 2147483647;
const record = (data: unknown, subject: AccountBoundSupabaseMutationSubject): SandboxCashoutRecord => {
  const row = data as SandboxCashoutRecord;
  if (!row || row.environment !== "test" || row.financialAuthority !== false || row.bankPaid !== false
    || !uuid(row.requestId) || typeof row.status !== "string"
    || [row.grossMinor, row.appFeeMinor, row.bankMinor, row.expectedProviderFeeMinor, row.observedProviderFeeMinor].some(v => v !== null && !minor(v)))
    throw Error("Test payout result could not be verified. Refresh test history; do not create another request.");
  const result = { ...row, subject }; records.add(result); return result;
};
export async function previewSandboxCreatorCashout(amount: number, method: "scheduled" | "instant") {
  if (!minor(amount) || amount <= 0 || !["scheduled", "instant"].includes(method)) throw Error("Test amount or method is invalid.");
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject, "preview_sandbox_creator_cashout", { p_amount_minor: amount, p_payout_type: method });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (error || !data || data.environment !== "test" || data.financialAuthority !== false) throw Error("Internal test payout is unavailable for this session.");
  if (data.ready !== true) return { ready: false as const, reason: typeof data.reason === "string" ? data.reason : "verification_required" };
  if (!uuid(data.qualificationId) || !uuid(data.operationId) || data.grossMinor !== amount || data.payoutType !== method
    || !minor(data.appFeeMinor) || !minor(data.expectedProviderFeeMinor) || !minor(data.bankMinor)
    || Number(data.bankMinor) <= 0 || Number(data.bankMinor) + Number(data.appFeeMinor) + Number(data.expectedProviderFeeMinor) !== amount
    || typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()
    || data.providerFeeStatus !== "contract_quote_not_actual" || data.currency !== "usd") throw Error("Test payout quote could not be verified.");
  const quote = { ...data, subject } as SandboxCashoutQuote; quotes.add(quote); return quote;
}
export async function submitSandboxCreatorCashout(quote: SandboxCashoutQuote) {
  if (!quotes.has(quote) || quote.environment !== "test") throw Error("Review a test payout quote first.");
  assertAccountBoundSupabaseMutationSubjectCurrent(quote.subject);
  if (Date.parse(quote.expiresAt) <= Date.now()) throw Error("Test quote expired. Review a new quote.");
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc(quote.subject, "request_sandbox_creator_cashout", {
    p_amount_minor: quote.grossMinor, p_payout_type: quote.payoutType, p_qualification_id: quote.qualificationId,
    p_operation_id: quote.operationId, p_expected_app_fee_minor: quote.appFeeMinor,
    p_expected_provider_fee_minor: quote.expectedProviderFeeMinor, p_expected_bank_minor: quote.bankMinor,
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(quote.subject);
  if (error) throw Error("Test request is not confirmed. Refresh test history before trying again.");
  return record(data, quote.subject);
}
export async function readSandboxCreatorCashoutHistory() {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<unknown[]>(subject, "list_my_sandbox_creator_cashout_executions");
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (error || !Array.isArray(data) || data.length > 20) throw Error("Internal test payout history is unavailable for this session.");
  return data.map(row => record(row, subject));
}
export async function advanceSandboxCreatorCashout(row: SandboxCashoutRecord) {
  if (!records.has(row) || row.environment !== "test") throw Error("Refresh test history first.");
  assertAccountBoundSupabaseMutationSubjectCurrent(row.subject);
  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/sandbox-creator-cashout`, {
    method: "POST", headers: { Authorization: `Bearer ${row.subject.accessToken}`, apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json", "x-chillywood-platform": Platform.OS },
    body: JSON.stringify({ request_id: row.requestId }), signal: AbortSignal.timeout(75000),
  }).catch(() => { throw Error("Test payout response was lost. Reconcile this request; do not submit another payout."); });
  assertAccountBoundSupabaseMutationSubjectCurrent(row.subject);
  if (!response.ok) throw Error("Test payout needs reconciliation. Refresh this request; do not submit another payout.");
  const result = record(await response.json(), row.subject);
  assertAccountBoundSupabaseMutationSubjectCurrent(row.subject);
  if (result.requestId !== row.requestId) throw Error("Test payout request mismatch.");
  return result;
}
export async function cancelSandboxCreatorCashout(row: SandboxCashoutRecord) {
  if (!records.has(row) || row.canCancel !== true) throw Error("This test request cannot be canceled here.");
  assertAccountBoundSupabaseMutationSubjectCurrent(row.subject);
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc(row.subject, "cancel_undispatched_sandbox_creator_cashout", { p_request_id: row.requestId });
  assertAccountBoundSupabaseMutationSubjectCurrent(row.subject);
  if (error) throw Error("Test cancellation is not confirmed. Refresh test history.");
  const result = record(data, row.subject);
  if (result.requestId !== row.requestId) throw Error("Test cancellation request mismatch.");
  return result;
}

export const SANDBOX_CASHOUT_STATUS: Record<string, string> = {
  prepared: "Test request reserved — no payout sent", funded: "Test connected balance funded — payout not sent",
  funding_unknown: "Test funding unresolved — reconcile this request, do not start another",
  payout_unknown: "Test payout unresolved — reconcile this request, do not start another",
  payout_pending: "Provider test payout processing", paid: "Provider reports test payout paid — no real bank deposit",
  canceled: "Test request canceled", returned: "Test funds returned", needs_review: "Test provider/accounting review required",
};
