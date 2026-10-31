# Remaining retention lifecycle: scoped implementation design

Status: secondary-object coverage remains a source design, not production
qualification. The separate Brand adapter described historically below is now
implemented in the October 21 and October 25 migrations; preserve that adapter.
The October 21 snapshot contains 31 secondary records (six video renditions,
15 media renditions, ten jobs), 63 brand assets, and 23 Supabase originals.
Counts are not object inventories. None may be removed from readiness merely
because another adapter is implemented.

## Secondary objects

The October 31 producer increment adds `scripts/lib/hls-output-inventory.mjs`
to both public and Premium HLS producer paths before any output upload. It
validates the explicit upload file list against every reachable playlist
dependency, hashes exact local bytes, rejects external/traversing paths, cycles,
missing or unreferenced objects and symlink aliases, and includes initialization
maps. Bounds are 32,768 objects, 32 roots, 16 dependency levels, 4 MiB per playlist,
128 MiB per media object and 64 GiB total. Current generated unencrypted MPEG-TS
outputs and fMP4 initialization maps are supported; encrypted keys require a
separately designed custody protocol and fail closed.

The producer result includes `outputInventory`, explicitly labeled local-byte
evidence with `retentionQualified: false` and `providerBytesVerified: false`.
It is not a durable immutable database ledger, a provider readback, a preserved
source-incarnation receipt or proof that a producer has drained. It does not
qualify existing objects, change playback authority or remove readiness holds.
The existing exact upload list remains authoritative for which local paths are
attempted; arbitrary directory contents or remote prefix listings cannot grant
ownership. No producer or upload was run against a provider for this repair.

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

Non-Brand legacy Supabase originals already have a separate non-destructive copy
and cutover implementation (`20261021134033_supabase_original_copy_receipts` and
`20261025111024_supabase_original_copy_cutover`). It binds the exact old Storage
object/version, performs full source/target byte readback, preserves originals,
and requires a fresh exact scan plus provenance enrollment before R2 retirement
eligibility. That source should be qualified and used through separately approved
operations rather than replaced by an unproven direct Supabase deletion adapter.
Rows with secondary references, shared objects, mismatching size or absent scan
receipts remain blocked. No such copy, cutover or enrollment is performed here.

For Hetzner originals the application still lacks a persisted, verified immutable
origin generation and complete writer/reference drain evidence. A caller-supplied
version, current HEAD/ETag, or the HLS local inventory does not fill that gap.
The offline legacy admission tests explicitly keep `s3`, `hetzner_s3` and direct
Supabase variants blocked even when such descriptors are supplied.

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
