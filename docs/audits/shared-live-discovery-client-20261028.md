# Shared live updates: first client slice

## Scope and rollout boundary

This change covers Live Discovery on Home, Explore, Live, Platform and the
existing Profile status reader. It does not finish the app-wide live-update
program. Calls, LiveKit media, room controls, purchase authority and payment
providers are unchanged. No migration, worker, provider setting or release is
activated by this source change.

New Broadcast transport is disabled unless the build explicitly sets
`EXPO_PUBLIC_LIVE_DISCOVERY_PUSH_ENABLED=true`. That flag must remain off until
the matching backend, dispatcher, permissions, installed-client compatibility
and capacity have been qualified and separately authorized for deployment.
Existing session-owned notification invalidations are reused immediately;
they cover only some transitions, so canonical fallback is required.

## Client contracts

- `_lib/sharedLiveUpdates.ts` owns scoped subscriptions and coalesces hints
  across listeners. One interest is chosen per focused reader, with a maximum
  of four distinct interests per account generation. No per-followed-creator
  subscriptions are created. Excess interests retain canonical polling.
- Topics are `discovery:v1:surface:home|profile|channel` or
  `discovery:v1:creator:<UUID>`, always private and receive-only on the client.
  An opaque hint is not a content row, count, entitlement or permission grant.
- Account replacement retires listeners, timers and channels. Backgrounding
  removes transport. A new same-topic channel waits for asynchronous removal
  of its predecessor; stale callbacks cannot repopulate a new session.
- `_lib/sharedLiveRead.ts` coalesces only identical in-flight requests for the
  same account generation and query/snapshot identity. It caches no completed
  results. Aborting one reader does not abort another; the last reader aborts
  the underlying request. In-flight bookkeeping is bounded.
- `_lib/discoveryRankingSignals.ts` classifies only current candidate actors
  with five bounded follow/friend/block queries. Public and Circle lanes share
  one classifier call in the mounted hook. At most 300 unique actors can arise
  from two 50-card lanes and three identity fields per card. The exported ranked
  readers also use this helper; discovery no longer enumerates the entire friend
  graph or performs a block query per friend. Both block directions and account
  generation are checked. A graph-read failure is not treated as proof of an
  unblocked relationship.
- Stable card browsing is explicitly opted into on the four live rails.
  Existing card IDs are canonically revalidated even when displaced from a
  newly ranked top-K page. Surviving cards retain order, updated metadata is
  applied, and withdrawn/ended/inaccessible cards disappear. Newly discovered
  cards wait behind the accessible **New live streams** action. Tapping it
  performs a fresh authorized read rather than accepting a cached payload.
- Profile live-status and mixed non-live feeds retain automatic replacement;
  they do not silently buffer additions without an affordance.
- With healthy enabled transport, stable rails revalidate pinned cards every
  30 seconds while full head/ranking fallback slows to 120 seconds. Disconnect
  restores the 30-second full fallback. Hints coalesce for 5–7 seconds, then
  share a minimum 10-second automatic-read budget with retained trailing work.
  Manual refresh is explicit and is not rate-limited by that automatic budget.
- Read deadlines remain 12 seconds. Failure is visible and clears stale state;
  retirement aborts the request and deadline. Joining/opening always invokes
  the existing authoritative access path regardless of card state.
- Upcoming events have separately bounded future and **Awaiting host** lanes.
  Passing a scheduled start does not manufacture a live event or cancellation.
  Terminal/private/draft filters are applied before limits; late events cannot
  consume the future lane's entire result budget.

## Capacity: bounds are not throughput proof

The tests exercise 1,000-hint bursts, 100 shared listeners, concurrent identical
reads, lifecycle interruption, account rotation and canonical-reader behavior.
They do not establish delivered-message throughput, device battery cost or
million-concurrent-user capacity.

For N focused readers, a 30-second poll represents N/30 refresh cycles per
second before query fanout. Stable public rails can perform a head read plus a
pinned-ID read in a full refresh; Circle adds its own bounded source and pinned
reads. Upcoming adds two bounded event-lane reads. Ranking enrichment must also
be budgeted, not omitted. Healthy quiet intervals reduce head work, not the
30-second visible-card authorization checks. Identical in-flight reads share
work, but different scopes and snapshots remain independent.

For a signed-in stable public rail, a full refresh can cost seven data queries
(head, pinned IDs, five relationship/block reads); Circle can raise this to nine.
Self-only/empty candidate sets skip graph reads. A hot stream at the 10-second
minimum budget can therefore still produce about 700,000 data queries/second at
one million simultaneous public-rail readers before server-side optimizations.
This arithmetic is a warning, not a tested throughput result: scoped delivery,
materialized/top-K revision changes, suitable server-side batching/caching and
measured capacity are required before such a population is enabled. Do not turn
on the transport broadly merely because coalescing and bounded-query tests pass.

Broad surface topics can still have large fanout. Durable queueing and a fixed
batch size do not make broad subscriptions capacity-qualified. Before broad
activation measure concurrent viewers, delivered messages, reconnect joins,
source-write volume, dispatcher backlog/age, canonical reads, p95/p99 freshness,
CPU, memory and costs using representative high-degree graphs and hot creators.
Further category/top-K revision partitioning should be driven by those results.
Registered accounts must not be confused with simultaneously active viewers.

## Verification boundaries

Mounted React tests execute production hooks/readers with controlled transport
and database responses. Query URL tests execute the actual PostgREST builder.
Shared-manager tests exercise lifecycle, coalescing and same-topic retirement.
These are not installed-device, live-provider or signed-release evidence.
Database/worker evidence is recorded separately in the backend audit. Native
physical Android/iOS tests and approved staged rollout remain distinct gates.
The sanitized local planner/concurrency summary is
`discovery-native-local-evidence-20261028.json`, bound to the migration SHA256.

The standalone legacy `guard:refresh-policy` currently fails two unchanged
LiveKit foreground-capture AST expectations. The same failures were reproduced
from exact base `db390d9a6ebe58292abd69499e3076134a949cf9` in isolated extracted
files with the pinned dependency tree. This change does not weaken that guard
or alter those capture paths. Protected exact-head validation remains required.

## Remaining app-wide phases

1. Feed head and visible engagement: reuse the shared lifecycle/reader budget,
   preserve the existing **New posts** snapshot and comments-draft behavior,
   add complete source invalidation coverage rather than assuming notification
   delivery covers every followed creator. Keep engagement scoped to visible IDs.
2. Notification center/badges: retain its existing durable activity ledger and
   device ownership checks, consolidate invalidation consumers without another
   per-screen CDC subscription. Phone alerts remain preference-controlled and
   separate from in-app updates.
3. Inbox/open thread: replace broad table-change wakeups with authorized scoped
   invalidation and durable catchup, preserving unread/clear/hide semantics and
   same-session fencing. Do not replace call signaling/media transport.
4. Room/event availability: observe canonical domain status and safe counts;
   never turn a hint into a seat reservation, speaker grant or paid entitlement.

Each phase needs its own exact-diff review, production-path tests and protected
Required Validation. This first slice is independently releasable with the new
transport off; it must not be represented as completion of all four phases.

## Primary references checked

- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- https://supabase.com/docs/guides/realtime/authorization
- https://supabase.com/docs/guides/realtime/broadcast
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/changelog/cbc-tls-ciphers-deprecated

Private channel authorization is evaluated on join; canonical rereads remain
necessary after audience changes. Do not globally disable public Realtime
access: installed room Broadcast/Presence clients currently depend on it.
The October TLS notice affects obsolete clients from November 10 at the earliest;
it does not authorize changing TLS settings or weakening connection security.
