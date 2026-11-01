# Dormant live creator onboarding

## Implemented end-to-end path

Existing account creation and hosted-link endpoints select their environment from the server-owned policy and existing binding, never client parameters. With no live policy the legacy test path remains unchanged. A live binding without qualified live policy does not fall back to a test account.

Live admission requires the exact current session, current account/creator/money/payout legal requirements, authoritative adult/creator status, clear moderation, active account, United States market, rollout eligibility and platform capability. Initial onboarding deliberately does **not** require completed provider KYC, tax or payout eligibility: those are collected/verified during setup and independently required before money authority. No legal agreement is accepted by this code.

The unseeded policy binds the actual platform account, explicit Express/application-fee/application-loss/Stripe-requirements configuration, US/USD, verified pricing/controller evidence, verified HTTPS return/refresh URLs and an expiring qualification. Live creation uses the existing Accounts v1 controller integration, requests card payments/transfers and manual payouts, and passes no identity documents, external bank account, personal data or `tos_acceptance`. The creator completes their own agreement, identity and bank steps in Stripe-hosted onboarding.

### Creation and recovery

1. Reserve one immutable attempt for the creator, with frozen policy and stable idempotency key.
2. Read the exact platform using the live credential; atomically claim dispatch after fresh session/legal/policy checks.
3. Perform at most one creation POST. Any ambiguous response consumes that dispatch permanently; another attempt cannot silently be created after the provider idempotency window.
4. Read back exact account metadata, creator, attempt, platform, policy, controller, country, currency and manual schedule before recording provenance/binding. Configuration readiness remains unknown/non-payable until the separate full observer verifies it.
5. Recover an unknown outcome using GET-only account enumeration. Each invocation reads at most five pages; a private cursor and accumulated exact match resume the next invocation. Empty results do not authorize a new POST. Conflicting exact matches enter review. The creator receives a pending message rather than a false completion.
6. If authority changes during I/O, retain the operational account observation without granting a binding or returning a hosted link.

### Hosted links and app experience

Only a provenance-bound existing account can receive a live hosted link. Current provider controller/account state is re-read, and session/legal/policy/account/redirect bindings are rechecked before POST and before returning the result. Client redirect values cannot override the qualified live URLs. The returned URL must be HTTPS on `connect.stripe.com`, on a supported setup path, unexpired and without credentials or a fragment. The single-use URL is returned only inside the authenticated app response and is never persisted or emailed/texted. The app stops cleanly on pending, eligibility or migration-review states rather than requesting a link for an absent account. Returning from Stripe is not completion proof; the existing refresh action observes actual status.

Stripe documents that a newly created v1 account can take **up to 10 minutes** to become available to Accounts v2. Hosted onboarding uses exact v1 creation provenance during that interval; financial readiness still requires the later v2 corroboration. See [Accounts v2 interoperability](https://docs.stripe.com/connect/accounts-v2/migrate-integration) and [Stripe-hosted Express onboarding](https://docs.stripe.com/connect/express-accounts).

## Explicit remaining requirements

- No policy rows, provider accounts, hosted links, credentials, provider settings, agreements or financial activations were created by this source work.
- Actual platform onboarding/pricing/controller eligibility and the precise HTTPS return/refresh targets must be independently verified before provisioning/enabling the private policy. Qualification evidence hashes are not generated from assumptions.
- The runtime needs an authorized appropriately scoped live credential in `STRIPE_CONNECT_LIVE_ONBOARDING_KEY`. No credential is created or copied by this patch.
- Actual creators must satisfy their own current eligibility/legal requirements, then complete Stripe's hosted agreement and verification steps. Setup never grants payout eligibility or fees/tax/storefront qualifications.
- **Existing test binding decision:** the schema currently permits one payout-account binding per creator. Stripe test accounts cannot be converted to live accounts. This implementation therefore returns `account_migration_review_required` and preserves the existing account and history. A separately reviewed dual-mode binding design or audited cutover is needed for creators who already have test bindings; automatic replacement/deletion is intentionally not implemented.
- Real hosted return/refresh behavior, provider requirements, device/app resume and native PostgreSQL concurrent dispatch still need independent qualification. Local full-schema PGlite tests are not provider or native-concurrency evidence.

## Local evidence

Actual endpoint routing, full-schema RPC/transport integration, disabled/missing policy, mismatched session, age/legal eligibility, test/live separation, exactly-one dispatch claim, lost POST response, empty history, multi-invocation cursor recovery, conflicting-account quarantine, manual/controller readback, expired policy, wrong hosted URL, revoked-session link suppression, unchanged test binding and non-payable account projection are covered. All provider calls use synthetic transport doubles; no network fallback exists in the tests.
