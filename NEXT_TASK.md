# NEXT TASK

## Exact Next Task
Run the `broader player chapter closeout audit` and decide whether this pass should stop here with a clean next-step handoff. Do not force the riskier live/comment/participant extractions unless new proof says they are equally safe right now.

## Current Plan
1. Treat the behavior/social consistency lane as closed and carry its truthful social baseline forward unchanged.
2. Keep the broader player chapter active on `app/player/[id].tsx`.
3. Preserve the new standalone-only top-chrome extraction in `app/player/[id].tsx`.
4. Re-audit whether the next player seam is still safe enough for this pass or whether it should stop here.
5. Preserve current room/live semantics, rights-aware share gating, friendship boundaries, and comment truth while restructuring the player.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- verify the new standalone-only top-chrome grouping still keeps route truth and behavior intact
- decide whether the next seam is now `live-mode comment/filter/react cluster` or `participant/host tool shell`, and whether either is still safe in this pass
- stop cleanly if those remaining seams are still too entangled with room sync or live-stage behavior
- keep self-view, official view, pending/request states, public friend counts, public friend lists, and universal comments later
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/player/[id].tsx` as the canonical standalone player owner while auditing its broader mixed-mode structure
- preserve `/profile/[userId].tsx` as the comparison candidate only for chapter selection, not automatic implementation
- preserve `/title/[id]`, `/watch-party/index.tsx`, and `/watch-party/[partyId].tsx` as linked owners whose truth must not drift while player work is underway
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the current social baseline settled while the broader player chapter is audited
- preserve inbox scan clarity, profile friendship boundaries, room/live comment truth, and rights-aware share gating during player work
- keep any further work inside clearly safe player-owned substructures only
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- reopen the profile chapter first without stronger structural proof than the player
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the next broader chapter is explicitly proven rather than guessed
- `app/player/[id].tsx` is chosen only if its structural seam is clearly more urgent than `app/profile/[userId].tsx`
- the first player architecture batch is narrow enough to land safely without route drift or schema drift
- standalone-only player chrome is grouped more cleanly without changing room/live behavior
- the pass stops cleanly if the next remaining player seams are still more risky than this checkpoint
- rights-aware share gating, room/live comment truth, and current social boundaries remain intact during player work
- the public profile chapter stays closed unless the player audit fails to justify safe progress
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
