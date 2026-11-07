import type { RouterObservation } from "./revenuecat-router-envelope.ts";

/** No-positive-authority plan over a trusted storage snapshot. A caller claiming
 * completeness is not qualification; this is never a public receipt verifier.
 */
export type RouterOwner = { domain: "legacy_premium" | "legacy_creator" | "isolated_sandbox"; generation: number };
export type RouterScope = { projectId: string; appId: string; store: "APP_STORE" | "PLAY_STORE";
  environment: "SANDBOX" | "PRODUCTION"; storeAppIdentity: string };
export type RouterCatalogOwnership = { scope: RouterScope; productId: string; owner: RouterOwner };
export type RouterOriginalOwnership = RouterCatalogOwnership & { originalTransactionId: string;
  originalBuyerId: string; intentId: string | null; revision: number };
export type RouterOwnershipSnapshot = { revision: number; coverage: "incomplete" | "complete";
  projectId: string; scopes: readonly RouterScope[]; catalog: readonly RouterCatalogOwnership[];
  originals: readonly RouterOriginalOwnership[] };
export type RouterHoldTarget = { subjectId: string; evidenceRole: "source" | "target" | "reported" | "bound_owner";
  originalTransactionId: string | null; owner: RouterOwner | null };
export type RouterPlan = {
  protocol: "rc-router-plan-v1"; grantsAuthority: false; providerDispatchAllowed: false;
  legacyProjectionAllowed: false; acknowledgementAllowed: false;
  disposition: "no_effect_test" | "owner_candidate" | "awaiting_binding" | "reconciliation_required" | "unresolved_scope";
  reason: string; snapshotRevision: number; owner: RouterOwner | null;
  productId: string | null; originalTransactionId: string | null;
  holdTargets: RouterHoldTarget[]; requiresCompleteProviderEvidence: boolean;
};
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512
  && v === v.trim() && !/[\u0000-\u001f\u007f]/u.test(v);
const uuid = (v: unknown): v is string => typeof v === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const ownerKey = (o: RouterOwner) => JSON.stringify([o.domain, o.generation]);
const scopeKey = (s: RouterScope) => JSON.stringify([s.projectId, s.appId, s.store, s.environment, s.storeAppIdentity]);
const validOwner = (o: RouterOwner) => !!o && ["legacy_premium", "legacy_creator", "isolated_sandbox"].includes(o.domain)
  && Number.isSafeInteger(o.generation) && o.generation > 0;
const validScope = (s: RouterScope) => !!s && text(s.projectId) && text(s.appId) && text(s.storeAppIdentity)
  && ["APP_STORE", "PLAY_STORE"].includes(s.store) && ["SANDBOX", "PRODUCTION"].includes(s.environment);
const validSnapshot = (s: RouterOwnershipSnapshot) => !!s && Number.isSafeInteger(s.revision) && s.revision > 0
  && text(s.projectId) && ["incomplete", "complete"].includes(s.coverage)
  && Array.isArray(s.scopes) && s.scopes.length <= 32 && s.scopes.every(x => validScope(x) && x.projectId === s.projectId)
  && Array.isArray(s.catalog) && s.catalog.length <= 5000 && s.catalog.every(x => validScope(x.scope) && x.scope.projectId === s.projectId && text(x.productId) && validOwner(x.owner))
  && Array.isArray(s.originals) && s.originals.length <= 5000 && s.originals.every(x => validScope(x.scope) && x.scope.projectId === s.projectId
    && text(x.productId) && validOwner(x.owner) && text(x.originalTransactionId) && uuid(x.originalBuyerId) && (x.intentId === null || uuid(x.intentId))
    && Number.isSafeInteger(x.revision) && x.revision > 0);
const initial = new Set(["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"]);
const terminal = new Set(["CANCELLATION", "BILLING_ISSUE", "EXPIRATION", "REFUND", "REVOCATION"]);

