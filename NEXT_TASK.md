# NEXT TASK

## Exact Next Task
The next exact task is a narrow `/channel-settings` audience-visibility surface pass on `main`, using `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not widen into `/profile/[userId]`, route proliferation, fake audience controls, fake analytics, watch-party/live route changes, RBAC expansion, Rachi control-plane work, or unrelated screen/helpers. The backing truth now exists for `publicActivityVisibility`, `followerSurfaceEnabled`, and `subscriberSurfaceEnabled`; the next step is to surface those values honestly on `/channel-settings` without inventing broader audience systems.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the lane focused on the `/channel-settings` audience-visibility surface only.
3. Use the landed `readChannelAudienceSummary(channelUserId)` truth for:
   - `publicActivityVisibility`
   - `followerSurfaceEnabled`
   - `subscriberSurfaceEnabled`
4. Render unsupported audience-role fields and any deeper audience workflow as explicitly later/unavailable instead of inventing controls.
5. Do not reopen the landed analytics or safety/admin summary surfaces unless a tiny directly-related fix is required.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.

## Exact Next Batch
- land the narrow `/channel-settings` surface wiring for:
  - `publicActivityVisibility`
  - `followerSurfaceEnabled`
  - `subscriberSurfaceEnabled`
- keep audience visibility honest instead of inventing extra audience systems or fake control states
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- render the real visibility truth already backed by schema + helper reads
- keep the already-landed audience/analytics/safety summary surface intact
- avoid reopening creator-analytics or audience-relationship foundations
- leave profile visits, content performance, monetization conversion, and any unsupported creator aggregates explicitly unavailable until real truth exists
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- widen into Stage 5 UI redesign or profile-route work unless a tiny directly-related hook is absolutely required
- fake audience counts, audience visibility controls, or creator analytics
- widen or redesign the new audience visibility or audience relationship schema unless a real proof gap is found
- treat `user_subscriptions` as creator/channel subscriber truth
- create `/studio*` routes
- touch runtime room/live-stage owners
- touch RBAC or Rachi control-plane work
- broaden into unrelated admin expansion
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/channel-settings` renders the real audience-visibility truth from `readChannelAudienceSummary(channelUserId)`
- unsupported audience-role and deeper audience workflow surfaces stay explicitly unavailable/later instead of being fabricated
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake analytics or audience metrics are introduced
