# NEXT TASK

## Exact Next Task
The next exact task is a narrow **access/entitlement shared resolver foundation pass** on `main`, using `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, watch-party/live route truth, or the landed profile/channel and content-management chapters unless a real regression is proved. The access/entitlement doctrine-spec pass is now landed: the repo has a durable implementation spec for the shared access rules layer, the canonical access vocabulary is locked, and current-vs-missing truth is now explicit across channel, content, room, and later event access. The next pass should create `_lib/accessEntitlements.ts` as the shared current-truth resolver foundation without adopting it into UI owners yet.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay in shared-helper territory first; do not jump straight to UI or schema changes.
4. Create `_lib/accessEntitlements.ts` as the single shared current-truth access resolver owner.
5. Implement canonical access types plus current-truth `resolveChannelAccess(...)`, `resolveContentAccess(...)`, `resolveRoomAccess(...)`, `getAccessLabel(...)`, and `canPreviewLockedSurface(...)`.
6. Keep `resolveEventAccess(...)` contract-only or explicitly later until the live/event scheduling chapter creates real event truth.
7. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.

## Exact Next Batch
- create `_lib/accessEntitlements.ts`
- define canonical access types and current-truth resolver outputs for channel, content, and room/session access
- centralize shared access labels and preview policy helpers without adopting them into screens yet
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep event access contract-only until the live/event chapter creates canonical event truth
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- create `_lib/accessEntitlements.ts`
- centralize current access truth from creator permissions, subscriptions, RevenueCat snapshot logic, `content_access_rule`, room access rules, channel defaults, audience visibility, and current access labels
- stay helper-only and avoid reopening landed public consumer work, source-of-truth hardening, or broader Content Studio redesign
- leave all UI adoption for later passes once the helper contract is proved
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel or content-management chapters because of preference churn
- widen into Home again, profile again, channel-settings again, admin workflow tuning again, live/event scheduling implementation, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch schema or backend ownership in this helper-foundation lane
- touch runtime room/live-stage owners in this lane
- touch RBAC or Rachi control-plane work
- broaden into UI adoption before the shared access helper is settled
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `_lib/accessEntitlements.ts` exists and is decision-complete enough to hand UI adoption to another engineer or agent
- current-truth access resolution for channel, content, and room/session access is centralized there
- shared access labels and preview-policy helpers no longer require each surface to invent them locally
- event access remains explicitly later or contract-only instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
