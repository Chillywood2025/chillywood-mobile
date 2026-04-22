# NEXT TASK

## Exact Next Task
The next broader route-owned chapter is now the public profile broader structure chapter on `app/profile/[userId].tsx`. Repo truth is explicit: the watch-party/live owners are closed cleanly enough for now, and `/admin` does not win first because its recent bounded product cleanup already landed while its remaining regrouping is internal and less urgent. The next pass should start by auditing how the public profile route balances public channel read, live/event posture, community follow-up, access truth, and self-view owner mode inside one canonical owner.

## Current Plan
1. Treat the watch-party entry shell, Party Room setup shell, pre-stage Live Room hierarchy, and actual live-stage surface hierarchy chapters as closed cleanly for now.
2. Preserve the landed watch-party/live cleanups on `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and `app/watch-party/live-stage/[partyId].tsx`.
3. Keep the remaining live-stage lower-dock/community density later unless a future broader audit intentionally reopens that owner.
4. Use the next pass to audit `app/profile/[userId].tsx` as the chosen broader route-owned chapter.
5. Keep `/admin` closed for now unless a future broader audit proves its deeper regrouping has become more urgent.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not auto-open another leftover watch-party/live cleanup batch now that the live-stage chapter is closed
- audit `app/profile/[userId].tsx` for the remaining public/private/owner structure seam
- determine what should stay public-first, what should stay owner-only, and what should be demoted or regrouped instead of patched piecemeal
- keep `/admin` and other recently closed owners untouched unless the new audit proves a stronger need later
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and `app/watch-party/live-stage/[partyId].tsx` as closed watch-party/live owners unless a future broader audit intentionally reopens one
- treat `app/profile/[userId].tsx` as the active broader route-owned chapter
- keep `/admin` closed for now after its recent bounded product cleanup
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - reopen a closed chapter casually before the broader audit selects it
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the closed watch-party/live chapters stay intact and are not reopened casually
- `app/profile/[userId].tsx` is explicitly recorded as the next broader route-owned chapter
- `/admin` remains correctly deferred as later rather than being reopened by inertia
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
