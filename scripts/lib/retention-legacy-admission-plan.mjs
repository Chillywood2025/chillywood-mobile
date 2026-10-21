// Offline preflight only. This module never admits a key, authorizes deletion,
// modifies readiness, contacts a provider, or synthesizes upload reservations.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safeKey = value => typeof value === 'string' && value.length > 0 && value.length <= 1024
  && !value.startsWith('/') && !value.includes('..') && !/[\x00-\x20\x7f\\%?#]/.test(value);
const exact = (a, b, fields) => fields.every(field => a?.[field] !== undefined && a[field] === b?.[field]);

/**
 * Build a review plan from a bounded metadata snapshot and independently
 * collected evidence descriptors. Descriptors are assertions, NOT trusted
 * provider proof. Even a complete plan cannot make a legacy object eligible.
 * Return codes only: never echo identity, object locators, URLs or credentials.
 */
export function planLegacyOriginalAdmission(input) {
  const source = input?.source ?? {};
  const evidence = input?.evidence ?? {};
  const blockers = new Set();
  const block = (condition, code) => { if (condition) blockers.add(code); };
  block(!['creator_video', 'social_attachment'].includes(source.type), 'unsupported_source_type');
  block(!uuid(source.id) || !uuid(source.ownerId) || !instant(source.createdAt), 'source_incarnation_unproven');
  block(source.provider !== 'cloudflare_r2' || source.bucket !== 'chillywood-media-origin', 'provider_adapter_or_approved_migration_required');
  block(!safeKey(source.objectKey), 'unsafe_or_ambiguous_locator');
  if (source.type === 'social_attachment') {
    block(!uuid(source.parentId) || typeof source.parentType !== 'string' || !/^[a-z_]+$/.test(source.parentType), 'parent_binding_unproven');
  }
  const fields = ['type', 'id', 'ownerId', 'createdAt', 'provider', 'bucket', 'objectKey'];
  if (source.type === 'social_attachment') fields.push('parentType', 'parentId');
  block(!exact(source, evidence.before, fields) || !exact(source, evidence.after, fields), 'source_changed_or_unobserved');
  block(!digest(evidence.origin?.sha256) || !Number.isSafeInteger(evidence.origin?.sizeBytes)
    || evidence.origin.sizeBytes <= 0 || !instant(evidence.origin?.observedAt)
    || !exact(source, evidence.origin, ['provider', 'bucket', 'objectKey']), 'exact_origin_evidence_missing');
  // A HEAD/ETag alone cannot establish ownership, immutable bytes, or non-reuse.
  block(!digest(evidence.ownershipRecordDigest), 'independent_ownership_provenance_missing');
  block(evidence.scan?.result !== 'clean' || !digest(evidence.scan?.sha256)
    || evidence.scan.sha256 !== evidence.origin?.sha256 || !instant(evidence.scan?.completedAt), 'exact_bytes_clean_scan_missing');
  block(evidence.referenceInventory?.complete !== true || evidence.referenceInventory?.otherReferenceCount !== 0,
    'reference_inventory_incomplete_or_shared');
  block(evidence.secondaryInventory?.complete !== true || evidence.secondaryInventory?.uncoveredCount !== 0,
    'secondary_coverage_missing');
  block(evidence.admissionFence?.allWritersCovered !== true || evidence.admissionFence?.priorRequestsDrained !== true
    || !digest(evidence.admissionFence?.proofDigest), 'nonreuse_and_drain_proof_missing');
  block(evidence.holdMapping?.complete !== true, 'hold_scope_unproven');
  block(evidence.legalHoldActive !== false, 'hold_present_or_unknown');
  return Object.freeze({
    protocolVersion: 1,
    status: blockers.size ? 'blocked' : 'review_required',
    blockers: Object.freeze([...blockers].sort()),
    evidenceAuthority: 'unverified_input_descriptors',
    admissionAllowed: false,
    physicalDeletionAllowed: false,
    productionMutationAllowed: false,
    uploadReservationCreated: false,
    runtimeIntegration: 'not_implemented',
  });
}
