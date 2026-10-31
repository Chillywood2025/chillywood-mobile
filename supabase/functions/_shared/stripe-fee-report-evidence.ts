/**
 * Dormant, server-only normalization of an authenticated Stripe Fees export.
 * This is NOT an authority issuer: the caller must retrieve and bind the report
 * with provider credentials. CSV fields, elapsed time and a successful report
 * are never proof that all invoice/standalone/adjustment fees are present.
 * The service-only import endpoint archives observations; no scheduler or
 * settlement gate consumes them as monetary authority.
 */
export type FeeReportContext = {
  accountId: string;
  environment: "test" | "live";
  reportRunId: string;
  fileId: string;
  reportType: "all_fees.incurred_at.itemized.2";
  intervalStart: number;
  intervalEnd: number;
  currency: "usd";
  // Exact authenticated order chain, not IDs accepted from a buyer request.
  chargeId: string;
  refundIds: string[];
};

const fail = (reason: string): never => { throw new Error(`stripe_fee_evidence_${reason}`); };
const identity = (value: unknown, prefix: string) => {
  if (typeof value !== "string" || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) fail("identity_invalid");
};
const required = ["fee_transaction_id", "incurred_by", "incurred_by_type", "amount", "tax", "currency", "product", "suite", "feature_name", "settled_via"];

// RFC4180 quoting, with explicit bounds and no permissive malformed-row recovery.
function rowsFromCsv(csv: string): string[][] {
  if (typeof csv !== "string" || csv.length > 2_000_000 || csv.includes("\0")) fail("csv_size_or_encoding");
  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  const pushField = () => { row.push(field); field = ""; closed = false; if (row.length > 80) fail("column_limit"); };
  const pushRow = () => { pushField(); rows.push(row); row = []; if (rows.length > 10001) fail("row_limit"); };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
    } else if (c === ",") pushField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      pushRow();
    } else if (c === '"' && field === "" && !closed) quoted = true;
    else {
      if (closed || c === '"') fail("csv_malformed");
      field += c;
    }
    if (field.length > 4096) fail("field_limit");
  }
  if (quoted) fail("csv_malformed");
  if (field !== "" || row.length || closed) pushRow();
  return rows;
}

// Current commerce is USD-only. Do not guess currency exponents or round money.
function usdMinor(value: string): number {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value)) fail("amount_invalid");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) fail("amount_overflow");
  return Number(negative ? -amount : amount);
}

export function normalizeStripeFeeReport(csv: string, context: FeeReportContext) {
  identity(context.accountId, "acct"); identity(context.reportRunId, "frr"); identity(context.fileId, "file");
  identity(context.chargeId, "ch");
  if (!["test", "live"].includes(context.environment) || context.currency !== "usd"
    || context.reportType !== "all_fees.incurred_at.itemized.2"
    || !Number.isSafeInteger(context.intervalStart) || !Number.isSafeInteger(context.intervalEnd)
    || context.intervalStart < 0 || context.intervalEnd <= context.intervalStart
    || !Array.isArray(context.refundIds) || context.refundIds.length > 2000) fail("context_invalid");
  const boundObjects = new Map<string, string>([[context.chargeId, "charge"]]);
  for (const refund of context.refundIds) {
    identity(refund, "re"); if (boundObjects.has(refund)) fail("duplicate_refund_binding");
    boundObjects.set(refund, "refund");
  }
  const [headers, ...rawRows] = rowsFromCsv(csv);
  if (!headers || headers.some(h => !h || h.trim() !== h) || new Set(headers).size !== headers.length
    || required.some(h => !headers.includes(h))) fail("columns_invalid");
  const seen = new Set<string>();
  const evidence = [];
  let unattributedRows = 0;
  for (const raw of rawRows) {
    if (raw.length !== headers.length) fail("row_shape_invalid");
    const row = Object.fromEntries(headers.map((h, i) => [h, raw[i]]));
    if (headers.includes("account_id") && row.account_id !== context.accountId) fail("account_mismatch");
    if (row.currency !== context.currency) fail("currency_mismatch");
    const amountMinor = usdMinor(row.amount), taxMinor = usdMinor(row.tax);
    // Never silently drop a duplicated financial row, including equal duplicates.
    // fee_transaction_id is not assumed globally unique across fee components.
    const key = JSON.stringify([row.fee_transaction_id, row.incurred_by, row.incurred_by_type,
      row.currency, row.product, row.suite, row.feature_name, row.settled_via, row.pricing_tier ?? ""]);
    if (seen.has(key)) fail("duplicate_or_conflicting_component");
    seen.add(key);
    if (!row.fee_transaction_id || !row.product || !row.suite || !row.feature_name
      || !["credit", "balance", "v2_balance", "invoice", "multiple"].includes(row.settled_via)) fail("row_identity_invalid");
    const objectType = boundObjects.get(row.incurred_by);
    if (!objectType) { unattributedRows++; continue; }
    if (row.incurred_by_type !== objectType) fail("object_type_mismatch");
    evidence.push({ feeTransactionId: row.fee_transaction_id, incurredBy: row.incurred_by,
      incurredByType: objectType, amountMinor, taxMinor, currency: "usd" as const,
      product: row.product, suite: row.suite, featureName: row.feature_name, pricingTier: row.pricing_tier ?? "", settledVia: row.settled_via });
  }
  evidence.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    schemaVersion: 1, accountId: context.accountId, environment: context.environment,
    reportRunId: context.reportRunId, fileId: context.fileId, reportType: context.reportType,
    intervalStart: context.intervalStart, intervalEnd: context.intervalEnd,
    chargeId: context.chargeId, refundIds: [...context.refundIds].sort(), rows: evidence,
    unattributedRows, observedRowCount: rawRows.length,
    // Retain amount and tax separately until exact report-version semantics have
    // been independently qualified. Do not add them or label this a final fee.
    totalFeeMinor: null, taxServiceFeeMinor: null, completeness: "unverified" as const,
    financialAuthority: false as const, settlementReady: false as const,
    holdReasons: ["fee_report_provider_binding_required", "fee_report_coverage_unverified", "tax_service_fee_unverified"],
  };
}

