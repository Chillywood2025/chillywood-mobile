# Remaining retention lifecycle: scoped implementation design

Status: source design, not implemented coverage or production qualification.
The October 21 snapshot contains 31 secondary records (six video renditions,
15 media renditions, ten jobs), 63 brand assets, and 23 Supabase originals.
Counts are not object inventories. None may be removed from readiness merely
because another adapter is implemented.

## Secondary objects

Keep the existing source-binding authority in
`20260827223000_creator_video_rendition_source_binding_closure.sql`.
Introduce a private immutable object identity and many-to-many binding registry:
exact provider/bucket/key/generation, content digest/size, actual producer or
historical admission receipt, source incarnation/owner, and explicit object role.
A job input is a reference, not an output; a prefix is never deletion authority.

Integrate `scripts/media-automation-cli.mjs`, `scripts/media-premium-hd-cli.mjs`,
and `record_video_original_rendition`, including restore/migration writers.
Persist their exact upload inventories before ready publication. HLS manifests
must recursively account for master, variants, segments and initialization
objects under bounded byte/dependency counts. Missing, external, cyclic or
unresolved dependencies fail closed. Historical prefix listings are diagnostic,
not ownership proof. The current shared master across multiple qualities needs
explicit shared bindings; future unique manifests avoid broadening playback
ownership. Do not reinterpret legacy shared bytes as new playback authority.

Capture the full inventory before FK cascades, using the existing source/reference
fence and deletion intent. Fence the producer generation against late writes and
late ready publication. A stale job's terminal status alone does not prove the
worker has drained; preserve exact generation/claim evidence. Capture real hard
or soft deletion, not moderation or ordinary replacement. Every binding keeps
its original deletion time and fixed 720-hour expiry. Shared objects become
physically eligible only when all references are terminal, all applicable
retention windows expire and all owning source/account/parent holds permit it.

## Brand assets

Preserve current Supabase delivery and publication. `_lib/platformBranding.ts`
uploads, signs and removes through Supabase directly. Existing schema/publication
predicates do not support an R2 rewrite. Brand ownership includes text identities
such as `platform_rachi_official`, not only UUIDs.

Recommended separate adapter: exact provenance and claim lifecycle for the
existing private `platform-brand-assets` Supabase bucket. This avoids a brand
provider/client cutover. It still requires reviewed source work, storage-delete
policy integration and deployment confirmation. Do not loosen origin allowlists.

Preserve both draft and published snapshot references. Draft edits do not change
published images; explicit Remove hides new resolution and starts the deletion
lifecycle exactly once. Unreferencing/replacing a picture is not automatically
deletion. Preserve audience/block/moderation/scan gates. Direct Storage removal
must be fenced, while independently proven unattached failed-upload cleanup stays
possible. Cleanup-candidate RPC classifications are not deletion intent.

## Delivery, expiry and verification

Extend existing claim/read/DELETE/HEAD/receipt machinery per exact object; retain
conservative unknown-reference detection. Serialize holds and claims using the
existing protocol. Capture survives source/account/reservation deletion. No
prefix DELETE, metadata-only proof or fabricated upload reservations.

Brand signed URLs last one hour; public HLS uses cached public playback. Row
removal cannot revoke existing URLs/cache bytes. Private-only deleted retention
requires separately qualified private preservation and exact source/cache removal,
with the applicable provider/deletion approvals. Do not claim instant revocation.

Required tests: actual producer continuation; exact HLS inventories; shared
masters; delete versus producer completion; publish versus Remove; holds versus
expiry; direct Supabase delete/nonreuse; abandoned upload recovery; lost receipts;
and immutable 720-hour deadlines. Replace blanket readiness counts only after
those covered/uncovered classifications are backed by runtime proof.

The held scanner remediation is excluded. This design does not authorize rescans,
marking bytes clean, provider operations, flags, schedules or deletion.
