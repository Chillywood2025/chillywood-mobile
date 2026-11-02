# Room-generation live-start delivery

Live Stage, Party Room and ordinary broadcast candidates keep their independent
source, audience, preference and playback eligibility checks. A delivery is
coalesced only when the server positively binds it to the same room ID, actual
`room_generation`, host and recipient. Creator names, titles and transport IDs
are not lifecycle identity. Event reminders and event-managed transport remain
separate.

The binding does not publish anything. A new ordinary broadcast receives its
room-generation snapshot before its insert triggers run; supplied binding fields
are overwritten and subsequent changes are rejected. Provider updates cannot
attach the same old broadcast to a restarted room. A bare event ID is not an
exemption: the separate prepared-event path requires its exact preparation
identity. Existing broadcast rows remain unbound; current flags are not evidence
of their original lifecycle. They require genuinely new canonical session
evidence rather than a migration backfill. Historical notices/audit rows are not
rewritten, and already delivered OS notifications cannot be recalled.

Delivery ownership is decided under the source-room shared lock followed by the
recipient/lifecycle mutex, before the normal event-row lock:

- An actual in-app materialization consumes the announcement, even if unread.
- An ineligible candidate, disabled channels or no available push token consumes
  nothing. A later eligible source can still deliver.
- Push-only reservation records a possible send. Other candidates wait while it
  is unsettled; accepted or unknown outcomes remain fenced.
- Only retained, explicit no-send failures can release push-only ownership.
  Missing rows or lost acknowledgments do not prove no-send.
- Each reservation still checks current source access and token ownership. A
  previously delivered notice whose source becomes unavailable is hidden by the
  existing current-authority reader; it is not a permanent join grant.

No historical delivery scan, notification backfill, provider activation, payment
change or deployment is part of this migration. The ordinary dual-source case
was reproduced with qualified synthetic stored provider reports and the actual
production notification handler. Current ordinary broadcast start is an
operator/private-proof path; this is not evidence of a deployed duplicate
incident or of public provider commissioning.

Tests: `live-start-cross-source-dedup.test.mjs` exercises the chronological full
schema, actual producers/handler, preference RPCs, source ordering, no-channel
and no-token work, known-failure/unknown outcomes, interleaved reservations,
pause and real restart identity. The retained-predecessor negative control runs
inside a rollback. `scripts/test-room-live-start-dedup-concurrency.mjs` requires
native local PostgreSQL and observes actual independent-backend lock edges in
an owned disposable clone; a PGlite pass is not native concurrency proof.
