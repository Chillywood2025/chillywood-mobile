# Studio compatibility during a rolling client update

This document describes request compatibility for Brand Studio and Audience. It
does not establish that a migration was deployed, an OTA was installed, or every
tester upgraded. The two rolling migrations follow the held
`20261015073423_platform_studio_publication_and_audience_authority.sql` migration;
they do not require disabling unrelated app features.

## Client/source matrix

| Known binary or source | Request protocol | Remaining client limitation |
| --- | --- | --- |
| iOS build 13, runtime V2: binary `13c4eb8a20680c0d97cfe53d0c55b1533334c269`; recorded OTA `7b7b0271fd68f66969458cce81a26371cc286e29` | Direct draft upsert; multiple publish requests; direct Audience writes; Profile-first public Platform reader | Legacy Publish requires an update. Old errors can display success. Private Profile/public Platform identity requires the new reader. |
| Android 105 and iOS 39, runtime V13: `7f0c062b63bae3a4b2a59d2c6cbab9ee1d5a8161` | Same legacy operations; media RPC transport also binds the initiating account | Same action-specific limitations. Its Brand, Audience and user-data library blobs match the retained `423b10f1` historical baseline. |
| Intermediate source `c4969266c5587db5af4a7e3f0b2099de185080a4` | Atomic Publish and Audience RPCs; new public identity reader; acknowledged profile saves | Draft upsert has no pre-cutover capability probe. This source is not evidence of an installed build. |
| Android 106/V14 `d2ec4dc2a25d67e8f98b578496f5985359b9bebc`; Android 107 and iOS 40/V15 `f600bba0cc99e7d0114c99730cd12c8a2177422f` | Atomic RPCs and draft capability probe | Upload/removal UI can overwrite a failed draft-save notice with success. |
| OTA source `33b8423bc3db2120bad3a7aef8ad52236d7bff0d` | Same modern requests | Upload feedback fixed; failed removal-selection save can still display success. |
| Android 109 and iOS 41/V15 `54b36c322796836f8e2d0b6b817a79f978a318d1`; sources `fca72719a0375478c9db641dea35507ae1fb31c4` and `59b1c6c9a52795d323323900a47a9323a69560ed` | Same modern requests | Upload and removal feedback fixed. File upload, asset mutation, branding save and identity save remain separate operations. |

The iOS 13 mapping is recorded in `config/release/ios-internal-v2.json`. The
other binary mappings were checked against official EAS build metadata on
2026-10-19. Build source is not proof of the OTA a particular installation is
currently running. Provider payloads and device identifiers are not retained in
this document. Android and iOS delivery evidence must remain separate.

## Actual legacy requests

The portable fixtures retain byte-exact declarations from
`423b10f12ae2a3b6c42c1587210fadaea5418b18`, with source-blob, whole-source and
per-declaration hashes. Tests execute those functions; they do not recreate a
more convenient hypothetical old client. The earlier iOS 13 Brand protocol is
the same except its media RPC transport predates the account-bound wrapper.

**Save Draft** upserts `platform_brand_profiles`, keyed by `owner_user_id`, and
requests the returned row. Its payload contains the seven selected asset IDs,
spotlight video, theme/accent, fit/focal/crop/overlay/blur values, a fresh
`updated_at`, and its cached `published_at`. It then reloads Studio and saves
ordinary `user_profiles` fields such as name and tagline. That second request
has no Draft/Publish marker and is also used by personal Profile settings.

**Publish** first sends precisely the same branding upsert. With selected
media it reads those assets, calls `publish_platform_brand_profile_assets`
with `{p_asset_ids,p_reason}`, directly updates eligible assets to
`asset_state: "published"`, and reads them back. Finally it sends another full
profile upsert containing a new client-generated `published_at`. The legacy
missing-RPC fallback attempts `review_platform_brand_asset` per selected asset;
other RPC errors abort that path. None of these requests form one transaction.

**Upload** posts binary content to the `platform-brand-assets` bucket, with
`x-upsert: false`, and has an SDK upload fallback. It verifies readability,
inserts a draft/pending-review `platform_brand_assets` row containing owner,
asset type, storage location, MIME type, size and filename, then saves the
selected asset ID in the profile draft. A later selection-save failure does not
undo the file or asset row. Row-insertion failure attempts storage cleanup.

**Remove** updates the asset to `{asset_state: "archived", deleted_at: now}` by
asset ID and owner, then clears its selected ID in a separate draft save. It
does not delete the storage object. A later draft-save rejection cannot undo
the earlier archive. Public readers omit deleted/unsafe media, so removing a
currently public asset can hide it before a later Publish.
The rolling server permits a current owner to read their own archived row's
metadata so the minimal archive UPDATE can pass PostgreSQL's row checks.
Studio still excludes deleted rows, storage access remains denied, and clients
cannot unarchive that row or clear its deletion timestamp.

**Audience approve** reads the exact request and actor. For a follow request
without a follower row, it first inserts
`{channel_user_id,follower_user_id,updated_at}` into `channel_followers`. It then
updates `channel_audience_requests` by exact request ID with
`{status: "approved", reviewed_at, reviewed_by, updated_at}`, requesting one
returned row. **Decline** sends the same final update with `"declined"` and no
follower insert. The old helper does not approve subscriber-access requests.

**Public Platform** reads `user_profiles` first, falling back to
`read_public_channel_profile({profile_user_id})`, then applies Platform access
checks. Branding uses `read_public_platform_brand_profile({profile_user_id})`
and selects its published, clean, nondeleted assets. Older code turns failed
branding reads into empty results; it never calls `read_public_platform_identity`.

