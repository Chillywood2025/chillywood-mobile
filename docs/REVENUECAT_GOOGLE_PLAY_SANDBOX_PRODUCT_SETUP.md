# RevenueCat Google Play Sandbox Product Setup

Updated June 4, 2026.

This is the external setup checklist for Chi'llwood Android digital sandbox products. It does not activate production money, payouts, public buy buttons, Stripe Android digital checkout, fake balances, or fake sales.

Public V1 RC sweep: `docs/PUBLIC_V1_MONEY_PROOF_RC_SWEEP.md` confirms the sandbox product setup stayed review-ready with no production money, no public buy buttons, no payable sandbox/setup rows, and no active proof roles.

Canonical final money truth: `docs/MONETIZATION_STACK_FINAL_TRUTH.md`. This document covers the Android digital rail only. Stripe physical merch sandbox checkout and Stripe Connect payout readiness are proved separately and do not create RevenueCat products, Premium entitlements, or Android digital access.

Internal tester update: `docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md` opens approved tester-only sandbox purchase surfaces. Public/default users still see Premium and digital purchases closed; approved testers can load Google Play / RevenueCat sandbox purchase surfaces when they are signed in, Play-installed/internal-track eligible, and provider products are available. This does not make any digital product production-live or payable.

## Current Outcome

Backend readiness is in place:

- Remote migration `20260603190000_money_purchase_intents.sql` is applied.
- `supabase db push --dry-run` reports the remote database is up to date after apply.
- `supabase/database.types.ts` was refreshed with `supabase gen types typescript --linked > supabase/database.types.ts`.
- `revenuecat-webhook` is deployed as ACTIVE version `9`.
- Dynamic non-Premium RevenueCat events now require a matching pending `money_purchase_intents` row before they can create access grants or sandbox ledger rows.
- Missing, expired, consumed, mismatched, setup, or production dynamic events are recorded/ignored safely and do not grant access.

External provider product setup is no longer the blocker for the six first-pass sandbox products. Google Play and RevenueCat products exist. EAS production update group `9757451f-7817-488e-9b10-fff68372fefd` published `/admin-money-sandbox-purchases`, and `R5CR120QCBF` loaded the route after an OTA restart. The initial Creator tip attempt created one sandbox purchase intent for `cw_creator_tip_sandbox_099`, but Google Play returned `The item you were attempting to purchase could not be found`; the intent was marked `failed` and unconsumed.

The item-availability root cause was the installed app source/current-build mismatch. The proof device account was a tester only through the exact internal-test join link; the generic package opt-in URL first showed app unavailable. After the exact internal-test link was accepted, the device still had an EAS/internal install with `installer=null`, so Play Billing could not reliably associate the installed app with the Play test-track product catalog. The fix was to uninstall that package, install from Google Play internal testing, then update from Play to EAS/Play versionCode `23` built from commit `8219c23` (`766b8015-cb3a-43ba-910d-fa442a45e9be`). Device readback then showed `installer=com.android.vending`, `versionCode=23`, `versionName=1.0.0`, and Billing permission granted.

After that fix, Creator tip completed a real Google Play sandbox purchase with `Test card, always approves` and `This is a test order, you will not be charged.` RevenueCat delivered a sandbox `NON_RENEWING_PURCHASE` event, Chi'llwood stored provider event `BCAEB887-0B07-4F85-82F9-D40EC59999F6`, consumed purchase intent `befbf4ac-f951-4070-86c8-5361eeff99db`, and wrote one sandbox-only ledger row with `payable_state=not_payable`. It created no access grant, which is correct for a creator tip. Final readback showed purchase intents `2`, pending intents `0`, failed intents `1`, consumed intents `1`, provider events `1`, access grants `0`, money-access ledger events `1`, payable/paid money-access rows `0`, and active proof roles `0`. No fake provider event, fake sale row, fake access grant, fake ledger row, fake balance, payout, or cash-out was inserted.

The follow-up access-product proof used the same Play-installed versionCode `23` path. Real Google Play sandbox purchases completed for `cw_watch_party_live_ticket_sandbox_099`, `cw_live_watch_party_access_sandbox_099`, `cw_live_watch_party_seat_sandbox_099`, and `cw_paid_content_access_sandbox_099`. RevenueCat webhook processing consumed the matching intents, created four `sandbox_only` access grants, and wrote four additional sandbox-only ledger rows with `payable_state=not_payable`. Final readback showed provider events `5`, purchase intents `6`, consumed intents `5`, access grants `4`, money-access ledger events `5`, payable/paid rows `0`, and active proof roles `0`.

The June 4 failure-path lane added event-pass backing through `creator_events` and `has_event_pass_access`, then completed `cw_event_pass_sandbox_099` through a real Google Play test-card / RevenueCat sandbox purchase. EAS Update group `581630d7-b67f-4159-99e0-43f76a5e1221` updated the owner/operator sandbox route default for the proof event source. Final readback after event pass, admin revoke, and expired-intent proof showed provider events `6`, purchase intents `8`, consumed intents `6`, failed intents `1`, expired intents `1`, access grants `5`, money-access ledger events `7`, payable/paid rows `0`, and active proof roles `0`.

## Product Setup Matrix

