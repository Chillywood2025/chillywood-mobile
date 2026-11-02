# Live discovery host authority and coordinated cutover

## Supported room controls

- **Listing On / Off** is revision-bound `discovery_paused=false / true`.
  Off hides discovery, public counts and discovery-start invitations without
  changing the selected audience. In particular, pausing a Circle room does
  not admit an outsider with its code. Historical `private` rows remain unlisted;
  there is no backfill or automatic publication. Legacy requests for `private`
  on an existing Public/Circle room normalize to pause plus retained audience.
  Omitted pause arguments preserve the stored pause, never silently resume it.
- **Public** permits the current canonical publication to appear on applicable
  discovery surfaces. Saving metadata is not proof that the host is live.
- **Chilly Circle** uses actual current Circle membership for discovery **and
  admission**. A follow, stale attendance or possession of the code is not Circle
  membership. Removal immediately revokes roster/message/read authority too.
  An ordinary follow or paid/reserved seat does not replace Circle membership.
- **Open / Locked** remains the separate supported room-entry policy. Discovery
  does not bypass it or any content entitlement. No new invitation tier or
  cohost role is invented: current schema has host/viewer and stage
  speaker/listener; only the exact current host may change privacy controls.
- Event-managed prepared broadcast rooms stay private/locked and their settings
  are not editable here. Their internal transport privacy is not cancellation
  of an independently authorized canonical event/ticketed surface. Preserve the
  event admission/notification authority separately from ordinary room discovery.

## Authority and lifecycle

`set_watch_party_room_host_settings` requires the current active exact session,
room generation, expected settings revision and source identity under a room
row lock. Mutations use compare-and-set; stale responses or old host sessions
cannot reopen newer Off/Circle decisions. A no-op retry preserves its revision.
Preparation sets `p_publish=false`; only explicit in-room confirmation/Start
requests publication. Party publication retains actual host/source authority.
Paused requests never publish, even if `p_publish=true`. Party admission uses
separate proof from an actual, non-trigger host join, bound to the exact host
session, room generation and canonical source. A hidden Circle Party can admit
its authorized members without publishing a card; stale source/session/host
proof, blocked viewers and missing paid/Premium authority still fail closed.
Live publication additionally requires the production handler to observe the
connected provider participant's signed current session and room-generation
metadata, followed by a second SQL generation/revision check.

End/restart, host or source changes rotate generation. Public flags or old
publication records are not migrated into new publication authority. Reads check
current host/session and a fresh 45-second host membership, not just stored
`is_active`. Known-code lookup is a narrow RPC, not a general private-room browse
grant. Public title counts come only from currently authorized canonical Party
publications. Sensitive child rows do not inherit discovery-preview access.

The canonical leave/rejoin path also starts a fresh database-timed attendance
interval for the exact current actor. The historical unconditional `joined_at`
guard conflicted with that existing RPC; the narrow correction allows only its
left-to-active transition. Party/user identity, active-row timestamps, terminal
removal and all current admission gates remain unchanged. Client table writes
stay revoked: setting the legacy server-transition GUC cannot grant a direct
write. Same-code restart does not reuse an obsolete attendance timestamp.

The owner remains invisible by default. A new unchecked, explicit room-only
confirmation can authorize this generation/session/audience and a chosen room
title/display name. No profile/admin identity is read for the room label. Off,
settings version changes, end/restart or session retirement invalidate consent.
No historic owner room is opted in. Owner Circle requires real eligible members;
an empty Circle is not fabricated. Public profile/search/admin privacy remains
independent, including separately repaired final profile RPC guards.
Pausing does not require a title or new owner consent; resuming does require the
owner's explicit current-room confirmation again.

Listing withdrawal and new-token denial are not proof that an already-connected
provider participant was removed. The source heartbeat monitor rechecks current
server admission and calls `removeParticipant`, including listeners; its source
timer is 60 seconds. Deployed monitor version/cadence and actual disconnect
receipts remain separate commissioning evidence. The legacy communication-room
path needs its own provider proof; neither a feed hint nor token expiry is
claimed to disconnect an existing connection instantly.

