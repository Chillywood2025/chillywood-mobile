# NEXT TASK

## Exact Next Task
The next exact task is a narrow **realtime cutover verification** pass on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the current Hetzner edge, running LiveKit service, Supabase token signer env, and mobile runtime default as already aligned baseline truth.
3. Verify real end-to-end realtime behavior against `wss://live.chillywoodstream.com` instead of only checking isolated host pieces.
4. Confirm the current signer/runtime path is issuing and consuming tokens against the new host truth without reopening unrelated product chapters.
5. Decide whether the remaining realtime seam is now closed or whether one final narrow verification/correction batch is still needed.
6. Keep Firebase / RevenueCat / Expo/EAS external for now.
7. Stop immediately if any claimed part of the current realtime path cannot be re-proved.

## Exact Next Batch
- start from the aligned LiveKit host, signer, and runtime truth already recorded in `CURRENT_STATE.md`
- verify real token issuance and real client/realtime behavior against `live.chillywoodstream.com`
- confirm the current Caddy-to-LiveKit ingress path still behaves correctly under actual realtime usage, not just static `curl` checks
- decide whether one final narrow realtime correction batch is still justified
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
- the current host, proxy, signer, and runtime path is re-proved through real realtime behavior
- the remaining post-cutover seam is explicit and grounded
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
