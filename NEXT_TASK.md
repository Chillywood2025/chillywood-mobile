# NEXT TASK

## Exact Next Task
The active broader watch-party/live seam is now the live-stage surface hierarchy chapter on `app/watch-party/live-stage/[partyId].tsx`. Repo truth is explicit: the entry owner, Party Room owner, and pre-stage Live Room layer are all closed cleanly enough to stay untouched, and the next safe batch should focus on the actual Live Stage surface so the media-first route reads less dense, less structurally mixed, and less memo-like without changing stage semantics.

## Current Plan
1. Treat the watch-party entry, Party Room setup-shell, and pre-stage Live Room hierarchy chapters as closed cleanly for now.
2. Preserve the landed shell cleanups on `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and the pre-stage layer in `app/watch-party/live-stage/[partyId].tsx`.
3. Keep `app/watch-party/live-stage/[partyId].tsx` as the active owner for the actual Live Stage hierarchy pass.
4. Make the actual stage surface cleaner by isolating and demoting overlay chrome instead of rewriting route truth.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- isolate the live-stage top overlay/menu plus utility-sheet cluster into route-local render boundaries so the actual stage surface stops mixing too much control chrome inline around the media area
- demote duplicate handoff chrome where the utility layer repeats a Live Room action already owned by the top chrome
- tighten memo-like stage-control copy without changing room sync, moderation truth, participant state, or actual stage semantics
- keep the lower-dock comment/reaction cluster and hybrid community grid later unless the first batch lands cleanly enough to justify another pass
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx` as the canonical watch-party entry owner and keep it closed in this pass
- preserve `app/watch-party/live-stage/[partyId].tsx` as the active Live Room / Live Stage owner for this broader stage-surface pass
- preserve `app/watch-party/[partyId].tsx` as the already-closed Party Room owner
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- keep the landed entry, Party Room, and pre-stage Live Room cleanups intact and do not reopen them casually
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
- `app/watch-party/live-stage/[partyId].tsx` becomes materially cleaner without changing actual stage semantics
- the actual Live Stage surface reads more media-first and less crowded by overlay chrome
- duplicate Live Room handoff and memo-like stage-control framing are reduced
- watch-party entry, Party Room, and pre-stage Live Room cleanups stay intact
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
