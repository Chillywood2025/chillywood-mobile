# NEXT TASK

## Exact Next Task
The next exact task is a narrow **LiveKit host config + launch prep** pass on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the safety / moderation workflow chapter as closed enough to move on unless a real regression is found.
3. Treat the Hetzner edge baseline as already real and leave its placeholder honesty intact.
4. Treat the host-side Docker / Compose install plus `/opt/chillywood/livekit` directory scaffold as already landed prep.
5. Use real host-side secrets outside git to create the first LiveKit config on-host, sync the scaffold into place, and verify first service startup locally before touching Caddy upstream wiring or mobile runtime values.
6. Keep Supabase / Firebase / RevenueCat / Expo/EAS external for now.
7. Stop immediately if the next slice would require fake service health, fake cutover, or broader deployment claims.

## Exact Next Batch
- start with `docs/hetzner-first-deployment-implementation-spec.md`
- create the real on-host LiveKit config and env load path outside git
- sync the bounded compose scaffold onto `/opt/chillywood/livekit`
- start and verify the LiveKit service locally on the host without claiming public cutover yet
- only after that, decide whether Caddy upstream wiring is honestly ready
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the Hetzner / LiveKit host-config and launch-prep surface family
- preserve all current product route truth and all previously landed chapter ownership
- keep the current HTTPS placeholder honest until a real LiveKit or app upstream exists
- avoid reopening already-landed safety, design, discovery, analytics, or owner/admin implementation unless a real regression is found
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- buy providers or add OVH work
- start release hardening / Google Play readiness work in this lane
- move databases or Supabase auth off their current hosted owner
- fake service health, fake mobile cutover, or fake app upstream
- change current public/product route truth
- write provider tokens, private keys, or raw secrets into repo files
- widen into full app deployment or unrelated infra systems
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the current LiveKit ingress scaffold is turned into a real on-host config + service bootstrap path
- first local host-level LiveKit service verification is real before any proxy or mobile cutover claim
- the current HTTPS placeholder remains honest and no full production deployment is implied
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
