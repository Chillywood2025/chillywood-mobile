# NEXT TASK

## Exact Next Task
The next exact task is a narrow **access/entitlement doctrine-spec pass** on `main`, using `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, watch-party/live route truth, or the landed profile/channel and content-management chapters unless a real regression is proved. The creator/content-management chapter has now reached a clean enough checkpoint under current doctrine: Home and `/profile/[userId]` consume real programming truth, `app/admin.tsx` now guards hero/top-picks save-time programming validity, Content Studio publication state now normalizes `status`, `is_published`, and `release_at` before persistence, the studio shows the resolved current Home hero/top-picks snapshot, manual hero targeting is searchable over the real title dataset, the editor previews resolved scheduling truth before save, and the studio now shows the next real scheduled titles at a glance. The next pass should create `docs/access-entitlement-implementation-spec.md` as the durable implementation doctrine for the shared access rules layer.

## Current Plan
1. Re-read `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay in doctrine/spec territory first; do not jump straight to UI or schema changes.
4. Create `docs/access-entitlement-implementation-spec.md` as the single durable access-rules doctrine for channel, content, room, and event gating.
5. Define current truth, missing truth, later truth, and the next exact implementation lane for the shared resolver layer.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.

## Exact Next Batch
- create one durable access/entitlement implementation spec doc
- define shared access modes, gating labels, preview visibility, and current-vs-missing truth across channel/content/room/event surfaces
- choose the exact first implementation lane for `_lib/accessEntitlements.ts` only after the doctrine/spec pass is decision-complete
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- create `docs/access-entitlement-implementation-spec.md`
- audit the current access truth across creator permissions, subscriptions, RevenueCat snapshot logic, `content_access_rule`, room access rules, channel defaults, audience relationship tables, and current access labels
- keep this pass doctrine/spec-only unless the spec itself proves a smaller prerequisite is missing
- avoid reopening landed public consumer work, source-of-truth hardening, or broader Content Studio redesign
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel or content-management chapters because of preference churn
- widen into Home again, profile again, admin workflow tuning again, live/event scheduling implementation, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch schema or backend ownership before the doctrine/spec pass proves it is needed
- touch runtime room/live-stage owners
- touch RBAC or Rachi control-plane work
- broaden into unrelated resolver/UI work before the shared access doctrine is settled
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `docs/access-entitlement-implementation-spec.md` exists and is decision-complete enough to hand implementation to another engineer or agent
- the spec clearly separates current truth, missing truth, later truth, and the first exact resolver implementation lane
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
