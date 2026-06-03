# Sandbox Digital Sales Proof Matrix

Updated June 3, 2026.

This matrix records the current real sandbox proof state. Real sandbox sales are allowed only when produced by Google Play Billing / RevenueCat sandbox and processed through the webhook. Fake sale insertion is forbidden.

## Backend Status

| Area | Status |
| --- | --- |
| Product catalog | Remote-backed from `20260603165000_money_access_grants_product_catalog.sql`; 8 setup/sandbox product rows documented |
| Purchase intents | Remote-backed from `20260603190000_money_purchase_intents.sql`; sandbox-only and fail-closed |
| RevenueCat webhook | Deployed ACTIVE version `9`; Premium path preserved and dynamic purchase-intent path added |
| Typegen | `supabase/database.types.ts` refreshed after the purchase-intent migration |
| Remote dry-run | Post-apply `supabase db push --dry-run` reports the remote database is up to date |
| Live money | Off |
| Payouts | Off |
| Stripe Android digital checkout | Absent |
| Fake sales | None inserted |

## Product Proof Matrix

| Product type | Product key | Provider product id | Purchase intent status | Real sandbox purchase | Provider event | Access grant | Ledger | Money Center | Admin drilldown | Remaining blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `premium_subscription` | `premium_subscription_monthly` | `premium_subscription` / `monthly` | Existing Premium shell path, not dynamic intent | Prior real sandbox proof passed | Prior Premium webhook proof passed; future events mirror into shared rows | Premium mirror only; `user_entitlements` remains source of truth | Sandbox/setup rows remain not payable | Premium sandbox proved / test-ready | Captured in prior Admin proof | Optional re-proof after webhook v9 |
| `paid_content_access` | `paid_content_access_setup` | Missing | Blocked until sandbox catalog mapping exists and `sandbox_purchase_intents_enabled=true` | Not run | Not created | Not created | Not created | Setup needed | Setup-only | Create Play/RevenueCat product and backed Player purchase source validation |
| `watch_party_live_ticket` | `watch_party_live_ticket_setup` | Missing | Blocked | Not run | Not created | Not created | Not created | Setup needed / not active | Setup-only | Create product and prove ticket entry only, no publish/speaker authority |
| `live_watch_party_access_pass` | `live_watch_party_access_pass_setup` | Missing | Blocked | Not run | Not created | Not created | Not created | Setup needed / not active | Setup-only | Create product and prove viewer/listener access only |
| `live_watch_party_seat_pass` | `live_watch_party_seat_pass_setup` | Missing | Blocked | Not run | Not created | Not created | Not created | Setup needed / not active | Setup-only | Create product and prove host approval still wins |
| `creator_tip` | `creator_tip_setup` | Missing | Blocked | Not run | Not created | No durable access grant expected | Not created | Setup needed / no verified earnings | Setup-only | Create consumable product and prove not-payable sandbox ledger |
| `event_pass` | `event_pass_setup` | Missing | Blocked | Not run | Not created | Not created | Not created | Setup needed | Setup-only | Define event model and provider mapping |
| `merch_physical_good` | `merch_physical_good_setup` | None | Not part of Android digital intents | Not applicable | Not applicable | None | None | Physical goods separate / planned | Merch readiness only | Future physical merch provider lane |

## Safety Proof

- `money_purchase_intents` cannot be production environment rows.
- Direct merch digital intents are blocked by table constraint and RPC checks.
- `create_money_purchase_intent` rejects setup/disabled/retired/production products.
- `create_money_purchase_intent` rejects Android digital products that are not RevenueCat/Google Play.
- `create_money_purchase_intent` rejects products without a provider product id.
- `create_money_purchase_intent` rejects products without explicit `sandbox_purchase_intents_enabled=true`.
- Webhook dynamic events without a valid pending intent are ignored without access grants.
- Duplicate provider events do not reuse consumed intents.
- Sandbox ledger rows are `not_payable`.
- Payment/access records do not grant LiveKit publish, host, speaker, mod/admin, payout, or safety bypass authority.

## Proof Paths

- Current-main Admin visual proof: `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`
- Next real product proof path: `/tmp/chillywood-revenuecat-googleplay-sandbox-product-proof-20260603/`

No screenshots from this lane were committed.
