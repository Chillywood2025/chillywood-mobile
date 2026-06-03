# Money Access Grants Product Catalog

Updated June 3, 2026.

Chi'llwood now has an additive money-access readiness architecture:

RevenueCat / Google Play event -> `provider_events` -> `monetization_products` -> `access_grants` -> content/room resolver RPCs -> `money_access_ledger_events` -> Money Center readout.

This is not live-money activation. `live_money_enabled`, payouts, tips, paid content, Watch-Party tickets, Live Watch-Party access passes, Live Watch-Party seat passes, and merch checkout remain off/setup-only.

Remote proof status on June 3, 2026:

- `supabase db lint --local` passed with no schema errors.
- `supabase db push --dry-run` showed only `20260603165000_money_access_grants_product_catalog.sql` pending before apply.
- `supabase db push` applied the migration, and a post-apply dry-run reported the remote database up to date.
- `supabase gen types typescript --linked > supabase/database.types.ts` refreshed generated types.
- `supabase migration list` remains unavailable in this shell because the linked CLI login role hits the known SASL authentication failure; no password or secret was printed.
- Android remote proof path is `/tmp/chillywood-money-access-grants-remote-proof-20260603/`. Signed-in proof path is `/tmp/chillywood-money-center-signed-in-proof-20260603/`. `R5CR120QCBF` has a Play/EAS-signed `com.chillywood.mobile` versionCode `21`; replacing it with the local current-source APK failed with signature mismatch. A temporary audited operator upgrade on the proof account captured Creator Money Center readiness and not-payable states, then the grant was revoked and post-revoke Admin denial was captured. Android EAS update group `5008f2c5-e002-40bd-8f6e-fcd1fa95e633` was published from current `main`, but this installed v21 client still did not pick up the current Admin Money Center JS, so Owner/Admin Product Catalog / Provider Events / Access Grants / Ledger screenshots remain a follow-up until a fresh Play/EAS-signed build or explicit local replacement path is available.
- Real sandbox digital-sales preflight path is `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`. `revenuecat-webhook` is deployed ACTIVE version `8` from commit `4c3633e` and now mirrors real RevenueCat Premium events into `provider_events`, `access_grants`, and `money_access_ledger_events` with sanitized metadata, idempotency, and not-payable sandbox/setup states. No fake provider event, access grant, or ledger row was inserted. Android EAS Update `c0bb32bb-3c7e-406e-a619-2e3e0eb536ed` did not make installed Play/EAS v21 load current Admin money visuals. EAS internal APK build `cc88ce26-6e94-4adb-9768-d0483c12505a` for versionCode `22`, versionName `1.0.0`, runtime `1.0.0`, commit `4c3633e`, finished; the APK artifact was downloaded to `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/chillywood-v22-eas-production-apk.apk` with SHA-256 `c8f2e830bdebc361b4cc8441f57d8c43ef358d0dd11b025e47bf6e58da1c9317`. Installing over Play/EAS v21 failed with signature mismatch, so v21 was explicitly uninstalled and the EAS v22 APK installed for current-main proof. The upgraded proof account captured Admin Money Center Product Catalog, Shared Access Grants, Provider Rows, Money Audit Explorer metrics, setup/sandbox/not-payable rows, and a sanitized Money Event Detail sheet; the temporary owner/operator proof roles were revoked afterward.
- RevenueCat/Google Play sandbox product mapping update: migration `20260603190000_money_purchase_intents.sql` is remote-applied, post-apply dry-run is up to date, `supabase/database.types.ts` is refreshed, and `revenuecat-webhook` is deployed ACTIVE version `9`. Dynamic products now require a pending purchase intent before RevenueCat sandbox events can create access grants or sandbox ledger rows. Missing, expired, consumed, mismatched, setup, or production dynamic events are sanitized/ignored and do not grant access. External Google Play/RevenueCat product setup remains missing for paid content, Watch-Party ticket, Live Watch-Party access, Live Watch-Party seat, creator tip, and event pass, so no new non-Premium sandbox purchase was run and no fake sale/provider/ledger row was inserted. Exact setup and proof matrices are in `docs/REVENUECAT_GOOGLE_PLAY_SANDBOX_PRODUCT_SETUP.md` and `docs/SANDBOX_DIGITAL_SALES_PROOF_MATRIX.md`.

