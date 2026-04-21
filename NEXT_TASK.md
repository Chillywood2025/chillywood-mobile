# NEXT TASK

## Exact Next Task
The next exact task is a narrow **Caddy upstream wiring to LiveKit** pass on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the safety / moderation workflow chapter as closed enough to move on unless a real regression is found.
3. Treat the Hetzner edge baseline as already real, but no longer placeholder-final.
4. Treat the host-side Docker / Compose install, `/opt/chillywood/livekit` scaffold, protected host-only config, and first local LiveKit launch as already landed truth.
5. Wire Caddy from the placeholder response to the real local LiveKit upstream.
6. Open only the minimum firewall ports the LiveKit ingress path needs and verify HTTPS still works.
7. Keep Supabase / Firebase / RevenueCat / Expo/EAS external for now.
8. Stop immediately if the next slice would require fake public readiness, fake cutover, or broader deployment claims.

## Exact Next Batch
- start with `docs/hetzner-first-deployment-implementation-spec.md`
- wire the existing Caddy site for `live.chillywoodstream.com` to `127.0.0.1:7880`
- open only the minimum external LiveKit media ports that match the current host config
- verify HTTPS still works and now reaches the real LiveKit service instead of the placeholder
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
- the real local LiveKit service is now reachable through the existing HTTPS edge
- the placeholder response is retired without claiming a full production app deployment
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
