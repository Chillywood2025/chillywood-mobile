# Merch reconciliation driver — dormant

No schedule is installed, no capability is enabled, and no credentials are created by this source. The private singleton starts `enabled=false`. Applying the migration alone performs **zero network calls**.

After separate operational qualification and authorization, a project-owned scheduler can POST `{}` every 15 minutes to the fixed project `functions/v1/merch-reconciliation-driver` endpoint with the existing server-only service credential. Keep JWT verification enabled. Never put this credential in an app, URL, logs, or checked-in schedule. Explicitly enabling the singleton and installing that scheduler are separate operational changes, not part of this patch. Disabling the singleton stops new claims; already claimed work can finish. Preserve observations on rollback.

Each accepted run has a 15-minute admission interval, five-minute leases, at most three order refreshes and one existing tracking batch. Order selection is server-owned, oldest due first, sandbox only; retries advance persistent due time with capped 15-minute-to-six-hour backoff. Success refreshes after six hours, within dispute evidence's 12-hour freshness limit. Expired/duplicate lease completions cannot replace current work. The existing tracking worker owns assignment leases and once-only registration POST semantics. Provider GET failures leave unknown/review holds, never zero fees or a fabricated delivery.

Existing dependencies: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Stripe sandbox secret and reconciliation account, and (for tracking) existing `MERCH_TRACKING_WORKER_SECRET`/`MERCH_SHIPPO_TEST_TOKEN` plus qualified creator tracking account records. Missing tracking configuration does not block independent cost refresh. No live/test-mode change, auction transfer, refund, payout or customer communication is performed here. Cost observations can update **held** allocations under the existing policy; this driver cannot grant payable authority.

## Qualification still required

- Deploy/migrate only after authorized exact-head validation; source is not deployment evidence.
- Verify real account ownership, webhook signatures, test lifecycle, scheduler delivery, alerting and least-privilege credentials separately. No authenticated provider requests were made during source tests.
- Capacity: three orders per 15-minute run is deliberately small. Measure backlog/freshness before activation; expired evidence stays held. Raising limits requires a reviewed capacity change, not silent unbounded concurrency.
- Tax: existing checkout does not establish qualified automatic tax on all platforms. Require an explicit applicable-tax or qualified-zero policy and authenticated evidence; never infer zero from disabled/absent tax collection or assume registration.
- A closed dispute is not proof of financial recovery. Historic dispute debit/fee recovery remains a separate fail-closed settlement blocker until balance transactions are supported.
