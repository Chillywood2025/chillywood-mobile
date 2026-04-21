# NEXT TASK

## Exact Next Task
The next exact task is a narrow **restore second-device adb proof + rerun simultaneous authenticated realtime join verification** pass on `main`. The new [docs/database-move-doctrine-audit.md](/Users/loverslane/chillywood-mobile/docs/database-move-doctrine-audit.md) is still governing truth that any database/auth move remains deferred and out of scope for this lane. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `docs/database-move-doctrine-audit.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat `APP_UPSTREAM_READY = NO` as unchanged unless a separate later app-upstream spec intentionally changes it.
3. Treat authenticated token issuance against the current signer path as already proved from the current local env and real proof user.
4. Treat one Android device-backed Party Room re-entry plus one real Android LiveKit RTC session/published-video proof as already landed for room `XQBBRE`.
5. Restore a second real Android device on ADB and rerun the same canonical Party Room deep-link path on both devices.
6. If the two-device proof fails again, isolate whether the blocker is second-device availability, client runtime support, room access, token usage, or simultaneous connection behavior.
6. Keep Firebase / RevenueCat / Expo/EAS external for now.
7. Stop immediately if supported device/runtime proof is still unavailable.
8. Keep any database-move or auth-cutover work deferred unless a separate later chapter explicitly reopens it.

## Exact Next Batch
- start from the aligned LiveKit host, signer, and runtime truth already recorded in `CURRENT_STATE.md`
- keep app-upstream hosting explicitly out of scope unless a later doctrine pass defines a real deployable upstream
- treat authenticated token issuance and one Android device-backed join as already proved
- restore two real-device transport on ADB before retrying simultaneous room proof
- verify both devices reach the same canonical Party Room target and then the same authenticated Watch-Party Live join path
- confirm the current Caddy-to-LiveKit ingress path behaves correctly during that actual two-device join attempt, not just static `curl` checks
- decide whether one final narrow realtime correction batch is still justified after the simultaneous proof retry
- if not, close the realtime cutover lane and hand off to the next grounded infra lane
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the Hetzner / LiveKit realtime verification surface family
- preserve all current product route truth and all previously landed chapter ownership
- keep the current no-app-upstream truth explicit even though LiveKit ingress is now real
- avoid reopening already-landed safety, design, discovery, analytics, or owner/admin implementation unless a real regression is found
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- buy providers or add OVH work
- start release hardening / Google Play readiness work in this lane
- move databases or Supabase auth off their current hosted owner
- fake realtime success, fake app upstream, or fake broader product deployment
- change current public/product route truth
- write provider tokens, private keys, or raw secrets into repo files
- widen into full app deployment, app upstream hosting, or unrelated infra systems
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the current host, proxy, signer, and runtime path is re-proved through a supported device-backed authenticated join
- the remaining post-cutover seam is explicit and grounded
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
