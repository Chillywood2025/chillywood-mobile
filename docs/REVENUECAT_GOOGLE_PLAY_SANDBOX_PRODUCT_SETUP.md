# RevenueCat Google Play Sandbox Product Setup

Updated June 3, 2026.

This is the external setup checklist for Chi'llwood Android digital sandbox products. It does not activate production money, payouts, public buy buttons, Stripe Android digital checkout, fake balances, or fake sales.

## Current Outcome

Backend readiness is in place:

- Remote migration `20260603190000_money_purchase_intents.sql` is applied.
- `supabase db push --dry-run` reports the remote database is up to date after apply.
- `supabase/database.types.ts` was refreshed with `supabase gen types typescript --linked > supabase/database.types.ts`.
- `revenuecat-webhook` is deployed as ACTIVE version `9`.
- Dynamic non-Premium RevenueCat events now require a matching pending `money_purchase_intents` row before they can create access grants or sandbox ledger rows.
- Missing, expired, consumed, mismatched, setup, or production dynamic events are recorded/ignored safely and do not grant access.

External provider product setup is no longer the blocker for the six first-pass sandbox products. Google Play and RevenueCat products exist. EAS production update group `9757451f-7817-488e-9b10-fff68372fefd` published `/admin-money-sandbox-purchases`, and `R5CR120QCBF` loaded the route after an OTA restart. The route denied a non-operator proof session, then exposed the sandbox-only/not-payable launcher only while the proof account had a temporary operator role. A real Creator tip attempt created one sandbox purchase intent for `cw_creator_tip_sandbox_099`, but Google Play returned `The item you were attempting to purchase could not be found`; the intent was marked `failed` and unconsumed. Final readback showed pending intents `0`, provider events `0`, access grants `0`, money-access ledger events `0`, payable/paid money-access rows `0`, and active proof roles `0`. The remaining blocker is Google Play item availability for the signed/tester install before completed non-Premium sandbox purchases can be proved. No fake provider event, fake sale row, fake access grant, fake ledger row, fake balance, payout, or cash-out was inserted.

## Product Setup Matrix

| Product type | Proposed provider product id | Google Play product exists | Google Play product type | Google Play status | RevenueCat product imported | Offering/package exists | Entitlement attached | Webhook configured | Sandbox testable today | Blocker | Owner action required |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `premium_subscription` | Existing `premium_subscription` / base plan `monthly` | Yes, previously dashboard-proved | Subscription | Sandbox-proved for licensed tester path | Yes | Existing Premium offering | `premium` | Yes | Already proved; re-proof optional | Purchase shell remains closed by default | Keep existing mapping; do not rename |
| `paid_content_access` | `cw_paid_content_access_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the new direct product proof route | None; access comes from Chi'llwood intent/grant | Webhook endpoint exists | Ready for signed-build proof | Needs real purchase and Player resolver proof | Use `/admin-money-sandbox-purchases` with a real content UUID |
| `watch_party_live_ticket` | `cw_watch_party_live_ticket_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the new direct product proof route | None; ticket comes from Chi'llwood intent/grant | Webhook endpoint exists | Ready for signed-build proof | Needs real purchase and ticket resolver proof | Use a real Watch-Party Live room UUID and prove viewing only |
| `live_watch_party_access_pass` | `cw_live_watch_party_access_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the new direct product proof route | None | Webhook endpoint exists | Ready for signed-build proof | Needs real purchase and room resolver proof | Use a real Live Watch-Party room UUID and prove viewer/listener only |
| `live_watch_party_seat_pass` | `cw_live_watch_party_seat_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the new direct product proof route | None | Webhook endpoint exists | Ready for signed-build proof | Needs real purchase and host-approval proof | Use a real room UUID and prove seat eligibility only |
| `creator_tip` | `cw_creator_tip_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store consumable | Not needed for the new direct product proof route | None; ledger only unless a `creator_tip_record` readout is intentionally added | Webhook endpoint exists | Blocked at Google Play purchase dialog | Real attempt returned item-not-found; one intent marked failed/unconsumed | Resolve item availability for signed/tester install, then prove sandbox ledger stays `not_payable` and no payout appears |
| `event_pass` | `cw_event_pass_sandbox_099` | Yes | One-time product with purchase option `sandbox-099` | Active | Yes, published Play Store product | Not needed for the new direct product proof route | None | Webhook endpoint exists | Ready for signed-build proof if event model/source exists | Event resolver/model proof still needed | Use only a real backed event UUID; otherwise keep setup-only |
| `merch_physical_good` | None for Android digital | Not applicable | Physical goods are outside Play Billing digital access | Planned only | Not applicable | Not applicable | None | Not applicable | No | Physical merch provider lane later | Keep merch separate; do not grant Android digital access from merch |

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

Proof artifacts should go under `/tmp/chillywood-revenuecat-googleplay-sandbox-product-proof-20260603/` and remain uncommitted unless a future repo convention explicitly requires otherwise.
