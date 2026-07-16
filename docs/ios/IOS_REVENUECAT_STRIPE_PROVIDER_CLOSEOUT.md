# iOS RevenueCat and Stripe Provider Closeout

Checkpoint date: 2026-07-16

Status: **Provider configuration, atomic/storefront-safe backend correction, and
all-flags local QA binary preparation are complete.** RevenueCat's Apple catalog
and credential remain valid, transactional RPCs are deployed, the purchase rail
remains disabled, build 7 remains native-disabled, and build 8 is isolated on
`ios-qa` / `1.0.0-iosqa1`. The physical StoreKit matrix has not begun.

This bounded closeout started from branch `codex/ios-integration-90` at
`97cd97cd58b021d2f45021c3e121b8a35158cee8` in draft PR
[#10](https://github.com/Chillywood2025/chillywood-mobile/pull/10). It reuses the
existing Chi'llywood RevenueCat project and Stripe account. It does not create a
second provider account, enable a purchase rail, or authorize public release.

## RevenueCat access and app

The existing secure Keychain-backed API v2 configuration key was reused. Readback
confirmed all required project-configuration read/write scopes for projects, apps,
products, entitlements, offerings, packages, and integrations. No replacement or
additional RevenueCat key was created, and no key value was written to Git or
client configuration.

| Item | Verified state |
| --- | --- |
| RevenueCat project | `projc5629a24` |
| Existing Android app | `appd24db94dd8` — preserved |
| Apple app | `app3a0ad1ba62` — Chi'llywood (App Store) |
| App type | App Store |
| Bundle identifier | `com.chillywood.mobile` |
| Public iOS SDK key | Configured; masked record `appl…gpDW` |
| EAS variable | `EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY` |
| EAS environments | Sensitive variable present in development, preview, and production |

Resolved Expo configuration reports the iOS RevenueCat key as configured without
displaying its value. The existing Android RevenueCat app, products, offerings,
and mappings were not replaced.

## Apple product catalog

Exactly ten Apple products are attached to the Apple app:

| Concept | Product identifier | RevenueCat type |
| --- | --- | --- |
| Premium monthly | `com.chillywood.premium.monthly` | Subscription |
| Premium yearly | `com.chillywood.premium.yearly` | Subscription |
| Creator tip tier 1 | `com.chillywood.tip.tier1` | Consumable |
| Creator tip tier 2 | `com.chillywood.tip.tier2` | Consumable |
| Creator tip tier 3 | `com.chillywood.tip.tier3` | Consumable |
| Creator tip tier 4 | `com.chillywood.tip.tier4` | Consumable |
| Seat Pass tier 1 | `com.chillywood.seatpass.tier1` | Consumable |
| Seat Pass tier 2 | `com.chillywood.seatpass.tier2` | Consumable |
| Seat Pass tier 3 | `com.chillywood.seatpass.tier3` | Consumable |
| Seat Pass tier 4 | `com.chillywood.seatpass.tier4` | Consumable |

No Paid Video, VIP, Event Pass, or Channel Subscription product was created in
this closeout. All Apple commerce remains sandbox/internal and the App Store
purchase rail remains off.

An initial API create attempt caused RevenueCat to normalize the eight new
one-time draft records to non-renewing subscriptions. Immediate readback caught
the mismatch. Only those eight newly created RevenueCat draft records were
removed and recreated as consumables; no permanent App Store Connect product ID
was deleted or changed. Final idempotent readback is the ten-product state above.

## Entitlements, offerings, and packages

- Entitlement `premium` (`entl8e5fc37210`) attaches only the monthly and yearly
  Premium subscriptions.
- Existing offering `default` was reused. Packages `$rc_monthly` and `$rc_annual`
  attach the matching Apple subscriptions additively; existing Android/Test Store
  mappings remain intact.
- Offering `creator_support` contains `tip_tier_1`, `tip_tier_2`, `tip_tier_3`,
  and `tip_tier_4`, each attached to its exact Apple consumable.
- Offering `seat_passes` contains `seat_pass_tier_1`, `seat_pass_tier_2`,
  `seat_pass_tier_3`, and `seat_pass_tier_4`, each attached to its exact Apple
  consumable.
- Tips have no digital-access entitlement. Seat Pass packages do not grant
  Premium, host, speaker, moderator, admin, direct LiveKit publish authority, or
  payable creator value.

Idempotent readback confirmed the app association, product types, entitlement
attachments, and package-product relationships.

## RevenueCat webhook

Existing webhook `whintgr38699522f7` was reused. It is project-wide rather than
Android-app-scoped, covers both production and sandbox environments, and points to
the existing Supabase RevenueCat function. No duplicate integration was created.

A bounded provider TEST returned HTTP 200 with:

- `signatureVerified=true`;
- `webhookProcessed=true`;
- `premiumGranted=false`; and
- `liveMoneyAction=false`.

This proves the shared authorization contract without recording or exposing the
header value. The RevenueCat App Store rail, live money, payouts, transfers,
cash-out, and payable balances remain off.

### Atomic normalized-event application

`revenuecat-webhook` v72 now verifies and normalizes provider input, validates the
store/product policy, stores no raw provider payload, and calls service-only
PostgreSQL transactions:

- `process_revenuecat_premium_event_atomic` handles provider-event idempotency,
  `user_entitlements`, `billing_events`, `access_grants`,
  `money_access_ledger_events`, and lifecycle state in one transaction;
- `process_revenuecat_consumable_event_atomic` requires the exact sandbox mapping
  and purchase intent, creates no entitlement/access grant for tips, grants only
  viewer access for Seat Passes, consumes/revokes the intent, and never creates a
  payable balance or room authority. Permanent product/store/user/concept/tier and
  exact intent identity are authoritative for App Store consumables; actual
  `provider_amount_minor` and `provider_currency` are retained separately from
  `reference_price_minor` metadata, so a valid localized storefront price is not
  rejected; and
- `reconcile_revenuecat_partial_provider_events` provides restricted readback for
  older partial events.

Forced failures after every provider, entitlement/billing, access, ledger, and
intent boundary rolled back completely in local pgTAP tests. Duplicate delivery,
initial purchase, renewal, cancellation-through-paid-period, expiration, billing
grace, refund/revocation, creator tip, Seat Pass, and missing-intent cases passed.
The deployed reconciliation readback lists two historical Google Play event-pass
rows missing ledger effects. They were deliberately not mutated.

The price correction migration was absent from remote history before deployment.
Restricted predeployment readback recorded `499` monthly and `4999` yearly; remote
postdeployment readback is exactly:

- `com.chillywood.premium.monthly = 999`;
- `com.chillywood.premium.yearly = 9999`;
- `platform=ios`, `store=app_store`, `provider=revenuecat_app_store`;
- `environment=sandbox`, `status=sandbox`; and
- unchanged Android product count/digest `15` /
  `4fb5d0565f6697269e2572a63d3bd678`.

Deployed migration inventory additions are
`20260718091500_fix_ios_app_store_premium_reference_prices`,
`20260718110000_revenuecat_atomic_event_transactions`,
`20260718113000_durable_call_delivery_retry_and_storefront_prices`,
`20260718114500_enable_chat_call_transition_retry_scheduler`, and
`20260718120000_index_terminal_retry_and_revenuecat_intent_links`, plus the
server-only call transition/hardening migrations recorded in `IOS_STATUS.md`.
The App Store switch remains `off`; live money and payouts remain `off`.

## Apple In-App Purchase Key completion

An authorized App Store Connect owner session generated a dedicated Apple In-App
Purchase Key. It was downloaded exactly once, removed from Downloads, stored in an
owner-only local Apple credential directory with mode `600`, and also recorded as
a macOS Keychain generic-password item. The private key contents were never read,
printed, parsed, or placed in Git.

The key was uploaded directly to RevenueCat Apple app `app3a0ad1ba62` with its
matching Issuer ID. RevenueCat reported `Valid credentials`; that result persisted
after a full page reload and a second validation. The existing App Store Connect
API credential also remained `Valid credentials`.

RevenueCat documents this as mandatory for StoreKit 2 transaction recording in
its [In-App Purchase Key configuration guide](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration).

Credential configuration is complete. This record still does not claim a real
purchase, restore, renewal, cancellation, refund, or revocation proof; those remain
bounded physical TestFlight tests with the App Store purchase rail otherwise off.

## Provider-generated StoreKit comparison

RevenueCat's generated StoreKit configuration was saved outside Git with owner-only
mode `600`. Its identifiers, product types, and Premium subscription durations
match the repository manifest. Current Premium and consumable reference prices now
align with the canonical repository fixtures. StoreKit may still return localized
amount/currency for a valid permanent product; the webhook records that provider
truth without treating the US reference price as an authorization check. The local
harness supports an explicitly supplied provider StoreKit path, passed 3/3
Simulator tests, and did not reproduce `SKInternalErrorDomain Code 3`. This is
Simulator evidence, not TestFlight StoreKit proof.

## Stripe iOS parity readback

Stripe remains the existing test-mode, platform-neutral lane for physical
merchandise and Connect onboarding/readiness. It is not an iOS digital-goods rail.

Verified without displaying secret values:

- Supabase contains the required secret names `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, and `STRIPE_MERCH_WEBHOOK_SECRET`;
- active test-mode endpoints exist for physical merchandise and Connect, plus the
  pre-existing tip endpoint;
- platform charges and payouts are disabled;
- the latest merch records include processed sandbox events and safely ignored
  unrelated event types: the newest unrelated payment-failure event was ignored,
  while the newest supported checkout-expiration records were processed;
- the latest Connect webhook records are test-mode and ignored where the
  fail-closed event filter does not authorize processing, including the newest
  unrelated payment-failure event;
- provider readback found ten connected test accounts, five visible in the Express
  dashboard; and
- the latest Express readiness record has charges disabled, payouts disabled,
  transfers inactive, and 13 outstanding/past-due requirements.

The iOS client has no Stripe checkout path for Premium, digital tips, Seat Passes,
paid digital content, or other in-app digital goods. No Stripe product, charge,
payout, transfer, cash-out, withdrawal, or payable creator balance was created by
this closeout.

## Validation result

Provider-closeout source hardening is committed separately at `0ec109db`. The
complete requested local suite passed under Node `20.20.2`:

- `npm ci`;
- repository lint with zero errors and 87 visible warnings;
- TypeScript with `npx tsc --noEmit`;
- normal and strict-iOS runtime validation, with the Firebase file and iOS public
  SDK key present while App Store purchases remain disabled;
- route, payment-rail, notification/room/call, watch-party, old-room, and iOS
  configuration guards;
- canonical call response/token/action fixtures and 92 local database assertions,
  including localized non-USD App Store consumable acceptance and forced rollback;
- AASA, iOS commerce catalog/policy, media, push-platform, native-call, VoIP,
  privacy-manifest, and release-workflow guards/proofs;
- Stripe Connect, refund/credit/payout-hold, and creator-monetization policy
  guards;
- Expo Doctor, 18/18; and
- `git diff --check`.

The external provider-generated StoreKit configuration also passed the dedicated
Simulator harness 3/3. Final QA source
`bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae` passes the complete local Node 20
suite, 92 database assertions, and all eight remote checks. Replacement Simulator
`b9bb006e-1a96-4817-8ee2-6f3647983d8b` passed fresh install/launch smoke. Inspected
EAS build `8bfbd8cf-aa1b-4ba0-bebf-413ae0f60555`, Apple build
`b5eaaad6-ef24-49c5-8e50-b10cf2807412`, version `1.0.0 (7)`, is assigned only to
`Chillywood Internal`; this is build readiness, not StoreKit transaction proof.
Local all-flags build 8 uses source `bbb9d6db`, channel/runtime
`ios-qa` / `1.0.0-iosqa1`, and submission
`e0b894e3-5dfc-44c5-9da2-e36c3b85bd5b` / Apple build
`a6ed5eda-fe76-4dd0-b18c-d00c72b0f00f`, assigned only to
`Chillywood Internal`. Its RevenueCat client surface is enabled,
but `revenuecat_app_store_enabled` and every money switch remain off until one
separately approved sandbox test.

## Remaining bounded proof

1. Keep the App Store rail off until a bounded internal-TestFlight purchase is
   explicitly approved.
2. Complete physical TestFlight purchase, Restore Purchases, renewal,
   cancellation, refund, and revocation testing in the final device matrix.

No public release, external TestFlight distribution, Android OTA, live money,
payout, transfer, cash-out, Stripe iOS digital checkout, or provider credential
activation is part of this closeout. The one production-channel OTA is iOS-only,
runtime `1.0.0`, and bounded to build-7 JavaScript QA with native calls false.

One diagnostic view of the webhook TEST response included a transient Cloudflare
response `Set-Cookie` header. It was not a RevenueCat dashboard-session credential,
was not persisted or reused, and was not committed. No RevenueCat, Stripe, Apple,
Supabase, or EAS private key, bearer token, signing secret, password, or 2FA value
was committed, pushed, or placed in PR/CI. During separate local Apple-signing
diagnosis, two P12 payloads appeared only in the private tool transcript; both
affected certificates/profiles were revoked immediately, and the final replacement
credential remained contained.
