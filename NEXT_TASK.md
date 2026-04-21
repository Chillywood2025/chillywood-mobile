# NEXT TASK

## Exact Next Task
The next exact stage is now `behavior / polish batch 3` on `app/chat/index.tsx`. Repo truth is explicit: the waiting-room preview-state error fix landed cleanly, and the next highest-leverage remaining seam in this lane is inbox error visibility.

## Current Plan
1. Treat the public profile private friendship boundary lane, the first title/player behavior batch, and the waiting-room error-visibility batch as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Preserve the new rights-aware title/player share behavior without widening it into broader content-action changes.
4. Preserve the waiting-room preview flow while keeping real join/access failures visible.
5. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
6. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
7. Fix the next real behavior mismatch now: inbox load or official-thread failures must stay visible even when the inbox is not empty.
8. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- keep the current truthful title/player and waiting-room behavior fixes as landed in batches 1 and 2
- make `app/chat/index.tsx` show real inbox load or official-thread failures even when the list already has threads
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
- preserve inbox scan clarity while improving error visibility on `/chat/index`
- treat the profile friendship treatment as already landed and closed for now
- keep the third fix batch inside the inbox owner only
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
