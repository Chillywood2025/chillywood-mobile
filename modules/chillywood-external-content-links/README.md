# Android Google Play external content links

Source-only Expo local module. Expo autolinks this Android-only module from
`modules/`; it does not replace RevenueCat's native purchase integration.

## Flow and boundaries

1. The installed bridge must advertise API revision 1. Older native runtimes
   (including the existing V17 cohort) fail with `ECL_UPDATE_REQUIRED` before a
   checkout callback can run. A JS update cannot add this bridge.
2. On the main thread, create a short-lived, listener-free BillingClient with
   `EXTERNAL_CONTENT_LINK`, connect, check program availability, then create a
   fresh reporting token. Do not cache tokens across visits.
3. The authenticated callback must bind the token privately to the exact buyer,
   session, capability, quote and attempt before returning a checkout URL. It
   sends `google_play_external_transaction_token` and
   `google_play_external_link_api_version: 1`. Client capability/eligibility is
   not attestation or backend authorization. Never put tokens in Stripe
   metadata, browser URLs, logs, analytics or AsyncStorage.
4. `launchExternalLink` uses `LINK_TO_DIGITAL_CONTENT_OFFER` and
   `LAUNCH_IN_EXTERNAL_BROWSER_OR_APP`. Google owns its disclosure and link-out.
   There is no WebBrowser/Linking fallback on any error or user cancellation.
5. Launch success is not payment success. Existing verified backend settlement
   remains the only source of entitlement. Every retry requires a new token and
   new private launch binding, even if the backend reuses a checkout session.

The native coordinator serializes flows, rejects replay/reentrant launches,
ignores late callbacks and expires preparation/quote waits after 120 seconds.
Backgrounding before launch cancels the flow. Once Google owns its disclosure,
backgrounding is expected; its response, disconnect or Activity destruction
terminates the request. Activity/module destruction closes the service binding.
No timer admits a second disclosure while the first is still open.

## Dependency and qualification

Billing is strictly pinned to **8.2.1**. This raises the app's shared dependency
from RevenueCat purchases 9.28.1's Billing 8.0.0 requirement. A separate client
does not isolate dependency versions. Review the actual resolved graph and
regress native RevenueCat purchases/restore alongside this flow.

The 8.2.1 binary supports `enableBillingProgram(int)`, not the newer params
overload shown in current documentation samples. The implementation is compiled
against the real pinned artifact rather than relying on sample text.

Checks:

```sh
node scripts/test-google-play-external-content-links.mjs
node scripts/compile-google-play-external-content-links.mjs
```

The second check downloads SHA-256-pinned official Billing, Android API classes
and ECJ artifacts, compiles the real Java adapter, and executes JVM flow tests.
It is **not** an Expo Kotlin bridge/full generated Android application compile.
Required additional qualification: generated-source/autolinking and manifest
review; actual Gradle debug/release module Kotlin+Java compile with the app's
resolved dependency graph; native lifecycle instrumentation; license-tester
device evidence for unavailable, cancel, eligible, retry and native RevenueCat
flows. No build distribution or money/provider activation is authorized here.

This is a native input change. The release owner must assign a new prospective
runtime/cohort, update digests using canonical tooling and obtain a fresh signed
build before this can become an installed capability. Do not broaden the old
runtime's capability record or use OTA to claim native support. Backend program
enrollment, reporting readiness and cohort configuration remain fail-closed.

Primary references:
- https://developer.android.com/google/play/billing/externalcontentlinks/integration
- https://developer.android.com/google/play/billing/outside-gpb-backend
