# NEXT TASK

## Exact Next Task
The next exact stage is now the `whole-app behavior closeout audit`. Repo truth is explicit: the three ranked fix batches landed cleanly, and the next decision is whether any truly narrow final polish remains or whether this lane should close.

## Current Plan
1. Treat the public profile private friendship boundary lane plus the three ranked behavior batches as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Preserve the new rights-aware title/player share behavior without widening it into broader content-action changes.
4. Preserve the waiting-room preview flow while keeping real join/access failures visible.
5. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
6. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
7. Preserve the new inbox error visibility without turning `/chat/index.tsx` into a warning-heavy dashboard.
8. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- run the whole-app behavior closeout audit and decide whether one final trivial or narrow polish slice is honestly justified
- keep the current truthful title/player, waiting-room, and inbox behavior fixes as landed
- preserve the shipped title, player, watch-party, chat-thread, inbox, and profile social adoptions without widening them into fake broad social rollout
- keep self-view, official view, pending/request states, public friend counts, public friend lists, and universal comments later
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the current social baseline settled while verifying real behavior across the existing canonical routes
- preserve inbox scan clarity while keeping the new error visibility on `/chat/index`
- treat the profile friendship treatment as already landed and closed for now
- keep any remaining work narrower than a new route chapter
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/profile/[userId]` reflects active friendship only as a tiny private hint without turning the public route into a friendship dashboard
- `/chat/index.tsx` keeps its tiny accepted-friend hint without implying that inbox presence equals friendship
- `/chat/index.tsx` keeps real load or official-thread failures visible even when existing threads are still on screen
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior or exposing blocked share actions
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/watch-party/index.tsx` keeps preview-state join/access failures visible instead of hiding them behind the room preview card
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout or disallowed share behavior
- the public profile private friendship boundary lane stays closed cleanly with no fake counts, no public friend list, and no request workflow leakage
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
