# SESSION START PROTOCOL

## Required Preflight
1. Show `current branch`.
2. Show `git status --short`.
3. Show `git diff --cached --name-only`.
4. If anything is staged, audit it before touching other files.
5. Read `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` in that order.
6. Restate:
   - governing truth
   - current checkpoint
   - what is already proved
   - current blocker
   - exact next action

## Working Rules
- Follow repo control files first.
- Keep changes minimal, truth-first, and scoped to the proven owner files for the lane.
- Do not edit app logic unless the control files and proof harness prove a factual mismatch that requires it.
- Leave unrelated worktree noise alone.
- Before every commit, show `git diff --cached --name-only` and confirm the staged set is task-pure.

## Checkpoint Bookkeeping Order
- Update `CURRENT_STATE.md` first.
- Update `NEXT_TASK.md` second.
- Only mark proof or reconciliation complete when the current build and terminal/workflow output support it.
