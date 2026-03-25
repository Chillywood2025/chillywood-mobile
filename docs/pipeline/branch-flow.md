# Chi'llywood Branch Flow and Checkpoint Policy

## Branch model
- Protect `main` and treat it as always releasable.
- Use short-lived, focused branches from `main`.
- Keep one goal per branch/session.
- Prefer small PRs over large mixed changes.

## Commit checkpoint habit
Use checkpoints to reduce risk and speed recovery:
1. Make a small safe baseline change.
2. Commit a **working checkpoint** before risky edits.
3. Continue in small, atomic commits.
4. If risk expands, create another checkpoint before continuing.

Recommended commit style:
- `checkpoint: <short purpose>`
- `fix: <focused outcome>`
- `docs: <focused outcome>`

## PR expectations
- Open PR early when scope is clear.
- Keep description specific and scoped.
- Explicitly call out parity risks across paired surfaces.
- Merge only after required checks pass.

## Manual GitHub branch protection guidance
Configure these on `main`:
- Require a pull request before merging.
- Require status checks to pass before merging.
  - Required checks:
    - `Lint and Typecheck`
- Require branches to be up to date before merging.
- Restrict force pushes.
- Restrict direct pushes to `main`.

## Safety rules for structure-stable development
- No unrelated refactors in feature/fix branches.
- Avoid cross-cutting changes without a checkpoint strategy.
- Keep player/watch-party/live surfaces parity-aware in every review.
- Defer heavy automation to later phases once baseline CI remains stable.
