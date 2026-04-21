# NEXT TASK

## Exact Next Task
The next exact task is a narrow **final verification + closeout audit** on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the safety / moderation workflow chapter as closed enough to move on unless a real regression is found.
3. Treat the Hetzner edge baseline, running LiveKit service, Supabase token signer env, and mobile runtime default as already aligned truth.
4. Run one final verification sweep across host, proxy, signer secret presence, and repo runtime config.
5. Decide whether the current LiveKit ingress lane is complete enough to move on.
6. Keep Firebase / RevenueCat / Expo/EAS external for now.
7. Stop immediately if any claimed part of that aligned realtime path cannot be re-proved.

## Exact Next Batch
- start with `docs/hetzner-first-deployment-implementation-spec.md`
- verify the running host service, Caddy proxy path, HTTPS surface, Supabase secret presence, and repo runtime default
- decide whether one final trivial/narrow infra batch is still justified
- if not, close the LiveKit ingress lane and hand off to the next grounded infra lane
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
- the current host, proxy, signer, and runtime path is all re-proved together
- the next infra lane after this cutover is explicit and grounded
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
