# NEXT TASK

## Exact Next Task
The active broader watch-party/live seam is now the pre-stage Live Room hierarchy chapter. Repo truth is explicit: the watch-party entry owner and Party Room owner are both closed cleanly enough to stay untouched, and the next safe batch should focus on `app/watch-party/live-stage/[partyId].tsx` so the pre-stage Live Room reads less memo-like, less visually loud, and more hierarchy-first without changing actual stage semantics.

## Current Plan
1. Treat the watch-party entry / waiting-room chapter and Party Room setup-shell chapter as closed cleanly for now.
2. Preserve the landed entry-owner cleanup on `app/watch-party/index.tsx`.
3. Preserve the landed Party Room shell isolation on `app/watch-party/[partyId].tsx`.
4. Keep `app/watch-party/live-stage/[partyId].tsx` as the active owner for this hierarchy pass.
5. Make the pre-stage Live Room feel more action-first by regrouping and demoting support chrome instead of changing route truth.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- isolate the lower-value pre-stage support chrome inside `app/watch-party/live-stage/[partyId].tsx` so invite/share and room-default setup no longer compete equally with the core pre-stage overview
- keep the pre-stage overview and viewing-default controls prominent because they still belong before stage entry
- tighten repeated host/viewer setup copy so the route stops restating the same `before stage` truth across multiple cards
- keep room sync, invite/share behavior, moderation truth, host/viewer powers, and actual stage semantics unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx` as the canonical watch-party entry owner and keep it closed in this pass
- preserve `app/watch-party/live-stage/[partyId].tsx` as the active Live Room / Live Stage owner for this hierarchy cleanup
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
- `app/watch-party/live-stage/[partyId].tsx` becomes materially cleaner without changing invite/share, room-default, or stage-entry behavior
- the pre-stage Live Room stops feeling like four equally loud setup memos before stage entry
- the overview and viewing-default controls stay prominent while support chrome becomes easier to scan past
- watch-party entry, Party Room, and admin / owner / Rachi stay closed cleanly in this pass
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
