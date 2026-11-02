# Live discovery refresh contract

Live discovery is automatic, not a manual “New live streams” queue. Home, Live,
Explore, current Profile/Platform cards and public Party count badges reread
canonical authorized state when the shared invalidation transport signals a
change. Own-Profile suggestions are not retained inside a stale cursor page.

## Connected update path

- Public changes use the existing private receive-only `surface`/`creator`
  topics. Circle changes use one additional private
  `discovery:v1:viewer:<current-user-id>` topic shared by every mounted reader.
  At most four public interests plus one own-viewer interest are retained.
- Hints contain a random invalidation ID and independently random opaque
  correlation keys. No room IDs, titles, host names,
  counts, private audience records or playback grants belong in a hint.
- The transactional server producer is the primary path after source commit.
  The existing durable outbox worker is a delivery-failure fallback, not the
  normal discovery delay. Source/backend migration and Realtime authorization
  must be deployed together; the public build flag
  `EXPO_PUBLIC_LIVE_DISCOVERY_PUSH_ENABLED=true` must be present in the actual
  exported client bundle. A configured flag does not prove installed delivery.
- Client hints coalesce for 100–199 ms. Automatic canonical reads have a 500 ms
  burst budget, one active read and one retained trailing reconciliation. Thus
  idle/available clients add at most about 700 ms of deliberate scheduling;
  server transaction, transport, query, device scheduling and held-request time
  are additional. This is not a zero-delay or measured cross-device SLA.
- Every focused foreground consumer retains a complete 30-second polling
  fallback. Signed-out public discovery uses that fallback. Background or
  unfocused views do not poll; reconnect/foreground revalidates current state.
  Canonical reads time out after 12 seconds and fail closed.

## Rendering and privacy

New eligible cards appear without pull-to-refresh, navigation or acceptance.
Surviving leading-card order is retained where possible; each live lane is
bounded to 50 cards so pinned-ID validation stays bounded. A user's viewport is
not forcibly scrolled and the app never automatically enters a room.

Privacy/end hints received during an in-flight read invalidate only rows with
affected opaque keys. Those rows are removed immediately and cannot return from
that old request; unaffected rows can progress even while unrelated global
hints continue throughout successive reads. A read begun after a hint uses
current server authority, including relationship-only removal/rejoin. Public
title counts and upcoming events have their own opaque keys. Legacy/unkeyed,
malformed, reconnect and overflowing hints retain conservative whole-read
invalidation; source and client must be deployed together for keyed convergence.
The retained trailing canonical read reconciles affected rows.
Raw keys enter a bounded epoch journal before the 100–199 ms callback, so a
response cannot restore affected metadata inside that coalescing window. A
reader started after a hint cannot share an older pre-hint source flight.
Coalescing retains at most 256 distinct keys; the in-flight journal retains at
most 4,096. Overflow fails closed and requires fresh reconciliation, so this is
not an unlimited-throughput guarantee.
Account/session, route, foreground and focus ownership fence late responses.
Shared reads deduplicate only in-flight identical requests, not completed data.

Public Profile/Platform/Explore lanes and public title counts remain public-only.
Home/Live's existing authorized Circle lane remains audience-scoped. Off is
unlisted, not an invitation-only access tier; room entry, blocks, current Circle
membership, paid access and exact host authority remain separate server checks.
The own-viewer channel cannot grant access or turn notification preferences on.

## Evidence limits

Mounted tests exercise actual shared client coordination across all consumers,
including starts, settings, withdrawal, Circle removal, reconnect, account
rotation, 1,000-hint bursts and continuous scoped hints throughout multiple
canonical reads (not merely a burst followed by silence). Full-schema tests
establish server authorization.
Native Realtime delivery, installed Android/iOS behavior and large Circle fanout
capacity require their own qualification; neither mocked transport nor source
tests prove those properties. No flag, cron, deployment or OTA is activated by
these source changes.
