# Remaining retention lifecycle: scoped implementation design

Status: the November 1 durable producer and dormant per-object expiry path are
implemented in migrations `20261101141441` and `20261101142934`; see the
commissioning section below. They are not production qualification. The separate Brand adapter described historically below is now
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


## November 1 commissioning and rollback

### Implemented path (not permission to delete)

Both HLS producers now reserve immutable source-incarnation/object ownership
before provider writes. Keys include the entire producer UUID. Dispatch is
one-shot create-only PUT; complete byte readback binds hash, size, ETag and the
write-token metadata. Hetzner additionally requires a non-null immutable version.
Unknown PUT outcomes recover by GET only; an absent read never allows another
PUT. Verified objects are skipped on inventory retry. A source change prevents
publication; late receipts settle outstanding writers without reviving the source.
Clip render output may attach a second source binding in the same transaction
as creating its draft. Every binding must expire before object removal.

Actual removal starts the fixed 720-hour window once. Publication withdrawal,
ordinary metadata editing and generation replacement do not impersonate deletion.
Owner protection, legal/account/parent holds, all surviving source bindings,
public references and incomplete dispatches block expiry. Permanent claims fence
later reference/hold/owner admission. The dormant consumer checks every byte and
rechecks SQL authority immediately before deletion. No scheduler is installed.

R2 qualification means permanent key retirement and complete writer fencing;
GET followed by DELETE is **not** an atomic conditional deletion primitive.
Hetzner uses the exact version for GET/HEAD/DELETE. Claim authority pins the
contract hash, writer-fence hash and deletion mode. Replacing qualification proof
invalidates prior authority. Observation of absence never means permanently absent.

### Exact commissioning sequence

1. Freeze the merged commit; require full Required Validation, including the
   native PostgreSQL runner's sixteen independent-session blocking schedules.
   Local PGlite replay and HTTP doubles are supplemental, not that race proof.
2. Deploy both forward migrations with settings disabled. Compare remote version,
   statement hash and source head. Confirm private RLS/FORCE RLS, service-only RPC
   grants and body role checks; confirm payments, payouts and cleanup stay OFF.
3. Commission only an explicitly approved private output origin. Supply approved
   `MEDIA_OUTPUT_R2_*` credentials through the existing secret mechanism; never
   borrow scanner credentials. Inventory **every** writer (CLI, rendering worker,
   application uploader, admin/provider tools), credential scope and retirement
   check. Retire/drain obsolete writers before certifying their fence hash.
4. Run an approved synthetic create-only upload: record intent, complete readback,
   seal, publish draft and read via intended authorized delivery. Exercise lost
   PUT response with GET-only recovery; changed source must deny publication.
   Verify no raw provider URL or secret appears in logs. Use a fresh UUID for each
   generation. Keep outputs private and within configured scanner limits.
5. For Hetzner, establish versioning and exact version evidence at original write;
   an ETag or current-object scan cannot retrofit immutable historical identity.
   For cached public HLS, first prove private preservation plus publication/cache
   withdrawal. Until then those buckets remain individually unqualified.
6. Dry-run candidate SQL/readiness and hold/reference checks without enabling
   expiry or invoking the consumer. Record object/source IDs, all bindings,
   server deletion time, exact deadline, unsettled dispatches, blocker reasons,
   provider/version/hash/size and proposed qualification hashes. Do not shorten
   production retention to manufacture a test candidate.
7. Only after separately authorized qualification and one-object destruction may
   the operator enable the dormant setting and invoke `expireSecondaryMediaObject`
   for that exact approved object. A deployment or broad completion approval is
   not per-object destruction permission. Test provider DELETE semantics with
   separately approved disposable bytes first. No automatic schedule is included.

### Monitoring and stop/rollback proof

Monitor unresolved dispatched writes, invalidated producers awaiting receipt,
source/owner/hold blocks, unqualified buckets, expired qualification, rejected
reference reuse and failed/identity-changed expiry receipts. Alert on growth or
any unauthorized producer/publication attempt; unknown writes stay blocked rather
than timing out into presumed safety. Logs must identify producer/object IDs but
never signed URLs or credentials.

Before a rollout, prove the stop switch returns disabled authority and zero
provider requests using the runtime tests. Roll back application producers to a
compatible fail-closed release only: never restore overwrite uploads. Disable the
expiry setting and qualification authority for new actions; preserve immutable
claims, receipts, bindings and deadlines. A request already sent cannot be
unsent, so drain worker execution before declaring stop complete. Never drop the
ledger or reset the monotonic reference fence. Corrections are forward migrations.

### Still requiring external evidence

Historical secondary objects without exact immutable inventory, undrained legacy
writers, unversioned Hetzner originals, public-cache/private-preservation gaps and
unqualified delivery origins remain real blockers. Existing global readiness
counts are unchanged. The new executable per-object path does not erase those
records or imply provider commissioning, native CI or production deletion ran.
