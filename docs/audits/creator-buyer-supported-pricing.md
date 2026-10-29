# Supported pricing and immutable purchase terms

Source implementation in `20261026164507_creator_supported_prices_and_purchase_quotes.sql`.
This supplements the main backend audit after owner approval of the implementation
plan. It creates no live products and changes no store configuration, existing
price point, revenue split, payout, rollout switch or provider account.

## Existing catalog boundary

| Mode | Android source catalog | iOS source catalog | Qualification |
|---|---|---|---|
| Paid video |99 cents|99/299/499/999 cents|Existing sandbox mappings only; actual installed products unobserved.|
| Title Party Room |99|99/299/499/999|Exact virtual room admission; no physical seat map.|
| Scheduled event |99|99/299/499/999|Reservation and immutable event revision required on every issuance route.|
| VIP |499|99/299/499/999|Existing nonrenewing30-day creator entitlement preserved.|
| Channel subscription |499 monthly|499 monthly across8 independently reusable slots|No alternative recurring price invented.|
| Tip |99 product exists; no eligible amount with current minimum>=100|99/299/499/999 product rows; source minimum excludes99|Android fails closed; existing minimum and catalog were not silently changed.|
| Live Stage access / speaking eligibility |Existing enabled exact products only|No qualifying mappings found|No invented Apple product or alias to title-room ticket.|

`list_creator_supported_prices(source_type,platform,environment,source_id)` returns
only existing catalog identities and amounts. Omit `source_id` for creator
selection; include it to filter a buyer's platform to the exact saved offer price.
Sandbox rows explicitly report whether provider proof exists. Production rows
require active state and existing provider/owner/device proof; existing checkout
rollout and eligibility checks still apply. A catalog read is not purchase or
activation authority.

Video/room/event setters accept supported catalog amounts. VIP and channel use
`set_creator_vip_pass_offer_at_price` and
`set_creator_channel_subscription_offer_at_price`, with an existing `priceId`.
The status-only `pause_creator_offer` preserves price and provider fields and
does not require a currently available catalog. New matching Android catalog
rows, if separately authorized in future, are selected by exact amount/currency;
no current migration creates them.

## Purchase identity and recovery

An after-insert trigger captures `creator_money_purchase_quotes` from the actual
source and intent, including title, exact destination, agreed amount/currency,
provider product, environment, expiry and existing inclusion policy. Event
quotes include the exact event revision. Quotes cannot be updated or deleted;
intent identity, economics, issuing session and expiry cannot be rewritten.
Clients receive safe quote data, and direct quote reads require the exact owner
and current session through RLS. Old intents are not backfilled with today's
titles or terms.

The ordinary RevenueCat core already honored immutable intent prices. Its event
branch now selects the reservation's exact offer and calls the reservation
admission/finalization helpers under the existing source lock. Stage fulfillment
uses the original intent economics after a price edit and retains exact
room/creator/product and session/quarantine checks. Terminal transactions retain
their original financial values.

The owner approved recovering a payment received after reservation expiry only
when capacity remains and original show terms are still valid; otherwise the
purchase needs resolution. The shared provider wrappers now accept a required
additional `p_purchase_occurred_at` argument and retain an immutable timestamp
receipt bound to event ID, provider, buyer, product, environment and payload hash.
The Edge handler passes `purchased_at_ms` independently of event generation time.
Only event intents gain late selection, including exact pending/expired intents
with retained held reservations. The original purchase must not precede the
intent. Multiple matching histories fail closed. Missing timestamp, expired
session, changed terms, unavailable capacity or source ambiguity grant nothing
and use durable reconciliation. No second charge or automatic refund is issued.

RevenueCat's official [event field documentation](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields),
checked2026-10-26, distinguishes transaction purchase time from event generation
time. It also notes subscription renewal purchase times can be later than event
generation; renewal behavior is unchanged by this event-only selection rule.

## Durable checkout attempts

`20261026180230_creator_money_checkout_attempt_claims.sql` adds
`begin_creator_money_checkout(p_purchase_intent_id,p_checkout_attempt_id)` for
all Store creator purchases except events. It checks the exact initiating
session, protected quote, current source, supported price and sale switches,
then records one immutable checkout marker. Every repeat returns
`startAuthorized:false`, even with the original attempt UUID. An unresolved
started attempt blocks a replacement intent for the same buyer and source after
expiry; expiry alone is not evidence that the Store did not charge. Provider
receipts remain the authority for payment and entitlement. Events use their
separate reservation checkout marker.

This closes application retry admission; it cannot prevent a modified client
from bypassing the application and calling its installed Store SDK directly.
Server receipt validation, idempotency and reconciliation remain required.

## Evidence and outstanding qualification

`tests/creator-money/revenuecat-purchase-time.test.mjs` executes the actual Edge
writer:8/8 passed, including distinct purchase/generation timestamps and missing,
invalid and zero purchase timestamps on both platforms. Related notification and
provenance suites passed96/96. `scripts/test-live-stage-fulfillment-authority-postgres.mjs`
adds a negative control: the prior actual projector rejects an accepted99-cent
intent after a999-cent offer edit; the candidate fulfills99, deduplicates and
refunds99. Its CI wrapper passed.

`tests/creator-money/supported-prices-quotes-postgres.test.mjs` is the full migrated
PostgreSQL composition test with actual auth/session/legal/eligibility predicates,
creator setters, issuance, catalog, RLS, provider and terminal functions. It uses
synthetic accounts and no trigger bypass or predicate replacement. It covers
baseline99-only rejection, supported/unsupported prices, old-price fulfillment,
immutable writes, cross-account reads/terminal delivery, duplicate receipts,
provider timestamp mismatch, VIP/channel, paid video/tip, and stale sessions.
The scoped candidate passed 84 assertions (one test, 88 seconds) including the
new durable checkout marker for all non-event modes, duplicate claims with the
same and different attempt UUIDs, another account, a paused source, a genuinely
elapsed expiry, immutable marker writes and replacement-intent denial for an
unresolved started attempt. The same replay includes actual Stage issuance.
The fresh related Edge run passed 104/104. These are scoped local checkpoints,
not a frozen-head full-suite claim. The native PostgreSQL command
`node scripts/test-creator-checkout-claims-native-postgres.mjs --container=chillywood-event-offer-audit-claims20261026`
passed 12 assertions after a complete 479-migration replay. Two simultaneous
sessions authorize exactly one SDK start, including competing preexisting
intents. Different-account, stale-session and unresolved-expiry controls deny;
checkout admission creates no payment ledger. The task-owned PostgreSQL 17.6
container used no network, host ports or mounts, and was removed after testing.
This is an explicit additional command, not a claim about ordinary CI.
Event-specific late receipts, canceled-attempt
reconciliation and concurrency belong to the event reservation suite.

Deployed migration parity, live catalog/provider configuration, device Store
checkout, receipts/restore settings, real financial settlement and payout
operation remain unavailable. The implementation and mocks do not qualify them.
