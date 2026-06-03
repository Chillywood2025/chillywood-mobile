# Provider-Link Readiness Runbook

Last updated: June 3, 2026

June 3, 2026 money-access catalog readiness update: future provider events now have a shared sanitized destination in `provider_events`, product mapping in `monetization_products`, user access records in `access_grants`, and not-payable setup/sandbox accounting in `money_access_ledger_events`. RevenueCat/Google Play remains the Android digital rail for Premium, paid content, tips, tickets, seats, and event passes. Provider events must be idempotent and sanitized; raw payloads and secrets stay out of normal client/admin readouts. This update does not activate live money, provider checkout, paid content, tickets, seats, tips, merch checkout, payouts, or payable creator balances.

Remote apply/typegen proof: `20260603165000_money_access_grants_product_catalog.sql` was locally linted, remote-applied by the project Supabase CLI workflow, and post-apply dry-run clean. Generated types were refreshed with the linked Supabase typegen command. `supabase migration list` still cannot be used from this shell because of the known linked CLI login SASL auth failure; no database password, service role key, provider secret, or raw payload was printed. Android signed-in provider/Money Center proof at `/tmp/chillywood-money-center-signed-in-proof-20260603/` used a temporary audited operator upgrade, captured Creator Money Center readiness/not-payable state, then revoked the grant. Current-main Owner/Admin catalog/access/provider/audit visuals are now captured at `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/` from EAS v22 after explicit local replacement. The next provider-sales proof must use real RevenueCat / Google Play sandbox events, not fake sale insertion.

Real sandbox provider preflight: `revenuecat-webhook` is ACTIVE version `8` and mirrors real Premium RevenueCat events into `provider_events`, `access_grants`, and `money_access_ledger_events` while keeping sandbox/setup rows not payable and `liveMoneyAction:false`. No fake event was replayed or inserted. The only mapped RevenueCat/Google Play catalog row is Premium; paid content, Watch-Party tickets, Live Watch-Party access/seat passes, tips, and event pass are blocked by missing provider product ids/offering mappings. EAS Update `c0bb32bb-3c7e-406e-a619-2e3e0eb536ed` did not refresh installed v21 Admin money visuals. EAS APK build `cc88ce26-6e94-4adb-9768-d0483c12505a` for versionCode `22` finished and was installed after explicitly uninstalling Play/EAS v21 because in-place install failed with signature mismatch. Current-main Admin Money Center visuals, Money Audit Explorer counts, setup/sandbox/not-payable rows, and a sanitized detail sheet were captured at `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`; temporary owner/operator proof roles were revoked.

RevenueCat/Google Play dynamic product update: `money_purchase_intents` is now the required backend binding layer for paid content, tickets, access passes, seat passes, tips, and event passes. Migration `20260603190000_money_purchase_intents.sql` was remote-applied, the linked typegen command refreshed `supabase/database.types.ts`, post-apply dry-run is up to date, and `revenuecat-webhook` is ACTIVE version `9`. The webhook stores/ignores unmatched dynamic events safely and creates access/ledger records only for pending unexpired matching intents. The provider setup blocker is external dashboard work: create/import the proposed sandbox product IDs, attach RevenueCat packages, and update catalog rows before running real purchases. Do not simulate the sale path with manual provider rows.

Sandbox provider product follow-up: the external dashboard product blocker is closed for the first six non-Premium sandbox IDs. Google Play Console has active one-time products for `cw_paid_content_access_sandbox_099`, `cw_watch_party_live_ticket_sandbox_099`, `cw_live_watch_party_access_sandbox_099`, `cw_live_watch_party_seat_sandbox_099`, `cw_creator_tip_sandbox_099`, and `cw_event_pass_sandbox_099`; each has purchase option `sandbox-099`. RevenueCat has matching published Play Store consumable products without entitlements, offerings, or transactions. Migration `20260603225500_sandbox_digital_product_mappings.sql` maps those products in `monetization_products` as sandbox-only and intent-enabled. The next proof step is signed-build/device purchase proof through `/admin-money-sandbox-purchases`; do not insert fake provider rows or ledger rows.

June 1, 2026 Premium reviewer readiness update: no new provider event was fired and the Premium shell stayed closed. Device proof confirms `R5CR120QCBF` is Play-installed versionCode `13`; `npm run validate:runtime` reports `revenueCatAndroidPublicKeyConfigured:true`; Supabase lists `revenuecat-webhook` ACTIVE version `7`; and EAS production branch readback for runtime `1.0.0` shows the current newest update is the closed-shell group `5668cdaa-cd5b-4553-bd91-7b786323fd22`. The outside-repo Google Play service-account file authenticated, but read-only Android Publisher track/product readback returned `403`, so current tester-list/product status could not be freshly verified through CLI. The prior licensed-tester sandbox purchase/restore/webhook/backend entitlement/Platform Studio unlock proof remains the governing proof. A fresh reviewer purchase run requires owner-entered reviewer credentials and explicit bounded shell-opening approval.

