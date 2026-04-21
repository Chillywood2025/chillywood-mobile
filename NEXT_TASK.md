# NEXT TASK

## Exact Next Task
The next exact task is a narrow **LiveKit ingress deployment prep** pass on `main`. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the safety / moderation workflow chapter as closed enough to move on unless a real regression is found.
3. Keep the active product-side chapter truth intact while advancing the current infra side-lane only.
4. Preserve the current Hetzner edge baseline as already real: host exists, deploy user works, firewall/fail2ban baseline exists, Caddy is installed, `live.chillywoodstream.com` resolves, HTTPS is live, and the current served surface is still an honest placeholder.
5. Treat Supabase / Firebase / RevenueCat / Expo/EAS as external owners that remain in place for now.
6. Prepare the host and repo for LiveKit ingress only as far as honest deployment prep supports; do not fake a LiveKit deployment or mobile cutover.
7. Stop immediately if the next slice would require fake infrastructure, fake service health, or route/product drift.

## Exact Next Batch
- start with `docs/hetzner-first-deployment-implementation-spec.md`
- audit the current LiveKit runtime/token assumptions plus current Hetzner host baseline
- land only the smallest honest LiveKit ingress deployment-prep scaffold that current repo and host truth support
- update repo-truth docs to point to the next infra lane after that prep slice
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the Hetzner / LiveKit ingress deployment-prep surface family
- preserve all current product route truth and all previously landed chapter ownership
- keep the current HTTPS placeholder honest until a real LiveKit or app upstream exists
- avoid reopening already-landed safety, design, discovery, analytics, or owner/admin implementation unless a real regression is found
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- buy providers or add OVH work
- start release hardening / Google Play readiness work in this lane
- move databases or Supabase auth off their current hosted owner
- fake a LiveKit deployment, fake service health, fake mobile cutover, or fake app upstream
- change current public/product route truth
- write provider tokens, private keys, or raw secrets into repo files
- widen into full app deployment or unrelated infra systems
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the LiveKit ingress prep doctrine is grounded in the current Hetzner edge and current app/runtime truth
- the host and repo have only the minimal honest LiveKit deployment-prep scaffold needed for the next slice
- the current HTTPS placeholder remains honest and no full production deployment is implied
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