## Product Catalog

`monetization_products` is the shared sellable product map. It supports:

- product types: `premium_subscription`, `paid_content_access`, `watch_party_live_ticket`, `live_watch_party_access_pass`, `live_watch_party_seat_pass`, `creator_tip`, `merch_physical_good`, and `event_pass`
- statuses: `setup`, `sandbox`, `active`, `disabled`, `retired`
- environments: `setup`, `sandbox`, `production`
- provider mapping fields for RevenueCat, Google Play, and future physical merch providers
- safe metadata checks that block secret-like/provider-private data

Android digital products must use RevenueCat / Google Play. Physical merch uses `merch_provider_later`, Shopify, or Stripe physical-goods readiness later and cannot create digital access grants.

Seeded catalog status:

- Premium: `sandbox`, RevenueCat/Google Play, `premium_subscription`, entitlement `premium`, sandbox proved, purchase shell closed by default.
- Paid content: `setup`, no active buy button.
- Watch-Party Live ticket: `setup`, viewing entry only, no speaker/publish authority.
- Live Watch-Party access pass: `setup`, viewer entry only.
- Live Watch-Party seat pass: `setup`, seat eligibility only; host approval and LiveKit token rules still win.
- Creator tip: `setup`, no active tip button, not payable.
- Merch physical good: `setup`, physical goods only, no digital entitlement.
- Event pass: `setup`, future digital event access placeholder.

Current sandbox proof matrix:

| Product type | Product key | Provider mapping | Switch state | Sandbox proof status | Blocker |
| --- | --- | --- | --- | --- | --- |
| `premium_subscription` | `premium_subscription_monthly` | RevenueCat/Google Play `premium_subscription`, base plan `monthly`, entitlement `premium` | RevenueCat/provider readiness `sandbox_only`; Premium shell closed by source default | Prior real Premium sandbox purchase/webhook/user_entitlements proof stands. Webhook v8 can mirror the next real Premium provider event into product/access/ledger rows. | Needs a fresh real RevenueCat/Google Play sandbox event after webhook v8 for full shared-table proof. |
| `paid_content_access` | `paid_content_access_setup` | Missing `provider_product_id` and entitlement/offering mapping | `off` | Not testable. Setup-only/no buy button remains honest. | Create RevenueCat/Google Play product, map catalog row, add Player purchase UI only under sandbox guard. |
| `watch_party_live_ticket` | `watch_party_live_ticket_setup` | Missing `provider_product_id` and entitlement/offering mapping | `off` | Not testable. Setup-only/no buy button remains honest. | Create RevenueCat/Google Play ticket product and webhook mapping; prove entry-only resolver. |
| `live_watch_party_access_pass` | `live_watch_party_access_pass_setup` | Missing `provider_product_id` and entitlement/offering mapping | `off` | Not testable. Setup-only/no buy button remains honest. | Create RevenueCat/Google Play access-pass product and resolver proof. |
| `live_watch_party_seat_pass` | `live_watch_party_seat_pass_setup` | Missing `provider_product_id` and entitlement/offering mapping | `off` | Not testable. Setup-only/no buy button remains honest. | Create RevenueCat/Google Play seat-pass product; prove host approval and LiveKit publish still win. |
| `creator_tip` | `creator_tip_setup` | Missing `provider_product_id` and entitlement/offering mapping | `off` | Not testable. Setup-only/no tip button remains honest. | Create RevenueCat/Google Play tip product; prove sandbox ledger stays not payable and no payout appears. |
| `event_pass` | `event_pass_setup` | Missing `provider_product_id` and entitlement/offering mapping | no active UI | Not testable. Setup-only placeholder. | Define event-pass policy and provider mapping before sale proof. |
| `merch_physical_good` | `merch_physical_good_setup` | Physical merch provider later; no Android digital mapping | `off` | Not in Android digital sale scope. | Add physical merch provider later; pure merch must not create digital access. |

## Purchase Intents

`money_purchase_intents` is the dynamic binding layer for generic RevenueCat/Google Play sandbox products. It records the signed-in user, catalog product, provider product id, source type/source id, creator/platform target where applicable, sandbox environment, pending/consumed/expired state, idempotency key, and 15-minute expiry.

