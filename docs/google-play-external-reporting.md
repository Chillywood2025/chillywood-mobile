# Google Play external content links: source-only reporting

This is dormant source, not enrollment, deployment, native installed-device
proof, a real Google acknowledgement, or payment/payout authorization. The
owner's observed Play Console eligibility is **not eligible**; no qualification
rows, credentials, license testers, worker schedule, or provider writes are
created by this change. Android external checkout must remain unavailable.

## Admission and launch

1. The native PBL 8.2.1 adapter checks actual `EXTERNAL_CONTENT_LINK` runtime
   eligibility and generates a fresh reporting token immediately before the
   external flow. Unsupported, unknown, failed, canceled, or disconnected flows
   cannot use a browser fallback.
2. An authenticated call to `admit_google_play_external_session(feature,
   creator_id, amount_minor, source_id, external_transaction_token, api_version)`
   requires an exact current buyer/session plus global app enrollment,
   native-build, reporter, tax and license-test qualification. `source_id` is
   the tip request UUID, event auction UUID, or room auction UUID (feature
   `room_seat_auction`). Token hashes are unique and
   admission expires after two minutes. This is automatic, not an administrator
   approving each buyer.
3. **The opaque token is not Google attestation.** There is no token-verification
   API established here. Admissions explicitly say
   `native_sdk_observation_unverified`; client inputs cannot establish a Google
   enrollment, native qualification, tax exemption, payment or entitlement.
   Runtime eligibility/disclosure relies on the real native SDK. The backend
   authorizes only this authenticated buyer's own quote preparation under global
   qualification, not a claim that it independently verified the user's Google
   account/country. This trust limitation requires end-to-end provider testing
   before any future activation.
4. Reserve the exact quote. The service-only
   `bind_google_play_external_checkout(buyer_id, session_id, feature, quote_id,
   external_transaction_token, api_version)` checks the same admission, source,
   amount and capability. For tips `quote_id` is the reserved tip ID; auction
   quote IDs come from their distinct event/room quote tables. Binding
   precedes provider checkout dispatch/URL release and native `launchExternalLink`.
   A relaunch needs a fresh native token/admission; transport retries never
   create another payment intent. No token goes into Stripe metadata, URLs,
   logs, client-readable rows or receipts.

## Financial truth and reporting

Verified Stripe paid/refund projection and durable private outbox insertion
commit together. A token or Google report never grants money/access. Reporting
errors do not reverse financial evidence or initiate a second charge. Exact
USD tax evidence comes from signed Stripe Checkout automatic-tax completion,
zero discounts/shipping, the actual tax total and US customer tax address.
Unknown tax is a durable blocked obligation, not an assumed zero.

For Android tips, the SQL reservation adds inclusive automatic-tax and required
billing-address collection to the immutable original Checkout body. The Edge
handler binds the native token before new provider dispatch or URL release.
Missing native evidence may reconcile a previously recorded session, but cannot
return its payment link. This does not establish live tax accounting: the
existing test-mode tip ledger/Connect transfer still uses its original gross
economics. Positive-tax liability and creator-net allocation must be separately
qualified before live money or payouts can be considered. No tax exemption or
zero-tax result is assumed.

The Android Publisher API uses **Price `{currency, priceMicros}`**, not
`google.type.Money` units/nanos. Create uses a stable opaque transaction UUID,
`oneTimeTransaction.externalTransactionToken`, and
`externalContentLinkDetails.linkType = LINK_TO_DIGITAL_CONTENT_OFFER`.
`testPurchase` is output-only: official license tester accounts determine it.
The reporter requires and checks the returned test marker; it never sends a
pretend sandbox flag.
There is no established pre-create API here that proves an arbitrary opaque
token belongs to a license tester. A Stripe test-mode charge and the global
configuration do **not** prove fee exemption. The response check detects a
mismatch after the reporting request; it cannot promise that Google assessed
no fee. Any future test activation must be restricted to an owner-qualified
official license-test cohort and proven end to end, under separate provider
action authorization. The currently ineligible, unconfigured program stays off.

Each attempt GETs the exact resource before POST. Leases, stable IDs, canonical
package/amount/time/test/state checks and durable unknown/retry states recover
lost responses. Refunds use `:refund` and either `fullRefund: {}` or the official
`partialRefund: {refundId, refundPreTaxAmount}` shape. Full refunds and partial
refunds of an authoritatively zero-tax original are automatically allocated.
Taxed partial refunds remain `blocked_tax` pending separately verified tax
reversal evidence. The bounded [tax-evidence reconciler](PARTIAL_REFUND_TAX_EVIDENCE.md)
can ingest actual Stripe Tax Association/Transaction evidence and unlock only
the exact cumulative obligation. Checkout-specific association availability
and Google tax-rounding interoperability still require provider qualification.
A later
verified full refund can be reported and canonically covers earlier blocked
partials. Do not claim taxed-partial reconciliation is complete.

## Unconfigured operational requirements

The worker accepts only a dedicated server credential (at least 32 characters).
Owner-authorized provisioning must separately supply:

- `GOOGLE_PLAY_EXTERNAL_REPORTER_WORKER_SECRET`
- `GOOGLE_PLAY_EXTERNAL_REPORTER_SERVICE_ACCOUNT_JSON` (dedicated least-privilege
  Android Publisher service account; unrelated FCM credentials are not reused)
- `GOOGLE_PLAY_EXTERNAL_REPORTING_ENABLED=true`
- `GOOGLE_PLAY_EXTERNAL_LICENSE_TEST_MODE=true`
- Supabase server configuration and immutable, time-bounded global qualification
  evidence in `private.google_play_external_program_config`
- The matching pre-provisioned Vault secret
  `google_play_external_reporter_worker_secret`. A separately authorized owner
  database operation may then call the dormant, API-role-inaccessible
  `private.configure_google_play_external_reporter()` to install the scoped
  ten-second cron dispatcher. No scheduler or credential is installed by this
  migration. `private.disable_google_play_external_reporter()` removes it.
- Overdue/blocked/unknown obligation alerts using the service-only aggregate
  `read_google_play_external_reporting_health()`; operational alert routing
  requires separate authorized configuration.

Revoking admission must not erase historical reporting obligations. Source-only
tests use synthetic provider responses and actual disposable PostgreSQL/PGlite;
they perform no provider calls and are not real payment/report receipts.

## Primary references

- [Backend reporting](https://developer.android.com/google/play/billing/outside-gpb-backend)
- [Native integration and license testing](https://developer.android.com/google/play/billing/externalcontentlinks/integration)
- [US enrollment and October 1, 2026 transaction reporting/fees](https://support.google.com/googleplay/android-developer/answer/16470497?hl=en)
- [Externaltransactions resource](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions)
- [Create](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions/createexternaltransaction)
- [Refund](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions/refundexternaltransaction)
