# NEXT TASK

## Exact Next Task
The next exact task is a narrow **app upstream doctrine / readiness pass** on `main`. The just-closed two-device Hetzner LiveKit proof lane is now governing truth: the canonical Party Room deep link, the signer/runtime alignment, and the authenticated `watch-party-live` join path are all proved against `wss://live.chillywoodstream.com`. [docs/database-move-doctrine-audit.md](/Users/loverslane/chillywood-mobile/docs/database-move-doctrine-audit.md) still governs that any database/auth move remains deferred and out of scope. Use `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `docs/database-move-doctrine-audit.md`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `infra/hetzner/host.env.example`, `infra/hetzner/cutover.env.example`, `infra/hetzner/livekit.env.example`, `infra/hetzner/docker-compose.livekit.yml`, `app.config.ts`, `_lib/runtimeConfig.ts`, `supabase/functions/livekit-token/index.ts`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat `APP_UPSTREAM_READY = NO` as unchanged unless a separate later app-upstream spec intentionally changes it.
3. Treat authenticated token issuance, the canonical Party Room deep-link path, and the two-real-device `watch-party-live` join proof as already landed for room `XQBBRE`.
4. Keep Firebase / RevenueCat / Expo/EAS external for now.
5. Keep database-move or auth-cutover work deferred unless a separate later chapter explicitly reopens them.
6. Decide whether any non-realtime Hetzner app upstream is actually warranted by current repo truth.
7. If not, keep app-upstream hosting deferred rather than inventing a deployable surface.
8. If yes later, define doctrine first before any deployment prep opens.

## Exact Next Batch
- start from the now-proved LiveKit host, signer, runtime, deep-link, and two-device join truth already recorded in `CURRENT_STATE.md`
- keep app-upstream deployment explicitly out of scope unless a later doctrine pass defines a real deployable upstream
- treat the current Hetzner realtime cutover lane as complete enough to move on
- decide whether any Hetzner app-upstream surface exists in current repo truth or remains `NO`
- if it remains `NO`, keep broader app hosting deferred and do not invent a deployment lane
- if a bounded upstream is warranted later, define only the smallest honest doctrine/readiness slice first
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the Hetzner app-upstream doctrine/readiness surface family
- preserve all current product route truth and all previously landed chapter ownership
- keep the current no-app-upstream truth explicit even though LiveKit ingress is now real
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
- the current no-app-upstream truth is either reaffirmed or intentionally updated through doctrine, not guessed
- the remaining post-realtime seam is explicit and grounded
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
