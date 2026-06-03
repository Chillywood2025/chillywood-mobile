# Money Center Product Policy

Last updated: June 3, 2026

June 3, 2026 money-access catalog update: Chi'llwood now has an additive shared product catalog/access grant/readiness ledger architecture for future Premium-adjacent digital access, paid content, Watch-Party Live tickets, Live Watch-Party access/seat passes, tips, event passes, and merch separation. `monetization_products`, `provider_events`, shared `access_grants`, `money_access_ledger_events`, `merch_products`, and `merch_orders` are readiness/control-plane tables only. Setup and sandbox ledger rows are `Not payable`; merch cannot create digital access; Android digital products remain RevenueCat/Google Play; Stripe remains payout/physical-goods readiness only. Payment records never grant LiveKit publish, host/mod/admin, payout, speaker, privacy, moderation, or Premium bypass authority. Owner/Admin Money Center can inspect safe counts; Creator Money Center remains setup/readiness-only with no fake money.

Remote proof addendum: migration `20260603165000_money_access_grants_product_catalog.sql` passed local Supabase lint, was applied with `supabase db push`, and a post-apply dry-run reported the remote database up to date. `supabase/database.types.ts` was refreshed from the linked project. `supabase migration list` is still unavailable in this shell because the linked CLI login role hits the known SASL auth failure. Android proof paths now include `/tmp/chillywood-money-access-grants-remote-proof-20260603/`, `/tmp/chillywood-money-center-signed-in-proof-20260603/`, and `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`. The signed-in proof captured the upgraded proof account in Creator Money Center with `Not active`, `Sandbox ready`, `No verified earnings yet`, `Setup needed`, `No payable balance`, and setup/provider rows `Not payable`. The v22 proof captured current-main Owner/Admin Money Center Product Catalog, Shared Access Grants, Provider Rows, Money Audit Explorer setup/sandbox/not-payable states, and a sanitized detail sheet. Temporary proof roles were revoked and post-revoke Admin denial was captured.

Real sandbox sales preflight addendum: `revenuecat-webhook` ACTIVE version `8` mirrors real RevenueCat Premium events into the shared money-access tables, but no new sandbox sale was fired or faked. Premium is the only mapped RevenueCat/Google Play product. Paid content, Watch-Party tickets, Live Watch-Party access/seat passes, tips, and event pass remain blocked by missing provider product ids; merch remains physical/planned. Remote switches now read `live_money_enabled=off`, `payouts_enabled=off`, paid content/tips/merch/tickets/access/seats `off`, with only provider webhooks and RevenueCat/Google Play in `sandbox_only` readiness. EAS Update `c0bb32bb-3c7e-406e-a619-2e3e0eb536ed` did not load current Admin money visuals on Play/EAS v21. EAS APK build `cc88ce26-6e94-4adb-9768-d0483c12505a` finished for versionCode `22`; after the documented signature mismatch, the Play/EAS v21 app was explicitly uninstalled and the EAS v22 APK installed for current-main proof. `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/` captures Owner/Admin Money Center Product Catalog, Shared Access Grants, Provider Rows, Money Audit Explorer setup/sandbox/not-payable states, and a sanitized detail sheet. Temporary owner/operator proof roles were revoked and post-revoke denial was captured.

Money Center is the creator-facing source of truth for money readiness in Platform Studio. It consolidates the old Monetize, Revenue, Payouts, provider-readiness, Premium, Stripe, RevenueCat, Google Play, tips, paid content, Watch-Party seats, merch, creator balance, tax/legal, and payout-readiness surfaces into one collapsible readiness area.

This is a readiness, consolidation, and Owner/Admin control layer only. It does not activate live money, checkout, paid access, tips, merch sales, balances, withdrawals, transfers, payouts, or purchase verification.

