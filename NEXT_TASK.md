# NEXT TASK

## Exact Next Task
There is no immediate narrow follow-up on the combined watch-party entry / waiting-room chapter now. Repo truth is explicit: `app/watch-party/index.tsx` now reads more action-first, the Live Room pre-stage shell remains structurally isolated, and the Party Room setup shell remains closed. Any next watch-party/live work should be an intentional medium pre-stage Live Room hierarchy audit on `app/watch-party/live-stage/[partyId].tsx` instead of another leftover entry-shell cleanup pass.

## Current Plan
1. Treat the combined watch-party entry / waiting-room chapter as closed cleanly for now.
2. Preserve the landed entry-owner waiting-room support-shell cleanup on `app/watch-party/index.tsx`.
3. Preserve the already-isolated Live Room pre-stage shell on `app/watch-party/live-stage/[partyId].tsx`.
4. Preserve the already-closed Party Room setup shell on `app/watch-party/[partyId].tsx`.
5. Treat any further watch-party/live work as a later medium route-owned reopen on the Live Room pre-stage owner rather than another entry cleanup loop.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not auto-open another watch-party entry cleanup pass now that the chapter is closed
- preserve the landed entry-owner cleanup without widening it into route-truth or room-sync changes
- keep the Live Room pre-stage owner as the next later seam if a future broader audit intentionally reopens watch-party/live work
- treat the exact later seam as a medium `app/watch-party/live-stage/[partyId].tsx` hierarchy audit rather than another leftover entry shell pass
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx` as the canonical watch-party entry owner now that its current cleanup is landed
- preserve `app/watch-party/live-stage/[partyId].tsx` as the later pre-stage owner if the broader watch-party/live chapter reopens
- preserve `app/watch-party/[partyId].tsx` as the already-closed Party Room owner
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- keep the landed entry route cleanup intact and do not reopen it casually
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the player, monetization, proof / QA, Party Room, and admin chapters closed unless a future broader audit proves a real structural reason to reopen one
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - change room sync or Live Stage semantics
 - reopen Party Room or admin / owner / Rachi in this pass
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/watch-party/index.tsx` stays materially cleaner without changing create/join/invite/access behavior
- the entry route stays action-first instead of reopening duplicated setup guidance
- `app/watch-party/live-stage/[partyId].tsx` stays structurally isolated until a future medium audit intentionally reopens it
- Party Room and admin / owner / Rachi stay closed cleanly in this pass
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
