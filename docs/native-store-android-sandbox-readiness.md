# Android native-store sandbox readiness

Checked against source `dfc481e9029614c89233e1be614adcf5be53540f` and official
provider documentation on 2026-11-09. This is a source/design assessment, not
provider configuration, installed-device evidence, or permission to charge.

## Current behavior

The normal app supports Google Play quote preparation, catalog reads, exact
selection recovery, and receipt reconciliation for ordinary active accounts.
There is no admin-role requirement. **Android native checkout is not enabled.**
This patch adds an explicit Play-sheet source path and a separate default-off,
forward-only backend extension. Neither is installed by this source work.
Adding a Play tester alone cannot enable the old deployed dispatch path.

`nativeStoreSandboxDispatch.ts` returns a known blocked result before any
storage, network, reservation, or SDK operation when Play instructions have not
been acknowledged in the visible normal screen. A legacy quote-wide Play
qualification remains blocked with `platform_no_charge_proof_unsupported`.
Only a fresh buyer/session-scoped handoff may proceed. Explicit recovery may read the
original saved attempt for either native store; recovery cannot consume another
attempt or call the purchase SDK. Account, selection, reservation, quote, and
original request checks still apply. Missing or corrupt markers fail closed.

The existing branded preparation screen explains the provider prerequisites and
requires an explicit acknowledgment before opening Google's UI. This is not a
bypass or proof of a test payment method. It adds no admin entitlement or new
purchase owner. App Store admission is unchanged.

## What provider testing establishes

