# iOS RevenueCat and Stripe Provider Closeout

Checkpoint date: 2026-07-15

Status: **Complete — RevenueCat's Apple catalog, dedicated Apple In-App Purchase
credential, and Stripe platform-neutral lanes are configured and verified. The
purchase rail remains disabled pending bounded physical TestFlight proof.**

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
match the repository manifest. The comparison found provider-catalog differences:

| Field | Provider-generated configuration | Repository reference |
| --- | --- | --- |
| Eight consumable prices | All `0.99` | Tiered `0.99`, `2.99`, `4.99`, `9.99` |
| Premium monthly | `9.99`, one month | `9.99`, one month |
| Premium yearly | `99.99`, one year | `99.99`, one year |
| Subscription group | `premium` | `chillywood_premium` |

Because provider catalog truth and the repository reference differ, the committed
`config/ios/Chillywood.storekit` fixture was not overwritten. The local harness now
supports an explicitly supplied external StoreKit path. With the provider-generated
configuration it passed 3/3 Simulator tests, and `SKInternalErrorDomain Code 3` did
not recur. This is Simulator evidence, not TestFlight StoreKit proof.

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
- AASA, iOS commerce catalog/policy, media, push-platform, native-call, VoIP,
  privacy-manifest, and release-workflow guards/proofs;
- Stripe Connect, refund/credit/payout-hold, and creator-monetization policy
  guards;
- Expo Doctor, 18/18; and
- `git diff --check`.

The external provider-generated StoreKit configuration also passed the dedicated
Simulator harness 3/3. All seven independent GitHub checks passed on the pushed
credential-closeout documentation head.

## Remaining bounded proof

1. Keep the App Store rail off until a bounded internal-TestFlight purchase is
   explicitly approved.
2. Complete physical TestFlight purchase, Restore Purchases, renewal,
   cancellation, refund, and revocation testing in the final device matrix.

No public release, external TestFlight distribution, production OTA, live money,
payout, transfer, cash-out, Stripe iOS digital checkout, or provider credential
exposure is part of this closeout.

One diagnostic view of the webhook TEST response included a transient Cloudflare
response `Set-Cookie` header. It was not a RevenueCat dashboard-session credential,
was not persisted or reused, and was not committed. No RevenueCat, Stripe, Apple,
Supabase, or EAS private key, bearer token, signing secret, password, or 2FA value
was printed or committed.
