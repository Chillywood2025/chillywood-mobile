# Channel Subscriptions V1 End-To-End Proof

## Status

Channel Subscriptions V1 is implemented, deployed in sandbox mode, and core Play / RevenueCat sandbox purchase proof passed on June 13, 2026.

This is not live money. Subscription rows are sandbox/not-payable and `live_money_enabled` remains off.

Passed:

- Google Play subscription product `channel_subscription_sandbox_monthly_499` has active base plan `monthly`.
- RevenueCat product `channel_subscription_sandbox_monthly_499:monthly` exists, is published, and is attached to entitlement `creator_channel_subscription`.
- Play/internal runtime v51 was installed from Google Play on device `R5CR120QCBF` with package `com.chillywood.mobile`, installer `com.android.vending`, and versionCode `51`.
- App product lookup became available after a cold app restart.
- Google Play Billing sheet opened for the sandbox subscription.
- Fan completed a RevenueCat / Google Play sandbox subscription purchase.
- Signed provider event reached the deployed `revenuecat-webhook` path and was processed.
- Server created an active channel subscription row, sandbox access grant, and paid/not-payable transaction.
- Subscribed fan saw `SUBSCRIBED` and could access `/channel-subscription/[creatorId]`.
- Subscription copy remained separate from Premium, VIP, Paid Videos, Paid Watch-Party tickets, Paid Events, Tips, LiveKit authority, payouts, and other creators' channels.

Still not claimed:

- Creator Money Center visual screenshot for the exact subscription transaction.
- Second authenticated unsubscribed-fan UI denial after the purchase.
- Cancellation/expiration/revoke proof.
- Live-money approval.

Server readback did prove transaction/subscription creation and grant scoping for the subscribed fan. A separate visual proof pass should capture Money Center Transactions and a second authenticated unsubscribed fan before closing those UI proof gaps.

## Provider Setup

Google Play:

- Package: `com.chillywood.mobile`
- Subscription product id: `channel_subscription_sandbox_monthly_499`
- Base plan id: `monthly`
- Base plan type: auto-renewing monthly subscription
- Base plan status: `ACTIVE`
- Price: USD 4.99
- Legacy-compatible flag was enabled through the Android Publisher API after the Play UI path stayed unreliable.

RevenueCat:

- Product identifier: `channel_subscription_sandbox_monthly_499:monthly`
- Store status: `Published`
- Product group: `channel_subscription_sandbox_monthly_499`
- Entitlement id: `creator_channel_subscription`
- Entitlement attachment: active

Earlier invalid mapping:

- `cw_channel_subscription_sandbox_monthly_499:monthly` remains the old invalid RevenueCat/Play mapping candidate.
- It is not used for new proof because `cw_channel_subscription_sandbox_monthly_499` is too long for Google Play subscription product ids.

## Provider Path

- Product key: `channel_subscription_sandbox_monthly_499`
- Provider product id: `channel_subscription_sandbox_monthly_499`
- RevenueCat product/base-plan id: `channel_subscription_sandbox_monthly_499:monthly`
- RevenueCat entitlement id: `creator_channel_subscription`
- Provider rail: RevenueCat / Google Play subscription package
- Environment: sandbox/test only
- Payout status: `not_payable`
- Live money: off

Stripe Tips is not used for Channel Subscriptions.

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

Migrations applied remotely:

- `20260612224536_channel_subscriptions_v1_sandbox.sql`
- `20260613004804_channel_subscription_purchase_intent_allowlist.sql`
- `20260613021940_channel_subscription_valid_play_product_id.sql`

Updated function deployed:

- `revenuecat-webhook`

Tables:

- `creator_channel_subscription_offers`
- `creator_channel_subscriptions`
- `creator_channel_subscription_transactions`
- `creator_channel_subscription_events`

Existing mirror/read-model table used:

- `channel_subscribers`

RPCs:

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

## Runtime Proof

Play/internal runtime:

- Device: `R5CR120QCBF`
- Package: `com.chillywood.mobile`
- Installer: `com.android.vending`
- VersionCode: `51`
- Proof path: `/tmp/chillywood-channel-subscription-proof-v51/`

Creator/channel proof target:

- Creator id: `c2afa6cc-52f2-4714-b972-89863582d05a`
- Offer id: `c7f74157-421d-41c6-8562-161965bab031`

Subscriber proof target:

- Subscriber id: `ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5`

Purchase proof:

- RevenueCat / provider event row id: `9dabc47f-61f7-49f7-a169-3adb0ebbac30`
- Provider transaction id: `CD64CA3D-4264-4871-8C10-74270C1D1E1F`
- Event type: `INITIAL_PURCHASE`
- Provider: `revenuecat_google_play`
- Environment: `sandbox`
- Product key: `channel_subscription_sandbox_monthly_499`
- Status: `processed`

Created rows:

- Subscription id: `436f2acc-ec46-4977-ba51-958452ea2f2e`
- Transaction id: `e49cddea-cd6d-4097-b70c-a07abaa24823`
- Access grant id: `1a5492fe-c135-435e-878c-5e21a7638322`
- Transaction status: `paid`
- Payout status: `not_payable`
- Amount: `499` cents
- Currency: `usd`
- Subscription status: `active`

App result:

- Google Play sandbox subscription sheet opened for `$4.99/5 min`.
- Google Play showed test subscription copy and did not charge real money.
- After purchase, `/channel-subscription/[creatorId]` showed `SUBSCRIBED`.
- The subscriber-only copy explicitly stated the subscription is for this creator channel only and does not unlock Premium, VIP, paid videos, paid Watch-Party tickets, paid events, LiveKit authority, payouts, or other creators' channels.

## Prior Blockers Closed

- v48 was abandoned for official proof because its build metadata pointed to old commit `9b2ae8e78958c3c38c08c7b3397104d2d35e1a0f`.
- v49 proved creator setup, `Subscribe` CTA, and unsubscribed direct-route gate, then exposed backend `unsupported_purchase_intent_product`.
- `20260613004804_channel_subscription_purchase_intent_allowlist.sql` fixed the purchase-intent allowlist.
- v49 then exposed RevenueCat offering-only lookup failure.
- Commit `54c9f5c11b9a67f366c97a7b8b6718fe76704f43` added direct RevenueCat subscription product lookup.
- v50/v51 still showed product unavailable until the Google Play base plan and corrected RevenueCat product/base-plan mapping were completed.
- After base plan/mapping completion and a cold app restart, v51 opened the Google Play Billing sheet and completed the sandbox subscription.

## Remaining Proof Gaps

Money Center visual readback:

- Server readback proves transaction `e49cddea-cd6d-4097-b70c-a07abaa24823` exists as `paid`, sandbox, and `not_payable`.
- A creator-side app screenshot of Money Center Transactions for this exact row is still pending.

Second unsubscribed fan:

- v49 previously proved unsubscribed route gating before purchase.
- A post-purchase second authenticated unsubscribed-fan UI denial proof is still pending.
- Server rows show the active grant/subscription is scoped to subscriber `ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5`, not globally public.

Cancellation/expiration/revoke:

- Deferred until safe RevenueCat / Google Play tooling or a safe test order path is available.
- Do not fake cancellation/expiration/revoke by manual DB mutation.

## Next Steps

- Capture creator Money Center Transactions visual readback for transaction `e49cddea-cd6d-4097-b70c-a07abaa24823`.
- Capture second authenticated unsubscribed-fan UI denial after the successful purchase.
- Attempt cancellation/expiration/revoke only when safe RevenueCat / Google Play tooling is available.
- Keep live money disabled until explicit production approval.
- BrowserStack remains deferred until final full monetization regression.
