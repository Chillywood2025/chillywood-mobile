# NEXT TASK

## Exact Next Task
The next exact task is the Stage 5 prerequisite backend/schema foundation pass for channel audience relationships on `main`, using `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not widen into Stage 5 UI, route proliferation, remote DB mutation outside the proven schema lane, watch-party/live route changes, RBAC, Rachi control-plane expansion, or unrelated screen/helpers. Full Stage 5 UI is now explicitly blocked because the repo still lacks canonical backend/schema truth for channel followers, creator/channel subscribers, pending audience requests, and blocked audience; creator-facing analytics aggregates remain partially blocked after that and must stay honest until real data exists.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the lane focused on backend/schema/read-model truth, not Stage 5 UI.
3. Establish the minimum canonical audience relationship foundation for:
   - followers
   - creator/channel subscribers
   - pending audience requests
   - blocked audience
4. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
5. Keep analytics honest: room/session counts may derive later from existing room tables, but profile visits/follows/subscriber/content aggregates must not be faked.
6. Keep live schema changes narrow and justified only if this audience-foundation lane proves they are required.

## Exact Next Batch
- implement the narrow audience-relationship blocker-resolution foundation from `docs/profile-channel-implementation-spec.md`
- prove whether the minimum honest slice is schema only or schema plus helper readers
- keep Stage 5 UI out of scope
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- establish canonical backend/schema truth for channel audience relationships
- optionally add helper-level audience readers only if the schema slice is safely complete in the same lane
- leave creator analytics UI and summary surfaces blocked until real truth exists
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- implement Stage 5 UI
- fake audience counts or creator analytics
- treat `user_subscriptions` as creator/channel subscriber truth
- create `/studio*` routes
- touch runtime room/live-stage owners
- touch RBAC or Rachi control-plane work
- broaden into unrelated admin expansion
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the repo has canonical backend/schema truth for channel followers, creator/channel subscribers, pending audience requests, and blocked audience
- any helper readers added remain honest and owner-scoped
- Stage 5 UI remains blocked until unsupported aggregates are resolved
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake analytics or audience metrics are introduced
