# VIP Passes V1 End-to-End Proof

Last updated: June 13, 2026

## Status

VIP Passes V1 is repo-side implemented, Supabase-applied, webhook-deployed, and Play/internal v52 creator-setup/gate-proven in sandbox mode. It is not yet sandbox purchase-proven because the Google Play / RevenueCat one-time product is not available on the device.

Live money remains disabled. VIP rows are sandbox/not-payable until a later live-money approval lane passes.

## Product Boundary

VIP V1 unlocks only creator-specific VIP status/area for one creator channel.

VIP V1 does not unlock:

- Chi'llwood Premium
- Paid Videos
- Paid Watch-Party tickets
- Paid Events
- Channel Subscriptions
- Tips
- Live Stage access
- LiveKit authority
- room permissions
- speaker, host, moderator, or co-host privileges
- payouts, cash-out, withdrawal, or transfer tools
- platform-wide badge/status
- other creators' channels

## Provider Path

- Provider: RevenueCat / Google Play sandbox-compatible digital product path.
- Product key: `vip_pass_sandbox_499`
- Provider product id: `cw_vip_pass_sandbox_499`
- Stripe Tips path: not used.
- Premium path: separate.

## Implemented Backend

Applied migration:

- `supabase/migrations/20260613104442_vip_passes_v1_sandbox.sql`
- `supabase/migrations/20260613114528_vip_pass_metadata_safe_keys.sql`

The migration adds:

- `creator_vip_pass_offers`
- `creator_vip_passes`
- `creator_vip_transactions`
- `creator_vip_events`
- VIP-safe RLS policies
- `set_creator_vip_pass_offer`
- `resolve_creator_vip_pass_access`
- `create_creator_vip_pass_purchase_intent`
- `list_my_creator_vip_pass_offers`
- `list_my_creator_vip_transactions`
- `vip_pass` purchase-intent allowlisting
- provider-grant sync from verified `access_grants.grant_type = 'vip_pass'`

`revenuecat-webhook` maps `vip_pass` products to `vip_pass` access grants and keeps Premium/platform-wide badge flags false.

Deployment readback:

- Supabase project: `bmkkhihfbmsnnmcqkoly`
- Migration status: applied remotely
- `revenuecat-webhook`: ACTIVE version 17
- Post-apply dry run before proof: remote database was up to date
- Follow-up DB-only validator fix: applied remotely after v52 creator setup exposed the over-strict VIP metadata safe-key constraint

## Play/Internal Build

Completed:

- Commit: `95c7966482f6f76637dd17a3bdf66afad2f711c6`
- EAS build id: `96a2542d-1687-4de1-8ab5-1ec22e6660fd`
- Build profile: `production`
- Platform: Android
- Artifact type: AAB / STORE
- App version: `1.0.0`
- VersionCode: `52`
- Runtime version: `1.0.0`
- Artifact URL: `https://expo.dev/artifacts/eas/vTHzejcrhGP2V_c5IwqKOAiRmPVz1TTex4FdmbZkLp4.aab`
- Play internal submission: `9cae0461-801a-4bec-b0e8-148565a5ee41`
- Device proof: `R5CR120QCBF`, package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `52`

## Implemented App Surfaces

Creator:

- Platform Studio Money Center > Ways to Earn > VIP Pass setup.
- Money Center > Offers shows VIP Pass offer rows.
- Money Center > Transactions reads verified VIP purchase rows after provider proof.

Fan:

- Creator channel VIP card.
- `/vip-pass/[creatorId]` VIP-only gate.
- CTA: `Get VIP`.

Copy states that VIP is creator-specific and does not include Premium, paid videos, Watch-Party tickets, paid events, channel subscriptions, LiveKit authority, room permissions, or other creators' channels.

## Proof Checklist

Passed:

1. Play/internal runtime installed:
   - package `com.chillywood.mobile`
   - installer `com.android.vending`
   - versionCode `52`
2. Creator setup initially exposed a DB metadata validator blocker:
   - UI showed `VIP Pass settings could not be saved right now.`
   - root cause: VIP metadata wrote explicit `livekit_authority=false`, while the VIP metadata safe constraint rejected any metadata containing `livekit`
   - fix: migration `20260613114528_vip_pass_metadata_safe_keys.sql` allows only top-level `livekit_authority=false` and still rejects secrets, tokens, authorization, publish markers, host controls, admin power, and any other LiveKit metadata text
3. Creator setup passed after the DB-only fix on the same v52 runtime:
   - UI changed to `Manage VIP Pass` / `Pause VIP Pass`
   - success copy: `VIP Pass saved in sandbox mode. Fans can get VIP only through verified Google Play / RevenueCat checkout.`
   - UI-created offer: `4769cf60-3b32-42c5-ac68-c7cc3384c0a4`
4. A second creator offer was enabled through the same RPC for fan purchase proof target:
   - creator `ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5`
   - offer `7edc7696-b371-4d76-9c07-8c160c0b82b2`
   - product `vip_pass_sandbox_499` / `cw_vip_pass_sandbox_499`
5. Fan surface passed:
   - signed-in non-owner fan opened the creator channel
   - visible `Get VIP` CTA appeared with Premium/Paid Video/Watch-Party/Event/Subscription separation copy
6. Non-VIP direct route gate passed:
   - `/vip-pass/[creatorId]` showed `VIP ACCESS REQUIRED`
   - route did not show VIP-only area before purchase
7. Provider lookup blocked before checkout:
   - tapping `Get VIP` showed `VIP Pass sandbox product is not available on this device yet.`
   - Play Console One-time products search for `cw_vip_pass_sandbox_499` returned `No results`
   - no VIP transaction row was created
   - no VIP pass row was created
   - no VIP access grant was created

Pending:

1. Create/activate Google Play one-time product `cw_vip_pass_sandbox_499`.
2. Map/import the product in RevenueCat so `readRevenueCatNonSubscriptionProducts(["cw_vip_pass_sandbox_499"])` returns a product to the Play-installed app.
3. Retry sandbox purchase on Play/internal v52 or newer.
4. VIP fan completes RevenueCat / Google Play sandbox purchase.
5. Signed provider event creates:
   - VIP transaction id: pending
   - VIP pass id: pending
   - access grant id: pending
6. VIP fan can access VIP route.
7. Second non-VIP fan remains blocked.
8. Creator Money Center Transactions shows the VIP row as sandbox/not_payable.
9. Direct client active-VIP writes are denied.
10. Refund/revoke proof runs only if safe provider tooling/order id exists; otherwise it remains deferred.

## Current Blockers

- Google Play product availability is blocked: One-time products search returned `No results` for `cw_vip_pass_sandbox_499`.
- RevenueCat product availability is blocked until the Google Play one-time product exists/imports/maps.
- Play/internal v52 is installed and valid, but checkout cannot start until product setup is complete.
- No sandbox VIP purchase has been run.
- No provider refund/revoke proof is available yet.

## BrowserStack

BrowserStack remains deferred until the final full monetization regression after all creator monetization flows have local/manual proof.