June 1, 2026 Premium reviewer readiness update: the reviewer/test purchase path remains closed by default and safe for Google/internal testing. `R5CR120QCBF` is Play-installed versionCode `13`, runtime validation reports the Android RevenueCat public SDK key configured, `revenuecat-webhook` is ACTIVE version `7`, and EAS production branch readback for runtime `1.0.0` shows the newest update is the closed-shell group `5668cdaa-cd5b-4553-bd91-7b786323fd22`. `/subscribe` shows Premium inactive and purchase `Temporarily unavailable`; Admin Money Center shows `Live money off`. No fresh purchase, restore, provider event, ticket/seat/tip/paid-content/payout action, or fake balance was run in this readiness lane because the approved reviewer/app credential path was not available and Play API readback returned `403`. The existing licensed-tester sandbox proof remains valid, but reviewer purchase testing requires owner-entered Play Console/App access credentials plus an explicitly approved bounded purchase-shell opening.

June 1, 2026 owner-session closeout: after the sandbox Premium proof, `R5CR120QCBF` was updated from Google Play internal testing to versionCode `13` and restored/confirmed in the normal owner/admin operating state. The app opens Home, Admin Command Center opens, and `/subscribe` shows purchase status `Temporarily unavailable`. No purchase was run in that closeout lane; a closed-shell Restore Purchases check returned `Restore complete. Premium is not active.` Current source remains closed with `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`. Money Center remains setup/readiness-only; no live-money, ticket/seat, tip, paid-content, payout, cash-out, fake balance, or Stripe Android digital checkout behavior changed.

June 1, 2026 backend entitlement sync update: the Play-installed RevenueCat/Google sandbox purchase and restore proof passed, and `revenuecat-webhook` now contains a real verified-event-to-`user_entitlements` sync path for Premium. The server-side RevenueCat webhook secret and RevenueCat dashboard webhook integration are configured; dashboard `TEST` delivery is received as `test_received` with no Premium grant and no live-money action. A fresh real sandbox purchase event and later renewal wrote/refreshed one backend-active Premium row with `source='revenuecat'`, and Platform Studio unlocked during that active entitlement window. RevenueCat client UI or dashboard test delivery alone is not enough to unlock creator tools or mark production Premium live; creator tools require the backend row to be active and unexpired.

June 1, 2026 RevenueCat/Google sandbox purchase proof update: the earlier restore-only blocker was superseded by the Play-installed internal-test v12 sandbox purchase/restore proof and the fresh real-event backend entitlement proof. Money Center still stayed setup/readiness-only: no payout, balance, ticket, seat, tip, paid-content unlock, live-money action, or Stripe Android checkout was created. Watch-Party Live and Live Watch-Party / Live Stage keep Premium access gates, but ticket/seat monetization remains `watch_party_seats_enabled=off` and setup-only with no buy button unless a future Play/RevenueCat-backed product is proved.

The later Play-installed follow-up on June 1, 2026 superseded the earlier local-install blocker. Money Center remains unchanged: readiness/sandbox status can be inspected, but no switch or provider row may be treated as active money until a later explicit live-money lane proves provider readiness, policy approval, and owner approval.

## Payment Rules

- Android digital access inside the app uses Google Play Billing and RevenueCat where required by policy. Google Play's Payments policy says Play-distributed apps charging for in-app features, services, digital content, or digital goods must use Google Play billing unless an eligible policy path applies: https://support.google.com/googleplay/android-developer/answer/9858738
- RevenueCat remains the Premium/subscription entitlement integration. Webhooks must be authenticated and idempotent because RevenueCat may deliver duplicate events: https://www.revenuecat.com/docs/integrations/webhooks
- Stripe Connect is for creator payout onboarding and future payout operations, not Android digital purchase collection. Stripe documents Connect as a platform/marketplace system for connected accounts, balances, and payouts: https://docs.stripe.com/connect
- Physical merch can use Stripe, Shopify, or another approved merch checkout later because physical goods are separate from Android digital app access.
- Chi'llwood's internal ledger is the source of future creator-balance truth. Provider balances alone are not creator payable balance truth.
- Refunds, reversals, fraud holds, taxes, provider fees, app-store fees, disputes, moderation holds, and policy checks can reduce pending or available balances.
- No payout is available until purchase verification, refund/reversal handling, fraud checks, payout setup, tax/legal/KYC readiness, provider checks, and owner-approved policy checks pass.