/** GET-only adapter for an already-created v1 report. No report creation or
 * payment operations; no arbitrary URL, account selector or credential export.
 * Result can be archived by the server, but cannot qualify any settlement. */
export async function observeStripeFeeReport(context: FeeReportContext, secret: string, transport: typeof fetch = fetch) {
  // Validate every context field before even contacting the provider.
  normalizeStripeFeeReport(required.join(","), context);
  if (!new RegExp(`^(sk|rk)_${context.environment}_[A-Za-z0-9]+$`).test(secret)) fail("credential_mode_mismatch");
  const get = async (url: string) => {
    const response = await transport(url, { method: "GET", redirect: "error",
      headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive" },
      signal: AbortSignal.timeout(15000) });
    if (!response.ok) fail("provider_read_failed");
    return response;
  };
  const account = await (await get("https://api.stripe.com/v1/account")).json();
  if (account?.object !== "account" || account.id !== context.accountId) fail("account_mismatch");
  const run = await (await get(`https://api.stripe.com/v1/reporting/report_runs/${context.reportRunId}`)).json();
  if (run?.object !== "reporting.report_run" || run.id !== context.reportRunId || run.livemode !== (context.environment === "live")
    || run.report_type !== context.reportType || run.status !== "succeeded" || run.error !== null
    || !Number.isSafeInteger(run.succeeded_at) || run.succeeded_at <= 0) fail("report_unqualified");
  const parameters = run.parameters;
  if (!parameters || parameters.interval_start !== context.intervalStart || parameters.interval_end !== context.intervalEnd
    || (parameters.currency !== undefined && parameters.currency !== context.currency)
    || (parameters.timezone !== undefined && parameters.timezone !== "UTC")
    || Object.keys(parameters).some(k => !["interval_start", "interval_end", "currency", "timezone", "columns"].includes(k))) fail("report_scope_mismatch");
  const file = run.result;
  const expectedUrl = `https://files.stripe.com/v1/files/${context.fileId}/contents`;
  if (file?.object !== "file" || file.id !== context.fileId || file.type !== "csv"
    || file.url !== expectedUrl || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 2_000_000) fail("file_binding_invalid");
  const response = await get(expectedUrl);
  const stream = response.body;
  if (!stream) throw new Error("stripe_fee_evidence_file_body_missing");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > file.size || size > 2_000_000) fail("file_size_mismatch");
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  if (size !== file.size) fail("file_size_mismatch");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const normalized = normalizeStripeFeeReport(csv, context);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const contentSha256 = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
  return { ...normalized, providerBinding: "authenticated_report" as const, contentSha256,
    reportSucceededAt: run.succeeded_at,
    holdReasons: normalized.holdReasons.filter(reason => reason !== "fee_report_provider_binding_required") };
}