Normal users cannot directly insert or update rows. The safe RPC `create_money_purchase_intent(product_key, source_type, source_id, metadata)` rejects production, merch, Premium, disabled/retired products, setup products, products without provider product ids, products outside RevenueCat/Google Play for Android digital goods, and products that have not explicitly opted into `sandbox_purchase_intents_enabled=true`. The webhook consumes only pending, unexpired matching intents. A consumed or expired intent cannot be reused to grant access.

Admin/operator read RPCs expose sanitized intent status for inspection. They do not expose provider secrets or raw provider payloads, and they do not create payable ledger state.

## Access Grants

`access_grants` records user access by grant type and source. Normal users cannot write grants. Provider/webhook/admin paths are required. Active production grants require a provider event. Setup and sandbox grants are labeled `setup_only` or `sandbox_only`.

Access grant statuses are `active`, `pending`, `expired`, `revoked`, `refunded`, `blocked`, `sandbox_only`, and `setup_only`.

Access grants never grant:

- LiveKit publish permission
- host, cohost, moderator, speaker, or admin authority
- payout access
- fake creator balance
- bypass over private/blocked/moderated/deleted/malware content
- bypass over Premium gates where Premium is required

Premium remains sourced from `user_entitlements`; the shared grant system may mirror Premium later but does not replace the proved entitlement guard.

## Provider Events And Ledger

`provider_events` stores sanitized provider event identity, product mapping, status, idempotency, and payload hash. Raw private provider payloads and secrets are not exposed to clients.

`money_access_ledger_events` records setup/sandbox/production money-access events. Setup and sandbox rows are `not_payable`. `payable` and `paid` are allowed only for production rows with provider-event and payout-readiness proof.

Refunds, reversals, chargebacks, revokes, and expirations are represented as grant/ledger states. Historical access can remain auditable while content or room playback is blocked.

## Resolver RPCs

Read-only resolver helpers were added:

- `has_premium_access(user_id)`
- `has_paid_content_access(user_id, content_id)`
- `has_watch_party_live_ticket(user_id, party_id)`
- `has_live_watch_party_access(user_id, party_id)`
- `has_live_watch_party_seat_eligibility(user_id, party_id)`
- `resolve_money_access_room_entry(user_id, party_id, required_grant_type)`

Room entry results are viewer-only for paid access grants and return `canPublish=false`. Host approval and the existing LiveKit token issuer remain authoritative.

## Money Center

Creator Money Center remains compact and honest:

- Premium: sandbox proved / test-ready, production not overclaimed
- Digital Sales, Paid Content, Tips, Watch-Party tickets/seats: setup needed / not active
- Merch: physical goods separate / planned
- Creator Balance: no verified earnings yet
- Payouts and Tax & Legal: setup needed

Owner/Admin Money Center now surfaces shared Product Catalog, Provider Events, Access Grants, Access Ledger, setup/sandbox not-payable counts, and merch readiness alongside older creator monetization foundations. It remains read-only and does not expose secrets or raw provider payloads.

## Google Play Policy Posture

Android Premium, paid content, digital tickets, digital seats, event passes, and creator tips stay on Google Play Billing / RevenueCat. Stripe is not used for Android digital checkout. Stripe/Shopify/merch providers are reserved for physical merch and future payout readiness.

Data Safety should be revisited before any tips, paid content, tickets, seats, event passes, merch checkout, or payout feature becomes active.

## Validation

Primary guard:

```bash
npm run guard:money-access-grants-policy
```

Closeout validation also includes runtime, Premium, payment rail, creator monetization, provider readiness, Money Center, Stripe Connect, Watch-Party LiveKit, old-room handling, content rights, Spectator child-room, navigation terminology, and typecheck guards.

## Remaining Gaps

- No live provider activation for paid content, tickets, seats, tips, event passes, or merch checkout.
- No production payable ledger proof.
- No payout activation.
- Fresh signed-in Owner/Admin Product Catalog / Provider Events / Access Grants / Ledger screenshot proof is now captured on EAS v22 at `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`. The remaining gap is real RevenueCat / Google Play sandbox purchase proof for non-Premium products after provider mappings are created.
- The next sales lane must use real RevenueCat / Google Play sandbox purchase events for tickets/seats; do not insert fake sales, fake provider events, or fake ledger rows.
- Remote migration apply and typegen are complete; `supabase migration list` remains the only unavailable Supabase readback command in this shell.
