import {
  assertAccountBoundSupabaseMutationSubjectCurrent,
  captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc,
  type AccountBoundSupabaseMutationSubject,
} from "./accountBoundSupabaseMutation";

export type CreatorCashoutQuote = {
  ready: true; qualificationId: string; operationId: string;
  grossMinor: number; appFeeMinor: number; expectedProviderFeeMinor: number; bankMinor: number;
  payoutType: "scheduled" | "instant"; expiresAt: string;
  subject: AccountBoundSupabaseMutationSubject;
};
export type CreatorCashoutRecord = {
  requestId: string; status: string; grossMinor: number | null; appFeeMinor: number | null;
  bankMinor: number | null; expectedProviderFeeMinor: number | null; observedProviderFeeMinor: number | null;
  feeStatus: string; bankPaid: boolean; returnedToPlatform: boolean; canRetry: false;
  canCancel?: boolean; fundingReturnHeld?: boolean; ownerAction?: string | null; subject?: AccountBoundSupabaseMutationSubject;
};
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const money = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 2147483647;
export function cashoutDollarsToMinor(value: string) {
  if (!/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(value.trim())) throw Error("Enter a dollar amount with no more than two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!money(minor) || minor === 0) throw Error("Enter a positive cashout amount.");
  return minor;
}
export async function previewQualifiedCreatorCashout(amountMinor: number, payoutType: "scheduled" | "instant") {
  if (!money(amountMinor) || amountMinor === 0 || !["scheduled", "instant"].includes(payoutType)) throw Error("Cashout amount or method is invalid.");
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject, "preview_qualified_creator_cashout", { p_amount_minor: amountMinor, p_payout_type: payoutType });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (error || !data) throw Error("Cashout readiness could not be checked.");
  if (data.ready !== true) return { ready: false as const, reason: typeof data.reason === "string" ? data.reason : "verification_required" };
  if (!uuid(data.qualificationId) || !uuid(data.operationId) || data.grossMinor !== amountMinor || data.payoutType !== payoutType
    || !money(data.appFeeMinor) || !money(data.expectedProviderFeeMinor) || !money(data.bankMinor)
    || data.bankMinor <= 0 || data.bankMinor + data.appFeeMinor + data.expectedProviderFeeMinor !== amountMinor
    || typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()
    || data.providerFeeStatus !== "contract_quote_not_actual" || data.currency !== "usd" || data.financialAuthority !== false)
    throw Error("Cashout fee quote could not be verified.");
  return { ...data, subject } as CreatorCashoutQuote;
}
export async function submitQualifiedCreatorCashout(quote: CreatorCashoutQuote) {
  assertAccountBoundSupabaseMutationSubjectCurrent(quote.subject);
  if (Date.parse(quote.expiresAt) <= Date.now()) throw Error("This fee quote expired. Review a new quote.");
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<CreatorCashoutRecord>(quote.subject, "request_qualified_creator_cashout", {
    p_amount_minor: quote.grossMinor, p_payout_type: quote.payoutType,
    p_qualification_id: quote.qualificationId, p_operation_id: quote.operationId,
    p_expected_app_fee_minor: quote.appFeeMinor, p_expected_provider_fee_minor: quote.expectedProviderFeeMinor,
    p_expected_bank_minor: quote.bankMinor,
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(quote.subject);
  if (error || !data || !uuid(data.requestId)) throw Error("The request could not be confirmed. Refresh your cashout history; an earlier request may still be processing.");
  return { ...data, subject: quote.subject };
}
export async function cancelQualifiedCreatorCashout(record: CreatorCashoutRecord) {
  if (!record.subject || record.canCancel !== true || !uuid(record.requestId)) throw Error("This cashout cannot be canceled here.");
  assertAccountBoundSupabaseMutationSubjectCurrent(record.subject);
  const {data,error}=await invokeAccountBoundSupabaseMutationRpc<CreatorCashoutRecord>(record.subject,"cancel_undispatched_creator_cashout",{p_request_id:record.requestId});
  assertAccountBoundSupabaseMutationSubjectCurrent(record.subject);
  if(error||!data||data.requestId!==record.requestId||!["canceled","funding_return_pending","funding_return_unknown","returned"].includes(data.status)) throw Error("Cancellation was not confirmed. Refresh history; funds may already be processing.");
  return {...data,subject:record.subject};
}
export async function readCreatorCashoutHistory() {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<CreatorCashoutRecord[]>(subject, "list_my_creator_cashout_executions");
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (error || !Array.isArray(data) || data.length > 20 || data.some(row => !uuid(row.requestId) || typeof row.status !== "string"
    || [row.grossMinor,row.appFeeMinor,row.bankMinor,row.expectedProviderFeeMinor,row.observedProviderFeeMinor].some(value => value !== null && !money(value))))
    throw Error("Cashout history is unavailable.");
  return data.map(row=>({...row,subject}));
}
export const CREATOR_CASHOUT_STATUS: Record<string, string> = {
  awaiting_qualification: "Waiting for payout setup verification", prepared: "Request accepted",
  canceled: "Canceled before funds were sent",
  funding_return_pending: "Bank payout canceled; funding held until verified return",
  funding_return_unknown: "Bank payout canceled; confirming funding return. Do not retry.",
  funding_unknown: "Confirming funding. Do not start another cashout.", funded: "Preparing bank payout",
  payout_unknown: "Confirming bank payout. Do not start another cashout.", payout_pending: "Bank payout processing",
  paid: "Bank payout reported paid", return_pending: "Bank returned payout; verifying funds",
  return_confirmed: "Bank funds returned; recovering platform balance", reversal_unknown: "Confirming returned funds",
  returned: "Funds returned to platform; accounting under review", needs_review: "Provider or fee review needed",
};
