# NEXT TASK

## Exact Next Task
There is no immediate narrow follow-up on `/profile/[userId]` now. Repo truth is explicit: the public profile private friendship boundary lane is closed cleanly, and any future friendship work on that route would be a broader doctrine-sensitive chapter rather than another safe narrow pass.

## Current Plan
1. Treat the whole-app re-entry lane, inbox friendship hint lane, and public profile private friendship boundary lane as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Leave `/profile/[userId]` public-first and creator-led with only the shipped tiny private `Friends` hint for already-active friendship.
4. Keep self-view, official Rachi view, pending/request states, public friend lists, and public friend counts out of the profile route unless a future broader chapter explicitly reopens them.
5. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
6. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not reopen `/profile/[userId]` for another narrow friendship tweak now that the boundary lane is closed
- preserve the shipped title, player, watch-party, chat-thread, inbox, and profile social adoptions without widening them into fake broad social rollout
- keep self-view, official view, pending/request states, public friend counts, public friend lists, and universal comments later
- avoid public friend chrome, fake friend counts, fake inbox clutter, fake engagement metrics, and universal comments
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the current social baseline settled unless a future broader roadmap chapter intentionally reopens a route owner
- preserve inbox scan clarity by treating `/chat/index` as already settled for now
- treat the profile friendship treatment as already landed and closed for now
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
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout
- the public profile private friendship boundary lane stays closed cleanly with no fake counts, no public friend list, and no request workflow leakage
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
