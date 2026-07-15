# iOS Commerce Architecture

Status: source architecture and permanent-ID manifest prepared; Apple purchase
activation remains sandbox/internal-only and the App Store rail defaults off.

## Governing rules

Apple requires In-App Purchase for digital feature or content unlocks and permits
IAP-based tips to developers or digital-content providers. Product identifiers are
permanent after creation and cannot be reused. Chi'llywood therefore uses a small,
reviewable catalog rather than deriving product identifiers from creators, videos,
rooms, or events.

Authoritative references:

- [Apple App Review Guidelines, Payments](https://developer.apple.com/app-store/review/guidelines/)
- [Apple In-App Purchase information](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information)
- [RevenueCat Apple In-App Purchase key configuration](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration)
- [RevenueCat webhook event fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)

## Store and provider identity

The conceptual product remains independent of its store representation. Store
mappings identify platform, store, provider, provider product ID, product type,
tier, environment, and lifecycle status.

- Android keeps its existing Google Play and `revenuecat_google_play` values.
- iOS uses App Store and `revenuecat_app_store` values.
- Google base-plan parsing is valid only for Google webhook events.
- Apple product IDs are matched exactly and never split as Google base plans.
- A provider event may grant only the conceptual access declared by its mapping.
- A tip mapping has no entitlement and can never unlock digital access.
- No purchase grants room host, publisher, moderation, or administration authority.

## Finite Apple catalog

The canonical manifest is
`config/ios/app-store-products.json`. It contains:

- Premium monthly and yearly auto-renewable subscriptions in one Premium group.
- Four consumable creator-tip tiers. Tips have no entitlement.
- Four consumable Seat Pass tiers. A verified purchase intent binds a tier to one
  approved watch-party/event access grant on the server. Idempotency prevents one
  transaction from being consumed twice.

All entries start `sandbox_only`. Reference USD prices are implementation targets;
App Store Connect remains the source of truth for storefront price points and tax.
No live-money, creator-payout, or payable-balance flag is enabled by this catalog.

## Intentionally disabled dynamic products

The first Apple catalog does not expose these purchase flows:

- paid video unlocks;
- general event passes outside the bounded Seat Pass model;
- creator-specific VIP access;
- creator-specific channel subscriptions.

Those concepts are dynamic and do not safely fit generic non-consumables or one
shared subscription group. Creating arbitrary per-creator or per-title identifiers
would violate the finite, predeclared catalog rule and create permanent App Store
objects before the business model is stable. The iOS UI must fail closed for these
flows while Android behavior remains unchanged.

## Purchase-intent and access flow

1. The signed-in client requests a server-owned purchase intent for a conceptual
   product and a specific Apple mapping.
2. The server validates account status, moderation restrictions, content/room
   eligibility, mapping status, environment, rate limits, and the Apple kill
   switch.
3. RevenueCat presents only the mapped App Store product.
4. RevenueCat verifies the StoreKit transaction and posts a signed/idempotent
   webhook event.
5. The webhook detects the store, performs exact mapping, records the provider
   event, and then grants or reconciles access.
6. Duplicate events are acknowledgable without duplicating grants. Retriable
   internal failures return a non-success status so RevenueCat can retry.

The Apple kill switch, live-money switch, payouts, cash-out, and payable balances
all default off. Sandbox purchases may prove access behavior but never create a
payable creator balance.

## Lifecycle semantics

Premium subscription lifecycle supports initial purchase, renewal, cancellation,
billing issue/grace period, expiration, refund, revocation, and restore. A
cancellation records the future non-renewal state but does not remove access before
the verified entitlement expiration. Refund or revocation removes access according
to the verified provider event.

Consumable tips never restore and never grant access. Seat Pass access is restored
from the server's verified access-grant ledger after authentication; the consumable
StoreKit transaction itself is not treated as a restorable purchase.

RevenueCat customer identity must use the authenticated Chi'llywood user ID, not an
email address or device identifier. Alias/transfer events require the same server
identity checks as initial purchases.

## Simulator and internal testing

A local StoreKit configuration mirrors every manifest entry for Simulator tests.
Provider-backed tests remain sandbox/internal TestFlight only until the remaining
physical-device matrix proves purchase, restore, renewal, cancellation, refund,
and revocation. Public sale and automatic release remain prohibited.
