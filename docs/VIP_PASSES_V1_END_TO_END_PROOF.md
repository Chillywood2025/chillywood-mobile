# VIP Passes V1 End-to-End Proof

Last updated: June 13, 2026

## Status

VIP Passes V1 is repo-side implemented, Supabase-applied, and webhook-deployed in sandbox mode. It is not yet Play/internal sandbox purchase-proven.

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
- Post-apply dry run: remote database is up to date

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

Pending:

1. Confirm Google Play product `cw_vip_pass_sandbox_499` exists and is available to license/internal testers.
2. Confirm RevenueCat product/key `vip_pass_sandbox_499` is available to the Android app.
3. Build and submit a Play/internal runtime from the committed VIP SHA.
4. Install/update from Google Play and confirm:
   - package `com.chillywood.mobile`
   - installer `com.android.vending`
   - versionCode includes VIP Passes V1
5. Creator enables VIP Pass in Money Center.
6. Creator reload confirms offer persists.
7. Non-VIP fan sees `Get VIP`.
8. Non-VIP fan is blocked from `/vip-pass/[creatorId]`.
9. Direct VIP route cannot bypass the gate.
10. VIP fan completes RevenueCat / Google Play sandbox purchase.
11. Signed provider event creates:
   - VIP transaction id: pending
   - VIP pass id: pending
   - access grant id: pending
12. VIP fan can access VIP route.
13. Second non-VIP fan remains blocked.
14. Creator Money Center Transactions shows the VIP row as sandbox/not_payable.
15. Direct client active-VIP writes are denied.
16. Refund/revoke proof runs only if safe provider tooling/order id exists; otherwise it remains deferred.

## Current Blockers

- Google Play / RevenueCat product availability is not yet proved.
- No Play/internal runtime containing VIP Passes V1 has been built or installed.
- No sandbox VIP purchase has been run.
- No provider refund/revoke proof is available yet.

## BrowserStack

BrowserStack remains deferred until the final full monetization regression after all creator monetization flows have local/manual proof.
