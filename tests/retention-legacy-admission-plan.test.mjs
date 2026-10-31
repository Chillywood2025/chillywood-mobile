import test from 'node:test';
import assert from 'node:assert/strict';
import { planLegacyOriginalAdmission as plan } from '../scripts/lib/retention-legacy-admission-plan.mjs';
const hash = 'a'.repeat(64);
function fixture() {
  const source = { type: 'creator_video', id: '11111111-1111-4111-8111-111111111111', ownerId: '22222222-2222-4222-8222-222222222222', createdAt: '2026-10-20T00:00:00Z', provider: 'cloudflare_r2', bucket: 'chillywood-media-origin', objectKey: 'historical/immutable-test.mp4' };
  return { source, evidence: { before: { ...source }, after: { ...source }, origin: { ...source, sha256: hash, sizeBytes: 100, observedAt: '2026-10-21T00:00:00Z' }, ownershipRecordDigest: hash, scan: { result: 'clean', sha256: hash, completedAt: '2026-10-21T00:00:00Z' }, referenceInventory: { complete: true, otherReferenceCount: 0 }, secondaryInventory: { complete: true, uncoveredCount: 0 }, admissionFence: { allWritersCovered: true, priorRequestsDrained: true, proofDigest: hash }, holdMapping: { complete: true }, legalHoldActive: false } };
}
test('complete asserted evidence produces review only, never runtime authority', () => {
  const input = fixture(), before = JSON.stringify(input), result = plan(input);
  assert.equal(result.status, 'review_required');
  assert.equal(result.admissionAllowed, false); assert.equal(result.physicalDeletionAllowed, false);
  assert.equal(result.productionMutationAllowed, false); assert.equal(result.uploadReservationCreated, false);
  assert.equal(result.runtimeIntegration, 'not_implemented'); assert.equal(JSON.stringify(input), before);
});
test('missing evidence fails closed without leaking input fields', () => {
  const result = plan({ source: { objectKey: 'private-secret-key', token: 'do-not-print' } });
  assert.equal(result.status, 'blocked'); assert.ok(result.blockers.length >= 10);
  assert.doesNotMatch(JSON.stringify(result), /private-secret-key|do-not-print/);
  assert.equal(plan(null).status, 'blocked');
});
test('provider versions or local output inventories cannot qualify an unsupported original provider', () => {
  for(const provider of ['supabase','supabase_storage','s3','hetzner_s3','unknown']) {
    const input=fixture();
    for(const binding of [input.source,input.evidence.before,input.evidence.after,input.evidence.origin]) {
      binding.provider=provider;binding.versionId='asserted-not-verified-version';
    }
    input.evidence.outputInventory={retentionQualified:false,providerBytesVerified:false,objectCount:1,inventorySha256:hash};
    const result=plan(input);
    assert.equal(result.status,'blocked');
    assert.ok(result.blockers.includes('provider_adapter_or_approved_migration_required'));
    assert.equal(result.admissionAllowed,false);assert.equal(result.physicalDeletionAllowed,false);
    assert.equal(result.productionMutationAllowed,false);
  }
});
for (const [label, change, expected] of [
  ['owner changed', x => { x.evidence.after.ownerId = '33333333-3333-4333-8333-333333333333'; }, 'source_changed_or_unobserved'],
  ['source reincarnated', x => { x.evidence.after.createdAt = '2026-10-21T00:00:00Z'; }, 'source_changed_or_unobserved'],
  ['origin substituted', x => { x.evidence.origin.objectKey = 'different.mp4'; }, 'exact_origin_evidence_missing'],
  ['HEAD only', x => { delete x.evidence.origin.sha256; x.evidence.origin.etag = 'etag'; }, 'exact_origin_evidence_missing'],
  ['scan stale', x => { x.evidence.scan.sha256 = 'b'.repeat(64); }, 'exact_bytes_clean_scan_missing'],
  ['manual review', x => { x.evidence.scan.result = 'manual_review'; }, 'exact_bytes_clean_scan_missing'],
  ['shared object', x => { x.evidence.referenceInventory.otherReferenceCount = 1; }, 'reference_inventory_incomplete_or_shared'],
  ['unknown references', x => { delete x.evidence.referenceInventory.complete; }, 'reference_inventory_incomplete_or_shared'],
  ['secondary media', x => { x.evidence.secondaryInventory.uncoveredCount = 1; }, 'secondary_coverage_missing'],
  ['future writers unguarded', x => { x.evidence.admissionFence.allWritersCovered = false; }, 'nonreuse_and_drain_proof_missing'],
  ['old upload not drained', x => { x.evidence.admissionFence.priorRequestsDrained = false; }, 'nonreuse_and_drain_proof_missing'],
  ['hold active', x => { x.evidence.legalHoldActive = true; }, 'hold_present_or_unknown'],
  ['hold unknown', x => { delete x.evidence.legalHoldActive; }, 'hold_present_or_unknown'],
  ['missing ownership', x => { delete x.evidence.ownershipRecordDigest; }, 'independent_ownership_provenance_missing'],
  ['legacy Supabase', x => { x.source.provider = 'supabase'; }, 'provider_adapter_or_approved_migration_required'],
]) test(label, () => { const input = fixture(); change(input); const result = plan(input); assert.equal(result.status, 'blocked'); assert.ok(result.blockers.includes(expected)); });
for (const key of ['../source.mp4', '/source.mp4', 'a%2fb.mp4', 'a\\b.mp4', 'a?signature=secret', 'a\u0000b']) test('ambiguous key is never admitted: ' + JSON.stringify(key), () => {
  const input = fixture(); input.source.objectKey = key;
  assert.ok(plan(input).blockers.includes('unsafe_or_ambiguous_locator'));
});
test('attachment requires stable exact parent scope', () => {
  const input = fixture(); input.source.type = 'social_attachment';
  assert.ok(plan(input).blockers.includes('parent_binding_unproven'));
  Object.assign(input.source, { parentType: 'profile_post', parentId: input.source.id });
  input.evidence.before = { ...input.source }; input.evidence.after = { ...input.source, parentId: input.source.ownerId };
  assert.ok(plan(input).blockers.includes('source_changed_or_unobserved'));
});
