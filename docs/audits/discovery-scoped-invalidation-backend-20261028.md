# Scoped discovery invalidation backend

This is source implementation, not activation or hosted delivery evidence.

## Contract

- Private topics: `discovery:v1:surface:home`, `discovery:v1:surface:profile`,
  `discovery:v1:surface:channel`, and `discovery:v1:creator:<canonical UUID>`.
- Event: `discovery:invalidate`; payload contains only an opaque random delivery
  `id`, not a source/entity ID. No content, source IDs, viewer
  counts, prices, access decisions or playback URLs are sent in the payload.
- Topic authorization is receive-only for an existing, non-anonymous,
  unrestricted authenticated account. Joining is not ongoing authorization:
  canonical reads and session fencing remain mandatory.
- The source transaction appends the union of old/new public scopes. It does not
  acquire a shared scope lock or fan out per follower. Private/Circle-only
  changes emit no public hints. Existing room channels/settings are unchanged.
- Public creator-event changes independently invalidate Home and creator scopes,
  including delayed scheduled events whose discovery projection is absent.
- Future start/end deadlines are recorded with a source revision. Obsolete
  revisions are superseded; valid deadlines request a reread, never promote a
  host to live. Other time-derived permissions still require fallback reads.

## Dispatch and recovery

Collection and dispatch both default **off**. Collection can be paused separately
while draining existing work. Activation, worker credential provisioning,
scheduling, alarms, capacity qualification and retention require separate review.

`flush_discovery_invalidations` owns at most 100 due records with `SKIP LOCKED` in
one database transaction. Transaction locks are the claim lease: a crash rolls
back claims/sends/completion. Within that batch, topics coalesce. Dispatchers use
nonblocking per-scope advisory locks and a five-second per-scope attempt gate;
deferred records remain pending. This is not a network-delivery spacing promise.
Only workers touch the scope gate, never source publishers.

The installed `realtime.send` function swallows insert errors, so absence of an
exception is NOT success. A supplied opaque payload `id` is preserved by this
provider version (its table row ID is generated independently). After sending,
the dispatcher requires an exact matching durable private Broadcast insertion
inside the same transaction. An indexed before/after-call UTC time window and a
materialized 1,001-candidate cap precede payload matching; more than 1,000
candidates or no exact match fails closed for retry. No managed index/function
is changed. This establishes insertion, **not delivery to any device**.
Preactivation must reverify the installed helper's supplied-payload-id behavior,
`inserted_at` default `timezone('utc', clock_timestamp())`, timestamp-without-time-
zone type, existing partial index, and dispatcher-owner SELECT privilege. Provider
drift must remain fail-closed, not silently accepted as delivery.

Each topic's verified Broadcast insert and exact claimed-record completion happen
in one subtransaction. Failure rolls both back and records only SQLSTATE, with bounded
backoff and dead-letter after eight failed attempts. A response timeout is
unknown, not permission to blindly replay cached claims. A later invocation
reads durable pending state. New concurrent source records are not consumed by
an older batch.

The Edge handler permits one fixed-size batch after dedicated worker-token
authorization. Gateway JWT verification retains its default. No scheduler is
installed, token generated, provider setting changed or legacy public access
disabled. Existing notification-worker credentials are not reused.

## Operational limits still requiring qualification

The broad Home topic is a **coarse revision hint**, not every-row delivery and
not a million-concurrent claim. Scope fanout still costs one delivered message
per subscribed connection. The separate next step is bounded top-K public
candidate materialization/read caching, viewer-authorized hydration, measured
concurrent connection/message/read budgets, and controlled rollout. No client
should join a topic for every followed creator. Creator-specific rails use a
bounded current interest; Circle remains canonical polling until separately
implemented.

Health sampling is service-only and capped at 10,001 records per pending/dead
sample; 10,001 means at least that many, not an exact backlog count. The oldest
ready timestamp supports lag alarms. Completed/dead records and scope state are
retained without automatic deletion. A reviewed retention/archival policy is a
preactivation requirement, as are dead-letter handling and an operator retry
policy. Source history contains no historical backfill.

## Tests

- `tests/discovery-invalidation-database.test.mjs`: complete canonical schema
  replay, producers, source rollback, coalescing, trailing deferral, versioned
  deadlines, delayed-event cancellation/deletion, transport failure rollback,
  retries/dead-letter and privilege boundaries. Managed Realtime is a local
  outbox double, not hosted websocket evidence.
- `supabase/tests/discovery_scoped_invalidation_test.sql`: pgTAP default-off,
  scoped producers, restricted identities and grants.
- `tests/discovery-invalidation-worker.test.mjs`: authorization-before-claim,
  fixed budgets, sanitized responses and unknown timeout behavior.
- Independent PostgreSQL 17.11 competing-session verification passed 16 checks
  against migration SHA256
  `32b5fd76092012c03efb01f2e18a1d83381b63b9cf904daf377162f28be0b54c`:
  DDL/source/dispatcher rollback, `SKIP LOCKED`, connection-close recovery,
  concurrent enqueue, topic contention, swallowed errors/dead-letter, stale or
  wrong nonce/event/topic, bounded confirmation and unrelated concurrent sends.
  This is disposable local PostgreSQL evidence with managed transport doubles,
  not hosted websocket or load-capacity proof.
- Actual private-channel joining/delivery and installed Android/iOS behavior
  remain separate qualification evidence.

Primary references: [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast),
[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization),
[Realtime limits](https://supabase.com/docs/guides/realtime/limits).
