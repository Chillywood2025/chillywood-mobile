# NEXT TASK

## Exact Next Task
Run the broader `player architecture rewrite audit` on `app/player/[id].tsx`. The player wins the next chapter selection over the public profile because it still carries the repo's heaviest mixed-mode ownership seam.

## Current Plan
1. Treat the behavior/social consistency lane as closed and carry its truthful social baseline forward unchanged.
2. Open the broader player-owned chapter on `app/player/[id].tsx`.
3. Prove which responsibilities still belong inside the player and which mixed-mode clusters now need local architectural separation.
4. Keep `/profile/[userId].tsx` out of first implementation unless the player audit fails to justify safe progress.
5. Preserve current room/live semantics, rights-aware share gating, friendship boundaries, and comment truth while auditing the player.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit `app/player/[id].tsx` as the next broader route-owned chapter
- compare its owner overload, duplicated mode ownership, and live/social overlap against the public profile's remaining broader seams
- choose the smallest first safe architecture batch inside the player without rewriting route truth
- keep the public profile chapter later unless new audit proof beats the player
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
- rights-aware share gating, room/live comment truth, and current social boundaries remain intact during player work
- the public profile chapter stays closed unless the player audit fails to justify safe progress
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
