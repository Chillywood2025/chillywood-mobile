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
- **Existing test users:** the distinct-mode migration preserves the test row and all its IDs, adds a separate live account only after an explicit creator review, and keeps a private immutable `(creator, mode)` binding record. Confirmation is bound to the exact current session, policy, original test row/account and disclosure version. Canceling makes no provider call. A ready test account still has a visible **Review payout setup** action. Stripe accounts are never converted, replaced or deleted.
- Real hosted return/refresh behavior, provider requirements, device/app resume and native PostgreSQL concurrent dispatch still need independent qualification. Local full-schema PGlite tests are not provider or native-concurrency evidence.

## Local evidence

Actual endpoint routing, full-schema RPC/transport integration, disabled/missing policy, mismatched session, age/legal eligibility, test/live separation, exactly-one dispatch claim, lost POST response, empty history, multi-invocation cursor recovery, conflicting-account quarantine, manual/controller readback, expired policy, wrong hosted URL, revoked-session link suppression, unchanged test binding and non-payable account projection are covered. All provider calls use synthetic transport doubles; no network fallback exists in the tests.

## Distinct-mode dependency review

The current full-schema function catalog and TypeScript readers were inspected before changing uniqueness. Public account uniqueness is now `(creator_user_id, provider, provider_environment)`, with original public IDs retained; a private binding ledger prevents an existing account's creator, provider, mode or provider account ID from changing. Null unbound test placeholders may remain placeholders and are not falsely recorded as provider accounts.

- Shared creator setup/status reader chooses the live row when present; otherwise test. Onboarding route and account recorder explicitly select live, not an arbitrary creator row.
- Signed test webhook looks up test mode and its exact provider account. Live observer looks up live mode, then CAS checks original row/account/mode/timestamp. Both retain their own row; neither can replace the other account.
- The current creator eligibility projection remains one selected account. Live takes precedence once present; delayed test observations cannot overwrite it. An atomic, NULL-safe `ON CONFLICT` predicate checks the winning eligibility tuple after lock waits, including a statement snapshot predating a concurrent live insert. The AFTER-row projector never acquires the setup creator mutex (which would invert setup's creator → account lock order). Historical sandbox financial contracts remain tied to their original test account; current eligibility never silently redirects or authorizes them against live.
- Cashout admission, retained payout request authority, payout result receipts, auction release qualification/locks, external payment capabilities and legacy test tip setup already bind provider mode and/or exact provider account. Their account joins do not become ambiguous. Financial eligibility joins additionally use the exact account row ID. No historical transaction or callback account binding is rewritten.
- Owner dashboard account counts count actual accounts, including both modes; they are not a creator-unique account selector.
- The intentionally old-schema upgrade fixture excludes the new dependent migration before applying its legacy repair; normal full-schema tests include the actual forward migration.

App payload validation now permits a live **setup-only** response while continuing to reject payout, transfer, checkout, unknown-mode or live-money response shapes. App confirmation is explicit on both native and web and rechecks the current account session before proceeding. This is a review of starting account setup, not acceptance of Stripe's legal agreement on the creator's behalf.

Setup and refresh visibility no longer depends on transaction rails being sandbox/on/off: a signed-in creator can reach the server's separate eligibility/onboarding-policy decision before or after financial activation. On switching the selected account, positive tax/hold-period/minimum-balance and admin-clearance state is reset, not inherited from test. Negative creator fraud/admin holds remain. Existing per-account refreshes retain independently established same-account checks. Private binding and review receipts reject UPDATE/DELETE.

The same exact-session/adult/creator/current-terms admission now precedes the legacy test fallback as well as live setup. Both account and hosted-link endpoints stop on test-mode eligibility-required responses before reading the provider credential or issuing a provider request. Visible setup controls therefore do not make the legacy test provider write path available to an ineligible signed-in user.
Test fallback additionally requires existing exact-subject owner/operator, active beta, or active unexpired sandbox tester authority, using the canonical subject predicates and never email-derived eligibility. Ordinary eligible creators receive `not_configured / live_setup_required` until a qualified live policy exists. Test authority is checked again immediately before dispatch and before returning a hosted link.

`scripts/test-connect-dual-mode-concurrency-postgres.mjs` adds four native independent-session schedules in an owned local CLI database clone: confirmation waiting behind a test callback; the live observer waiting/binding crossing; and both orders of live insert versus test update across eligibility row locks. It asserts actual blocking and completed transactions, exact live selection and no payable state. It is prepared for hosted execution; local Node syntax/help checks and PGlite source tests do **not** establish native concurrency success.
