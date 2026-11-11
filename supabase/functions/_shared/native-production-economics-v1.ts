/** Source contract, not an authentication, admission, settlement or payout API.
 * A future adapter must load all inputs from immutable independently verified
 * records under the domain/creator locks. No caller-supplied object grants that
 * authority. In particular, sandbox receipts cannot be adopted by this module.
 */
export type NativeProductionScopeV1 = Readonly<{
  environment: "production";
  provider: "revenuecat_app_store" | "revenuecat_google_play";
  projectId: string; appId: string; storeAccountId: string; productId: string;
  currency: "usd";
}>;
export type NativeProductionSourceV1 = Readonly<{
  creatorId: string; sourceId: string; incarnation: string; assetSha256: string;
  revision: number;
}>;
export type NativeProductionAdmissionV1 = Readonly<{
  protocol: "native-production-admission-v1";
  id: string; buyerId: string; scope: NativeProductionScopeV1; source: NativeProductionSourceV1;
  quoteSha256: string; termsSha256: string; grossMinor: string; quantity: 1;
  quoteCreatedAt: number; quoteExpiresAt: number; admittedAt: number;
  platformShareBps: number;
}>;
type Identity = Readonly<{
  scope: NativeProductionScopeV1; transactionId: string; originalTransactionId: string; buyerId: string;
}>;
type Base = Readonly<{ id: string; evidenceSha256: string; observedAt: number; identity: Identity }>;
export type NativeProductionObservationV1 = Base & (
  | Readonly<{ kind: "purchase"; admissionId: string; quoteSha256: string;
      grossMinor: string | null; quantity: number | null; purchasedAt: number }>
  | Readonly<{ kind: "component"; componentId: string; category: "store_fee" | "fee_tax" | "sales_tax" | "developer_proceeds";
      amountMinor: string | null; reportSchema: string; qualificationId: string; attribution: "transaction" | "aggregate" | "unknown" }>
  | Readonly<{ kind: "coverage"; revision: number; componentIds: readonly string[]; reportSchema: string;
      qualificationId: string; through: number }>
  | Readonly<{ kind: "refund" | "revocation" | "chargeback"; negativeId: string; effectiveAt: number; amountMinor: string | null }>
);
export type NativeProductionQualificationV1 = Readonly<{
  id: string; scope: NativeProductionScopeV1; reportSchema: string; evidenceSha256: string;
  verifiedAt: number; expiresAt: number; revoked: boolean;
  basis: "independent_transaction_fee_tax_proceeds_review";
  renewalOf?: string;
}>;
export type NativeProductionJournalV1 = Readonly<{
  protocol: "native-production-economic-journal-v1"; identity: Identity;
  observations: readonly NativeProductionObservationV1[];
}>;