June 1, 2026 owner-session closeout: after the Premium sandbox proof, the attached proof phone was restored/confirmed in the normal owner/admin operating state without reopening billing. `R5CR120QCBF` reports `installer=com.android.vending`, versionCode `13`, versionName `1.0.0`, and the current session opens Admin Command Center. `/subscribe` shows purchase status `Temporarily unavailable`, and source remains closed with `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`. No purchase, provider event, Play track mutation, or EAS shell-opening update was run in this closeout lane; a closed-shell Restore Purchases check returned `Restore complete. Premium is not active.`

June 1, 2026 fresh active sandbox event closeout: the remaining active-event blocker is closed for the licensed sandbox tester. On Play-installed internal-test v12, the bounded Premium purchase shell was opened only for proof, a fresh Google Play sandbox purchase succeeded, Restore Purchases completed active, and RevenueCat delivered real event `0bd7...60d7` as an `INITIAL_PURCHASE` to the Supabase webhook. The webhook response was HTTP 200 with `webhookProcessed:true`, `premiumGranted:true`, `entitlementStatus:"active"`, and `liveMoneyAction:false`. Sanitized backend readback then found one Premium `user_entitlements` row for the test user with `source='revenuecat'`, sandbox Play Store metadata, and no raw provider payload storage; a later sandbox `RENEWAL` refreshed the active window. Platform Studio opened during that backend-active window and showed creator actions instead of Premium-required denial. The purchase shell was closed again with EAS update group `5668cdaa-cd5b-4553-bd91-7b786323fd22`, and current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` plus `premiumPurchaseEnabled: false`. This is sandbox/test proof only; production Premium and all live-money features remain off.

June 1, 2026 backend entitlement sync follow-up: `revenuecat-webhook` is now deployed with real backend sync code for verified RevenueCat Premium events. The function requires `REVENUECAT_WEBHOOK_SECRET`, rejects missing or invalid shared-secret requests, maps entitlement `premium` / product `premium_subscription` to `user_entitlements.source='revenuecat'`, records duplicate-safe `billing_events`, writes sanitized provider-readiness audit, handles RevenueCat dashboard `TEST` events as delivery proof with no Premium grant, and returns `liveMoneyAction:false`. Supabase write failures now fail the webhook instead of silently claiming success. The server-side `REVENUECAT_WEBHOOK_SECRET` is configured in Supabase by name only, and RevenueCat webhook integration `whintgr38699522f7` points at the deployed function with the matching Authorization header. RevenueCat dashboard `TEST` delivery returned HTTP 200; no-secret smoke returns 401; valid shared-secret test returns `test_received`, `webhookProcessed:true`, `premiumGranted:false`, and `liveMoneyAction:false`. This setup proof is superseded by the fresh active sandbox event closeout above, which wrote/refreshed a real backend Premium row and proved Platform Studio unlock.

June 1, 2026 Play-installed Premium sandbox purchase-shell follow-up: the Play-installed blocker is resolved on `R5CR120QCBF` with `installer=com.android.vending`, versionCode `12`, and versionName `1.0.0`; the app is signed in and `/subscribe` opens. RevenueCat mapping remains dashboard-proved from the prior lane. Owner-approved bounded EAS update group `b678522a-8734-49a1-a582-f2bc6743c756` opened only the Premium purchase shell, Google Play displayed the sandbox `Chi'llywood Premium` subscription for `com.chillywood.mobile (unreviewed)` with the always-approves test payment method and no-charge test-subscription copy, purchase completed, `/subscribe` showed `Premium is active`, and restore completed with `Purchases restored. Premium is active.` The shell was closed again with EAS update group `82f7e7fd-d213-4f50-9c5d-6e6a328884db`; current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true`. At that checkpoint backend entitlement sync/readback remained open and Platform Studio stayed denied, proving no fake creator-tool unlock. That blocker is superseded by the later fresh active sandbox event closeout above, which wrote/refreshed the backend row and unlocked Platform Studio during the active entitlement window. No live money, tickets/seats, tips, paid content, payouts, or production Premium is active.

This runbook records the provider-link readiness scaffold for Premium, RevenueCat, Google Play Billing, Stripe, Stripe Connect, payouts, revenue imports, tips, paid content, Watch-Party seats, ads, and future commerce.

