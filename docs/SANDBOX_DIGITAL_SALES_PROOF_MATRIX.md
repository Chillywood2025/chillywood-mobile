# Sandbox Digital Sales Proof Matrix

Updated June 3, 2026.

This matrix records the current real sandbox proof state. Real sandbox sales are allowed only when produced by Google Play Billing / RevenueCat sandbox and processed through the webhook. Fake sale insertion is forbidden.

## Backend Status

| Area | Status |
| --- | --- |
| Product catalog | Remote-backed from `20260603165000_money_access_grants_product_catalog.sql`; six additional sandbox provider rows remote-applied through `20260603225500_sandbox_digital_product_mappings.sql` |
| Purchase intents | Remote-backed from `20260603190000_money_purchase_intents.sql`; sandbox-only and fail-closed |
| RevenueCat webhook | Deployed ACTIVE version `9`; Premium path preserved and dynamic purchase-intent path added |
| Resolver migration | `20260604011000_allow_sandbox_access_grants_in_resolvers.sql` lets real sandbox-only grants resolve for proof while keeping `canPublish=false` and payable money off |
| Typegen | `supabase/database.types.ts` refreshed after the purchase-intent migration |
| Remote dry-run | Purchase-intent post-apply dry-run was up to date; sandbox product mapping post-apply dry-run hit the known `cli_login_postgres` SASL failure after apply, with connector SQL readback used for row proof |
| Live money | Off |
| Payouts | Off |
| Stripe Android digital checkout | Absent |
| Fake sales | None inserted |
| EAS update | Production update group `9757451f-7817-488e-9b10-fff68372fefd` published `/admin-money-sandbox-purchases` for runtime `1.0.0` |
| Android route proof | `R5CR120QCBF` loaded the route from Play-installed versionCode `23`, denied non-operator access after proof-role revoke, and exposed the launcher only during a temporary operator role |
| Play item availability | Fixed for the proof device by accepting the exact internal-test opt-in link, uninstalling the EAS/internal install with `installer=null`, installing from Google Play, then updating from Play to versionCode `23` with `installer=com.android.vending` |
| Real non-Premium sandbox purchases | Creator tip, Watch-Party Live ticket, Live Watch-Party access pass, Live Watch-Party seat pass, and paid content access completed through Google Play test card / RevenueCat sandbox and webhook processing |

## Product Proof Matrix

