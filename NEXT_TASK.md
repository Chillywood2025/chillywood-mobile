# NEXT TASK

## Exact Next Task
The next exact task is a narrow **Supabase token env cutover** pass on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the safety / moderation workflow chapter as closed enough to move on unless a real regression is found.
3. Treat the Hetzner edge baseline and LiveKit ingress path as already real.
4. Treat the protected host config, running LiveKit service, and Caddy proxy handoff as already landed truth.
5. Use the available project-side Supabase secret access to point `supabase/functions/livekit-token` at the new LiveKit host truth.
6. Verify the required secret names are present for the project after the cutover.
7. Keep Firebase / RevenueCat / Expo/EAS external for now.
8. Stop immediately if the provider-side secret update cannot be completed honestly.

## Exact Next Batch
- start with `docs/hetzner-first-deployment-implementation-spec.md`
- read the protected host-only LiveKit keypair without printing it
- update the Supabase project secrets for `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`
- verify the secret names are now present for the project
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
- `supabase/functions/livekit-token` now points at the real LiveKit host truth through provider-side env
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
