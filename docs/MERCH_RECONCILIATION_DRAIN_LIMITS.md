# Dormant merch reconciliation capacity

This is a source-only repair. The driver remains disabled, existing cron is
unchanged, and no provider request, checkout, payment, payout, release or
deployment is authorized by this implementation.

The original driver admitted three cost/dispute jobs every 15 minutes: at most
72 orders per six-hour target or 144 per 12-hour evidence lifetime. Every
historical paid/refunded/disputed eligible order remains an obligation; this
repair does not infer a safe retirement age.

The prospective driver retains the 15-minute start gate and claims three jobs
at a time under an exact, private, 100-second run token. Up to 30 admissions are
allowed per run, enforced in SQL even across duplicated/parallel continuations.
An active batch must finish before the next batch can be admitted. Job leases
remain five minutes, and stale tokens cannot acknowledge newer leases.

The Edge request has a 100-second budget including input and SQL waits. It only
starts a cost batch with at least 85 seconds left and only requests another
batch with at least 90 seconds left. Each cost worker independently has a
75-second aggregate budget and a maximum of 64 Stripe GETs shared across full
dispute snapshots and cost/refund pagination. Individual reads retain 15-second
timeouts. At most 1,920 Stripe GETs can be initiated by a full driver run.
Tracking is a separate existing worker invocation, once per run, with its own
unchanged five-job limit and provider constraints. Its requests are not part
of the Stripe budget.

The theoretical ceiling is now 720 cost orders per six-hour target, not a
capacity guarantee. A slow run may still process only three. Transport errors,
large provider histories, SQL latency and provider throttling can reduce
throughput substantially. Exhaustion returns incomplete; it never turns a
partial provider snapshot into financial clearance. Cost histories needing
more than 64 total provider reads need a separately designed resumable,
provider-consistent snapshot strategy, not a raised financial gate.

Oldest-due ordering prioritizes untouched historical obligations before newer
arrivals and failed retries. Successful jobs return after six hours; failures
retain exponential 15-minute-to-six-hour backoff. No error deletes a job or
retires an order. Continuous imports with artificially old creation timestamps
could still overwhelm this finite queue; no finite budget guarantees fairness
under unbounded adversarial arrivals.

Every claimed batch returns service-only backlog health: observation timestamp,
eligible/due/in-flight/never-completed counts, last-success-over-12-hour count,
oldest due time and whether eligibility exceeds the theoretical six-hour
ceiling. This is a claim-time queue snapshot, not an authoritative dispute
clearance result. Existing 12-hour freshness and all financial gates remain
unchanged. Operators must establish sustainable measured throughput and alerts
before separately authorizing activation. A backlog or incomplete run is not
safe to hide by lowering freshness requirements.

Local tests run actual driver and worker modules with synthetic transports,
and actual forward SQL on the full schema. They cover 180 historical orders,
poison retries plus new arrivals, admission/concurrency/time bounds, authority,
lease expiry, rollback, provider-budget exhaustion and the old three-job SQL
negative control. They do not prove production throughput or provider capacity.

Bank cash-out execution, actual-fee settlement readiness, and Google partial
refund tax ingestion remain separate gaps, outside this repair.
