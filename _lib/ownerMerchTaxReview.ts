import {
  assertAccountBoundSupabaseMutationSubjectCurrent,
  captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc,
  type AccountBoundSupabaseMutationSubject,
} from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "./accountSessionAuthority";
import { supabase } from "./supabase";

export type EvidenceStatus = "current" | "missing" | "expired" | "unknown";
export type OwnerTaxCategory = {
  id: string; categoryKey: string; label: string; revision: number; scopeDescription: string;
  taxCode: string; taxBehavior: "inclusive"; professionalBasisReference: string;
  coverageEvidenceReference: string; expiresAt: string; revokedAt: string | null; current: boolean;
};
export type OwnerTaxRequest = {
  id: string; productId: string; creatorId: string; title: string; description: string | null; note: string;
  current: boolean;
  variants: { id: string; sku: string; size: string | null; color: string | null }[];
  status: "review_required" | "provider_evidence_required" | "reviewed" | "ready";
  createdAt: string; suggestedCategoryId: string | null;
  classificationStatus: EvidenceStatus;
  providerStatus: EvidenceStatus; accountStatus: EvidenceStatus; jurisdictionStatus: EvidenceStatus;
};
export type TaxReviewCursor = { createdAt: string; id: string };
export type OwnerTaxReviewQueue = { requests: OwnerTaxRequest[]; categories: OwnerTaxCategory[]; nextCursor: TaxReviewCursor | null };
export type TaxCatalogCode = { id: string; name: string; description: string; supported: boolean };
export type TaxCatalogPage = { codes: TaxCatalogCode[]; hasMore: boolean; nextCursor: string | null };
export type CategoryReviewInput = {
  categoryKey: string; label: string; scopeDescription: string; taxCode: string;
  professionalBasisReference: string; coverageEvidenceReference: string; expiresAt: string; expectedRevision: number;
};
export type TaxReviewIntent = () => boolean;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CODE = /^txcd_[0-9]+$/u;
const INVALID = "Category review is unavailable. Refresh before trying again.";
const UNKNOWN = "The save could not be confirmed. Refresh the review queue before trying again; do not repeat the save yet.";
const ERRORS: Record<string, string> = {
  tax_category_revision_changed: "This category has a newer revision. Refresh and review the latest version before saving.",
  tax_category_review_expired: "This category is no longer current. Refresh and choose a current reviewed category.",
  tax_request_changed_reload: "The item or its request changed. Refresh and review the latest request.",
  tax_review_product_changed: "The item or its request changed. Refresh and review the latest request.",
  merch_product_changed_reload: "The item changed. Refresh and review its latest description.",
  owner_current_session_required: "Owner access could not be verified. Sign in again and refresh.",
  tax_category_catalog_required: "Refresh the provider category choices, then select a verified choice before saving.",
  tax_code_catalog_refresh_required: "Refresh the provider category choices, then select a verified choice before saving.",
  tax_review_decision_immutable: "This request was already reviewed. Refresh to see the saved category suggestion.",
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID);
  return value as Record<string, unknown>;
};
const string = (value: unknown, max = 4000, min = 1): string => {
  if (typeof value !== "string" || value.length < min || value.length > max) throw new Error(INVALID);
  return value;
};
const id = (value: unknown): string => { const text = string(value, 36); if (!UUID.test(text)) throw new Error(INVALID); return text; };
const date = (value: unknown): string => { const text = string(value, 50); if (!Number.isFinite(Date.parse(text))) throw new Error(INVALID); return text; };
const integer = (value: unknown, min: number): number => { if (!Number.isSafeInteger(value) || Number(value) < min) throw new Error(INVALID); return Number(value); };
const evidence = (value: unknown): EvidenceStatus => {
  // Absent evidence is unknown, never a derived approval from category status.
  if (value == null) return "unknown";
  if (!["current", "missing", "expired", "unknown"].includes(String(value))) throw new Error(INVALID);
  return value as EvidenceStatus;
};
const unique = <T extends { id: string }>(rows: T[]): T[] => { if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(INVALID); return rows; };
function category(value: unknown): OwnerTaxCategory {
  const row = record(value), code = string(row.taxCode, 80), key = string(row.categoryKey, 80);
  if (!CODE.test(code) || !/^[a-z0-9][a-z0-9_-]{1,79}$/u.test(key) || row.taxBehavior !== "inclusive" || typeof row.current !== "boolean") throw new Error(INVALID);
  return { id: id(row.id), categoryKey: key, label: string(row.label, 160), revision: integer(row.revision, 1),
    scopeDescription: string(row.scopeDescription), taxCode: code, taxBehavior: "inclusive",
    professionalBasisReference: string(row.professionalBasisReference, 2000), coverageEvidenceReference: string(row.coverageEvidenceReference, 2000),
    expiresAt: date(row.expiresAt), revokedAt: row.revokedAt == null ? null : date(row.revokedAt), current: row.current };
}
export function parseOwnerTaxReviewQueue(value: unknown): OwnerTaxReviewQueue {
  const data = record(value);
  if (!Array.isArray(data.requests) || data.requests.length > 50 || !Array.isArray(data.categories) || data.categories.length > 1000) throw new Error(INVALID);
  const requests = unique(data.requests.map(value => {
    const row = record(value);
    if (!["review_required", "provider_evidence_required", "reviewed", "ready"].includes(String(row.status)) || typeof row.current !== "boolean") throw new Error(INVALID);
    if (row.variants != null && (!Array.isArray(row.variants) || row.variants.length > 50)) throw new Error(INVALID);
    const variants = unique(((row.variants ?? []) as unknown[]).map(value => {
      const variant = record(value);
      return { id: id(variant.id), sku: string(variant.sku, 64), size: variant.size == null ? null : string(variant.size, 60), color: variant.color == null ? null : string(variant.color, 60) };
    }));
    return { id: id(row.id), productId: id(row.productId), creatorId: id(row.creatorId), title: string(row.title, 400),
      description: row.description == null ? null : string(row.description, 10000, 0), variants, current: row.current,
      note: string(row.note, 4000, 0), status: row.status as OwnerTaxRequest["status"], createdAt: date(row.createdAt),
      suggestedCategoryId: row.suggestedCategoryId == null ? null : id(row.suggestedCategoryId),
      classificationStatus: evidence(row.classificationStatus),
      providerStatus: evidence(row.providerStatus), accountStatus: evidence(row.accountStatus), jurisdictionStatus: evidence(row.jurisdictionStatus) };
  }));
  const cursor = data.nextCursor == null ? null : record(data.nextCursor);
  return { requests, categories: unique(data.categories.map(category)), nextCursor: cursor ? { createdAt: date(cursor.createdAt), id: id(cursor.id) } : null };
}
export function parseOwnerTaxCatalog(value: unknown): TaxCatalogPage {
  const data = record(value);
  if (data.providerReady !== false || typeof data.hasMore !== "boolean" || !Array.isArray(data.codes) || data.codes.length > 100) throw new Error(INVALID);
  const codes = unique(data.codes.map(value => {
    const row = record(value), code = string(row.id, 80);
    if (!CODE.test(code) || typeof row.supported !== "boolean") throw new Error(INVALID);
    return { id: code, name: string(row.name, 300), description: string(row.description, 10000, 0), supported: row.supported };
  }));
  const nextCursor = data.nextCursor == null ? null : string(data.nextCursor, 80);
  if (data.hasMore !== !!nextCursor || (nextCursor && (codes.length === 0 || nextCursor !== codes.at(-1)?.id))) throw new Error(INVALID);
  return { codes, hasMore: data.hasMore, nextCursor };
}
function assertIntent(current: TaxReviewIntent) { if (!current()) throw new Error(INVALID); }
async function bound<T>(current: TaxReviewIntent, work: (subject: AccountBoundSupabaseMutationSubject, stillCurrent: TaxReviewIntent) => Promise<T>) {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly) throw new Error(INVALID);
  let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(authority, next)) retired = true; });
  const active = () => !retired && current() && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  try {
    assertIntent(active);
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    assertIntent(active);
    if (!sameAccountSessionAuthority(authority, subject.authority)) throw new Error(INVALID);
    const result = await work(subject, active);
    assertIntent(active);
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    return result;
  } finally { unsubscribe(); }
}
async function rpc(name: string, args: Record<string, unknown>, current: TaxReviewIntent, mutation = false) {
  try {
    return await bound(current, async (subject, active) => {
      assertIntent(active);
      const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, name, args);
      if (result.error) {
        const known = Object.keys(ERRORS).find(key => result.error?.message?.includes(key));
        throw new Error(known ? ERRORS[known] : mutation ? UNKNOWN : INVALID);
      }
      return result.data;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new Error(Object.values(ERRORS).includes(message) ? message : mutation ? UNKNOWN : INVALID);
  }
}
export async function readOwnerTaxReviewQueue(current: TaxReviewIntent, cursor: TaxReviewCursor | null = null) {
  return parseOwnerTaxReviewQueue(await rpc("get_owner_merch_tax_review_queue", { p_limit: 50, p_before: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null }, current));
}
export async function readOwnerTaxCatalog(current: TaxReviewIntent, startingAfter: string | null = null) {
  try {
    if (startingAfter && !CODE.test(startingAfter)) throw new Error(INVALID);
    return await bound(current, async (subject, active) => {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error(INVALID)); }, 20_000);
      });
      try {
        assertIntent(active);
        const result = await Promise.race([supabase.functions.invoke("stripe-tax-category-catalog", {
          headers: { Authorization: `Bearer ${subject.accessToken}` }, signal: controller.signal,
          body: startingAfter ? { startingAfter } : {},
        }), deadline]);
        if (result.error) throw new Error(INVALID);
        return parseOwnerTaxCatalog(result.data);
      } finally { clearTimeout(timeout); }
    });
  } catch { throw new Error("Provider category choices are unavailable. Retry when the verified provider connection is available; no category has been approved."); }
}
export async function reviewOwnerTaxCategory(input: CategoryReviewInput, current: TaxReviewIntent) {
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/u.test(input.categoryKey) || !CODE.test(input.taxCode)
    || input.label.trim().length < 1 || input.label.length > 160 || input.scopeDescription.trim().length < 10 || input.scopeDescription.length > 4000
    || input.professionalBasisReference.trim().length < 3 || input.professionalBasisReference.length > 2000
    || input.coverageEvidenceReference.trim().length < 3 || input.coverageEvidenceReference.length > 2000
    || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now()
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Complete the category, scope, references, verified provider choice and future review date before saving.");
  const data = record(await rpc("review_owner_merch_tax_category", {
    p_category_key: input.categoryKey, p_label: input.label.trim(), p_scope_description: input.scopeDescription.trim(),
    p_tax_code: input.taxCode, p_tax_behavior: "inclusive", p_professional_basis_reference: input.professionalBasisReference.trim(),
    p_coverage_evidence_reference: input.coverageEvidenceReference.trim(), p_expires_at: input.expiresAt, p_expected_revision: input.expectedRevision,
  }, current, true));
  if (data.providerReady !== false || data.categoryKey !== input.categoryKey || data.revision !== input.expectedRevision + 1 || data.label !== input.label.trim()) throw new Error(UNKNOWN);
  return { id: id(data.id), revision: integer(data.revision, 1) };
}
export async function resolveOwnerTaxRequest(requestId: string, categoryId: string, note: string, current: TaxReviewIntent) {
  if (note.trim().length < 3 || note.length > 4000) throw new Error("Add a short review note before suggesting this category.");
  const data = record(await rpc("resolve_owner_merch_tax_request", { p_request_id: id(requestId), p_category_id: id(categoryId), p_note: note.trim() }, current, true));
  if (data.status !== "reviewed" || data.providerReady !== false) throw new Error(UNKNOWN);
}
export async function revokeOwnerTaxCategory(categoryId: string, current: TaxReviewIntent) {
  const data = record(await rpc("revoke_owner_merch_tax_category", { p_category_id: id(categoryId) }, current, true));
  if (data.status !== "revoked") throw new Error(UNKNOWN);
}
