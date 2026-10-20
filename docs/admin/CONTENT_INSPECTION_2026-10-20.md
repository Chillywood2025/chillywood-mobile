# Staff content inspection and deletion-only retention

Status: source retention repairs remain disabled; no activation is authorized
by this document. Readiness must be read from actual code/database inventory.

## Product scope

The owner requested inspection of currently stored restricted content and
delegation to other administrators. The final retention instruction is **30
days for deleted content only**. Ordinary edits must not create snapshots or
revision history. Current content is read live. Previously destroyed bytes
cannot be recovered by adding permissions.

The owner explicitly requested that exact Owner views be excluded from the
app's inspection access log. This exception does not suppress other staff's
view events, permission/context mutations, authentication/security records or
necessary short-lived media delivery state. It is not a promise of untraceable
activity across backend systems.

## Source and route boundaries

The relevant existing feature inventory is `moderation-reporting`; the
extension stays inside the privileged `/admin` surface. Entry points are the
staff inspection button, Users drilldown, supported Reports targets and Legal
user targets. Normal Profile, Player, chat, room, purchase and visibility
readers retain their existing authority rules.

New components are `ContentInspectionPanel` and
`ContentInspectionMediaViewer`. The typed client uses exact-session frozen
credentials for narrowly scoped RPCs. Native media uses already installed
Expo libraries; no new native SDK, provider, account, credential or public
release is part of this source change.

Covered states include signed out/restoring, active/replaced/revoked session,
expired/revoked role or grant, closed context, target/subject changes, missing
source, unknown transport outcome, unavailable backend, expired receipt,
unsupported media and delayed stale responses. Content and native players
must retire on close, background and authority/selection changes.

## Access model

- Exact active Owner/Super Admin may inspect supported targets through an
  explicit internal-review context and reason. Super Admin is not silently
  promoted to true Owner for delegation or Owner-private context access.
- Only true Owner issues/revokes bounded grants to existing Admin/operator
  identities. Initial grants are exact context/target, read-only, expire within
  24 hours and cannot be re-delegated. Duplicate grants must not leave parallel
  access after a visible grant is revoked.
- Other staff's access is audited before delivery. An audit failure denies
  delivery. Exact Owner view/list access is exempt from that app event only.
- Owner-authored/private review material remains protected from other staff
  unless the implemented policy explicitly allows the exact operation.
- View does not grant publication, edit, restore, purchase, payout, bulk export
  or anonymous download authority. Bytes already delivered cannot be recalled.
- New backend settings default disabled. Merging source does not enable access
  or create real grants. Activation/deployment requires separate confirmation.

## Supported source adapters and limitations

Current text adapters use exact IDs for profile posts, profile-post comments,
creator-video comments, chat messages and room messages. Video/attachment
metadata and originals use separate verified media contracts. User browsing
is a bounded, composite-cursor metadata query; it does not load every body's
content automatically.

Media delivery authenticates each bounded request, validates exact source,
scan/provenance, MIME/signature, size and origin version, and reauthorizes
before response bytes. Private origin coordinates and presigned origin URLs
stay server-side. No normal-media endpoint is weakened to add staff access.
Unsupported/unverified/quarantined formats must not be presented as playable.
Web media playback is explicitly unsupported in the initial native viewer.
Android/iOS playback still needs signed-build physical verification.

Original availability is not established by a filename, metadata row or an
`original` rendition label alone. Unknown legacy provenance and unsupported
formats remain limitations rather than silent substitutions.

## Deleted-content-only design

Text capture occurs only at actual row deletion or a verified first genuine
deletion transition. A reversible moderation hide/remove, draft edit, inspection,
cover replacement or failed unattached upload is not a history-capture event.
The server's deletion time starts a fixed 30-day period. Reads, retries, grants
and hold release do not extend it.

Compatible video/attachment clients now request an explicit content deletion
bound to the owner, current session, original key and source creation time.
Staging, delivery revocation, metadata deletion and capture commit together.
Direct metadata deletion uses the same capture trigger. While inactive,
compatible clients retain the prior deletion flow. Once the legacy-delete gate
closes, old object-only calls fail closed, including calls omitting a record ID.
Existing staged/retired originals never fall through to immediate provider
deletion while stopped. A metadata record does not prove bytes survived.

Direct legacy Supabase Storage deletion bypasses the gateway and remains a
hard readiness blocker. Preferring R2 does not authorize moving or deleting
legacy objects. Current secondary/brand media and unproven original bindings
also remain outside the bounded contract. See
[`deleted-content-retention.md`](../deleted-content-retention.md) for the exact
activation contract, disabled flags, legacy-request drain and production sequence.

An abandoned attached object stage requires fresh content-delete intent.
Detached/replaced original cleanup has a separate irreversible claim under the
legal-hold/reference lock; it never captures edit history or deletes the parent.
Deleted-parent attachment metadata can be removed at expiry only for the exact
original incarnation while the parent remains deleted/absent; restores and
shared references block it. These soft-deleted attachments still do not gain
the hard-deletion-only inspection proof automatically.

Expiry must respect verified legal holds and live/shared object references.
Hold placement and irreversible purge claims need a shared serialization
protocol. A hold arriving after irreversible deletion has begun cannot be
reported as successful preservation. Provider-specific exact-object deletion
guarantees must be established; generic S3 compatibility is insufficient.

Current account purge/deidentification and restore-window rules remain intact.
No extra copies of scrubbed identity, tokens or notification payloads are added.

## Validation and rollout

Use actual new SQL execution locally, canonical pgTAP after the complete
migration stack, deterministic PostgreSQL read/revoke/hold/purge interleavings,
Edge origin/authority failure tests, and production client/component lifecycle
tests. PGlite smoke fixtures are not a substitute for canonical session/RLS
or multi-connection proof. Existing normal-user RLS and media tests must remain
green. Run exact-diff review and exact-head Required Validation before merge.

No current test result establishes deployed access, active retention or physical
playback. Retention activation remains blocked until complete cleanup, hold,
provider and old-client compatibility requirements are validated. Required
native golden cases include role denial, exact target/content display, session
and grant revocation, image/video/audio cleanup, keyboard/safe-area appearance,
deleted-versus-current labeling and the 30-day expiry boundary.

Rollback disables feature entry points while preserving permanent retired-key
fences and the closed legacy-delete gate. After activation, stopping retention
may pause media deletion; it does not restore the old immediate provider-delete
flow. Historical deployed migrations are never edited. Any retained data must
follow its confirmed expiry/hold rules rather than being silently discarded
during a source rollback.
