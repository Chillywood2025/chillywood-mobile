# Assurance Efficiency E1 — read-only proposal

Status: `PROPOSED_NOT_IMPLEMENTED`. E0 does not authorize any item below.

## Objective

Reduce deterministic CI and review latency after E0 is measured, without changing
T0–T7 proof meaning, P0/P1 stop behavior, Level C lane count, or the final full
Phase 1 CI requirement at each frozen implementation head.

## Proposed governance decision

Recognize Codex Code Review as one durable semantic input only after the review
contract defines its exact-head identity, freshness, finding schema, retry policy,
and independence boundary. Run it once per frozen source head. Until that contract
change merges, Code Review remains additional evidence and cannot replace a formal
review lane.

Split the remaining Level C work by capability rather than model name:

- deterministic/static lanes: identity, schema, path, migration, generated-source,
  dependency, secret-pattern, and proof-substitution checks;
- focused semantic lanes: exact-diff compatibility and bounded test triage;
- strong semantic lanes: architecture, security, concurrency, P0/P1 investigation,
  whole-app adjacent-risk discovery, and ambiguous final failures.

Every semantic receipt would remain independent, exact-head/tree bound, compact,
and invalidated by a source or required-input change.

## Proposed CI architecture

Add an always-running metadata planner that computes the E0 active-task packet,
changed-path hash, affected feature/domain set, mandatory job set, and cache keys.
It must not mark product proof PASS. An `if: always()` summary must reject missing,
skipped-without-justification, stale, ambiguous, or substituted required jobs.

Change-based CI may omit a job only when the versioned test-intelligence catalog
proves it non-applicable. The planner, contracts, current truth, review binding,
diff checks, and final summary always run. The final frozen implementation head
still runs the exact full Phase 1 workflow and must pass 13/13.

Add CodeQL as a source-analysis signal with pinned actions, explicit language and
query suites, SARIF retention, and P0/P1 routing. CodeQL does not prove runtime,
native, provider, artifact, installed, physical, or public behavior.

## Proposed caching and acceleration

Use content-addressed dependency caches bound to lockfiles, runner OS/architecture,
toolchain versions, and relevant build configuration. Never cache credentials,
provider responses, signing material, device evidence, or proof conclusions.

For Gradle, evaluate configuration cache, build cache, dependency verification,
parallel workers, and prebuilt unchanged dependencies. For Xcode, evaluate exact
DerivedData/module-cache keys, resolved package/Pod identity, test-without-building,
and destination reuse within one bounded job. Generated native source must remain
disposable and independently hashed; cache hits cannot replace compile/native tests.

## Test intelligence and reliability

Create a versioned catalog mapping features, symbols, paths, domains, proof tiers,
historical defects, and negative controls to command IDs. Any unmapped change fails
closed and expands to the conservative suite. Catalog changes receive assurance
contract review and mutation tests proving a mandatory gate cannot disappear.

Record command duration, runner/toolchain identity, exit class, retries, and flake
history as compact receipts. A retry never erases the first failure. Quarantine
requires an owner, expiry, linked defect, preserved failing evidence, and an equally
strong mandatory replacement; P0/P1, security, migration, money, auth/RLS, native,
artifact, installed, physical, and public gates are not silently quarantinable.

## Acceptance plan for a separately authorized E1

1. Freeze an E1 contract and threat model before workflow edits.
2. Prove planner determinism and conservative expansion with negative controls.
3. Shadow current Phase 1 without suppressing any job and compare job decisions.
4. Validate cache poisoning, stale-key, cross-platform, secret, and forged-summary
   attacks with exact misses.
5. Run four Level C review lanes and one exact-diff security review.
6. Run the unchanged full Phase 1 workflow at the final frozen E1 head.
7. Enable conditional execution only in a later, separately approved change after
   shadow parity is demonstrated; retain a one-step rollback to full execution.

No CodeQL workflow, CI planner, cache, build acceleration, quarantine, review-lane
substitution, or governance change is implemented by E0.