export function planRevenueCatObservation(observation: RouterObservation, snapshot: RouterOwnershipSnapshot): RouterPlan {
  const base: RouterPlan = { protocol: "rc-router-plan-v1", grantsAuthority: false, providerDispatchAllowed: false,
    legacyProjectionAllowed: false, acknowledgementAllowed: false, disposition: "unresolved_scope",
    reason: "ownership_snapshot_invalid", snapshotRevision: snapshot?.revision ?? 0, owner: null,
    productId: null, originalTransactionId: null, holdTargets: [], requiresCompleteProviderEvidence: true };
  if (!validSnapshot(snapshot)) return base;
  // Observation comes from decrypted authenticated stored bytes, never a client
  // body. Invalid observations still retain all independently parsed identities.
  if (!observation || !Array.isArray(observation.transferredFrom) || !Array.isArray(observation.transferredTo)
    || !Array.isArray(observation.aliases) || !Array.isArray(observation.conflictingUserIds)
    || !Array.isArray(observation.issues)) return { ...base, reason: "observation_invalid" };
  const targets = (owner: RouterOwner | null = null, original: string | null = null): RouterHoldTarget[] => {
    const out: RouterHoldTarget[] = [];
    for (const [role, ids] of [["source", observation.transferredFrom], ["target", observation.transferredTo],
      ["reported", [observation.userId, ...observation.conflictingUserIds]]] as const)
      for (const id of ids) if (uuid(id)) out.push({ subjectId: id, evidenceRole: role, originalTransactionId: original, owner });
    return [...new Map(out.map(row => [JSON.stringify(row), row])).values()];
  };
  const pending = (reason: string, holdTargets = targets()): RouterPlan => ({ ...base, reason,
    disposition: holdTargets.length ? "reconciliation_required" : "unresolved_scope", holdTargets });
  if (observation.parseStatus !== "valid") return pending("malformed_authenticated_evidence");
  if (observation.eventType === "TEST") return { ...base, disposition: "no_effect_test", reason: "provider_test_has_no_authority",
    requiresCompleteProviderEvidence: false };
  const scopes = snapshot.scopes.filter(s => s.appId === observation.appId && s.store === observation.store && s.environment === observation.environment);
  if (scopes.length !== 1) return pending("event_scope_missing_or_ambiguous");
  const scope = scopes[0];
  if (snapshot.coverage !== "complete") return pending("ownership_coverage_incomplete");
  if (observation.eventType === "TRANSFER") {
    // Productless transfers name identity sets, not the exact originals moved.
    // Never choose a source Premium subscription or mint a target right here.
    const holdTargets = targets();
    for (const binding of snapshot.originals.filter(b => scopeKey(b.scope) === scopeKey(scope)
      && holdTargets.some(t => t.subjectId === b.originalBuyerId)))
      holdTargets.push({ subjectId: binding.originalBuyerId, evidenceRole: "bound_owner",
        originalTransactionId: binding.originalTransactionId, owner: { ...binding.owner } });
    return pending("transfer_requires_both_identity_and_original_evidence", holdTargets);
  }
  const bindings = snapshot.originals.filter(b => scopeKey(b.scope) === scopeKey(scope)
    && b.originalTransactionId === observation.originalTransactionId);
  if (bindings.length > 1) return pending("original_owner_ambiguous");
  const binding = bindings[0];
  if (binding && (binding.originalBuyerId !== observation.userId
    || (observation.productId !== null && observation.productId !== binding.productId))) {
    return pending("original_identity_mismatch", [...targets(binding.owner, binding.originalTransactionId),
      { subjectId: binding.originalBuyerId, evidenceRole: "bound_owner", originalTransactionId: binding.originalTransactionId, owner: { ...binding.owner } }]);
  }
  if (terminal.has(observation.eventType ?? "") && !binding) return pending("terminal_original_binding_missing");
  if (observation.eventType === "RENEWAL" && !binding) return pending("renewal_original_binding_missing");
  if (![...initial, ...terminal, "RENEWAL"].includes(observation.eventType ?? ""))
    return pending("lifecycle_requires_independent_evidence", binding ? targets(binding.owner, binding.originalTransactionId) : targets());
  const productId = binding?.productId ?? observation.productId;
  const products = snapshot.catalog.filter(p => scopeKey(p.scope) === scopeKey(scope) && p.productId === productId);
  if (products.length !== 1 || (binding && ownerKey(products[0].owner) !== ownerKey(binding.owner)))
    return pending("catalog_owner_missing_or_ambiguous");
  if (!uuid(observation.userId) || !text(observation.originalTransactionId)
    || (initial.has(observation.eventType ?? "") && !text(observation.transactionId))) return pending("purchase_identity_incomplete");
  return { ...base, disposition: binding ? "owner_candidate" : "awaiting_binding",
    reason: binding ? "exact_owner_requires_idempotent_projector" : "exclusive_product_requires_atomic_admitted_intent",
    owner: { ...products[0].owner }, productId, originalTransactionId: observation.originalTransactionId,
    requiresCompleteProviderEvidence: !binding };
}