const MAX = 9223372036854775807n;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const categories = ["store_fee", "fee_tax", "sales_tax", "developer_proceeds"] as const;
const invalid = (): never => { throw Error("native_production_contract_invalid"); };
function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)
    || Object.getPrototypeOf(v) !== Object.prototype
    || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) return invalid();
  return v as Record<string, unknown>;
}
function text(v: unknown): asserts v is string {
  if (typeof v !== "string" || !v || v.length > 512 || v.trim() !== v || /[\u0000-\u001f\u007f]/u.test(v)) invalid();
}
function hash(v: unknown): asserts v is string { if (typeof v !== "string" || !HASH.test(v)) invalid(); }
function uuid(v: unknown): asserts v is string { if (typeof v !== "string" || !UUID.test(v)) invalid(); }
function integer(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts v is number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) invalid();
}
function amount(v: unknown): asserts v is string | null {
  if (v !== null && (typeof v !== "string" || !/^(0|[1-9][0-9]{0,18})$/u.test(v) || BigInt(v) > MAX)) invalid();
}
function scope(v: unknown): asserts v is NativeProductionScopeV1 {
  const s = object(v, ["environment", "provider", "projectId", "appId", "storeAccountId", "productId", "currency"]);
  if (s.environment !== "production" || s.currency !== "usd"
    || !["revenuecat_app_store", "revenuecat_google_play"].includes(s.provider as string)) invalid();
  for (const k of ["projectId", "appId", "storeAccountId", "productId"]) text(s[k]);
}
function identity(v: unknown): asserts v is Identity {
  const i = object(v, ["scope", "transactionId", "originalTransactionId", "buyerId"]);
  scope(i.scope); text(i.transactionId); text(i.originalTransactionId); uuid(i.buyerId);
}
function source(v: unknown): asserts v is NativeProductionSourceV1 {
  const s = object(v, ["creatorId", "sourceId", "incarnation", "assetSha256", "revision"]);
  uuid(s.creatorId); uuid(s.sourceId); uuid(s.incarnation); hash(s.assetSha256); integer(s.revision, 1);
}
function admission(v: unknown): asserts v is NativeProductionAdmissionV1 {
  const a = object(v, ["protocol", "id", "buyerId", "scope", "source", "quoteSha256", "termsSha256", "grossMinor", "quantity",
    "quoteCreatedAt", "quoteExpiresAt", "admittedAt", "platformShareBps"]);
  if (a.protocol !== "native-production-admission-v1" || a.quantity !== 1) invalid();
  uuid(a.id); uuid(a.buyerId); scope(a.scope); source(a.source); hash(a.quoteSha256); hash(a.termsSha256);
  amount(a.grossMinor); if (a.grossMinor === null || a.grossMinor === "0") invalid();
  integer(a.quoteCreatedAt, 1); integer(a.quoteExpiresAt, 1); integer(a.admittedAt, 1); integer(a.platformShareBps, 0, 10000);
  if (a.quoteCreatedAt > a.admittedAt || a.admittedAt >= a.quoteExpiresAt) invalid();
}
function observation(v: unknown): asserts v is NativeProductionObservationV1 {
  const kind = (v as Record<string, unknown> | null)?.kind;
  const extra = kind === "purchase" ? ["admissionId", "quoteSha256", "grossMinor", "quantity", "purchasedAt"]
    : kind === "component" ? ["componentId", "category", "amountMinor", "reportSchema", "qualificationId", "attribution"]
    : kind === "coverage" ? ["revision", "componentIds", "reportSchema", "qualificationId", "through"]
    : ["refund", "revocation", "chargeback"].includes(kind as string) ? ["negativeId", "effectiveAt", "amountMinor"] : invalid();
  const o = object(v, ["id", "kind", "evidenceSha256", "observedAt", "identity", ...extra]);
  text(o.id); hash(o.evidenceSha256); integer(o.observedAt, 1); identity(o.identity);
  if (kind === "purchase") {
    uuid(o.admissionId); hash(o.quoteSha256); amount(o.grossMinor);
    if (o.quantity !== null) integer(o.quantity, 1); integer(o.purchasedAt, 1);
    if (o.purchasedAt > o.observedAt) invalid();
  } else if (kind === "component") {
    text(o.componentId); text(o.reportSchema); uuid(o.qualificationId); amount(o.amountMinor);
    if (!categories.includes(o.category as typeof categories[number])
      || !["transaction", "aggregate", "unknown"].includes(o.attribution as string)) invalid();
  } else if (kind === "coverage") {
    integer(o.revision, 1); integer(o.through, 1); text(o.reportSchema); uuid(o.qualificationId);
    if (o.through > o.observedAt || !Array.isArray(o.componentIds) || o.componentIds.length > 1024) return invalid();
    for (const id of o.componentIds) text(id);
    if (new Set(o.componentIds).size !== o.componentIds.length) invalid();
  } else { text(o.negativeId); amount(o.amountMinor); integer(o.effectiveAt, 1); if (o.effectiveAt > o.observedAt) invalid(); }
}
function qualification(v: unknown): asserts v is NativeProductionQualificationV1 {
  const q = object(v, ["id", "scope", "reportSchema", "evidenceSha256", "verifiedAt", "expiresAt", "revoked", "basis",
    ...(v && typeof v === "object" && Object.hasOwn(v, "renewalOf") ? ["renewalOf"] : [])]);
  uuid(q.id); scope(q.scope); text(q.reportSchema); hash(q.evidenceSha256); integer(q.verifiedAt, 1); integer(q.expiresAt, 1);
  if (Object.hasOwn(q, "renewalOf")) { uuid(q.renewalOf); if (q.renewalOf === q.id) invalid(); }
  if (q.expiresAt <= q.verifiedAt || typeof q.revoked !== "boolean"
    || q.basis !== "independent_transaction_fee_tax_proceeds_review") invalid();
}
function canonical(v: unknown): string {
  return JSON.stringify(v, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
}
function frozen<T>(v: T): T {
  if (v && typeof v === "object") { for (const item of Object.values(v)) frozen(item); Object.freeze(v); }
  return v;
}
function journal(v: unknown): asserts v is NativeProductionJournalV1 {
  const j = object(v, ["protocol", "identity", "observations"]);
  if (j.protocol !== "native-production-economic-journal-v1" || !Array.isArray(j.observations) || j.observations.length > 2048) return invalid();
  identity(j.identity);
  const ids = new Set();
  for (const o of j.observations) {
    observation(o);
    if (canonical(o.identity) !== canonical(j.identity) || ids.has(o.id)) invalid();
    ids.add(o.id);
  }
}
export function createNativeProductionJournalV1(input: unknown): NativeProductionJournalV1 {
  identity(input);
  return frozen({ protocol: "native-production-economic-journal-v1", identity: structuredClone(input), observations: [] });
}
export function appendNativeProductionObservationV1(input: unknown, value: unknown): NativeProductionJournalV1 {
  journal(input); observation(value);
  if (canonical(input.identity) !== canonical(value.identity)) throw Error("native_production_identity_conflict");
  const existing = input.observations.find(o => o.id === value.id);
  if (existing && canonical(existing) !== canonical(value)) throw Error("native_production_observation_conflict");
  if (!existing && input.observations.length >= 2048) throw Error("native_production_journal_capacity");
  return frozen(structuredClone({ ...input, observations: existing ? input.observations : [...input.observations, value] }));
}

/** Diagnostic projection only. Even complete synthetic evidence is HELD.
 * Negative observations never disappear because a purchase/report arrived later.
 * Report components and complete coverage are separate; an empty report is not
 * explicit zero. Qualifications are rechecked now without an older fallback.
 */
export function projectNativeProductionEconomicsV1(input: unknown, accepted: unknown, currentSource: unknown,
  qualificationRecords: readonly unknown[], now: number) {
  journal(input); admission(accepted); source(currentSource); integer(now, 1);
  if (!Array.isArray(qualificationRecords) || qualificationRecords.length > 128) invalid();
  qualificationRecords.forEach(qualification);
  const qualifications = qualificationRecords as readonly NativeProductionQualificationV1[];
  if (new Set(qualifications.map(q => q.id)).size !== qualifications.length) invalid();
  const reasons = new Set<string>();
  if (canonical(accepted.scope) !== canonical(input.identity.scope) || accepted.buyerId !== input.identity.buyerId
    || accepted.buyerId === accepted.source.creatorId) reasons.add("admission_identity_mismatch");
  if (canonical(accepted.source) !== canonical(currentSource)) reasons.add("source_incarnation_changed");
  if (accepted.admittedAt > now || input.observations.some(o => o.observedAt > now)) reasons.add("future_evidence");
  const purchases = input.observations.filter(o => o.kind === "purchase")
    .sort((a, b) => a.observedAt - b.observedAt || (a.id < b.id ? -1 : 1));
  const purchase = purchases[0];
  if (!purchase) reasons.add("purchase_missing");
  const purchaseFacts = (o: typeof purchase) => o && [o.admissionId, o.quoteSha256, o.grossMinor, o.quantity, o.purchasedAt];
  if (purchases.some(o => canonical(purchaseFacts(o)) !== canonical(purchaseFacts(purchase)))) reasons.add("purchase_conflict");
  if (purchase && (purchase.admissionId !== accepted.id || purchase.quoteSha256 !== accepted.quoteSha256
    || purchase.grossMinor !== accepted.grossMinor || purchase.quantity !== 1
    || purchase.purchasedAt < accepted.admittedAt || purchase.purchasedAt >= accepted.quoteExpiresAt)) reasons.add("purchase_quote_mismatch");
  if (input.observations.some(o => ["refund", "revocation", "chargeback"].includes(o.kind))) reasons.add("negative_lifecycle_hold");

  const coverages = input.observations.filter(o => o.kind === "coverage")
    .sort((a, b) => b.revision - a.revision || a.observedAt - b.observedAt || (a.id < b.id ? -1 : 1));
  const coverage = coverages[0];
  if (!coverage) reasons.add("coverage_missing");
  const coverageFacts = (o: typeof coverage) => o && [o.revision, [...o.componentIds].sort(), o.reportSchema, o.through];
  if (coverage && coverages.some(o => o.revision === coverage.revision
    && canonical(coverageFacts(o)) !== canonical(coverageFacts(coverage)))) reasons.add("coverage_conflict");
  const components = new Map<string, Extract<NativeProductionObservationV1, { kind: "component" }>>();
  for (const component of input.observations.filter(o => o.kind === "component")) {
    const first = components.get(component.componentId);
    const facts = (o: typeof component) => [o.category, o.amountMinor, o.reportSchema, o.attribution];
    if (first && canonical(facts(first)) !== canonical(facts(component))) reasons.add("component_conflict");
    // Arrival order must not upgrade an older unqualified observation when an
    // overlapping report repeats the same component after qualification.
    if (!first || component.observedAt < first.observedAt
      || (component.observedAt === first.observedAt && component.id < first.id)) components.set(component.componentId, component);
  }
  if (coverage && (canonical([...components.keys()].sort()) !== canonical([...coverage.componentIds].sort())
    || !coverage.componentIds.length || (purchase && coverage.through < purchase.purchasedAt))) reasons.add("coverage_incomplete");
  const exact = qualifications.filter(q => canonical(q.scope) === canonical(input.identity.scope))
    .sort((a, b) => b.verifiedAt - a.verifiedAt || (a.id < b.id ? 1 : -1));
  const historical = exact.find(q => q.verifiedAt <= accepted.admittedAt);
  const root = historical?.renewalOf ?? historical?.id;
  const anchor = qualifications.find(q => q.id === root);
  const candidates = qualifications.filter(q => canonical(q.scope) === canonical(input.identity.scope) || q.renewalOf === root)
    .sort((a, b) => b.verifiedAt - a.verifiedAt || (a.id < b.id ? 1 : -1));
  const current = candidates[0];
  const equivalent = (q: NativeProductionQualificationV1 | undefined) => q && historical && anchor
    && !q.revoked && !historical.revoked && !anchor.revoked && !anchor.renewalOf
    && anchor.verifiedAt <= historical.verifiedAt && anchor.verifiedAt <= q.verifiedAt
    && canonical(anchor.scope) === canonical(historical.scope) && anchor.reportSchema === historical.reportSchema && anchor.basis === historical.basis
    && (q.id === historical.id || q.id === root || q.renewalOf === root)
    && canonical(q.scope) === canonical(historical.scope) && q.reportSchema === historical.reportSchema && q.basis === historical.basis;
  if (!equivalent(current) || !current || current.verifiedAt > now || current.expiresAt <= now
    || current.reportSchema !== coverage?.reportSchema || candidates.filter(q => q.verifiedAt === current.verifiedAt).length !== 1)
    reasons.add("qualification_unavailable");
  if (!historical || historical.expiresAt <= accepted.admittedAt
    || exact.filter(q => q.verifiedAt === historical.verifiedAt).length !== 1) reasons.add("scope_unqualified_at_admission");
  // Validate EVERY retained report against its own issuer, not the current
  // renewal's UUID. A late copy cannot retroactively qualify an older report.
  for (const row of input.observations.filter(o => o.kind === "component" || o.kind === "coverage")) {
    const issuer = qualifications.find(q => q.id === row.qualificationId);
    if (!equivalent(issuer) || !issuer || row.reportSchema !== issuer.reportSchema
      || issuer.verifiedAt > row.observedAt || issuer.expiresAt <= row.observedAt)
      reasons.add(row.kind === "coverage" ? "coverage_unqualified_when_observed" : "component_unqualified");
  }
  const totals = Object.fromEntries(categories.map(k => [k, 0n])) as Record<typeof categories[number], bigint>;
  for (const category of categories) {
    const rows = [...components.values()].filter(c => c.category === category);
    if (!rows.length || rows.some(c => c.amountMinor === null)) reasons.add(`${category}_unknown`);
    if (category === "developer_proceeds" && rows.length !== 1) reasons.add("proceeds_total_ambiguous");
    for (const row of rows) {
      if (row.attribution !== "transaction" || row.reportSchema !== coverage?.reportSchema) reasons.add("component_unqualified");
      if (row.amountMinor !== null) totals[category] += BigInt(row.amountMinor);
    }
    if (totals[category] > MAX) reasons.add("amount_overflow");
  }
  if (BigInt(accepted.grossMinor) !== totals.store_fee + totals.fee_tax + totals.sales_tax + totals.developer_proceeds)
    reasons.add("gross_tax_fee_proceeds_mismatch");
  const complete = reasons.size === 0;
  const platform = complete ? totals.developer_proceeds * BigInt(accepted.platformShareBps) / 10000n : null;
  return frozen({ protocol: "native-production-economic-projection-v1" as const, status: "HELD" as const,
    economicCoverageComplete: complete,
    creatorCandidateMinor: platform === null ? null : (totals.developer_proceeds - platform).toString(),
    platformCandidateMinor: platform?.toString() ?? null,
    reasons: [...reasons].sort().concat("production_ledger_adapter_unqualified"),
    dispatchAllowed: false as const, grantsAccess: false as const, settlementAllowed: false as const,
    financialAuthority: false as const, payable: false as const });
}
