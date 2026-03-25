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

## Phase 3A manual workflow
- Manual preview builds can be triggered via GitHub Actions workflow dispatch.
- Workflow file: `.github/workflows/phase3a-manual-preview.yml`
- Expected input values:
	- `platform`: `all`, `android`, or `ios`
	- `profile`: `preview` (default)

## Checkpoint (2026-03-25)
- Latest successful workflow: `Phase 3A Manual Preview Build` on `main`.
- Platform confirmed: `android`.
- EAS profile confirmed: `preview`.
- Key blockers resolved:
	- `EXPO_TOKEN` auth
	- Android package configuration
	- EAS project linkage in `app.json`
	- Workflow rerun after config push
- Remaining cache/Node warnings are non-blocking and can be cleaned up later.

## Deferred
- Automatic PR preview builds
- Deployment workflows
- Release automation
- Regression/parity automation
- Deep QA automation
