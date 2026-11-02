# Disabled Clip render scaling control-plane contract

## Status, trust and activation boundary

This is bounded source infrastructure, not activated autoscaling. The queue and
worker gates default OFF. The planner is recommendation-only. The runnable
control plane defaults OFF and enabled operation defaults read-only dry-run.
No live provider SDK/adapter, telemetry deployment, scheduler, cloud credential
or alert transport is supplied/qualified by this source. No provider purchase,
deployment or credential permission follows from queue pressure.

`node scripts/clip-export-control-plane-cli.mjs --help` and default OFF do not
import adapters or contact a database/provider. Explicit recommendation requires
`CLIP_EXPORT_CONTROL_PLANE_ENABLED=true`, reviewed absolute
`CLIP_EXPORT_TELEMETRY_ADAPTER`, and `--once` or `--loop`. Dry-run does not write
the lifecycle ledger or import the provider adapter. Its hysteresis is local to
that process; execution history is durable. Loop default is 30 seconds;
SIGTERM/SIGINT stop collection, not worker execution.

Execution additionally requires `--execute`,
`CLIP_EXPORT_CONTROL_PLANE_EXECUTION_ENABLED=true` and reviewed
`CLIP_EXPORT_PROVIDER_ADAPTER`. Flags are gates, not authorization. Current
mutation authority requires a matching approved pool, enabled global render gate
and exact approved global capacity before provider factory loading. A valid
expired profile permits only original-scope read-only reconciliation, not create,
drain or delete. Retiring superseded profiles requires explicit `retireProfileIds`
authority within the same ownership namespace.

**Approval expiry is not a billing stop.** Existing resources may remain billable
while mutation authority is expired. Activation must define approved expiry/cleanup
policy and operator escalation; no automatic renewal authority may be invented.

## Trusted observation interface

The telemetry module exports `createClipExportTelemetryAdapter()` with:

- `connect({signal,readOnly})`: authorized PostgreSQL client with query/release.
- `readApprovedProfile({signal})`: trusted operator approval, not client input.
- `readWorkerSamples({workerIds,observedSinceMs,limit,signal})`: real stage/resource
  observations bound to exact registered worker sessions.
- `probeDependencies({profile,signal})`: bounded read-only checks of actual
  worker DB authentication and private source/output storage scopes.
- Optional `readWorkerQualifications(...)`: current isolated descendant-cgroup
  evidence bound to worker, session, profile and expiry; metrics cannot certify it.
- Optional `close()`.

Worker samples carry independent `diskObservedAtMs` alongside
`tempAvailableBytes`. Only a successful disk collection sets that timestamp;
progress, outcome, heartbeat-envelope and DB snapshot clocks cannot renew it.
Missing, future or stale disk timestamps leave resource health unknown, even
when CPU, memory and progress observations are fresh. Unavailable reads clear
both disk value and timestamp. Fresh authoritative zero-job inventory can still
support safe idle draining; resource uncertainty never invents busy jobs or
authorizes new paid capacity.

The built-in cgroup sampler reports **leaf-only** limits:
`memoryLimitScope: 'leaf-cgroup-only'`, `effectiveMemoryConstraintKnown: false`,
and null `effectiveMemoryLimitBytes`, `effectiveMemoryAvailableHeadroomBytes`
and general `memoryAvailableHeadroomBytes`. Its separately named
`leafMemoryAvailableHeadroomBytes` is not effective host headroom. A namespace
can hide tighter ancestors, and sibling consumption can exhaust parent capacity.

A separately qualified telemetry adapter must supply
`memoryLimitScope: 'qualified-effective-cgroup-v2-hierarchy'`,
`effectiveMemoryConstraintKnown: true`, and measured positive
`effectiveMemoryLimitBytes` plus nonnegative
`effectiveMemoryAvailableHeadroomBytes` no greater than that limit. The matching
worker/session/profile isolation qualification must also explicitly attest the
same effective-hierarchy scope and known flag, with current checked/expiry times.
Qualification must account for all effective constraints, including hidden host
ancestors and sibling usage; setting a healthy flag is not a substitute.
Growth uses effective pressure (`1 - effective headroom / effective limit`), not
leaf usage divided by leaf limit. For example, a 3-GiB leaf using 1 GiB is not
spare capacity when its 1.2-GiB ancestor uses 1.1 GiB. This source supplies no
effective-host qualification or real adapter; leaf-only evidence fails growth
closed. A bounded cold-start probe is not permission for subsequent fleet growth.

