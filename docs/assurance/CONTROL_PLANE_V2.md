# Assurance Control Plane V2

## Operating model

The normal lifecycle is finite task definition, admission, implementation PRs,
exact review and Phase 1, protected merge, and terminal synchronization. A
control-plane repair is not part of an ordinary product lifecycle.

All candidate-scoped decisions use the candidate Git context in
`control-plane-v2.mjs`. The context reads commit/tree identities, full-index
object metadata, NUL-delimited paths, and numstat for its patch-independent
source identity. It also preserves the canonical legacy patch hash through one
explicitly bounded 32 MiB compatibility read, eliminating the implicit 1 MiB
child-process ceiling without creating an unbounded read. Candidate-only
evidence is read from the candidate commit, never from the evaluator checkout.
Protected-main advancement uses the exact commit, tree, parent, and changed-path
hash chain for its aggregate identity; it does not materialize a repository-wide
binary patch merely to synchronize current truth.

## Finite-task and amendment semantics

The base lease and effective lease are distinct records. `maximumAmendments`
is capacity; `amendmentsConsumed` is use. An optional amendment may be allowed
and remain unused. `BASE_ONLY` is valid when zero amendments were consumed, no
amendment receipt exists, and the base and effective leases are identical.
Consumed amendments require one exact receipt and a changed effective lease;
overuse, wildcard scope, wrong identity, or an unreceipted lease change fails
closed.

A task may use multiple ordinary implementation PRs. Terminal evidence records
the contiguous PR/head/tree/merge chain and exact validation for every member.

## GitHub authority and provider failures

Authenticated reads use the workflow token through the shared provider reader.
The minimum endpoint inventory covers repository metadata, pull requests,
issue comments, pull commits, workflow runs, checks, rulesets, and GitHub App
readback. Complete enumeration requires complete pagination; missing pages and
cursor cycles cannot become an empty or complete result.

Failures are classified as validation failure, incomplete read, transient
provider failure, dispatch unavailable, missing authority, or configuration
drift. Transient operations retry at most three times. Exhausted provider
failures remain blocking external/provider evidence; they never become source
corruption or PASS.

## Evidence and lifecycle

Reusable evidence binds repository, PR, task, lease, head, tree, base, changed
path hash, source identity, lifecycle generation, ruleset stage, and review
identity. Every field must match and the evidence must be immutable. Material
identity changes invalidate reuse.

Draft runs prove source readiness only. Ready runs bind the current head, base,
review, Phase 1, and final source. A draft result cannot authorize merge, and a
head/base/review/receipt change invalidates ready evidence.

Protected-main movement is classified as unchanged, mechanical rebinding, or
semantic invalidation. Mechanical advancement permits canonical revalidation;
conflicts and semantic changes require fresh evidence.

## Bounded self-maintenance and recovery

`ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2` is the bootstrappable maintenance
profile. It is limited to 28 named assurance contracts, scripts, tests, and
this runbook, with a 6,500 changed-line ceiling and one implementation PR.
Immutable Owner authority and exact review remain required. The profile grants
no product, provider, database, native, money, build, OTA, submission, or public
release authority.

Exceptional recovery requires exact PR/head/tree Owner authority, names only
the checks being bypassed, expires on that PR merge, records the exception
without fabricating PASS, restores the ruleset immediately, and verifies that
only the permanent Integration actor remains. Provider outages use their
provider classification and do not create repair PRs.

## Terminal synchronization

Terminal synchronization consumes a complete immutable implementation chain
and produces one V3 terminal outcome. Re-running the exact transition returns
the byte-equivalent record with `mutated: false`. A conflicting transition for
an already-terminal task is rejected rather than rewriting history.

## Qualification

`control-plane-qualification.mjs` runs 31 adversarial variants: all 28 required
variants plus explicit small/mixed source-shape and consumed-amendment terminal
synchronization variants,
including optional amendments, large and binary diffs, candidate-only evidence,
provider/pagination failures, multi-PR tasks, recovery, and double terminal
synchronization. Negative controls prove unauthorized paths and product,
database, provider, money, native, OTA/release, stale-evidence, security, RLS,
entitlement, and persistent-bypass cases remain blocked.

Use the failure classification and named invariant to choose the next action:
repair product/source defects in the product task, repair a generic assurance
defect only through bounded self-maintenance, retry only classified transient
provider failures, and request Owner action only where the result explicitly
requires it.
