# Assurance Simplification V1

Status: migration candidate. This document describes the protected cutover and
is not a source-authority packet.

The bounded path/line exception for this single cross-cutting migration is
recorded in `assurance-simplification-v1-budget-waiver.json`; it grants no
product or production-action authority.

## Intended workflow

Ordinary work follows: objective → one implementation pull request → selected
engineering checks and source review → protected merge → finished. Production
actions remain separately authorized.

## Dependency inventory

| Path/component | Current callers before cutover | Purpose | Disposition | Replacement | Verification |
|---|---|---|---|---|---|
| `phase1-ci.yml` | PR and main events | Product checks plus task eligibility | REMOVE | `required-validation.yml` | source workflow integration and selector tests |
| `phase1-admission.yml` | PR, comment, workflow-run, dispatch | App-published admission and merge | REMOVE | checks-only App publisher plus native PR merge | publisher negative tests and live ruleset readback |
| `engineering-closure.mjs`, `active-task.mjs`, `jurisdiction-policy.mjs` | old admission, local packet commands, historical tests | leases, receipts, scope and authority | HISTORICAL | ordinary PR state and selected tests | active-caller audit |
| `pr-scope.mjs`, `pr-scope-lib.mjs` | old Phase 1 and admission | full-diff scope packet | HISTORICAL | changed-path selector with conservative unknown fallback | large historical artifact test |
| `current-truth.mjs`, `CURRENT_STATE.md`, `NEXT_TASK.md` | old instructions and terminal synchronization | duplicate lifecycle state | HISTORICAL | Git/GitHub live state | absent/stale files do not affect selector |
| `control-plane-lifecycle.mjs`, `control-plane-v2.mjs` | old terminal consumers and historical tests | custom lifecycle | HISTORICAL | pull-request and Git merge lifecycle | concurrent PR and head invalidation tests |
| `phase1-admission.mjs` | privileged App workflow | status publication and App-only merge | HISTORICAL | protected-main `required-validation.mjs --publish` | exact PR/base/head/job/review checks |
| `late-review-sentinel.mjs` | four release/build workflows | unresolved late review blocker | REMOVE from active use | `release-review-gate.mjs` | issue-state negative tests; live issue remains blocking |
| `codex-review-exact-head.yml` | optional privileged advisory | custom review receipt | REMOVE | GitHub exact-head review/check state | policy review tests |
| `schemas`, registries, receipts and historical fixtures | historical assurance tests | old evidence compatibility | HISTORICAL | none for ordinary work | not loaded by active validation |
| #490 release-control helpers | OTA, Apple delivery and physical automation tools | action-specific provenance and recovery | KEEP | unchanged focused helpers | release-control regression tests |
| autonomous contract wrappers | old universal lanes | product assertions plus task freshness | SIMPLIFY | direct substantive autonomous commands | autonomous validation job |
| product guards formerly reading generated truth | package commands | auth, rights, malware, roles, media and operator safety | KEEP | guards now read product source and durable doctrine only | focused guard execution |

## Validation selection

`config/ci/required-validation-v1.json` is a small path-to-check mapping. Core
checks always run. Product, sensitive, database, native/release, autonomous,
and policy categories are additive. Unknown paths and policy changes run the
full conservative set. Labels, comments, and caller-supplied classifications
are ignored.

The unprivileged source workflow never receives production credentials. Its
final summary always runs. The protected-main publisher independently reads the
complete PR file list and source-run jobs, recomputes applicability, verifies
the repository identity and current base/head, requires every applicable
result, and publishes `Chi'llywood / Required Validation` on that exact head. A
changed head cannot reuse the result. Policy changes require either a
GitHub-verified personal repository owner as the author or an exact-head
approval by a trusted reviewer other than the author. Owner authorship is
recorded as owner authorization, not independent review, and is derived from
trusted repository and user metadata rather than a label, comment, association,
or branch-controlled claim. The publisher uses the existing dedicated GitHub
App only for a short-lived, repository-scoped `checks:write` token. The App has
no contents permission and is not a ruleset bypass actor, so pull-request
workflows cannot forge the App-bound result and the App cannot merge source.

## Retained safety coverage

| Safety purpose | Continuing command/result |
|---|---|
| lint, TypeScript, runtime, routes, Expo | `Validation / Core` |
| route and user-facing regressions | `Validation / Product` |
| auth/session, First Owner, legal, RLS/entitlements, money, moderation, Chat calls | `Validation / Sensitive` |
| migrations and RLS database behavior | `Validation / Database` |
| native, OTA and release provenance | `Validation / Native and Release` |
| autonomous operator and cognitive safety | `Validation / Autonomous` using direct substantive checks |
| CI/policy integrity | `Validation / Policy` plus protected publisher owner-or-review authorization |
| unresolved late review findings | `scripts/release-review-gate.mjs` in action-specific workflows |
| OTA/Apple/physical provenance | #490 release-control helpers and regression tests |

The autonomous job retains every substantive command from the former three
autonomous/cognitive lanes and their execution, research, memory and database
companions. It deliberately retires only
`proof:autonomous-systems-contract`, whose wrapper mixed those checks with the
finite-task lease/current-truth eligibility being removed. A static migration
audit enumerates the retained direct commands so a future workflow edit cannot
silently drop them.

## Protected cutover

Live ruleset 18940814 initially requires App check `Phase 1 / Admission
Decision` (Integration 4707730) and keeps that Integration as the sole bypass.
The prepared target in `config/ci/main-ruleset-v2.json` keeps enforcement and
strict status policy active, requires `Chi'llywood / Required Validation` from
the dedicated publisher App (Integration 4707730), and has no permanent bypass
actor. GitHub Actions job names are not accepted as the protected result.

Safe sequence:

1. Freeze and validate this migration PR while the old protection remains.
2. Use one exact-source Owner-approved PR-only bootstrap to merge only this
   migration if the retired publisher cannot authorize its replacement.
3. Remove the temporary bypass immediately. Main remains protected and may be
   temporarily unable to merge while the new publisher is proven.
4. Reduce Integration 4707730 to the exact `checks:write` plus implicit
   `metadata:read` permissions used by the replacement publisher; it retains no
   contents, merge, statuses, or environment API authority.
5. Trigger the merged source workflow on an existing ordinary PR, then verify
   the protected-main publisher creates an exact-head App-authored result.
6. Atomically replace the obsolete required context with that verified App-bound
   context and remove Integration 4707730 from permanent bypass. Re-read all
   effective rulesets. The publisher environment and key remain because they
   are an active checks-only consumer, not an admission or merge engine.

There is no interval with an empty required-check set or disabled enforcement.
Rollback restores the workflow files from protected commit
`a36603bbf37419d5eb38899cdb617b75496c4443` and the exact old App check/bypass
and App permission set recorded in `config/ci/main-ruleset-v2.json`;
restoration must restore publisher implementation, App permissions, and
protection together.

## Open work disposition

- PR #497 remains the product implementation PR. Its visual objective and
  design analysis are preserved, but its giant authority artifact is not
  implementation or validation. After cutover it will be reduced to an
  ordinary concise design note and continued under the replacement checks.
- PR #499 becomes superseded historical admission evidence and is not merged.
- PR #500 remains reviewable compatibility history and is not merged merely to
  preserve the retired architecture.

No application deployment, OTA, native build, store submission, production
database/provider mutation, public release, or money operation is part of this
migration.
