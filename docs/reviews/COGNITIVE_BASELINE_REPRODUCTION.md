# Cognitive Foundation Baseline Reproduction

## Target and method

The baseline was reproduced from implementation commit
`bd8fd0c709db8ff843b69fa9b9a5039a74d09a94` against base
`deb8996bd720893c877b3bf03accd54e54802489`. The primary review branch contains
review evidence only. Reviewer worktrees began from the same detached source
commit.

Runtime used for the authoritative Node reproduction:

- Node `20.20.2`
- npm `10.8.2`

## Source validation

| Check | Result | Evidence summary |
| --- | --- | --- |
| `npm ci` | PASS | Lockfile install completed; no audit fix executed. |
| `npm run lint` | PASS WITH BASELINE WARNINGS | 0 errors and 86 existing warnings. |
| `npx tsc --noEmit` | PASS | TypeScript exited successfully. |
| `npm run validate:runtime` | PASS | Runtime contract validated. |
| `npm run guard:route-contracts` | PASS | Route contract guard passed. |
| Autonomous component inventory guard/proof | PASS | 39 components and 33 systemd units. |
| Autonomous systems contract guard/proof | PASS | Existing active/protected-system contract passed. |
| Autonomous operating-model guard | PASS | Passed. |
| Expo Doctor | PASS | 18/18 checks. |
| `git diff --check` | PASS | No whitespace errors. |
| Changed Owner Command Edge Function Deno check | PASS | Checked with `--node-modules-dir=auto --no-lock`. |

## Cognitive validation

The following independently executed and passed:

- Cognitive Intelligence Contract guard and proof
- Research Source Integrity guard and proof
- Research Source Broker tests
- Cognitive Memory Integrity guard and proof
- Cognitive Architecture Graph guard and proof
- Cognitive Execution Safety guard, proof, and behavioral test

These results establish reproducibility of the implementation’s existing tests.
They do not establish design correctness; the isolated reviews and red-team pass
test assumptions the existing suite does not cover.

## Architecture graph determinism

The graph was generated independently in three clean detached worktrees. Two used
normal tracked enumeration. In the third, two reviewed files were deliberately
moved from the temporary worktree index to untracked state without changing their
contents, exercising the tracked/untracked enumeration-order boundary.

All three normalized outputs were byte-identical with SHA-256:

`b01001ede77317581a4fc451a6d9b6e0e8dbf746274a3f2121931772e8692bee`

Result: PASS for the tested macOS clean-worktree and index-order cases. This does
not by itself prove Windows path/case behavior or resistance to malicious source
content.

## Database reproduction

The isolated database lane reproduced:

- `supabase db reset`: PASS through the cognitive migration;
- repository pgTAP: 8 files and 329 tests, all passed;
- database review pgTAP: 47 assertions, all executed successfully (including
  assertions that deliberately reproduce unsafe accepted states);
- base-without-cognitive reset: PASS through `20260719220000`;
- non-cognitive pgTAP with the cognitive migration absent: 7 files and 285 tests,
  all passed;
- linked migration state: cognitive migration `20260723001845` is MISSING
  remotely;
- linked cognitive function, scheduler, model-key-like secret name, and
  cognitive tool-credential-like secret name: MISSING.

The complete database matrix and adverse outcomes are recorded separately in the
database/RLS report. Green pgTAP does not erase the reproduced isolation,
state-machine, approval-linkage, storage, and retention findings.

Reviewer D's separate database fixture added 14 pgTAP observations and passed as
written, including hostile observations that prove deeply nested secret-like JSON
and unaudited resolution are accepted. Its executable attack fixture emitted all
40 required IDs deterministically: 17 safe outcomes and 23 failures.

## Review-branch validation

After consolidating all reports and keeping review fixtures under
`docs/reviews/`, the review branch repeated the required validation. The
architecture graph initially and correctly reported stale when review fixtures
were placed under production-indexed `scripts/` and `supabase/tests/` paths. The
fixtures were moved—without changing their content—to the excluded review-evidence
directory rather than altering the implementation graph. Graph guard/proof then
passed against the unchanged reviewed snapshot.

Final review-branch results:

- Node install, lint, TypeScript, runtime, routes: PASS;
- autonomous inventory/contract/model guards and proofs: PASS;
- every cognitive guard, proof, and authored behavioral test: PASS;
- Reviewer A fixture: 14 unsafe acceptance observations reproduced;
- Reviewer B pgTAP: 47/47 assertions executed successfully;
- Reviewer B concurrency: seven deterministic unique conflicts and no deadlock;
- Reviewer D fixture: 40/40 attack IDs executed, 17 pass and 23 fail;
- Reviewer D pgTAP: 14/14 observations executed successfully;
- repository pgTAP: 329/329 PASS;
- Owner Command Deno check: PASS;
- Expo Doctor: 18/18 PASS;
- graph guard/proof and `git diff --check`: PASS.

## Dependency baseline

`npm ci` reported 23 known dependency audit findings (1 low, 19 moderate, 3 high)
and several deprecated transitive packages. No dependency was added by PR #14 and
no automatic audit fix was run. Reviewer A evaluates relevance and supply-chain
impact separately.
