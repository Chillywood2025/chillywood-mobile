# Cognitive Product Sentinel Persistence and Triage

Status: implementation-ready, not deployed

## Purpose

This contract adds the missing Level 0/1 persistence boundary between bounded
installed-product observations and governed product-quality findings. It extends
the existing sentinel run and finding tables without changing any deployed
migration.

The flow is deliberately separated:

1. `cognitive_sentinel_collector` records a bounded, sanitized sentinel run.
2. `cognitive_independent_evaluator` records a run-bound detection or resolution
   proof.
3. `cognitive_product_quality_triage` applies a proof-bound finding transition.

The detection evaluator accepts the bounded candidate fields, reads the stored
sanitized run itself, derives the verdict, assessment hash, output hash, and
proof hash, and rejects unsupported metric/classification combinations. The
caller cannot supply its own verdict or proof. The initial Android touch-target
policy, for example, requires a real Android interactive target below the exact
48 dp threshold with no surrounding clickable ancestor before it can produce a
passing detection proof.

The run must exist before it can be evaluated. Recording a run does not create a
finding. Every detection, recurrence, and resolution requires a fresh passing
evaluator proof, and each proof can be consumed only once.

## Closed identities

| Identity | Operation | Allowed effect |
| --- | --- | --- |
| `cognitive_sentinel_collector` | `collect_sentinel_run` | Insert or idempotently read back one bounded run in its exact task, project, platform, environment, and sentinel scope. |
| `cognitive_independent_evaluator` | `independent_evaluation` | Record one immutable assessment for an unexpired operational sentinel run. |
| `cognitive_product_quality_triage` | `triage_product_quality` | Create, recur, or resolve the deterministic current finding selected by a passing proof. |

Collector and triage capabilities are hashed, expiring, revocable, scope-bound,
server-only records. They cannot enable switches, issue authority, approve,
modify source, deploy, merge, release, change roles, or alter existing-product
authentication or RLS. The evaluator continues to use the existing independent
evaluator service principal.

## Bounded evidence envelope

Operational runs use:

- `schemaVersion`: `product-sentinel-v1`
- `sanitizationVersion`: `bounded-nonpersonal-v1`
- `observationKind`
- one to 64 lowercase SHA-256 `evidenceHashes`
- bounded numeric, boolean, or allowlisted categorical `metrics`

Allowed observations are:

| Sentinel | Observation kinds |
| --- | --- |
| `livekit_experience_sentinel` | `livekit_experience` |
| `visual_product_experience_sentinel` | `visual_layout`, `touch_target` |
| `installed_journey_sentinel` | `installed_journey`, `route_timing`, `search_accessibility`, `crash_anr` |

The database rejects raw evidence, secret-like or private-identifier-like route
values, observations longer than 30 minutes, proof windows longer than 24 hours,
and passed or failed results without direct installed UI or simulator
observation. Raw screenshots, logs, accessibility dumps, credentials, user data,
media, tokens, and signed URLs are outside this contract.

## Runtime RPC contract

`product_experience_collect_sentinel_run`

Inputs: task and project UUIDs; platform and environment; sentinel key; bounded
route or surface; runtime, build, evidence, and idempotency hashes; bounded metric
manifest; result and physical-proof states; observation and evaluation
timestamps; exact collector identity and assertion.

Result:

```json
{
  "sentinelRunId": "uuid",
  "taskId": "uuid",
  "projectId": "uuid",
  "platform": "android",
  "environment": "production",
  "resultStatus": "passed|blocked|failed",
  "evaluationExpiresAt": "timestamp"
}
```

`product_quality_record_sentinel_evaluator_proof`

Inputs: sentinel run UUID; assessment kind (`finding_detection` or
`finding_resolution`); assessment and evidence hashes; `passed` or `rejected`
verdict; evaluator output and proof hashes; exact evaluator identity and
assertion.

Result:

```json
{
  "evaluatorProofId": "uuid",
  "sentinelRunId": "uuid",
  "assessmentKind": "finding_detection|finding_resolution",
  "verdict": "passed|rejected",
  "validUntil": "timestamp"
}
```

`product_quality_triage_detection`

Inputs: sentinel run and evaluator proof UUIDs; proof hash; deterministic finding
classification; route or surface; build/runtime, impact, evidence, affected
component, provider-state, and next-investigation hashes; severity; suspected
layer; confidence; reproduction and physical-proof states; exact triage identity
and assertion.

The database derives the finding key from task, project, platform, environment,
surface, and classification. A transaction-scoped advisory lock serializes that
scope. The first passing assessment creates the current finding; subsequent
passing assessments atomically increment its occurrence count.

`product_quality_triage_resolution`

Inputs: finding, sentinel run, and evaluator proof UUIDs; proof and bounded
resolution hashes; exact triage identity and assertion.

The database accepts only an exact-scope, fresh, passing resolution assessment
and transitions one open finding to resolved.

## Audit and compatibility

`product_experience_sentinel_evaluator_proofs`,
`product_quality_finding_events`, and
`product_experience_sentinel_proof_consumptions` are append-only and forced-RLS.
Every operational detection, recurrence, and resolution creates an immutable
event. Current finding state can change only through the transaction-local
triage guard.

Legacy RPC grants remain unchanged for compatibility with the reviewed deployed
control plane. A table-boundary trigger prevents any legacy or future insertion
path from creating a finding for a new collector-capability run unless a matching
passing independent evaluator proof exists.

## Activation and rollback

Activation requires exact-source review, deployment of migration
`20260724043927_cognitive_product_sentinel_persistence_triage`, JWT-required
deployment of the three new Edge Functions, presence-only secret verification,
registration of the two scoped service capabilities, and real HTTP/RLS tests.

Rollback is operational and forward-only:

1. Disable the affected visual, installed-journey, or LiveKit sentinel switch.
2. Revoke the collector and triage capabilities.
3. Undeploy or stop invoking the three new Edge Functions.
4. Preserve runs, proofs, events, consumptions, and finding history.
5. Use a reviewed forward migration for any schema correction; do not run a down
   migration.
