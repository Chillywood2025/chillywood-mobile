# NEXT TASK

## Exact Next Task
The next exact lane is now a medium `public profile private friendship boundary audit` on `app/profile/[userId].tsx`. Repo truth is now explicit: the inbox friendship hint lane is closed, and the next social relationship seam is the public-first profile/channel surface rather than more inbox chrome.

## Current Plan
1. Treat the whole-app re-entry lane and the inbox friendship hint lane as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Re-open friendship adoption only on the public profile/channel route, not in the inbox, and only through a doctrine-sensitive boundary audit.
4. Keep pending/request states in `/chat/[threadId]` rather than pushing them into `/chat/index`.
5. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
6. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit whether `/profile/[userId]` should reflect any private friendship truth at all while staying public-first
- preserve the truthful title, player, watch-party, chat-thread, and inbox adoptions without widening them into fake broad social rollout
- keep pending/request states, public friend counts, and universal comments later
- avoid public friend chrome, fake friend counts, fake inbox clutter, fake engagement metrics, and universal comments
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the next pass route-owned and public-first
- preserve inbox scan clarity by treating `/chat/index` as already settled for now
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/profile/[userId]` is audited against the landed private friendship truth without turning the public route into a friendship dashboard
- `/chat/index.tsx` keeps its tiny accepted-friend hint without implying that inbox presence equals friendship
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout
- profile friendship remains later unless a future lane opens it intentionally
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