## Owner/Admin Kill Switches

Migration `202605270001_platform_money_kill_switches.sql` adds backend-enforced Money Center switches and append-only audit:

- `platform_money_kill_switches`
- `platform_money_kill_switch_audit`
- creator-safe `get_money_feature_flags_summary()`
- owner/operator `get_platform_money_kill_switches()`
- owner/operator `list_platform_money_kill_switch_audit()`
- audited owner/operator `set_platform_money_kill_switch_state()`
- backend action guards `is_money_feature_allowed()` and `assert_money_feature_allowed()`

Allowed states are `off`, `on`, `locked`, `maintenance`, and `sandbox_only`.

Required switch defaults:

| Switch | Default |
| --- | --- |
| `money_center_visible` | `on` |
| `digital_sales_enabled` | `off` |
| `tips_enabled` | `off` |
| `watch_party_seats_enabled` | `off` |
| `paid_content_enabled` | `off` |
| `merch_enabled` | `off` |
| `creator_balance_visible` | `on` |
| `payouts_enabled` | `off` |
| `stripe_connect_enabled` | `sandbox_only` |
| `revenuecat_google_play_enabled` | `sandbox_only` |
| `provider_webhooks_enabled` | `sandbox_only` |
| `live_money_enabled` | `off` |

Optional scaffold switches default to `sandbox_only` for creator monetization readiness and `off` for creator revenue imports, tax/KYC collection, ads revenue, and sponsorships.

Rules:

- `off` shows disabled/setup copy to creators.
- `locked` and owner-only reasons are visible only in Owner/Admin controls.
- `maintenance` shows temporary unavailability.
- `sandbox_only` allows provider test proof and readiness review but no production money.
- `on` still requires provider readiness and, for live-money actions, `live_money_enabled=on`.
- `live_money_enabled` stays off unless a later explicit launch lane documents provider proof, legal/accounting approval, rollback proof, and owner approval.
- High-risk switches require confirmation and a reason: `live_money_enabled`, `payouts_enabled`, `digital_sales_enabled`, `tips_enabled`, `watch_party_seats_enabled`, `paid_content_enabled`, `stripe_connect_enabled`, `revenuecat_google_play_enabled`, and `provider_webhooks_enabled`.
- High-risk switch changes write both Money switch audit and immutable admin audit; future money actions must call backend guards and fail closed if the switch or audit path blocks.

## Owner/Admin Money Center

Owner/Admin Command Center has one visible `Money Center` tab for money controls. Separate top-level Admin money tabs for Premium, Kill Switches, Ads, Revenue, Payouts, Sponsors, and Fraud were consolidated into section anchors. Old params remain compatible:

- `admin?tab=premium` -> Money Center > Premium / RevenueCat / Google Play
- `admin?tab=kill-switches` -> Money Center > Kill Switches
- `admin?tab=ads` and `admin?tab=sponsors` -> Money Center > Sponsors / Ads
- `admin?tab=fraud` -> Money Center > Fraud & Risk
- `admin?tab=revenue` -> Money Center > Creator Balance / Ledger
- `admin?tab=payouts` -> Money Center > Payouts / Stripe Connect

Owner/Admin Money Center sections:

- Overview
- Kill Switches
- Premium / RevenueCat / Google Play
- Sponsors / Ads
- Fraud & Risk
- Digital Sales
- Tips / Watch-Party Seats / Paid Content
- Merch
- Creator Balance / Ledger
- Payouts / Stripe Connect
- Provider Webhooks
- Tax & Legal
- Audit Trail
- Technical Checks

Kill switches are grouped as Global Money, Digital Purchases, Physical / Merch, Payouts, Sponsors / Ads, and Fraud / Risk. Usage, Networks, Live Cost Guard, and Live Ops remain separate operational/admin surfaces because they do not activate creator money or payout capability.

