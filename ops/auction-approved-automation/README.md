# Approved auction automation — source-only, OFF

**Not operationally ready or activated.** All three controls start false; the approval table is empty. No schedule, credentials, registrations, provider changes, transfers or bank payouts are created by installing this source.

## Authority and setup boundary

An independently verified owner approval must explicitly name the original qualified platform/recipient/product/capability, permitted test contracts, currency, maximum transfer, daily cap, expiry and a durable approval reference. Only privileged reviewed database operations can install that policy; no app or service-role RPC can create/edit approval rows. Source tests use clearly labeled synthetic approval rows, never real authorization. An active account or successful provider GET is not owner/legal approval. Policies are immutable except revocation, the latest policy governs, and existing capability/product/ownership restrictions remain mandatory. This code does not renew route/legal/tax approvals or onboard accounts.

After separately authorized setup, a project scheduler can POST an empty object to `auction-approved-automation`, with the existing service credential. Observation, qualification renewal and dispatch have separate database controls. The endpoint uses existing test Stripe key/account configuration. Keep controls OFF and schedule absent until provider permissions, approval evidence, current tax/fee facts, limits and operational monitoring are qualified. No live branch exists. Bank payouts are separate.

## Normal path and failure handling

At most three contracts (one per approval) are admitted per minute; persistent leases and capped backoff prevent duplicate workers and starvation. Test-account/product GETs renew only the approved scope for at most ten minutes, bounded by approval expiry. Latest incomplete attempts invalidate automatic authority. The worker then reads actual costs and original domain facts. Unknown fees, incomplete event/room delivery, open issues, replay windows, revoked payments or stale qualifications remain held.

Provider transfer preflight GETs happen **before** the sole dispatch permit. Under existing contract/domain/payment/qualification locks, the new wrapper checks the current policy, control flags, exact preflight identity/allocation, 60-second qualification freshness, tax-fee readiness and daily budget again. Reservation, automatic binding and consumption of the once-only permit commit together. There is no committed automatic reservation waiting for another worker. The POST uses the original deterministic idempotency key once only.

After permit consumption, every timeout/crash/uncertain result is GET-only reconciliation. Empty/incomplete/duplicate provider results never prove no transfer occurred. There is no canceled-operation restart, new key, manual-executor fallback or automatic compensating transfer. Approval revocation after dispatch marks an in-flight recovery obligation. Observation can reconcile already attempted transfers even if renewal/dispatch is off, but the observation kill switch stops all automatic work. A rare crash after permit commitment but before POST can remain ambiguous and require an owner exception review; safety cannot honestly promise otherwise.

Requests are capped at 64 bytes, SDK/body waits at five seconds, and the complete provider workflow at 110 seconds. Providers cannot supply callback URLs; project endpoints are fixed. Raw responses/customer evidence/credentials are not persisted or echoed.

## Current intentional blocks and proof limits

- The current `commerce_tax_fee_settlement_ready` gate is **false** until a separately reviewed, attributed provider-fee evidence importer exists. Production-schema tests prove zero new automatic transfer operations, not successful end-to-end financial execution.
- Positive endpoint protocol tests inject a synthetic RPC permit solely to verify preflight ordering, one POST and GET-only recovery. They are not evidence of real owner approval, provider readiness, complete tax costs or production transfer eligibility.
- The existing manually addressed test executor is separately disabled and now shares the same authoritative hard-false final-fee guard on reservation/dispatch. Its lower-level parser protocol remains tested, but historical positive lock evidence is not current complete-settlement proof. Automatic orchestration never falls back to it.
- Native race source has six current-schema hard-block schedules and preserves fourteen positive schedules only in the historical pre-fee checkpoint branch. Serial schema preflight is not native concurrency proof; the exact-head native Database job must pass the applicable current schedules.
- One owner should monitor exception/backlog/unknown-result alerts, not approve every ordinary order. Account/approval changes, unresolved transfer identity, corrections and unavailable fee facts are explicit exceptions. No alert destination or scheduler is installed here.