| Product type | Product key | Provider product id | Purchase intent status | Real sandbox purchase | Provider event | Access grant | Ledger | Money Center | Admin drilldown | Remaining blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `premium_subscription` | `premium_subscription_monthly` | `premium_subscription` / `monthly` | Existing Premium shell path, not dynamic intent | Prior real sandbox proof passed | Prior Premium webhook proof passed; future events mirror into shared rows | Premium mirror only; `user_entitlements` remains source of truth | Sandbox/setup rows remain not payable | Premium sandbox proved / test-ready | Captured in prior Admin proof | Optional re-proof after webhook v9 |
| `paid_content_access` | `paid_content_access_sandbox_099` | `cw_paid_content_access_sandbox_099` | Passed: intent `ada7e1e6-934c-45bf-aa2c-2bd3ec359f15` consumed for real video `c1a45740-26cc-4a64-91da-caf16284fc33` | Passed: Google Play test card purchase completed for `Paid content sandbox` | Passed: sanitized sandbox RevenueCat event stored | Passed: `paid_content_access`, `environment=sandbox`, `status=sandbox_only` | Passed: sandbox-only/not-payable ledger row, amount `99` / `usd` | Creator Money Center still `Not active`; no payable balance or cash-out | Sanitized intent/grant/ledger readback captured | Player UI entry proof remains future; RPC resolver passed buyer, denied non-buyer, and policy-blocked draft content |
| `watch_party_live_ticket` | `watch_party_live_ticket_sandbox_099` | `cw_watch_party_live_ticket_sandbox_099` | Passed: intent `bb67a53a-ecd8-4185-b454-88b460328aec` consumed for proof room `9b2f4e7d-2e8e-4d2f-93ef-40b06d317001` | Passed: Google Play test card purchase completed for `Watch-Party ticket sandbox` | Passed: sanitized sandbox RevenueCat event stored | Passed: `watch_party_live_ticket`, `environment=sandbox`, `status=sandbox_only` | Passed: sandbox-only/not-payable ledger row, amount `99` / `usd` | Creator Money Center still `Not active`; no payable balance or cash-out | Sanitized intent/grant/ledger readback captured | Route UI entry remains future; RPC resolver passed buyer as viewer-only and denied non-buyer |
| `live_watch_party_access_pass` | `live_watch_party_access_pass_sandbox_099` | `cw_live_watch_party_access_sandbox_099` | Passed: intent `75abcd71-d2e1-4b59-9e8e-19e9c17299ff` consumed for proof room `9b2f4e7d-2e8e-4d2f-93ef-40b06d317002` | Passed: Google Play test card purchase completed for `Live access sandbox` | Passed: sanitized sandbox RevenueCat event stored | Passed: `live_watch_party_access_pass`, `environment=sandbox`, `status=sandbox_only` | Passed: sandbox-only/not-payable ledger row, amount `99` / `usd` | Creator Money Center still `Not active`; no payable balance or cash-out | Sanitized intent/grant/ledger readback captured | Route UI entry remains future; RPC resolver passed buyer as viewer-only and denied non-buyer |
| `live_watch_party_seat_pass` | `live_watch_party_seat_pass_sandbox_099` | `cw_live_watch_party_seat_sandbox_099` | Passed: intent `fe9bc745-8354-4950-b30e-b8c08a3e9464` consumed for proof room `9b2f4e7d-2e8e-4d2f-93ef-40b06d317003` | Passed: Google Play test card purchase completed for `Live seat sandbox` | Passed: sanitized sandbox RevenueCat event stored | Passed: `live_watch_party_seat_pass`, `environment=sandbox`, `status=sandbox_only` | Passed: sandbox-only/not-payable ledger row, amount `99` / `usd` | Creator Money Center still `Not active`; no payable balance or cash-out | Sanitized intent/grant/ledger readback captured | Route UI seat request remains future; RPC resolver passed buyer as viewer-only/approval-required and denied non-buyer |
| `creator_tip` | `creator_tip_sandbox_099` | `cw_creator_tip_sandbox_099` | Passed: latest intent `befbf4ac-f951-4070-86c8-5361eeff99db` was consumed | Passed: Google Play test card purchase completed for `Creator tip sandbox` | Passed: RevenueCat/Google Play event `BCAEB887-0B07-4F85-82F9-D40EC59999F6` stored as `processed` / `sandbox` | Correctly none; creator tips do not grant durable content/room access | Passed: one `money_access_ledger_events` row, `environment=sandbox`, `payable_state=not_payable`, `status=sandbox_only`, amount `99` / `usd` | Sandbox only / not payable proof captured; no payable balance or cash-out | Sanitized provider/intent/ledger readback captured | Ticket/seat/content/event resolver purchase proofs still remain |
| `event_pass` | `event_pass_sandbox_099` | `cw_event_pass_sandbox_099` | Ready only after a real backed event-pass resolver/source model exists | Not run by design | Not created | Not created | Not created | Setup needed | Provider row visible in Admin after refresh | Event pass remains setup-only because no backed event-pass resolver model is wired |
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
- Final readback after Creator tip plus access-product proof showed purchase intents `6`, pending intents `0`, failed intents `1` from the earlier item-not-found attempt, consumed intents `5`, provider_events `5`, access_grants `4`, money_access_ledger_events `5`, payable/paid money-access rows `0`, and active proof roles `0`.
- Ticket, Live Watch-Party access, and Live Watch-Party seat resolver RPCs return buyer `allowed=true`, `viewerOnly=true`, `speakerApprovalRequired=true`, and `canPublish=false`; non-buyers return `allowed=false`.
- Paid content resolver RPC returns buyer `allowed=true` through `sandbox_grant`, a non-buyer `allowed=false`, and draft content `allowed=false` before grant checks.

## Proof Paths

- Current-main Admin visual proof: `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`
- Current product proof path: `/tmp/chillywood-revenuecat-googleplay-sandbox-product-proof-20260603/`
- Google Play item availability and real purchase proof: `/tmp/chillywood-googleplay-item-availability-real-purchase-proof-20260603/`
- Real sandbox access-product proof: `/tmp/chillywood-real-sandbox-access-products-proof-20260603/`

No screenshots from this lane were committed.