Historical source anchors: `_lib/platformBranding.ts:770–883,886–959,993–1014`,
`_lib/channelAudience.ts:1128–1305`, `app/channel-settings.tsx:3458–3672`, and
`_lib/userData.ts:1356–1371` at `7f0c062b`. The iOS 13 public route is
`app/channel/[userId].tsx:230–311` at `13c4eb8a`.

## Supported rolling behavior

The Brand compatibility migration records known publication timestamps in
`platform_brand_publication_metadata(owner_user_id,published_at)`. Current
publications seed the history, and later snapshots extend it. A direct draft
upsert may carry NULL or a known timestamp, including a stale known timestamp;
the server normalizes that metadata to the actual stored publication time. It
never rolls publication metadata backward and never publishes the draft.

An unknown non-null timestamp raises SQLSTATE `42501` with
`brand_publish_rpc_required`. It may be a legacy Publish or a cache predating
the retained publication history: the server cannot infer the user's intent
from a timestamp. Legacy Publish requires a client update. An old cached draft
with unknown metadata requires reloading Studio before retrying Save Draft.
Copy any unsaved edits before reloading an old Studio screen; the old screen
cannot display the server's reload guidance reliably.
There is no automatic legacy Publish translation. Its asset-publish RPC is
also rejected before effects, preventing an earlier partial media publication.

Anonymous/public asset and storage access requires a safe asset referenced by
an actually visible committed publication. Merely changing an asset to
`published`, or approving/scanning it later, cannot publish an uncommitted
draft. Unsafe references in the initial preserved snapshot are removed, so
later asset approval cannot accidentally reveal them. Owner/reviewer access is
not evidence of public access.

The Audience compatibility migration treats the old owner-side follower INSERT
as a validated preflight with no follower mutation. The old final exact-ID
request UPDATE performs the authorized review and follow creation atomically,
and returns the reviewed row the old `.single()` caller expects. Canceling or
replacing a request cannot redirect that review to another pending request.
Modern `review_channel_audience_request({p_request_id,p_status})` follows the
same authority and transaction rules. Actual row-lock races require the native
PostgreSQL suite, not a serialized in-process transport fixture.

A preliminary follower INSERT that committed before cutover may already have
left a follower alongside a pending request. It cannot safely be distinguished
from legitimate self-follow, so the migration does not delete that relationship.
An in-flight old final exact-ID PATCH can still finish the review; after cutover,
new old-client preliminary INSERTs are no-ops. Existing partial writes are not
retrospectively made atomic.

The modern Brand client checks session authority and
`read_public_platform_identity` before saving a draft. Publication calls
`publish_platform_brand_profile({p_profile})` without client timestamps. Its
name/tagline save still happens separately after publication; a successful
branding transaction alone does not prove those details were saved.

## Limitations that server compatibility does not repair

- Legacy Save Draft and the first legacy Publish request are indistinguishable.
  Accepting a draft cannot prove the user pressed Save rather than Publish.
- The old Publish catch handler may say “settings published” for an empty media
  selection or “public Platform is updated” because older public media still
  exists. The regression suite explicitly asserts this incorrect historical
  message while asserting that no new public publication occurred. A backend
  rejection protects state; it does not fix that UI.
- Old profile saving writes locally first and suppresses remote failure. Old
  upload/removal handlers can overwrite a failed selection-save notice with
  success. Custom server error text cannot repair those handlers.
- The legacy Profile-first Platform reader cannot display a private personal
  Profile as a public Platform identity through its existing path. That action
  needs an updated client. Personal Profile media/privacy must not be broadened
  to accommodate the old reader.
- Blocking only the modern Publish RPC does not cover legacy table writes or
  media operations. Blocking a later draft save does not cancel an upload or
  archive that already completed.
- Platform headers identify a provider rail, not a trusted source/runtime or
  user action. These historical requests do not carry a durable action ID.
- A lost successful Audience response can still appear as an error; retrying
  reads the completed request and returns the old helper's “not pending” result.
  Compatibility does not authorize replay against a different request.

## Verification boundaries

`tests/platform-studio-rolling-compatibility.test.mjs` covers historical
request orchestration against the held plus rolling SQL migrations, draft and
public projections, actual old Audience helpers, response loss, and preserved
old UI limitations. File upload and signed URL IO are controlled; this suite is
not proof of native uploads, Supabase HTTP/PostgREST behavior, the full deployed
migration chain, or physical installed behavior. The existing legacy-cutover
suite retains its original held-migration negative controls. SQL/pgTAP and
native PostgreSQL concurrency suites provide separate database evidence.

The native runner also invokes `scripts/studio-rolling-http-fixture.mjs` against
its disposable database clone. One pinned PostgREST container listens only on
loopback inside the selected local database container's network namespace; it
publishes no host port. Real signed test JWTs identify the runner's seeded SQL
sessions. This checks the old minimal follower INSERT's empty HTTP 201, the
final singular review PATCH, rejected legacy Publish, successful cached draft
upserts, modern Publish/public read, and minimal archive responses with deleted
media access denied. It does not test an Auth login server, object transfer,
malware scanning, production keys, or an installed app. The helper removes its
PostgREST container; the runner drops its database clone.

Production application and release actions require their canonical tooling and
explicit action-specific authorization. Passing these source tests does not
establish production deployment or tester uptake.
