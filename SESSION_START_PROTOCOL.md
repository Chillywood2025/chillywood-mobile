# SESSION START PROTOCOL

## Required Preflight
1. Show `current branch`.
2. Show `git status --short`.
3. Show `git diff --cached --name-only`.
4. If anything is staged, audit it before touching other files.
5. Read `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` in that order.
6. Do not read archived checkpoint history during normal preflight. Archives exist for targeted historical reconciliation only; loading them during live proof can force remote Codex compaction and interrupt the session.
7. Restate:
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

## Prompt Standard
- Chi'llywood is production-grade now. Future Codex prompts must be exact, scoped, and proof-minded.
- Required prompt ingredients: product truth, scope, route/screen purpose, UI layout, buttons/actions, data sources, empty/loading/error states, permissions/gates, backend/RLS/storage limits, forbidden areas, validation/manual proof, and report format.
- Do not proceed from vague prompts like "modernize", "polish", "add filters", "add route", or "improve dashboard" unless every behavior is spelled out.

## Checkpoint Bookkeeping Order
- Update `CURRENT_STATE.md` first.
- Update `NEXT_TASK.md` second.
- Keep `CURRENT_STATE.md` compact. Move detailed older checkpoint history to `docs/archive/` instead of letting the hot-path control file grow without bound.
- During proof lanes, save raw screenshots, logcat output, and long terminal output to artifact files, then summarize the small factual result in the control files.
- For long proof lanes, run `npm run proof:session -- <label>` first and use `/tmp/chillywood-proof-latest.txt` as the resume pointer after any remote compact-stream disconnect.
- Only mark proof or reconciliation complete when the current build and terminal/workflow output support it.
