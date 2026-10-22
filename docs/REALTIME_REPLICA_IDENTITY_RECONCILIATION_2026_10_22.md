# Realtime replica identity reconciliation, 2026-10-22

## Decision and scope

Preserve production FULL on all eight previously recorded tables. Reconcile source
only for `chat_messages` and `watch_party_room_messages`, where current message
subscriptions demonstrably require non-primary-key fields to route DELETE events.
Do not normalize the other six identities.

This is a finite reconciliation, not a security audit or production change.
The new forward migration contains exactly two FULL declarations. No publications,
RLS/FORCE RLS, policies, grants, credentials or application settings change.
It has not been applied to production as part of this investigation.

Source inspected: commit `191ffb8e610c81204f1d114ba39a80235ec58031`,
tree `d482493bae0a43038b689eb1034e8cc5be8883e2`.
Production inspected read-only: Supabase project `bmkkhihfbmsnnmcqkoly`,
2026-10-22. All eight tables have RLS enabled and replica identity FULL.
Before this patch, the active migration chain creates all eight with DEFAULT.

## Eight-table result

| Table | Primary key; published in supabase_realtime | Historical source intent | Current consumer evidence | Recommendation |
| --- | --- | --- | --- | --- |
| chat_messages | id; yes | Legacy chat migration explicitly sets FULL | `_lib/chat.ts:1204-1214` subscribes to all events filtered by non-key thread_id; callback refreshes | Required by observed DELETE routing; preserve and explicitly reconcile source to FULL |
| watch_party_room_messages | id; yes | Legacy message migration explicitly sets FULL | `app/player/[id].tsx:1608-1623` and `app/watch-party/live-stage/[partyId].tsx:3476-3499` filter all events by non-key party_id; delete handlers remove old.id | Required by observed DELETE routing; preserve and explicitly reconcile source to FULL |
| chat_thread_members | thread_id, user_id; yes | Legacy chat migration explicitly sets FULL | Inbox has no filter; thread subscription filters by key thread_id; callbacks refresh rather than consume old non-key values | Historic intent is known, but current FULL requirement is not demonstrated; preserve unchanged |
| chat_threads | id; yes | Legacy chat migration explicitly sets FULL | Inbox has no filter; thread subscription filters by key id; callbacks refresh | Historic intent is known, but current FULL requirement is not demonstrated; preserve unchanged |
| communication_room_memberships | room_id, user_id; no | Legacy communication migration explicitly sets FULL | Ordinary reads in `_lib/communication.ts`; no matching current Postgres Changes consumer found | Dormant legacy setting; preserve unchanged, do not infer safe normalization |
| watch_party_room_memberships | party_id, user_id; yes | No explicit declaration found in current or archived source | Stage and party subscriptions filter by key party_id and refresh snapshots | Origin and current FULL need remain unproven; preserve unchanged |
| user_content_relationships | user_id, title_id, relationship_type; no | No explicit declaration found in current or archived source | Ordinary reads/writes in `_lib/contentEngagement.ts`; no matching current Postgres Changes consumer found | Origin and current FULL need remain unproven; preserve unchanged |
| user_profiles | user_id; no | No explicit declaration found in current or archived source | Ordinary reads/writes in `_lib/userData.ts`; no matching current Postgres Changes consumer found | Origin and current FULL need remain unproven; preserve unchanged |

No-publication means absent from every publication in the inspected catalog, not
merely missing from a client channel. It is not proof that no other logical
consumer exists: one pgoutput and one wal2json replication slot were active.
The investigation did not inspect customer rows, external consumer contracts,
historical operators' intent or WAL records.

## Source and migration evidence

- [Baseline](../supabase/migrations/202604190004_baseline_current_schema_truth.sql)
  creates all eight tables without a replica-identity override.
- [Legacy chat migration](../supabase/migrations_legacy/202603270009_create_chilly_chat_threads.sql),
  lines 44-46, explicitly declares FULL for chat_messages, chat_thread_members
  and chat_threads.
- [Legacy communication migration](../supabase/migrations_legacy/202603270004_harden_communication_room_truth.sql),
  line 109, explicitly declares FULL for communication_room_memberships.
