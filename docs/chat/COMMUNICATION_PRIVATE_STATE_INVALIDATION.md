# Communication room snapshot invalidation

The legacy hook previously subscribed to Postgres Changes for communication room
and membership tables that are absent from `supabase_realtime`. This produced
Realtime system errors while private signaling and media could still work.

`20260929004448_communication_private_state_invalidation.sql` installs internal
row triggers that send `state:update` with exactly `{}` on the existing private
`comm-room-${roomId}` topic after room or membership INSERT, UPDATE, or DELETE.
Both call transports reread their authoritative snapshot when receiving a hint.
Subscription/reconnection refresh and heartbeat recovery remain necessary
because Broadcast is an invalidation signal, not a durable event log.

The sent application payload is `{}`. The pinned Realtime server v2.112.6 adds
its own generated message UUID as `payload.id` when the caller did not supply an
ID, and repeats it as `meta.id` in the replication envelope. This behavior is
defined in the provider's [send function](https://github.com/supabase/realtime/blob/v2.112.6/lib/realtime/tenants/repo/migrations/20260605120000_rename_broadcast_send_warning.ex)
and [replication connection](https://github.com/supabase/realtime/blob/v2.112.6/lib/realtime/tenants/replication_connection.ex).
The delivery check permits only this optional UUIDv4 field, checks it against
`meta.id` when supplied, and requires the remaining application payload to be
exactly empty. It never strips or permits room, user, generation, operation, or
row fields. Hooks ignore the hint payload and read current RLS truth.

The migration does not publish either table, change RLS, expand client Broadcast
permissions, or place room/member keys or row values in the payload. Existing
private-topic authorization remains in force. Payload minimization also matters
because a channel's authorization is checked on subscription, while a later
termination may close its database read authority. The empty terminal hint still
causes the receiver to perform that newly restricted read and retire its session.

The triggers execute in the original write transaction. A rolled-back change
rolls back its hint as well. All writes, including heartbeat updates, may create
hints; the hooks retain their generation and snapshot-order checks, and LiveKit
shares its existing paced snapshot reader.

## Validation

- `supabase/tests/communication_private_state_invalidation_test.sql` checks
  trigger timing, grants, fixed search path, publication exclusion, unchanged
  RLS/Realtime policies, ordinary writes, rollback, and terminal read closure.
- `scripts/test-communication-room-realtime-delivery.mjs` uses only a local
  Supabase instance. It checks real private delivery with exact empty application payloads
  for membership INSERT/UPDATE/DELETE and terminal room UPDATE, followed by
  authenticated receiver reads. It retains the separate media relay check.
- Mounted hook regressions cover authoritative state refresh, stale generations,
  membership removal, and terminal cleanup. The authenticated paired browser
  check continues to require zero Realtime system errors.

The SQL and real delivery checks require the Database CI environment; source and
mocked hook checks alone do not establish database delivery or installed-device
behavior.

## Deployment boundary

This is a source-only forward migration. Apply the reviewed migration before
shipping clients that consume `state:update`, using the normal separately
authorized deployment process. Older clients ignore the extra private event.
Do not add either table to the shared publication as a rollout workaround.

The September 29 read-only production history review found 408 deployed migration
versions, ending at `20260919223835` (`ios_callkit_presentation_ack_fallback`).
Seventeen same-name migrations exist locally under different timestamps; every
one has a canonical SQL candidate. Existing receipts explicitly map two
local-to-remote versions and record a third operational prerequisite version.
Exact deployed statement/hash parity remains unverified, including for the
aliases described only by narrative receipts.
Reconcile that existing history before production deployment planning. This is
not a finding of 17 missing SQL bodies, and this change does not rewrite or rename
historical migrations. The pending terminal self-leave migration is also absent
from the reviewed remote history.

A rollback must itself be a reviewed forward migration that removes these two
triggers and their internal function. It must preserve existing authorization
and publication membership. Removing hints reduces promptness of snapshot
refresh, so assess client subscription and heartbeat recovery before doing so.
