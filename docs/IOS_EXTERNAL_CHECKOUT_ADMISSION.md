# iOS external checkout admission: source qualification

The installed `react-native-purchases` 9.15.1 SDK exposes
`Purchases.getStorefront(): Promise<Storefront | null>`. Its hybrid `Storefront`
contains `countryCode`, not the native StoreKit numeric identifier. Admission
uses the actual fresh `USA` country observation; it does not invent an identifier
or obtain country from locale, IP, `Platform.OS`, or editable user metadata.

`apple_app_store` is the server's distribution label for a separately qualified
capability. It is not a field returned by the native SDK. The immutable
capability must already approve the exact creator, feature, US route, currency,
test environment, provider account, method and limits. No approval rows or
provider configuration are seeded by this migration.

The client verifies the configured RevenueCat customer matches the current
authenticated buyer, reads the storefront before automatic session admission,
and reads it again immediately before opening the full system browser. Missing,
non-US, timed-out or stale-account responses do not open checkout. The RPC
issues a short-lived, amount-bound eligibility observation, not money or access.
Existing quote, recipient, current-session and payment verification guards still
apply independently.

Admission can refresh a still-valid, already-bound Checkout Session during its
last thirty minutes. It does not authorize a second session: new checkout
creation independently retains Stripe's minimum expiry window, and capability
revocation blocks returning the old link. A disposable SQL test advances only
PGlite's in-process clock to prove existing-session recovery, immutable request
retention, new-short-session rejection and revocation together.

The observation is explicitly `native_storefront_observation_unverified`.
It is not cryptographic Apple attestation, Apple program approval, a verified
payment, an entitlement or evidence of installed-device success. Production
activation still needs qualified provider configuration, policy review and
actual native/storefront/purchase testing. The source alone does not authorize
live money, payouts, provider changes or publication.

Local tests execute the production helper and actual migration SQL, including
both API-grant fixture modes. They use synthetic SDK/provider observations and
do not contact Apple or RevenueCat. Shared TypeScript checks the helper against
the installed SDK type so unsupported fields cannot silently become fixtures.
