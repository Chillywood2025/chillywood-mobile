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

- Google Play / RevenueCat sandbox subscription sheet opens for product `channel_subscription_sandbox_monthly_499`.
- Signed RevenueCat sandbox subscription event reaches the deployed webhook for this product.
- Verified provider event creates a live test subscription row.
- Money Center visual readback of an actual subscription transaction.
- Cancellation/expiration/revoke proof.
- v49 proof reached the creator setup, fan CTA, and unsubscribed direct-route gate. It then exposed two blockers: the central purchase-intent function did not allow `channel_subscription`, and the app only searched RevenueCat offerings instead of falling back to direct subscription product lookup.
- Backend blocker is fixed by remote-applied migration `20260613004804_channel_subscription_purchase_intent_allowlist.sql`.
- App fallback is fixed in commit `54c9f5c11b9a67f366c97a7b8b6718fe76704f43`, which adds direct RevenueCat subscription product lookup before purchase.
- v50 and v51 were installed from Google Play internal and still failed before the provider sheet with `Channel Subscription sandbox product is not available on this device yet.`
- Provider dashboard audit found the original provider product id `cw_channel_subscription_sandbox_monthly_499` cannot be created in Google Play because it is 43 characters. Google Play subscription product ids are capped at 40 characters.
- The valid Play subscription product id is now `channel_subscription_sandbox_monthly_499`; a local migration updates existing sandbox product/offer rows to that id.
- Google Play product `channel_subscription_sandbox_monthly_499` was created, but no active base plan exists yet. Play Console rejected multiple valid-looking base plan ids in the browser UI, and local Android Publisher API credentials were not authorized to create the base plan.

## Provider Path

- Product key: `channel_subscription_sandbox_monthly_499`
- Provider product id: `channel_subscription_sandbox_monthly_499`
- RevenueCat product/base-plan identifier candidate: `channel_subscription_sandbox_monthly_499:monthly`
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
- `20260613004804_channel_subscription_purchase_intent_allowlist.sql`
- `20260613021940_channel_subscription_valid_play_product_id.sql`

`20260613021940_channel_subscription_valid_play_product_id.sql` updates the sandbox product and existing sandbox offer from the invalid 43-character Play id to `channel_subscription_sandbox_monthly_499`.

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
3. Confirm Google Play product `channel_subscription_sandbox_monthly_499` has an active base plan, preferably `monthly`.
4. Confirm RevenueCat product `channel_subscription_sandbox_monthly_499:monthly` exists and is attached to entitlement `creator_channel_subscription`.
5. Creator enables Channel Subscription in Money Center.
6. Unsubscribed fan sees `Subscribe`.
7. Unsubscribed fan cannot open subscriber-only route.
8. Fan completes Google Play / RevenueCat sandbox subscription purchase.
9. Signed webhook creates provider event, access grant, subscription row, and transaction.
10. Fan refresh shows `Subscribed` and can open subscriber-only route.
11. Second unsubscribed fan remains blocked.
12. Money Center shows Channel Subscription transaction as sandbox/not_payable.
13. Cancellation/expiration/revoke proof if provider tooling/order id is available.

## Current Blocker

Sandbox purchase proof is blocked by provider catalog setup, not by the app install:

- Uncommitted v48 build `da86b3e9-145f-45a4-9f84-d713d906dc98` is abandoned for official proof because its metadata points to old commit `9b2ae8e78958c3c38c08c7b3397104d2d35e1a0f`.
- Official v49 build `67995a33-6b4c-4e0a-afa2-02f95cff47c1` reached installed proof on attached device `R5CR120QCBF` with package `com.chillywood.mobile`, installer `com.android.vending`, and versionCode `49`.
- v49 creator setup passed: offer `c7f74157-421d-41c6-8562-161965bab031` was saved as `sandbox`, product key `channel_subscription_sandbox_monthly_499`, original provider product id `cw_channel_subscription_sandbox_monthly_499`, price `499`, subscriber count `0`.
- v49 unsubscribed fan proof passed: creator channel showed `Subscribe`, and direct `/channel-subscription/[creatorId]` showed `Subscriber access required`.
- v49 purchase attempt first failed at RPC with `unsupported_purchase_intent_product`; migration `20260613004804_channel_subscription_purchase_intent_allowlist.sql` fixed this and the same subscriber RPC created intent `f808996c-b543-42ca-9a6e-e4f1f6fa083b`.
- v49 app retry then failed at RevenueCat package lookup with `Channel Subscription sandbox product is not available on this device yet.` Commit `54c9f5c` adds direct subscription product lookup fallback, so official purchase proof requires v50.
- Official v50 build `c6859970-89a9-470b-882d-eeb848bb2fe9` installed from Google Play internal and still showed the product-unavailable alert.
- Official v51 build `d75e5146-6a07-4dcc-a3dc-35229112c9c2` installed from Google Play internal on `R5CR120QCBF` with package `com.chillywood.mobile`, installer `com.android.vending`, and versionCode `51`. It proved the subscriber gate still renders correctly, but `Subscribe` still showed `Channel Subscription sandbox product is not available on this device yet.`
- RevenueCat product catalog initially had no Channel Subscription product. A RevenueCat product mapping for the original `cw_channel_subscription_sandbox_monthly_499:monthly` showed Store Status `Not found`.
- Google Play Console initially had only `premium_subscription`. The original `cw_channel_subscription_sandbox_monthly_499` id is too long for Play, so the valid Google Play subscription product `channel_subscription_sandbox_monthly_499` was created.
- The remaining blocker is creating and activating a base plan for `channel_subscription_sandbox_monthly_499`, then mapping the matching RevenueCat product, expected `channel_subscription_sandbox_monthly_499:monthly`, to entitlement `creator_channel_subscription`.
- No live money is enabled.
- BrowserStack remains deferred until final full regression after all monetization flows are built.
