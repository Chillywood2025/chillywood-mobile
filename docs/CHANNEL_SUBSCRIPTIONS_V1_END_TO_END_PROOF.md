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

Follow-up proof passed:

- Creator Money Center visual screenshot/readback for exact transaction `e49cddea-cd6d-4097-b70c-a07abaa24823`.
- Authenticated non-subscriber UI denial on `/channel-subscription/[creatorId]` after the purchase.
- Provider lifecycle delivery reached Supabase for renewal, cancellation, and expiration events.

Lifecycle handling update:

- `revenuecat-webhook` now handles Channel Subscription `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `UNCANCELLATION`, `PRODUCT_CHANGE`, `REFUND`, `REVOCATION`, and `SUBSCRIPTION_PAUSED` events.
- Migrations `20260613091417_channel_subscription_lifecycle_handling.sql` and `20260613092100_channel_subscription_cancel_pending_unique.sql` are applied remotely.
- Existing ignored lifecycle rows were not manually rewritten because they do not contain the original raw provider payload. Lifecycle proof now requires a fresh or safely replayed signed RevenueCat event.
- Post-deploy Supabase readback found no fresh lifecycle event yet; the latest lifecycle rows remain the historical ignored `RENEWAL`, `CANCELLATION`, and `EXPIRATION` rows from before this handler deployment.
- Fresh lifecycle proof attempt: Google Play Console safely identified exact sandbox order `GPA.3353-3923-8017-31040..4` for `channel_subscription_sandbox_monthly_499`, accepted a sandbox refund with `Remove entitlement` selected, and showed `1 order refunded`. RevenueCat did not emit a fresh signed webhook during the proof window, so no post-deploy lifecycle row was available to process.

Still not claimed:

- Provider-driven lifecycle proof after the new handler.
- Live-money approval.

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
- `20260613091417_channel_subscription_lifecycle_handling.sql`
- `20260613092100_channel_subscription_cancel_pending_unique.sql`

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
- Follow-up proof path: `/tmp/chillywood-channel-subscription-proof-v51-followup/`

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

## Follow-Up Proof

Creator Money Center visual readback passed on June 13, 2026.

- Creator logged into the Play/internal v51 app.
- Platform Studio / Money Center / Transactions visually showed exact transaction `e49cddea-cd6d-4097-b70c-a07abaa24823`.
- Visible row copy showed `$4.99 channel subscription`, `Paid`, `Channel subscription`, `Sandbox`, and `payout status: not_payable`.
- The row was not shown as Tips, Paid Videos, Paid Watch-Party, Paid Events, Premium, or VIP.
- Money Center still showed no withdrawable/live payout claim.
- Screenshot/XML: `/tmp/chillywood-channel-subscription-proof-v51-followup/08_creator_money_center_channel_subscription_transaction.png` and `.xml`.

Authenticated non-subscriber denial passed.

- A signed-in app session without an active subscription opened `/channel-subscription/c2afa6cc-52f2-4714-b972-89863582d05a`.
- The route showed `SUBSCRIBER ACCESS REQUIRED`, `Channel subscription`, and `Subscribe`.
- The route copy kept Premium, VIP, paid videos, Watch-Party tickets, Paid Events, and other creator purchases separate.
- Supabase readback showed zero active subscription rows and zero active channel-subscription access grants for users other than subscriber `ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5`.
- Screenshot/XML: `/tmp/chillywood-channel-subscription-proof-v51-followup/01_current_user_subscriber_route.png` and `.xml`.

Provider lifecycle investigation found a real backend follow-up.

- RevenueCat customer history showed the exact sandbox subscription and later renewals for product `channel_subscription_sandbox_monthly_499:monthly`.
- RevenueCat dashboard exposed a `Refund` action for the exact sandbox entitlement, but the action returned `Refunding the transaction was unsuccessful.`
- Screenshot: `/tmp/chillywood-channel-subscription-proof-v51-followup/09_revenuecat_refund_unsuccessful.png`.
- Google Play order dashboard inspection through Chrome could not be completed safely in this environment because the Play order page repeatedly timed out during automation reads, and no local Google Play service-account order tooling was available.
- Before lifecycle handling was added, Supabase did receive provider lifecycle events for the same app user/product:
  - `RENEWAL` events were stored as `ignored`.
  - `CANCELLATION` events `31065f73-bcb7-45ee-976b-6323ef856cc0` and `50b85cc0-af9d-4214-b333-dae7952cc811` were stored as `ignored`.
  - `EXPIRATION` event `e85db1fa-deb4-40ae-8278-51aa70fbfbb6` was stored as `ignored`.
- The original subscription row still reads `active`, but `current_period_end` and the access grant `expires_at` are in the past, so resolver-style active-access checks now return zero active access.
- Cancellation/expiration/revoke delivery is provider-delivery-proven; post-fix backend handling still needs a fresh or safely replayed signed RevenueCat event.

Post-handler lifecycle proof attempt on June 13, 2026:

- Starting row: subscription `436f2acc-ec46-4977-ba51-958452ea2f2e` still had `status=active`, but `current_period_end=2026-06-13 08:21:40.039+00` and access grant `1a5492fe-c135-435e-878c-5e21a7638322` had `expires_at=2026-06-13 08:21:40.039+00`, so active-access readback returned `0` active subscription rows and `0` active access grants.
- RevenueCat customer page still showed the entitlement inactive/expired and did not expose a safe resend/retry control for the old ignored lifecycle events.
- RevenueCat event detail exposed exact Google Play order id `GPA.3353-3923-8017-31040..4` for the sandbox channel subscription cancellation.
- Google Play Console order management opened the exact sandbox order, showed product `channel_subscription_sandbox_monthly_499`, and accepted a sandbox `Refund` with `Remove entitlement` selected.
- Google Play displayed `1 order refunded`.
- Supabase polling after the Google Play refund/revoke found no new `revenuecat_google_play` provider event. The latest channel-subscription lifecycle rows remained the pre-handler ignored `RENEWAL`, `CANCELLATION`, and `EXPIRATION` rows.
- Result: provider-driven lifecycle proof remains blocked by RevenueCat/Google propagation or lack of a fresh signed webhook. No Supabase row was manually mutated, and old ignored events were not rewritten as proof.

## Lifecycle Handling

Implemented and deployed on June 13, 2026:

- `INITIAL_PURCHASE` remains the verified purchase path that creates the original channel subscription, transaction, and access grant.
- `RENEWAL` keeps the subscription active, updates provider transaction/period metadata when supplied, keeps the channel-subscription access grant active, and writes a renewal transaction/event without duplicating replayed provider events.
- `CANCELLATION` marks the subscription `cancel_pending` when RevenueCat still reports future access, keeps access only until `current_period_end`, records `canceled_at`, and writes audit/readback rows.
- `EXPIRATION` marks the subscription expired, deactivates the channel-subscription access grant, updates `channel_subscribers`, and makes the subscriber-only route block after refresh.
- `BILLING_ISSUE` moves the subscription to `grace_period` while an unexpired period exists, otherwise to `paused`, and keeps access only when the period remains valid.
- `UNCANCELLATION` and `PRODUCT_CHANGE` restore/update active subscription state when provider entitlement remains active.
- `REFUND`, `REVOCATION`, and `SUBSCRIPTION_PAUSED` mark subscription/access inactive according to provider state and keep Money Center readback separate from Premium, Tips, Paid Videos, Paid Watch-Party tickets, Paid Events, and VIP.
- `cancel_pending` is allowed by the active-subscription resolver only until the provider period expires. Premium and VIP do not bypass the creator channel subscription gate.

## Prior Blockers Closed

- v48 was abandoned for official proof because its build metadata pointed to old commit `9b2ae8e78958c3c38c08c7b3397104d2d35e1a0f`.
- v49 proved creator setup, `Subscribe` CTA, and unsubscribed direct-route gate, then exposed backend `unsupported_purchase_intent_product`.
- `20260613004804_channel_subscription_purchase_intent_allowlist.sql` fixed the purchase-intent allowlist.
- v49 then exposed RevenueCat offering-only lookup failure.
- Commit `54c9f5c11b9a67f366c97a7b8b6718fe76704f43` added direct RevenueCat subscription product lookup.
- v50/v51 still showed product unavailable until the Google Play base plan and corrected RevenueCat product/base-plan mapping were completed.
- After base plan/mapping completion and a cold app restart, v51 opened the Google Play Billing sheet and completed the sandbox subscription.

## Remaining Proof Gaps

Provider lifecycle proof:

- The lifecycle handler is implemented and deployed, but old ignored provider rows were not rewritten.
- Post-deploy Supabase readback found no fresh lifecycle event to process yet, even after a Google Play sandbox refund/revoke attempt on exact order `GPA.3353-3923-8017-31040..4`.
- A fresh or safely replayed signed RevenueCat lifecycle event must prove `RENEWAL`, `CANCELLATION`, and `EXPIRATION` are processed as handled, not ignored.
- Do not fake cancellation/expiration/revoke by manual DB mutation.

## Next Steps

- Trigger or wait for a fresh signed RevenueCat `RENEWAL`, `CANCELLATION`, and `EXPIRATION` event after the lifecycle handler deployment.
- Confirm the webhook marks those events handled, updates subscription/access-grant state, and updates Money Center readback.
- Keep live money disabled until explicit production approval.
- BrowserStack remains deferred until final full monetization regression.