No implementation in this lane activates purchases, payouts, balances, withdrawals, transfers, checkout, tips, paid content, revenue imports, or live money movement.

Platform Studio Money Center is the normal creator-facing home for these statuses. Owner/Admin Command Center has one consolidated Money Center tab for admin money readiness and switches. Both surfaces use the sanitized provider-readiness summary plus backend Money kill-switch state; owner/dev-only Technical checks may show public-safe setup metadata, never secret values.

Money Center also has inspection drilldowns. Creator Platform Studio rows open sanitized `Money Event Detail` sheets for creator-owned/source-safe setup, sandbox, readiness, ledger, provider, and switch events. Owner/Admin Money Center has `Money Audit Explorer` for source rows, provider readiness, kill switch state/audit, ledger/revenue/payout/webhook/sponsor/fraud setup rows, and blocked money actions. These drilldowns are inspect-only and cannot activate checkout, payouts, transfers, withdrawals, balances, paid access, Premium, or live money.

May 29, 2026 Admin Search audit closeout: Owner/Admin `Search Admin` can search provider readiness and money audit rows only inside `/admin`, and those searches now write masked immutable audit events through `write_admin_search_audit`. The audit metadata records scope, query type, masked preview, status, and result count, but never provider secrets, raw payloads, webhook secret values, service-role values, authorization headers, or plaintext email search text. This is an audit/readiness hardening only; it does not change provider readiness state or enable live money.

