---
name: chillywood-assurance
description: Plan, validate, review, and merge Chi'llywood source changes through the normal protected pull-request workflow while preserving action-specific release and production boundaries.
---

# Chi'llywood engineering workflow

Use this skill for repository work that must pass protected validation or that
touches release/provider tooling.

## Ordinary source lifecycle

1. Read the relevant source, tests, instructions, and live Git/GitHub state.
2. Preserve other work and make one focused implementation PR.
3. Run `node scripts/ci/required-validation.mjs --plan --base=origin/main`.
4. Run the selected local checks and review the exact diff.
5. Wait for the exact-head `Chi'llywood / Required Validation` result.
6. Merge normally through active protected-main rules.

Do not create admission carriers, task leases, Owner JSON receipts,
current-truth companions, final-source receipts, or terminal-truth PRs for
ordinary development. Historical files under `config/assurance`,
`docs/assurance/tasks`, `CURRENT_STATE.md`, and `NEXT_TASK.md` do not grant
source authority.

## Risk and applicability

The protected planner selects core plus affected product, sensitive, database,
native/release, autonomous, and policy checks from the complete diff. Unknown
or broad changes run the conservative set. Workflow/policy changes require an
exact-head trusted review. Never use comments, labels, or self-attested risk to
downgrade validation.

## Consequential actions

Source merge authority never implies OTA, build, submission, public release,
production database/provider mutation, or money authority. Require explicit
action-specific Owner authorization and use the canonical release tools. Keep
publication, provider receipt, signed artifact, installed physical proof, and
public canary as distinct evidence.

## Failure behavior

Applicable failures remain blocking. Missing, stale, cancelled, timed-out,
wrong-head, or wrong-base evidence cannot pass. If live branch protection or a
provider is unavailable, preserve the complete candidate and report the exact
external boundary rather than inventing evidence or weakening protection.
