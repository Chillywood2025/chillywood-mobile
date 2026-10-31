# Auction lifecycle and notifications

The source closes due event and room auctions through a bounded private tick,
using the same parent-before-auction lock order as buyer and creator operations.
An overlapping tick exits without duplicating work. Lock contention is bounded;
the next tick retries due rows. This is not million-user load qualification.

Highest-bid replacement and winner assignment enqueue durable notification
activity in the same transaction. The existing activity worker handles in-app
materialization and delivery; no new push provider or credentials are introduced.
Outbid messages never expose another bidder's identity. Winner and creator copy
explicitly say payment/access are still pending. Checkout-start and final-payment
reminders are scheduled separately, and rendered actions say **Review auction**,
not access granted. Exact event/room routes open the current authoritative UI.

The resolver checks current source, winner/previous bidder, room incarnation,
state and expiry. Existing account restrictions, audience blocks, preferences
and exact push-token ownership checks still apply. Stale queued notifications
are suppressed, and already-materialized notices carry action expiry metadata.
Opening a notification never authorizes payment, admission or stage media.

No historical backfill or scheduler activation runs in this migration. After
separate authorized deployment/qualification, the database owner may call
`private.configure_creator_auction_lifecycle()` to install the named ten-second
job. `private.disable_creator_auction_lifecycle()` stops that job without deleting
auctions, bids or notification history. Both functions are inaccessible to API
roles. Existing notification worker activation and actual provider delivery must
be independently verified. An unconfigured scheduler is not a working automatic
closing service.

Local proof executes the full production SQL chain with synthetic actors and
qualified payment fixtures. An isolated PGlite JavaScript clock advances time;
the test asserts the SQL clock changed, without replacing production functions
or changing the operating-system clock. It proves timer selection, source checks,
atomic outbox rows, deduplication, preferences and actual in-app materialization.
It is not native PostgreSQL lock contention, production cron, physical-device or
provider-delivery proof; those remain canonical CI/deployment qualification.
