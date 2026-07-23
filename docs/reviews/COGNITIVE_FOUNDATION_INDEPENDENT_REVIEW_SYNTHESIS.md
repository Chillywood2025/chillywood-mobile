# Cognitive Intelligence Foundation Independent Review Synthesis

## Review identity and scope

- Implementation PR: `#14` — open, draft, unmerged
- Reviewed head: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`
- Base branch: `codex/ios-integration-90`
- Base commit: `deb8996bd720893c877b3bf03accd54e54802489`
- Changed implementation files: 30
- Review method: three isolated clean agent worktrees followed by a fourth isolated
  adversarial worktree whose attack plan was committed before the first three
  reports were available to it
- Independence boundary: these were separate Codex review contexts, not distinct
  human approvals. No reviewer approved the implementation.

The canonical file inventory and claim matrix are in
`docs/reviews/COGNITIVE_REVIEW_TARGET_INVENTORY.md`. The review branch changes only
review reports, review-only fixtures, sanitized evidence, and remediation guidance.
It contains no implementation fix.

## Baseline reproduction

The implementation's existing checks reproduced under Node `20.20.2` and npm
`10.8.2`: install, lint (0 errors and 86 baseline warnings), TypeScript, runtime,
routes, autonomous inventory/contract/model, all cognitive guards/proofs/tests,
Expo Doctor 18/18, Deno check, and whitespace validation passed. Three clean graph
generations were byte-identical with SHA-256
`b01001ede77317581a4fc451a6d9b6e0e8dbf746274a3f2121931772e8692bee`.

Disposable Supabase reset passed. The repository pgTAP suite passed 329 tests. The
database review added 47 hostile assertions and the red-team lane added 14 hostile
assertions; both suites executed successfully and reproduced the reported unsafe
accepted states. Seven concurrency races produced one row and one unique conflict,
with no deadlock, while confirming that occurrence accounting is absent. The
base-without-cognitive database passed 285 tests. Sanitized linked readback found no
deployed cognitive migration, function, scheduler, model-key-like secret name, or
cognitive tool-credential-like secret name.

Green author tests prove reproducibility, not the safety claims. Independent
fixtures showed that those tests omit material adversarial behavior.

## Lane decisions

| Lane | Decision | Result |
| --- | --- | --- |
| A — architecture/security | `ARCH_SECURITY_CHANGES_REQUIRED` | 0 P0, 3 P1, 4 P2, 2 P3 |
| B — database/RLS/control plane | `DATABASE_RLS_CHANGES_REQUIRED` | 0 P0, 2 P1, 7 P2, 1 P3 |
| C — research/tool/provider/release | `RESEARCH_TOOL_CHANGES_REQUIRED` | 0 P0, 1 P1, 8 P2, 1 P3 |
| D — adversarial integration | FAIL | 17 attacks passed, 23 failed: 0 P0, 19 P1, 4 P2, 0 P3 |

Aggregate report entries are counted by unique lane IDs. Cross-lane corroboration is
not silently deduplicated because each report records a distinct entry point,
reproduction, and required regression test.

| Severity | Count |
| --- | ---: |
| P0 | 0 |
| P1 | 25 |
| P2 | 23 |
| P3 | 4 |
| Total | 52 |

## P0 findings

None. No credential exposure, current production execution, auth/RLS bypass,
self-executing approval, money authority, or cross-user private-data access was
observed. This is not deployment authorization: the absence of current production
exposure depends materially on activation being off, no scheduler or credentials
existing, the migration/functions being undeployed, and the Admin controls being
inert.

## P1 findings

Architecture/security:

- `A-SEC-001` — Execution validation accepts forbidden actions, workflow
  modification, and path escape shapes.
- `A-SEC-002` — Capability and approval control plane is declarative and
  replay-unaware.
- `A-SEC-003` — Evaluator trusts executor assertions and has no enforceable
  independence.

Database/control plane:

- `COG-B-001` — Task, tenant, and platform isolation cannot be enforced.
- `COG-B-002` — Cognitive state can fabricate approval, preflight, execution, and
  evaluation outcomes.

Research/release:

- `C-08` — Validated plans may edit and push deployment-capable workflows.

Adversarial integration:

- `D-06` — No enforceable tool-output-as-data boundary.
- `D-07` — No strict model-output parser or whole-document schema rejection.
- `D-08` — Encoded credential-like research metadata passes ingestion.
- `D-11` — Runtime `force_push` action is accepted.
- `D-12` — Lexical traversal under an allowlisted prefix is accepted.
- `D-13` — An allowlisted symlink can resolve outside the repository.
- `D-14` — Capability expiry is not revalidated per tool call.
- `D-15` — Capability nonce/replay protection is absent.
- `D-16` — Capability platform binding is absent.
- `D-17` — Capability repository binding is absent.
- `D-19` — Atomic mid-plan budget consumption/termination is absent.
- `D-20` — Child-task depth, fan-out, and deadman limits are absent.
- `D-23` — Fabricated executor test output can pass the evaluator.
- `D-24` — Omitted required tests can pass the evaluator.
- `D-30` — Deeply nested secret-like JSON is accepted as sanitized.
- `D-36` — The intended research broker has no enforceable SSRF boundary.
- `D-37` — Provider output can request scope expansion without a validator.
- `D-39` — Cancellation is not propagated through tool execution.
- `D-40` — Rollback failure, quarantine, escalation, and immutable audit are absent.

Every P1 is a deployment blocker. The six A/B/C P1 findings are merge blockers as
reported. The D P1 failures independently demonstrate that relabeling alone cannot
make the foundation executable or deployable.

## P2 findings

- `A-SEC-004` — Prompt-injection and secret filtering accepts explicit hostile
  variants.
- `A-SEC-005` — Model, loop, cancellation, and budget controls are absent; missing
  numeric limits fail open.
- `A-SEC-006` — Learning policy validates only top-level key names.
- `A-SEC-007` — Architecture graph follows external symlinks and asserts secret
  exclusion without proving it.
- `COG-B-003` — Immutable runs depend on mutable plan context.
- `COG-B-004` — Secret/PII filtering and payload bounds are incomplete.
- `COG-B-005` — Retention and erasure are metadata-only and conflict with immutable
  storage.
- `COG-B-006` — Research provenance references are not relationally valid.
- `COG-B-007` — Global dedupe loses occurrence and task-scope semantics.
- `COG-B-008` — Specialized indexes and fan-out/size controls are absent.
- `COG-B-009` — Budgets and learned policy-like content are broadly mutable.
- `C-01` — Claim provenance is not referentially or citation-bound.
- `C-02` — Source quality, freshness, and contradiction checks fail open.
- `C-03` — Research URL/SSRF security contract is absent.
- `C-04` — Prompt-injection detection is bypassable and accepted text persists.
- `C-05` — Research storage can become an immutable, unbounded article archive.
- `C-06` — Model invocation evidence and privacy controls are incomplete.
- `C-07` — Tool/provider capabilities are free-form labels, not isolated authority.
- `C-09` — Architecture digest does not bind source content or commit.
- `D-01` — Authority-bearing webpage text is accepted as a research claim.
- `D-04` — Git-history ingestion has no untrusted-input contract.
- `D-21` — Conflicting operator changes have no executable conflict protocol.
- `D-32` — Resolution can occur without an immutable resolution event.

These are deployment blockers. Findings marked as merge blockers in the lane reports
must be corrected before merge; the others require either remediation before merge
or an explicit, truthful scaffold-only rationale with tracked work. No P2 is
accepted by this review.

## P3 findings

- `A-SEC-008` — Admin copy overstates unimplemented safety properties.
- `A-SEC-009` — Cognitive CI uses mutable action tags; inherited dependency audit
  contains known advisories.
- `COG-B-010` — Super-admin readback is omitted while Admin readback is global.
- `C-10` — Admin foundation status is hard-coded rather than operational truth.

## Cross-review synthesis and apparent contradictions

- Reviewer B proved strong baseline client denial: all 20 tables use RLS and FORCE
  RLS, anon/authenticated clients cannot write, and immutable evidence deletion is
  blocked. That does not contradict `COG-B-001/002`: privileged service state lacks
  task/platform/state-machine/approval linkage and can represent unsafe outcomes.
- Reviewer D observed that an expired capability is rejected at initial admission,
  while A/D still fail capability safety because no per-call issuer, nonce,
  revocation, target binding, atomic consume, or emergency recheck exists.
- Reviewer D's evaluator source-write fixture returned a descriptive
  `evaluatorWriteAllowed:false`; Reviewer A still correctly finds no enforceable
  independent evaluator identity/process/evidence path. A returned boolean is not a
  capability boundary.
- Consequential one-source news and fabricated physical proof are rejected, but
  general prompt injection, encoded secrets, unsupported provenance, and
  caller-asserted tests remain accepted. Narrow safe cases do not prove the broader
  research/evaluator contract.
- Normal graph generation is deterministic and stale source additions are detected.
  A/C nevertheless reproduce external-symlink, false secret-exclusion, and
  content/commit-binding gaps. Determinism does not establish completeness or
  confidentiality.
- All lanes agree that present runtime risk is contained by absence/off-state and
  that the advertised future controls are not implemented sufficiently for
  deployment.

No reviewer recommendation was downgraded or dismissed.

## Claims independently verified

- Activation is off.
- No cognitive scheduler is registered or remotely present.
- No cognitive-bound production model or tool credential is present in reviewed
  source or sanitized linked name readback.
- The cognitive migration is undeployed.
- No cognitive-specific Edge Function is deployed; the changed Owner Command source
  is not the deployed cognitive implementation.
- No cognitive production executor/provider client exists.
- The Admin cognitive component is a static, disabled, read-only placeholder behind
  the existing staff route and owner-visible tab restriction.
- There is no current universal cognitive credential.
- Existing Owner Command behavior works when the cognitive migration is absent.
- Direct ordinary-client cognitive writes are denied in the local schema.
- No current cognitive path moved money, changed rights, altered auth/RLS/roles,
  enforced moderation, or released/deployed anything during review.

## Claims disproved or materially qualified

- `source_complete_not_deployed` is false as a completeness claim. The source is an
  undeployed schema/contract scaffold with major missing runtime controls.
- “No self-approval” is not implemented as an end-to-end control. Missing approval
  IDs pass, synthetic unrelated IDs are representable, and no fresh linked approval
  or independent evaluator identity is enforced.
- “No authority over high-risk domains” is true only because no executor is wired.
  Runtime action validation and workflow/migration/path restrictions do not
  permanently enforce the boundary.
- “Independent evaluator” is descriptive only; caller-supplied booleans and omitted
  tests can produce a pass.
- “Capability/tool broker,” “model router/budget controller,” and orchestration are
  registry declarations, not implemented enforcement services.
- The Admin surface does not provide live cognitive status; it renders hard-coded
  claims.
- Research provenance, freshness, contradiction, URL, prompt-injection, copyright,
  retention, and provider-isolation controls are incomplete.
- The database does not enforce task/tenant/platform isolation, valid state
  transitions, existing approval linkage, immutable execution context, or bounded
  storage/learning/budget authority.

## Merge blockers

1. Replace the source-complete claim with truthful scaffold language immediately.
2. Implement strict typed action/tool validation, semantic forbidden-effect checks,
   canonical realpath/symlink/submodule confinement, exact branch/remote rules, and
   exclusion of deployment-capable workflows/migrations from executor authority.
3. Bind task, tenant, platform, repository, provider, operation, approval,
   capability, evaluator, budget, and emergency state in both service and database
   control planes.
4. Implement a real independent evaluator that obtains complete evidence rather
   than trusting executor assertions.
5. Add database-enforced state machines, immutable execution snapshots, scoped
   provenance, bounded recursive sanitization, and typed safe-learning/budget
   records.
6. Implement research provenance/freshness/contradiction and an isolated SSRF-safe
   URL contract before any web access.
7. Close every lane-specific item marked `Merge blocker: yes` and rerun its exact
   fixture without weakening expected behavior.

## Deployment blockers

All 52 findings remain deployment blockers unless their lane explicitly records a
narrow non-deployment observation. In addition, deployment remains prohibited until:

- owner/counsel decide retention, deletion, legal hold, copyrighted excerpt, and
  private-user-derived data rules;
- real least-privilege provider/model credentials, isolation, rotation, revocation,
  and audit design receive separate review;
- signed capability issuance/atomic consumption/replay prevention exists;
- cancellation, timeout, loop, budget, concurrency, conflict, rollback-failure,
  quarantine, and emergency-stop behavior is executable and proven;
- live Admin readback fails closed and cannot invoke hidden actions;
- migrations/functions/schedulers receive a new deployment-specific security,
  database, provider, and operations review.

Activation, scheduler creation, model/provider credentials, migration/function
deployment, production tool authority, and production Admin controls must remain off.

## Required remediation order

1. Preserve the off/undeployed state and correct misleading status/UI/registry copy.
2. Close executor path/action/workflow/migration/remote/tool escape findings.
3. Implement the signed task/platform/target-scoped approval and capability plane,
   including replay, revocation, per-call preflight, emergency stop, and audit.
4. Implement independent evaluator identity and direct evidence acquisition.
5. Redesign database task/tenant/platform isolation, state machines, immutable
   execution snapshots, provenance, budgets, learning, dedupe, and retention.
6. Implement taint-preserving research ingestion, source corroboration/freshness,
   recursive redaction, copyright limits, and SSRF-safe network isolation.
7. Add model/tool privacy, strict schema, idempotency, budget, loop, cancellation,
   conflict, provider-output, and rollback/quarantine controls.
8. Bind the graph to exact commit/content/policy inputs and secure realpath/secret
   handling; replace hard-coded Admin status with live fail-closed readback.
9. Pin CI actions, triage inherited advisories, and obtain three distinct human
   reviews before a new merge decision.

## Required retest plan

- Rerun all existing Node, Deno, Expo, autonomy, cognitive, and pgTAP checks.
- Rerun Reviewer A's fixture and every A2–A10 regression corpus.
- Rerun all 47 database hostile assertions, role matrices, signed PostgREST/JWT
  tests, seven concurrency races, impossible transitions, retention/legal-hold,
  workload EXPLAIN, and partial-deployment/base-absence tests.
- Rerun the research provenance, contradiction, freshness, prompt injection,
  encoded secret, copyright/storage, model privacy/schema/retry/idempotency, exact
  provider capability, release-boundary, graph staleness, and Admin live-readback
  suites.
- Rerun all 40 D attacks against the actual broker/executor/evaluator processes and
  signed API paths. All 40 must exhibit the expected safe behavior before any
  activation review.
- Repeat three clean graph generations across randomized enumeration and supported
  OS path/case behavior, including external symlink, untracked private file, huge
  file, edge/file caps, and secret fixtures.
- Require new independent architecture/security, database/RLS, and
  research/provider/release human reviews.

## Residual risks and human decisions

Even after source remediation, models and external research remain probabilistic
and hostile-input surfaces. Owner authority must permanently retain production
credentials, approval levels, forbidden scopes, money/entitlements, auth/RLS/roles,
moderation outcomes, ranking/public exposure, legal/privacy policy, provider
products/prices, migration/function/scheduler deployment, releases/builds/stores,
and OTA. No cognitive component may self-approve or modify those permanent policies.

Owner and counsel decisions are required for research copyright/excerpt policy,
source removal, retention classes, legal hold, deleted-user-derived content, and
whether any private user-derived material may ever enter a model context. This
review makes no legal-compliance pass claim.

No eligible distinct reviewers or teams were configured on PR #14 and no CODEOWNERS
file exists. Status: `HUMAN_REVIEWERS_NOT_CONFIGURED`.

## Final recommendation

`REVIEW_BLOCKED_P1`

Do not merge PR #14 under its current source-complete claim. Do not deploy the
cognitive migration/function/scheduler, add model/provider credentials, or connect
production tools. Retain the branch only as an explicitly non-executable,
undeployed scaffold while the P1 controls are implemented first, then remediate the
P2/P3 findings and repeat the complete independent review. This decision is not an
approval and grants no merge or deployment authorization.
