# VIP Passes V1 End-to-End Proof

Last updated: June 13, 2026

## Status

VIP Passes V1 is repo-side implemented, Supabase-applied, webhook-deployed, and Play/internal v52 sandbox-proven for provider setup, purchase, verified VIP pass/access creation, VIP route access, second non-VIP denial, and Money Center readback.

Live money remains disabled. VIP rows are sandbox/not-payable until a later live-money approval lane passes.

## Product Boundary

VIP V1 unlocks only creator-specific VIP status/area for one creator channel.

VIP V1 does not unlock:

- Chi'llywood Premium
- Paid Videos
- Paid Watch-Party Seat Passes
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
- Google Play setup: one-time product `cw_vip_pass_sandbox_499`, purchase option `vip-pass-sandbox`, active, USD 4.99 base price.
- RevenueCat setup: Play Store non-consumable product `cw_vip_pass_sandbox_499`, store status `Published`; not attached to Premium entitlement or a Premium offering.
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

Copy states that VIP is creator-specific and does not include Premium, paid videos, Watch-Party Seat Passes, paid events, channel subscriptions, LiveKit authority, room permissions, or other creators' channels.

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
7. Provider lookup initially blocked before checkout:
   - tapping `Get VIP` showed `VIP Pass sandbox product is not available on this device yet.`
   - Play Console One-time products search for `cw_vip_pass_sandbox_499` returned `No results`
   - no VIP transaction row was created
   - no VIP pass row was created
   - no VIP access grant was created
8. Provider setup passed:
   - Google Play one-time product `cw_vip_pass_sandbox_499` was created and activated.
   - purchase option `vip-pass-sandbox` is active.
   - RevenueCat product `cw_vip_pass_sandbox_499` is published as a Play Store non-consumable.
   - product is not attached to Premium entitlement.
9. Product availability passed on the same v52 Play/internal runtime after app restart:
   - tapping `Get VIP` opened the Google Play test purchase sheet.
   - sheet showed `Chi'llywood VIP Pass Sandbox`, `$4.99`, and `Test card, always approves`.
10. Sandbox purchase passed:
   - VIP fan tester: `tips_fan_test` / `c2afa6cc-52f2-4714-b972-89863582d05a`
   - creator: `tips_creator_test` / `ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5`
   - offer: `7edc7696-b371-4d76-9c07-8c160c0b82b2`
   - provider event id: `1e81db62-4b17-45b1-8369-004302d41108`
   - provider transaction id: `73EFF539-6E60-4CAA-8A87-1395E35992B6`
   - transaction id: `829f230f-7734-4fad-a88b-bd674c1daa8e`
   - VIP pass id: `b19d3a26-1431-4033-bf70-5f3e5311e719`
   - access grant id: `3b051689-7879-4e39-9712-efab1d1d783c`
   - transaction status: `paid`
   - payout status: `not_payable`
   - access grant status: `sandbox_only`
11. VIP fan access passed:
   - `/vip-pass/ee44e7aa-a9f7-40d0-baa6-45697f2b1cc5` showed `VIP` / `VIP is active for this creator channel only`.
   - copy confirmed VIP does not unlock Premium, paid videos, Watch-Party Seat Passes, paid events, channel subscriptions, LiveKit authority, room permissions, payouts, or other creators' channels.
12. Separation readback passed for the proof window:
   - Tips created: `0`
   - Paid Video grants created: `0`
   - Paid Watch-Party Seat Passes created: `0`
   - Paid Event passes created: `0`
   - Channel Subscription rows created: `0`
   - Premium/user entitlement rows created or updated by the VIP purchase: `0`
   - VIP grants created: `1`
13. Second authenticated non-VIP denial passed:
   - fresh proof tester `vip-non-vip-20260613@chillywood.test` / `d860574d-38a0-4452-a1e4-2d01b97bd397` was created with local-only ignored credentials.
   - `/vip-pass/[creatorId]` showed `VIP ACCESS REQUIRED`, `VIP Pass`, and `Get VIP`.
   - Supabase readback showed zero active VIP passes and zero active VIP access grants for that fan/creator.
14. Creator Money Center readback passed:
   - a short-lived `test_grant` Premium entitlement was added only to open the existing Platform Studio gate for creator readback, then revoked after capture.
   - Money Center > Transactions > VIP showed `$4.99 VIP pass`, `Paid`, `VIP Pass · 6/13/2026, 9:46:06 AM · Sandbox`, and `Payout status: not_payable`.
   - Money Center copy kept VIP separate from Premium, Tips, Paid Videos, Watch-Party Seat Passes, Paid Events, Channel Subscriptions, LiveKit authority, and room permissions.

Proof files:

- `/tmp/chillywood-vip-v1-proof-20260613/second-non-vip-denial.png`
- `/tmp/chillywood-vip-v1-proof-20260613/fresh-second-non-vip-denial.png`
- `/tmp/chillywood-vip-v1-proof-20260613/money-center-vip-filter.png`

## Current Blockers

- Provider refund/revoke proof is deferred. The verified provider event exposes the RevenueCat transaction id, but no safe Google Play order id was available in Supabase readback for a targeted provider refund/revoke. Do not fake refund/revoke by manual DB mutation.
- Direct client active-VIP write-denial remains a follow-up hardening proof if required; access and transaction creation were provider/webhook-created in this proof.

## BrowserStack

BrowserStack remains deferred until the final full monetization regression after all creator monetization flows have local/manual proof.