Detailed Admin surface audit: `docs/ADMIN_MONEY_CENTER_SURFACE_AUDIT.md`.

## Money Center Sections

- Overview: active/locked/next-step summary plus short payment rules.
- Digital Sales: Premium, digital passes, paid creator content, and other app digital access readiness.
- Tips: planned digital-support readiness with no fake tip totals or checkout.
- Watch-Party Seats: planned viewer/VIP/speaker/event/room-access seat readiness without changing room authority.
- Paid Content: planned paid videos, replays, posts, and collections with entitlement checks required.
- Merch: physical goods only, separate from digital app unlocks.
- Creator Balance: ledger-first pending/available/paid/refunded/reversed/blocked status.
- Payouts: Stripe Connect setup/readiness only, no payout execution.
- Tax & Legal: tax profile, identity/KYC, payout terms, refunds/reversals, and policy links.
- Provider Status: sanitized provider readiness from the backend-owned readiness summary.
- Future Tools: planned subscriptions, sponsorships, ads, and revenue imports.
- Technical Checks: owner/dev-only public-safe readiness details, never secret values.

## Event Drilldowns And Audit Explorer

Money Center has two inspection levels:

- Creator Platform Studio Money Center shows creator-owned/source-safe money events only. Rows open `Money Event Detail` with event/source label, status, environment, provider/capability label, timestamp where available, idempotency proof label, reason, next step, and explicit payable state.
- Owner/Admin Money Center includes `Money Audit Explorer` for source rows, provider readiness, kill switch current state, kill switch audit rows, revenue-import/ledger/payout/webhook/sponsor/fraud setup rows, and blocked money actions.
- Owner/Admin `Search Admin` may typeahead over Money Audit events, kill switches, provider readiness, and Live Cost Guard rows only inside the `/admin` permission gate. Result rows open existing Money Center / Live Ops surfaces, mask private identity fields, and must not expose raw provider payloads, provider secrets, webhook secrets, service-role values, authorization headers, or live-money controls.
- As of May 29, 2026, Admin Search writes query-level and result-open audit events through `write_admin_search_audit`. Money/provider search scopes record masked query preview, query type, result count, status, and scope in immutable Admin audit metadata. Email-shaped Admin Search queries are logged as masked email lookups; public Explore still has no email lookup. The audit writer is inspect-only and does not activate checkout, payout, transfer, revenue import, balance creation, sandbox-to-production promotion, Premium grant, or any live-money path.

Creator-safe detail never renders raw provider payloads, service-role values, provider secrets, webhook secrets, private provider internals, other-user ids, or admin-only notes. Owner/Admin detail may show safe ids and safe technical labels, but still never renders provider secrets, raw private provider payloads, service-role values, webhook secret values, Stripe secret keys, RevenueCat secret keys, Google service-account JSON, authorization headers, signatures, tokens, or private metadata blobs.

Sandbox and setup rules:

- Sandbox provider/test rows are labeled `Sandbox only`.
- Sandbox and setup rows are labeled `Not payable`.
- Sandbox rows do not become production revenue.
- Sandbox rows do not create available creator balance.
- Sandbox rows do not enable withdraw, cash-out, payout release, transfer, checkout, unlock, or payable obligations.
- Setup/foundation rows are creator-facing as `Setup only`, `Readiness row`, `Planning record`, or `No verified ledger rows yet`, not confusing raw foundation wording.
- If raw source rows are not safely readable, the UI may show a source-labeled count/detail event, but it must still say the row is not payable and why.

June 1, 2026 Premium sandbox regression note:

