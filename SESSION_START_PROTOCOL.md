# SESSION START PROTOCOL

## Required Preflight
1. Show `current branch`.
2. Show `git status --short`.
3. Show `git diff --cached --name-only`.
4. If anything is staged, audit it before touching other files.
5. Read `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, and the relevant section of `ROADMAP.md`.
6. Read live Git/GitHub pull-request and protection state. Historical checkpoint files and archived task packets are for targeted reconciliation only and do not select or authorize current work.
7. Restate:
   - product requirements and architectural constraints
   - current branch, base, and exact diff
   - what is already proved
   - current blocker
   - exact next action

## Working Rules
- Follow current repository instructions, product source, and live protected-PR state.
- Keep changes minimal, truth-first, and scoped to the proven owner files for the lane.
- Do not edit app logic unless the control files and proof harness prove a factual mismatch that requires it.
- Leave unrelated worktree noise alone.
- Before every commit, show `git diff --cached --name-only` and confirm the staged set is task-pure.

## Prompt Standard
- Chi'llywood is production-grade now. Future Codex prompts must be exact, scoped, and proof-minded.
- Required prompt ingredients: product truth, scope, route/screen purpose, UI layout, buttons/actions, data sources, empty/loading/error states, permissions/gates, backend/RLS/storage limits, forbidden areas, validation/manual proof, and report format.
- Do not proceed from vague prompts like "modernize", "polish", "add filters", "add route", or "improve dashboard" unless every behavior is spelled out.

## Evidence bookkeeping
- Put durable product requirements in the appropriate product/design document and implementation evidence in the pull request or action-specific release record.
- During proof work, retain raw screenshots, logs, and long terminal output outside Git, then commit only redacted summaries where needed.
- Only mark proof complete when the exact source, build, provider, or installed-device evidence required by the claim exists.
