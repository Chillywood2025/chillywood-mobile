# NEXT TASK

## Exact Next Task
The next exact task is a narrow helper read-model pass for channel audience summary and channel safety/admin summary on `main`, using `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not widen into Stage 5 UI, route proliferation, creator-analytics fabrication, watch-party/live route changes, RBAC expansion, Rachi control-plane work, or unrelated screen/helpers. The audience relationship schema foundation is now landed, so the next honest slice is to expose owner-safe helper readers for the audience and safety summaries while creator-facing analytics aggregates remain explicitly blocked until real backend truth exists.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the lane focused on helper read-model truth, not Stage 5 UI.
3. Land honest owner-safe readers for:
   - `ChannelAudienceReadModel`
   - `ChannelSafetyAdminReadModel`
4. Reuse the landed audience relationship schema and existing moderation truth without widening the schema again unless a proof gap is found.
5. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
6. Keep creator analytics honest: room/session counts may derive later, but profile visits/follows/subscriber/content aggregates must not be faked.

## Exact Next Batch
- implement the narrow helper read-model layer implied by the landed audience relationship foundation
- add owner-safe readers such as `readChannelAudienceSummary(channelUserId)` and `readChannelSafetyAdminSummary(channelUserId)` only if they remain honest from current schema truth
- keep Stage 5 UI out of scope
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- expose helper-level audience summary truth from:
  - `channel_followers`
  - `channel_subscribers`
  - `channel_audience_requests`
  - `channel_audience_blocks`
- expose helper-level safety/admin summary truth from existing moderation helpers/tables
- leave creator analytics UI and summary surfaces blocked until real truth exists
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- implement Stage 5 UI
- fake audience counts or creator analytics
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
- the repo has honest helper readers for channel audience summary and channel safety/admin summary
- the new audience relationship schema is used without faking counts or widening doctrine
- any helper readers added remain honest and owner-scoped
- Stage 5 UI remains blocked until unsupported aggregates are resolved
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake analytics or audience metrics are introduced