- Premium guards are restored, and Money Center does not override them.
- The local Android debug and production RevenueCat public SDK keys are present in ignored local config. `validate:runtime` now reports `revenueCatAndroidPublicKeyConfigured: true`, and the regenerated release bundle contains the public key through the approved client-safe path without printing or committing the value.
- A debug/internal sandbox build may configure RevenueCat with `runtime.revenueCat.androidDebugPublicSdkKey`; a release build needs `runtime.revenueCat.androidPublicSdkKey` plus a freshly generated JS bundle before purchase/restore can be claimed.
- Play-installed v12, signed-in app state, RevenueCat mapping, sandbox purchase, sandbox restore, real RevenueCat webhook delivery, backend `user_entitlements` sync, and Platform Studio unlock are now proved for the licensed sandbox tester. The fresh proof used bounded EAS updates to open only the Premium shell, then closed the shell again with update group `5668cdaa-cd5b-4553-bd91-7b786323fd22`; current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`. Do not mark production Premium active from local config, provider mapping, signed-in screenshots, Play install proof, sandbox screenshots, or setup-only screenshots.
- Backend `user_entitlements` purchase sync is implemented in `revenuecat-webhook`, and the RevenueCat/Supabase webhook secret path is configured. Fresh real sandbox event `0bd7...60d7` plus a later renewal wrote/refreshed a Premium row with `source='revenuecat'`, sandbox Play Store metadata, and no raw provider payload storage. Premium creator tools can unlock only while that backend entitlement is active and unexpired.
- Backend `user_entitlements` active rows can unlock Premium where RLS-visible and trusted, but docs and UI must not label owner setup access, fake rows, or proof-hold state as Premium.
- Watch-Party Live and Live Watch-Party / Live Stage Premium gates remain access gates only. Ticket/seat monetization for both room types is off/setup-only until a real Google Play/RevenueCat-backed product and entitlement path exists; no buy button should appear unless it is truly backed.
- `live_money_enabled`, tips, paid content, payouts, and Stripe checkout for Android digital goods remain off.

`_lib/moneyAuditEvents.ts` is the shared normalization layer for these surfaces. It reads safe source rows where RLS allows and builds source-labeled events from existing read models otherwise. It filters secret-like fields and marks every sandbox/setup event as non-payable.

## Surface Audit And Consolidation

| Path | Current purpose | Backing | Consolidation decision |
| --- | --- | --- | --- |
| `app/channel-settings.tsx` | Platform Studio, old Monetization tab, payout setup UI, provider readiness readout | UI plus safe helpers/RPCs | Kept as the single Money Center surface; old Revenue/Payouts/Store/Stripe sections are section anchors inside Money Center. |
| `app/monetize.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Overview`. |
| `app/revenue.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Creator Balance`. |
| `app/payouts.tsx` | Old route compatibility | Redirect only | Redirects to `Money Center > Payouts`. |
| `app/creator-monetization.tsx` | Creator monetization policy page | Static legal/policy copy | Kept as the Tax & Legal policy destination. |
| `app/subscribe.tsx` | Premium subscription UI | Existing RevenueCat/Google Play flow | Kept; Money Center links to it without changing Premium gates. |
| `app/channel/[userId].tsx` | Public Platform store/product readout | Public-safe rows only | Kept outside Money Center; no checkout is activated. |
| `app/player/[id].tsx` | Creator-paid content access lock/read path | Existing resolver/RPC foundation | Kept; Money Center documents paid-content readiness without changing Player behavior. |
| `app/admin.tsx` | Owner/admin money controls, Premium/store readiness, sponsor/ads/fraud/revenue/payout foundation readouts | Admin-only/foundation helpers plus Money switch and provider readiness helpers | Consolidated into one visible Owner/Admin Money Center tab; old Admin money params map into section anchors instead of separate long top-level money tabs. |
| `_lib/moneyFeatureFlags.ts` | Sanitized Money switch reader and owner/admin writer helpers | Money kill-switch RPCs | Added; normal creators read sanitized states only, owner/admin writes require backend RPC and audit. |
| `_lib/providerReadiness.ts` | Sanitized readiness summary reader | `get_provider_readiness_summary()` | Kept as the visible readiness source for Money Center. |
| `_lib/paymentRailPolicy.ts` | Client-side payment rail doctrine | Static policy helper | Kept; Money Center copy follows it. |
| `_lib/creatorMonetization.ts` | Default-off monetization foundation helpers | Fail-closed RPCs/tables | Kept; no live money flags changed. |
| `_lib/creatorPayouts.ts` | Creator payout readiness, Stripe test-mode setup helpers | Edge Functions/RPCs | Kept; Money Center shows readiness and no payout execution. |
| `_lib/monetization.ts`, `_lib/revenuecat.ts`, `_lib/premiumEntitlements.ts` | Premium/RevenueCat entitlement configuration | Existing Premium path | Kept unchanged. |
| `_lib/platformFinance.ts` | Admin finance foundation readouts | Admin/foundation tables | Kept admin-only; not creator-facing balance truth. |
| `supabase/functions/provider-readiness` | Sanitized provider readiness Edge Function | Authenticated server read | Kept; returns no secrets and no live money action. |
| `supabase/functions/revenuecat-webhook` | Fail-closed RevenueCat webhook shell | Server secret required | Kept; must be idempotent before active purchase handling. |
| `supabase/functions/google-play-webhook` | Fail-closed Google Play webhook shell | Server secret required | Kept; grants no subscription while setup is incomplete. |
| `supabase/functions/stripe-connect-*` | Stripe Connect test-mode setup/sync/webhook foundations | Backend-only Edge Functions | Kept for payout readiness; no Android digital checkout. |
| `supabase/functions/stripe-connect-transfer-create`, `payout-release-preflight` | Admin/operator preflight refusals | Backend-only | Kept closed; no transfer or payout execution. |
| `supabase/migrations/202605140011_creator_monetization_systems_foundation.sql` | Default-off money tables/RPCs including ledger/idempotency | Remote-applied schema | Kept; no fake entries or active live-money rows. |
| `supabase/migrations/202605250002_provider_link_readiness_scaffold.sql` and `202605250004_provider_link_sandbox_proof_status.sql` | Provider readiness source and sandbox proof rows | Remote-applied schema | Kept as readiness truth; only Stripe webhook signature is sandbox-ready. |
| `supabase/migrations/202605270001_platform_money_kill_switches.sql` | Backend Money switch state, audit, sanitized creator RPC, owner/admin write RPC, backend action guards | New schema | Added; defaults are fail-closed and no live money is enabled. |
| `docs/CREATOR_MONETIZATION_SYSTEMS_FOUNDATION.md` | Monetization foundation docs | Documentation | Updated to point creator-facing UI to Money Center. |
| `docs/PROVIDER_LINK_READINESS_RUNBOOK.md` | Provider readiness runbook | Documentation | Updated to point provider status to Money Center. |
| `scripts/guard-*money*` and related policy guards | Static safety checks | Node scripts | Updated/added Money Center guard coverage. |

No separate creator-facing Monetize, Revenue, or Payouts top-level tabs remain in Platform Studio. Admin Revenue and Admin Payouts remain admin-only operational/foundation readouts, not normal creator dashboards.

## Ledger Model

The repo already has an append-only `creator_earnings_ledger` foundation from `202605140011_creator_monetization_systems_foundation.sql`. Money Center treats ledger rows as the only future source for creator balance display. The UI shows `No verified earnings yet` until real verified ledger rows exist.

Future ledger rows must retain:

- creator id;
- provider/source event id and idempotency key;
- product type and product id;
- gross amount, taxes, provider/app-store fees, platform fee, creator share, refunds, reversals, and net amounts;
- status: `pending`, `available`, `paid`, `refunded`, `reversed`, or `blocked`;
- available date, payout batch id, and immutable audit timestamps.

Normal mobile clients must not write ledger rows, payout paid states, provider processed states, or balance totals.

## Webhook And Idempotency Rules

- Every provider event must have a provider event id.
- Duplicate provider events must not create duplicate ledger rows.
- Refunds/reversals must adjust prior entries before payout availability.
- Webhook shells fail closed without valid signature/auth.
- `provider_webhooks_enabled=off` means webhooks may audit readiness only and must not activate money.
- Sandbox events cannot mark production readiness active.
- `live_money_enabled=off` blocks all live-money claims/actions.
- No event can create a payout without a separate owner-approved payout workflow.

## Android Proof

Money Center Android proof should capture Platform Studio tab row, first view, each collapsed/expanded Money Center section, Provider Status, Technical Checks hidden or owner/dev-only, old Monetize/Revenue/Payouts route redirects, locked/setup-needed states, no fake money, and no secrets.

Screenshots must stay outside the repo.

May 26, 2026 proof result: `R5CR120QCBF` captured the consolidated tab row, Money Center first view, Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Future Tools, and owner/dev Technical Checks at `/tmp/chillywood-money-center-proof-20260526-r5/`. The screenshots show locked/setup-needed/sandbox-ready states, no duplicate money tabs, no fake money actions, no Stripe checkout for Android digital access, and no provider secret values.

May 27, 2026 Android refresh proof result: `R5CR120QCBF` was refreshed against current JS by restarting Metro with `--clear`, using `adb reverse tcp:8081 tcp:8081`, clearing `com.chillywood.mobile` app state, and launching the dev-client URL directly. After an active owner account was available, Metro/dev-client still did not attach to the installed Admin bundle, so `./gradlew assembleRelease` bundled current JS and `adb install -r -d android/app/build/outputs/apk/release/app-release.apk` installed over the existing app data. Screenshots live at `/tmp/chillywood-money-center-android-refresh-proof-20260527/` and capture Platform Studio Monetization / Money Center first view, Overview, Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Payouts, Tax & Legal, Provider Status, Technical Checks, Owner/Admin Money Controls, kill-switch rows, `live_money_enabled=off`, and the high-risk Live money confirmation/reason sheet. The Payouts section shows the final tightened current-JS state: no setup-payout CTA, no payout release, no balance, no withdrawal, no transfer, and only a read-only status refresh.

May 27, 2026 kill-switch proof result: the linked Supabase environment now has `202605270001` applied and aligned. A signed-in proof-account probe returned 17 creator-safe switch summary rows, no secret-like fields, `live_money_enabled=off`, `payouts_enabled=off`, digital sales/tips/Watch-Party seats/paid content/merch off, and Stripe Connect/RevenueCat-Google Play/provider webhooks sandbox-only. Direct table update was denied with `42501`; switch write RPC attempts were denied with `money_kill_switch_admin_required`; no toggle was performed and no live-money state changed. Owner/Admin Money Controls runtime proof used the logged-in owner account after release reinstall: Admin was opened with `chillywoodmobile://admin`, then Kill Switches was selected from the internal tab strip because `app/admin.tsx` does not consume `tab=kill-switches`. The high-risk Live money confirmation sheet required a 12+ character reason, warned that backend RPC and immutable audit must happen before creator-visible changes, and was cancelled without submitting.