## Release dependency — no independent production application

This source change is **not deployed**. The user requires one coordinated OTA
after the complete original work list plus discovery is ready; all OTA remains
held and money remains off. Read-only production inspection on November 1, 2026
confirmed Live and Watch-Party Live feature flags already on; those flags are
not publication evidence and this patch does not change them.

Do **not** apply the restrictive room-table RLS or revoke old publication RPCs
independently while old installed clients still rely on those interfaces.
Coordinate migration, versioned Edge handler, exact-code/settings/publication
client callers, counts, and notification authority at the final authorized
delivery. Old clients cannot truthfully be claimed to use the new RPC. Plan an
explicit compatible client rollout/enforcement and rollback boundary before any
production mutation; do not temporarily reopen private raw-table enumeration.
Already connected legacy provider participants lack the new signed generation
and must reconnect with a fresh token before publication can succeed.

## Connected-view primary delivery

The primary path is an opaque transactional private Realtime Broadcast inserted
in the same transaction as the authoritative source change. Exact insertion is
verified because managed `realtime.send` can swallow errors. An unconfirmed send
leaves durable retry work; it never fabricates completion or rolls back a host's
privacy change. Source rollback rolls back its hint too. Existing worker enable,
collection and credential authority still applies; no provider or credential is
changed. Read-only inspection on November 1 found the existing discovery worker
enabled/configured and scheduled every **10 seconds**, with a five-second retry
topic gate. Those delays are fallback/deadline processing, not healthy primary
delivery. Scheduler success alone is not socket-delivery evidence.

Public and formerly Public withdrawals use existing public-interest topics.
Circle changes use one private exact-current-viewer topic, with current eligible
and formerly authorized recipients only; private-only edits have no broad hint.
Materialized private attendance notices get a bounded-lifetime receipt so their
exact recipients can reconcile a final withdrawal. Retained audit notices do
not subscribe former members to later private edits or same-code restarts.
Receipt and Circle snapshots serialize with native advisory locks; canonical
RLS, session, entitlement and source predicates remain the read authority.

Independent server-assigned immutable random keys accompany hints and canonical
authorized feed/event rows, title-count scopes and current notice contexts.
They contain no room, source, title, actor or recipient identity. A client masks
only affected rows whose key changed while its read was in flight, then queues
one trailing reconciliation. Unrelated continuous source activity cannot veto
every read. Relationship removal and rejoin use local per-key read generations,
not a permanent server revision floor. Legacy/unknown/overflow hints remain
conservative invalidations. Public-to-Circle transitions use independent lane
keys; source changes include both old and new public-title count scopes.

Hosted real-SDK proof must establish the three-second primary receipt bound,
current RLS reads, denied foreign/anonymous topics and client sends, rollback,
reconnect, delayed source transactions and the primary-disabled retry negative
control. This is not a literal zero-network-delay promise, a production-device
receipt, or a large-Circle capacity claim. Fanout is exact and synchronous; load
qualification and production transport commissioning remain required. New
notification materialization/push still has its separate existing ten-second
worker cadence; immediate privacy reconciliation does not prove instant push.

## Validation evidence boundary

Tests replay the chronological schema with strict actual roles/grants, legal
and finite-Premium fixtures, actual join/set/publication functions, and
production-handler control flow. Rollback-only negative controls remove the
specific RLS/CAS predicate to demonstrate that forbidden behavior is detectable.
Hosted Required Validation runs genuine pgTAP and the disposable local-Postgres
native runners: independent backend schedules require `pg_blocking_pids`
and actual advisory-wait evidence, plus rollback-only stale-CAS/missing-mutex
mutation proof. Local PGlite/preflight
passes do not substitute for those native results, provider delivery, or physical
installed-device evidence. No production DB/provider/OTA action is part of this
source patch.
