# NEXT TASK

## Exact Next Task
The next exact task is a narrow **access chapter closeout audit / next-chapter selection pass** on `main`, using `_lib/accessEntitlements.ts`, `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, title/player route truth, or schema ownership unless a real regression is proved. The current access-adoption family is now complete enough for current truth: channel, content, room entry, Party Room, and the communication room/session hook all consume the shared resolver where the current doctrine proved they should, and event access remains explicitly later until a live/event model exists.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay brutally narrow and treat the current access-adoption family as closed enough unless a real regression is proved.
4. Audit the chapter state against `docs/access-entitlement-implementation-spec.md`, `CURRENT_STATE.md`, and this file to determine whether the access chapter itself should close for now or hand off to the next major chapter.
5. Keep event access implementation and any broader live/event scheduling work out of scope for this closeout lane.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
7. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- audit whether the access chapter is now complete enough for current truth
- confirm that event access remains later until the live/event scheduling model exists
- choose the single next major lane only if control-file truth supports it clearly
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit the current access/entitlement chapter state against the landed resolver foundation plus completed adoptions
- use `_lib/accessEntitlements.ts` and `docs/access-entitlement-implementation-spec.md` as the canonical references for what is complete now versus later
- keep the lane doctrine-first and avoid reopening already-landed screen-owner adoptions unless a real regression is found
- avoid reopening landed public consumer work, source-of-truth hardening, or broader Content Studio redesign
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel or content-management chapters because of preference churn
- widen into Home again, profile again, channel-settings again, admin workflow tuning again, live/event scheduling implementation, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch schema or backend ownership in this adoption lane
- touch broader runtime room/live-stage behavior in this closeout lane
- touch RBAC or Rachi control-plane work
- broaden into event access adoption before the live/event chapter creates canonical event truth
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the access chapter is audited honestly against current repo truth
- the repo ends with exactly one clear next move:
  - access chapter closeout for now
  - or the next major chapter selection grounded in current doctrine
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