May 27, 2026 Owner/Admin Money Center consolidation result: `app/admin.tsx` now consumes `tab`, `section`, and `focus` query params, exposes one visible `Money Center` tab, and maps old Admin money tabs into collapsible Money Center sections. The consolidated UI reads `readPlatformMoneyKillSwitches()`, `listPlatformMoneyKillSwitchAudit()`, and `readProviderReadinessSummary()`; no provider secret values or raw payloads are rendered. Android `R5CR120QCBF` proof lives at `/tmp/chillywood-admin-money-center-proof-20260527/`. It used a current release APK installed over the existing owner session, opened `chillywoodmobile://admin?tab=money-center`, and captured the Admin tab row, Owner/Admin Money Center first view, Overview, grouped Kill Switches, Premium / RevenueCat / Google Play, Sponsors / Ads, Fraud & Risk, Digital Sales, Tips / Watch-Party Seats / Paid Content, Merch, Creator Balance / Ledger, Payouts / Stripe Connect, Provider Webhooks, Tax & Legal, Audit Trail, Technical Checks, and creator Money Center disabled/setup consistency. The high-risk Live money confirmation sheet was opened and cancelled; no switch was confirmed and `live_money_enabled` stayed off.

May 27, 2026 Ledger Audit Explorer proof result: creator Money Center event rows now open sanitized `Money Event Detail` sheets, and Owner/Admin Money Center now includes `Money Audit Explorer` with filters for production, sandbox, setup, blocked actions, kill switches, provider readiness, ledger, revenue imports, payouts, sponsors/ads, fraud/risk, webhooks, digital sales, and merch. Admin details show safe source table/event/actor/target/provider/capability/environment/idempotency/reason/timestamp metadata and inspect-only action-safety copy. Creator details hide other-user ids and private/admin fields. Sandbox and setup rows are labeled `Sandbox only` or `Setup only` plus `Not payable`. Android `R5CR120QCBF` proof lives at `/tmp/chillywood-money-audit-explorer-proof-20260527/`. It used `./gradlew assembleRelease`, installed the release APK over the existing owner session with `adb install -r -d`, opened creator/admin deep links, and captured creator event rows/detail, creator balance detail with no verified earnings/not payable, Provider Status readiness, Owner/Admin Money Audit Explorer metrics and Sandbox/Setup filters, sandbox row detail, kill-switch event detail, sponsor/fraud/money-control drilldown surfaces, no secret exposure, no fake money, and no withdrawal/cash-out action. No schema migration, live-money activation, fake balance, payout, checkout, transfer, withdrawal, Premium gate change, LiveKit change, or Watch-Party behavior change was added.

