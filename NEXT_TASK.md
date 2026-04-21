# NEXT TASK

## Exact Next Task
Run `broader player batch 1` on `app/player/[id].tsx`: extract the standalone-only overlay chrome out of the mixed player render body without changing route truth, room/live behavior, or rights-aware content logic.

## Current Plan
1. Treat the behavior/social consistency lane as closed and carry its truthful social baseline forward unchanged.
2. Keep the broader player chapter active on `app/player/[id].tsx`.
3. Land the safest first architecture batch by separating standalone-only overlay chrome from the mixed player render body.
4. Keep live-room comments/filter/react chrome and participant/host tool shells for later batches unless the first extraction proves broader safety.
5. Preserve current room/live semantics, rights-aware share gating, friendship boundaries, and comment truth while restructuring the player.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- extract the standalone-only overlay chrome from `app/player/[id].tsx` into a local substructure or component
- keep standalone utility controls, standalone engagement chips, and standalone speed-menu ownership grouped together instead of interleaving them with party/live branches
- do not move room sync, live-seat logic, or route handoffs in the first batch
- keep the later live-mode comment/filter/react cluster and participant/host tool shell for later passes unless new proof makes them equally safe
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
- keep the first batch inside standalone-only player chrome rather than room sync or live-stage behavior
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
- rights-aware share gating, room/live comment truth, and current social boundaries remain intact during player work
- the public profile chapter stays closed unless the player audit fails to justify safe progress
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
