# Chi'llywood Phase 2A Working Pipeline

## Purpose
Phase 2A upgrades the Phase 1 starter pipeline into a practical daily workflow for Chi'llywood development. It strengthens PR quality, branch flow, merge discipline, and parity-aware review expectations while keeping automation lightweight.

## What Phase 2A adds
- Clear PR expectations for parity-aware surface review
- Stronger branch naming and one-goal-per-branch discipline
- Merge readiness rules for safer day-to-day changes
- Reinforced checkpoint commit habits before risky edits

## Daily workflow expectation
1. Create a focused branch (`feature/*`, `fix/*`, `chore/*`, `docs/*`, `hotfix/*`).
2. Keep branch scope to one goal.
3. Create a working checkpoint commit before risky edits.
4. Run local checks:
   - `npm run lint`
   - `npm run typecheck`
5. Open PR with clear scope and parity-impact declaration.
6. Merge only when required checks and review criteria are satisfied.

## PR expectations
- Clearly describe what changed and why.
- Declare impacted paired/shared surfaces, including:
  - regular player
  - watch party
  - live stage
  - watch-party live
  - waiting room
  - participant strip / lower shared room surfaces
- Confirm parity review was completed for affected surfaces.
- Keep PRs small and avoid unrelated refactors.

## Merge readiness rules
- Required CI checks pass.
- Scope stays focused and reviewable.
- Risk notes and mitigation are documented when parity could drift.
- No unrelated cleanup mixed into feature/fix branches.

## Deferred to later phases
Phase 2A intentionally does not add:
- preview builds
- release automation
- regression/parity automation
- deployment workflow
- deeper QA automation

These remain planned for future phases after process discipline is stable.