May 27, 2026 provider CLI proof result: Stripe CLI fired a test-mode `payment_intent.succeeded` event and resent the same event to the enabled Chi'llwood Connect test webhook endpoint. Stripe reported `livemode=false` and `pending_webhooks=0` after delivery. Owner/Admin Money Audit Explorer on `R5CR120QCBF` shows the resulting provider webhook source row as `Sandbox only`, `Not payable`, `ignored`, provider `stripe_connect`, provider environment `test`, `livemode=false`, event type `payment_intent.succeeded`, and duplicate-safe/idempotency labeled. Screenshots live at `/tmp/chillywood-provider-cli-proof-20260527/`. Supabase names-only secret inventory still has Stripe webhook secrets configured but no `REVENUECAT_WEBHOOK_SECRET` or `GOOGLE_PLAY_WEBHOOK_SECRET`; no official RevenueCat CLI is installed locally; Google CLI confirmed Android Publisher/PubSub APIs are enabled but no Pub/Sub topics exist, and Android Publisher subscription read proof returned `403` for both the active user and the local Google Play service account. RevenueCat/Google signed webhook proof remains blocked on server-side secret/provider permission linking. No live money, payable ledger, payout, transfer, withdrawal, checkout, Premium gate change, provider secret exposure, or raw provider payload display occurred.