| Product type | Proposed provider product id | Google Play product exists | Google Play product type | Google Play status | RevenueCat product imported | Offering/package exists | Entitlement attached | Webhook configured | Sandbox testable today | Blocker | Owner action required |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `premium_subscription` | Existing `premium_subscription` / base plan `monthly` | Yes, previously dashboard-proved | Subscription | Sandbox-proved for licensed tester path | Yes | Existing Premium offering | `premium` | Yes | Already proved; approved tester sandbox mode can re-proof | Public purchase shell remains closed by default | Keep existing mapping; do not rename |
| `paid_content_access` | `cw_paid_content_access_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the direct proof route | None; access comes from Chi'llwood intent/grant | Webhook endpoint exists | Passed on Play-installed versionCode `23` | Player UI polish remains future; RPC resolver proof passed | Keep sandbox-only; no production buy button |
| `watch_party_live_ticket` | `cw_watch_party_live_ticket_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the direct proof route | None; ticket comes from Chi'llwood intent/grant | Webhook endpoint exists | Passed on Play-installed versionCode `23` | Route UI entry polish remains future; RPC resolver proof passed | Keep entry/viewing only and host approval unchanged |
| `live_watch_party_access_pass` | `cw_live_watch_party_access_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the direct proof route | None | Webhook endpoint exists | Passed on Play-installed versionCode `23` | Route UI entry polish remains future; RPC resolver proof passed | Keep viewer/listener only; no host/speaker/mod/admin grant |
| `live_watch_party_seat_pass` | `cw_live_watch_party_seat_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the direct proof route | None | Webhook endpoint exists | Passed on Play-installed versionCode `23` | Route UI seat request polish remains future; RPC resolver proof passed | Keep seat eligibility only and host approval required |
| `creator_tip` | `cw_creator_tip_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store consumable | Not needed for the new direct product proof route | None; ledger only unless a `creator_tip_record` readout is intentionally added | Webhook endpoint exists | Passed on Play-installed versionCode `23` | None for first creator-tip proof; repeat/idempotency/refund remain follow-up | Keep no entitlement; prove additional products separately |
| `event_pass` | `cw_event_pass_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the new direct product proof route | None | Webhook endpoint exists | Passed on Play-installed versionCode `23` after route OTA update | Provider refund/revoke and delayed pending proof remain tooling follow-up | Use only a real backed event UUID; no production event-pass activation |
| `merch_physical_good` | None for Android digital | Not applicable | Physical goods are outside Play Billing digital access | Stripe sandbox checkout proved separately | Not applicable | Not applicable | None | Not applicable | Not an Android digital product | Production merch approval/fulfillment/refund/support/Data Safety remain future | Keep merch separate; do not grant Android digital access from merch |

## Google Play Steps

For package `com.chillywood.mobile`:

1. Confirm the tester account is a Google Play license tester and opted into the internal/closed test track.
2. Confirm the test device uses the licensed Google account and can install the current signed build from Google Play or an approved internal distribution path.
3. Create the missing product IDs exactly as listed above unless the project owner chooses an existing naming convention.
4. Choose repeatable/consumable configuration for tickets, seats, passes, and tips when repeated sandbox tests are needed.
5. Make products available to the internal/closed test release and tester country/region.
6. During proof, the Play purchase dialog must show a test purchase/test card notice, not a real charge.

## RevenueCat Steps

1. Confirm the Android app is configured for `com.chillywood.mobile`.
2. Import each Google Play product using the exact product ID.
3. Attach products to the offering/package names the app will fetch for sandbox test launchers.
4. Keep Premium attached to entitlement `premium`.
5. Do not attach tips to a permanent entitlement.
6. For tickets, seats, paid content, access passes, and event passes, use Chi'llwood purchase intents and access grants as the source of target binding.
7. Confirm the webhook endpoint and authorization header are configured.
8. Confirm sandbox RevenueCat events appear in RevenueCat before claiming app/backend proof.

## Chi'llwood Catalog Steps

After external setup is verified, update the matching `monetization_products` row or add a new sandbox row:

- `provider='revenuecat_google_play'`
- exact `provider_product_id`
- `environment='sandbox'`
- `status='sandbox'`
- `is_android_digital=true`
- `is_physical_good=false`
- sanitized metadata including `sandbox_purchase_intents_enabled=true` only after source policy validation is backed for that product

Do not set any non-Premium product to production `active` in this lane.

## Proof Checklist

For each mapped product:

1. Create a short-lived purchase intent with `create_money_purchase_intent`.
2. Launch the RevenueCat / Google Play sandbox purchase for the mapped product.
3. Confirm RevenueCat receives the sandbox event.
4. Confirm the Chi'llwood webhook creates or updates a sanitized `provider_events` row.
5. Confirm access products create `access_grants` for the intended source only.
6. Confirm `money_access_ledger_events.environment='sandbox'`.
7. Confirm `money_access_ledger_events.payable_state='not_payable'`.
8. Confirm Creator Money Center says `Sandbox only` / `Not payable`.
9. Confirm Owner/Admin drilldown is sanitized.
10. Confirm no payout, cash-out, fake balance, LiveKit publish permission, host power, speaker authority, mod/admin power, or safety bypass appears.

Proof artifacts should go under the lane-specific `/tmp` proof paths listed in `docs/MONEY_CENTER_LAUNCH_REVIEW_PACKET.md` and remain uncommitted unless a future repo convention explicitly requires otherwise.
