# NEXT TASK

## Exact Next Task
The next exact task is a narrow **public legal-surface deployment** pass on `main`. The just-closed export-prep lane is now governing truth: `APP_UPSTREAM_READY = LATER_BOUNDED_SLICE` still means there is no broader deployable app-owned HTTP upstream, `LEGAL_SURFACE_READY = YES_BOUNDED_STATIC_SLICE` still means only the three existing legal owners are in scope, and the repo now has a bounded artifact path through `scripts/build-public-legal-surfaces.sh` plus the web-safe LiveKit import shim in `_lib/livekit/react-native-module.tsx`. [docs/database-move-doctrine-audit.md](/Users/loverslane/chillywood-mobile/docs/database-move-doctrine-audit.md) still governs that any database/auth move remains deferred and out of scope. Use `CURRENT_STATE.md`, [docs/app-upstream-doctrine-readiness.md](/Users/loverslane/chillywood-mobile/docs/app-upstream-doctrine-readiness.md), [docs/public-legal-surface-contract.md](/Users/loverslane/chillywood-mobile/docs/public-legal-surface-contract.md), `docs/hetzner-first-deployment-implementation-spec.md`, `scripts/build-public-legal-surfaces.sh`, `app.config.ts`, `_lib/runtimeConfig.ts`, `app/privacy.tsx`, `app/terms.tsx`, `app/account-deletion.tsx`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/app-upstream-doctrine-readiness.md`, `docs/public-legal-surface-contract.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `scripts/build-public-legal-surfaces.sh`, `app.config.ts`, `_lib/runtimeConfig.ts`, `app/privacy.tsx`, `app/terms.tsx`, `app/account-deletion.tsx`, `components/system/support-screen.tsx`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat `APP_UPSTREAM_READY = LATER_BOUNDED_SLICE` as current truth.
3. Treat `LEGAL_SURFACE_READY = YES_BOUNDED_STATIC_SLICE` as current truth.
4. Treat the grounded later slice as public legal pages only unless current repo truth proves more.
4. Keep support out of the host-ready slice unless its signed-in feedback dependency is intentionally removed later.
5. Keep status out of scope unless a canonical public status owner is intentionally created later.
6. Keep Firebase / RevenueCat / Expo/EAS external for now.
7. Keep database-move or auth-cutover work deferred unless a separate later chapter explicitly reopens them.
8. Use the bounded export script to build a pruned legal-only artifact, then prove host sync, Caddy path ownership, HTTPS reachability, and runtime URL cutover without widening beyond that slice.

## Exact Next Batch
- start from the now-proved LiveKit host, signer, runtime, deep-link, and two-device join truth already recorded in `CURRENT_STATE.md`
- keep broader app-upstream deployment explicitly out of scope
- treat the current Hetzner realtime cutover lane as complete enough to move on
- build the pruned legal-only artifact
- sync it to the Hetzner host
- wire only the exact legal paths through Caddy
- stop before claiming success unless the legal paths are actually live over HTTPS
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the bounded public legal-surface deployment family
- preserve all current product route truth and all previously landed chapter ownership
- keep broader app-upstream hosting explicitly deferred even though LiveKit ingress is now real
- avoid reopening already-landed safety, design, discovery, analytics, or owner/admin implementation unless a real regression is found
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- buy providers or add OVH work
- start release hardening / Google Play readiness work in this lane
- move databases or Supabase auth off their current hosted owner
- fake app upstream, fake broader product deployment, or reopen already-proved realtime joins as though they were still the open blocker
- change current public/product route truth
- write provider tokens, private keys, or raw secrets into repo files
- widen into full app deployment, app upstream hosting, or unrelated infra systems
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the bounded legal-surface slice is actually built, synced, and reachable while staying bounded
- the remaining post-realtime seam is explicit and grounded
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
