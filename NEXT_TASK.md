# NEXT TASK

## Exact Next Task
The next exact task is a narrow audience-visibility truth pass on `main`, using `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not widen into `/profile/[userId]`, route proliferation, fake audience controls, fake analytics, watch-party/live route changes, RBAC expansion, Rachi control-plane work, or unrelated screen/helpers. The Stage 5 `/channel-settings` summary surface is now landed, but full audience visibility controls are still blocked because `publicActivityVisibility`, `followerSurfaceEnabled`, and `subscriberSurfaceEnabled` still have no real schema/read-model truth.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the lane focused on audience visibility truth only.
3. Prove whether `publicActivityVisibility`, `followerSurfaceEnabled`, and `subscriberSurfaceEnabled` can be derived honestly from current schema.
4. If not derivable, define the minimum honest schema/read-model foundation needed for those fields.
5. Do not reopen the landed Stage 5 summary surface unless a tiny directly-related fix is required.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.

## Exact Next Batch
- audit and, if safe, land the minimum truth foundation for:
  - `publicActivityVisibility`
  - `followerSurfaceEnabled`
  - `subscriberSurfaceEnabled`
- keep audience visibility honest instead of inventing toggles or default states
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- prove the exact backing truth for audience visibility controls
- either land a narrow helper/schema foundation for those visibility fields or stop with the exact blocker
- leave the already-landed audience/analytics/safety summary surface intact
- leave profile visits, content performance, monetization conversion, and any unsupported creator aggregates explicitly unavailable until real truth exists
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- widen into Stage 5 UI redesign or profile-route work unless a tiny directly-related hook is absolutely required
- fake audience counts, audience visibility controls, or creator analytics
- widen or redesign the new audience relationship schema unless a real proof gap is found
- treat `user_subscriptions` as creator/channel subscriber truth
- create `/studio*` routes
- touch runtime room/live-stage owners
- touch RBAC or Rachi control-plane work
- broaden into unrelated admin expansion
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the repo proves the exact truth status of channel audience visibility controls
- any landed visibility foundation stays narrow and does not fabricate toggles or default states
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake analytics or audience metrics are introduced
