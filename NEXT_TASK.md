# NEXT TASK

## Exact Next Task
The next exact task is a narrow **deeper room/session access closeout audit** on `main`, using `_lib/accessEntitlements.ts`, `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, title/player route truth, or schema ownership unless a real regression is proved. The Party Room resolver adoption pass and the communication room/session cleanup pass are now landed, and the next pass should determine whether any meaningful room/session access-adoption seam still remains.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay brutally narrow and audit only the remaining deeper room/session owners next.
4. Inspect `app/watch-party/[partyId].tsx`, `hooks/use-communication-room-session.ts`, and `app/watch-party/live-stage/[partyId].tsx` only as needed to determine whether one more access-adoption batch is still justified.
5. Keep event access and any broader live/event scheduling work out of scope for this audit lane.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
7. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- audit the remaining deeper room/session family after the Party Room and communication-hook adoption passes
- determine whether `app/watch-party/live-stage/[partyId].tsx` still has any meaningful access-adoption seam
- determine whether the room/session adoption family is now complete enough to move on
- choose one exact next move only if it is clear and honest
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit only the remaining deeper room/session owners after the landed Party Room and communication-hook adoption work
- use `_lib/accessEntitlements.ts` as the canonical reference for what room/session access adoption means now
- keep the lane limited to `app/watch-party/[partyId].tsx`, `hooks/use-communication-room-session.ts`, and `app/watch-party/live-stage/[partyId].tsx` only as needed for the audit
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
- touch broader runtime room/live-stage behavior in this audit lane
- touch RBAC or Rachi control-plane work
- broaden into event access adoption before the room/session closeout is settled
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the remaining deeper room/session owners are audited honestly against `_lib/accessEntitlements.ts`
- the repo ends with exactly one clear next move:
  - one last narrow room/session access-adoption batch
  - or room/session access closeout
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
