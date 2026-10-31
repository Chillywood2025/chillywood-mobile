# Buyer-entered tips: source scope and activation boundary

The tip sheet accepts strict USD decimal text. Parsing preserves integer cents;
it never rounds fractional cents. Existing native store options remain optional
choices and only an exact product/amount/currency match can reach a store SKU.
A separately labelled **Stripe test checkout** action is shown only for an exact
server-confirmed custom amount. It is never an automatic substitute for a store
purchase. A freshly verified iOS US `external_browser_checkout` quote can use
the explicit custom action to leave for the full system browser (`Linking.openURL`),
not an embedded Stripe SDK or in-app Safari controller. Legacy iOS calls without
that exact quote remain blocked. Foreground return refreshes the exact receipt;
returning from a browser is never payment confirmation.

Android external checkout remains unavailable for activation. The successor
source includes the native external-content-link disclosure/token flow and
backend reporting, described in `google-play-external-reporting.md`. Plain
browser navigation cannot substitute for that flow. Google enrollment, native
build/device qualification, reporting configuration and financial qualification
remain outstanding; the migration seeds no approvals.

The owner's source-design approval was the response “Yes I do” to a separate
eligible Stripe checkout for custom tips and winning bids (2026-10-30 15:55 UTC).
That authorizes this implementation, not provider enrollment or native paid proof.

## What is implemented

- A server-owned, immutable external capability binds feature, recipient account,
  platform, storefront/country, explicit route kind, currency, environment,
  payment method and verified limits. Country and route kind have no defaults.
- A separate short-lived eligibility binds that capability to the exact buyer
  and authenticated session. Client platform headers and editable user metadata
  cannot create or establish either record.
- Custom tip quotes use those method/account limits, not historical creator
  `min_amount_cents` or preset tiers. No universal 50-cent provider claim is made.
  An otherwise verified eligible route returns its actual minimum/maximum when
  the entered amount is outside those bounds. The UI names that limit and keeps
  the user's original amount; it does not round or substitute a price.
- New checkout admission freezes the capability and original provider request.
  Dispatch and link delivery recheck current eligibility. Revoked capabilities
  block new dispatch; recorded provider sessions remain reconcilable, without
  returning an unapproved payment link. Existing pre-capability immutable attempts
  retain their original reconciliation route.
- Short-lived session eligibility is separate from the provider payment
  deadline. The immutable Stripe link expires no later than the route approval;
  an approval too short for Stripe's minimum checkout lifetime cannot create a
  new checkout. Tip pause/block/kill switches are checked again at dispatch and
  before returning a payment link.
- Receipt/settlement idempotency, account/session checks, exact amounts and
  unknown-outcome handling remain in force. Checkout return is not payment proof.

## What remains unavailable

**The migration inserts no capabilities or eligibility records.** A table row's
evidence reference is a trusted-service attestation pointer, not proof that a
provider or store approved anything. The repository currently has no verified
automatic iOS/web buyer storefront eligibility issuer. The Android issuer has
the explicit unverified native-token observation boundary documented in
`google-play-external-reporting.md`. Therefore
this work does **not** establish a production-ready, scalable external checkout
activation or installed-device payment proof.

Activation needs a separately authorized integration, not manual approval of
individual buyers:

1. A trusted automated issuer verifies the actual browser/native distribution,
   storefront and applicable region evidence; it must not trust `Platform.OS`,
   a request header, or user-editable claims as that evidence.
2. It selects a legitimately approved feature/platform/storefront route and reads
   current provider-account, currency and payment-method limits. Evidence must
   identify the actual verified observations and approval, not a fabricated label.
3. It issues a bounded capability (maximum 24 hours) and automatically issues or
   refreshes eligibility for the current verified buyer session (maximum 15
   minutes). A changed session requires a fresh eligibility record. No per-buyer
   owner approval workflow is intended. Refresh appends a new immutable binding;
   renewing the same approved route does not rewrite purchased terms.
4. It revokes eligibility/capabilities when source evidence, approvals, provider
   readiness or session eligibility changes. Immutable terms require a new
   capability; revoked evidence cannot be restored. No broad client write grants
   or client-callable issuance endpoint exists.
5. Applicable native/store approvals, signed/native implementation, deployment,
   real provider enrollment and live-money activation remain separate actions.

Existing test-secret, money-switch, observed recipient configuration and webhook
guards still apply independently. Neither this source change nor test fixtures
perform provider writes, live charges, payouts, deployments or activation.

## Verification and rollback

`tip-custom-amount.test.mjs` exercises production parsing and quote normalization;
`purchases-route-mounted.test.mjs` mounts the production UI; the custom-capability
and retry PostgreSQL tests execute real production SQL in a disposable database.
The synthetic USD-card capability uses min 50, rejects 37/49 and admits 51/99/123;
this is local test data, not evidence about a real provider account. Negative
controls remove an actual eligibility predicate to prove cross-buyer admission
is detected. Edge tests execute the real handler with controlled provider IO.

Rollback is fail-closed: revoke the affected capability/eligibility, withhold new
checkout links, and retain original attempts and provider receipts for
reconciliation. Do not rewrite deployed migrations or delete purchase history.
