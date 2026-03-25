# Chi'llywood Phase 2B Preview-Build Readiness

## Purpose
Prepare Chi'llywood for preview builds safely, without adding deployment or release automation yet.

## Scope in Phase 2B
- Add EAS profile scaffolding (`preview`) only.
- Keep preview triggering manual initially.
- Keep CI checks focused on lint and typecheck.

## Manual preview readiness checklist
- `npm run lint`
- `npm run typecheck`
- Confirm branch is focused and parity-aware review is complete.

## Required secrets/config (for later automated preview runs)
- `EXPO_TOKEN` (GitHub Actions secret)
- EAS project must be initialized and linked.
- Platform credentials must exist when building iOS/Android previews.

## Deferred
- Automatic PR preview builds
- Deployment workflows
- Release automation
- Regression/parity automation
- Deep QA automation
