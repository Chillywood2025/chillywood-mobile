# Creator Monetization In-App Flows

Date: June 5, 2026

Completion update: `docs/CREATOR_MONETIZATION_SETUP_COMPLETION_MATRIX.md` now closes the setup-flow matrix. `/creator-monetization-setup` saved sandbox/not-payable configs for paid content, Watch-Party Live ticket, Live Watch-Party access pass, Live Watch-Party seat pass, creator tip, event pass, and physical merch readiness against proved source fixtures. Remote readback shows processed sandbox provider events and consumed intents for every Android digital product, sandbox/not-payable ledger rows for every digital product, access grants where appropriate, Stripe merch sandbox launch/readiness, payout readiness read-only, and zero production/payout/payable/publish/host-power config rows.

Viewer/Admin QA update: `docs/CREATOR_MONETIZATION_VIEWER_GATE_ADMIN_QA.md` captures the Play-installed Android setup/tier/internal-sandbox/merch/payout-readiness screens and correct Admin denial for the non-admin tester session. Fresh contextual viewer-gate and Owner/Admin drilldown screenshots remain visual QA blockers until a route-backed safe fixture set and active Owner/Admin session are available; backend/provider proof remains complete.

This lane adds creator-facing setup flows on top of the already-proved sandbox payment rails. It does not activate production money.

## What Changed

- Added `/creator-monetization-setup`.
- Added `creator_monetization_configs` via migration `20260605000610_creator_monetization_in_app_setup_flows.sql`.
- Added server-side access binding via `20260605002000_bound_creator_monetization_setup_access.sql`, so the save RPC requires owner/operator or active beta/internal tester access.
- Added creator/admin RPCs:
  - `save_creator_sandbox_monetization_config`
  - `list_my_creator_sandbox_monetization_configs`
  - `admin_list_creator_sandbox_monetization_configs`
- Added `_lib/creatorMonetizationSetup.ts` for approved tier definitions, config save/read helpers, and sandbox launch helpers.
- Linked Platform Studio Money Center sections to the setup route.

## Approved Sandbox Tiers

Creators cannot type arbitrary Android digital prices. They choose approved mapped sandbox products only:

| Flow | Product key | Provider product | Rail | Price |
| --- | --- | --- | --- | --- |
| Paid content access | `paid_content_access_sandbox_099` | `cw_paid_content_access_sandbox_099` | Google Play / RevenueCat | `$0.99 sandbox/test` |
| Watch-Party Live ticket | `watch_party_live_ticket_sandbox_099` | `cw_watch_party_live_ticket_sandbox_099` | Google Play / RevenueCat | `$0.99 sandbox/test` |
| Live Watch-Party access pass | `live_watch_party_access_pass_sandbox_099` | `cw_live_watch_party_access_sandbox_099` | Google Play / RevenueCat | `$0.99 sandbox/test` |
| Live Watch-Party seat pass | `live_watch_party_seat_pass_sandbox_099` | `cw_live_watch_party_seat_sandbox_099` | Google Play / RevenueCat | `$0.99 sandbox/test` |
| Creator tip | `creator_tip_sandbox_099` | `cw_creator_tip_sandbox_099` | Google Play / RevenueCat | `$0.99 sandbox/test` |
| Event pass | `event_pass_sandbox_099` | `cw_event_pass_sandbox_099` | Google Play / RevenueCat | `$0.99 sandbox/test` |
| Physical merch | `cw_merch_test_tee_sandbox` | `cw_merch_test_tee_sandbox` | Stripe sandbox physical goods | `$9.99 sandbox/test` |

Additional price tiers require future Google Play / RevenueCat product setup and must not be faked.

## Flow Map

Creator flow:

1. Approved creator/internal tester opens `/creator-monetization-setup`.
2. Creator selects an approved sandbox tier.
3. Creator enters a real source UUID for content, room, event, creator, or merch.
4. App saves a `creator_monetization_configs` row through the safe RPC; the server rejects non-approved users with `internal_sandbox_tester_required`.
5. Saved row is labeled `sandbox`, `not_payable`, production off, payout off.
6. Internal tester can launch the matching sandbox purchase rail from the saved config.

Viewer/tester rail:

- Android digital goods use `create_money_purchase_intent` plus Google Play / RevenueCat.
- Physical merch uses Stripe sandbox checkout only.
- Payout readiness is display/read-only only.

Owner/Admin inspection:

- Owner/operator accounts can call `admin_list_creator_sandbox_monetization_configs`.
- Rows are sanitized and do not expose secrets or raw provider payloads.
- Owner/Admin can inspect product key, provider product id, source type/source id, creator id, status, and safety flags.

## Safety Rules

- Production live money remains off.
- App-level payouts remain off.
- Cash-out, withdrawal, and transfer remain absent.
- Sandbox/setup rows remain not payable.
- Stripe is not used for Android digital goods.
- Physical merch creates no digital access, RevenueCat entitlement, or Premium entitlement.
- Payout readiness cannot request, trigger, simulate, cash out, withdraw, transfer, or activate payouts.
- Payment does not grant LiveKit publish, host, speaker, mod/admin, payout, or safety-bypass authority.
- Seat pass creates eligibility only; host approval is still required.
- Event pass does not bypass canceled, ended, removed, disabled, unsafe, or blocked states.
- Paid content access does not bypass private, draft, deleted, admin-removed, malware, or blocked states.

## Validation

Passed after implementation:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:money-access-grants-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:content-rights-policy`
- `npm run guard:navigation-terminology-policy`
- `supabase db lint --local`
- `supabase migration list`
- `git diff --check`
- `git diff --cached --check`

Unavailable after the final access-bound migration:

- `supabase db push --dry-run` hit the known linked-project `cli_login_postgres` SASL auth failure. `supabase migration list` still showed both creator setup migrations aligned local/remote after apply.

## Proof Path

Initial Android proof path:

`/tmp/chillywood-creator-monetization-in-app-flows-proof-20260604/`

Completion matrix proof path:

`/tmp/chillywood-creator-monetization-flow-completion-matrix-proof-20260605/`

Play-installed Android proof captured the completion checklist, saved rows for every approved tier, and Stripe sandbox checkout launch. Remote readback supplies the provider-event, purchase-intent, access-grant, ledger, merch, and payout-readiness counts.

## Remaining Gaps

- Fresh contextual Android screenshots for every viewer gate remain useful release QA, but the provider/resolver/backend proof exists.
- Fresh Owner/Admin UI screenshots for every config row were not captured with the internal tester session; sanitized remote readback proves the inspection data.
- Additional price tiers require future Google Play / RevenueCat products.
- Production merch launch requires fulfillment, refund/return, support, legal, and Data Safety approval.
- Production payouts require live Stripe approval, tax/legal readiness, fraud review, payout policy, support readiness, and explicit owner approval.
