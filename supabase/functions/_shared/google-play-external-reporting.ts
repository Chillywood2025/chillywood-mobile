// Official Android Publisher v3 Externaltransactions contract. This module has
// no ambient transport, credentials, logging or payment side effects.
// https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions
export type ExternalReport = {
  externalTransactionId: string;
  packageName: string;
  operation: "create" | "refund";
  externalTransactionToken?: string;
  environment: "test";
  licenseTestQualified: boolean;
  originalPreTaxMinor: number;
  originalTaxMinor: number;
  transactionTime: string;
  refundTime?: string;
  refundId?: string;
  refundPreTaxMinor?: number;
  previousPreTaxMinor?: number;
  previousTaxMinor?: number;
  remainingPreTaxMinor?: number;
  remainingTaxMinor?: number;
};
type Json = Record<string, unknown>;
export type ReportResult = {
  status: "reported" | "retry" | "unknown" | "needs_review";
  reason: string;
  receipt?: Json;
};
export type GoogleTransport = (url: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): Json | null => value !== null && typeof value === "object"
  && !Array.isArray(value) ? value as Json : null;
const minor = (value: unknown): value is number => typeof value === "number"
  && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const timestamp = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
export function googlePrice(amountMinor: number) {
  if (!minor(amountMinor)) throw new Error("google_report_amount_invalid");
  // Price is NOT google.type.Money: v3 requires integer micros as a string.
  return { currency: "USD", priceMicros: (BigInt(amountMinor) * 10000n).toString() };
}
function validReport(report: ExternalReport) {
  return /^[A-Za-z0-9_-]{1,63}$/.test(report.externalTransactionId)
    && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(report.packageName)
    && report.environment === "test" && report.licenseTestQualified === true
    && minor(report.originalPreTaxMinor) && minor(report.originalTaxMinor)
    && report.originalPreTaxMinor + report.originalTaxMinor > 0 && timestamp(report.transactionTime)
    && (report.operation === "create"
      ? typeof report.externalTransactionToken === "string"
        && report.externalTransactionToken.length > 0 && report.externalTransactionToken.length <= 16384
      : report.operation === "refund" && timestamp(report.refundTime)
        && typeof report.refundId === "string" && /^[A-Za-z0-9_-]{1,63}$/.test(report.refundId)
        && minor(report.previousPreTaxMinor) && minor(report.previousTaxMinor)
        && minor(report.remainingPreTaxMinor) && minor(report.remainingTaxMinor)
        && minor(report.refundPreTaxMinor) && report.refundPreTaxMinor > 0
        && report.previousPreTaxMinor - report.refundPreTaxMinor === report.remainingPreTaxMinor
        && report.previousPreTaxMinor <= report.originalPreTaxMinor
        && report.previousTaxMinor <= report.originalTaxMinor
        && report.remainingTaxMinor <= report.previousTaxMinor
        && (report.remainingPreTaxMinor !== 0 || report.remainingTaxMinor === 0));
}
export function externalReportRequest(report: ExternalReport) {
  if (!validReport(report)) throw new Error("google_report_authority_invalid");
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${report.packageName}/externalTransactions`;
  const resource = `${base}/${report.externalTransactionId}`;
  if (report.operation === "create") return { resource,
    url: `${base}?externalTransactionId=${report.externalTransactionId}`,
    body: {
      originalPreTaxAmount: googlePrice(report.originalPreTaxMinor),
      originalTaxAmount: googlePrice(report.originalTaxMinor),
      transactionTime: report.transactionTime,
      oneTimeTransaction: { externalTransactionToken: report.externalTransactionToken },
      userTaxAddress: { regionCode: "US" },
      externalContentLinkDetails: { linkType: "LINK_TO_DIGITAL_CONTENT_OFFER" },
      // testPurchase is OUTPUT ONLY. The native token must come from an
      // officially configured license tester; the response proves test status.
    } };
  return { resource, url: `${resource}:refund`, body: {
    refundTime: report.refundTime,
    ...(report.remainingPreTaxMinor === 0 && report.remainingTaxMinor === 0
      ? { fullRefund: {} }
      : { partialRefund: { refundId: report.refundId,
        refundPreTaxAmount: googlePrice(report.refundPreTaxMinor!) } }),
  } };
}
function samePrice(value: unknown, expected: number) {
  const price = object(value);
  return price?.currency === "USD" && price.priceMicros === googlePrice(expected).priceMicros;
}
function canonicalReceipt(value: unknown, report: ExternalReport): Json | null {
  const response = object(value);
  const currentPreTax = object(response?.currentPreTaxAmount), currentTax = object(response?.currentTaxAmount);
  if (!response || response.packageName !== report.packageName
    || response.externalTransactionId !== report.externalTransactionId
    || !samePrice(response.originalPreTaxAmount, report.originalPreTaxMinor)
    || !samePrice(response.originalTaxAmount, report.originalTaxMinor)
    || Date.parse(String(response.transactionTime)) !== Date.parse(report.transactionTime)
    || !object(response.testPurchase)
    || object(response.userTaxAddress)?.regionCode !== "US"
    || object(response.externalContentLinkDetails)?.linkType !== "LINK_TO_DIGITAL_CONTENT_OFFER"
    || !["TRANSACTION_REPORTED", "TRANSACTION_CANCELED"].includes(String(response.transactionState))
    || currentPreTax?.currency !== "USD" || currentTax?.currency !== "USD"
    || typeof currentPreTax.priceMicros !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(currentPreTax.priceMicros)
    || typeof currentTax.priceMicros !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(currentTax.priceMicros)
    || BigInt(currentPreTax.priceMicros) > BigInt(report.originalPreTaxMinor) * 10000n
    || BigInt(currentTax.priceMicros) > BigInt(report.originalTaxMinor) * 10000n
    || (response.transactionState === "TRANSACTION_CANCELED"
      && (currentPreTax.priceMicros !== "0" || currentTax.priceMicros !== "0"))) return null;
  // Explicit allowlist: input-only token or unexpected provider fields never
  // enter receipts, audit metadata, logs or caller-visible API responses.
  return { packageName: response.packageName, externalTransactionId: response.externalTransactionId,
    originalPreTaxAmount: googlePrice(report.originalPreTaxMinor), originalTaxAmount: googlePrice(report.originalTaxMinor),
    currentPreTaxAmount: { currency: "USD", priceMicros: currentPreTax.priceMicros },
    currentTaxAmount: { currency: "USD", priceMicros: currentTax.priceMicros },
    transactionTime: response.transactionTime, transactionState: response.transactionState,
    testPurchase: {}, userTaxAddress: { regionCode: "US" },
    externalContentLinkDetails: { linkType: "LINK_TO_DIGITAL_CONTENT_OFFER" } };
}
function targetReached(receipt: Json, report: ExternalReport) {
  if (report.operation === "create") return true;
  return samePrice(receipt.currentPreTaxAmount, report.remainingPreTaxMinor!)
    && samePrice(receipt.currentTaxAmount, report.remainingTaxMinor!)
    && (report.remainingPreTaxMinor !== 0 || receipt.transactionState === "TRANSACTION_CANCELED");
}
const failure = (status: number): ReportResult => ({
  status: status === 429 || status >= 500 ? "retry" : "needs_review",
  reason: status === 401 || status === 403 ? "google_reporter_authorization_required"
    : status === 429 ? "google_report_rate_limited" : status >= 500 ? "google_report_provider_unavailable"
    : "google_report_provider_rejected",
});
export async function submitExternalReport(report: ExternalReport, accessToken: string,
  transport: GoogleTransport): Promise<ReportResult> {
  let request: ReturnType<typeof externalReportRequest>;
  try { request = externalReportRequest(report); }
  catch { return { status: "needs_review", reason: "google_report_authority_invalid" }; }
  if (!accessToken) return { status: "retry", reason: "google_reporter_authorization_required" };
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  try {
    // Always reconcile first, including after lease expiry or a lost response.
    // Stable transaction/refund identifiers make retries about reporting only.
    const existing = await transport(request.resource, { method: "GET", headers });
    if (existing.ok) {
      const receipt = canonicalReceipt(await existing.json(), report);
      if (!receipt) return { status: "needs_review", reason: "google_report_canonical_receipt_mismatch" };
      if (targetReached(receipt, report)) return { status: "reported", reason: "google_report_reconciled", receipt };
      if (!samePrice(receipt.currentPreTaxAmount, report.previousPreTaxMinor!)
        || !samePrice(receipt.currentTaxAmount, report.previousTaxMinor!)) {
        return { status: "needs_review", reason: "google_refund_balance_mismatch" };
      }
    } else if (existing.status !== 404) return failure(existing.status);
    else if (report.operation === "refund") return { status: "retry", reason: "google_original_report_pending" };
    const response = await transport(request.url, { method: "POST", headers, body: JSON.stringify(request.body) });
    if (!response.ok) {
      // A conflict can be a previous successful write. Do not manufacture an
      // ACK from HTTP409; next attempt GETs the exact canonical resource.
      if (response.status === 409) return { status: "unknown", reason: "google_report_conflict_reconcile" };
      return failure(response.status);
    }
    const receipt = canonicalReceipt(await response.json(), report);
    if (!receipt || !targetReached(receipt, report)) {
      return { status: "needs_review", reason: "google_report_canonical_receipt_mismatch" };
    }
    return { status: "reported", reason: "google_report_accepted", receipt };
  } catch {
    return { status: "unknown", reason: "google_report_transport_outcome_unknown" };
  }
}