May 29, 2026 Public V1 eight-blocker burn-down provider refresh: proof lives at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`. Names-only Supabase secret inventory still found no `REVENUECAT_WEBHOOK_SECRET` or `GOOGLE_PLAY_WEBHOOK_SECRET`. Unsigned RevenueCat and Google Play webhook smoke returned setup-required/fail-closed responses with no Premium grant, no subscription grant, and no live-money action. Stripe Connect unsigned smoke still rejected invalid signatures. Android Money Center proof showed provider/money state as not active. This keeps RevenueCat/Google as setup/sandbox-only blockers for monetized launch and does not activate Premium, checkout, payouts, balances, paid content, tips, ads, or live money.

June 1, 2026 Premium sandbox guard-restore reconciliation: the initial restored-guard pass found the Android RevenueCat debug public SDK key present and the Android production public SDK key empty, so `npm run validate:runtime` correctly reported `revenueCatAndroidPublicKeyConfigured: false` because it reads `runtime.revenueCat.androidPublicSdkKey`, not the debug-only `runtime.revenueCat.androidDebugPublicSdkKey`. A previous sandbox success can therefore be consistent with a debug/internal build. The later production-key follow-up below supersedes the missing-key blocker, but no sandbox purchase/restore is claimed until the owner provides a licensed Play tester path, confirms RevenueCat/Google product state in dashboards, supplies matching uploaded-build config without committing secrets, and intentionally opens the purchase shell for bounded proof.

June 1, 2026 production-key follow-up: the approved client-safe path for Android release is `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY` -> `app.config.ts` -> `runtime.revenueCat.androidPublicSdkKey` -> `_lib/revenuecat.ts` Android release mode. The Android production public SDK key is now present in ignored local config without printing or committing the value, and `npm run validate:runtime` reports `revenueCatAndroidPublicKeyConfigured: true`. A first Gradle build reused a stale release JS bundle with zero key occurrences, so the release bundle was force-regenerated and then contained the configured public key exactly once. This configured/setup-only proof was superseded by the later Play-installed purchase/restore proof and the fresh active sandbox entitlement proof above.

June 1, 2026 Google Play sandbox purchase/restore follow-up: proof at `/tmp/chillywood-revenuecat-google-sandbox-premium-proof-20260601/` recorded an earlier restore-only blocker. That blocker is superseded by the later Play-installed v12 sandbox purchase/restore proof and the fresh active sandbox event closeout above. Backend entitlement update is now proved for the licensed sandbox tester through a real RevenueCat webhook event. Money Center stayed setup/readiness-only with no payable balance, and Watch-Party ticket/seat monetization remained off/setup-only for both Watch-Party Live and Live Watch-Party / Live Stage.

June 1, 2026 Play-installed proof check: an earlier local-install blocker found `installer=null`, but that is superseded by the later internal-test v12 install on `R5CR120QCBF` with `installer=com.android.vending`, licensed tester flow, RevenueCat mapping proof, sandbox purchase/restore proof, and the fresh real-event backend entitlement row proof. The later closeout also confirms the device is now Play-installed versionCode `13`.

## Readiness Source Of Truth

Migration `202605250002_provider_link_readiness_scaffold.sql` adds:

- `provider_readiness_status`: backend-owned readiness rows by provider, capability, status, and environment.
- `provider_readiness_audit_log`: append-only sanitized readiness audit rows.
- `get_provider_readiness_summary()`: authenticated sanitized read path for creator/Admin UI.

Allowed statuses are:

- `missing`
- `setup_needed`
- `configured`
- `ready_for_review`
- `sandbox_ready`
- `active`
- `disabled`
- `blocked`
- `error`

Rules:

- `active` requires proof source, proof summary, and `last_checked_at`.
- `is_live_money_enabled` defaults to `false` and can only be true with `status='active'`.
- This lane seeds no active rows and no live-money rows.
- Normal creators and normal users cannot write readiness rows.
- UI reads sanitized summaries only and never receives secrets, raw provider payloads, raw storage paths, customer payment identifiers, card data, bank data, or service-role values.

## Sandbox Event Inspection

Sandbox provider setup can be used for proof only when a signed/provider-safe event can be fired without printing or committing secrets.

Sandbox row rules:

- label sandbox/test provider rows `Sandbox only`;
- label them `Not payable`;
- keep them separate from production ledger/balance rows;
- never show them as production revenue;
- never enable withdraw, cash-out, payout release, transfer, checkout, paid content unlock, tips, seats, merch orders, or available balance;
- preserve idempotency proof through provider event id or duplicate-safe source key where safely available;
- do not show raw private payloads, signatures, tokens, provider secrets, service-role values, or secret env values.

If sandbox event firing is not available during proof, record the exact missing external action and prove only configured/sandbox readiness rows.

May 27, 2026 Money Audit Explorer proof first proved existing sandbox/readiness/switch rows only. The follow-up provider CLI proof then fired a fresh Stripe CLI test-mode `payment_intent.succeeded` event and resent the same event to the enabled Chi'llwood Connect test webhook endpoint. Stripe reported `livemode=false` and `pending_webhooks=0` after delivery. Owner/Admin Money Audit Explorer shows the resulting `creator_payout_provider_webhook_events` source row as `Sandbox only`, `Not payable`, `ignored`, provider `stripe_connect`, provider environment `test`, `livemode=false`, event type `payment_intent.succeeded`, and duplicate-safe/idempotency labeled. Screenshots live at `/tmp/chillywood-provider-cli-proof-20260527/`. No payable creator balance, withdrawal, checkout, payout release, transfer, Premium grant, or production revenue was created.

## Money Kill Switch Companion

Migration `202605270001_platform_money_kill_switches.sql` adds the Owner/Admin control companion to provider readiness:

- Creator UI reads `get_money_feature_flags_summary()` and receives only sanitized key/state/display copy.
- Owner/Admin UI reads `get_platform_money_kill_switches()` and `list_platform_money_kill_switch_audit()`.
- Owner/Admin changes use `set_platform_money_kill_switch_state()` with a reason and immutable audit.
- Future backend money actions must use `assert_money_feature_allowed()` or equivalent server-side enforcement.

Current default switch posture:

| Switch | Current default |
| --- | --- |
| `money_center_visible` | on |
| `digital_sales_enabled` | off |
| `tips_enabled` | off |
| `watch_party_seats_enabled` | off |
| `paid_content_enabled` | off |
| `merch_enabled` | off |
| `creator_balance_visible` | on |
| `payouts_enabled` | off |
| `stripe_connect_enabled` | sandbox_only |
| `revenuecat_google_play_enabled` | sandbox_only |
| `provider_webhooks_enabled` | sandbox_only |
| `live_money_enabled` | off |

`sandbox_only` allows setup proof and readiness review only. It is not production active and cannot create checkout, balances, purchases, transfers, payouts, or provider grants. `on` still requires provider readiness. Live-money actions require both the target switch and `live_money_enabled=on`.

## Readiness Providers And Capabilities

| Provider | Capability | Current Status | Live Money |
| --- | --- | --- | --- |
| RevenueCat | Android debug public SDK key | configured for debug/internal sandbox only | false |
| RevenueCat | Android production public SDK key | configured in ignored local validation env; release bundle proof captured | false |
| RevenueCat | Premium entitlement id | configured in code/dashboard as `premium`; real sandbox event proved webhook sync into backend `user_entitlements` | false |
| RevenueCat | Offering | configured in code/dashboard as `premium`; purchase/restore, backend row, and Platform Studio sandbox unlock proof passed | false |
| Google Play | Package | configured in app as `com.chillywood.mobile` | false |
| Google Play | Subscription product | sandbox proof passed for the licensed tester path; current reviewer/tester readback through Play API is blocked by `403` | false |
| Stripe | Webhook signature | sandbox_ready | false |
| Stripe Connect | Account setup | setup_needed | false |
| Stripe Connect | Payout setup | setup_needed | false |
| Stripe Connect | Payout release | disabled | false |
| Internal policy | Creator revenue imports | disabled | false |
| Stripe | Tips | disabled | false |
| Google Play | Paid content | setup_needed | false |
| Stripe | Platform commerce | disabled | false |
| Ads | Ad revenue | disabled | false |
| Internal policy | Creator monetization policy | configured | false |

`configured` means the repo has a named contract or policy row. It is not active. It does not grant access, create money, or enable a provider call. `sandbox_ready` means a sandbox/test proof passed for that specific capability only; it is still not production active and does not enable live money.

## Sandbox Provider Proof Closeout

Migration `202605250004_provider_link_sandbox_proof_status.sql` records the May 25, 2026 sandbox proof overlay:

- Supabase Edge secret inventory was names-only. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are configured. RevenueCat server/webhook secrets, Google Play server/webhook secrets, Stripe Connect client/platform metadata, and internal live-money flags are missing.
- Stripe webhook signature readiness is `sandbox_ready` only. Proof used a Stripe CLI test-mode `payment_intent.succeeded` event delivered to the enabled test webhook endpoint with `livemode=false` and `pending_webhooks=0`.
- Unsigned direct POST to `stripe-connect-webhook` returned `invalid_signature` and `liveMoneyAction:false`.
- RevenueCat and Google Play webhook shells cannot be marked sandbox-ready while their server/webhook secrets are missing. They return setup-required, write sanitized setup-required audit rows, and grant no Premium/subscription access.
- No provider row is production `active`.
- Every readiness row remains `is_live_money_enabled=false`.
- No checkout, charge initiated by the app, tip, paid content, balance, transfer, payout, creator earning, revenue import, payout release, or fake Premium grant was created.
- No secret value, webhook signing value, Google service-account JSON, raw provider payload, or customer/payment credential was committed or displayed.

May 27, 2026 provider CLI refresh:

- Stripe CLI is authenticated against the Chi'llwood test account and proved a signed test webhook delivery plus same-event resend without printing or committing API keys or webhook secrets.
- Supabase names-only secret inventory still shows `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` configured, but no `REVENUECAT_WEBHOOK_SECRET` or `GOOGLE_PLAY_WEBHOOK_SECRET`.
- No official RevenueCat CLI is installed locally; no RevenueCat signed webhook event was fired.
- Google CLI confirms Android Publisher and Pub/Sub APIs are enabled on `chillywood-app`, but no Pub/Sub topics exist. Direct Android Publisher subscription read proof returned `403` for both the active user account and the local Google Play service account JSON, so Google signed webhook/product CLI proof remains blocked on provider permission/topic/secret setup.
- RevenueCat and Google Play webhook shells remain fail-closed/readiness-only until their server webhook secrets and provider permissions are linked.

Current provider-link statuses after the June 1 guard-restore reconciliation:

| Provider | Capability | Current Status | Production Active | Live Money |
| --- | --- | --- | --- | --- |
| Stripe | Webhook signature | sandbox_ready | false | false |
| RevenueCat | Android debug public SDK key | configured for debug/internal sandbox only | false | false |
| RevenueCat | Android production public SDK key | configured in ignored local validation env; release bundle proof captured | false | false |
| RevenueCat | Premium entitlement id | configured in code/dashboard as `premium`; real sandbox event proved webhook sync into backend `user_entitlements` | false | false |
| RevenueCat | Offering | configured in code/dashboard as `premium`; purchase/restore, backend row, and Platform Studio sandbox unlock proof passed | false | false |
| Google Play | Package | configured in app as `com.chillywood.mobile` | false | false |
| Google Play | Subscription product | sandbox proof passed for the licensed tester path; current reviewer/tester readback through Play API is blocked by `403` | false | false |
| Stripe Connect | Account setup | setup_needed | false | false |
| Stripe Connect | Payout setup | setup_needed | false | false |
| Stripe Connect | Payout release | disabled | false | false |
| Internal policy | Creator revenue imports | disabled | false | false |
| Stripe | Tips | disabled | false | false |
| Google Play | Paid content | setup_needed | false | false |
| Stripe | Platform commerce | disabled | false | false |
| Ads | Ad revenue | disabled | false | false |
| Internal policy | Creator monetization policy | configured | false | false |

Names-only Supabase secret inventory for this proof:

- Configured: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Missing: `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_ENTITLEMENT_ID`, `REVENUECAT_OFFERING_ID`, `REVENUECAT_PRODUCT_ID`, `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET_REF`, `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID`, `GOOGLE_PLAY_PUBSUB_TOPIC`, `GOOGLE_PLAY_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_PLATFORM_ACCOUNT_ID`, `STRIPE_ENVIRONMENT`, `CHILLYWOOD_PAYMENT_RAILS_ENABLED`, `CHILLYWOOD_LIVE_MONEY_ENABLED`, `CHILLYWOOD_CREATOR_MONETIZATION_ENABLED`, `CHILLYWOOD_PAYOUTS_ENABLED`

## Server-Only Env Contract

Document names only. Do not commit values.

RevenueCat:

- `REVENUECAT_SECRET_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV`
- `REVENUECAT_ENTITLEMENT_ID`
- `REVENUECAT_OFFERING_ID`
- `REVENUECAT_PRODUCT_ID`

Google Play:

- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET_REF`
- `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID`
- `GOOGLE_PLAY_PUBSUB_TOPIC`
- `GOOGLE_PLAY_WEBHOOK_SECRET`

