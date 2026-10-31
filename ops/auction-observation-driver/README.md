# Auction held-observation source — dormant

This source adds creator-scoped held estimates and a bounded observer, **not an automatic payout pipeline**. The database control starts disabled. No scheduler, qualification, credential, provider operation or deployment is created by the migration.

The read RPC requires the exact current authenticated session, scopes every row and pagination anchor to that creator, and returns only latest held estimates. Missing observations/amounts stay null, distinct from an observed zero. No buyer identity, recipient account or provider payload is returned. The separate Money Center card must not add these amounts to cash-out or payout totals. Every row is explicitly non-payable, even if domain facts qualify in test mode.

After separate operational qualification and authorization, a project-owned scheduler may POST `{}` every 15 minutes to `functions/v1/auction-observation-driver`, using the existing server-only service credential. Enable the private control only under that separate approval. Disabling it stops new claims; existing leases may finish. Keep JWT verification on and preserve observations during rollback.

Each run selects at most three paid/revoked test contracts, oldest due first, with five-minute leases. Three concurrent calls go only to the existing GET-backed `stripe-auction-cost-reconcile` endpoint, then the corresponding event/room domain qualifier. There is no call to transfer reservation, transfer/reversal execution, or qualification renewal. Request bodies are capped at 64 bytes; body/SDK waits are capped at five seconds, internal observation requests at 90 seconds. Retries use capped exponential backoff. Failed or incomplete reads do not become clearance. Freshness is informational (one hour), never financial authority.

Existing configuration: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_AUCTION_PLATFORM_TEST_KEY`, `STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID`. No new secrets. No authenticated provider calls were made in source tests.

## Deliberately unresolved high-risk pipeline

- Platform/recipient/product qualifications expire within 15 minutes. This observer neither invents nor renews them. Missing/expired/revoked qualifications stay held. A separately reviewed authenticated issuer is still needed before automatic release can work.
- Objective event coverage, original replay expiration, room completion, remedies/issues, provider funds and net costs retain their existing independent checks. Tax/store obligations remain unknown unless qualified; missing tax configuration is not zero tax.
- Reservation, once-only dispatch, GET-only reconciliation after ambiguous outcomes, and authoritative reversal/recovery are a **separate unimplemented orchestration phase** requiring review. This observer never authorizes or sends money.
- Deliberately small capacity (12 contracts/hour) requires backlog/freshness and scheduler monitoring qualification. Do not silently raise limits or claim automatic real-time coverage.
