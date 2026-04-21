# NEXT TASK

## Exact Next Task
The next exact task is a narrow **authenticated realtime session verification** pass on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat `APP_UPSTREAM_READY = NO` as the current doctrine/readiness decision unless a separate later app-upstream spec intentionally changes it.
3. Treat the current Hetzner edge, running LiveKit service, Supabase token signer env names, and mobile runtime default as already aligned baseline truth.
4. Re-prove authenticated token issuance and at least one real signed-in client/session behavior against `wss://live.chillywoodstream.com` instead of relying only on host/process checks.
5. If that proof fails, isolate whether the blocker is auth/session access, token issuance, runtime configuration, or client connection behavior.
6. Keep Firebase / RevenueCat / Expo/EAS external for now.
7. Stop immediately if the authenticated realtime proof cannot be completed honestly.

## Exact Next Batch
- start from the aligned LiveKit host, signer, and runtime truth already recorded in `CURRENT_STATE.md`
- keep app-upstream hosting explicitly out of scope unless a later doctrine pass defines a real deployable upstream
- verify authenticated token issuance and real signed-in client/realtime behavior against `live.chillywoodstream.com`
- confirm the current Caddy-to-LiveKit ingress path behaves correctly under actual realtime usage, not just static `curl` checks
- decide whether one final narrow realtime correction batch is still justified after that authenticated proof
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
- the current host, proxy, signer, and runtime path is re-proved through authenticated realtime behavior
- the remaining post-cutover seam is explicit and grounded
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
