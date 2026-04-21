# NEXT TASK

## Exact Next Task
Run the `behavior/social consistency closeout audit` and only continue if one final trivial or narrow pass is still honestly justified after the inbox retry fix and the explicit room-comment wording pass.

## Current Plan
1. Preserve the already-landed truthful social baseline on profile, chat thread, title, player, and watch-party owners.
2. Keep the newly aligned inbox retry card on `/chat/index.tsx` scan-first and action-correct.
3. Keep the new title/player `Room Comments` wording tied to current room/live truth without widening it into a broader comment rollout.
4. Re-audit the touched routes and only continue if one final trivial or narrow consistency pass is still honestly justified.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- verify the inbox retry alignment still stays scan-first on `/chat/index.tsx`
- verify `app/title/[id].tsx` and `app/player/[id].tsx` now keep comment truth explicitly room/live-only
- decide whether any final narrow pass is still warranted or whether the lane should close cleanly
- keep self-view, official view, pending/request states, public friend counts, public friend lists, and universal comments later
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/chat/index.tsx`, and `/chat/[threadId]` as the canonical social owners
- preserve `/title/[id]`, `/player/[id]`, `/watch-party/index.tsx`, and `/watch-party/[partyId].tsx` as the canonical title/player/watch-party owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the current social baseline settled while this lane only resolves the remaining narrow consistency seams
- preserve inbox scan clarity while keeping the current error card behavior on `/chat/index`
- treat the profile friendship treatment as already landed and closed for now
- keep comment truth explicitly tied to current room/live surfaces on title/player wording
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/chat/index.tsx` keeps its tiny accepted-friend hint without implying inbox presence equals friendship
- `/chat/index.tsx` keeps real load and official-thread failures visible even when existing threads are already on screen
- `/chat/index.tsx` retries the right failing action instead of always refreshing the inbox
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior or exposing blocked share actions
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/watch-party/index.tsx` keeps preview-state join/access failures visible instead of hiding them behind the room preview card
- `/title/[id]` and `/player/[id]` keep comment wording explicitly tied to current room/live truth instead of implying a broader comment rollout
- the public profile private friendship boundary lane stays closed cleanly with no fake counts, no public friend list, and no request workflow leakage
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
