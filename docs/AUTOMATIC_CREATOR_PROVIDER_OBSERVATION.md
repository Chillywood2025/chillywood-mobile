# Dormant creator provider observation

This source does not deploy, schedule or enable a worker. The private control
row starts disabled. The worker only observes existing database-bound Stripe
Connect accounts; it cannot create accounts, onboard, change provider settings,
transfer funds or execute payouts. Free buyers remain free.

## Operational prerequisites

Separate authorized deployment, invocation scheduling, service authentication,
environment-correct read credentials and provider read permissions are needed.
Live observation additionally requires the existing reviewed live observation
policy and platform binding. No credential, policy or provider permission is
created by these migrations. Enabling the queue is a separate operational act.

One claim per minute processes at most five Premium creators in the current
money mode. Persistent due ordering and skip-locked leases avoid preference for
new accounts. Five jobs run concurrently, with at most twenty GET requests per
invocation, response size limits and timeouts. Healthy observations are due
again after five minutes. Two-minute leases require exact tokens. Failures and
expired unknown writes back off for 1, 2, 4, 8, then 10 minutes. Unknown database
write outcomes are not immediately retried.

This is a nominal capacity of 25 accounts per five minutes, not a freshness or
availability promise. Scheduling gaps, provider latency, failures, credential
permissions and a larger creator population can exhaust that capacity. Capacity
and operational monitoring must be qualified before enablement. Automatic
readiness expires after fifteen minutes rather than trusting old snapshots.

## Evidence boundaries

The test path executes the existing normalizer and compare-and-swap account
upsert. The live path executes the existing context, authenticated v1/v2 GET
observation and compare-and-swap record functions. A truthful system audit
follows successful persistence. Completion locks account, then job, then the
creator eligibility mutex. Freshness comes from the actual stored observation
and sync timestamps during the exact lease, not a caller-supplied success flag.

Provider observation is not evidence of age, sanctions clearance or tax
qualification. The canonical test adapter explicitly sets tax_status to
not_connected; live observation does not fill all legacy readiness fields.
Absent qualified tax/sanctions evidence and active payout terms, strict
eligibility therefore remains pending. Do not turn fixtures into qualification
or claim that a successful observer enables creator money.

## Account deletion and private retention

Creator declaration history remains private and immutable through the supported
account deidentification lifecycle. The purge count function reports only its
retained count. Manual review receives a retained abuse_security_records item
with source creator_eligibility_declarations and count-only metadata, not age,
location, session or declaration contents. Ordinary clients receive no table
access. No declaration-erasure exception is added by retention accounting.

## Validation

The focused full-schema regression executes the actual production observer,
canonical test adapter, audit insertion and SQL completion against controlled
provider responses. It checks disabled defaults, timestamp/CAS evidence, strict
tax pending, leases, role grants and FORCE RLS. Controlled responses are not
provider verification. PGlite tests do not prove native concurrency; native
PostgreSQL concurrency validation is a separate required check.