[Google's testing guide](https://developer.android.com/google/play/billing/test)
requires the purchasing Google account to be a license tester to use test
payment methods. Installing from a testing track is insufficient. On a device
with multiple accounts, Google selects a purchase account using its installation
rules; the app's signed-in user is not that account. The purchase sheet exposes
the account, a test-purchase notice, and test instruments. Billing Lab also
supports real-payment testing, so license-tester membership alone must not be
treated as an unconditional no-charge guarantee. Every intended tester needs
the supported setup; this is unrelated to their app role.

[RevenueCat's Android testing guide](https://www.revenuecat.com/docs/test-and-launch/sandbox/google-play-store)
also separates track testers from license testers and documents real purchases
when license testing is absent. Its
[environment guide](https://www.revenuecat.com/docs/guides/environment-strategies)
explains that the same platform SDK key may handle sandbox and production, with
the environment distinguished on purchase events. An old sandbox receipt or
RevenueCat customer is not evidence of the next payment sheet's account.

The checked [BillingClient public interface](https://developer.android.com/reference/com/android/billingclient/api/BillingClient)
and installed `react-native-purchases` 10.15.1 interface do not expose a verified
pre-purchase license-tester/payment-instrument assertion for this admission.
[BillingConfig](https://developer.android.com/reference/com/android/billingclient/api/BillingConfig)
exposes country, not a sandbox-account guarantee. This is a finding about the
reviewed supported interfaces, not a claim about undocumented platform internals.

## Completion path and preserved boundaries

1. Verify the real normal-package build, store products, RevenueCat app/product
   mapping, receipt route, and each intended tester's Play license setup. Keep
   live money and real-payment testing off. Do not save account addresses,
   credentials, private receipts, or payment details in source or evidence files.
2. Define Android admission around evidence the provider actually supplies.
   A supervised test can verify the actual Play sheet's test notice and test
   instrument and cancel otherwise. That human check is not equivalent to an
   automatic pre-purchase proof for arbitrary accounts. It must not be renamed
   or represented as such in the protocol or UI. The current automatic
   no-charge admission cannot be removed merely to open the sheet.
3. Implement and review that explicit Android evidence/interaction contract
   across client, server qualification, one-shot dispatch, and tests. Reuse the
   normal app's existing purchase owner and shared layout. Do not use a second
   debug app or grant an app administrator special access.
4. Observe a real no-charge one-time consumable callback and authenticated
   `PLAY_STORE` / `SANDBOX` provider event. Match the exact project, app, buyer,
   product, amount, currency, original transaction, and immutable selection.
   Subscription history cannot substitute for this protocol observation.
5. Retain one-shot consumption, original-account callback retention, uncertain
   outcome recovery, unique settlement/allocation, refund handling, and fresh
   private playback authorization. Production events must not create sandbox
   grants. Only a verified test allocation may open the normal protected player;
   no callback or setup checkbox creates access or payable earnings.

The source changes in this patch do not complete steps 1–5 and are not a
provider or hosted database change. Synthetic tests
do not establish real-device, Play-account, payment-sheet, or receipt evidence.

## Normal-app Play test-sheet handoff contract

This is the source contract for actual Android checkout, not an activated
path. It keeps the normal package and the current RevenueCat
purchase owner. It does not substitute the separate Test Store debug app.

### Platform interaction

[Google's billing integration contract](https://developer.android.com/google/play/billing/integrate)
has two application-facing stages: launch the system purchase screen, then
receive completion/cancellation through the purchase listener. Launch success
is not purchase success. The documented
[purchase listener](https://developer.android.com/reference/com/android/billingclient/api/PurchasesUpdatedListener)
does not expose a pre-confirmation test-instrument approval hook, and the
[billing-flow builder](https://developer.android.com/reference/com/android/billingclient/api/BillingFlowParams.Builder)
does not offer a sandbox-only restriction. Do not scrape another app's sheet,
create a second BillingClient, automate Buy, or invent a native attestation to
bridge this gap.

The app can explicitly hand final confirmation to the human in Google's UI.
Before opening it, show the exact quote and explain that the user must check
the actual purchasing account, the test notice, and a test instrument, and
cancel otherwise. The button should say **Open Google Play test checkout**,
not **Verified free purchase**. Acknowledging these instructions is awareness,
not provider evidence. The sheet is not a read-only preview: opening it exposes
Google's confirmation controls. A design using this handoff must disclose that
the platform/account setup and user's final choice prevent a charge; software
cannot guarantee it for arbitrary accounts before purchase.

### Minimum server extension

The installed protocol qualification is catalog/quote-wide. Its existing
`play_license_account` label and evidence hash contain no buyer binding, so
they must not be admitted for every app user. Implement a new forward-only
extension, without rewriting the installed 48-module source history:

- A default-off Play handoff control, separate from App Store qualification.
- Immutable, operator-issued enrollment records scoped to an ordinary app
  buyer, verified Play setup evidence, normal package/build, protocol evidence,
  expiry, and revocation. No app-admin role requirement and no wildcard buyer.
  Every intended tester can be enrolled. Enrollment is not a signed assertion
  of whichever Google account the device might choose later.
- A fresh authenticated resolver that joins the buyer/session, exact selection,
  quote/catalog revision, provider connection, active enrollment, and evidence
  revision. It must reject missing, expired, conflicting, or revoked evidence.
- An explicit wire mode such as `play_test_sheet_handoff_v1`, with
  `automaticNoChargeProof: false` and `userStoreConfirmationRequired: true`.
  Never populate Apple `signedAppVersion` with an unsigned Android version or
  label enrollment evidence as verified payment-sheet content. The old Android
  `play_license_account` metadata alone must stay non-dispatching.
- Record the handoff/enrollment revision against the consumed attempt in the
  same bounded transaction as the existing one-shot consumption. Discovery is
  read-only; uncertainty must not create a replacement attempt. These records
  authorize presenting the provider UI only, not grant settlement or payment.

The client then validates the explicit mode, ordinary account/session, normal
Android package/build, existing SDK identity, and fresh exact store product
before consuming that one attempt. It persists the same consumed/pre-SDK
markers and original callback retainer already used by Apple. Only an explicit
foreground action opens Google's UI. Backgrounding, return navigation, reload,
and recovery must never automatically reopen it. Purchase settlement and
private playback continue through the existing authenticated sandbox pipeline.

### Required evidence before calling Android finished

- Exact-source automated tests for forged enrollment and modes, cross-account
  recovery, expiry/revocation, changed products/prices, old sessions, duplicate
  presses, interrupted writes, and lost/cross-account callbacks.
- A real normal-package Android device with a verified intended tester, a
  visible Google test notice/test instrument, and real-payment testing off.
- Exact one-time purchase callback plus authenticated sandbox event, one
  allocation, normal protected playback, then refund/revocation proof.
- A cancellation/mismatch exercise: cancelling Google's sheet must retain the
  original consumed attempt and never silently rearm it. Any additional
  terminal-release design needs its own server-authoritative review; a client
  `USER_CANCELED` string is not enough to erase a possibly relevant record.

This handoff preserves server authorization and entitlement controls. It changes
the pre-purchase no-charge assurance from automatic software proof to explicit
provider setup plus human confirmation. That distinction must be intentional
and visible, rather than hidden behind a permissive platform check.

## Source implementation and verification

- Client: `nativeStorePlayTestHandoff.ts` restricts normal Android package/build
  and foreground lifecycle without claiming signed evidence. The dispatcher
  and shared wire validator require exact buyer/session enrollment, a fresh
  explicit acknowledgment, visible route, matching product, and first committed
  consume. The shared purchase owner rechecks the synchronous launch restriction
  after identity-queue/authority waits, including enrollment expiry. Blur or
  background before launch retires the action; lifecycle changes from Play's
  sheet after launch do not discard the original callback. Recovery never
  reopens Play or rearms an attempt.
- Server: `isolated-runtime/native-store-play-handoff-v1/handoff.sql` and
  `settlement.sql` add private forced-RLS evidence, consumption, original receipt
  correlation, unique allocation, refunds/tombstones, terminal recovery and
  protected playback validation. Existing function OIDs and original Apple
  implementations are retained. The installed 48-module closure is unchanged.
- Local proof: 98 focused JavaScript tests cover mounted normal-account UI,
  dispatch, account/lifecycle interruptions, wire boundaries and authenticated
  encrypted Play replay. Managed PostgreSQL 17.6 tests cover 20 handoff/install
  groups and 15 settlement groups, including two ordinary buyers, wrong and
  production identity, duplicates, rollback, refunds, and Apple regression.
- TypeScript, targeted lint, and direct Deno 2.9.6 checks of changed shared
  modules pass. The new PostgreSQL harness is mandatory in Required Validation.
  Full local frozen endpoint-runtime tests require the pinned Supabase package
  cache; a missing cache or unavailable dependency download is not a pass.

No provider connection, real tester enrollment, hosted installation, release,
physical-device purchase, or activation is performed by this patch. Required
exact-head CI and source review remain separate from these local checks.
