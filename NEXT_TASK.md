# NEXT TASK

## Exact Next Task
The active broader watch-party/live seam is still the live-stage surface hierarchy chapter on `app/watch-party/live-stage/[partyId].tsx`, but the first safe batch is now already landed. Repo truth is explicit: the entry owner, Party Room owner, and pre-stage Live Room layer remain closed cleanly, while the actual Live Stage surface now has its top chrome/menu and utility-sheet cluster behind local render boundaries. The next step is no longer another automatic extraction batch; it is the live-stage chapter closeout audit to decide whether the remaining seam is still broad enough to stop cleanly and hand off the next intentional route-owned chapter.

## Current Plan
1. Treat the watch-party entry, Party Room setup-shell, and pre-stage Live Room hierarchy chapters as closed cleanly for now.
2. Preserve the landed shell cleanups on `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and the pre-stage layer in `app/watch-party/live-stage/[partyId].tsx`.
3. Preserve the new live-stage top chrome/menu and utility-sheet extraction on `app/watch-party/live-stage/[partyId].tsx`.
4. Use the next step to decide whether the remaining live-stage density is broader and later rather than forcing another narrow pass.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not auto-open another live-stage implementation batch until the closeout audit proves it is still honestly narrow and safe
- keep the new live-stage top chrome/menu plus utility-sheet render boundaries as landed
- preserve the removal of duplicate Live Room handoff chrome from the utility sheet
- keep the lower-dock comment/reaction cluster and hybrid community grid later unless a future broader audit intentionally reopens them
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
- `app/watch-party/live-stage/[partyId].tsx` stays materially cleaner without changing actual stage semantics
- the actual Live Stage surface keeps its new route-local top chrome/menu and utility-sheet boundaries
- duplicate Live Room handoff and memo-like stage-control framing stay reduced
- watch-party entry, Party Room, and pre-stage Live Room cleanups stay intact
- the closeout audit honestly decides whether the next remaining seam is later and broader
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