- [Legacy party-message migration](../supabase/migrations_legacy/202603230002_create_watch_party_room_messages.sql),
  line 13, explicitly declares FULL for watch_party_room_messages.
- [Chat publication migration](../supabase/migrations/202605130003_chat_realtime_publication.sql)
  and [party publication migration](../supabase/migrations/20260627131501_watch_party_realtime_publication.sql)
  include the five published tables above, but do not declare replica identity.
- All 454 production migration history records had statements available. No
  active stored migration changed these replica identities; the only textual
  mention was the unrelated notification publication comment.
- The October 15 reconciliation deliberately preserved these eight differences.
  Five have recoverable historical source intent; three do not. Missing source
  declarations are not evidence of unauthorized changes.

## Why message DELETE routing needs FULL

The production `realtime.apply_rls` implementation constructs old columns from
WAL identity, then accepts a subscription when its filter matches either the
new columns or, for DELETE, the old columns. Only later does it limit delivered
old DELETE records to primary-key columns for RLS-enabled tables. Thus an
application that only reads `payload.old.id` can still need a non-key value in
WAL to route the event to its channel.

At 2026-10-22 02:52:24 UTC, definition MD5s were:

- `realtime.apply_rls`: `d7b17bcce71440ab486770b53d15bd3d`
- `realtime.is_visible_through_filters`: `5dff3ea0345e185330be6127d0dce0df`

A read-only SELECT invoked the STABLE filter helper with synthetic literals,
not `apply_rls`, product rows or a write-generated event:

| Synthetic input and filter | Result |
| --- | --- |
| chat message id only, filtered by thread_id | false |
| chat message id plus thread_id, matching thread_id | true |
| party message id only, filtered by party_id | false |
| party message id plus party_id, matching party_id | true |
| member identity containing thread_id, matching thread_id | true |
| member identity containing party_id, matching party_id | true |
| thread identity containing id, matching id | true |

This proves the observed decoder's filter-input dependency, not end-to-end
delivery. The full old row also provides unchanged TOAST values when this
decoder merges new and old fields for UPDATE. Party-message consumers map
new payloads directly; that is supporting rationale, not a separately exercised
live TOAST regression.

[Supabase's general Postgres Changes guide](https://supabase.com/docs/guides/realtime/postgres-changes)
documents FULL and the RLS/primary-key old-record restriction, but also states
that DELETE events cannot be filtered. The installed project's inspected
decoder has an old-column DELETE-filter branch. Do not treat the observed
project behavior as a universal hosted-version guarantee.

## Patch, validation and limits

Forward migration:
[20261022204956_message_realtime_replica_identity.sql](../supabase/migrations/20261022204956_message_realtime_replica_identity.sql).

The focused Node test replays the repository's migrations in PGlite with the
existing managed-service fixture, applies the runtime repair separately, and
excludes only this new migration until its assertions. It then checks atomic
rollback, idempotence, both target identity flags, and exact preservation of all
other public-table identities, RLS/FORCE RLS flags, owners, ACLs, policies and
publication membership. An all-eight-FULL local overlay proves that the
production-shaped state remains unchanged. This fixture has its existing
explicit managed cron/network doubles and two empty-data recovery skips; it is
not a hosted integration environment.

The focused routing test runs the captured production filter-helper definitions
against synthetic local columns, with a mismatched-room negative control.
The fixture contains no customer data and is not a migration.
The pgTAP test verifies the two identities, their RLS and publication presence,
non-key routing fields, and equivalent synthetic helper behavior against the
managed helper installed by the native Supabase test stack.

Required Validation must pass on the final exact PR head, including the native
database suite. No production event was generated and no live UI DELETE or
UPDATE end-to-end claim is made. No speculative change to the six other
identities is included.

Rollback here means abandoning the unapplied source patch or rolling back its
DDL transaction in an isolated test. Do not revert production to DEFAULT:
production already uses FULL, and doing so could break message DELETE routing.
Any later attempt to reduce the six preserved settings needs a separately
scoped consumer/retention/WAL assessment and appropriate production authority.