Stripe:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CONNECT_CLIENT_ID`
- `STRIPE_CONNECT_REFRESH_URL`
- `STRIPE_CONNECT_RETURN_URL`
- `STRIPE_PLATFORM_ACCOUNT_ID`
- `STRIPE_ENVIRONMENT`

Internal flags:

- `CHILLYWOOD_PAYMENT_RAILS_ENABLED`
- `CHILLYWOOD_LIVE_MONEY_ENABLED`
- `CHILLYWOOD_CREATOR_MONETIZATION_ENABLED`
- `CHILLYWOOD_PAYOUTS_ENABLED`

Only public-safe keys may use an `EXPO_PUBLIC_` prefix. Secret env vars must stay server-side in Supabase/EAS/provider consoles and must never be rendered in the mobile app.

## Edge Function Shells

Added or confirmed fail-closed paths:

- `provider-readiness`: authenticated sanitized readiness summary. Returns no secrets and no raw provider payloads.
- `revenuecat-webhook`: requires `REVENUECAT_WEBHOOK_SECRET` before accepting events. Missing-secret requests fail closed, write sanitized setup-required audit rows when the service role is available, and do not grant Premium.
- `google-play-webhook`: requires `GOOGLE_PLAY_WEBHOOK_SECRET` before accepting events. Missing-secret requests fail closed, write sanitized setup-required audit rows when the service role is available, and do not grant subscriptions.
- Existing `stripe-connect-webhook`: requires Stripe webhook signature verification, rejects live-mode events in the current test-mode shell, records supported foundation events idempotently, and creates no checkout, orders, ledger earnings, transfers, payouts, or live money.

The RevenueCat webhook now has provider-specific verification, idempotency, entitlement reconciliation, and sanitized audit handling for Premium events, but it cannot be marked provider-proved until the server-side shared secret is configured and a real RevenueCat sandbox event is processed. The Google Play webhook remains fail-closed/setup-only until its own secret and provider event path are linked.

`provider_webhooks_enabled=off` keeps webhooks from activating money; they may only audit readiness if policy allows. `provider_webhooks_enabled=sandbox_only` allows sandbox proof only. `live_money_enabled=off` blocks live-money claims and actions even when a provider is configured or sandbox-ready.

## Owner/Admin Money Center Mapping

Owner/Admin Money Center reads `get_provider_readiness_summary()` through `_lib/providerReadiness.ts` and `get_platform_money_kill_switches()` / `list_platform_money_kill_switch_audit()` through `_lib/moneyFeatureFlags.ts`. It groups readiness under:

- Premium / RevenueCat / Google Play
- Digital Sales
- Tips / Watch-Party Seats / Paid Content
- Payouts / Stripe Connect
- Provider Webhooks
- Sponsors / Ads
- Fraud & Risk
- Creator Balance / Ledger
- Tax & Legal
- Technical Checks

Old Admin params such as `tab=premium`, `tab=kill-switches`, `tab=ads`, `tab=sponsors`, `tab=fraud`, `tab=revenue`, and `tab=payouts` route into the consolidated Money Center section anchors. No provider row can be treated as active unless provider readiness says `active`, the relevant kill switch allows it, and live-money gates allow it.

## Provider Dashboard Setup Steps

RevenueCat:

1. Confirm Chi'llywood project and app.
2. Add the Android production public SDK key to approved public build env/config as `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`; keep secret/server RevenueCat keys out of the app.
3. Confirm entitlement id `premium`.
4. Confirm offering id `premium`.
5. Confirm product id `premium_subscription:monthly` or current approved equivalent.
6. Configure webhook target only after the `REVENUECAT_WEBHOOK_SECRET` is set.
7. Run sandbox purchase, restore, active entitlement, revoked/expired entitlement, and webhook proof.

Google Play:

1. Confirm package name `com.chillywood.mobile`.
2. Confirm subscription product id `premium_subscription`.
3. Confirm base plan and price.
4. Confirm service account access and Pub/Sub/webhook path are server-only.
5. Set `GOOGLE_PLAY_WEBHOOK_SECRET` only in server-side provider config.
6. Run product-load, purchase sheet, purchase, restore, renewal/expiration, and webhook proof.

Stripe / Stripe Connect:

1. Use server-side Stripe secret keys only.
2. Keep test-mode proof separate from production.
3. Confirm Connect account controller/dashboard/requirements model before production.
4. Configure signed webhook endpoint with `STRIPE_WEBHOOK_SECRET`.
5. Prove account creation/reuse, onboarding, account sync, requirements, KYC/tax readiness, duplicate event idempotency, and invalid signature rejection.
6. Keep transfers, payouts, balances, checkout, cash-out, and release disabled until a later live-money lane proves every required gate.

Ads:

1. Keep provider-neutral wrapper direction.
2. Do not add ad SDK IDs or provider init until an ads provider lane owns it.
3. Do not create ad revenue rows or creator earnings from placeholder ad surfaces.

## Money Center UI Mapping

- RevenueCat and Google Play appear under Money Center > Digital Sales and Provider Status.
- Stripe Connect appears under Money Center > Payouts and Provider Status.
- Tips, paid content, Watch-Party seats, and merch appear as separate readiness sections instead of one generic commerce bucket.
- Creator Balance remains ledger-first and shows no verified earnings until backed ledger rows exist.
- Old `Monetize`, `Revenue`, and `Payouts` entry points map into Money Center sections and no longer exist as duplicate creator-facing dashboards.
- Owner/Admin money controls now live in Admin Command Center > Money Center, where Premium, Sponsors/Ads, Fraud/Risk, Revenue/Ledger, Payouts, provider webhooks, kill switches, audit, and technical checks are consolidated.
- Admin Revenue/Payouts remain owner/admin operational readouts inside the consolidated Admin Money Center and are not normal creator-facing Money Center replacements.

Product policy: `docs/MONEY_CENTER_PRODUCT_POLICY.md`.

## Sandbox Proof Checklist

- Readiness rows exist and all seeded rows have `is_live_money_enabled=false`.
- Normal authenticated creator can read sanitized `get_provider_readiness_summary()` output.
- Normal authenticated creator cannot insert or update `provider_readiness_status`.
- Anonymous direct reads are denied.
- RevenueCat webhook without secret returns setup required.
- RevenueCat webhook with invalid secret is rejected.
- Google Play webhook without secret returns setup required.
- Google Play webhook with invalid secret is rejected.
- Stripe webhook invalid signature remains rejected.
- Premium entitlement behavior is unchanged.
- Non-Premium users remain denied by existing Premium gates.
- No creator earnings, payout balances, transfers, withdrawals, checkout sessions, tips, paid products, Watch-Party seat sales, merch orders, or paid access grants are created.

## Production Proof Checklist

Before any status can become `active`:

- Provider dashboard setup is complete.
- Provider secret values exist only in server/provider secret stores.
- Webhook signature verification is proved with valid and invalid events.
- Provider idempotency is proved.
- Audit rows prove accepted, rejected, blocked, and duplicate events.
- Rollback plan is tested.
- Legal/accounting/tax/fraud/support requirements are approved.
- Owner/operator approval is recorded.
- Android proof shows locked and active states honestly.
- Public UI still exposes no secrets or raw provider payloads.

## Rollback Plan

1. Set affected readiness rows to `blocked` or `disabled`.
2. Keep `is_live_money_enabled=false`.
3. Disable provider dashboard webhooks if needed.
4. Rotate affected secrets.
5. Verify UI returns locked/unavailable states.
6. Verify Premium gates, creator gates, and payout gates remain fail-closed.
7. Record audit rows for rollback reason and affected capability.

## Secret Rotation Plan

1. Add new provider secret in the server/provider secret store.
2. Deploy or restart only the server-side function that needs it.
3. Run valid and invalid signature proof.
4. Revoke the old secret in the provider dashboard.
5. Confirm no old secret value is printed in logs or screenshots.
6. Record an audit row with secret name only, never value.

## Future Implementation Boundaries

Do not touch these areas in provider-link work unless a future exact lane explicitly owns them:

- LiveKit token issuer, registry, room routing, or egress.
- Watch-Party Live route.
- Live Watch-Party route.
- Premium gate decisions except the existing RevenueCat entitlement path.
- Creator upload/publish/delete behavior.
- Clip Studio rendering/export behavior.
- Brand Studio behavior.
- Public Player behavior for paid content unless a dedicated VOD monetization renderer/access lane owns it.
- Native Android/Gradle files or packages unless a provider SDK lane owns release-build proof.

## Android Proof And Validation

Android proof on device `R5CR120QCBF` is outside the repo at:

- Scaffold UI proof: `/tmp/chillywood-proof-2026-05-25T21-33-35Z-provider-link-readiness/`
- Sandbox closeout proof: `/tmp/chillywood-proof-2026-05-25T-provider-link-sandbox-proof-android/`
- Money Center consolidation proof: `/tmp/chillywood-money-center-proof-20260526-r5/`
- Money Audit Explorer drilldown proof: `/tmp/chillywood-money-audit-explorer-proof-20260527/`
- Provider CLI Stripe sandbox event proof: `/tmp/chillywood-provider-cli-proof-20260527/`

Captured proof includes:

- Platform Studio Monetization tab with `Money Center` title.
- Overview and Digital Sales sections.
- Tips, Watch-Party Seats, Paid Content, and Merch sections.
- Creator Balance and Payouts sections.
- Tax & Legal section.
- Provider Status for Google Play, RevenueCat, Stripe Connect, Stripe webhook, live money, and creator monetization.
- Future Tools.
- Owner/dev Technical checks.
- Creator Money Event Detail and Owner/Admin Money Audit Explorer detail sheets.
- Sandbox and Setup filters, sandbox rows, kill-switch detail, and provider-readiness detail.
- Locked/unavailable/planned states.
- No secret values displayed.
- No live-money, checkout, payout, balance, tip, paid-content, or revenue-import action.

Validation run for the scaffold and sandbox proof:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:provider-readiness-policy`
- `supabase migration list`
- `supabase db lint --linked`
- `supabase db push --dry-run`
- deployed function list proof for `provider-readiness`, `revenuecat-webhook`, and `google-play-webhook`
- unauthenticated readiness curl proof returning auth required
- RevenueCat and Google Play webhook curl proof returning setup required with no grants and no live-money action while webhook secrets are missing
- Stripe CLI test-mode webhook proof with `livemode=false`, `pending_webhooks=0`, same-event resend, and Money Audit Explorer detail showing `Sandbox only`, `Not payable`, `ignored`, provider `stripe_connect`, provider environment `test`, and duplicate-safe/idempotency labeling
- Google CLI proof of Android Publisher/PubSub API availability, no Pub/Sub topics, and `403` subscription read blocker for both active user and local service account
- Stripe unsigned direct POST proof returning `invalid_signature` and no live-money action
- signed-in sanitized readiness proof returning 14 rows, no active rows, no live-money rows, and no forbidden raw fields
- direct `provider_readiness_status` RLS read proof returning 0 rows for the proof user
- Android proof at `/tmp/chillywood-proof-2026-05-25T-provider-link-sandbox-proof-android/`
- Android proof XML grep showing no Stripe/RevenueCat/Google secret-like values
- scoped no-forbidden-copy/no-client-secret/no-fake-activation greps for the changed creator-facing surface
- changed-file proof showing no native Android/Gradle, lockfile, Expo config, LiveKit, Watch-Party, Clip Studio, or Brand Studio behavior files changed
- `git diff --check`
- `git diff --cached --check`

## Current Status

- Provider readiness model: repo-added in migrations `202605250002_provider_link_readiness_scaffold.sql` and `202605250003_provider_readiness_creator_copy.sql`.
- Provider adapters: typed fail-closed interfaces/shells in `supabase/functions/_shared/provider-readiness.ts`.
- Platform Studio: Monetization tab reads sanitized readiness summaries and falls back closed if the summary is unavailable.
- Edge Functions: `provider-readiness` is deployed ACTIVE version 1; `revenuecat-webhook` and `google-play-webhook` are deployed ACTIVE version 2 after the setup-required audit logging update.
- Webhook shells: RevenueCat and Google Play fail closed and audit setup-required when secrets are missing; Stripe Connect signed webhook foundation exists and has sandbox signature proof.
- Live money: not active.
- Purchases: unchanged.
- Payouts: unavailable.
- Revenue imports: disabled.
- Tips, paid content, commerce, ad revenue: planned or setup-needed only.
