# Chi'llywood Phase 1 Starter Pipeline

## Purpose
Phase 1 establishes a safe, low-friction CI foundation for Chi'llywood. It reduces human error in day-to-day development while preserving structure stability and keeping checks fast.

## What Phase 1 includes
- GitHub Actions workflow for pull requests and pushes to `main`
- Required checks:
  - `npm run lint`
  - `npm run typecheck`
- Pull request template for focused, reviewable changes
- Issue templates for bug reports and feature requests
- Branch and checkpoint guidance for safe iteration

## Why this scope is intentionally narrow
Phase 1 focuses on dependable baseline checks only. This gives the team a stable base before adding broader automation.

## Relationship to Phase 2A
Phase 1 remains the CI baseline. Phase 2A adds practical day-to-day process discipline (PR expectations, branch flow, merge readiness, and parity-aware review) without adding deployment or preview automation yet.

## Expected developer flow
1. Create a small branch with one goal.
2. Commit an early working checkpoint.
3. Iterate with small commits.
4. Run:
   - `npm run lint`
   - `npm run typecheck`
5. Open PR using the template and resolve review feedback.
6. Merge after required checks pass.

## How this grows in later phases
Future phases can layer on top of this foundation without changing core development habits:
- Preview builds for PR validation
- Safer release workflow
- Regression checks for high-risk flows
- Parity checks for paired surfaces
- Deeper QA automation and deployment workflow

## Parity awareness (not yet automated)
Chi'llywood has paired surfaces that can drift over time (for example player, watch-party, and live-stage experiences). In Phase 1, parity is handled by review discipline and PR checklist prompts only.

Automated parity/regression checks are intentionally deferred to later phases.
