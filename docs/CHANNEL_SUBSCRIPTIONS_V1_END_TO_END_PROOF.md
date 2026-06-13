# Channel Subscriptions V1 End-To-End Proof

## Status

Channel Subscriptions V1 is implemented and deployed in sandbox mode, but it is not yet Play/RevenueCat sandbox-purchase-proven.

Implemented:

- Creator can enable or pause one monthly Channel Subscription offer from Money Center.
- Fan channel surface can show `Subscribe` when a creator has a sandbox subscription offer.
- Subscriber-only route `/channel-subscription/[creatorId]` checks server access before showing subscriber content.
- RevenueCat / Google Play subscription package path is used.
- Stripe Tips path is not used.
- Verified RevenueCat webhook can create a `channel_subscription` access grant through the existing purchase-intent bridge.
- Supabase trigger mirrors verified access into `creator_channel_subscriptions`, `channel_subscribers`, and `creator_channel_subscription_transactions`.
- Money Center reads Channel Subscription offers and transactions separately from Tips, Paid Videos, Paid Watch-Party tickets, Paid Events, VIP, and Premium.

Not yet proved:

- Google Play / RevenueCat sandbox subscription sheet opens for product `cw_channel_subscription_sandbox_monthly_499`.
- Signed RevenueCat sandbox subscription event reaches the deployed webhook for this product.
- Verified provider event creates a live test subscription row.
- Money Center visual readback of an actual subscription transaction.
- Cancellation/expiration/revoke proof.
- Official traceable Play/internal build `67995a33-6b4c-4e0a-afa2-02f95cff47c1` finished for committed SHA `12b0f65f82bb571276346748ee2a13334690b68c` and versionCode `49`, and was submitted to Google Play internal testing. The attached phone still reports versionCode `46`, so device proof is blocked until Play delivers the v49 update.

## Provider Path

- Product key: `channel_subscription_sandbox_monthly_499`
- Provider product id: `cw_channel_subscription_sandbox_monthly_499`
- RevenueCat entitlement id: `creator_channel_subscription`
- Provider rail: RevenueCat / Google Play subscription package
- Environment: sandbox/test only
- Payout status: `not_payable`
- Live money: off

## Product Separation

Channel Subscriptions V1 unlocks only subscriber status for one creator channel.

It does not unlock:

- Chi'llwood Premium
- VIP
- Paid Videos
- Paid Watch-Party tickets
- Paid Events
- Tips
- Live Stage access
- LiveKit publish, host, speaker, seat, or room authority
- payout, cash-out, withdrawal, or transfer
- platform-wide badge/status
- other creators' channels

## Backend

Migration applied remotely:

- `20260612224536_channel_subscriptions_v1_sandbox.sql`

Updated function deployed:

- `revenuecat-webhook`

New tables:

- `creator_channel_subscription_offers`
- `creator_channel_subscriptions`
- `creator_channel_subscription_transactions`
- `creator_channel_subscription_events`

Existing mirror/read-model table used:

- `channel_subscribers`

New/updated RPCs:

- `set_creator_channel_subscription_offer`
- `resolve_creator_channel_subscription_access`
- `create_creator_channel_subscription_purchase_intent`
- `list_my_creator_channel_subscription_offers`
- `list_my_creator_channel_subscription_transactions`

RLS posture:

- Creators can read their own offers/subscribers/transactions.
- Subscribers can read their own subscription rows.
- Public users cannot read other fans' subscriptions.
- Clients cannot directly mark subscriptions active.
- Clients cannot directly write paid transaction rows.
- Clients cannot directly update provider status fields.

## App Surfaces

Creator setup:

- Platform Studio / Money Center / Ways to Earn
- Money Center / Offers
- Money Center / Transactions

Fan surfaces:

- Creator channel header: `Subscribe`
- Creator channel subscription card
- Subscriber-only route: `/channel-subscription/[creatorId]`

Gate behavior:

- Logged-out users are blocked and asked to sign in.
- Unsubscribed users see subscription-required copy and `Subscribe`.
- Subscribed users see subscriber-only content only after server resolver returns active access.
- Direct deep link to `/channel-subscription/[creatorId]` cannot bypass the resolver.

## Proof Checklist

Pending Play/internal proof:

1. Install Play/internal build containing Channel Subscriptions V1.
2. Confirm installer is `com.android.vending`.
3. Confirm RevenueCat offering includes `cw_channel_subscription_sandbox_monthly_499`.
4. Creator enables Channel Subscription in Money Center.
5. Unsubscribed fan sees `Subscribe`.
6. Unsubscribed fan cannot open subscriber-only route.
7. Fan completes Google Play / RevenueCat sandbox subscription purchase.
8. Signed webhook creates provider event, access grant, subscription row, and transaction.
9. Fan refresh shows `Subscribed` and can open subscriber-only route.
10. Second unsubscribed fan remains blocked.
11. Money Center shows Channel Subscription transaction as sandbox/not_payable.
12. Cancellation/expiration/revoke proof if provider tooling/order id is available.

## Current Blocker

Sandbox purchase proof is pending provider/runtime setup, not app schema implementation:

- Uncommitted v48 build `da86b3e9-145f-45a4-9f84-d713d906dc98` is abandoned for official proof because its metadata points to old commit `9b2ae8e78958c3c38c08c7b3397104d2d35e1a0f`.
- Official v49 build `67995a33-6b4c-4e0a-afa2-02f95cff47c1` points to committed SHA `12b0f65f82bb571276346748ee2a13334690b68c`, produced an AAB, and was submitted to Google Play internal testing.
- Attached device `R5CR120QCBF` still reports package `com.chillywood.mobile`, installer `com.android.vending`, and versionCode `46`; official proof must wait until Google Play delivers versionCode `49`.
- Google Play subscription product and RevenueCat offering/package availability for `cw_channel_subscription_sandbox_monthly_499` still need dashboard/device proof.
- No live money is enabled.
- BrowserStack remains deferred until final full regression after all monetization flows are built.
