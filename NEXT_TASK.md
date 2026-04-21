# NEXT TASK

## Exact Next Task
The next exact task is a narrow **mobile runtime cutover** pass on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the safety / moderation workflow chapter as closed enough to move on unless a real regression is found.
3. Treat the Hetzner edge baseline, running LiveKit service, and Supabase token signer secret state as already real.
4. Update the mobile runtime defaults to the new LiveKit host truth.
5. Keep the token endpoint path stable on Supabase while changing only the LiveKit server default.
6. Keep Firebase / RevenueCat / Expo/EAS external for now.
7. Stop immediately if the runtime cutover would imply readiness that current ingress proof does not support.

## Exact Next Batch
- start with `docs/hetzner-first-deployment-implementation-spec.md`
- update the deployed-default LiveKit runtime URL in `app.config.ts`
- preserve the current Supabase token endpoint default
- verify the repo now points at the real LiveKit host truth without inventing broader deployment claims
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
- the mobile/runtime default now points at `wss://live.chillywoodstream.com`
- the Supabase token endpoint remains stable
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
