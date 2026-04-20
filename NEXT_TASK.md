# NEXT TASK

## Exact Next Task
The next exact task is a narrow **deeper room/session resolver adoption audit** on `main`, using `_lib/accessEntitlements.ts`, `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, title/player route truth, or schema ownership unless a real regression is proved. The room-entry resolver adoption pass is now landed: `app/watch-party/index.tsx` and `app/communication/index.tsx` consume shared room-entry gating truth from `_lib/accessEntitlements.ts`, and the next pass should inspect only the remaining room/session owners to determine the smallest honest follow-up batch.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay brutally narrow and audit only the remaining deeper room/session owners next.
4. Inspect current room/session gating in `app/watch-party/[partyId].tsx`, `hooks/use-communication-room-session.ts`, and `app/watch-party/live-stage/[partyId].tsx` only as needed to determine whether one more resolver-adoption batch is required.
5. Keep event access and any broader live/event scheduling work out of scope for this audit lane.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
7. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- audit the remaining deeper room/session owners after the entry-owner adoption pass
- determine whether `app/watch-party/[partyId].tsx` still needs resolver-backed room gating adoption
- determine whether communication-room gating should adopt via `hooks/use-communication-room-session.ts`
- determine whether `app/watch-party/live-stage/[partyId].tsx` has any real room/session access seam left or should stay untouched
- choose one exact next implementation batch only if it is clear and honest
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit only the remaining room/session owners that still appear to derive gating locally or through room-session hooks
- use `_lib/accessEntitlements.ts` as the canonical reference for what room adoption would mean next
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
  - one last narrow room/session resolver adoption batch
  - or access/entitlement room adoption closeout
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