Collector SQL uses repeatable-read/read-only bounded snapshots, 10-second
statement and 2-second lock limits. External adapter calls must separately honor
cancellation and qualified finite timeouts; SQL limits do not bound their code.
At most 32 workers and 10,000 recent outcomes are accepted. Missing, stale,
mismatched or inconsistent samples remain unknown, never refreshed by a DB clock.
A collector's privileged SQL success does not prove render-worker credentials.
Sanitized summaries expose aggregate counts/reasons, not private URLs or raw
provider payloads. Snapshot observation time and collection-completion time differ.

## Durable concurrency and lifecycle

Forward migration `20261102094308` creates the private RLS/FORCE-RLS ledger with
no worker/service-role write grant. No activation row is created. Deployment and
control-plane database authorization are separate actions. Ledger transactions
take a per-pool advisory lock then row lock and commit a reservation before any
external dispatch. Commit uncertainty never dispatches a speculative create.
Serialized in-memory doubles/PGlite semantics are not native concurrency proof.

Permanent operation IDs and dispatch leases protect concurrent controllers.
Unknown create/delete outcomes retain full slot/cost reservations until verified
reconciliation. Late responses cannot overwrite a newer reconciliation. Terminal
records remain for audit; at 10,000 records new provisioning holds for rotation.
A poll allows at most 32 physical observation calls and one lifecycle mutation.
Admission, dispatch and completion recheck current time/authority, not a stale
pre-network timestamp.

Provider executor contract: `capabilities`, `create`, `reconcileCreate`, `observe`,
`drain`, `delete`, `reconcileDelete`, `probe`. It must prove exact ownership,
complete inventory, fresh quote/capabilities, idempotent create, partial-create
reconciliation and conditional drained deletion. Each exclusively owned compute,
IPv4 and ephemeral-volume asset must be accounted for; shared assets are excluded.
Observe must establish disabled claims, stopped worker and active-job count.
Database zero leases alone are not physical process-stop proof. Delete rechecks
all conditions at action time and has no force-kill option. Powered-off compute
or leaked owned IPv4 is not verified absence. Read-only recovery probes may not
PUT media, create capacity or retry an uncertain media operation.

## Demand, health and bounded recovery

Growth needs fresh measured queue pressure, arrivals, completed-export wall time,
real progress/saturation and qualified resource headroom, not queue counts alone.
Historical service baseline is profile/slot-bound and age-limited. Heartbeats or
cumulative CPU do not invent throughput. Long rendering is distinguished from
proven processing failure. Missing evidence and unresolved output writes hold.

Typed dependency faults open a persisted circuit breaker. Stable incident IDs
support future idempotent alerting but **no delivery transport is activated**.
Recovery uses fresh read-only evidence after a five-minute cooldown and at most
three probes before operator review; process restart does not reset this budget.
Input qualification errors, cancellation and source revocation do not justify
purchasing workers. Unknown media outcomes never authorize blind re-enqueue.

Separately approved zero-worker startup permits one bounded qualification worker,
not a backlog-sized fleet. It needs current healthy dependency evidence and work
or an approved warm minimum. Failed/unknown starts reconcile, not repeatedly
provision. Healthy scale-to-zero can re-arm only after evidenced measured success,
approved retirement and verified absence of every owned billable asset. Rolling
24-hour startup counts/reservation budgets survive deletion; defaults permit at
most four starts and can permit fewer under the reservation budget. Startup
deadline requests safe drain, not force-kill. Isolated replacement is separately
approved, at most one per approval, and only after old-worker drain, stop, zero
active work, complete asset deletion and a successful bounded recovery probe.

## Cost and production readiness

Reservations cover approved per-worker maximum hourly estimates across creating,
unknown, booting, ready, draining and deleting resources. They are **not a provider
invoice cap**: egress, retained storage, taxes, billing increments and prior charges
remain outside this guarantee. Price/budget uncertainty blocks growth; it does
not erase reservations or authorize cleanup without current mutation approval.

Activation requires exact-head required validation/native races, qualified real
provider idempotency/partial-create/unknown-outcome/owned-IP cleanup, isolated host
capacity through full media/readback pipeline, bounded telemetry and routed alarms,
approved budget/expiry cleanup, and tested drain/rollback. No unit-test total or
short cloud-render sample establishes those external qualifications.
