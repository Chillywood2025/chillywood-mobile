# NEXT TASK

## Exact Next Task
The pre-stage Live Room hierarchy chapter is still active, but its first safe batch is now landed cleanly. Repo truth is explicit: `app/watch-party/live-stage/[partyId].tsx` now groups and demotes its lower-value support chrome while keeping behavior intact. The exact next step is the chapter closeout audit, with a second batch allowed only if one final narrow pre-stage adjustment is still clearly justified.

## Current Plan
1. Treat the watch-party entry / waiting-room chapter and Party Room setup-shell chapter as closed cleanly for now.
2. Preserve the landed pre-stage Live Room regrouping on `app/watch-party/live-stage/[partyId].tsx`.
3. Keep the route-owned overview and viewing-default controls prominent.
4. Run the chapter closeout audit before considering any second batch.
5. Only reopen the same owner for one more narrow pass if the closeout audit proves a real remaining seam that is still safe.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not auto-open a second batch now that the first pre-stage regrouping is landed
- audit whether the chapter can stop cleanly with `app/watch-party/live-stage/[partyId].tsx` improved and behavior intact
- only if clearly justified, use one final narrow pass for pre-stage hierarchy or copy alignment without touching room sync or stage semantics
- otherwise close the chapter and record the exact later live-room seam
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx` as the canonical watch-party entry owner and keep it closed in this pass
- preserve `app/watch-party/live-stage/[partyId].tsx` as the active Live Room / Live Stage owner for the closeout decision
- preserve `app/watch-party/[partyId].tsx` as the already-closed Party Room owner
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- keep the landed entry and Party Room cleanups intact and do not reopen them casually
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the player, monetization, proof / QA, Party Room, and admin chapters closed unless a future broader audit proves a real structural reason to reopen one
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - change room sync or Live Stage semantics
 - reopen watch-party entry, Party Room, or admin / owner / Rachi in this pass
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/watch-party/live-stage/[partyId].tsx` stays materially cleaner without changing invite/share, room-default, or stage-entry behavior
- the pre-stage Live Room now stops feeling like four equally loud setup memos before stage entry
- the overview and viewing-default controls stay prominent while support chrome is easier to scan past
- watch-party entry, Party Room, and admin / owner / Rachi stay closed cleanly in this pass
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