May 27, 2026 validation commands passed:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `supabase migration list`
- `supabase db lint --linked --schema public --fail-on error`
- `supabase db push --dry-run`

Targeted source scans for fake earnings/tips/payouts/balances/checkout, Stripe checkout misuse for Android digital goods, provider-secret rendering in Money Center/Admin money files, live-money movement calls, duplicate creator-facing money tabs, user-facing `Mini Platform`, provider readiness source usage, Premium changes, and LiveKit/Watch-Party changes found only locked/negative policy copy, admin-only readouts, or no product-code changes.

## Remaining Limitations

- RevenueCat and Google Play server/webhook secrets still need provider credential linking and signed sandbox event proof before production-active status.
- Stripe Connect production payout readiness, tax/KYC completion, owner approval, and payout execution remain blocked.
- Paid content, tips, Watch-Party seats, merch checkout, sponsorships, ads, and revenue imports remain planned/readiness-only.
- No live money was activated by this consolidation.
- Owner/Admin switches are a control scaffold, not payout or checkout activation.
- A harmless audited switch mutation was not performed in this proof. Future no-live audit proof should be explicit, reasoned, and owner-approved before using the backend write RPC.
- Stripe signed sandbox event firing/idempotency is now CLI-proved and inspectable in Money Audit Explorer. RevenueCat/Google signed webhook proof remains blocked until missing server webhook secrets and provider permissions are linked.
