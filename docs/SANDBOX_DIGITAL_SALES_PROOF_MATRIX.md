# Sandbox Digital Sales Proof Matrix

Updated June 3, 2026.

This matrix records the current real sandbox proof state. Real sandbox sales are allowed only when produced by Google Play Billing / RevenueCat sandbox and processed through the webhook. Fake sale insertion is forbidden.

## Backend Status

| Area | Status |
| --- | --- |
| Product catalog | Remote-backed from `20260603165000_money_access_grants_product_catalog.sql`; six additional sandbox provider rows remote-applied through `20260603225500_sandbox_digital_product_mappings.sql` |
| Purchase intents | Remote-backed from `20260603190000_money_purchase_intents.sql`; sandbox-only and fail-closed |
| RevenueCat webhook | Deployed ACTIVE version `9`; Premium path preserved and dynamic purchase-intent path added |
| Typegen | `supabase/database.types.ts` refreshed after the purchase-intent migration |
| Remote dry-run | Purchase-intent post-apply dry-run was up to date; sandbox product mapping post-apply dry-run hit the known `cli_login_postgres` SASL failure after apply, with connector SQL readback used for row proof |
| Live money | Off |
| Payouts | Off |
| Stripe Android digital checkout | Absent |
| Fake sales | None inserted |
| EAS update | Production update group `9757451f-7817-488e-9b10-fff68372fefd` published `/admin-money-sandbox-purchases` for runtime `1.0.0` |
| Android route proof | `R5CR120QCBF` loaded the route from Play-installed versionCode `23`, denied non-operator access after proof-role revoke, and exposed the launcher only during a temporary operator role |
| Play item availability | Fixed for the proof device by accepting the exact internal-test opt-in link, uninstalling the EAS/internal install with `installer=null`, installing from Google Play, then updating from Play to versionCode `23` with `installer=com.android.vending` |
| Real non-Premium sandbox purchase | Creator tip `cw_creator_tip_sandbox_099` completed through Google Play test card / RevenueCat sandbox and webhook processing |

## Product Proof Matrix

| Product type | Product key | Provider product id | Purchase intent status | Real sandbox purchase | Provider event | Access grant | Ledger | Money Center | Admin drilldown | Remaining blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `premium_subscription` | `premium_subscription_monthly` | `premium_subscription` / `monthly` | Existing Premium shell path, not dynamic intent | Prior real sandbox proof passed | Prior Premium webhook proof passed; future events mirror into shared rows | Premium mirror only; `user_entitlements` remains source of truth | Sandbox/setup rows remain not payable | Premium sandbox proved / test-ready | Captured in prior Admin proof | Optional re-proof after webhook v9 |
| `paid_content_access` | `paid_content_access_sandbox_099` | `cw_paid_content_access_sandbox_099` | Ready; sandbox intent row requires a real content UUID | Not run | Not created | Not created | Not created | Setup needed until purchase proof | Provider row visible in Admin after refresh | Signed build/device purchase proof and Player resolver proof |
| `watch_party_live_ticket` | `watch_party_live_ticket_sandbox_099` | `cw_watch_party_live_ticket_sandbox_099` | Ready; sandbox intent row requires a real Watch-Party Live room UUID | Not run | Not created | Not created | Not created | Setup needed / not active until proof | Provider row visible in Admin after refresh | Real purchase proof; entry only, no publish/speaker authority |
| `live_watch_party_access_pass` | `live_watch_party_access_pass_sandbox_099` | `cw_live_watch_party_access_sandbox_099` | Ready; sandbox intent row requires a real Live Watch-Party room UUID | Not run | Not created | Not created | Not created | Setup needed / not active until proof | Provider row visible in Admin after refresh | Real purchase proof; viewer/listener access only |
| `live_watch_party_seat_pass` | `live_watch_party_seat_pass_sandbox_099` | `cw_live_watch_party_seat_sandbox_099` | Ready; sandbox intent row requires a real room UUID | Not run | Not created | Not created | Not created | Setup needed / not active until proof | Provider row visible in Admin after refresh | Real purchase proof; host approval still wins |
| `creator_tip` | `creator_tip_sandbox_099` | `cw_creator_tip_sandbox_099` | Passed: latest intent `befbf4ac-f951-4070-86c8-5361eeff99db` was consumed | Passed: Google Play test card purchase completed for `Creator tip sandbox` | Passed: RevenueCat/Google Play event `BCAEB887-0B07-4F85-82F9-D40EC59999F6` stored as `processed` / `sandbox` | Correctly none; creator tips do not grant durable content/room access | Passed: one `money_access_ledger_events` row, `environment=sandbox`, `payable_state=not_payable`, `status=sandbox_only`, amount `99` / `usd` | Sandbox only / not payable proof captured; no payable balance or cash-out | Sanitized provider/intent/ledger readback captured | Ticket/seat/content/event resolver purchase proofs still remain |
| `event_pass` | `event_pass_sandbox_099` | `cw_event_pass_sandbox_099` | Ready if a real backed event UUID exists | Not run | Not created | Not created | Not created | Setup needed | Provider row visible in Admin after refresh | Event model/resolver proof still needed |
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
- Final readback after the successful Creator tip sandbox purchase showed purchase intents `2`, pending intents `0`, failed intents `1` from the earlier item-not-found attempt, consumed intents `1`, provider_events `1`, access_grants `0`, money_access_ledger_events `1`, payable/paid money-access rows `0`, and active proof roles `0`.

## Proof Paths

- Current-main Admin visual proof: `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`
- Current product proof path: `/tmp/chillywood-revenuecat-googleplay-sandbox-product-proof-20260603/`
- Google Play item availability and real purchase proof: `/tmp/chillywood-googleplay-item-availability-real-purchase-proof-20260603/`

No screenshots from this lane were committed.
