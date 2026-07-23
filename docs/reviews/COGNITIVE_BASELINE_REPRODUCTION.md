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

Local Supabase reset and the complete pgTAP suite are pending consolidation with
the isolated database lane. Linked remote state is read-only and will be recorded
in the final database report and synthesis.

## Dependency baseline

`npm ci` reported 23 known dependency audit findings (1 low, 19 moderate, 3 high)
and several deprecated transitive packages. No dependency was added by PR #14 and
no automatic audit fix was run. Reviewer A evaluates relevance and supply-chain
impact separately.
