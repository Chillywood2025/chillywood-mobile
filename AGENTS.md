# Chi'llywood Engineering Workflow

These rules govern the repository. A deeper `AGENTS.md` may tighten them but
may not weaken product, security, release, or production-action boundaries.

## Ordinary source work

1. Read the relevant product source, tests, and feature documentation.
2. State the objective and preserve unrelated work.
3. Implement on one focused branch and open one ordinary pull request.
4. Use `node scripts/ci/required-validation.mjs --plan --base=origin/main` to
   inspect the conservative validation selection.
5. Run the selected checks, review the exact diff, and merge only after the
   protected `Chi'llywood / Required Validation` check succeeds.

Ordinary source work does not require an admission pull request, task lease,
Owner JSON receipt, generated current-truth update, completeness certificate,
final-source receipt, or terminal-truth pull request. `CURRENT_STATE.md`,
`NEXT_TASK.md`, `config/assurance/**`, and historical task artifacts are
non-authoritative history unless an action-specific tool explicitly documents a
retained use.

## Validation and review

- Core lint, TypeScript, runtime, routes, and Expo validation always run.
- Diff-derived categories add product, sensitive, database, native/release,
  autonomous, and policy checks. Unknown scope runs every category.
- CI/workflow/policy changes require stronger exact-head human review. A label,
  comment, or caller-provided risk value cannot reduce checks.
- Missing, stale, wrong-head, failed, cancelled, timed-out, or unjustifiably
  skipped applicable jobs block the required result.
- Preserve functional handlers, navigation, auth/session/RLS, entitlements,
  money, moderation, native integrations, provider boundaries, and release
  controls when refactoring presentation or shared components.
- Use `git diff --check`, focused regression tests, and exact-diff review before
  every merge. Do not rewrite shared history or destroy unrelated changes.

## Production and provider boundaries

Source approval is not production-action authority. Production deployments,
OTA publication, distribution builds, store submission, production
database/provider mutation, public release, and money/payout/SKU operations
require explicit action-specific authorization and their canonical tooling.

- OTA must bind platform, environment, runtime, channel, source, native digest,
  signed artifact, capabilities, and rollback compatibility. Publication is not
  installed-device proof.
- Release workflows must pass `scripts/release-review-gate.mjs` and retain
  source/platform/runtime/channel, duplicate-submission, rollback, and physical
  evidence safeguards.
- Database migrations remain forward-only and deployed versions immutable.
- Native claims require platform-specific generated-source, compile, test, and
  physical evidence where the claim requires it.
- Never print or commit secrets, private provider payloads, signed URLs, raw
  device identifiers, or private logs.

## Worktree safety

Use `rg` for search and `apply_patch` for edits. Preserve uncommitted and
unrelated work. Do not use destructive Git commands, force-push shared work, or
commit generated native directories. `deno.lock` stays untracked unless a
dependency change intentionally updates it.
