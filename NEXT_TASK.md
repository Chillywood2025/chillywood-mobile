# NEXT TASK

## Exact Next Task
The next exact task is a narrow `/channel-settings` Stage 5 summary-surface pass on `main`, using `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not widen into `/profile/[userId]`, route proliferation, fake audience controls, fake analytics, watch-party/live route changes, RBAC expansion, Rachi control-plane work, or unrelated screen/helpers. The audience relationship schema foundation plus the audience/safety/admin/creator-analytics read models are now landed, so the next honest step is to render the owner-safe Stage 5 summary surfaces on `/channel-settings` while keeping unsupported fields explicitly unavailable.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the lane focused on `/channel-settings` only.
3. Use the landed helper summaries:
   - `readChannelAudienceSummary(channelUserId)`
   - `readChannelSafetyAdminSummary(channelUserId)`
   - `readCreatorAnalyticsSummary(channelUserId)`
4. Render only the truthful Stage 5 owner-summary layer now.
5. Keep unsupported audience-visibility fields and unsupported creator-analytics aggregates explicitly unavailable instead of inventing controls or metrics.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.

## Exact Next Batch
- implement the owner-safe Stage 5 audience, analytics, and safety/admin summary surfaces on `app/channel-settings.tsx`
- use landed read-model helpers only
- keep unsupported audience-visibility controls and unsupported creator-analytics fields visibly unavailable instead of fabricating them
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- land the `/channel-settings` owner summary layer for:
  - audience summary
  - analytics summary
  - safety/admin summary
- source those summaries from the landed read-model helpers
- leave audience-visibility controls, profile visits, content performance, monetization conversion, and any unsupported creator aggregates explicitly unavailable until real truth exists
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- widen beyond `app/channel-settings.tsx` unless a tiny directly-related hook is absolutely required
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
- `/channel-settings` shows owner-safe audience, analytics, and safety/admin summary surfaces from real helper truth
- unsupported audience visibility and creator analytics fields stay explicitly unavailable instead of fabricated
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake analytics or audience metrics are introduced
